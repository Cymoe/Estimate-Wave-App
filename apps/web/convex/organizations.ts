import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, isSuperAdmin, nowIso, organizationIdsFor, pick, requireMember, requireUser } from "./lib/access";
import { createOrganizationWithOwner, uniqueSlug } from "./lib/organizations";
import { organizationFields } from "./schema";

/** Organizations the signed-in user belongs to (all of them for super admins). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (isSuperAdmin(user)) {
      return await ctx.db.query("organizations").order("desc").take(500);
    }
    const ids = await organizationIdsFor(ctx, user._id);
    const orgs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return orgs
      .filter((org): org is Doc<"organizations"> => org !== null && org.isActive)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

export const get = query({
  args: { id: v.id("organizations") },
  handler: async (ctx, { id }) => {
    const { organization } = await requireMember(ctx, id);
    return organization;
  },
});

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const user = await requireUser(ctx);
    const fields = pick(data, organizationFields);
    if (typeof fields.name !== "string" || fields.name.trim() === "") {
      fail("INVALID", "Organization name is required");
    }
    const id = await createOrganizationWithOwner(ctx, user._id, fields as { name: string });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("organizations"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await requireMember(ctx, id, "admin");
    const patch = pick(data, organizationFields, { forPatch: true });
    if (patch.slug !== undefined) {
      const existing = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", patch.slug))
        .first();
      if (existing !== null && existing._id !== id) patch.slug = await uniqueSlug(ctx, patch.slug);
    }
    await ctx.db.patch(id, { ...patch, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

/**
 * Deactivates the organization (owner only). Its data is kept so it can be
 * restored; it just stops appearing for its members.
 */
export const remove = mutation({
  args: { id: v.id("organizations") },
  handler: async (ctx, { id }) => {
    await requireMember(ctx, id, "owner");
    await ctx.db.patch(id, { isActive: false, updatedAt: nowIso() });
    return { message: "Organization deleted successfully" };
  },
});
