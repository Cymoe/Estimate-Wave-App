import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, requireMember } from "./lib/access";

const MAX_LIMIT = 500;

/** Newest first. Being a query, this updates live in the UI on every change. */
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    resourceType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, userId, resourceType, limit = 50 }) => {
    await requireMember(ctx, organizationId);
    const take = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
    const base =
      resourceType === undefined
        ? ctx.db.query("activityLogs").withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        : ctx.db
            .query("activityLogs")
            .withIndex("by_organization_and_resource_type", (q) =>
              q.eq("organizationId", organizationId).eq("resourceType", resourceType),
            );
    const ordered = base.order("desc");
    return userId === undefined
      ? await ordered.take(take)
      : await ordered.filter((q) => q.eq(q.field("userId"), userId)).take(take);
  },
});

export const get = query({
  args: { id: v.id("activityLogs") },
  handler: async (ctx, { id }) => (await getOwned(ctx, "activityLogs", id)).doc,
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const { action, resourceType, resourceId, details, metadata } = (data ?? {}) as Record<string, unknown>;
    if (typeof action !== "string" || typeof resourceType !== "string") {
      fail("INVALID", "action and resourceType are required");
    }
    const id = await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action,
      resourceType,
      resourceId: resourceId == null ? undefined : String(resourceId),
      details,
      metadata,
    });
    return await ctx.db.get(id);
  },
});
