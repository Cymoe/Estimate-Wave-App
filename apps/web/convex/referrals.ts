import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { fail, getOwned, logActivity, nowIso } from "./lib/access";
import { isLang } from "./lib/i18n";
import { logoUrlOf } from "./lib/organizations";
import { firstName } from "./lib/perks";

// Referrals: a past client shares their link (/r/:code, made from the portal),
// a friend leaves their details, and it lands in the company's Leads, marked
// who sent it. When it becomes a signed job, the client has earned the
// company's referral reward; the company marks it given.

async function clientByCode(
  ctx: QueryCtx | MutationCtx,
  code: string,
): Promise<Doc<"clients"> | null> {
  if (!/^[a-z0-9]{8}$/.test(code)) return null;
  return await ctx.db
    .query("clients")
    .withIndex("by_referral_code", (q) => q.eq("referralCode", code))
    .unique();
}

/** The friend's page: who the company is and who sent them (first name only). */
export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const client = await clientByCode(ctx, code);
    const organization = client
      ? await ctx.db.get(client.organizationId)
      : null;
    if (!client || !organization) return null;
    return {
      referrer: firstName(client.name),
      company: {
        name: organization.name,
        phone: organization.phone,
        logoUrl: await logoUrlOf(ctx, organization),
      },
    };
  },
});

const MAX_PER_DAY = 10;

/** The friend's details, as a new lead for the company, marked who sent it. */
export const submit = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    note: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { code, name, phone, email, address, note, language },
  ) => {
    const client = await clientByCode(ctx, code);
    if (client === null)
      fail("NOT_FOUND", "This link isn't valid", "link_invalid");
    const clean = (text: string | undefined, max: number) =>
      text?.trim().slice(0, max) || undefined;
    const fields = {
      name: clean(name, 120),
      phone: clean(phone, 40),
      email: clean(email, 200),
      address: clean(address, 300),
      notes: clean(note, 1000),
    };
    if (!fields.name) fail("INVALID", "Enter your name", "referral_name");
    if (!fields.phone && !fields.email)
      fail(
        "INVALID",
        "Enter a phone number or email so they can reach you",
        "referral_contact",
      );
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
      fail("INVALID", "That email doesn't look right", "referral_email");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = (
      await ctx.db
        .query("leads")
        .withIndex("by_referrer", (q) => q.eq("referredByClientId", client._id))
        .take(500)
    ).filter((l) => l.createdAt >= since);
    if (recent.length >= MAX_PER_DAY)
      fail(
        "INVALID",
        "Too many sent from this link today. Please call the company instead.",
        "referral_limit",
      );

    const now = nowIso();
    const id = await ctx.db.insert("leads", {
      status: "new",
      name: fields.name!,
      phone: fields.phone,
      email: fields.email,
      address: fields.address,
      notes: fields.notes,
      source: `Referral from ${client.name}`,
      language: language && isLang(language) ? language : undefined,
      referredByClientId: client._id,
      organizationId: client.organizationId,
      userId: client.userId,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId: client.organizationId,
      userId: client.userId,
      action: "referral_received",
      resourceType: "lead",
      resourceId: id,
      details: { name: fields.name, referredBy: client.name },
    });
    return null;
  },
});

/** Whether a referred lead became a signed job (the reward is then owed). */
async function becameJob(ctx: QueryCtx, lead: Doc<"leads">): Promise<boolean> {
  if (lead.status === "won") return true;
  const estimate = lead.estimateId ? await ctx.db.get(lead.estimateId) : null;
  return estimate?.status === "accepted";
}

/** What a client's referral link brought: each friend, where they stand, and whether the reward is owed or given. */
export async function referralsOf(ctx: QueryCtx, client: Doc<"clients">) {
  const leads = (
    await ctx.db
      .query("leads")
      .withIndex("by_referrer", (q) => q.eq("referredByClientId", client._id))
      .take(200)
  ).filter((l) => l.organizationId === client.organizationId);
  const rows = [];
  for (const lead of leads.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  ))
    rows.push({
      leadId: lead._id,
      name: lead.name,
      status: lead.status,
      createdAt: lead.createdAt,
      earned: await becameJob(ctx, lead),
      paidAt: lead.referralRewardPaidAt,
    });
  return rows;
}

/** The company's view of a client's referrals (on the client's page). */
export const forClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const { doc: client } = await getOwned(ctx, "clients", clientId);
    const organization = await ctx.db.get(client.organizationId);
    return {
      reward: organization?.perks?.referralReward ?? null,
      referrals: await referralsOf(ctx, client),
    };
  },
});

/** The company gave (or takes back giving) the reward for a referral. */
export const markPaid = mutation({
  args: { leadId: v.id("leads"), paid: v.boolean() },
  handler: async (ctx, { leadId, paid }) => {
    const { doc: lead, user } = await getOwned(ctx, "leads", leadId);
    if (!lead.referredByClientId)
      fail("INVALID", "This lead didn't come from a referral");
    await ctx.db.patch(leadId, {
      referralRewardPaidAt: paid ? nowIso() : undefined,
      updatedAt: nowIso(),
    });
    if (paid)
      await logActivity(ctx, {
        organizationId: lead.organizationId,
        userId: user._id,
        action: "referral_reward_given",
        resourceType: "lead",
        resourceId: leadId,
        details: { name: lead.name },
      });
    return null;
  },
});
