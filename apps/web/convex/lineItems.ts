import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, nowIso, pick } from "./lib/access";
import { byDisplayOrder, organizationIdFrom, requireCatalogAccess, resolveCostCode } from "./lib/priceBook";
import { lineItemFields } from "./schema";

const MAX_BULK = 500;

async function withCostCode(ctx: QueryCtx | MutationCtx, item: Doc<"lineItems">) {
  const costCode = await ctx.db.get(item.cost_code_id);
  return {
    ...item,
    cost_code: costCode
      ? { id: costCode._id, name: costCode.name, code: costCode.code, category: costCode.category }
      : null,
  };
}

async function loadEditable(ctx: MutationCtx, id: Id<"lineItems">) {
  const item = await ctx.db.get(id);
  if (item === null) fail("NOT_FOUND", "Line item not found");
  await requireCatalogAccess(ctx, item.organization_id, "write");
  return item;
}

/** Org items plus (by default) shared industry items, like the old API. */
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    costCodeId: v.optional(v.id("costCodes")),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    includeShared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCatalogAccess(ctx, args.organizationId, "read");
    const scopes: Array<Id<"organizations"> | undefined> = [args.organizationId];
    if (args.includeShared !== false) scopes.push(undefined);

    const rows: Doc<"lineItems">[] = [];
    for (const scope of scopes) {
      rows.push(
        ...(await ctx.db
          .query("lineItems")
          .withIndex("by_organization", (q) => q.eq("organization_id", scope))
          .take(5000)),
      );
    }

    const search = args.search?.trim().toLowerCase();
    const filtered = rows.filter(
      (item) =>
        (args.isActive === false || item.is_active) &&
        (args.costCodeId === undefined || item.cost_code_id === args.costCodeId) &&
        (args.category === undefined || item.service_category === args.category) &&
        (!search ||
          item.name.toLowerCase().includes(search) ||
          (item.description ?? "").toLowerCase().includes(search)),
    );
    filtered.sort(byDisplayOrder((item) => item.name));
    return await Promise.all(filtered.map((item) => withCostCode(ctx, item)));
  },
});

export const get = query({
  args: { id: v.id("lineItems") },
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (item === null) fail("NOT_FOUND", "Line item not found");
    await requireCatalogAccess(ctx, item.organization_id, "read");
    return await withCostCode(ctx, item);
  },
});

async function insertLineItem(ctx: MutationCtx, data: unknown) {
  const organizationId = organizationIdFrom(ctx, (data as any)?.organization_id);
  const user = await requireCatalogAccess(ctx, organizationId, "write");
  const fields = pick(data, lineItemFields);
  if (typeof fields.name !== "string" || fields.name.trim() === "") fail("INVALID", "Name is required");
  const now = nowIso();
  return await ctx.db.insert("lineItems", {
    is_active: true,
    unit: "each",
    base_price: 0,
    ...(fields as { name: string }),
    cost_code_id: await resolveCostCode(ctx, fields.cost_code_id, organizationId),
    organization_id: organizationId,
    user_id: user._id,
    created_at: now,
    updated_at: now,
  });
}

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const id = await insertLineItem(ctx, data);
    return await withCostCode(ctx, (await ctx.db.get(id))!);
  },
});

export const bulkCreate = mutation({
  args: { items: v.array(v.any()) },
  handler: async (ctx, { items }) => {
    if (items.length > MAX_BULK) fail("INVALID", `Import at most ${MAX_BULK} items at a time`);
    const created = [];
    for (const item of items) {
      created.push((await ctx.db.get(await insertLineItem(ctx, item)))!);
    }
    return {
      message: `Successfully imported ${created.length} line items`,
      count: created.length,
      items: created,
    };
  },
});

export const update = mutation({
  args: { id: v.id("lineItems"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const item = await loadEditable(ctx, id);
    const patch = pick(data, lineItemFields, { forPatch: true });
    if ("cost_code_id" in patch) {
      patch.cost_code_id = await resolveCostCode(ctx, patch.cost_code_id, item.organization_id);
    }
    await ctx.db.patch(id, { ...patch, updated_at: nowIso() });
    return await withCostCode(ctx, (await ctx.db.get(id))!);
  },
});

/** Soft delete, as before: the item is hidden but kept for old estimates. */
export const remove = mutation({
  args: { id: v.id("lineItems") },
  handler: async (ctx, { id }) => {
    await loadEditable(ctx, id);
    await ctx.db.patch(id, { is_active: false, updated_at: nowIso() });
    return { message: "Line item deleted", lineItem: await ctx.db.get(id) };
  },
});
