import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
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

/** Trades the organization has chosen. */
export const forOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const chosen = await ctx.db
      .query("organizationIndustries")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(500);
    const slugs = new Set(chosen.map((row) => row.industrySlug));
    return (await activeIndustries(ctx)).filter((row) => slugs.has(row.slug)).map(toIndustry);
  },
});

/** Replaces the organization's trades. Owners and admins only. */
export const setForOrganization = mutation({
  args: { organizationId: v.id("organizations"), industryIds: v.array(v.string()) },
  handler: async (ctx, { organizationId, industryIds }) => {
    await requireMember(ctx, organizationId, "admin");
    const known = new Set((await activeIndustries(ctx)).map((row) => row.slug));
    const wanted = new Set(industryIds.filter((slug) => known.has(slug)));

    const existing = await ctx.db
      .query("organizationIndustries")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(500);
    for (const row of existing) {
      if (wanted.has(row.industrySlug)) wanted.delete(row.industrySlug);
      else await ctx.db.delete(row._id);
    }
    const createdAt = nowIso();
    for (const industrySlug of wanted) {
      await ctx.db.insert("organizationIndustries", { organizationId, industrySlug, createdAt });
    }
    return null;
  },
});
