// Email outreach: a company connects its own Gmail (send-only), the AI
// drafts a short first email and follow-ups to each owner picked, the
// contractor edits and approves, and the emails go from the company's own
// address on working days, a few minutes apart and within a daily limit.
// Replies come to an address the app owns (lib/emailOutreach.ts
// replyAddress): the owner is marked Replied, their follow-ups stop, they
// go to Leads with the reply, and the contractor gets the reply by email.
// Every email carries the company's postal address and a one-tap
// unsubscribe; an address that unsubscribes is never emailed again.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, nowIso, requireMember } from "./lib/access";
import { sendEmail } from "./lib/email";
import { writeDraft, type DraftInput } from "./lib/emailDraft";
import {
  DEFAULT_DAILY_CAP,
  FOLLOW_UP_DAYS,
  MAX_DAILY_CAP,
  NOT_EMAILED_TEXT,
  addressFor,
  centralDay,
  footerOf,
  isAutoReply,
  isSampleAddress,
  nextOpen,
  plan,
  postalOf,
  replyAddress,
  replyText,
  type NotEmailed,
} from "./lib/emailOutreach";
import { authUrl, isRevoked, rawMessage, refreshAccess, sendRaw, setupMissing } from "./lib/gmail";
import { apiOrigin, randomToken, sha256 } from "./lib/oauth";
import { tidyCase } from "./lib/addressCase";
import { cityOf, knownCounty } from "./lib/outreach";
import { open } from "./lib/secretBox";
import { cellFor, cellsOf, isSampleRun, leadFromReply, requirePro } from "./outreach";
import { siteUrl } from "./delivery";

/** How many owners one batch drafts. */
export const BATCH_MAX = 100;
/** How many sends one run of the sender takes on (it runs every five minutes). */
const SEND_PER_RUN = 20;
/** How long a failed send waits before its one more try. */
const RETRY_MS = 15 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const SIGNAL_WORDS: Record<string, string> = { code_violation: "Code violation", dilapidated: "Dilapidated building", demolition: "Demolition order", stalled_permit: "Stalled permit" };

async function liveMailbox(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const all = await ctx.db.query("mailboxes").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  return all.find((m) => !m.revokedAt) ?? null;
}
async function lastMailbox(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const all = await ctx.db.query("mailboxes").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  return all.sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0] ?? null;
}
const optedOut = async (ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">, email: string) =>
  Boolean(await ctx.db.query("emailOptOuts").withIndex("by_organization_and_email", (q) => q.eq("organizationId", organizationId).eq("email", email.toLowerCase())).first());

/** How many emails each Central day already has from the company: what's booked and what went. */
async function bookedDays(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const booked: Record<string, number> = {};
  let last = 0;
  for (const status of ["scheduled", "sending", "sent"] as const) {
    const rows = await ctx.db.query("outreachEmails").withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId).eq("status", status)).collect();
    for (const r of rows) {
      const at = status === "sent" ? (r.sentAt ? Date.parse(r.sentAt) : 0) : (r.sendAt ?? 0);
      if (!at || at < Date.now() - DAY_MS) continue;
      booked[centralDay(at)] = (booked[centralDay(at)] ?? 0) + 1;
      if (status !== "sent") last = Math.max(last, at);
    }
  }
  return { booked, last };
}

// ---- Connecting Gmail ----

/** For the Email settings and the Outreach drawer: the mailbox, what's missing before sending, and today's count. */
export const mailbox = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { organization } = await requireMember(ctx, organizationId);
    const live = await liveMailbox(ctx, organizationId);
    const last = live ?? (await lastMailbox(ctx, organizationId));
    const { booked } = await bookedDays(ctx, organizationId);
    return {
      connected: live ? { email: live.email, name: live.name, dailyCap: live.dailyCap, connectedAt: live.connectedAt } : null,
      /** Disconnected, or Google took the permission back: what happened, to say so. */
      lost: !live && last?.revokedAt ? { email: last.email, why: last.lastError ?? "Disconnected" } : null,
      setupMissing: setupMissing(),
      postal: postalOf(organization) ?? null,
      replies: Boolean(process.env.REPLY_DOMAIN),
      today: booked[centralDay(Date.now())] ?? 0,
    };
  },
});

