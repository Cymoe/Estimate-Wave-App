import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, requireMember } from "./lib/access";
import { withCategories } from "./lib/categories";
import { assertLinksInOrg, documentNumber, normalizeItems, withTotals } from "./lib/documents";

/**
 * Project templates: a kind of job the company does, saved from a project
 * that went well. A template keeps the estimate's lines (with their red
 * line and cap), the tasks as days from the start, and how long the job
 * takes. Starting a project from one creates the project, a draft estimate
 * holding the lines, and the tasks on the calendar, in one go.
 */

const MAX_TEMPLATES = 200;
const MAX_TASKS = 100;
const DAY = 86_400_000;

type Task = Doc<"projectTemplates">["tasks"][number];

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/** What the list shows: the total of the lines and how much the template holds. */
function summary(t: Doc<"projectTemplates">) {
  const total = Math.round(t.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;
  return { ...t, total, itemCount: t.items.length, taskCount: t.tasks.length };
}

function cleanTasks(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_TASKS) fail("INVALID", `A template can have up to ${MAX_TASKS} tasks`);
  return raw.map((task: Record<string, unknown>) => {
    if (typeof task?.title !== "string" || task.title.trim() === "") fail("INVALID", "Every task needs a title");
    const offset = Number(task.startOffset);
    const days = Number(task.days);
    const cleaned: Task = { title: task.title.trim() };
    if (typeof task.notes === "string" && task.notes.trim()) cleaned.notes = task.notes.trim();
    if (Number.isFinite(offset) && offset >= 0) cleaned.startOffset = Math.round(offset);
    if (Number.isFinite(days) && days >= 1) cleaned.days = Math.round(days);
    return cleaned;
  });
}

function cleanName(name: unknown): string {
  if (typeof name !== "string" || name.trim() === "") fail("INVALID", "Give the template a name");
  return name.trim();
}

function cleanDays(days: unknown): number | undefined {
  if (days === undefined || days === null || days === "") return undefined;
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1) fail("INVALID", "Days must be at least 1");
  return Math.round(n);
}

const optionalText = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const templates = await ctx.db
      .query("projectTemplates")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(MAX_TEMPLATES);
    return templates.sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name)).map(summary);
  },
});

export const get = query({
  args: { id: v.id("projectTemplates") },
  handler: async (ctx, { id }) => summary((await getOwned(ctx, "projectTemplates", id)).doc),
});

async function insertTemplate(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
  fields: Omit<Doc<"projectTemplates">, "_id" | "_creationTime" | "organizationId" | "userId" | "usageCount" | "createdAt" | "updatedAt">,
) {
  const existing = await ctx.db
    .query("projectTemplates")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_TEMPLATES);
  if (existing.length >= MAX_TEMPLATES) fail("INVALID", `A company can have up to ${MAX_TEMPLATES} templates`);
  const now = nowIso();
  const id = await ctx.db.insert("projectTemplates", { ...fields, organizationId, userId, usageCount: 0, createdAt: now, updatedAt: now });
  await logActivity(ctx, {
    organizationId,
    userId,
    action: "created",
    resourceType: "project_template",
    resourceId: id,
    details: { name: fields.name },
  });
  return summary((await ctx.db.get(id))!);
}

/** A template written by hand (or by a connected assistant). */
export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    return await insertTemplate(ctx, organizationId, user._id, {
      name: cleanName(data?.name),
      description: optionalText(data?.description),
      category: optionalText(data?.category),
      days: cleanDays(data?.days),
      items: await withCategories(ctx, normalizeItems(data?.items)),
      tasks: cleanTasks(data?.tasks),
    });
  },
});

/**
 * A template from a project: the lines of its signed estimate (or the
 * latest one), its tasks as days from the project's start, and its length.
 */
export const saveFromProject = mutation({
  args: { projectId: v.id("projects"), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, { projectId, name, description }) => {
    const { doc: project, user } = await getOwned(ctx, "projects", projectId);
    const estimates = (
      await ctx.db
        .query("estimates")
        .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", project.organizationId))
        .order("desc")
        .take(2000)
    ).filter((e) => e.projectId === projectId);
    const estimate = estimates.find((e) => e.status === "accepted") ?? estimates[0];
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(MAX_TASKS);
    // Tasks count from the project's start, or the first task when it has none.
    const starts = tasks
      .map((t) => t.startDate)
      .filter((d): d is string => !!d)
      .sort();
    const origin = project.startDate ?? starts[0];
    const templateTasks: Task[] = tasks
      .sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.order - b.order)
      .map((t) => {
        const task: Task = { title: t.title };
        if (t.notes) task.notes = t.notes;
        if (t.startDate && origin) {
          task.startOffset = Math.max(0, daysBetween(origin, t.startDate));
          if (t.endDate) task.days = Math.max(1, daysBetween(t.startDate, t.endDate) + 1);
        }
        return task;
      });
    const span = project.startDate && project.endDate ? daysBetween(project.startDate, project.endDate) + 1 : undefined;
    return await insertTemplate(ctx, project.organizationId, user._id, {
      name: cleanName(name),
      description: optionalText(description) ?? optionalText(project.description),
      category: project.category,
      days: span && span >= 1 ? span : undefined,
      items: estimate ? estimate.items.map((item, index) => ({ ...item, _id: crypto.randomUUID(), displayOrder: index })) : [],
      tasks: templateTasks,
    });
  },
});

