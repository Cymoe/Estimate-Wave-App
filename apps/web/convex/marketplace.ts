import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  fail,
  logActivity,
  nowIso,
  pick,
  requireMember,
  requireMemberOrStaff,
  requireStaff,
  requireSuperAdmin,
  requireUser,
} from "./lib/access";
import { createOrganization } from "./lib/organizations";
import { deleteOrganization } from "./lib/cleanup";
import {
  auctionFor,
  leadPriceCents,
  pricingFor,
  postTransaction,
  dollars,
  typicalLeadCents,
} from "./lib/wallet";
import {
  MIN_START_CENTS,
  fillTimeMs,
  priceAt,
  pricingFor as pricingFrom,
} from "./lib/auction";
import { tellCompany } from "./notify";
import { requireSameWorld, sameWorld, sellLead } from "./lib/sales";
import { listLead } from "./lib/awards";
import { deleteDemoIntake } from "./intake";
import { dropBidsOutsideTrades, outbidUnseen } from "./lib/standing";
import { knownTrades } from "./industries";
import {
  OLDER_AFTER_DAYS,
  type Plan,
  claimPrice,
  claimsLeft,
  nextMonth,
  planIsActive,
  trialPlan,
} from "./lib/plan";
import { countyForTown, normalizeCounty, TEXAS_COUNTIES } from "./lib/counties";

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
  county: true,
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
  if (fields.county) {
    const county = normalizeCounty(fields.county);
    if (!county || !TEXAS_COUNTIES.includes(county))
      fail("INVALID", `${fields.county} isn't a Texas county`);
    fields.county = county;
  }
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
    await requireStaff(ctx);
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
    const older = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "older"))
      .order("desc")
      .take(200);
    const names = new Map<string, string>();
    const withCompany = async (lead: Doc<"marketplaceLeads">) => {
      const orgId = lead.assignedOrganizationId;
      if (orgId && !names.has(orgId))
        names.set(orgId, (await ctx.db.get(orgId))?.name ?? "Unknown company");
      const auction = await auctionFor(ctx, lead);
      const now = priceAt(auction, Date.now());
      const leadBids = await ctx.db
        .query("leadBids")
        .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", lead._id))
        .collect();
      const openOrders =
        lead.status === "available"
          ? leadBids.filter((b) => b.status === "open").length
          : 0;
      const wonBy = leadBids.find((b) => b.status === "filled");
      return {
        ...lead,
        price:
          lead.status === "available"
            ? now.priceCents
            : (lead.priceCents ?? now.priceCents),
        auction,
        floorCents: auction.floorCents,
        floorAt: new Date(now.floorAtMs).toISOString(),
        openBids: openOrders,
        // How a sold lead went: to a standing bid, a buy order, or by hand/Buy now.
        wonBy: wonBy
          ? wonBy.kind === "order"
            ? ("order" as const)
            : ("bid" as const)
          : undefined,
        companyName: orgId ? names.get(orgId) : undefined,
      };
    };
    return {
      available: await Promise.all(available.map(withCompany)),
      older: await Promise.all(older.map(withCompany)),
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
    const user = await requireStaff(ctx);
    const id = await listLead(ctx, cleanLead(data), user._id);
    return await ctx.db.get(id);
  },
});

/** Adds many leads at once (e.g. a spreadsheet export). Rows with no name are skipped. */
export const importLeads = mutation({
  args: { leads: v.array(v.any()) },
  handler: async (ctx, { leads }) => {
    const user = await requireStaff(ctx);
    let inserted = 0;
    let skipped = 0;
    for (const row of leads.slice(0, 1000)) {
      if (!row || typeof row.name !== "string" || !row.name.trim()) {
        skipped++;
        continue;
      }
      await listLead(ctx, cleanLead(row), user._id);
      inserted++;
    }
    return { inserted, skipped };
  },
});

export const updateLead = mutation({
  args: { id: v.id("marketplaceLeads"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await requireStaff(ctx);
    const lead = await ctx.db.get(id);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    if (lead.status !== "available" && lead.status !== "older")
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
    await requireStaff(ctx);
    const lead = await ctx.db.get(id);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    if (lead.status === "bidding")
      fail("INVALID", "This lead is in a bidding round; wait for it to close");
    if (
      lead.status !== "available" &&
      lead.status !== "older" &&
      lead.status !== "archived"
    )
      fail("INVALID", "A lead that was sent to a company can't be deleted");
    // Companies with a buy order on it see it closed, not left open on a lead that's gone.
    await loseOpenOrders(ctx, id, "Lead removed");
    await ctx.db.delete(id);
  },
});

/**
 * A platform admin confirms a lead with the homeowner (a call), with a line
 * on what they said. Doing it again re-confirms: the date moves. Companies
 * see the date and the line in the Marketplace, the Vault and their Leads.
 */
export const verifyLead = mutation({
  args: { id: v.id("marketplaceLeads"), note: v.optional(v.string()) },
  handler: async (ctx, { id, note }) => {
    const user = await requireStaff(ctx);
    const lead = await ctx.db.get(id);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    if (lead.status !== "available" && lead.status !== "older")
      fail("INVALID", "Only a lead for sale or in the Vault can be confirmed");
    const now = nowIso();
    await ctx.db.patch(id, {
      verified: { at: now, note: note?.trim() || undefined, by: user._id },
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

/** Takes a confirmation back (a mistake). */
export const clearVerified = mutation({
  args: { id: v.id("marketplaceLeads") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    if ((await ctx.db.get(id)) === null) fail("NOT_FOUND", "Lead not found");
    await ctx.db.patch(id, { verified: undefined, updatedAt: nowIso() });
  },
});


/** Marks every open buy order on a lead lost, with the reason. */
async function loseOpenOrders(
  ctx: MutationCtx,
  leadId: Id<"marketplaceLeads">,
  outcome: string,
) {
  const bids = await ctx.db
    .query("leadBids")
    .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", leadId))
    .collect();
  for (const bid of bids)
    if (bid.status === "open")
      await ctx.db.patch(bid._id, {
        status: "lost",
        outcome,
        resolvedAt: nowIso(),
      });
}

/**
 * Hourly: Marketplace leads nobody bought in a week move to the Vault,
 * where companies on the plan can claim them. They stay there until
 * someone does: nothing is archived. A lead archived before that rule
 * goes back into the Vault.
 */
export const ageLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const now = nowIso();
    const listedMs = (lead: Doc<"marketplaceLeads">) =>
      Date.parse(lead.auction?.listedAt ?? lead.createdAt);
    let moved = 0;
    let restored = 0;
    const available = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .take(500);
    for (const lead of available) {
      if (listedMs(lead) > nowMs - OLDER_AFTER_DAYS * DAY_MS) continue;
      await loseOpenOrders(ctx, lead._id, "Lead moved to the Vault");
      await ctx.db.patch(lead._id, { status: "older", updatedAt: now });
      moved++;
    }
    const archived = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "archived"))
      .take(500);
    for (const lead of archived) {
      await ctx.db.patch(lead._id, { status: "older", updatedAt: now });
      restored++;
    }
    return { moved, restored };
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
    const user = await requireStaff(ctx);
    const lead = await ctx.db.get(leadId);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    return await sellLead(ctx, user._id, leadId, organizationId, {
      priceCents: await leadPriceCents(ctx, lead),
      via: "sent",
    });
  },
});

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

/** Puts what the company paid for a lead back on its balance and marks the lead credited. */
async function applyCredit(ctx: MutationCtx, lead: Doc<"leads"> & { marketplaceLeadId: Id<"marketplaceLeads"> }, user: Doc<"users">, now: string) {
  // A claim included in the plan cost nothing, so there's no money to give back.
  if ((lead.pricePaidCents ?? 0) > 0)
    await postTransaction(ctx, lead.organizationId, {
      type: "credit",
      amountCents: lead.pricePaidCents!,
      createdBy: user._id,
      marketplaceLeadId: lead.marketplaceLeadId,
      note: `Credit: ${lead.name}`,
    });
  // A bad Vault lead gives its claim back to this month's allowance.
  if (lead.wonVia === "claim") {
    const organization = await ctx.db.get(lead.organizationId);
    const plan = organization?.plan;
    if (plan && lead.createdAt >= plan.periodStart && plan.claimsThisPeriod > 0)
      await ctx.db.patch(lead.organizationId, {
        plan: { ...plan, claimsThisPeriod: plan.claimsThisPeriod - 1 },
        updatedAt: now,
      });
  }
  await ctx.db.patch(lead.marketplaceLeadId, {
    status: "credited",
    updatedAt: now,
  });
}

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
    if (approve) await applyCredit(ctx, { ...lead, marketplaceLeadId: lead.marketplaceLeadId }, user, now);
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

/**
 * The owner credits a bad lead without waiting for a request: companies
 * tell FieldQuote by phone, and this is where it lands. Refunds what they
 * paid, once, and shows on the company's lead as "Credited".
 */
export const creditLead = mutation({
  args: { orgLeadId: v.id("leads"), reason: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { orgLeadId, reason, note }) => {
    const user = await requireSuperAdmin(ctx);
    const lead = await ctx.db.get(orgLeadId);
    if (lead === null || !lead.marketplaceLeadId) fail("NOT_FOUND", "Lead not found");
    if (lead.creditRequest?.status === "approved") fail("INVALID", "This lead was already credited");
    if (!(CREDIT_REASONS as readonly string[]).includes(reason)) fail("INVALID", "Pick a reason");
    const now = nowIso();
    await applyCredit(ctx, { ...lead, marketplaceLeadId: lead.marketplaceLeadId }, user, now);
    await ctx.db.patch(orgLeadId, {
      creditRequest: {
        reason,
        note: note?.trim() || undefined,
        requestedAt: lead.creditRequest?.requestedAt ?? now,
        status: "approved",
        reviewedAt: now,
      },
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId: lead.organizationId,
      userId: user._id,
      action: "credit_given",
      resourceType: "lead",
      resourceId: orgLeadId,
      details: { name: lead.name, reason, amountCents: lead.pricePaidCents ?? 0 },
    });
    return { amountCents: lead.pricePaidCents ?? 0 };
  },
});

// ---- Prices ----

export const listLeadPrices = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("leadPrices").take(500);
    const defaults = await pricingFor(ctx, undefined);
    return {
      defaultCents: defaults.startCents,
      default: defaults,
      prices: rows.map((row) => ({ ...row, pricing: pricingFrom(row) })),
    };
  },
});

