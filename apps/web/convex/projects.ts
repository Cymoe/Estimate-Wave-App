import { v } from "convex/values";
import { mutationDef } from "./lib/actor";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { assertLinksInOrg } from "./lib/documents";
import { projectFields, projectStatus } from "./schema";
import { isPlaceholderTitle, jobName } from "./lib/jobName";
import { deleteTasks } from "./tasks";
import { deletePhotos } from "./photos";

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

export const createDef = mutationDef({
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
export const create = mutation(createDef);

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
    // A project's expenses, photos and tasks go with it.
    await deletePhotos(ctx, { projectId: id });
    await deleteTasks(ctx, id);
    const expenses = await ctx.db.query("expenses").withIndex("by_project", (q) => q.eq("projectId", id)).take(2000);
    for (const expense of expenses) await ctx.db.delete(expense._id);
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

/**
 * One-time tidy-up, run by the deploy: projects started from an estimate
 * that was never named took its placeholder title ("Estimate 031934") and
 * read like estimates in the project lists. Renamed by the same rule new
 * ones follow (lib/jobName.ts). Safe to re-run: renamed ones no longer match.
 */
export const renamePlaceholderProjects = internalMutation({
  args: {},
  handler: async (ctx) => {
    let renamed = 0;
    for (const project of await ctx.db.query("projects").collect()) {
      if (!isPlaceholderTitle(project.name)) continue;
      const client = project.clientId ? await ctx.db.get(project.clientId) : null;
      const estimates = await ctx.db.query("estimates").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect();
      const named = estimates.find((e) => !isPlaceholderTitle(e.title));
      const name = jobName({
        title: named?.title,
        clientName: client?.companyName || client?.name,
        address: client ? [client.address, client.city].filter(Boolean).join(", ") : undefined,
        estimateNumber: estimates[0]?.estimateNumber,
      });
      if (name === project.name) continue;
      await ctx.db.patch(project._id, { name, updatedAt: nowIso() });
      renamed++;
    }
    return { renamed };
  },
});
