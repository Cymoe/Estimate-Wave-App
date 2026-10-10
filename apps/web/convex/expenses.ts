import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { assertLinksInOrg } from "./lib/documents";
import { expenseFields } from "./schema";

function checkFields(fields: Record<string, unknown>) {
  if ("description" in fields && (typeof fields.description !== "string" || fields.description.trim() === "")) {
    fail("INVALID", "Say what the expense was for");
  }
  if ("amount" in fields && (typeof fields.amount !== "number" || !Number.isFinite(fields.amount) || fields.amount < 0)) {
    fail("INVALID", "Amount must be zero or more");
  }
}

/** A cost code must be a shared one or the organization's own. */
async function checkCostCode(ctx: MutationCtx, organizationId: Id<"organizations">, costCodeId: unknown) {
  if (costCodeId === undefined) return;
  const normalized = typeof costCodeId === "string" ? ctx.db.normalizeId("costCodes", costCodeId) : null;
  const code = normalized === null ? null : await ctx.db.get(normalized);
  if (code === null || (code.organization_id !== undefined && code.organization_id !== organizationId)) {
    fail("INVALID", "Cost code not found");
  }
}

/** The organization's expenses (or one project's), newest first. */
export const list = query({
  args: { organizationId: v.id("organizations"), projectId: v.optional(v.id("projects")) },
  handler: async (ctx, { organizationId, projectId }) => {
    await requireMember(ctx, organizationId);
    const rows =
      projectId !== undefined
        ? (await ctx.db.query("expenses").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(2000)).filter(
            (row) => row.organizationId === organizationId,
          )
        : await ctx.db
            .query("expenses")
            .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
            .take(5000);
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  },
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = pick(data, expenseFields);
    checkFields({ description: fields.description, amount: fields.amount, ...fields });
    await assertLinksInOrg(ctx, organizationId, { projectId: fields.projectId });
    await checkCostCode(ctx, organizationId, fields.costCodeId);
    const now = nowIso();
    const id = await ctx.db.insert("expenses", {
      category: "Other",
      status: "pending",
      date: now.slice(0, 10),
      ...(fields as { description: string; amount: number }),
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "expense",
      resourceId: id,
      details: { description: fields.description, amount: fields.amount, projectId: fields.projectId },
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("expenses"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const { doc } = await getOwned(ctx, "expenses", id);
    const patch = pick(data, expenseFields, { forPatch: true });
    for (const required of ["description", "amount", "category", "date", "status"] as const) {
      if (required in patch && patch[required] === undefined) fail("INVALID", `${required} can't be cleared`);
    }
    checkFields(patch);
    await assertLinksInOrg(ctx, doc.organizationId, { projectId: patch.projectId });
    await checkCostCode(ctx, doc.organizationId, patch.costCodeId);
    await ctx.db.patch(id, { ...patch, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "expenses", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "expense",
      resourceId: id,
      details: { description: doc.description, amount: doc.amount },
    });
    return { message: "Expense deleted" };
  },
});
