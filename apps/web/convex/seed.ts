import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { STARTER_COST_CODES, STARTER_INDUSTRIES, STARTER_ITEMS } from "./catalog/starterCatalog";
import { nowIso } from "./lib/access";
import { deleteOrganization, deleteUser } from "./lib/cleanup";
import { createOrganization } from "./lib/organizations";
import {
  companyNameKey,
  deleteDemoData,
  isEmptyCompany,
  switchOffCompany,
} from "./marketplace";

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

/**
 * Removes the throwaway accounts the deploy smoke test signs up
 * (`@fieldquote.test` emails) with the companies only they belong to. A
 * company another person has joined is kept. Run after every deploy.
 *
 *   npx convex run seed:removeSmokeTests
 */
export const removeSmokeTests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = (await ctx.db.query("users").take(10000)).filter((u) => u.email?.endsWith("@fieldquote.test"));
    let companies = 0;
    let records = 0;
    for (const user of users) {
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const membership of memberships) {
        const members = await ctx.db
          .query("memberships")
          .withIndex("by_organization", (q) => q.eq("organizationId", membership.organizationId))
          .collect();
        if (members.every((m) => m.userId === user._id)) {
          if ((await ctx.db.get(membership.organizationId)) !== null) {
            records += await deleteOrganization(ctx, membership.organizationId);
            companies++;
          }
        } else {
          await ctx.db.delete(membership._id);
        }
      }
      await deleteUser(ctx, user._id);
    }
    return { users: users.length, companies, records };
  },
});

/** The contractors buying leads today, with the trades they get leads for. */
export const REAL_COMPANIES: Array<{ name: string; leadTrades: string[] }> = [
  { name: "Mio Homes", leadTrades: ["landscaping"] },
  { name: "Soco Outdoor", leadTrades: ["landscaping"] },
  { name: "Buried Stone", leadTrades: ["landscaping"] },
  { name: "Picante Painting", leadTrades: ["painting"] },
  { name: "A&E Landscaping", leadTrades: ["landscaping"] },
];

/**
 * Replaces the Lead Market demo data with the real companies. A company that
 * already exists (even one switched off) is left alone, apart from getting
 * its trades if it has none, so this is safe to run more than once.
 *
 *   npx convex run seed:realCompanies
 */
export const realCompanies = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demo = await deleteDemoData(ctx);
    const existing = await ctx.db.query("organizations").take(1000);
    const created: string[] = [];
    const updated: string[] = [];
    for (const company of REAL_COMPANIES) {
      const key = companyNameKey(company.name);
      const matches = existing.filter((org) => companyNameKey(org.name) === key);
      const active = matches.find((org) => org.isActive);
      if (active) {
        if (!active.leadTrades?.length) {
          await ctx.db.patch(active._id, { leadTrades: company.leadTrades, updatedAt: nowIso() });
          updated.push(company.name);
        }
        continue;
      }
      if (matches.length > 0) continue;
      await createOrganization(ctx, { name: company.name, leadTrades: company.leadTrades, walletBalanceCents: 0 });
      created.push(company.name);
    }
    return { demoRemoved: demo, created, updated };
  },
});

/**
 * Switches off empty copies of a company that exists more than once under the
 * same name. At least one company per name is always kept (the ones with
 * data first); a removed copy's trades move to the kept one if it has none.
 *
 *   npx convex run seed:removeEmptyDuplicates
 */
export const removeEmptyDuplicates = internalMutation({
  args: {},
  handler: async (ctx) => await switchOffEmptyDuplicates(ctx),
});