/**
 * Sets what a lead costs for a trade (`jobType` "default" for every other
 * trade): the start price, and optionally the floor it drops to, the step
 * and how often it drops. Blank schedule fields use the defaults.
 */
export const setLeadPrice = mutation({
  args: {
    jobType: v.string(),
    price: v.union(v.number(), v.null()),
    floor: v.optional(v.union(v.number(), v.null())),
    drop: v.optional(v.union(v.number(), v.null())),
    dropEveryMinutes: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { jobType, price, floor, drop, dropEveryMinutes }) => {
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
    if (priceCents < MIN_START_CENTS)
      fail("INVALID", `Leads start at ${dollars(MIN_START_CENTS)} or more`);
    const floorCents = floor == null ? undefined : toCents(floor);
    if (floorCents !== undefined && floorCents > priceCents)
      fail("INVALID", "The floor can't be above the start price");
    const dropCents = drop == null ? undefined : toCents(drop);
    const every =
      dropEveryMinutes == null ? undefined : Math.round(dropEveryMinutes);
    if (every !== undefined && every < 1)
      fail("INVALID", "Drops must be at least a minute apart");
    const row = {
      priceCents,
      floorCents,
      dropCents,
      dropEveryMinutes: every,
      updatedAt: nowIso(),
    };
    if (existing) await ctx.db.replace(existing._id, { jobType, ...row });
    else await ctx.db.insert("leadPrices", { jobType, ...row });
  },
});

// ---- Companies ----

/** Every company with its balance and how its leads are doing. */
export const companiesOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
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
          .filter((q) =>
            q.and(
              q.eq(q.field("organizationId"), org._id),
              q.eq(q.field("acceptedAt"), undefined),
            ),
          )
          .first();
        const standing = await ctx.db
          .query("standingBids")
          .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
          .collect();
        return {
          id: org._id,
          name: org.name,
          email: org.email,
          phone: org.phone,
          city: org.city,
          leadTrades: org.leadTrades ?? [],
          plan: org.plan ? planSummary(org.plan, Date.now()) : null,
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
          invitePending: invite?.email,
          owners: await ownerEmails(ctx, org._id),
          isSample: org.isSample === true,
          isEmpty: await isEmptyCompany(ctx, org),
          standingBids: standing.map((b) => ({
            county: b.county,
            jobType: b.jobType,
            amountCents: b.amountCents,
          })),
          sampleBids: standing.filter((b) => b.isSample).length,
          // The latest payment link and how far the payer got with it.
          fundingLink: await (async () => {
            const link = await ctx.db
              .query("fundingRequests")
              .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
              .order("desc")
              .first();
            return link
              ? {
                  status: link.status,
                  amountCents: link.amountCents,
                  createdAt: link.createdAt,
                  confirmedAt: link.confirmedAt,
                }
              : null;
          })(),
        };
      }),
    );
  },
});

/** Emails of the people who own a company. */
async function ownerEmails(ctx: QueryCtx, organizationId: Id<"organizations">) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const owners = await Promise.all(
    memberships
      .filter((m) => m.role === "owner")
      .map((m) => ctx.db.get(m.userId)),
  );
  return owners.flatMap((u) => (u?.email ? [u.email] : []));
}

/** What a company's bought leads turned into: won leads and accepted estimates, in cents. */
async function returnOn(
  ctx: QueryCtx | MutationCtx,
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
    const organizationId = await createCompanyFor(ctx, user, data);
    return await ctx.db.get(organizationId);
  },
});

/** The company a super admin sets up by hand, or approves from an application. */
export async function createCompanyFor(
  ctx: MutationCtx,
  user: Doc<"users">,
  data: {
    name?: unknown;
    ownerEmail?: unknown;
    email?: unknown;
    phone?: unknown;
    city?: unknown;
    state?: unknown;
    leadTrades?: unknown;
  },
): Promise<Id<"organizations">> {
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!name) fail("INVALID", "Company name is required");
  const ownerEmail =
    typeof data?.ownerEmail === "string"
      ? data.ownerEmail.trim().toLowerCase()
      : "";
  if (ownerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail))
    fail("INVALID", "Enter a valid owner email");
  const key = companyNameKey(name);
  const taken = (
    await ctx.db.query("organizations").order("desc").take(500)
  ).find((org) => org.isActive && companyNameKey(org.name) === key);
  if (taken) fail("INVALID", `A company named ${taken.name} already exists`);
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const organizationId = await createOrganization(ctx, {
    name,
    email: text(data.email) ?? (ownerEmail || undefined),
    phone: text(data.phone),
    city: text(data.city),
    state: text(data.state),
    leadTrades: Array.isArray(data.leadTrades)
      ? await knownTrades(ctx, data.leadTrades.filter((t: unknown): t is string => typeof t === "string"))
      : [],
    walletBalanceCents: 0,
  });
  if (ownerEmail) await addOwner(ctx, organizationId, ownerEmail);
  await logActivity(ctx, {
    organizationId,
    userId: user._id,
    action: "created",
    resourceType: "organization",
    resourceId: organizationId,
    details: { name },
  });
  return organizationId;
}

