import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, requireMember } from "./lib/access";

// The work on a project: tasks with their days and who's on them. Across
// projects they make the company's schedule.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TASKS = 300;

const day = (value: string | undefined | null, label: string) => {
  if (!value) return undefined;
  if (!DAY.test(value) || Number.isNaN(Date.parse(value))) fail("INVALID", `${label} must be a date`);
  return value;
};

/** Checks the dates and the crew, which must be the company's. */
async function checked(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  data: { title?: string; notes?: string; startDate?: string | null; endDate?: string | null; crewIds?: Id<"crew">[] },
) {
  const out: Partial<Doc<"projectTasks">> = {};
  if (data.title !== undefined) {
    const title = data.title.trim().slice(0, 200);
    if (!title) fail("INVALID", "Say what the task is");
    out.title = title;
  }
  if (data.notes !== undefined) out.notes = data.notes.trim().slice(0, 2000) || undefined;
  if (data.startDate !== undefined) out.startDate = day(data.startDate, "The start");
  if (data.endDate !== undefined) out.endDate = day(data.endDate, "The end");
  if (data.crewIds !== undefined) {
    const ids = [...new Set(data.crewIds)].slice(0, 20);
    for (const id of ids) {
      const person = await ctx.db.get(id);
      if (person === null || person.organizationId !== organizationId) fail("NOT_FOUND", "That crew member wasn't found");
    }
    out.crewIds = ids;
  }
  return out;
}

/** A task for a page, with its crew's names and numbers. */
async function view(ctx: QueryCtx, task: Doc<"projectTasks">, people: Map<string, Doc<"crew"> | null>) {
  const crew = [];
  for (const id of task.crewIds) {
    if (!people.has(id)) people.set(id, await ctx.db.get(id));
    const person = people.get(id);
    if (person) crew.push({ id: person._id, name: person.name, phone: person.phone, trade: person.trade, language: person.language });
  }
  return {
    id: task._id,
    projectId: task.projectId,
    title: task.title,
    notes: task.notes,
    startDate: task.startDate,
    endDate: task.endDate && task.endDate !== task.startDate ? task.endDate : undefined,
    done: Boolean(task.doneAt),
    doneAt: task.doneAt,
    crew,
    order: task.order,
  };
}

/** Open tasks first by their start (undated last), then done ones. */
const byWhen = (a: Doc<"projectTasks">, b: Doc<"projectTasks">) =>
  Number(Boolean(a.doneAt)) - Number(Boolean(b.doneAt)) ||
  (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") ||
  a.order - b.order;

export const forProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await getOwned(ctx, "projects", projectId);
    const tasks = await ctx.db.query("projectTasks").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(MAX_TASKS);
    const people = new Map<string, Doc<"crew"> | null>();
    return await Promise.all(tasks.sort(byWhen).map((t) => view(ctx, t, people)));
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    notes: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    crewIds: v.optional(v.array(v.id("crew"))),
  },
  handler: async (ctx, { projectId, ...data }) => {
    const { doc: project, user } = await getOwned(ctx, "projects", projectId);
    const existing = await ctx.db.query("projectTasks").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(MAX_TASKS);
    if (existing.length >= MAX_TASKS) fail("INVALID", `A project can have up to ${MAX_TASKS} tasks`);
    const fields = await checked(ctx, project.organizationId, { ...data, crewIds: data.crewIds ?? [] });
    if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) fail("INVALID", "The end is before the start");
    const now = nowIso();
    const id = await ctx.db.insert("projectTasks", {
      organizationId: project.organizationId,
      projectId,
      title: fields.title!,
      notes: fields.notes,
      startDate: fields.startDate,
      endDate: fields.endDate,
      crewIds: fields.crewIds ?? [],
      order: existing.reduce((max, t) => Math.max(max, t.order), 0) + 1,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, { organizationId: project.organizationId, userId: user._id, action: "task_added", resourceType: "project", resourceId: projectId, details: { title: fields.title } });
    return id;
  },
});