async function switchOffEmptyDuplicates(ctx: MutationCtx) {
  {
    const active = (await ctx.db.query("organizations").take(1000)).filter((org) => org.isActive);
    const groups = new Map<string, typeof active>();
    for (const org of active) {
      const key = companyNameKey(org.name);
      groups.set(key, [...(groups.get(key) ?? []), org]);
    }
    const removed: string[] = [];
    for (const orgs of groups.values()) {
      if (orgs.length < 2) continue;
      const empty = new Set<string>();
      for (const org of orgs) if (await isEmptyCompany(ctx, org)) empty.add(org._id);
      // Keep the companies with data; if every copy is empty, keep the oldest.
      const keep = orgs.filter((org) => !empty.has(org._id));
      if (keep.length === 0) keep.push([...orgs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]);
      const kept = keep[0];
      for (const org of orgs) {
        if (keep.includes(org)) continue;
        if (!kept.leadTrades?.length && org.leadTrades?.length) {
          await ctx.db.patch(kept._id, { leadTrades: org.leadTrades, updatedAt: nowIso() });
          kept.leadTrades = org.leadTrades;
        }
        await switchOffCompany(ctx, org._id);
        removed.push(org.name);
      }
    }
    return { removed };
  }
}

/**
 * One-off fix: the real leads were entered under Picante Painting but belong
 * to Mio Homes, which buys landscaping leads. Moves every non-sample lead
 * from Picante Painting to Mio Homes (dropping links to Picante's clients
 * and estimates), sets Mio Homes' trade, then switches off empty duplicates.
 *
 *   npx convex run seed:moveLeadsToMioHomes
 */
export const moveLeadsToMioHomes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const active = (await ctx.db.query("organizations").take(1000)).filter((org) => org.isActive);
    const named = (name: string) => active.filter((org) => companyNameKey(org.name) === companyNameKey(name));
    const mio = named("Mio Homes")[0];
    if (!mio) throw new Error("Mio Homes not found");
    await ctx.db.patch(mio._id, { leadTrades: ["landscaping"], updatedAt: nowIso() });
    let moved = 0;
    for (const picante of named("Picante Painting")) {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_organization", (q) => q.eq("organizationId", picante._id))
        .collect();
      for (const lead of leads) {
        if (lead.isSample) continue;
        await ctx.db.patch(lead._id, {
          organizationId: mio._id,
          clientId: undefined,
          estimateId: undefined,
          updatedAt: nowIso(),
        });
        if (lead.marketplaceLeadId)
          await ctx.db.patch(lead.marketplaceLeadId, { assignedOrganizationId: mio._id });
        moved++;
      }
    }
    const duplicates = await switchOffEmptyDuplicates(ctx);
    // What's left in each Picante Painting, to see why a copy was kept.
    const picante = [];
    for (const org of named("Picante Painting")) {
      const count = async (table: "clients" | "estimates" | "fundingRequests" | "walletTransactions") =>
        (
          await (ctx.db.query(table) as any)
            .withIndex(table === "estimates" ? "by_organization_and_issue_date" : "by_organization", (q: any) =>
              q.eq("organizationId", org._id),
            )
            .take(1000)
        ).length;
      const current = await ctx.db.get(org._id);
      picante.push({
        active: current?.isActive ?? false,
        clients: await count("clients"),
        estimates: await count("estimates"),
        fundingLinks: await count("fundingRequests"),
        walletEntries: await count("walletTransactions"),
      });
    }
    return { moved, ...duplicates, picante };
  },
});

/**
 * One-off fix: of the two Picante Painting companies, the small one (fewer
 * estimates) was test data. It becomes Myles Webb, the platform admin's own
 * general construction workspace, instead of being deleted.
 *
 *   npx convex run seed:renameTestPicante
 */
export const renameTestPicante = internalMutation({
  args: {},
  handler: async (ctx) => {
    const picantes = (await ctx.db.query("organizations").take(1000)).filter(
      (org) => org.isActive && companyNameKey(org.name) === companyNameKey("Picante Painting"),
    );
    if (picantes.length !== 2) return { renamed: false, picantes: picantes.length };
    const sizes = await Promise.all(
      picantes.map(async (org) => ({
        org,
        estimates: (
          await ctx.db
            .query("estimates")
            .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", org._id))
            .take(1000)
        ).length,
      })),
    );
    sizes.sort((a, b) => a.estimates - b.estimates);
    const small = sizes[0].org;
    await ctx.db.patch(small._id, {
      name: "Myles Webb",
      industryId: "general-construction",
      leadTrades: [],
      updatedAt: nowIso(),
    });
    return { renamed: true, estimates: sizes.map((s) => s.estimates) };
  },
});
