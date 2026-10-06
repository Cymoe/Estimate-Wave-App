import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { assertLinksInOrg } from "./lib/documents";
import { projectFields, projectStatus } from "./schema";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
    status: v.optional(projectStatus),
  },
  handler: async (ctx, { organizationId, clientId, status }) => {
    await requireMember(ctx, organizationId);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(2000);
    return projects.filter(
      (p) => (clientId === undefined || p.clientId === clientId) && (status === undefined || p.status === status),
    );
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => (await getOwned(ctx, "projects", id)).doc,
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = pick(data, projectFields);
    if (typeof fields.name !== "string" || fields.name.trim() === "") fail("INVALID", "Project name is required");
    await assertLinksInOrg(ctx, organizationId, { clientId: fields.clientId });
    const now = nowIso();
    const id = await ctx.db.insert("projects", {
      status: "planning",
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
      resourceType: "project",
      resourceId: id,
      details: { name: fields.name },
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("projects"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const { doc } = await getOwned(ctx, "projects", id);
    const patch = pick(data, projectFields, { forPatch: true });
    await assertLinksInOrg(ctx, doc.organizationId, { clientId: patch.clientId });
    await ctx.db.patch(id, { ...patch, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "projects", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "project",
      resourceId: id,
      details: { name: doc.name },
    });
    return { message: "Project deleted successfully" };
  },
});