/** "Connect Gmail": where to send the person (Google's consent screen); they come back to `returnTo`. */
export const connectGmail = mutation({
  args: { organizationId: v.id("organizations"), returnTo: v.optional(v.string()) },
  handler: async (ctx, { organizationId, returnTo }) => {
    const { user } = await requireMember(ctx, organizationId, "admin");
    const missing = setupMissing();
    if (missing.length) fail("INVALID", `Email isn't set up on the server yet: ${missing.join(" and ")}`);
    const state = randomToken();
    await ctx.db.insert("mailboxStates", {
      stateHash: await sha256(state),
      userId: user._id,
      organizationId,
      returnTo: returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/settings/organization?tab=email",
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    return authUrl(state, user.email);
  },
});

/** The callback's first step: the state it brought back, used up. */
export const takeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db.query("mailboxStates").withIndex("by_state", (q) => q.eq("stateHash", state)).first();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return { userId: row.userId, organizationId: row.organizationId, returnTo: row.returnTo };
  },
});

/** The callback's last step: the mailbox kept (the refresh token sealed), any earlier one let go, and paused sends planned again. */
export const saveMailbox = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    email: v.string(),
    name: v.optional(v.string()),
    refreshTokenEnc: v.string(),
    accessToken: v.string(),
    accessExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = nowIso();
    const earlier = await ctx.db.query("mailboxes").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
    const cap = earlier.sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0]?.dailyCap ?? DEFAULT_DAILY_CAP;
    for (const m of earlier) if (!m.revokedAt) await ctx.db.patch(m._id, { revokedAt: now, lastError: "Another Gmail was connected" });
    const id = await ctx.db.insert("mailboxes", { ...args, email: args.email.toLowerCase(), dailyCap: cap, connectedAt: now });
    await replan(ctx, args.organizationId, "paused");
    return id;
  },
});

/** Sends of one status planned again from now (after a reconnect, or a pause), within the daily limit. */
async function replan(ctx: MutationCtx, organizationId: Id<"organizations">, status: "paused" | "scheduled") {
  const mailbox = await liveMailbox(ctx, organizationId);
  if (!mailbox) return 0;
  const rows = (await ctx.db.query("outreachEmails").withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId).eq("status", status)).collect()).sort(
    (a, b) => (a.sendAt ?? 0) - (b.sendAt ?? 0),
  );
  if (rows.length === 0) return 0;
  const { booked, last } = await bookedDays(ctx, organizationId);
  const times = plan(rows.length, { now: Date.now(), cap: mailbox.dailyCap, booked, after: status === "paused" ? last : undefined });
  for (const [i, r] of rows.entries()) await ctx.db.patch(r._id, { status: "scheduled", sendAt: Math.max(times[i], r.sendAt && status === "paused" ? r.sendAt : 0) });
  return rows.length;
}

export const disconnect = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId, "admin");
    const live = await liveMailbox(ctx, organizationId);
    if (!live) return null;
    await ctx.db.patch(live._id, { revokedAt: nowIso(), lastError: "Disconnected" });
    await pauseAll(ctx, organizationId);
    return null;
  },
});

async function pauseAll(ctx: MutationCtx, organizationId: Id<"organizations">) {
  for (const status of ["scheduled", "sending"] as const) {
    const rows = await ctx.db.query("outreachEmails").withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId).eq("status", status)).collect();
    for (const r of rows) await ctx.db.patch(r._id, { status: "paused" });
  }
}

export const setDailyCap = mutation({
  args: { organizationId: v.id("organizations"), dailyCap: v.number() },
  handler: async (ctx, { organizationId, dailyCap }) => {
    await requireMember(ctx, organizationId, "admin");
    const live = await liveMailbox(ctx, organizationId);
    if (!live) fail("NOT_FOUND", "Connect Gmail first");
    const cap = Math.round(dailyCap);
    if (!(cap >= 1 && cap <= MAX_DAILY_CAP)) fail("INVALID", `Pick 1 to ${MAX_DAILY_CAP} a day`);
    await ctx.db.patch(live._id, { dailyCap: cap });
    await replan(ctx, organizationId, "scheduled");
    return null;
  },
});

// ---- Drafting ----

type Pick = { contact: Doc<"outreachContacts">; to: string; sample: boolean };

/** Which of these owners can be emailed now, and why the others can't. */
async function sortOut(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">, contactIds: Id<"outreachContacts">[]) {
  const picks: Pick[] = [];
  const skipped: Partial<Record<NotEmailed, number>> = {};
  const skip = (why: NotEmailed) => (skipped[why] = (skipped[why] ?? 0) + 1);
  for (const id of new Set(contactIds)) {
    const contact = await ctx.db.get(id);
    if (!contact || contact.organizationId !== organizationId) continue;
    const to = addressFor(contact.emails);
    const state = contact.email?.state;
    if (state === "opted_out") skip("opted_out");
    else if (state === "emailed" || state === "replied") skip("emailed");
    else if (state === "scheduled") skip("in_progress");
    else if (!to) skip("no_email");
    else if (await optedOut(ctx, organizationId, to)) skip("opted_out");
    else picks.push({ contact, to, sample: isSampleRun(contact) || Boolean(cellFor(cellsOf(contact), "email").simulated) || isSampleAddress(to) });
  }
  return { picks, skipped };
}
const skippedText = (skipped: Partial<Record<NotEmailed, number>>) => (Object.entries(skipped) as Array<[NotEmailed, number]>).map(([why, n]) => NOT_EMAILED_TEXT[why](n));

