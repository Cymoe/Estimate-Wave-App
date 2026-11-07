import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { fail, nowIso, organizationIdsFor, pick, requireUser } from "./lib/access";
import { byDisplayOrder, organizationIdFrom, requireCatalogAccess } from "./lib/priceBook";
import { costCodeFields } from "./schema";

const MAX_BULK = 500;

/** Shared industry cost codes plus those of the caller's organizations. */
export const list = query({
  args: {
    industryId: v.optional(v.string()),
    category: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const scopes: Array<Id<"organizations"> | undefined> = [undefined, ...(await organizationIdsFor(ctx, user._id))];
    const rows: Doc<"costCodes">[] = [];
    for (const scope of scopes) {
      rows.push(
        ...(await ctx.db
          .query("costCodes")
          .withIndex("by_organization", (q) => q.eq("organization_id", scope))
          .take(5000)),
      );
    }
    const industries = new Map(
      (await ctx.db.query("industries").take(500)).map((row) => [
        row.slug,
        { id: row.slug, name: row.name, icon: row.icon, color: row.color },
      ]),
    );
    return rows
      .filter(
        (cc) =>
          (args.isActive === false || cc.is_active) &&
          (args.industryId === undefined || cc.industry_id === args.industryId) &&
          (args.category === undefined || cc.category === args.category),
      )
      .sort(byDisplayOrder((cc) => cc.code))
      .map((cc) => ({ ...cc, industry: cc.industry_id ? (industries.get(cc.industry_id) ?? null) : null }));
  },
});

export const get = query({
  args: { id: v.id("costCodes") },
  handler: async (ctx, { id }) => {
    const costCode = await ctx.db.get(id);
    if (costCode === null) fail("NOT_FOUND", "Cost code not found");
    await requireCatalogAccess(ctx, costCode.organization_id, "read");
    return costCode;
  },
});

async function insertCostCode(ctx: MutationCtx, data: unknown) {
  const organizationId = organizationIdFrom(ctx, (data as any)?.organization_id);
  await requireCatalogAccess(ctx, organizationId, "write");
  const fields = pick(data, costCodeFields);
  if (typeof fields.code !== "string" || typeof fields.name !== "string") {
    fail("INVALID", "Cost code and name are required");
  }
  const now = nowIso();
  return await ctx.db.insert("costCodes", {
    is_active: true,
    ...(fields as { code: string; name: string }),
    organization_id: organizationId,
    created_at: now,
    updated_at: now,
  });
}

async function loadEditable(ctx: MutationCtx, id: Id<"costCodes">) {
  const costCode = await ctx.db.get(id);
  if (costCode === null) fail("NOT_FOUND", "Cost code not found");
  await requireCatalogAccess(ctx, costCode.organization_id, "write");
  return costCode;
}

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => await ctx.db.get(await insertCostCode(ctx, data)),
});

export const bulkCreate = mutation({
  args: { items: v.array(v.any()) },
  handler: async (ctx, { items }) => {
    if (items.length > MAX_BULK) fail("INVALID", `Import at most ${MAX_BULK} cost codes at a time`);
    const created = [];
    for (const item of items) created.push((await ctx.db.get(await insertCostCode(ctx, item)))!);
    return { message: `Successfully imported ${created.length} cost codes`, count: created.length, items: created };
  },
});

export const update = mutation({
  args: { id: v.id("costCodes"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await loadEditable(ctx, id);
    await ctx.db.patch(id, { ...pick(data, costCodeFields, { forPatch: true }), updated_at: nowIso() });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("costCodes") },
  handler: async (ctx, { id }) => {
    await loadEditable(ctx, id);
    await ctx.db.patch(id, { is_active: false, updated_at: nowIso() });
    return { message: "Cost code deleted", costCode: await ctx.db.get(id) };
  },
});
