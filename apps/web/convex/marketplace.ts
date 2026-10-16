import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  fail,
  logActivity,
  nowIso,
  pick,
  requireMember,
  requireSuperAdmin,
  requireUser,
} from "./lib/access";
import { createOrganization } from "./lib/organizations";
import { deleteOrganization } from "./lib/cleanup";
import { leadPriceCents, postTransaction } from "./lib/wallet";
import { findCity } from "./leadCity";
import { pendingFundingFor } from "./funding";

// The Lead Market: leads the platform collects and sells, one company per
// lead, paid for from a prepaid dollar balance. Everything here except
// `wallet` and `requestCredit` is for platform admins only.

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long after delivery a company can ask for a bad lead to be credited. */
export const CREDIT_WINDOW_MS = 3 * DAY_MS;
export const CREDIT_REASONS = [
  "wrong_number",
  "out_of_area",
  "not_a_real_job",
  "duplicate",
  "other",
] as const;

const marketplaceLeadFields = {
  name: true,
  phone: true,
  email: true,
  address: true,
  city: true,
  jobType: true,
  source: true,
  notes: true,
};

function cleanLead(data: unknown) {
  const fields = pick(data, marketplaceLeadFields) as Partial<
    Doc<"marketplaceLeads">
  >;
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string") fail("INVALID", `${key} must be text`);
    const trimmed = value.trim();
    if (trimmed) (fields as Record<string, string>)[key] = trimmed;
    else delete (fields as Record<string, string>)[key];
  }
  if (!fields.name) fail("INVALID", "Lead name is required");
  return fields as Partial<Doc<"marketplaceLeads">> & { name: string };
}

function toCents(amount: unknown): number {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents <= 0)
    fail("INVALID", "Enter an amount above $0");
  return cents;
}

// ---- Inbox ----

export const listInbox = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const available = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .order("desc")
      .take(500);
    const sold = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "assigned"))
      .order("desc")
      .take(100);
    const credited = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "credited"))
      .order("desc")
      .take(50);
    const names = new Map<string, string>();
    const withCompany = async (lead: Doc<"marketplaceLeads">) => {
      const orgId = lead.assignedOrganizationId;
      if (orgId && !names.has(orgId))
        names.set(orgId, (await ctx.db.get(orgId))?.name ?? "Unknown company");
      return {
        ...lead,
        price: await leadPriceCents(ctx, lead.jobType),
        companyName: orgId ? names.get(orgId) : undefined,
      };
    };
    return {
      available: await Promise.all(available.map(withCompany)),
      sold: await Promise.all(
        [...sold, ...credited]
          .sort((a, b) =>
            (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""),
          )
          .map(withCompany),
      ),
    };
  },
});