/**
 * Makes the person with `email` an owner of the company: right away if they
 * have an account, otherwise when they sign up (replacing any earlier invite).
 */
async function addOwner(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  email: string,
) {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .unique();
  const invites = await ctx.db
    .query("companyInvites")
    .filter((q) => q.eq(q.field("organizationId"), organizationId))
    .collect();
  for (const invite of invites)
    if (!invite.acceptedAt) await ctx.db.delete(invite._id);
  if (existingUser) {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_organization_and_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", existingUser._id),
      )
      .unique();
    if (membership) await ctx.db.patch(membership._id, { role: "owner" });
    else
      await ctx.db.insert("memberships", {
        organizationId,
        userId: existingUser._id,
        role: "owner",
        createdAt: nowIso(),
      });
    return "added" as const;
  }
  await ctx.db.insert("companyInvites", {
    organizationId,
    email,
    createdAt: nowIso(),
  });
  return "invited" as const;
}

/** Sets who owns a company set up in the Lead Market (see `addOwner`). */
export const setCompanyOwner = mutation({
  args: { organizationId: v.id("organizations"), email: v.string() },
  handler: async (ctx, { organizationId, email }) => {
    await requireSuperAdmin(ctx);
    const org = await ctx.db.get(organizationId);
    if (!org || !org.isActive) fail("NOT_FOUND", "Company not found");
    const ownerEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail))
      fail("INVALID", "Enter a valid owner email");
    return await addOwner(ctx, organizationId, ownerEmail);
  },
});

/** Company names compared ignoring case and spacing. */
export const companyNameKey = (name: string) =>
  name.toLowerCase().replace(/\s+/g, " ").trim();

/** True when a company has nothing in it: no leads, clients, estimates or money. */
export async function isEmptyCompany(
  ctx: QueryCtx,
  org: Doc<"organizations">,
): Promise<boolean> {
  if ((org.walletBalanceCents ?? 0) !== 0) return false;
  const byOrg = (q: any) => q.eq("organizationId", org._id);
  const found = await Promise.all([
    ctx.db
      .query("marketplaceLeads")
      .withIndex("by_organization", (q) =>
        q.eq("assignedOrganizationId", org._id),
      )
      .first(),
    ctx.db
      .query("walletTransactions")
      .withIndex("by_organization", byOrg)
      .first(),
    ctx.db.query("fundingRequests").withIndex("by_organization", byOrg).first(),
    ctx.db.query("leads").withIndex("by_organization", byOrg).first(),
    ctx.db.query("clients").withIndex("by_organization", byOrg).first(),
    ctx.db
      .query("estimates")
      .withIndex("by_organization_and_issue_date", byOrg)
      .first(),
  ]);
  return found.every((doc) => doc === null);
}

/** Hides a company and drops its open owner invites, so no signup lands in it. */
export async function switchOffCompany(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
) {
  await ctx.db.patch(organizationId, { isActive: false, updatedAt: nowIso() });
  const invites = await ctx.db
    .query("companyInvites")
    .filter((q) => q.eq(q.field("organizationId"), organizationId))
    .collect();
  for (const invite of invites)
    if (!invite.acceptedAt) await ctx.db.delete(invite._id);
}

/**
 * Hides a company made by mistake (e.g. a duplicate). Only empty companies
 * can be removed; the record is kept, just switched off.
 */
export const removeCompany = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const user = await requireSuperAdmin(ctx);
    const org = await ctx.db.get(organizationId);
    if (!org || !org.isActive) fail("NOT_FOUND", "Company not found");
    if (!(await isEmptyCompany(ctx, org)))
      fail(
        "INVALID",
        "Only empty companies can be removed. This one has leads, clients, estimates or money.",
      );
    await switchOffCompany(ctx, organizationId);
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "organization",
      resourceId: organizationId,
      details: { name: org.name },
    });
    return null;
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
    const trades = await knownTrades(ctx, leadTrades);
    await ctx.db.patch(organizationId, { leadTrades: trades, updatedAt: nowIso() });
    // A dropped trade takes the company's bids in it along.
    await dropBidsOutsideTrades(ctx, organizationId, trades);
  },
});

/**
 * An admin sets or changes a company's plan: its status (making it active
 * starts a fresh period with no charge, so "comp" is active at $0), the
 * monthly price, the claims included and the price of an extra claim.
 */
export const setPlan = mutation({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(
      v.union(
        v.literal("trial"),
        v.literal("active"),
        v.literal("past_due"),
        v.literal("cancelled"),
      ),
    ),
    monthlyCents: v.optional(v.number()),
    claimsIncluded: v.optional(v.number()),
    extraClaimCents: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, status, ...changes }) => {
    await requireSuperAdmin(ctx);
    const org = await ctx.db.get(organizationId);
    if (org === null) fail("NOT_FOUND", "Company not found");
    const now = nowIso();
    let plan: Plan = { ...(org.plan ?? trialPlan(now)) };
    for (const [key, value] of Object.entries(changes))
      if (value !== undefined) {
        if (!Number.isInteger(value) || value < 0)
          fail("INVALID", "Enter a whole number of cents, zero or more");
        plan = { ...plan, [key]: value };
      }
    if (status && status !== plan.status) {
      plan.status = status;
      if (status === "active" || status === "trial") {
        plan.periodStart = now;
        plan.nextChargeAt =
          status === "active" ? nextMonth(now) : trialPlan(now).nextChargeAt;
        plan.claimsThisPeriod = 0;
      }
    }
    await ctx.db.patch(organizationId, { plan, updatedAt: now });
    return planSummary(plan, Date.now());
  },
});

// ---- The company's side ----

/** The plan as pages show it. */
export function planSummary(plan: Plan, nowMs: number) {
  return {
    status: plan.status,
    active: planIsActive(plan, nowMs),
    monthlyCents: plan.monthlyCents,
    claimsIncluded: plan.claimsIncluded,
    extraClaimCents: plan.extraClaimCents,
    claimsLeft: claimsLeft(plan),
    nextClaimCents: claimPrice(plan),
    periodStart: plan.periodStart,
    nextChargeAt: plan.nextChargeAt,
  };
}

/** The company's owner, else any member: who a server-posted charge is recorded under. */
async function billingUserFor(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
) {
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  return (members.find((m) => m.role === "owner") ?? members[0])?.userId;
}

/**
 * Charges one month of the plan from the balance and opens a fresh period.
 * Returns false (and marks the plan past due) when the balance can't cover it.
 */
async function chargePlan(
  ctx: MutationCtx,
  org: Doc<"organizations">,
  plan: Plan,
  createdBy: Id<"users"> | undefined,
) {
  const now = nowIso();
  if (plan.monthlyCents > 0) {
    if (!createdBy || (org.walletBalanceCents ?? 0) < plan.monthlyCents) {
      await ctx.db.patch(org._id, {
        plan: { ...plan, status: "past_due" },
        updatedAt: now,
      });
      // Said once, when it pauses; the daily retry stays quiet.
      if (plan.status !== "past_due" && !org.isSample)
        await tellCompany(ctx, org._id, {
          subject: "Your Pro plan is paused",
          lines: [
            `Your Pro plan is paused: ${dollars(plan.monthlyCents)} could not come off your lead balance (${dollars(org.walletBalanceCents ?? 0)}).`,
            "Estimates, the Price Book, Projects and the Vault are locked until it's paid. Add funds and it resumes on its own.",
          ],
          path: "/plan",
          button: "Add funds",
        });
      return false;
    }
    await postTransaction(ctx, org._id, {
      type: "plan",
      amountCents: -plan.monthlyCents,
      createdBy,
      note: "Pro plan",
      isSample: org.isSample || undefined,
    });
  }
  await ctx.db.patch(org._id, {
    plan: {
      ...plan,
      status: "active",
      periodStart: now,
      nextChargeAt: nextMonth(now),
      claimsThisPeriod: 0,
    },
    updatedAt: now,
  });
  return true;
}