/** Before "Email these": how many of these owners can be emailed, and why the rest can't. */
export const check = query({
  args: { organizationId: v.id("organizations"), contactIds: v.array(v.id("outreachContacts")) },
  handler: async (ctx, { organizationId, contactIds }) => {
    await requirePro(ctx, organizationId);
    const { picks, skipped } = await sortOut(ctx, organizationId, contactIds.slice(0, 1000));
    return { count: picks.length, sample: picks.filter((p) => p.sample).length, skipped: skippedText(skipped) };
  },
});

/** "Email these": a batch of drafts, written in the background; the drawer watches them land. */
export const start = mutation({
  args: { organizationId: v.id("organizations"), contactIds: v.array(v.id("outreachContacts")), followUps: v.optional(v.boolean()) },
  handler: async (ctx, { organizationId, contactIds, followUps = true }) => {
    const { user } = await requirePro(ctx, organizationId);
    await requireMember(ctx, organizationId, "admin");
    const { picks: all, skipped } = await sortOut(ctx, organizationId, contactIds);
    const picks = all.slice(0, BATCH_MAX);
    if (picks.length === 0) return { campaignId: null, count: 0, skipped: skippedText(skipped), more: 0 };
    const now = nowIso();
    const campaignId = await ctx.db.insert("emailCampaigns", { organizationId, createdBy: user._id, createdAt: now, followUps: followUps ? FOLLOW_UP_DAYS : [], status: "drafting" });
    for (const p of picks) {
      // An earlier batch's unsent drafts for this owner give way to this one.
      for (const old of await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", p.contact._id)).collect()) if (old.status === "draft") await ctx.db.patch(old._id, { status: "cancelled" });
      await ctx.db.insert("outreachEmails", {
        organizationId,
        campaignId,
        contactId: p.contact._id,
        step: 0,
        to: p.to,
        subject: "",
        body: "",
        sample: p.sample || undefined,
        writing: true,
        status: "draft",
        replyToken: randomToken(18),
      });
      await ctx.db.patch(p.contact._id, { email: { state: "drafted", at: now } });
    }
    await ctx.scheduler.runAfter(0, internal.emailOutreach.writeDrafts, { campaignId });
    return { campaignId, count: picks.length, skipped: skippedText(skipped), more: all.length - picks.length };
  },
});

/** What each draft is written from: the owner, the property and its records, the research, and who's writing. */
export const draftJobs = internalQuery({
  args: { campaignId: v.id("emailCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return [];
    const org = (await ctx.db.get(campaign.organizationId))!;
    const writer = await ctx.db.get(campaign.createdBy);
    const trades: string[] = [];
    for (const slug of (org.leadTrades ?? []).slice(0, 4)) {
      const industry = await ctx.db.query("industries").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
      if (industry) trades.push(industry.name);
    }
    const city = cityOf(knownCounty(org.outreachCounty));
    const emails = (await ctx.db.query("outreachEmails").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect()).filter((e) => e.step === 0 && e.writing && e.status === "draft");
    const jobs: Array<{ emailId: Id<"outreachEmails">; input: DraftInput }> = [];
    for (const e of emails) {
      const c = await ctx.db.get(e.contactId);
      if (!c) continue;
      const research = c.research && !cellFor(cellsOf(c), "research").simulated && !isSampleRun(c) && !/^NOTHING FOUND/i.test(c.research.answer) ? c.research.answer : undefined;
      jobs.push({
        emailId: e._id,
        input: {
          owner: {
            name: c.name,
            company: c.company,
            person: c.person && !cellFor(cellsOf(c), "person").simulated ? { name: c.person.name, title: c.person.title, source: c.person.source } : undefined,
            // The roll's capitals tidied, so a draft says "About 1200 N Garfield St".
            property: c.property ? { address: tidyCase(c.property.address), city, state: "TX" } : undefined,
            mailing: { ...c.mailing, address: tidyCase(c.mailing.address), city: tidyCase(c.mailing.city) },
          },
          why: c.why,
          signals: (c.signals ?? []).slice(0, 2).map((s) => `${SIGNAL_WORDS[s.kind] ?? s.kind}, ${s.detail}, ${new Date(s.date).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`),
          research,
          sender: { name: writer?.name ?? org.name, company: org.name, trades, phone: org.phone, city },
          followUps: campaign.followUps.length,
        },
      });
    }
    return jobs;
  },
});

/** Writes the batch's drafts, a few at a time, each landing on its card as it's done. */
export const writeDrafts = internalAction({
  args: { campaignId: v.id("emailCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const jobs: Array<{ emailId: Id<"outreachEmails">; input: DraftInput }> = await ctx.runQuery(internal.emailOutreach.draftJobs, { campaignId });
    for (let i = 0; i < jobs.length; i += 4) {
      await Promise.all(
        jobs.slice(i, i + 4).map(async (job) => {
          const d = await writeDraft(job.input);
          await ctx.runMutation(internal.emailOutreach.fillDraft, { emailId: job.emailId, subject: d.subject, body: d.body, followUps: d.followUps, by: d.by });
        }),
      );
    }
    await ctx.runMutation(internal.emailOutreach.doneDrafting, { campaignId });
  },
});

export const fillDraft = internalMutation({
  args: { emailId: v.id("outreachEmails"), subject: v.string(), body: v.string(), followUps: v.array(v.string()), by: v.union(v.literal("claude"), v.literal("template")) },
  handler: async (ctx, { emailId, subject, body, followUps, by }) => {
    const e = await ctx.db.get(emailId);
    if (!e || e.status !== "draft") return;
    await ctx.db.patch(emailId, { subject, body, by, writing: undefined });
    for (const [i, text] of followUps.entries()) {
      await ctx.db.insert("outreachEmails", {
        organizationId: e.organizationId,
        campaignId: e.campaignId,
        contactId: e.contactId,
        step: i + 1,
        to: e.to,
        subject: `Re: ${subject}`,
        body: text,
        sample: e.sample,
        by,
        status: "draft",
        replyToken: e.replyToken,
      });
    }
  },
});

export const doneDrafting = internalMutation({
  args: { campaignId: v.id("emailCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (c?.status === "drafting") await ctx.db.patch(campaignId, { status: "review" });
  },
});

async function campaignOf(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">, campaignId: Id<"emailCampaigns">) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.organizationId !== organizationId) fail("NOT_FOUND", "No such email batch");
  return campaign;
}

/** The drawer: each owner's drafts (or sends), the mailbox, and when the batch would go if approved now. */
export const campaign = query({
  args: { organizationId: v.id("organizations"), campaignId: v.id("emailCampaigns") },
  handler: async (ctx, { organizationId, campaignId }) => {
    const { organization } = await requireMember(ctx, organizationId);
    const campaign = await campaignOf(ctx, organizationId, campaignId);
    const emails = (await ctx.db.query("outreachEmails").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect()).filter((e) => e.status !== "cancelled");
    const byContact = new Map<Id<"outreachContacts">, Doc<"outreachEmails">[]>();
    for (const e of emails) byContact.set(e.contactId, [...(byContact.get(e.contactId) ?? []), e]);
    const owners = [];
    for (const [contactId, list] of byContact) {
      const c = await ctx.db.get(contactId);
      if (!c) continue;
      owners.push({
        contactId,
        name: c.person?.name ?? c.name,
        company: c.company,
        property: tidyCase(c.property?.address),
        to: list[0].to,
        sample: Boolean(list[0].sample),
        replied: c.email?.state === "replied",
        emails: list.sort((a, b) => a.step - b.step).map((e) => ({ id: e._id, step: e.step, subject: e.subject, body: e.body, status: e.status, writing: Boolean(e.writing), sendAt: e.sendAt, sentAt: e.sentAt, error: e.error })),
      });
    }
    const mailbox = await liveMailbox(ctx, organizationId);
    const firsts = owners.filter((o) => o.emails[0]?.status === "draft").length;
    let schedule: { first: number; last: number; days: number } | null = null;
    if (mailbox && firsts > 0) {
      const { booked, last } = await bookedDays(ctx, organizationId);
      const times = plan(firsts, { now: Date.now(), cap: mailbox.dailyCap, booked, after: last, rand: () => 0.5 });
      schedule = { first: times[0], last: times[times.length - 1], days: new Set(times.map(centralDay)).size };
    }
    return {
      id: campaign._id,
      status: campaign.status,
      followUps: campaign.followUps,
      owners,
      writing: owners.filter((o) => o.emails[0]?.writing).length,
      mailbox: mailbox ? { email: mailbox.email, dailyCap: mailbox.dailyCap } : null,
      postal: postalOf(organization) ?? null,
      footer: footerOf(organization),
      schedule,
    };
  },
});

export const editDraft = mutation({
  args: { organizationId: v.id("organizations"), emailId: v.id("outreachEmails"), subject: v.optional(v.string()), body: v.optional(v.string()) },
  handler: async (ctx, { organizationId, emailId, subject, body }) => {
    await requireMember(ctx, organizationId, "admin");
    const e = await ctx.db.get(emailId);
    if (!e || e.organizationId !== organizationId) fail("NOT_FOUND", "No such email");
    if (e.status !== "draft" && e.status !== "waiting") fail("INVALID", "That email has already gone");
    const patch: Partial<Doc<"outreachEmails">> = {};
    if (subject !== undefined) patch.subject = subject.trim().slice(0, 120) || e.subject;
    if (body !== undefined) patch.body = body.trim().slice(0, 4000) || e.body;
    await ctx.db.patch(emailId, patch);
    // The follow-ups keep the first email's subject, as replies in its thread.
    if (e.step === 0 && patch.subject) {
      for (const f of await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", e.contactId)).collect()) {
        if (f.campaignId === e.campaignId && f.step > 0 && (f.status === "draft" || f.status === "waiting")) await ctx.db.patch(f._id, { subject: `Re: ${patch.subject}` });
      }
    }
    return null;
  },
});

/** Takes an owner out of the batch before it goes. */
export const removeOwner = mutation({
  args: { organizationId: v.id("organizations"), campaignId: v.id("emailCampaigns"), contactId: v.id("outreachContacts") },
  handler: async (ctx, { organizationId, campaignId, contactId }) => {
    await requireMember(ctx, organizationId, "admin");
    await campaignOf(ctx, organizationId, campaignId);
    await dropFromCampaign(ctx, campaignId, contactId);
    return null;
  },
});

async function dropFromCampaign(ctx: MutationCtx, campaignId: Id<"emailCampaigns">, contactId: Id<"outreachContacts">) {
  let sent = false;
  for (const e of await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", contactId)).collect()) {
    if (e.campaignId !== campaignId) continue;
    if (e.status === "sent") sent = true;
    else if (e.status !== "cancelled" && e.status !== "failed") await ctx.db.patch(e._id, { status: "cancelled" });
  }
  const c = await ctx.db.get(contactId);
  if (c && !sent && (c.email?.state === "drafted" || c.email?.state === "scheduled")) await ctx.db.patch(contactId, { email: undefined });
}

/** Closes the drawer without sending: the drafts go, and the owners can be emailed later. */
export const discard = mutation({
  args: { organizationId: v.id("organizations"), campaignId: v.id("emailCampaigns") },
  handler: async (ctx, { organizationId, campaignId }) => {
    await requireMember(ctx, organizationId, "admin");
    const campaign = await campaignOf(ctx, organizationId, campaignId);
    if (campaign.status !== "drafting" && campaign.status !== "review") return null;
    const contactIds = new Set((await ctx.db.query("outreachEmails").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect()).map((e) => e.contactId));
    for (const id of contactIds) await dropFromCampaign(ctx, campaignId, id);
    await ctx.db.patch(campaignId, { status: "cancelled" });
    return null;
  },
});

/** "Approve and send": the first emails planned out over working days within the limit; the follow-ups wait for theirs to go. */
export const approve = mutation({
  args: { organizationId: v.id("organizations"), campaignId: v.id("emailCampaigns") },
  handler: async (ctx, { organizationId, campaignId }) => {
    const { organization } = await requireMember(ctx, organizationId, "admin");
    const campaign = await campaignOf(ctx, organizationId, campaignId);
    if (campaign.status !== "review" && campaign.status !== "drafting") fail("INVALID", "This batch has already been approved");
    const mailbox = await liveMailbox(ctx, organizationId);
    if (!mailbox) fail("INVALID", "Connect Gmail first");
    if (!postalOf(organization)) fail("INVALID", "Add the company's street address first: the law asks every email to carry it");
    const emails = (await ctx.db.query("outreachEmails").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect()).filter((e) => e.status === "draft");
    if (emails.some((e) => e.writing)) fail("INVALID", "Still writing; one moment");
    const firsts = emails.filter((e) => e.step === 0);
    if (firsts.length === 0) fail("INVALID", "No emails left in this batch");
    const { booked, last } = await bookedDays(ctx, organizationId);
    const times = plan(firsts.length, { now: Date.now(), cap: mailbox.dailyCap, booked, after: last });
    const now = nowIso();
    for (const [i, e] of firsts.entries()) {
      await ctx.db.patch(e._id, { status: "scheduled", sendAt: times[i] });
      await ctx.db.patch(e.contactId, { email: { state: "scheduled", at: now } });
    }
    for (const e of emails) if (e.step > 0) await ctx.db.patch(e._id, { status: "waiting" });
    await ctx.db.patch(campaignId, { status: "sending", approvedAt: now });
    return { count: firsts.length, first: times[0], last: times[times.length - 1] };
  },
});

// ---- Sending ----

export const due = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) =>
    (await ctx.db.query("outreachEmails").withIndex("by_status_and_send_at", (q) => q.eq("status", "scheduled").lte("sendAt", now)).take(SEND_PER_RUN)).map((e) => e._id),
});

/**
 * One send, taken for sending: checked once more (the owner hasn't replied
 * or unsubscribed, the mailbox is still connected) and marked "sending" so a
 * second run doesn't take it too. A sample address goes through as sent
 * without leaving. Returns what the action needs, or null to skip it.
 */
export const claim = internalMutation({
  args: { emailId: v.id("outreachEmails") },
  handler: async (ctx, { emailId }) => {
    const e = await ctx.db.get(emailId);
    if (!e || e.status !== "scheduled") return null;
    const contact = await ctx.db.get(e.contactId);
    if (!contact || contact.email?.state === "replied" || contact.email?.state === "opted_out" || (await optedOut(ctx, e.organizationId, e.to))) {
      await ctx.db.patch(emailId, { status: "cancelled" });
      return null;
    }
    const mailbox = await liveMailbox(ctx, e.organizationId);
    if (!mailbox) {
      await ctx.db.patch(emailId, { status: "paused" });
      return null;
    }
    const org = (await ctx.db.get(e.organizationId))!;
    if (!postalOf(org)) {
      await ctx.db.patch(emailId, { status: "paused", error: "The company's street address is missing" });
      return null;
    }
    if (e.sample) {
      await sent(ctx, e, { gmailId: undefined, threadId: undefined, messageId: undefined });
      return null;
    }
    await ctx.db.patch(emailId, { status: "sending" });
    const first = e.step > 0 ? (await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", e.contactId)).collect()).find((x) => x.campaignId === e.campaignId && x.step === 0) : undefined;
    const domain = process.env.REPLY_DOMAIN ?? "webbleads.com";
    return {
      mailbox: { id: mailbox._id, email: mailbox.email, name: mailbox.name, refreshTokenEnc: mailbox.refreshTokenEnc, accessToken: mailbox.accessToken, accessExpiresAt: mailbox.accessExpiresAt },
      fromName: mailbox.name ? `${mailbox.name} (${org.name})` : org.name,
      to: e.to,
      subject: e.subject,
      body: e.body,
      footer: footerOf(org),
      unsubscribeUrl: `${apiOrigin()}/u/${e.replyToken}`,
      replyTo: replyAddress(e.replyToken),
      messageId: `<${e.replyToken}.${e.step}@${domain}>`,
      inReplyTo: first ? (first.messageId ?? `<${e.replyToken}.0@${domain}>`) : undefined,
      threadId: first?.threadId,
    };
  },
});

/** A send gone: the owner marked emailed, and after a first email, its follow-ups planned from the day it went. */
async function sent(ctx: MutationCtx, e: Doc<"outreachEmails">, ids: { gmailId?: string; threadId?: string; messageId?: string }) {
  const now = nowIso();
  await ctx.db.patch(e._id, { status: "sent", sentAt: now, error: undefined, ...ids });
  await ctx.db.patch(e.contactId, { email: { state: "emailed", at: now } });
  if (e.step !== 0) return;
  const campaign = await ctx.db.get(e.campaignId);
  const days = campaign?.followUps ?? [];
  const mailbox = await liveMailbox(ctx, e.organizationId);
  const waiting = (await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", e.contactId)).collect()).filter((x) => x.campaignId === e.campaignId && x.status === "waiting");
  for (const f of waiting) {
    const after = days[f.step - 1];
    if (after === undefined) continue;
    const { booked } = await bookedDays(ctx, e.organizationId);
    const [at] = plan(1, { now: Date.now() + after * DAY_MS, cap: mailbox?.dailyCap ?? DEFAULT_DAILY_CAP, booked });
    await ctx.db.patch(f._id, { status: "scheduled", sendAt: at, ...(ids.threadId ? { threadId: ids.threadId } : {}) });
  }
}

export const markSent = internalMutation({
  args: { emailId: v.id("outreachEmails"), gmailId: v.string(), threadId: v.string(), messageId: v.string() },
  handler: async (ctx, { emailId, ...ids }) => {
    const e = await ctx.db.get(emailId);
    if (e) await sent(ctx, e, ids);
  },
});

/** A send that didn't go: tried once more a little later, then left failed with Google's reason. */
export const markFailed = internalMutation({
  args: { emailId: v.id("outreachEmails"), error: v.string() },
  handler: async (ctx, { emailId, error }) => {
    const e = await ctx.db.get(emailId);
    if (!e) return;
    const tries = (e.tries ?? 0) + 1;
    if (tries < 2) await ctx.db.patch(emailId, { status: "scheduled", sendAt: nextOpen(Date.now() + RETRY_MS), tries, error });
    else await ctx.db.patch(emailId, { status: "failed", tries, error });
  },
});

/** Google took the permission back: the mailbox shows as lost, and every send waits for a reconnect. */
export const mailboxLost = internalMutation({
  args: { mailboxId: v.id("mailboxes"), error: v.string() },
  handler: async (ctx, { mailboxId, error }) => {
    const m = await ctx.db.get(mailboxId);
    if (!m || m.revokedAt) return;
    await ctx.db.patch(mailboxId, { revokedAt: nowIso(), lastError: `Gmail stopped allowing sends (${error}). Connect it again.` });
    await pauseAll(ctx, m.organizationId);
  },
});

export const saveAccess = internalMutation({
  args: { mailboxId: v.id("mailboxes"), accessToken: v.string(), accessExpiresAt: v.number() },
  handler: async (ctx, { mailboxId, ...access }) => {
    await ctx.db.patch(mailboxId, access);
  },
});

/** Every five minutes (crons.ts): the sends whose time has come, from each company's own Gmail. */
export const sendDue = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids = await ctx.runQuery(internal.emailOutreach.due, { now: Date.now() });
    let sentCount = 0;
    const access = new Map<string, string>();
    for (const emailId of ids) {
      const job = await ctx.runMutation(internal.emailOutreach.claim, { emailId });
      if (!job) continue;
      try {
        let token = access.get(job.mailbox.id) ?? (job.mailbox.accessToken && (job.mailbox.accessExpiresAt ?? 0) > Date.now() + 60_000 ? job.mailbox.accessToken : undefined);
        if (!token) {
          const fresh = await refreshAccess(await open(job.mailbox.refreshTokenEnc));
          token = fresh.access;
          await ctx.runMutation(internal.emailOutreach.saveAccess, { mailboxId: job.mailbox.id, accessToken: fresh.access, accessExpiresAt: fresh.expiresAt });
        }
        access.set(job.mailbox.id, token);
        const raw = rawMessage({
          from: { name: job.fromName, email: job.mailbox.email },
          to: job.to,
          subject: job.subject,
          body: job.body,
          footer: job.footer,
          unsubscribeUrl: job.unsubscribeUrl,
          replyTo: job.replyTo,
          messageId: job.messageId,
          inReplyTo: job.inReplyTo,
        });
        const out = await sendRaw(token, raw, job.threadId);
        await ctx.runMutation(internal.emailOutreach.markSent, { emailId, gmailId: out.id, threadId: out.threadId, messageId: job.messageId });
        sentCount++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (isRevoked(e)) {
          await ctx.runMutation(internal.emailOutreach.mailboxLost, { mailboxId: job.mailbox.id, error: message });
          access.delete(job.mailbox.id);
        } else await ctx.runMutation(internal.emailOutreach.markFailed, { emailId, error: message });
      }
    }
    return { sent: sentCount };
  },
});

