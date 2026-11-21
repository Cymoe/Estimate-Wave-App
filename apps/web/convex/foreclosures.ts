// Midland's monthly courthouse foreclosure auction, kept by hand: staff
// paste the homes posted for a sale (from the county clerk's public search,
// which doesn't allow automated reading), then record what happened and who
// bought. Rules for the dates: lib/foreclosures.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { isAuctionDay, nextAuction, parseAddresses, recentAuctions } from "./lib/foreclosures";
import { normalizePhone } from "./lib/intake";
import { MIDLAND_PARCELS, addressKey, ownerName } from "./lib/parcels";

const kind = v.union(v.literal("mortgage"), v.literal("tax"));
const status = v.union(v.literal("posted"), v.literal("sold"), v.literal("back_to_lender"), v.literal("cancelled"));

/** Adds the homes posted for one sale, one address a line. Ones already on that sale are skipped. */
export const addMany = mutation({
  args: { saleDate: v.string(), kind, addresses: v.string() },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    if (!isAuctionDay(args.saleDate)) fail("INVALID", "That isn't an auction day: sales are the first Tuesday of the month");
    const lines = parseAddresses(args.addresses);
    if (lines.length === 0) fail("INVALID", "Paste at least one address");
    if (lines.length > 200) fail("INVALID", "Add at most 200 at a time");
    const existing = new Set(
      (
        await ctx.db
          .query("foreclosures")
          .withIndex("by_county_and_sale", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("saleDate", args.saleDate))
          .collect()
      ).map((f) => f.addressKey),
    );
    const now = nowIso();
    let added = 0;
    let skipped = 0;
    const unmatched: string[] = [];
    const homes: Id<"parcels">[] = [];
    for (const address of lines) {
      const key = addressKey(address);
      if (!key || existing.has(key)) {
        skipped++;
        continue;
      }
      existing.add(key);
      const parcel = await ctx.db
        .query("parcels")
        .withIndex("by_county_and_address_key", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("addressKey", key))
        .first();
      if (!parcel) unmatched.push(address);
      else homes.push(parcel._id);
      await ctx.db.insert("foreclosures", {
        county: MIDLAND_PARCELS.county,
        saleDate: args.saleDate,
        kind: args.kind,
        address: address.slice(0, 200),
        addressKey: key,
        parcelId: parcel?._id,
        status: "posted",
        addedBy: user._id,
        addedAt: now,
        updatedAt: now,
      });
      added++;
    }
    // Posted homes go on the Pre-foreclosure list.
    if (homes.length) await ctx.scheduler.runAfter(0, internal.signals.recomputeParcels, { ids: homes });
    return { added, skipped, unmatched };
  },
});

/** What happened at the sale. A buyer is only kept on a home that sold. */
export const update = mutation({
  args: {
    id: v.id("foreclosures"),
    status: v.optional(status),
    buyer: v.optional(
      v.object({ name: v.string(), company: v.boolean(), phone: v.optional(v.string()), email: v.optional(v.string()) }),
    ),
    salePriceCents: v.optional(v.number()),
    instrument: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...args }) => {
    await requireStaff(ctx);
    const row = await ctx.db.get(id);
    if (!row) fail("NOT_FOUND", "That home isn't on the list");
    const next = args.status ?? row.status;
    let buyer = args.buyer ?? row.buyer;
    if (buyer) {
      const name = buyer.name.trim();
      const phone = buyer.phone?.trim() ? normalizePhone(buyer.phone) : undefined;
      if (buyer.phone?.trim() && !phone) fail("INVALID", "Enter the buyer's 10-digit phone number");
      buyer = name ? { name: name.slice(0, 120), company: buyer.company, phone, email: buyer.email?.trim() || undefined } : undefined;
    }
    if (args.salePriceCents !== undefined && (!Number.isInteger(args.salePriceCents) || args.salePriceCents < 0))
      fail("INVALID", "Enter the price in dollars");
    await ctx.db.patch(id, {
      status: next,
      buyer: next === "sold" ? buyer : undefined,
      salePriceCents: next === "sold" ? (args.salePriceCents ?? row.salePriceCents) : undefined,
      instrument: args.instrument !== undefined ? args.instrument.trim() || undefined : row.instrument,
      note: args.note !== undefined ? args.note.trim().slice(0, 300) || undefined : row.note,
      updatedAt: nowIso(),
    });
    if (row.parcelId) await ctx.scheduler.runAfter(0, internal.signals.recomputeParcels, { ids: [row.parcelId] });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("foreclosures") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const row = await ctx.db.get(id);
    if (!row) return null;
    await ctx.db.delete(id);
    if (row.parcelId) await ctx.scheduler.runAfter(0, internal.signals.recomputeParcels, { ids: [row.parcelId] });
    return null;
  },
});

/** One sale's homes (the next one by default), with the owner on the roll and its value, and the sale days to pick from. */
export const sale = query({
  args: { saleDate: v.optional(v.string()) },
  handler: async (ctx, { saleDate }) => {
    await requireStaff(ctx);
    const date = saleDate ?? nextAuction();
    const rows = await ctx.db
      .query("foreclosures")
      .withIndex("by_county_and_sale", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("saleDate", date))
      .collect();
    const homes = [];
    for (const f of rows.sort((a, b) => a.address.localeCompare(b.address))) {
      const parcel = f.parcelId ? await ctx.db.get(f.parcelId) : null;
      homes.push({
        id: f._id,
        address: f.address,
        kind: f.kind,
        status: f.status,
        instrument: f.instrument,
        buyer: f.buyer,
        salePriceCents: f.salePriceCents,
        note: f.note,
        matched: Boolean(parcel),
        ownerOnRoll: parcel ? ownerName(parcel.owner) : undefined,
        marketValueCents: parcel?.marketValueCents,
      });
    }
    return { saleDate: date, saleDates: recentAuctions(), homes };
  },
});