/** Daily: every active (or past due) plan whose fee is due gets charged. */
export const chargePlans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const orgs = (
      await ctx.db.query("organizations").order("desc").take(500)
    ).filter((o) => o.isActive && o.plan);
    let charged = 0;
    let pastDue = 0;
    for (const org of orgs) {
      const plan = org.plan!;
      if (plan.status !== "active" && plan.status !== "past_due") continue;
      if (Date.parse(plan.nextChargeAt) > nowMs) continue;
      if (await chargePlan(ctx, org, plan, await billingUserFor(ctx, org._id)))
        charged++;
      else pastDue++;
    }
    return { charged, pastDue };
  },
});

/**
 * Gives a company its 30-day trial the first time it opens something the
 * plan covers. Returns the plan either way.
 */
export const ensurePlan = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { organization } = await requireMember(ctx, organizationId);
    let plan = organization.plan;
    if (!plan) {
      const now = nowIso();
      plan = trialPlan(now);
      await ctx.db.patch(organizationId, { plan, updatedAt: now });
    }
    return planSummary(plan, Date.now());
  },
});

/**
 * A company starts (or restarts) the plan. A period that is already paid
 * for, or a trial still running, is not charged again: the plan turns on
 * and the next fee stays on the date it already had. Otherwise this
 * month's fee comes off the balance now and a fresh period opens with the
 * full claim allowance. Returns the plan with what was charged.
 */
export const startPlan = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user, organization } = await requireMember(
      ctx,
      organizationId,
      "admin",
    );
    const nowMs = Date.now();
    const now = nowIso();
    const plan = organization.plan ?? trialPlan(now);
    if (plan.status === "active")
      return { ...planSummary(plan, nowMs), chargedCents: 0 };
    // A company with no plan yet pays now, as the button says; one on a
    // running trial or a paid month does not pay twice.
    const paidUp =
      organization.plan !== undefined &&
      (plan.status === "cancelled" || plan.status === "trial") &&
      Date.parse(plan.nextChargeAt) > nowMs;
    let started: Plan;
    let chargedCents = 0;
    if (paidUp) {
      started = { ...plan, status: "active" };
    } else {
      if (plan.monthlyCents > 0) {
        // Fails with "Balance too low" when the balance can't cover it.
        await postTransaction(ctx, organizationId, {
          type: "plan",
          amountCents: -plan.monthlyCents,
          createdBy: user._id,
          note: "Pro plan",
        });
        chargedCents = plan.monthlyCents;
      }
      started = {
        ...plan,
        status: "active",
        periodStart: now,
        nextChargeAt: nextMonth(now),
        claimsThisPeriod: 0,
      };
    }
    await ctx.db.patch(organizationId, { plan: started, updatedAt: now });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "plan_started",
      resourceType: "organization",
      resourceId: organizationId,
      details: { monthlyCents: plan.monthlyCents, chargedCents },
    });
    return { ...planSummary(started, nowMs), chargedCents };
  },
});

/** Stops the plan at the end of the paid period. */
export const cancelPlan = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user, organization } = await requireMember(
      ctx,
      organizationId,
      "admin",
    );
    const plan = organization.plan;
    if (!plan) fail("INVALID", "There's no plan to cancel");
    const now = nowIso();
    const cancelled: Plan = { ...plan, status: "cancelled" };
    await ctx.db.patch(organizationId, { plan: cancelled, updatedAt: now });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "plan_cancelled",
      resourceType: "organization",
      resourceId: organizationId,
    });
    return planSummary(cancelled, Date.now());
  },
});

/** Looks up trade names by slug, once each. */
/** What companies see of a confirmation: the date and the line, not who called. */
const verifiedFor = (lead: Doc<"marketplaceLeads">) =>
  lead.verified
    ? { at: lead.verified.at, note: lead.verified.note }
    : undefined;

function tradeNamer(ctx: QueryCtx | MutationCtx) {
  const names = new Map<string, string | undefined>();
  return async (slug: string | undefined) => {
    if (!slug) return undefined;
    if (!names.has(slug))
      names.set(
        slug,
        (
          await ctx.db
            .query("industries")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .first()
        )?.name,
      );
    return names.get(slug);
  };
}

/**
 * The Older leads pool: Marketplace leads nobody bought in a week. Only a
 * company on the plan sees the rows; everyone else gets the count in their
 * trades, so the page can say what they're missing.
 */
export const olderLeads = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { organization } = await requireMember(ctx, organizationId);
    const nowMs = Date.now();
    const trades = organization.leadTrades ?? [];
    const older = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "older"))
      .order("desc")
      .take(200);
    const matches = (lead: Doc<"marketplaceLeads">) =>
      Boolean(lead.jobType && trades.includes(lead.jobType));
    const plan = organization.plan
      ? planSummary(organization.plan, nowMs)
      : null;
    const count = trades.length ? older.filter(matches).length : older.length;
    if (!plan?.active) return { locked: true as const, count, plan, leads: [] };
    const tradeName = tradeNamer(ctx);
    const leads = await Promise.all(
      older.map(async (lead) => ({
        id: lead._id,
        jobType: lead.jobType,
        tradeName: await tradeName(lead.jobType),
        city: lead.city,
        county: lead.county,
        summary: lead.notes,
        receivedAt: lead.auction?.listedAt ?? lead.createdAt,
        ageDays: Math.floor(
          (nowMs - Date.parse(lead.auction?.listedAt ?? lead.createdAt)) /
            DAY_MS,
        ),
        matchesTrades: matches(lead),
        verified: verifiedFor(lead),
        demo: !sameWorld(organization, lead) || undefined,
      })),
    );
    return {
      locked: false as const,
      count,
      plan,
      leads: leads.sort(
        (a, b) =>
          Number(b.matchesTrades) - Number(a.matchesTrades) ||
          Number(Boolean(b.verified)) - Number(Boolean(a.verified)),
      ),
    };
  },
});

/**
 * A company on the plan claims an older lead: it's theirs alone, included
 * while the month's allowance lasts, then at the extra-claim price.
 */
