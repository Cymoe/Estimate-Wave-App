import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { nowIso, requireMember, requireUser } from "./lib/access";

/** Shape the UI expects: `id` is the slug, which cost codes use as industry_id. */
function toIndustry(row: Doc<"industries">) {
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    display_order: row.display_order,
    is_active: row.is_active,
  };
}

async function activeIndustries(ctx: QueryCtx) {
  const rows = await ctx.db.query("industries").take(500);
  return rows
    .filter((row) => row.is_active)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
}

/** Every active trade. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return (await activeIndustries(ctx)).map(toIndustry);
  },
});

/**
 * A company's trades: the ones it works in and buys leads for. One list,
 * `organizations.leadTrades`, read by bids, the Marketplace, the Vault, the
 * wallet and the Price Book alike. (It used to be split from a separate
 * Price Book list in `organizationIndustries`; mergeChosenTrades folds that in.)
 */
export const forOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { organization } = await requireMember(ctx, organizationId);
    const slugs = new Set(organization.leadTrades ?? []);
    return (await activeIndustries(ctx)).filter((row) => slugs.has(row.slug)).map(toIndustry);
  },
});

/** Keeps only trades that exist and are active, without repeats, in the order given. */
export async function knownTrades(ctx: QueryCtx, slugs: string[]): Promise<string[]> {
  const known = new Set((await activeIndustries(ctx)).map((row) => row.slug));
  const clean = slugs.map((s) => s.trim()).filter(Boolean);
  // Before the trade catalog is loaded there's nothing to check against: keep what was given.
  return [...new Set(known.size ? clean.filter((s) => known.has(s)) : clean)];
}

/** Replaces the company's trades. Owners and admins of the company. */
export const setForOrganization = mutation({
  args: { organizationId: v.id("organizations"), industryIds: v.array(v.string()) },
  handler: async (ctx, { organizationId, industryIds }) => {
    await requireMember(ctx, organizationId, "admin");
    await ctx.db.patch(organizationId, { leadTrades: await knownTrades(ctx, industryIds), updatedAt: nowIso() });
    return null;
  },
});

/**
 * One-time fold of the old Price Book trade picks (organizationIndustries)
 * into each company's trades. Safe to run again: with no rows left it does
 * nothing. The deploy runs it.
 */
export const mergeChosenTrades = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("organizationIndustries").take(5000);
    const byOrg = new Map<string, { id: Id<"organizations">; slugs: string[] }>();
    for (const row of rows) {
      const entry = byOrg.get(row.organizationId) ?? { id: row.organizationId, slugs: [] };
      entry.slugs.push(row.industrySlug);
      byOrg.set(row.organizationId, entry);
    }
    let companies = 0;
    for (const { id, slugs } of byOrg.values()) {
      const org = await ctx.db.get(id);
      if (org) {
        const merged = await knownTrades(ctx, [...(org.leadTrades ?? []), ...slugs]);
        await ctx.db.patch(id, { leadTrades: merged, updatedAt: nowIso() });
        companies++;
      }
    }
    for (const row of rows) await ctx.db.delete(row._id);
    return { companies, rows: rows.length };
  },
});
