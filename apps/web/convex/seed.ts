import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { STARTER_COST_CODES, STARTER_INDUSTRIES, STARTER_ITEMS } from "./catalog/starterCatalog";
import { nowIso } from "./lib/access";

/**
 * Starter catalog shared by every organization: the pricing-mode presets and
 * every trade's cost codes and price book (catalog/starterCatalog.ts, rebuilt
 * from the old Supabase migrations). Safe to run more than once: it only adds
 * what is missing.
 *
 *   npx convex run seed:catalog
 */

const PRESET_MODES = [
  { name: "Need This Job", icon: "💰", description: "Aggressive pricing to secure work", adjustments: { all: 0.85 } },
  { name: "Competitive", icon: "🎯", description: "Win more bids with lower margins", adjustments: { all: 0.9 } },
  { name: "Busy Season", icon: "☀️", description: "Peak demand pricing", adjustments: { all: 1.15 } },
];

async function seedPresets(ctx: MutationCtx): Promise<number> {
  const existing = await ctx.db
    .query("pricingModes")
    .withIndex("by_preset", (q) => q.eq("is_preset", true))
    .take(200);
  const names = new Set(existing.map((m) => m.name));
  const now = nowIso();
  let created = 0;
  for (const mode of PRESET_MODES) {
    if (names.has(mode.name)) continue;
    await ctx.db.insert("pricingModes", {
      ...mode,
      is_preset: true,
      is_active: true,
      usage_count: 0,
      successful_estimates: 0,
      total_estimates: 0,
      created_at: now,
      updated_at: now,
    });
    created++;
  }
  return created;
}

const STARTER = "starter";

export const presets = internalMutation({ args: {}, handler: seedPresets });

/** Adds missing trades and refreshes the starter ones. */
export const industries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = nowIso();
    const existing = new Map((await ctx.db.query("industries").take(500)).map((row) => [row.slug, row]));
    let created = 0;
    for (const [index, industry] of STARTER_INDUSTRIES.entries()) {
      const row = existing.get(industry.slug);
      const fields = { ...industry, display_order: index + 1 };
      if (row === undefined) {
        await ctx.db.insert("industries", {
          ...fields,
          is_active: true,
          catalog_source: STARTER,
          created_at: now,
          updated_at: now,
        });
        created++;
      } else if (row.catalog_source === STARTER) {
        await ctx.db.patch(row._id, { ...fields, updated_at: now });
      }
    }
    return created;
  },
});

/** Adds one trade's missing shared cost codes and line items. */
export const industryCatalog = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const now = nowIso();
    const shared = (
      await ctx.db
        .query("costCodes")
        .withIndex("by_industry", (q) => q.eq("industry_id", slug))
        .take(500)
    ).filter((cc) => cc.organization_id === undefined);
    const codes = new Map<string, Id<"costCodes">>(shared.map((cc) => [cc.code, cc._id]));
    const codeNames = new Map<string, string>(shared.map((cc) => [cc.code, cc.name]));

    let costCodes = 0;
    for (const [index, cc] of STARTER_COST_CODES.filter((cc) => cc.industry === slug).entries()) {
      if (codes.has(cc.code)) continue;
      const id = await ctx.db.insert("costCodes", {
        code: cc.code,
        name: cc.name,
        category: cc.category,
        industry_id: slug,
        display_order: index + 1,
        is_active: true,
        catalog_source: STARTER,
        created_at: now,
        updated_at: now,
      });
      codes.set(cc.code, id);
      codeNames.set(cc.code, cc.name);
      costCodes++;
    }

    let lineItems = 0;
    const order = new Map<string, number>();
    const existingNames = new Map<Id<"costCodes">, Set<string>>();
    for (const [industry, code, name, description, unit, price, redLine, cap] of STARTER_ITEMS) {
      if (industry !== slug) continue;
      const costCodeId = codes.get(code)!;
      const position = (order.get(code) ?? 0) + 1;
      order.set(code, position);
      if (!existingNames.has(costCodeId)) {
        const items = await ctx.db
          .query("lineItems")
          .withIndex("by_cost_code", (q) => q.eq("cost_code_id", costCodeId))
          .take(1000);
        existingNames.set(
          costCodeId,
          new Set(items.filter((item) => item.organization_id === undefined).map((item) => item.name)),
        );
      }
      if (existingNames.get(costCodeId)!.has(name)) continue;
      await ctx.db.insert("lineItems", {
        name,
        description,
        unit,
        base_price: price,
        // The old database's default range: red line 70% and cap 150% of base.
        red_line_price: redLine ?? Math.round(price * 70) / 100,
        cap_price: cap ?? Math.round(price * 150) / 100,
        cost_code_id: costCodeId,
        service_category: codeNames.get(code),
        display_order: position,
        is_active: true,
        catalog_source: STARTER,
        created_at: now,
        updated_at: now,
      });
      lineItems++;
    }
    return { costCodes, lineItems };
  },
});

/**
 * Removes the first roofing seed (ROOF-* codes and their shared items); those
 * items now live under the RF codes.
 */
export const removeLegacyRoofing = internalMutation({
  args: {},
  handler: async (ctx) => {
    const legacy = (
      await ctx.db
        .query("costCodes")
        .withIndex("by_industry", (q) => q.eq("industry_id", "roofing"))
        .take(500)
    ).filter((cc) => cc.organization_id === undefined && cc.code.startsWith("ROOF-"));
    let removed = 0;
    for (const cc of legacy) {
      const items = await ctx.db
        .query("lineItems")
        .withIndex("by_cost_code", (q) => q.eq("cost_code_id", cc._id))
        .take(1000);
      // Keep a code a company has filed its own items under.
      if (items.some((item) => item.organization_id !== undefined)) continue;
      for (const item of items) await ctx.db.delete(item._id);
      await ctx.db.delete(cc._id);
      removed++;
    }
    return removed;
  },
});

export const catalog = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, number>> => {
    const pricingModes: number = await ctx.runMutation(internal.seed.presets, {});
    const industries: number = await ctx.runMutation(internal.seed.industries, {});
    const legacyRoofingCodesRemoved: number = await ctx.runMutation(internal.seed.removeLegacyRoofing, {});
    let costCodes = 0;
    let lineItems = 0;
    // One transaction per trade keeps each well inside Convex's limits.
    for (const industry of STARTER_INDUSTRIES) {
      const added: { costCodes: number; lineItems: number } = await ctx.runMutation(
        internal.seed.industryCatalog,
        { slug: industry.slug },
      );
      costCodes += added.costCodes;
      lineItems += added.lineItems;
    }
    return { pricingModes, industries, legacyRoofingCodesRemoved, costCodes, lineItems };
  },
});

/**
 * Grants the app-wide super admin role (can edit the shared catalog).
 *
 *   npx convex run seed:makeSuperAdmin '{"email":"you@example.com"}'
 */
export const makeSuperAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (user === null) throw new Error(`No user with email ${email}`);
    await ctx.db.patch(user._id, { role: "super_admin" });
    return user._id;
  },
});