/** A task of the signed-in member's company. */
async function ownedTask(ctx: MutationCtx, id: Id<"projectTasks">) {
  const task = await ctx.db.get(id);
  if (task === null) fail("NOT_FOUND", "Not found");
  const { user } = await getOwned(ctx, "projects", task.projectId);
  return { task, user };
}

export const update = mutation({
  args: {
    id: v.id("projectTasks"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    startDate: v.optional(v.union(v.string(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
    crewIds: v.optional(v.array(v.id("crew"))),
    done: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, done, ...data }) => {
    const { task, user } = await ownedTask(ctx, id);
    const fields = await checked(ctx, task.organizationId, data);
    const startDate = "startDate" in fields ? fields.startDate : task.startDate;
    const endDate = "endDate" in fields ? fields.endDate : task.endDate;
    if (startDate && endDate && endDate < startDate) fail("INVALID", "The end is before the start");
    const now = nowIso();
    await ctx.db.patch(id, {
      ...fields,
      ...(done === undefined ? {} : { doneAt: done ? (task.doneAt ?? now) : undefined }),
      updatedAt: now,
    });
    if (done && !task.doneAt)
      await logActivity(ctx, { organizationId: task.organizationId, userId: user._id, action: "task_done", resourceType: "project", resourceId: task.projectId, details: { title: task.title } });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("projectTasks") },
  handler: async (ctx, { id }) => {
    await ownedTask(ctx, id);
    await ctx.db.delete(id);
    return null;
  },
});

/** Deletes a project's tasks (when the project is deleted). */
export async function deleteTasks(ctx: MutationCtx, projectId: Id<"projects">) {
  const tasks = await ctx.db.query("projectTasks").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(MAX_TASKS);
  for (const t of tasks) await ctx.db.delete(t._id);
}

/**
 * The company's schedule from one day to another: each dated task that
 * falls in it, with its project and crew, and the projects running then.
 */
export const schedule = query({
  args: { organizationId: v.id("organizations"), from: v.string(), to: v.string() },
  handler: async (ctx, { organizationId, from, to }) => {
    await requireMember(ctx, organizationId);
    if (!DAY.test(from) || !DAY.test(to) || to < from) fail("INVALID", "Pick a date range");
    // Tasks starting up to 90 days before the range can still run into it.
    const earliest = new Date(Date.parse(from) - 90 * 86_400_000).toISOString().slice(0, 10);
    const candidates = await ctx.db
      .query("projectTasks")
      .withIndex("by_organization_and_start", (q) => q.eq("organizationId", organizationId).gte("startDate", earliest).lte("startDate", to))
      .take(2000);
    const tasks = candidates.filter((t) => (t.endDate ?? t.startDate)! >= from);
    const people = new Map<string, Doc<"crew"> | null>();
    const projects = new Map<string, Doc<"projects"> | null>();
    const clients = new Map<string, string | undefined>();
    const rows = [];
    for (const t of tasks.sort(byWhen)) {
      if (!projects.has(t.projectId)) projects.set(t.projectId, await ctx.db.get(t.projectId));
      const project = projects.get(t.projectId);
      if (!project) continue;
      if (project.clientId && !clients.has(project.clientId)) {
        const client = await ctx.db.get(project.clientId);
        clients.set(project.clientId, client ? [client.address, client.city].filter(Boolean).join(", ") || undefined : undefined);
      }
      rows.push({ ...(await view(ctx, t, people)), projectName: project.name, address: project.clientId ? clients.get(project.clientId) : undefined });
    }
    const running = (await ctx.db.query("projects").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(1000))
      .filter((p) => p.startDate && p.startDate.slice(0, 10) <= to && (p.endDate ?? p.startDate).slice(0, 10) >= from && p.status !== "cancelled")
      .map((p) => ({ id: p._id, name: p.name, status: p.status, startDate: p.startDate!.slice(0, 10), endDate: p.endDate?.slice(0, 10) }));
    return { tasks: rows, projects: running };
  },
});
