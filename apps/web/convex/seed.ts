import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { nowIso } from "./lib/access";

/**
 * Starter catalog shared by every organization: the pricing-mode presets and
 * the roofing cost codes + price book that the old MongoDB seed scripts
 * created. Safe to run more than once.
 *
 *   npx convex run seed:catalog
 */

const PRESET_MODES = [
  { name: "Need This Job", icon: "💰", description: "Aggressive pricing to secure work", adjustments: { all: 0.85 } },
  { name: "Competitive", icon: "🎯", description: "Win more bids with lower margins", adjustments: { all: 0.9 } },
  { name: "Busy Season", icon: "☀️", description: "Peak demand pricing", adjustments: { all: 1.15 } },
];

const ROOFING_COST_CODES = [
  { code: "ROOF-LAB", name: "Roofing Labor", description: "Labor costs for roofing installation and repair", category: "Labor", unit: "hour" },
  { code: "ROOF-MAT", name: "Roofing Materials", description: "Shingles, underlayment, and roofing materials", category: "Materials", unit: "square" },
  { code: "ROOF-TEAR", name: "Tear-off & Disposal", description: "Removal of old roofing and disposal", category: "Labor", unit: "square" },
  { code: "ROOF-FLASH", name: "Flashing & Trim", description: "Metal flashing, drip edge, and trim work", category: "Materials", unit: "linear_foot" },
  { code: "ROOF-VENT", name: "Ventilation", description: "Ridge vents, soffit vents, and ventilation components", category: "Materials", unit: "unit" },
];

// [cost code, name, description, unit, base price, red line, cap, labor hours]
type ItemRow = [string, string, string, string, number, number?, number?, number?];
const ROOFING_ITEMS: ItemRow[] = [
  ["ROOF-LAB", "Shingle Installation - Standard", "Standard 3-tab or architectural shingle installation", "square", 250, 200, 300, 4],
  ["ROOF-LAB", "Shingle Installation - Premium", "Premium architectural or designer shingle installation", "square", 350, 280, 420, 6],
  ["ROOF-LAB", "Roof Repair - Small", "Small roof repairs, leaks, or shingle replacement", "hour", 125, 100, 150, 1],
  ["ROOF-MAT", "Asphalt Shingles - 3-Tab", "Standard 3-tab asphalt shingles (25-year warranty)", "square", 120, 95, 145],
  ["ROOF-MAT", "Architectural Shingles", "Premium architectural shingles (30-year warranty)", "square", 185, 148, 222],
  ["ROOF-MAT", "Designer Shingles", "High-end designer shingles (50-year warranty)", "square", 300, 240, 360],
  ["ROOF-MAT", "Underlayment - Synthetic", "Premium synthetic underlayment", "square", 50, 40, 60],
  ["ROOF-TEAR", "Single Layer Tear-off", "Remove one layer of existing shingles and dispose", "square", 85, 68, 102, 2],
  ["ROOF-TEAR", "Double Layer Tear-off", "Remove two layers of existing shingles and dispose", "square", 125, 100, 150, 3],
  ["ROOF-FLASH", "Drip Edge", "Aluminum or galvanized drip edge", "linear_foot", 4.5],
  ["ROOF-FLASH", "Valley Flashing", "Metal valley flashing installation", "linear_foot", 15],
  ["ROOF-FLASH", "Chimney Flashing", "Custom chimney flashing and counter-flashing", "unit", 300, undefined, undefined, 3],
  ["ROOF-VENT", "Ridge Vent", "Continuous ridge vent with filter", "linear_foot", 6],
  ["ROOF-VENT", "Roof Vent - Static", "Static roof vent (turtle vent)", "unit", 50],
  ["ROOF-VENT", "Power Attic Vent", "Electric-powered attic ventilation fan", "unit", 400, undefined, undefined, 2],
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

async function seedRoofing(ctx: MutationCtx): Promise<{ costCodes: number; lineItems: number }> {
  const now = nowIso();
  const shared = await ctx.db
    .query("costCodes")
    .withIndex("by_industry", (q) => q.eq("industry_id", "roofing"))
    .take(200);
  const codeIds = new Map<string, Id<"costCodes">>(
    shared.filter((cc) => cc.organization_id === undefined).map((cc) => [cc.code, cc._id]),
  );

  let costCodes = 0;
  for (const [index, cc] of ROOFING_COST_CODES.entries()) {
    if (codeIds.has(cc.code)) continue;
    const id = await ctx.db.insert("costCodes", {
      ...cc,
      industry_id: "roofing",
      display_order: index + 1,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    codeIds.set(cc.code, id);
    costCodes++;
  }

  const existingItems = await ctx.db
    .query("lineItems")
    .withIndex("by_organization", (q) => q.eq("organization_id", undefined))
    .take(5000);
  const existingNames = new Set(existingItems.map((item) => item.name));

  let lineItems = 0;
  const orderByCode = new Map<string, number>();
  for (const [code, name, description, unit, price, redLine, cap, hours] of ROOFING_ITEMS) {
    const order = (orderByCode.get(code) ?? 0) + 1;
    orderByCode.set(code, order);
    if (existingNames.has(name)) continue;
    await ctx.db.insert("lineItems", {
      name,
      description,
      unit,
      base_price: price,
      // Same defaults as the old seed: ±20% around the base price.
      red_line_price: redLine ?? Math.round(price * 0.8),
      cap_price: cap ?? Math.round(price * 1.2),
      ...(hours !== undefined ? { estimated_hours: hours } : {}),
      cost_code_id: codeIds.get(code)!,
      service_category: "roofing",
      display_order: order,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    lineItems++;
  }
  return { costCodes, lineItems };
}

export const catalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pricingModes = await seedPresets(ctx);
    const roofing = await seedRoofing(ctx);
    return { pricingModes, ...roofing };
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