export const createLead = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const user = await requireSuperAdmin(ctx);
    const now = nowIso();
    const id = await ctx.db.insert("marketplaceLeads", {
      ...cleanLead(data),
      status: "available",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

/** Adds many leads at once (e.g. a spreadsheet export). Rows with no name are skipped. */
export const importLeads = mutation({
  args: { leads: v.array(v.any()) },
  handler: async (ctx, { leads }) => {
    const user = await requireSuperAdmin(ctx);
    const now = nowIso();
    let inserted = 0;
    let skipped = 0;
    for (const row of leads.slice(0, 1000)) {
      if (!row || typeof row.name !== "string" || !row.name.trim()) {
        skipped++;
        continue;
      }
      await ctx.db.insert("marketplaceLeads", {
        ...cleanLead(row),
        status: "available",
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    }
    return { inserted, skipped };
  },
});

export const updateLead = mutation({
  args: { id: v.id("marketplaceLeads"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await requireSuperAdmin(ctx);
    const lead = await ctx.db.get(id);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    if (lead.status !== "available")
      fail("INVALID", "This lead was already sent to a company");
    await ctx.db.patch(id, {
      ...cleanLead({ ...lead, ...data }),
      updatedAt: nowIso(),
    });
    return await ctx.db.get(id);
  },
});

export const removeLead = mutation({
  args: { id: v.id("marketplaceLeads") },
  handler: async (ctx, { id }) => {
    await requireSuperAdmin(ctx);
    const lead = await ctx.db.get(id);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    if (lead.status !== "available")
      fail("INVALID", "A lead that was sent to a company can't be deleted");
    await ctx.db.delete(id);
  },
});

/**
 * Sells the lead to one company: it lands in their leads and its price comes
 * off their balance, all in one transaction. A lead can only be sold once.
 */
export const assign = mutation({
  args: {
    leadId: v.id("marketplaceLeads"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { leadId, organizationId }) => {
    const user = await requireSuperAdmin(ctx);
    return await sellLead(ctx, user._id, leadId, organizationId);
  },
});

async function sellLead(
  ctx: MutationCtx,
  userId: Id<"users">,
  leadId: Id<"marketplaceLeads">,
  organizationId: Id<"organizations">,
) {
  const user = { _id: userId };
  {
    const lead = await ctx.db.get(leadId);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    if (lead.status !== "available")
      fail("INVALID", "This lead was already sent to a company");
    const organization = await ctx.db.get(organizationId);
    if (organization === null || !organization.isActive)
      fail("NOT_FOUND", "Company not found");

    const priceCents = await leadPriceCents(ctx, lead.jobType);
    await postTransaction(ctx, organizationId, {
      type: "lead_charge",
      amountCents: -priceCents,
      createdBy: user._id,
      marketplaceLeadId: leadId,
      note: lead.name,
    });
    const now = nowIso();
    const orgLeadId = await ctx.db.insert("leads", {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      city: lead.city,
      jobType: lead.jobType,
      notes: lead.notes,
      source: "FieldQuote Lead",
      status: "new",
      marketplaceLeadId: leadId,
      pricePaidCents: priceCents,
      assignedAt: now,
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(leadId, {
      status: "assigned",
      priceCents,
      assignedOrganizationId: organizationId,
      assignedAt: now,
      orgLeadId,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "lead_delivered",
      resourceType: "lead",
      resourceId: orgLeadId,
      details: { name: lead.name, priceCents },
    });
    const delivered = (await ctx.db.get(orgLeadId))!;
    if (!delivered.city) await findCity(ctx, delivered);
    return { orgLeadId, priceCents };
  }
}

// ---- Money ----

/** Records money a company paid (check, Zelle, card...), plus any bonus for a larger load. */
export const recordTopUp = mutation({
  args: {
    organizationId: v.id("organizations"),
    amount: v.number(),
    bonus: v.optional(v.number()),
    method: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, amount, bonus, method, note }) => {
    const user = await requireSuperAdmin(ctx);
    const amountCents = toCents(amount);
    let balance = await postTransaction(ctx, organizationId, {
      type: "top_up",
      amountCents,
      createdBy: user._id,
      method: method?.trim() || undefined,
      note: note?.trim() || undefined,
    });
    if (bonus) {
      balance = await postTransaction(ctx, organizationId, {
        type: "bonus",
        amountCents: toCents(bonus),
        createdBy: user._id,
        note: "Bonus",
      });
    }
    return { balanceCents: balance };
  },
});

/** Approves or denies a company's request to credit a bad lead. Approval refunds what they paid. */
export const reviewCredit = mutation({
  args: { orgLeadId: v.id("leads"), approve: v.boolean() },
  handler: async (ctx, { orgLeadId, approve }) => {
    const user = await requireSuperAdmin(ctx);
    const lead = await ctx.db.get(orgLeadId);
    if (lead === null || !lead.marketplaceLeadId)
      fail("NOT_FOUND", "Lead not found");
    if (lead.creditRequest?.status !== "pending")
      fail("INVALID", "There's no open credit request for this lead");
    const now = nowIso();
    if (approve) {
      await postTransaction(ctx, lead.organizationId, {
        type: "credit",
        amountCents: lead.pricePaidCents ?? 0,
        createdBy: user._id,
        marketplaceLeadId: lead.marketplaceLeadId,
        note: `Credit: ${lead.name}`,
      });
      await ctx.db.patch(lead.marketplaceLeadId, {
        status: "credited",
        updatedAt: now,
      });
    }
    await ctx.db.patch(orgLeadId, {
      creditRequest: {
        ...lead.creditRequest,
        status: approve ? "approved" : "denied",
        reviewedAt: now,
      },
      updatedAt: now,
    });
  },
});

// ---- Prices ----

export const listLeadPrices = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const rows = await ctx.db.query("leadPrices").take(500);
    return { defaultCents: await leadPriceCents(ctx, undefined), prices: rows };
  },
});

/** Sets what a lead costs for a trade (`jobType` "default" for every other trade). */
export const setLeadPrice = mutation({
  args: { jobType: v.string(), price: v.union(v.number(), v.null()) },
  handler: async (ctx, { jobType, price }) => {
    await requireSuperAdmin(ctx);
    const existing = await ctx.db
      .query("leadPrices")
      .withIndex("by_job_type", (q) => q.eq("jobType", jobType))
      .unique();
    if (price === null) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    const priceCents = toCents(price);
    if (existing)
      await ctx.db.patch(existing._id, { priceCents, updatedAt: nowIso() });
    else
      await ctx.db.insert("leadPrices", {
        jobType,
        priceCents,
        updatedAt: nowIso(),
      });
  },
});

// ---- Companies ----

/** Every company with its balance and how its leads are doing. */
export const companiesOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const organizations = (
      await ctx.db.query("organizations").order("desc").take(500)
    ).filter((o) => o.isActive);
    return await Promise.all(
      organizations.map(async (org) => {
        const sold = await ctx.db
          .query("marketplaceLeads")
          .withIndex("by_organization", (q) =>
            q.eq("assignedOrganizationId", org._id),
          )
          .take(2000);
        const recent = sold.filter((lead) => (lead.assignedAt ?? "") >= since);
        const orgLeads = await Promise.all(
          sold.map((lead) =>
            lead.orgLeadId ? ctx.db.get(lead.orgLeadId) : null,
          ),
        );
        const roi = await returnOn(ctx, orgLeads);
        const invite = await ctx.db
          .query("companyInvites")
          .filter((q) => q.eq(q.field("organizationId"), org._id))
          .first();
        return {
          id: org._id,
          name: org.name,
          email: org.email,
          phone: org.phone,
          city: org.city,
          leadTrades: org.leadTrades ?? [],
          balanceCents: org.walletBalanceCents ?? 0,
          leads30d: recent.length,
          spent30dCents: recent
            .filter((l) => l.status !== "credited")
            .reduce((sum, l) => sum + (l.priceCents ?? 0), 0),
          leadsTotal: sold.length,
          wonCents: roi.wonCents,
          wonCount: roi.wonCount,
          pendingCredits: orgLeads.filter(
            (l) => l?.creditRequest?.status === "pending",
          ).length,
          invitePending:
            invite !== null && !invite.acceptedAt ? invite.email : undefined,
          isSample: org.isSample === true,
        };
      }),
    );
  },
});

/** What a company's bought leads turned into: won leads and accepted estimates, in cents. */
async function returnOn(
  ctx: Parameters<typeof leadPriceCents>[0],
  leads: Array<Doc<"leads"> | null>,
) {
  let wonCents = 0;
  let wonCount = 0;
  for (const lead of leads) {
    if (!lead) continue;
    const estimate = lead.estimateId ? await ctx.db.get(lead.estimateId) : null;
    const accepted = estimate?.status === "accepted";
    if (lead.status !== "won" && !accepted) continue;
    wonCount++;
    wonCents += Math.round(
      ((accepted ? estimate!.totalAmount : undefined) ??
        lead.estimatedValue ??
        estimate?.totalAmount ??
        0) * 100,
    );
  }
  return { wonCents, wonCount };
}

/**
 * Sets up a company for a contractor who hasn't signed up yet. When they
 * sign up with `ownerEmail` they become its owner instead of getting a new
 * empty company.
 */
export const createCompany = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const user = await requireSuperAdmin(ctx);
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    if (!name) fail("INVALID", "Company name is required");
    const ownerEmail =
      typeof data?.ownerEmail === "string"
        ? data.ownerEmail.trim().toLowerCase()
        : "";
    if (ownerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail))
      fail("INVALID", "Enter a valid owner email");
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : undefined;
    const organizationId = await createOrganization(ctx, {
      name,
      email: text(data.email) ?? (ownerEmail || undefined),
      phone: text(data.phone),
      city: text(data.city),
      state: text(data.state),
      leadTrades: Array.isArray(data.leadTrades)
        ? data.leadTrades.filter((t: unknown) => typeof t === "string")
        : [],
      walletBalanceCents: 0,
    });
    if (ownerEmail) {
      const existingUser = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", ownerEmail))
        .unique();
      if (existingUser) {
        await ctx.db.insert("memberships", {
          organizationId,
          userId: existingUser._id,
          role: "owner",
          createdAt: nowIso(),
        });
      } else {
        await ctx.db.insert("companyInvites", {
          organizationId,
          email: ownerEmail,
          createdAt: nowIso(),
        });
      }
    }
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "organization",
      resourceId: organizationId,
      details: { name },
    });
    return await ctx.db.get(organizationId);
  },
});