export const claim = mutation({
  args: {
    leadId: v.id("marketplaceLeads"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { leadId, organizationId }) => {
    const { user, organization } = await requireMember(
      ctx,
      organizationId,
      "admin",
    );
    const plan = organization.plan;
    if (!plan || !planIsActive(plan, Date.now()))
      fail("FORBIDDEN", "The Vault is part of the Pro plan");
    const lead = await ctx.db.get(leadId);
    if (lead === null || lead.status !== "older")
      fail("INVALID", "Someone just claimed this lead");
    requireSameWorld(organization, lead);
    const sale = await sellLead(ctx, user._id, leadId, organizationId, {
      priceCents: claimPrice(plan),
      via: "claim",
    });
    const used: Plan = { ...plan, claimsThisPeriod: plan.claimsThisPeriod + 1 };
    await ctx.db.patch(organizationId, { plan: used, updatedAt: nowIso() });
    return { ...sale, claimsLeft: claimsLeft(used) };
  },
});

/** A company's balance, history and what its leads earned it. */
export const wallet = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    // Staff read it too: the company panel in Ops shows the same wallet.
    const { organization } = await requireMemberOrStaff(ctx, organizationId);
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
    const trades = organization.leadTrades ?? [];
    const pricings = await Promise.all(
      (trades.length ? trades : [undefined]).map((t) => pricingFor(ctx, t)),
    );
    const openBids = (
      await ctx.db
        .query("leadBids")
        .withIndex("by_organization_and_status", (q) =>
          q.eq("organizationId", organizationId).eq("status", "open"),
        )
        .collect()
    ).filter((b) => (b.kind ?? "order") === "order").length;
    const standingBids = await ctx.db
      .query("standingBids")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    // The trades the company does, plus any it has a standing bid for.
    const wanted = new Set([...trades, ...standingBids.map((b) => b.jobType)]);
    // Whether a lead alert can reach someone by text: an owner's or admin's
    // mobile, else the company's own phone (see delivery.recipients).
    const alertPeople = (
      await ctx.db
        .query("memberships")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(50)
    ).filter((m) => m.role !== "member");
    const hasMobile =
      (await Promise.all(alertPeople.map((m) => ctx.db.get(m.userId)))).some((u) => Boolean(u?.mobile));
    return {
      balanceCents: organization.walletBalanceCents ?? 0,
      leadTrades: trades,
      hasMobile,
      // What a typical lead costs this company, for "about N leads".
      typicalLeadCents: typicalLeadCents(pricings),
      openBids,
      standingBids: standingBids.length,
      // Bids another company took the lead from since this one last looked.
      outbidBids: standingBids.filter(
        (b) => outbidUnseen(b) && (organization.walletBalanceCents ?? 0) >= b.amountCents,
      ).length,
      // Bids the balance can't pay for: kept, but they can't win until funds are added.
      pausedBids: standingBids.filter(
        (b) => b.amountCents > (organization.walletBalanceCents ?? 0),
      ).length,
      spentCents: bought
        .filter((l) => l.status === "assigned")
        .reduce((sum, l) => sum + (l.priceCents ?? 0), 0),
      leadsBought: bought.length,
      // No Stripe key on the deployment: Add funds loads play money, and the button says so.
      playMoney: !process.env.STRIPE_SECRET_KEY,
      ...roi,
      plan: organization.plan
        ? planSummary(organization.plan, Date.now())
        : null,
      // Older leads it could claim on the plan (all of them when it has no trades yet).
      olderLeads: (
        await ctx.db
          .query("marketplaceLeads")
          .withIndex("by_status", (q) => q.eq("status", "older"))
          .take(500)
      ).filter((l) => !wanted.size || (l.jobType && wanted.has(l.jobType)))
        .length,
      // Marketplace leads in this company's trades: the ones it would buy.
      availableLeads: wanted.size
        ? (
            await ctx.db
              .query("marketplaceLeads")
              .withIndex("by_status", (q) => q.eq("status", "available"))
              .take(500)
          ).filter((l) => l.jobType && wanted.has(l.jobType)).length
        : 0,
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
 * homeowner's contact details held back until they buy it. Each carries
 * its price schedule so the page can count down itself. Their own trades
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
    const myBids = (
      await ctx.db
        .query("leadBids")
        .withIndex("by_organization_and_status", (q) =>
          q.eq("organizationId", organizationId).eq("status", "open"),
        )
        .collect()
    ).filter((b) => (b.kind ?? "order") === "order");
    const tradeName = tradeNamer(ctx);
    const leads = await Promise.all(
      available.map(async (lead) => {
        const bid = myBids.find((b) => b.marketplaceLeadId === lead._id);
        return {
          id: lead._id,
          jobType: lead.jobType,
          tradeName: await tradeName(lead.jobType),
          city: lead.city,
          summary: lead.notes,
          receivedAt: lead.createdAt,
          auction: await auctionFor(ctx, lead),
          matchesTrades: Boolean(lead.jobType && trades.includes(lead.jobType)),
          verified: verifiedFor(lead),
          // Shown so the market isn't empty, but a real company can't buy it.
          demo: !sameWorld(organization, lead) || undefined,
          myBid: bid ? { id: bid._id, maxCents: bid.maxCents } : undefined,
        };
      }),
    );
    // Your trades first, and within those the leads a person has confirmed.
    return leads.sort(
      (a, b) =>
        Number(b.matchesTrades) - Number(a.matchesTrades) ||
        Number(Boolean(b.verified)) - Number(Boolean(a.verified)),
    );
  },
});

/** A company buys a lead at its current price: paid from its balance, and it's theirs alone. */
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
    return await sellLead(ctx, user._id, leadId, organizationId, {
      priceCents: await leadPriceCents(ctx, lead),
      via: "buy",
    });
  },
});

// ---- Buy orders ----

/**
 * A company names the price it will pay for a lead. The order fills on its
 * own when the price drops to that, unless someone buys the lead first.
 * Funds aren't held back: if the balance can't cover it by then, it's lost.
 */
export const placeBid = mutation({
  args: {
    leadId: v.id("marketplaceLeads"),
    organizationId: v.id("organizations"),
    max: v.number(),
  },
  handler: async (ctx, { leadId, organizationId, max }) => {
    const { user, organization } = await requireMember(
      ctx,
      organizationId,
      "admin",
    );
    const lead = await ctx.db.get(leadId);
    if (lead === null || lead.status !== "available")
      fail("INVALID", "Someone just bought this lead");
    requireSameWorld(organization, lead);
    const maxCents = toCents(max);
    const auction = await auctionFor(ctx, lead);
    const now = priceAt(auction, Date.now());
    if (maxCents < auction.floorCents)
      fail(
        "INVALID",
        `This lead won't go below ${dollars(auction.floorCents)}`,
      );
    if (maxCents >= now.priceCents)
      fail(
        "INVALID",
        `It's already ${dollars(now.priceCents)}: buy it now instead`,
      );
    if ((organization.walletBalanceCents ?? 0) < maxCents)
      fail("INVALID", "Add funds to cover this buy order");
    const time = nowIso();
    const existing = (
      await ctx.db
        .query("leadBids")
        .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", leadId))
        .collect()
    ).filter((b) => b.organizationId === organizationId && b.status === "open");
    for (const bid of existing)
      await ctx.db.patch(bid._id, { status: "cancelled", resolvedAt: time });
    const bidId = await ctx.db.insert("leadBids", {
      marketplaceLeadId: leadId,
      organizationId,
      maxCents,
      status: "open",
      createdBy: user._id,
      createdAt: time,
    });
    const fillsAt = fillTimeMs(auction, maxCents);
    await ctx.scheduler.runAt(fillsAt, internal.marketplace.fillBid, { bidId });
    return { bidId, fillsAt: new Date(fillsAt).toISOString() };
  },
});

export const cancelBid = mutation({
  args: { bidId: v.id("leadBids") },
  handler: async (ctx, { bidId }) => {
    const bid = await ctx.db.get(bidId);
    if (bid === null) fail("NOT_FOUND", "Buy order not found");
    await requireMember(ctx, bid.organizationId, "admin");
    if (bid.status !== "open")
      fail("INVALID", "This buy order has already ended");
    await ctx.db.patch(bidId, { status: "cancelled", resolvedAt: nowIso() });
  },
});

/** Runs when the price reaches a buy order: buys the lead at the price it's at, if it can. */
export const fillBid = internalMutation({
  args: { bidId: v.id("leadBids") },
  handler: async (ctx, { bidId }) => {
    const bid = await ctx.db.get(bidId);
    if (bid === null || bid.status !== "open") return;
    const lead = await ctx.db.get(bid.marketplaceLeadId);
    const lose = async (outcome: string) =>
      ctx.db.patch(bidId, { status: "lost", outcome, resolvedAt: nowIso() });
    if (lead === null || lead.status !== "available")
      return await lose("Another company bought it first");
    const priceCents = await leadPriceCents(ctx, lead);
    if (priceCents > bid.maxCents) {
      // Listed again at a higher price: wait for it to come back down.
      await ctx.scheduler.runAt(
        fillTimeMs(await auctionFor(ctx, lead), bid.maxCents),
        internal.marketplace.fillBid,
        { bidId },
      );
      return;
    }
    const organization = await ctx.db.get(bid.organizationId);
    if (!organization?.isActive) return await lose("Company shut down");
    if ((organization.walletBalanceCents ?? 0) < priceCents)
      return await lose(
        `Balance too low: ${dollars(priceCents)} needed, ${dollars(organization.walletBalanceCents ?? 0)} available`,
      );
    await sellLead(ctx, bid.createdBy, lead._id, bid.organizationId, {
      priceCents,
      bidId,
      via: "order",
    });
    await ctx.db.patch(bidId, { status: "filled", resolvedAt: nowIso() });
  },
});

