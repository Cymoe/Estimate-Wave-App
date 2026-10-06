import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { templateFields } from "./schema";

const MAX_ITEMS = 200;

/** Adds the template's total (sum of quantity × unit price). */
function withTotal(template: Doc<"templates">) {
  const total = template.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return { ...template, total: Math.round(total * 100) / 100 };
}

/** Checks the loosely typed fields from the UI and drops empty lines. */
function cleanFields(data: unknown, forPatch: boolean) {
  const fields = pick(data, templateFields, { forPatch });
  if ("name" in fields && fields.name !== undefined) {
    if (typeof fields.name !== "string" || fields.name.trim() === "") fail("INVALID", "Template name is required");
    fields.name = fields.name.trim();
  }
  if (fields.items !== undefined) {
    if (!Array.isArray(fields.items)) fail("INVALID", "Items must be a list");
    if (fields.items.length > MAX_ITEMS) fail("INVALID", `A template can have at most ${MAX_ITEMS} items`);
    fields.items = fields.items.map((item: Record<string, unknown>) => {
      const quantity = Number(item?.quantity);
      const unitPrice = Number(item?.unitPrice);
      if (typeof item?.name !== "string" || item.name.trim() === "") fail("INVALID", "Every item needs a name");
      if (!Number.isFinite(quantity) || quantity <= 0) fail("INVALID", "Quantities must be greater than zero");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) fail("INVALID", "Prices can't be negative");
      return pick({ ...item, quantity, unitPrice, name: item.name.trim() }, {
        lineItemId: true,
        name: true,
        description: true,
        quantity: true,
        unitPrice: true,
        unit: true,
      });
    });
  }
  return fields;
}

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const templates = await ctx.db
      .query("templates")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(1000);
    return templates
      .sort(
        (a, b) =>
          Number(b.isFavorite ?? false) - Number(a.isFavorite ?? false) ||
          b.usageCount - a.usageCount ||
          a.name.localeCompare(b.name),
      )
      .map(withTotal);
  },
});

export const get = query({
  args: { id: v.id("templates") },
  handler: async (ctx, { id }) => withTotal((await getOwned(ctx, "templates", id)).doc),
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = cleanFields(data, false);
    if (fields.name === undefined) fail("INVALID", "Template name is required");
    const now = nowIso();
    const id = await ctx.db.insert("templates", {
      items: [],
      ...(fields as { name: string }),
      usageCount: 0,
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "template",
      resourceId: id,
      details: { name: fields.name },
    });
    return withTotal((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { id: v.id("templates"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await getOwned(ctx, "templates", id);
    const fields = cleanFields(data, true);
    if ("name" in fields && fields.name === undefined) fail("INVALID", "Template name is required");
    if ("items" in fields && fields.items === undefined) fields.items = [];
    await ctx.db.patch(id, { ...fields, updatedAt: nowIso() });
    return withTotal((await ctx.db.get(id))!);
  },
});

export const duplicate = mutation({
  args: { id: v.id("templates") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "templates", id);
    const now = nowIso();
    const copy = await ctx.db.insert("templates", {
      name: `${doc.name} (copy)`,
      description: doc.description,
      industryId: doc.industryId,
      items: doc.items,
      usageCount: 0,
      organizationId: doc.organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return withTotal((await ctx.db.get(copy))!);
  },
});

/** Counts a use (the list puts often-used templates first). */
export const recordUse = mutation({
  args: { id: v.id("templates") },
  handler: async (ctx, { id }) => {
    const { doc } = await getOwned(ctx, "templates", id);
    await ctx.db.patch(id, { usageCount: doc.usageCount + 1 });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("templates") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "templates", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "template",
      resourceId: id,
      details: { name: doc.name },
    });
    return { message: "Template deleted successfully" };
  },
});