/** Changes which trades a company buys leads for. */
export const setCompanyTrades = mutation({
  args: {
    organizationId: v.id("organizations"),
    leadTrades: v.array(v.string()),
  },
  handler: async (ctx, { organizationId, leadTrades }) => {
    await requireSuperAdmin(ctx);
    await ctx.db.patch(organizationId, { leadTrades, updatedAt: nowIso() });
  },
});

// ---- The company's side ----

/** A company's balance, history and what its leads earned it. */
export const wallet = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { organization } = await requireMember(ctx, organizationId);
    const transactions = await ctx.db
      .query("walletTransactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(50);
    const bought = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_organization", (q) =>
        q.eq("assignedOrganizationId", organizationId),
      )
      .take(2000);
    const orgLeads = await Promise.all(
      bought.map((lead) =>
        lead.orgLeadId ? ctx.db.get(lead.orgLeadId) : null,
      ),
    );
    const roi = await returnOn(ctx, orgLeads);
    const prices = await ctx.db.query("leadPrices").take(500);
    const trades = organization.leadTrades ?? [];
    const relevant = prices
      .filter((p) => trades.includes(p.jobType))
      .map((p) => p.priceCents);
    return {
      balanceCents: organization.walletBalanceCents ?? 0,
      // What a typical lead costs this company, for "about N leads".
      typicalLeadCents: relevant.length
        ? Math.round(relevant.reduce((a, b) => a + b, 0) / relevant.length)
        : await leadPriceCents(ctx, undefined),
      spentCents: bought
        .filter((l) => l.status === "assigned")
        .reduce((sum, l) => sum + (l.priceCents ?? 0), 0),
      leadsBought: bought.length,
      ...roi,
      pendingFunding: await pendingFundingFor(ctx, organizationId),
      availableLeads: (
        await ctx.db
          .query("marketplaceLeads")
          .withIndex("by_status", (q) => q.eq("status", "available"))
          .take(500)
      ).length,
      transactions: transactions.map((t) => ({
        id: t._id,
        type: t.type,
        amountCents: t.amountCents,
        balanceAfterCents: t.balanceAfterCents,
        method: t.method,
        note: t.note,
        createdAt: t.createdAt,
      })),
    };
  },
});