// ---- Unsubscribe and replies ----

/** An unsubscribe from an email's link: never emailed again by that company, and nothing more goes. */
export const optOut = internalMutation({
  args: { token: v.string(), how: v.optional(v.union(v.literal("unsubscribe"), v.literal("reply"))) },
  handler: async (ctx, { token, how = "unsubscribe" }) => {
    const e = await ctx.db.query("outreachEmails").withIndex("by_reply_token", (q) => q.eq("replyToken", token)).first();
    if (!e) return null;
    const org = await ctx.db.get(e.organizationId);
    if (!(await optedOut(ctx, e.organizationId, e.to))) await ctx.db.insert("emailOptOuts", { organizationId: e.organizationId, email: e.to.toLowerCase(), at: nowIso(), how });
    await stopFor(ctx, e.contactId);
    const c = await ctx.db.get(e.contactId);
    if (c && c.email?.state !== "replied") await ctx.db.patch(e.contactId, { email: { state: "opted_out", at: nowIso() } });
    return { company: org?.name ?? "the sender" };
  },
});

/** Nothing more goes to this owner: every send not yet gone is cancelled. */
async function stopFor(ctx: MutationCtx, contactId: Id<"outreachContacts">) {
  for (const x of await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", contactId)).collect()) {
    if (x.status === "scheduled" || x.status === "waiting" || x.status === "paused" || x.status === "draft") await ctx.db.patch(x._id, { status: "cancelled" });
  }
}