export const update = mutation({
  args: { id: v.id("projectTemplates"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await getOwned(ctx, "projectTemplates", id);
    const patch: Partial<Doc<"projectTemplates">> = {};
    if ("name" in data) patch.name = cleanName(data.name);
    if ("description" in data) patch.description = optionalText(data.description);
    if ("category" in data) patch.category = optionalText(data.category);
    if ("days" in data) patch.days = cleanDays(data.days);
    if ("items" in data) patch.items = await withCategories(ctx, normalizeItems(data.items));
    if ("tasks" in data) patch.tasks = cleanTasks(data.tasks);
    await ctx.db.patch(id, { ...patch, updatedAt: nowIso() });
    return summary((await ctx.db.get(id))!);
  },
});

export const remove = mutation({
  args: { id: v.id("projectTemplates") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "projectTemplates", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "project_template",
      resourceId: id,
      details: { name: doc.name },
    });
  },
});

/**
 * A project from a template: the project itself, a draft estimate with the
 * template's lines, and its tasks placed from the start date. The sheet's
 * own values (name, client, dates, budget, description) win over the
 * template's.
 */
export const start = mutation({
  args: {
    id: v.id("projectTemplates"),
    data: v.object({
      name: v.string(),
      clientId: v.optional(v.id("clients")),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      budget: v.optional(v.number()),
      description: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, data }) => {
    const { doc: template, user } = await getOwned(ctx, "projectTemplates", id);
    const organizationId = template.organizationId;
    const name = data.name.trim();
    if (!name) fail("INVALID", "Project name is required");
    await assertLinksInOrg(ctx, organizationId, { clientId: data.clientId });
    const startDate = data.startDate || undefined;
    const endDate = data.endDate || (startDate && template.days ? addDays(startDate, template.days - 1) : undefined);
    if (startDate && endDate && endDate < startDate) fail("INVALID", "The end date is before the start date");
    const total = Math.round(template.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;
    const description = optionalText(data.description) ?? template.description;
    const now = nowIso();

    const projectId = await ctx.db.insert("projects", {
      name,
      description,
      clientId: data.clientId,
      status: "planning",
      budget: data.budget ?? (total > 0 ? total : undefined),
      startDate,
      endDate,
      category: template.category,
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
      resourceId: projectId,
      details: { name, template: template.name },
    });

    let estimateId: Id<"estimates"> | null = null;
    if (template.items.length > 0) {
      const estimate = withTotals({
        status: "draft" as const,
        issueDate: now.slice(0, 10),
        expiryDate: addDays(now.slice(0, 10), 30),
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 0,
        estimateNumber: documentNumber("EST"),
        title: `${name} - Estimate`,
        description,
        clientId: data.clientId,
        projectId,
        items: template.items.map((item, index) => ({ ...item, _id: crypto.randomUUID(), displayOrder: index })),
        organizationId,
        userId: user._id,
        createdAt: now,
        updatedAt: now,
      });
      estimateId = await ctx.db.insert("estimates", estimate);
      await logActivity(ctx, {
        organizationId,
        userId: user._id,
        action: "created",
        resourceType: "estimate",
        resourceId: estimateId,
        details: { estimateNumber: estimate.estimateNumber, totalAmount: estimate.totalAmount },
      });
    }

    let order = 0;
    for (const task of template.tasks) {
      const taskStart = startDate && task.startOffset !== undefined ? addDays(startDate, task.startOffset) : undefined;
      const taskEnd = taskStart && task.days && task.days > 1 ? addDays(taskStart, task.days - 1) : undefined;
      await ctx.db.insert("projectTasks", {
        organizationId,
        projectId,
        title: task.title,
        notes: task.notes,
        startDate: taskStart,
        endDate: taskEnd,
        crewIds: [],
        order: ++order,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(id, { usageCount: template.usageCount + 1, updatedAt: now });
    return { project: (await ctx.db.get(projectId))!, estimateId };
  },
});