/**
 * Leads a company can buy: the trade, town and what the job is, with the
 * homeowner's contact details held back until they buy it. Their own trades
 * come first.
 */
export const feed = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { organization } = await requireMember(ctx, organizationId);
    const trades = organization.leadTrades ?? [];
    const available = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .order("desc")
      .take(200);
    const leads = await Promise.all(
      available.map(async (lead) => ({
        id: lead._id,
        jobType: lead.jobType,
        tradeName: lead.jobType
          ? (
              await ctx.db
                .query("industries")
                .withIndex("by_slug", (q) => q.eq("slug", lead.jobType!))
                .first()
            )?.name
          : undefined,
        city: lead.city,
        summary: lead.notes,
        priceCents: await leadPriceCents(ctx, lead.jobType),
        postedAt: lead.createdAt,
        matchesTrades: Boolean(lead.jobType && trades.includes(lead.jobType)),
      })),
    );
    return leads.sort(
      (a, b) => Number(b.matchesTrades) - Number(a.matchesTrades),
    );
  },
});

/** A company buys a lead from the feed: paid from its balance, and it's theirs alone. */
export const buy = mutation({
  args: {
    leadId: v.id("marketplaceLeads"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { leadId, organizationId }) => {
    const { user } = await requireMember(ctx, organizationId, "admin");
    const lead = await ctx.db.get(leadId);
    if (lead === null || lead.status !== "available")
      fail("INVALID", "Someone just bought this lead");
    return await sellLead(ctx, user._id, leadId, organizationId);
  },
});

/** A company asks for a bad lead to be credited back (within 3 days of getting it). */
export const requestCredit = mutation({
  args: {
    leadId: v.id("leads"),
    reason: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { leadId, reason, note }) => {
    const user = await requireUser(ctx);
    const lead = await ctx.db.get(leadId);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    await requireMember(ctx, lead.organizationId);
    if (!lead.marketplaceLeadId)
      fail("INVALID", "Only leads bought from FieldQuote can be credited");
    if (lead.creditRequest)
      fail("INVALID", "A credit was already requested for this lead");
    if (!(CREDIT_REASONS as readonly string[]).includes(reason))
      fail("INVALID", "Pick a reason");
    const deliveredAt = Date.parse(lead.assignedAt ?? lead.createdAt);
    if (Date.now() - deliveredAt > CREDIT_WINDOW_MS)
      fail(
        "INVALID",
        "Credits can be requested within 3 days of getting the lead",
      );
    const now = nowIso();
    await ctx.db.patch(leadId, {
      creditRequest: {
        reason,
        note: note?.trim() || undefined,
        requestedAt: now,
        status: "pending",
      },
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId: lead.organizationId,
      userId: user._id,
      action: "credit_requested",
      resourceType: "lead",
      resourceId: leadId,
      details: { name: lead.name, reason },
    });
  },
});

/** Open credit requests across every company, for the admin to review. */
export const pendingCredits = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const credited = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "assigned"))
      .take(2000);
    const rows = await Promise.all(
      credited.map(async (lead) => {
        const orgLead = lead.orgLeadId
          ? await ctx.db.get(lead.orgLeadId)
          : null;
        if (orgLead?.creditRequest?.status !== "pending") return null;
        const org = await ctx.db.get(orgLead.organizationId);
        return {
          orgLeadId: orgLead._id as Id<"leads">,
          name: orgLead.name,
          companyName: org?.name ?? "",
          organizationId: orgLead.organizationId,
          priceCents: orgLead.pricePaidCents ?? 0,
          ...orgLead.creditRequest,
        };
      }),
    );
    return rows.filter((r) => r !== null);
  },
});

