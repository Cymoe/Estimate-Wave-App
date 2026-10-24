import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { nowIso, requireMember } from "./lib/access";
import { SEARCH_AREA, cityFromSearch, cityFromText } from "./lib/leadCity";

// OpenStreetMap's free search allows one request a second.
const LOOKUP_SPACING_MS = 1100;

/**
 * Works out a lead's city: straight away when the address says it, otherwise
 * by a map lookup a moment later (`delayMs` spaces lookups out). Leads with no
 * address are just marked checked.
 */
export async function findCity(ctx: MutationCtx, lead: Doc<"leads">, delayMs = 0): Promise<"set" | "queued" | "none"> {
  const now = nowIso();
  const city = cityFromText(lead.address);
  if (city) {
    await ctx.db.patch(lead._id, { city, cityCheckedAt: now });
    return "set";
  }
  await ctx.db.patch(lead._id, { cityCheckedAt: now });
  if (!lead.address?.trim()) return "none";
  await ctx.scheduler.runAfter(delayMs, internal.leadCity.lookup, { id: lead._id });
  return "queued";
}

/** Fills in the city for leads that haven't been checked yet. Safe to call on every visit. */
export const fillMissing = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(2000);
    const counts = { set: 0, queued: 0, none: 0 };
    for (const lead of leads) {
      if (lead.city || lead.cityCheckedAt) continue;
      counts[await findCity(ctx, lead, counts.queued * LOOKUP_SPACING_MS)] += 1;
    }
    return counts;
  },
});

export const get = internalQuery({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const setCity = internalMutation({
  args: { id: v.id("leads"), address: v.string(), city: v.string() },
  handler: async (ctx, { id, address, city }) => {
    const lead = await ctx.db.get(id);
    // Skip if the lead is gone, the address changed meanwhile, or someone picked a city.
    if (!lead || lead.address !== address || lead.city) return;
    await ctx.db.patch(id, { city });
  },
});

/** Looks the street up on OpenStreetMap, inside the Midland–Odessa area. */
export const lookup = internalAction({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }: { id: Id<"leads"> }) => {
    const lead = await ctx.runQuery(internal.leadCity.get, { id });
    const address = lead?.address?.trim();
    if (!lead || !address || lead.city) return;
    const params = new URLSearchParams({
      q: address,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "us",
      viewbox: `${SEARCH_AREA.west},${SEARCH_AREA.north},${SEARCH_AREA.east},${SEARCH_AREA.south}`,
      bounded: "1",
      limit: "5",
    });
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": "FieldQuote lead city lookup" },
      });
      if (!response.ok) return;
      const city = cityFromSearch(await response.json());
      if (city) await ctx.runMutation(internal.leadCity.setCity, { id, address: lead.address!, city });
    } catch {
      // Left without a city; it can be picked by hand.
    }
  },
});
