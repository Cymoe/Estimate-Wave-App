import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { clientFields } from "./schema";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(2000);
    return clients.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("clients") },
  handler: async (ctx, { id }) => (await getOwned(ctx, "clients", id)).doc,
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = pick(data, clientFields);
    if (typeof fields.name !== "string" || fields.name.trim() === "") fail("INVALID", "Client name is required");
    const now = nowIso();
    const id = await ctx.db.insert("clients", {
      ...(fields as { name: string }),
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "client",
      resourceId: id,
      details: { name: fields.name },
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("clients"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await getOwned(ctx, "clients", id);
    await ctx.db.patch(id, { ...pick(data, clientFields, { forPatch: true }), updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "clients", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "client",
      resourceId: id,
      details: { name: doc.name },
    });
    return { message: "Client deleted successfully" };
  },
});
