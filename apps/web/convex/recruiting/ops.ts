// Ops → Recruiting: what staff see and do for National Sales Registry.
// Clients, applicants and their threads, "Try it" (play a rep against Jordan
// with nothing sent), and the recruiting ads to approve. Staff only.

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { fail, requireStaff } from "../lib/access";
import { approvedOf, decideIn, retireIn, reviewOf, setSpendIn } from "./ads";
import { applyIn, cancelJobs, inboundIn, setOutcome } from "./applicants";
import { checkTimezone, ensureLinks, slugOf } from "./clients";
import { markNoShow } from "./followups";
import { clearIn, liveIn, seedIn } from "./demo";
import { byAdOf } from "./reports";

const clientFields = {
  name: v.string(),
  role: v.string(),
  city: v.string(),
  compSheet: v.string(),
  calEventLink: v.string(),
  calEventTypeId: v.optional(v.number()),
  timezone: v.string(),
  reportEmail: v.optional(v.string()),
  territory: v.optional(v.string()),
  repStories: v.optional(v.array(v.string())),
  perks: v.optional(v.string()),
  wants: v.optional(v.string()),
  adsEnabled: v.optional(v.boolean()),
  active: v.optional(v.boolean()),
};

const applicantView = (a: Doc<"recruitApplicants">, clientName: string, last?: Doc<"recruitMessages">) => ({
  id: a._id,
  name: a.name,
  phone: a.test ? "test" : a.phone,
  clientId: a.clientId,
  client: clientName,
  sourceAdId: a.sourceAdId,
  score: a.score,
  status: a.status,
  notes: a.notes,
  answers: a.answers,
  interviewAt: a.interviewAt,
  outcome: a.outcome,
  createdAt: a.createdAt,
  test: a.test === true,
  demo: a.demo === true,
  replying: a.replying === true,
  lastText: last ? { direction: last.direction, body: last.body, at: last.at } : null,
});

/** Every client, with how many real applicants each has. */
export const clients = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const out = [];
    for (const c of await ctx.db.query("recruitClients").collect()) {
      const applicants = (await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", c._id)).collect()).filter((a) => !a.test);
      out.push({
        ...c,
        id: c._id,
        // Saved before slugs were handed out: the apply page still finds it by its name's slug.
        slug: c.slug ?? slugOf(c.name),
        applicants: applicants.length,
        A: applicants.filter((a) => a.score === "A").length,
        hired: applicants.filter((a) => a.outcome === "hired").length,
      });
    }
    return out.sort((x, y) => x.name.localeCompare(y.name));
  },
});

/** Adds a client, or changes one. */
export const saveClient = mutation({
  args: { clientId: v.optional(v.id("recruitClients")), ...clientFields },
  handler: async (ctx, { clientId, ...fields }) => {
    await requireStaff(ctx);
    checkTimezone(fields.timezone);
    for (const k of ["name", "role", "city", "compSheet", "calEventLink"] as const) if (!fields[k].trim()) fail("INVALID", `${k} is required`);
    const clean = { ...fields, repStories: fields.repStories?.map((s) => s.trim()).filter(Boolean) };
    const id = clientId ?? (await ctx.db.insert("recruitClients", { ...clean, active: clean.active ?? true, createdAt: new Date().toISOString() }));
    if (clientId) await ctx.db.patch(clientId, clean);
    await ensureLinks(ctx, id);
    return id;
  },
});