/** A company's buy orders, newest first: open ones plus the last few that filled or lost. */
export const bids = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const all = await Promise.all(
      (["open", "filled", "lost", "cancelled"] as const).map((status) =>
        ctx.db
          .query("leadBids")
          .withIndex("by_organization_and_status", (q) =>
            q.eq("organizationId", organizationId).eq("status", status),
          )
          .order("desc")
          .take(status === "open" ? 100 : 10),
      ),
    );
    return await Promise.all(
      all
        .flat()
        .filter((bid) => (bid.kind ?? "order") === "order")
        // A cancelled order shows only when it closed because the company got the lead.
        .filter((bid) => bid.status !== "cancelled" || bid.outcome === "Bought it now" || bid.outcome === "This lead is yours")
        .map(async (bid) => {
          const lead = await ctx.db.get(bid.marketplaceLeadId);
          return {
            id: bid._id,
            leadId: bid.marketplaceLeadId,
            city: lead?.city,
            jobType: lead?.jobType,
            maxCents: bid.maxCents,
            status: bid.status,
            outcome: bid.outcome,
            pricePaidCents:
              bid.status === "filled" ? lead?.priceCents : undefined,
            createdAt: bid.createdAt,
            resolvedAt: bid.resolvedAt,
          };
        }),
    );
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
    await requireStaff(ctx);
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
    payment: 500,
    method: "Cash",
  },
];

const DEMO_PRICES: Record<string, number> = {
  default: 200,
  roofing: 285,
  hvac: 265,
  concrete: 260,
  plumbing: 245,
  painting: 235,
  handyman: 225,
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
  handler: async (ctx) => seedDemoData(ctx, await requireSuperAdmin(ctx)),
});

/** The demo companies and leads, as `addDemoData` adds them; also run from the CLI (seed.ts) with no signed-in user. */
export async function seedDemoData(ctx: MutationCtx, user: Doc<"users">) {
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
    for (const [i, company] of DEMO_COMPANIES.entries()) {
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
      // Every other demo company is on the plan for free; the rest let its
      // plan lapse, so the locked and open states both show.
      await ctx.db.patch(id, {
        plan:
          i % 2 === 0
            ? { ...trialPlan(nowIso()), status: "active", monthlyCents: 0 }
            : {
                ...trialPlan(nowIso()),
                status: "cancelled",
                nextChargeAt: new Date(Date.now() - DAY_MS).toISOString(),
              },
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
        await listLead(
          ctx,
          { name, phone, address, city, jobType, notes },
          user._id,
          { listedAt: now, source: "Demo", isSample: true },
        ),
      );
    }
    for (const [leadIndex, companyIndex, status, value] of DEMO_SALES) {
      const demoLead = (await ctx.db.get(leadIds[leadIndex]))!;
      const { orgLeadId } = await sellLead(
        ctx,
        user._id,
        leadIds[leadIndex],
        companyIds[companyIndex],
        { priceCents: await leadPriceCents(ctx, demoLead), via: "buy" },
      );
      await ctx.db.patch(orgLeadId, {
        status,
        ...(value ? { estimatedValue: value } : {}),
      });
    }
    return { companies: companyIds.length, leads: leadIds.length };
}

// [name, phone, address, city, trade, what they need]
const SAMPLE_LEADS: Array<[string, string, string, string, string, string]> = [
  [
    "Patricia Nguyen",
    "(432) 555-0311",
    "2204 Humble Ave",
    "Midland",
    "landscaping",
    "Backyard sod and sprinkler system, about a quarter acre. Wants it done before a graduation party.",
  ],
  [
    "Derek Holloway",
    "(432) 555-0342",
    "6110 Whitman Dr",
    "Midland",
    "landscaping",
    "Front yard redo: rock beds, three trees, drip lines. Has a budget in mind.",
  ],
  [
    "Alma Castillo",
    "(432) 555-0378",
    "1409 Alamo St",
    "Odessa",
    "landscaping",
    "Weekly mowing and edging for a corner lot, plus fall cleanup.",
  ],
  [
    "Tyler Brandt",
    "(432) 555-0395",
    "3307 Teakwood Ln",
    "Odessa",
    "landscaping",
    "Paver patio about 12x16 with a fire pit. Has a photo of what they like.",
  ],
  [
    "Renee Oliver",
    "(432) 555-0417",
    "508 E 11th St",
    "Big Spring",
    "landscaping",
    "Sprinkler system isn't covering the side yard; wants it fixed or redone.",
  ],
  [
    "Hector Mendoza",
    "(432) 555-0426",
    "1215 NW 8th St",
    "Andrews",
    "landscaping",
    "Artificial turf for a dog run, roughly 20x30.",
  ],
  [
    "Kristen Powell",
    "(432) 555-0453",
    "4001 Caldera Blvd",
    "Midland",
    "landscaping",
    "New build, bare dirt. Full yard: sod, beds, irrigation.",
  ],
  [
    "Samuel Okafor",
    "(432) 555-0489",
    "1902 E 50th St",
    "Odessa",
    "landscaping",
    "Retaining wall along the driveway is leaning; wants a quote to rebuild.",
  ],
  [
    "Gloria Tran",
    "(432) 555-0502",
    "307 S Main St",
    "Stanton",
    "landscaping",
    "Xeriscape the front yard to cut the water bill.",
  ],
  [
    "Brent Kaminski",
    "(432) 555-0537",
    "8800 Cholla Dr",
    "Greenwood",
    "landscaping",
    "Two acres: tree trimming and brush clearing before a fence goes in.",
  ],
  [
    "Monica Ruiz",
    "(432) 555-0561",
    "2611 W Michigan Ave",
    "Midland",
    "landscaping",
    "Flower beds along the front walk, mulch and a few shrubs.",
  ],
  [
    "Jared Whitfield",
    "(432) 555-0598",
    "900 S Betty Ave",
    "Monahans",
    "landscaping",
    "Lawn is mostly dead; wants it leveled and re-sodded.",
  ],
  [
    "Lena Hoffmann",
    "(432) 555-0614",
    "3415 Haynes Ave",
    "Midland",
    "painting",
    "Exterior repaint, two-storey, stucco. Peeling on the south side.",
  ],
  [
    "Carlos Benavides",
    "(432) 555-0647",
    "2208 Redbud Ave",
    "Odessa",
    "painting",
    "Interior: living room, hallway and three bedrooms. Walls and trim.",
  ],
  [
    "Whitney Marsh",
    "(432) 555-0672",
    "1700 Goliad St",
    "Big Spring",
    "painting",
    "Kitchen cabinets painted white. 28 doors and drawers.",
  ],
  [
    "Ahmed Farouk",
    "(432) 555-0699",
    "5505 Thomason Dr",
    "Midland",
    "painting",
    "Rental turnover: whole house, one color, before the 1st.",
  ],
  [
    "Dana Kessler",
    "(432) 555-0721",
    "4412 Storey Ave",
    "Midland",
    "general-construction",
    "Covered patio addition, about 14x20, with a ceiling fan.",
  ],
  [
    "Victor Salinas",
    "(432) 555-0748",
    "1313 E 21st St",
    "Odessa",
    "general-construction",
    "Convert the garage into a bedroom with a closet.",
  ],
  [
    "Rachel Dunn",
    "(432) 555-0776",
    "2900 N Sam Houston Ave",
    "Odessa",
    "roofing",
    "Missing shingles after the wind; a leak over the back bedroom.",
  ],
  [
    "Luis Herrera",
    "(432) 555-0794",
    "610 NE 2nd St",
    "Andrews",
    "concrete",
    "Driveway extension and a 10x10 slab for a shed.",
  ],
];

/** What the demo intake call "heard": every demo lead is listed already confirmed, like a real one. */
const DEMO_CONFIRM_NOTE = "Wants a quote this month";

/**
 * Adds a batch of sample leads to the market, spread over the last few
 * hours so their prices differ. For trying the Marketplace; "Remove demo
 * data" clears them.
 */
export const addSampleLeads = mutation({
  args: {},
  handler: async (ctx) => seedSampleLeads(ctx, await requireSuperAdmin(ctx)),
});

/** The 20 sample leads, as `addSampleLeads` adds them; also run from the CLI (seed.ts). */
export async function seedSampleLeads(ctx: MutationCtx, user: Doc<"users">) {
    const nowMs = Date.now();
    let added = 0;
    for (const [
      i,
      [name, phone, address, city, jobType, notes],
    ] of SAMPLE_LEADS.entries()) {
      // Oldest first: the first lead came in 6 hours ago, the last just now.
      const listedAt = new Date(
        nowMs -
          ((SAMPLE_LEADS.length - 1 - i) * 6 * 60 * 60 * 1000) /
            (SAMPLE_LEADS.length - 1),
      ).toISOString();
      // Demo leads arrive the way real ones do: confirmed on the intake call.
      await listLead(
        ctx,
        { name, phone, address, city, jobType, notes, verified: { at: listedAt, note: DEMO_CONFIRM_NOTE, by: user._id } },
        user._id,
        { listedAt, source: "Demo", isSample: true },
      );
      added++;
    }
    return { added };
}

/** Removes every demo company and demo lead, with their balances and history. */
export const removeDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return await deleteDemoData(ctx);
  },
});

