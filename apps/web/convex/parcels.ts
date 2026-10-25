// Midland's homes and who owns them, from the appraisal roll the city
// publishes (lib/parcels.ts). Read in full once a week: the roll changes a
// few times a year, so most weeks nothing is written. Callers use it to know
// whose door they're calling; it never reaches member companies.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import { nowIso } from "./lib/access";
import { MIDLAND_PARCELS, PARCEL_FIELDS, PARCEL_VERSION, RESIDENTIAL_USE, rowsToParcels } from "./lib/parcels";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const parcelRow = v.object({
  cadId: v.string(),
  pin: v.optional(v.string()),
  useCode: v.string(),
  siteAddress: v.string(),
  addressKey: v.string(),
  street: v.optional(v.string()),
  owner: v.string(),
  owner2: v.optional(v.string()),
  mailing: v.object({
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
  }),
  ownerOccupied: v.boolean(),
  companyOwned: v.boolean(),
  marketValueCents: v.optional(v.number()),
  buildingValueCents: v.optional(v.number()),
  deedDate: v.optional(v.string()),
});

const KEYS = [
  "pin", "useCode", "siteAddress", "addressKey", "street", "owner", "owner2", "ownerOccupied",
  "companyOwned", "marketValueCents", "buildingValueCents", "deedDate",
] as const;
const sameParcel = (a: Doc<"parcels">, b: Record<string, unknown> & { mailing: Doc<"parcels">["mailing"] }) =>
  KEYS.every((k) => (a[k] ?? undefined) === (b[k] ?? undefined)) &&
  (["address", "city", "state", "zip"] as const).every((k) => (a.mailing[k] ?? undefined) === (b.mailing[k] ?? undefined));

/** Adds new parcels and updates changed ones, by appraisal id. Safe to run again. */
export const upsert = internalMutation({
  args: { rows: v.array(parcelRow) },
  handler: async (ctx, { rows }) => {
    let added = 0;
    let updated = 0;
    const now = nowIso();
    for (const row of rows) {
      const existing = await ctx.db
        .query("parcels")
        .withIndex("by_cad_id", (q) => q.eq("cadId", row.cadId))
        .first();
      if (!existing) {
        await ctx.db.insert("parcels", { county: MIDLAND_PARCELS.county, ...row, importedAt: now });
        added++;
      } else if (!sameParcel(existing, row)) {
        await ctx.db.patch(existing._id, { ...row, importedAt: now });
        updated++;
      }
    }
    return { added, updated };
  },
});

/**
 * Reads every residential parcel, 2,000 at a time, and records how it went
 * on the permit feed's status table (source "midland-parcels"): fetched is
 * the homes on the roll, lastAppliedAt the newest deed on it.
 */
async function pullMidlandParcels(ctx: ActionCtx) {
  let offset = 0;
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let newestDeed: string | undefined;
  let error: string | undefined;
  try {
    for (;;) {
      const params = new URLSearchParams({
        where: `GOV_USE_CO IN (${RESIDENTIAL_USE.map((c) => `'${c}'`).join(",")})`,
        outFields: PARCEL_FIELDS.join(","),
        orderByFields: "OBJECTID ASC",
        resultOffset: String(offset),
        resultRecordCount: "2000",
        returnGeometry: "false",
        f: "json",
      });
      const response = await fetch(`${MIDLAND_PARCELS.layer}/query?${params}`);
      if (!response.ok) throw new Error(`Midland owners: HTTP ${response.status}`);
      const body = (await response.json()) as {
        error?: { message?: string };
        features?: Parameters<typeof rowsToParcels>[0];
        exceededTransferLimit?: boolean;
      };
      if (body.error) throw new Error(`Midland owners: ${body.error.message ?? "the service returned an error"}`);
      const features = body.features ?? [];
      const rows = rowsToParcels(features);
      fetched += rows.length;
      for (let i = 0; i < rows.length; i += 400) {
        const result: { added: number; updated: number } = await ctx.runMutation(internal.parcels.upsert, {
          rows: rows.slice(i, i + 400),
        });
        added += result.added;
        updated += result.updated;
      }
      for (const row of rows) if (row.deedDate && (!newestDeed || row.deedDate > newestDeed)) newestDeed = row.deedDate;
      if (!body.exceededTransferLimit || features.length === 0) break;
      offset += features.length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, {
    source: MIDLAND_PARCELS.source,
    fetched,
    added,
    updated,
    lastAppliedAt: newestDeed,
    error,
    fieldsVersion: error ? undefined : PARCEL_VERSION,
  });
  return { fetched, added, updated, error };
}

/**
 * The weekly refresh. The deploy runs it with ifStale, which skips it when a
 * clean pass of this PARCEL_VERSION ran in the last week: `npx convex run parcels:syncMidland '{"ifStale":true}'`.
 */
export const syncMidland = internalAction({
  args: { ifStale: v.optional(v.boolean()) },
  handler: async (ctx, { ifStale }) => {
    if (ifStale) {
      const last = await ctx.runQuery(internal.permits.sourceState, { source: MIDLAND_PARCELS.source });
      const fresh = last && !last.error && last.fieldsVersion === PARCEL_VERSION && Date.now() - Date.parse(last.syncedAt) < WEEK_MS;
      if (fresh) return { skipped: true };
    }
    return await pullMidlandParcels(ctx);
  },
});

/** "Sync owners" on the Ops permits card. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await pullMidlandParcels(ctx);
  },
});
