// The Comptroller's sales-tax permit holders for the county (lib/outlets.ts),
// read weekly: who runs the business at each address. Outreach's tenant list
// reads them after the city's certificates of occupancy and permits, for the
// businesses neither names.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import { nowIso } from "./lib/access";
import { COMPTROLLER_OUTLETS, outletsQuery, rowsToOutlets } from "./lib/outlets";
import { addressKey } from "./lib/parcels";

const outletRow = v.object({
  taxpayerNumber: v.string(),
  outletNumber: v.string(),
  name: v.string(),
  address: v.string(),
  city: v.string(),
  zip: v.optional(v.string()),
  naics: v.optional(v.string()),
  at: v.optional(v.string()),
  taxpayer: v.optional(v.string()),
  mailing: v.optional(v.object({ address: v.optional(v.string()), city: v.optional(v.string()), state: v.optional(v.string()), zip: v.optional(v.string()) })),
});

const same = (a: Record<string, unknown>, b: Record<string, unknown>, keys: string[]) => keys.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
const KEYS = ["name", "address", "city", "zip", "naics", "at", "taxpayer", "mailing"];

/** Adds new outlets and updates changed ones, by taxpayer and outlet number; every row read is marked seen at `seenAt`. */
export const upsert = internalMutation({
  args: { rows: v.array(outletRow), seenAt: v.string() },
  handler: async (ctx, { rows, seenAt }) => {
    let added = 0;
    let updated = 0;
    const now = nowIso();
    for (const row of rows) {
      const existing = await ctx.db
        .query("outlets")
        .withIndex("by_outlet", (q) => q.eq("taxpayerNumber", row.taxpayerNumber).eq("outletNumber", row.outletNumber))
        .unique();
      const keyed = { ...row, addressKey: addressKey(row.address) };
      if (!existing) {
        await ctx.db.insert("outlets", { county: COMPTROLLER_OUTLETS.county, ...keyed, importedAt: now, seenAt });
        added++;
      } else if (!same(existing, row, KEYS)) {
        await ctx.db.patch(existing._id, { ...keyed, importedAt: now, seenAt });
        updated++;
      } else await ctx.db.patch(existing._id, { seenAt });
    }
    return { added, updated };
  },
});

/** Drops outlets the read stamped `seenAt` didn't see: the permit was closed. Pages itself. */
export const dropUnseen = internalMutation({
  args: { seenAt: v.string() },
  handler: async (ctx, { seenAt }) => {
    const gone = await ctx.db
      .query("outlets")
      .withIndex("by_county_and_seen", (q) => q.eq("county", COMPTROLLER_OUTLETS.county).lt("seenAt", seenAt))
      .take(500);
    for (const o of gone) await ctx.db.delete(o._id);
    if (gone.length === 500) await ctx.scheduler.runAfter(0, internal.outlets.dropUnseen, { seenAt });
    return gone.length;
  },
});

async function pull(ctx: ActionCtx) {
  const seenAt = nowIso();
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let error: string | undefined;
  try {
    for (let offset = 0; ; offset += COMPTROLLER_OUTLETS.page) {
      const response = await fetch(outletsQuery(COMPTROLLER_OUTLETS.city, offset, COMPTROLLER_OUTLETS.page), { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Comptroller outlets: HTTP ${response.status}`);
      const body = (await response.json()) as Array<Record<string, unknown>> | { error?: boolean; message?: string };
      if (!Array.isArray(body)) throw new Error(`Comptroller outlets: ${(body as { message?: string }).message ?? "the service returned an error"}`);
      fetched += body.length;
      const rows = rowsToOutlets(body);
      for (let i = 0; i < rows.length; i += 200) {
        const result: { added: number; updated: number } = await ctx.runMutation(internal.outlets.upsert, { rows: rows.slice(i, i + 200), seenAt });
        added += result.added;
        updated += result.updated;
      }
      if (body.length < COMPTROLLER_OUTLETS.page) break;
    }
    // Only a complete read may drop what it didn't see.
    await ctx.runMutation(internal.outlets.dropUnseen, { seenAt });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, { source: COMPTROLLER_OUTLETS.source, fetched, added, updated, error });
  return { fetched, added, updated, error };
}

/** Weekly (crons.ts), before the owners rebuild reads it. */
export const syncMidland = internalAction({
  args: {},
  handler: async (ctx) => await pull(ctx),
});

/** For staff: `npx convex run outlets:syncNow`. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await pull(ctx);
  },
});