// ---- Demo data ----

const DEMO_COMPANIES: Array<{
  name: string;
  phone: string;
  email: string;
  city: string;
  leadTrades: string[];
  payment: number;
  bonus?: number;
  method: string;
}> = [
  {
    name: "Permian Roofing & Exteriors",
    phone: "(432) 555-0142",
    email: "office@permianroofing.example",
    city: "Midland",
    leadTrades: ["roofing"],
    payment: 1000,
    bonus: 100,
    method: "Zelle",
  },
  {
    name: "Basin Paint Co.",
    phone: "(432) 555-0178",
    email: "jobs@basinpaint.example",
    city: "Odessa",
    leadTrades: ["painting"],
    payment: 500,
    bonus: 25,
    method: "Check",
  },
  {
    name: "West Texas Plumbing Pros",
    phone: "(432) 555-0119",
    email: "dispatch@wtxplumbing.example",
    city: "Midland",
    leadTrades: ["plumbing"],
    payment: 250,
    method: "Card",
  },
  {
    name: "Desert Air HVAC",
    phone: "(432) 555-0163",
    email: "service@desertairhvac.example",
    city: "Odessa",
    leadTrades: ["hvac"],
    payment: 500,
    bonus: 25,
    method: "Zelle",
  },
  {
    name: "Lone Star Concrete",
    phone: "(432) 555-0187",
    email: "bids@lonestarconcrete.example",
    city: "Big Spring",
    leadTrades: ["concrete"],
    payment: 0,
    method: "Zelle",
  },
  {
    name: "Midland Handyman Services",
    phone: "(432) 555-0131",
    email: "hello@midlandhandyman.example",
    city: "Midland",
    leadTrades: ["handyman"],
    payment: 150,
    method: "Cash",
  },
];

const DEMO_PRICES: Record<string, number> = {
  default: 45,
  roofing: 85,
  hvac: 65,
  concrete: 60,
  plumbing: 45,
  painting: 35,
  handyman: 25,
};