export async function deleteDemoData(ctx: MutationCtx) {
  await deleteDemoIntake(ctx);
  const companies = await ctx.db
    .query("organizations")
    .filter((q) => q.eq(q.field("isSample"), true))
    .collect();
  const leads = await ctx.db
    .query("marketplaceLeads")
    .filter((q) => q.eq(q.field("isSample"), true))
    .collect();
  const sampleLeadIds = new Set<string>(leads.map((l) => l._id));
  // The leads companies won from sample leads, and the bids on them.
  for (const lead of leads) {
    if (lead.orgLeadId && (await ctx.db.get(lead.orgLeadId)))
      await ctx.db.delete(lead.orgLeadId);
    for (const bid of await ctx.db
      .query("leadBids")
      .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", lead._id))
      .collect())
      await ctx.db.delete(bid._id);
  }
  // Demo standing bids.
  const standingBids = await ctx.db
    .query("standingBids")
    .filter((q) => q.eq(q.field("isSample"), true))
    .collect();
  for (const bid of standingBids) await ctx.db.delete(bid._id);
  // Demo data no longer reaches real companies, but older demo runs put
  // demo funds and demo leads on them: those come back out, so the balance
  // returns to what it was.
  const real = (await ctx.db.query("organizations").take(1000)).filter(
    (org) => !org.isSample,
  );
  for (const org of real) {
    const rows = (
      await ctx.db
        .query("walletTransactions")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect()
    ).filter(
      (t) =>
        t.isSample ||
        (t.marketplaceLeadId && sampleLeadIds.has(t.marketplaceLeadId)),
    );
    if (rows.length === 0) continue;
    const net = rows.reduce((sum, t) => sum + t.amountCents, 0);
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.patch(org._id, {
      walletBalanceCents: Math.max(0, (org.walletBalanceCents ?? 0) - net),
      updatedAt: nowIso(),
    });
  }
  // Sample leads, then the sample companies with everything of theirs.
  for (const lead of leads) await ctx.db.delete(lead._id);
  for (const company of companies) await deleteOrganization(ctx, company._id);
  return {
    companies: companies.length,
    leads: leads.length,
    standingBids: standingBids.length,
  };
}

// ---- Demo bids ----

/** Standing bids by trade, per company (cycled by its place in name order): [county, dollars][]. */
const DEMO_BID_PATTERNS: Record<string, Array<Array<[string, number]>>> = {
  landscaping: [
    [
      ["Midland", 275],
      ["Ector", 225],
      ["Howard", 210],
      ["Andrews", 215],
    ],
    // Deliberately more than this company's demo funds in Andrews.
    [
      ["Midland", 250],
      ["Ector", 260],
      ["Andrews", 900],
    ],
    [
      ["Midland", 300],
      ["Ector", 240],
      ["Martin", 230],
    ],
    [
      ["Midland", 265],
      ["Ector", 255],
      ["Howard", 235],
    ],
  ],
  painting: [
    [
      ["Midland", 240],
      ["Ector", 220],
      ["Howard", 200],
    ],
  ],
  default: [
    [
      ["Midland", 250],
      ["Ector", 225],
    ],
  ],
};
/** Demo companies "Add demo bids" brings with it, so the bids have somebody to belong to. */
const DEMO_BIDDERS = [
  { name: "Caprock Landscapes", phone: "(432) 555-0181", email: "bids@caprock.example", city: "Midland", leadTrades: ["landscaping"] },
  { name: "Tall City Lawn & Stone", phone: "(432) 555-0182", email: "office@tallcitylawn.example", city: "Midland", leadTrades: ["landscaping"] },
  { name: "Big Spring Builders", phone: "(432) 555-0183", email: "jobs@bigspringbuilders.example", city: "Big Spring", leadTrades: ["general-construction"] },
];
const DEMO_FUNDS_CENTS = 150000;
/** The second landscaper's funds, so its Andrews bid shows as unfunded. */
const DEMO_SHORT_FUNDS_CENTS = 60000;

// [name, phone, address, city, trade, what they need], oldest first.
// [name, phone, address, city, trade, what they need]: listed 9 and 12 days
// ago with no bidder, so they sit in Older leads.
const DEMO_OLDER_LEADS: Array<
  [string, string, string, string, string, string]
> = [
  [
    "Marisol Peña",
    "(432) 555-0188",
    "2206 Whitmire Blvd",
    "Midland",
    "painting",
    "Repaint the exterior trim and front door, two-story.",
  ],
  [
    "Troy Whitaker",
    "(432) 555-0192",
    "4512 Tanglewood Ln",
    "Odessa",
    "hvac",
    "Replace a 3-ton unit before summer; current one is 18 years old.",
  ],
];