/** Applicants, newest first: everyone, or one client's, one status's, one score's. Test applicants only when asked for. */
export const applicants = query({
  args: { clientId: v.optional(v.id("recruitClients")), status: v.optional(v.string()), score: v.optional(v.string()) },
  handler: async (ctx, { clientId, status, score }) => {
    await requireStaff(ctx);
    const rows = clientId
      ? await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", clientId)).order("desc").take(500)
      : await ctx.db.query("recruitApplicants").order("desc").take(500);
    const names = new Map<string, string>();
    const out = [];
    for (const a of rows) {
      if (a.test) continue;
      if (status && a.status !== status) continue;
      if (score && (score === "none" ? a.score : a.score !== score)) continue;
      if (!names.has(a.clientId)) names.set(a.clientId, (await ctx.db.get(a.clientId))?.name ?? "?");
      const last = await ctx.db.query("recruitMessages").withIndex("by_applicant", (q) => q.eq("applicantId", a._id)).order("desc").first();
      out.push(applicantView(a, names.get(a.clientId)!, last ?? undefined));
    }
    return out.slice(0, 200);
  },
});

/** One applicant and the whole conversation. */
export const thread = query({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(applicantId);
    if (!a) return null;
    const client = await ctx.db.get(a.clientId);
    const messages = await ctx.db.query("recruitMessages").withIndex("by_applicant", (q) => q.eq("applicantId", applicantId)).collect();
    return { applicant: applicantView(a, client?.name ?? "?"), messages: messages.map((m) => ({ id: m._id, direction: m.direction, body: m.body, at: m.at, by: m.by })) };
  },
});

/** Attendance, when Cal.com's webhook doesn't say: showed, or a no-show (which sends the rebook text). */
export const markAttendance = mutation({
  args: { applicantId: v.id("recruitApplicants"), showed: v.boolean() },
  handler: async (ctx, { applicantId, showed }) => {
    await requireStaff(ctx);
    if (showed) await ctx.db.patch(applicantId, { status: "interviewed" });
    else await markNoShow(ctx, applicantId);
  },
});

/** After the interview: hired, not hired, or cleared. Feeds hires per dollar and the client's report. */
export const markOutcome = mutation({
  args: { applicantId: v.id("recruitApplicants"), outcome: v.union(v.literal("hired"), v.literal("not_hired"), v.null()) },
  handler: async (ctx, { applicantId, outcome }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(applicantId);
    if (!a) fail("NOT_FOUND", "No such applicant");
    await setOutcome(ctx, a, outcome);
  },
});

// ---- The demo: scripted, nothing sent to Claude, Twilio or Cal.com ----

/** Loads (or reloads) the demo client with applicants, threads, ads and hires in every state. */
export const demoSeed = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await seedIn(ctx);
  },
});

/** A new demo rep applies and the scripted conversation plays out over about a minute and a half. */
export const demoLive = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await liveIn(ctx);
  },
});

export const demoClear = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await clearIn(ctx);
  },
});

// ---- Try it: play a rep against Jordan. Texts are only logged, bookings are stubs, nothing counts. ----

const testPhone = (userId: Id<"users">) => `test-${userId}`;

async function clearTests(ctx: MutationCtx, phone: string) {
  for (const a of await ctx.db.query("recruitApplicants").withIndex("by_phone", (q) => q.eq("phone", phone)).collect()) {
    await cancelJobs(ctx, a);
    for (const m of await ctx.db.query("recruitMessages").withIndex("by_applicant", (q) => q.eq("applicantId", a._id)).collect()) await ctx.db.delete(m._id);
    await ctx.db.delete(a._id);
  }
  for (const o of await ctx.db.query("recruitOptOuts").withIndex("by_phone", (q) => q.eq("phone", phone)).collect()) await ctx.db.delete(o._id);
}

/** Starts a fresh test conversation for this staff member with a client: Jordan's first text comes in a second. */
export const tryItStart = mutation({
  args: { clientId: v.id("recruitClients"), name: v.optional(v.string()) },
  handler: async (ctx, { clientId, name }) => {
    const user = await requireStaff(ctx);
    const phone = testPhone(user._id);
    await clearTests(ctx, phone);
    const r = await applyIn(ctx, { name: name?.trim() || "Test Rep", phone, clientId, sourceAdId: "try-it", test: true });
    if (!r.ok) fail("INVALID", r.error);
    return r.applicantId;
  },
});