// [name, phone, address, city, trade, what they need]
const DEMO_LEADS: Array<[string, string, string, string, string, string]> = [
  [
    "Jane Cole",
    "(432) 555-2210",
    "4107 Shell Ave",
    "Midland",
    "roofing",
    "Hail damage from last week's storm. Insurance adjuster already came out; wants a full replacement quote.",
  ],
  [
    "Marcus Reyes",
    "(432) 555-2264",
    "2915 E 18th St",
    "Odessa",
    "painting",
    "Exterior repaint, 2-story brick and siding, about 2,400 sq ft. Wants it done before Thanksgiving.",
  ],
  [
    "Dana Whitfield",
    "(432) 555-2231",
    "1802 Princeton Ave",
    "Midland",
    "plumbing",
    "50-gallon gas water heater leaking from the bottom. Needs replacement this week.",
  ],
  [
    "Luis Ortega",
    "(432) 555-2290",
    "3610 N Dixie Blvd",
    "Odessa",
    "hvac",
    "Upstairs AC blowing warm. Unit is 14 years old; open to replacing it.",
  ],
  [
    "Brenda Haskins",
    "(432) 555-2207",
    "906 W Ohio Ave",
    "Midland",
    "concrete",
    "Cracked driveway, about 20x40 ft. Wants tear-out and a new pour, possibly stamped.",
  ],
  [
    "Kevin Tran",
    "(432) 555-2248",
    "5201 Cimmaron Ave",
    "Midland",
    "handyman",
    "Fence gate repair, two interior doors rehung, and a ceiling fan installed.",
  ],
  [
    "Rachel Monroe",
    "(432) 555-2275",
    "1213 Andrews Hwy",
    "Midland",
    "roofing",
    "Small leak over the garage after rain. Wants an inspection and repair estimate.",
  ],
  [
    "Tony Delgado",
    "(432) 555-2216",
    "2401 Kermit Hwy",
    "Odessa",
    "painting",
    "Interior repaint, whole house, about 1,800 sq ft. Moving in next month.",
  ],
  [
    "Sharon Pike",
    "(432) 555-2253",
    "4408 Neely Ave",
    "Midland",
    "plumbing",
    "Slow drains in two bathrooms and a running toilet.",
  ],
  [
    "Gary Lindsey",
    "(432) 555-2299",
    "711 E Pecan St",
    "Big Spring",
    "hvac",
    "Wants a quote for a new 3-ton heat pump before winter.",
  ],
];

// Already sold: [lead index, company index, the company's progress, job value if won]
const DEMO_SALES: Array<[number, number, Doc<"leads">["status"], number?]> = [
  [0, 0, "won", 18500],
  [1, 1, "quoted"],
  [3, 3, "won", 7200],
  [5, 5, "contacted"],
];

/** Fills an empty Lead Market with realistic demo companies and leads, all removable. */
export const addDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireSuperAdmin(ctx);
    if (
      (await ctx.db
        .query("organizations")
        .filter((q) => q.eq(q.field("isSample"), true))
        .first()) !== null
    ) {
      fail("INVALID", "Demo companies are already here");
    }
    const now = nowIso();
    // Typical prices by trade, only if none have been set yet.
    if ((await ctx.db.query("leadPrices").first()) === null) {
      for (const [jobType, dollars] of Object.entries(DEMO_PRICES)) {
        await ctx.db.insert("leadPrices", {
          jobType,
          priceCents: dollars * 100,
          updatedAt: now,
        });
      }
    }
    const companyIds: Id<"organizations">[] = [];
    for (const company of DEMO_COMPANIES) {
      const id = await createOrganization(ctx, {
        name: company.name,
        phone: company.phone,
        email: company.email,
        city: company.city,
        state: "TX",
        leadTrades: company.leadTrades,
        walletBalanceCents: 0,
        isSample: true,
      });
      if (company.payment > 0) {
        await postTransaction(ctx, id, {
          type: "top_up",
          amountCents: company.payment * 100,
          createdBy: user._id,
          method: company.method,
        });
      }
      if (company.bonus) {
        await postTransaction(ctx, id, {
          type: "bonus",
          amountCents: company.bonus * 100,
          createdBy: user._id,
          note: "Bonus",
        });
      }
      companyIds.push(id);
    }
    const leadIds: Id<"marketplaceLeads">[] = [];
    for (const [name, phone, address, city, jobType, notes] of DEMO_LEADS) {
      leadIds.push(
        await ctx.db.insert("marketplaceLeads", {
          name,
          phone,
          address,
          city,
          jobType,
          notes,
          source: "Demo",
          status: "available",
          isSample: true,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    for (const [leadIndex, companyIndex, status, value] of DEMO_SALES) {
      const { orgLeadId } = await sellLead(
        ctx,
        user._id,
        leadIds[leadIndex],
        companyIds[companyIndex],
      );
      await ctx.db.patch(orgLeadId, {
        status,
        ...(value ? { estimatedValue: value } : {}),
      });
    }
    return { companies: companyIds.length, leads: leadIds.length };
  },
});

/** Removes every demo company and demo lead, with their balances and history. */
export const removeDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const companies = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("isSample"), true))
      .collect();
    const leads = await ctx.db
      .query("marketplaceLeads")
      .filter((q) => q.eq(q.field("isSample"), true))
      .collect();
    for (const lead of leads) await ctx.db.delete(lead._id);
    for (const company of companies) await deleteOrganization(ctx, company._id);
    return { companies: companies.length, leads: leads.length };
  },
});