const STOP_WORDS = /\b(unsubscribe|remove me|stop emailing|do not (contact|email)|don'?t (contact|email))\b/i;

/**
 * An owner's reply, from the reply address (http.ts /email/inbound): marked
 * Replied with their words, their follow-ups stopped, sent to Leads with the
 * reply, and the contractor told by email so they can answer from Gmail. An
 * out-of-office note changes nothing; "remove me" also opts them out.
 */
export const recordReply = internalMutation({
  args: { token: v.string(), from: v.string(), subject: v.optional(v.string()), text: v.string(), headers: v.optional(v.record(v.string(), v.string())) },
  handler: async (ctx, { token, from, subject, text, headers }) => {
    const e = await ctx.db.query("outreachEmails").withIndex("by_reply_token", (q) => q.eq("replyToken", token)).first();
    if (!e) return { ok: false as const, why: "unknown token" };
    if (isAutoReply(subject, headers)) return { ok: false as const, why: "auto-reply" };
    const contact = await ctx.db.get(e.contactId);
    if (!contact) return { ok: false as const, why: "owner gone" };
    const words = replyText(text) || "(no text)";
    const now = nowIso();
    await stopFor(ctx, contact._id);
    if (STOP_WORDS.test(words) && !(await optedOut(ctx, e.organizationId, e.to))) await ctx.db.insert("emailOptOuts", { organizationId: e.organizationId, email: e.to.toLowerCase(), at: now, how: "reply" });
    await ctx.db.patch(contact._id, { email: { state: "replied", at: now, replyText: words } });
    const campaign = await ctx.db.get(e.campaignId);
    const leadId = await leadFromReply(ctx, (await ctx.db.get(contact._id))!, campaign!.createdBy, words);
    const mailbox = await lastMailbox(ctx, e.organizationId);
    if (mailbox) {
      await ctx.scheduler.runAfter(0, internal.emailOutreach.tellContractor, {
        to: mailbox.email,
        owner: contact.person?.name ?? contact.name,
        company: contact.company,
        from,
        subject: subject ?? e.subject,
        words,
        leadUrl: `${siteUrl()}/leads?lead=${leadId}`,
      });
    }
    return { ok: true as const, leadId };
  },
});

/** The reply, to the contractor's own inbox: Reply-To is the owner, so answering from Gmail reaches them. */
export const tellContractor = internalAction({
  args: { to: v.string(), owner: v.string(), company: v.optional(v.string()), from: v.string(), subject: v.string(), words: v.string(), leadUrl: v.string() },
  handler: async (_ctx, a) => {
    const who = a.company && a.company !== a.owner ? `${a.owner} (${a.company})` : a.owner;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await sendEmail([a.to], {
      subject: `${who} replied: ${a.subject.replace(/^re:\s*/i, "")}`,
      text: `${who} replied to your email:\n\n${a.words}\n\nReply to this email to answer them from your own inbox. They're on your Leads page now: ${a.leadUrl}`,
      html: `<p>${esc(who)} replied to your email:</p><blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ccc;color:#333">${esc(a.words).replace(/\n/g, "<br>")}</blockquote><p>Reply to this email to answer them from your own inbox. They're on your <a href="${a.leadUrl}">Leads page</a> now.</p>`,
      replyTo: a.from,
    });
  },
});

// ---- For the owners on the Outreach page ----

/** An owner's emails, newest batch first, for their sheet. */
export const ofOwner = query({
  args: { organizationId: v.id("organizations"), contactId: v.id("outreachContacts") },
  handler: async (ctx, { organizationId, contactId }) => {
    await requireMember(ctx, organizationId);
    const c = await ctx.db.get(contactId);
    if (!c || c.organizationId !== organizationId) return null;
    const emails = (await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", contactId)).collect())
      .filter((e) => e.status !== "cancelled" && e.status !== "draft")
      .sort((a, b) => (a.sentAt ?? String(a.sendAt ?? "")).localeCompare(b.sentAt ?? String(b.sendAt ?? "")) || a.step - b.step);
    return {
      state: c.email?.state,
      replyText: c.email?.replyText,
      repliedAt: c.email?.state === "replied" ? c.email.at : undefined,
      emails: emails.map((e) => ({ id: e._id, step: e.step, to: e.to, subject: e.subject, body: e.body, status: e.status, sendAt: e.sendAt, sentAt: e.sentAt, sample: Boolean(e.sample), error: e.error })),
    };
  },
});