const DEMO_BID_LEADS: Array<[string, string, string, string, string, string]> =
  [
    [
      "Hector Salinas",
      "(432) 555-0141",
      "1808 W Illinois Ave",
      "Midland",
      "landscaping",
      "Front yard sod and a drip system, 1,800 sq ft.",
    ],
    [
      "Marcy Odom",
      "(432) 555-0167",
      "3310 Maple Ave",
      "Odessa",
      "painting",
      "Interior repaint, 3 bedrooms and hallway, walls only.",
    ],
    [
      "Dale Whitfield",
      "(432) 555-0192",
      "702 E 11th Pl",
      "Big Spring",
      "landscaping",
      "Remove two dead trees and regrade the side yard.",
    ],
    [
      "Priya Raman",
      "(432) 555-0204",
      "5109 Greentree Blvd",
      "Midland",
      "general-construction",
      "Enclose a back patio into a sunroom, about 220 sq ft.",
    ],
    [
      "Bill Tran",
      "(432) 555-0218",
      "2411 N Grandview Ave",
      "Odessa",
      "landscaping",
      "Backyard: flagstone patio and a raised bed along the fence.",
    ],
    [
      "Leticia Barrera",
      "(432) 555-0233",
      "901 N St Peter St",
      "Stanton",
      "landscaping",
      "Weekly mowing and bed cleanup for a rental, start this month.",
    ],
    [
      "Gordon Pike",
      "(432) 555-0251",
      "4400 Andrews Hwy",
      "Midland",
      "painting",
      "Exterior stucco repaint, single story, light color.",
    ],
    [
      "Shannon Kerr",
      "(432) 555-0266",
      "1210 NW 8th St",
      "Andrews",
      "landscaping",
      "Full front and back xeriscape with rock and native plants.",
    ],
    [
      "Rosa Delgado",
      "(432) 555-0279",
      "3800 E 52nd St",
      "Odessa",
      "painting",
      "Cabinet refinish, kitchen, white.",
    ],
    [
      "Trent Mabry",
      "(432) 555-0288",
      "2706 Shell Ave",
      "Midland",
      "general-construction",
      "Garage conversion to a home office with a half bath.",
    ],
    [
      "Jolene Hart",
      "(432) 555-0297",
      "6201 Driftwood Dr",
      "Midland",
      "landscaping",
      "Sprinkler rebuild, 8 zones, plus new sod in back.",
    ],
    // Nobody bids on these; they go to the Marketplace.
    [
      "Omar Haddad",
      "(432) 555-0305",
      "1500 W Wadley Ave",
      "Midland",
      "roofing",
      "Hail damage, shingle roof, insurance claim in hand.",
    ],
    [
      "Kaylee Burns",
      "(806) 555-0312",
      "4812 19th St",
      "Lubbock",
      "landscaping",
      "New build front yard, sod and three trees.",
    ],
    [
      "Victor Nunez",
      "(432) 555-0326",
      "2200 E 8th St",
      "Odessa",
      "hvac",
      "AC not cooling upstairs, two-story, unit from 2011.",
    ],
  ];

/**
 * Gives every real company demo funds and a few standing bids, then lists
 * leads that get awarded on the spot, so Bids, Results, Leads, balances and
 * the Admin views all have something to show. Landscapers overlap in Midland
 * and Ector so some are highest and some outbid; one bid is more than its
 * company's funds. "Remove demo data" takes all of it back out.
 */
/** Play money for the owner to test with: every active company's balance goes up by this much. */
export const PLAY_MONEY_CENTS = 500_000;

/**
 * Loads every active company with play money so the owner can try buying,
 * bidding and claiming without recording payments one by one. Posted as
 * an ordinary top-up marked "Play money", so it shows in each company's
 * history; demo companies carry it out with "Remove demo data", real ones
 * keep it until it's spent.
 */
export const fundEveryCompany = mutation({
  args: {},
  handler: async (ctx) => seedPlayMoney(ctx, await requireSuperAdmin(ctx)),
});

/** Play money on every active company, as `fundEveryCompany` posts it; also run from the CLI (seed.ts). */
export async function seedPlayMoney(
  ctx: MutationCtx,
  user: Doc<"users">,
  { demoOnly = false }: { demoOnly?: boolean } = {},
) {
    const companies = (await ctx.db.query("organizations").take(5000)).filter(
      (o) => o.isActive && (!demoOnly || o.isSample),
    );
    for (const company of companies) {
      await postTransaction(ctx, company._id, {
        type: "top_up",
        amountCents: PLAY_MONEY_CENTS,
        createdBy: user._id,
        method: "Demo",
        note: "Play money",
        isSample: company.isSample || undefined,
      });
    }
    return { companies: companies.length, amountCents: PLAY_MONEY_CENTS };
}

export const addDemoBids = mutation({
  args: {},
  handler: async (ctx) => seedDemoBids(ctx, await requireSuperAdmin(ctx)),
});

/** Demo funds, standing bids and awarded leads, as `addDemoBids` adds them; also run from the CLI (seed.ts). */
export async function seedDemoBids(ctx: MutationCtx, user: Doc<"users">) {
    if (
      (await ctx.db
        .query("standingBids")
        .filter((q) => q.eq(q.field("isSample"), true))
        .first()) !== null
    )
      fail("INVALID", "Demo bids are already here");
    // Demo bids belong to demo companies only: the bidders below are added
    // when missing, and any other demo company bids in its own trades. Real
    // companies get no funds, bids or leads from this.
    const existing = (await ctx.db.query("organizations").take(1000)).filter((org) => org.isSample);
    for (const bidder of DEMO_BIDDERS) {
      if (existing.some((org) => org.name === bidder.name)) continue;
      await createOrganization(ctx, { ...bidder, state: "TX", walletBalanceCents: 0, isSample: true });
    }
    const companies = (await ctx.db.query("organizations").take(1000))
      .filter((org) => org.isActive && org.isSample)
      .sort((a, b) => a.name.localeCompare(b.name));
    const seen: Record<string, number> = {};
    const base = Date.now() - 4 * 24 * 60 * 60 * 1000;
    let standingBids = 0;
    for (const org of companies) {
      const trades = org.leadTrades?.length
        ? org.leadTrades
        : ["general-construction"];
      // Which landscaper (etc.) this is decides its pattern and its funds.
      const slots = trades.map((trade) => {
        const n = seen[trade] ?? 0;
        seen[trade] = n + 1;
        return { trade, n };
      });
      const short = slots.some((s) => s.trade === "landscaping" && s.n === 1);
      await postTransaction(ctx, org._id, {
        type: "top_up",
        amountCents: short ? DEMO_SHORT_FUNDS_CENTS : DEMO_FUNDS_CENTS,
        createdBy: user._id,
        method: "Demo",
        note: "Demo funds",
        isSample: true,
      });
      for (const { trade, n } of slots) {
        const patterns = DEMO_BID_PATTERNS[trade] ?? DEMO_BID_PATTERNS.default;
        for (const [county, amount] of patterns[n % patterns.length]) {
          const createdAt = new Date(
            base + standingBids * 60_000,
          ).toISOString();
          await ctx.db.insert("standingBids", {
            organizationId: org._id,
            county,
            jobType: trade,
            amountCents: amount * 100,
            createdBy: user._id,
            createdAt,
            updatedAt: createdAt,
            isSample: true,
          });
          standingBids++;
        }
      }
    }
    // Leads over the last three days, oldest first; each is awarded as it lands.
    let sold = 0;
    const span = 3 * 24 * 60 * 60 * 1000;
    for (const [
      i,
      [name, phone, address, city, jobType, notes],
    ] of DEMO_BID_LEADS.entries()) {
      const listedAt = new Date(
        Date.now() - span + (span * (i + 1)) / (DEMO_BID_LEADS.length + 1),
      ).toISOString();
      const id = await listLead(
        ctx,
        { name, phone, address, city, jobType, notes, verified: { at: listedAt, note: DEMO_CONFIRM_NOTE, by: user._id } },
        user._id,
        { listedAt, source: "Demo", isSample: true },
      );
      if ((await ctx.db.get(id))!.status === "assigned") sold++;
    }
    // A couple of leads from longer ago that nobody bought: Older leads.
    for (const [
      i,
      [name, phone, address, city, jobType, notes],
    ] of DEMO_OLDER_LEADS.entries()) {
      const listedAt = new Date(
        Date.now() - (9 + 3 * i) * DAY_MS,
      ).toISOString();
      const id = await ctx.db.insert("marketplaceLeads", {
        name,
        phone,
        address,
        city,
        county: countyForTown(city),
        jobType,
        notes,
        source: "Demo",
        status: "older",
        auction: { ...(await pricingFor(ctx, jobType)), listedAt },
        verified: { at: listedAt, note: DEMO_CONFIRM_NOTE, by: user._id },
        isSample: true,
        createdBy: user._id,
        createdAt: listedAt,
        updatedAt: nowIso(),
      });
      void id;
    }
    return {
      companies: companies.length,
      standingBids,
      leads: DEMO_BID_LEADS.length,
      sold,
    };
}