/** A text "from" the test rep, handled exactly as a real one (STOP and HELP included). */
export const tryItSend = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    const user = await requireStaff(ctx);
    if (!body.trim()) return {};
    return await inboundIn(ctx, { from: testPhone(user._id), body: body.trim(), exact: true });
  },
});

export const tryItReset = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireStaff(ctx);
    await clearTests(ctx, testPhone(user._id));
  },
});

/** This staff member's test conversation, live. */
export const tryIt = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireStaff(ctx);
    const a = (await ctx.db.query("recruitApplicants").withIndex("by_phone", (q) => q.eq("phone", testPhone(user._id))).collect())[0];
    if (!a) return null;
    const client = await ctx.db.get(a.clientId);
    const messages = await ctx.db.query("recruitMessages").withIndex("by_applicant", (q) => q.eq("applicantId", a._id)).collect();
    return { applicant: applicantView(a, client?.name ?? "?"), messages: messages.map((m) => ({ id: m._id, direction: m.direction, body: m.body, at: m.at })) };
  },
});

// ---- The recruiting ads ----

/** Per client: drafts to decide, the latest batch's notes, retire suggestions, and every ad's numbers. */
export const ads = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return { clients: await reviewOf(ctx), approved: await approvedOf(ctx) };
  },
});

export const decideAd = mutation({
  args: { adId: v.id("recruitAds"), decision: v.union(v.literal("approve"), v.literal("reject")) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await decideIn(ctx, args);
  },
});

/** Approves every draft of a client's with no warnings; returns their new source ad ids. */
export const approveClean = mutation({
  args: { clientId: v.id("recruitClients") },
  handler: async (ctx, { clientId }) => {
    await requireStaff(ctx);
    const ids: string[] = [];
    for (const d of await ctx.db.query("recruitAds").withIndex("by_client_status", (q) => q.eq("clientId", clientId).eq("status", "draft")).collect()) {
      if (d.warnings.length) continue;
      const id = await decideIn(ctx, { adId: d._id, decision: "approve" });
      if (id) ids.push(id);
    }
    return ids;
  },
});

export const retireAd = mutation({
  args: { sourceAdId: v.string() },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await retireIn(ctx, args);
  },
});

export const setSpend = mutation({
  args: { sourceAdId: v.string(), dollars: v.number() },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.dollars < 0) fail("INVALID", "Spend can't be negative");
    return await setSpendIn(ctx, args);
  },
});

/** Writes a new batch for a client now (a minute or two); it shows on the page when it lands. */
export const writeBatch = mutation({
  args: { clientId: v.id("recruitClients") },
  handler: async (ctx, { clientId }) => {
    await requireStaff(ctx);
    await ctx.scheduler.runAfter(0, internal.recruiting.adAgent.writeBatch, { clientId });
  },
});

/** Per ad, across clients: applicants, A/B/C, booked, showed, hired, over the last `days`. */
export const byAd = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    await requireStaff(ctx);
    const since = new Date(Date.now() - (days ?? 30) * 86_400_000).toISOString();
    return byAdOf((await ctx.db.query("recruitApplicants").collect()).filter((a) => a.createdAt >= since && !a.test));
  },
});

/** What staff need to wire things up: the address ad forms post applicants to. */
export const setup = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const site = process.env.CONVEX_SITE_URL ?? "";
    return {
      applyUrl: `${site}/recruiting/apply`,
      smsWebhook: `${site}/recruiting/sms`,
      calWebhook: `${site}/recruiting/cal`,
      spendUrl: `${site}/recruiting/ads/spend`,
      ready: {
        claude: Boolean(process.env.ANTHROPIC_API_KEY),
        number: Boolean(process.env.RECRUIT_TWILIO_FROM),
        applySecret: Boolean(process.env.RECRUIT_APPLY_SECRET),
        cal: Boolean(process.env.CAL_API_KEY),
        flags: Boolean(process.env.RECRUIT_FLAG_PHONES ?? process.env.RECRUIT_MYLES_PHONE),
      },
    };
  },
});
