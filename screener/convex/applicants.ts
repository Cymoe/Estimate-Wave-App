// Applicants: saving a new one, the texts in and out, and the state the
// agent, the follow-ups and the report read.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { applicantStatus, score } from "./schema";
import { markNoShow as noShowIn } from "./followups";
import { e164, keywordOf, simulating } from "./lib/sms";

const nowIso = () => new Date().toISOString();

/** What Twilio's rules want the HELP reply to say: who we are and how to stop. */
export const helpText = () =>
  `${process.env.SERVICE_NAME ?? "National Sales Registry"}: texts about the sales role you applied for. Msg & data rates may apply. Reply STOP to opt out.${process.env.HELP_CONTACT ? ` Help: ${process.env.HELP_CONTACT}` : ""}`;
const STOP_TEXT = "You're unsubscribed and won't get more texts from us. Reply START to opt back in.";
const START_TEXT = "You're opted back in. Reply STOP anytime to opt out.";
/** Twilio's Advanced Opt-Out answers STOP, START and HELP itself; then we only keep the record. */
const twilioAnswersKeywords = () => process.env.TWILIO_ADVANCED_OPT_OUT === "on";

export async function isOptedOut(ctx: QueryCtx, phone: string) {
  return (await ctx.db.query("optOuts").withIndex("by_phone", (q) => q.eq("phone", phone)).first()) !== null;
}

/** The applicant a number belongs to: their latest application. */
async function latestFor(ctx: QueryCtx, phone: string) {
  const all = await ctx.db.query("applicants").withIndex("by_phone", (q) => q.eq("phone", phone)).collect();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/**
 * A new applicant from an ad. Saves them (or finds them, when the same number
 * applies to the same client again) and has the first text go out within two
 * minutes. Nothing is texted to a number that opted out.
 */
export const apply = internalMutation({
  args: { name: v.string(), phone: v.string(), clientId: v.string(), sourceAdId: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; applicantId: Id<"applicants">; existing: boolean } | { ok: false; error: string }> => {
    const phone = e164(args.phone);
    if (!phone) return { ok: false, error: "phone isn't a US number" };
    const name = args.name.trim();
    if (!name) return { ok: false, error: "name is required" };
    const sourceAdId = args.sourceAdId.trim();
    if (!sourceAdId) return { ok: false, error: "sourceAdId is required" };
    const clientId = ctx.db.normalizeId("clients", args.clientId);
    const client = clientId && (await ctx.db.get(clientId));
    if (!client || !client.active) return { ok: false, error: "no such client" };
    if (await isOptedOut(ctx, phone)) return { ok: false, error: "this number opted out of texts" };

    const same = (await ctx.db.query("applicants").withIndex("by_phone", (q) => q.eq("phone", phone)).collect()).find((a) => a.clientId === client._id);
    if (same) return { ok: true, applicantId: same._id, existing: true };

    const applicantId = await ctx.db.insert("applicants", {
      name,
      phone,
      clientId: client._id,
      sourceAdId,
      answers: {},
      status: "new",
      followUps: 0,
      createdAt: nowIso(),
    });
    // A human-feeling pause, under two minutes; a second in the simulator.
    const delay = simulating() ? 1000 : 30_000 + Math.floor(Math.random() * 90_000);
    await ctx.scheduler.runAfter(delay, internal.agent.firstText, { applicantId });
    return { ok: true, applicantId, existing: false };
  },
});

/**
 * A text from a number. STOP, START and HELP are answered here by the rules,
 * never by the model; anything else is saved and the agent is asked to reply
 * (once, however many texts arrive while it's writing). Returns the text to
 * answer with right away, if any.
 */
export const inbound = internalMutation({
  args: { from: v.string(), body: v.string(), sid: v.optional(v.string()) },
  handler: async (ctx, { from, body, sid }): Promise<{ reply?: string }> => {
    const phone = e164(from) ?? from;
    const optedOut = await isOptedOut(ctx, phone);
    const keyword = keywordOf(body, optedOut);
    const applicant = await latestFor(ctx, phone);
    const at = nowIso();
    if (applicant) await ctx.db.insert("messages", { applicantId: applicant._id, direction: "in", body, at, twilioSid: sid, ...(simulating() ? { simulated: true } : {}) });

    if (keyword === "stop") {
      if (!optedOut) await ctx.db.insert("optOuts", { phone, at });
      for (const a of await ctx.db.query("applicants").withIndex("by_phone", (q) => q.eq("phone", phone)).collect()) {
        await ctx.db.patch(a._id, { status: "opted_out", replying: false, followUpPending: false });
        await cancelJobs(ctx, a);
      }
      return twilioAnswersKeywords() ? {} : { reply: await logged(ctx, applicant, STOP_TEXT) };
    }
    if (keyword === "start") {
      for (const o of await ctx.db.query("optOuts").withIndex("by_phone", (q) => q.eq("phone", phone)).collect()) await ctx.db.delete(o._id);
      // Back where they were in the conversation; the agent picks up when they text next.
      if (applicant?.status === "opted_out") await ctx.db.patch(applicant._id, { status: "screening" });
      return twilioAnswersKeywords() ? {} : { reply: await logged(ctx, applicant, START_TEXT) };
    }
    if (keyword === "help") return twilioAnswersKeywords() ? {} : { reply: await logged(ctx, applicant, helpText()) };

    // Not one of ours, opted out, or handed to a person: nothing goes back.
    if (!applicant || optedOut || applicant.status === "opted_out" || applicant.status === "flagged") return {};

    const status = applicant.status === "new" || applicant.status === "texted" || applicant.status === "ghosted" ? "screening" : applicant.status;
    await ctx.db.patch(applicant._id, { status, lastInboundAt: at, followUps: 0, followUpPending: false });
    if (!applicant.replying) {
      await ctx.db.patch(applicant._id, { replying: true });
      await ctx.scheduler.runAfter(0, internal.agent.reply, { applicantId: applicant._id });
    }
    return {};
  },
});

/** Logs a keyword reply on the applicant's thread and hands back its text. */
async function logged(ctx: MutationCtx, applicant: Doc<"applicants"> | null, text: string) {
  if (applicant) await ctx.db.insert("messages", { applicantId: applicant._id, direction: "out", body: text, at: nowIso(), ...(simulating() ? { simulated: true } : {}) });
  return text;
}

export async function cancelJobs(ctx: MutationCtx, a: Doc<"applicants">) {
  for (const id of a.jobIds ?? []) {
    const job = await ctx.db.system.get(id);
    if (job && job.state.kind === "pending") await ctx.scheduler.cancel(id);
  }
  if (a.jobIds?.length) await ctx.db.patch(a._id, { jobIds: [] });
}

/** Everything the agent needs for a turn: the applicant, their client and the whole thread. */
export const context = internalQuery({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const applicant = await ctx.db.get(applicantId);
    if (!applicant) return null;
    const client = (await ctx.db.get(applicant.clientId))!;
    const messages = await ctx.db.query("messages").withIndex("by_applicant", (q) => q.eq("applicantId", applicantId)).collect();
    return { applicant, client, messages, optedOut: await isOptedOut(ctx, applicant.phone) };
  },
});

/** One text out, logged on the thread. */
export const logOutbound = internalMutation({
  args: { applicantId: v.id("applicants"), body: v.string(), sid: v.optional(v.string()), followUp: v.optional(v.boolean()) },
  handler: async (ctx, { applicantId, body, sid, followUp }) => {
    const at = nowIso();
    await ctx.db.insert("messages", { applicantId, direction: "out", body, at, twilioSid: sid, ...(simulating() ? { simulated: true } : {}) });
    const a = (await ctx.db.get(applicantId))!;
    await ctx.db.patch(applicantId, {
      lastOutboundAt: at,
      ...(a.status === "new" ? { status: "texted" as const } : {}),
      ...(followUp ? { followUpPending: false } : {}),
    });
  },
});

/** The agent's turn is over. Another starts if they texted again while it was writing. */
export const finishReply = internalMutation({
  args: { applicantId: v.id("applicants"), startedAt: v.string() },
  handler: async (ctx, { applicantId, startedAt }) => {
    const a = await ctx.db.get(applicantId);
    if (!a) return;
    const newer = await ctx.db
      .query("messages")
      .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId).gt("at", startedAt))
      .filter((q) => q.eq(q.field("direction"), "in"))
      .first();
    if (newer && a.status !== "flagged" && a.status !== "opted_out") {
      await ctx.scheduler.runAfter(0, internal.agent.reply, { applicantId });
      return;
    }
    await ctx.db.patch(applicantId, { replying: false });
  },
});

/** What `save_applicant` may change. Booking and flagging have their own tools. */
export const save = internalMutation({
  args: {
    applicantId: v.id("applicants"),
    answers: v.optional(v.record(v.string(), v.string())),
    score: v.optional(score),
    status: v.optional(v.union(v.literal("screening"), v.literal("qualified"), v.literal("rejected"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { applicantId, answers, score, status, notes }) => {
    const a = (await ctx.db.get(applicantId))!;
    await ctx.db.patch(applicantId, {
      ...(answers ? { answers: { ...a.answers, ...answers } } : {}),
      ...(score ? { score } : {}),
      ...(status && a.status !== "booked" ? { status } : {}),
      ...(notes ? { notes: [a.notes, notes].filter(Boolean).join("\n") } : {}),
    });
  },
});

export const setStatus = internalMutation({
  args: { applicantId: v.id("applicants"), status: applicantStatus, note: v.optional(v.string()) },
  handler: async (ctx, { applicantId, status, note }) => {
    const a = (await ctx.db.get(applicantId))!;
    await ctx.db.patch(applicantId, { status, ...(note ? { notes: [a.notes, note].filter(Boolean).join("\n") } : {}) });
  },
});

/** Asked to stop in their own words (flag_human with stop_requested): opted out like STOP, kept flagged for a person. */
export const optOut = internalMutation({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const a = (await ctx.db.get(applicantId))!;
    if (!(await isOptedOut(ctx, a.phone))) await ctx.db.insert("optOuts", { phone: a.phone, at: nowIso() });
    for (const other of await ctx.db.query("applicants").withIndex("by_phone", (q) => q.eq("phone", a.phone)).collect()) {
      await cancelJobs(ctx, other);
      await ctx.db.patch(other._id, { followUpPending: false, ...(other._id === applicantId ? {} : { status: "opted_out" as const }) });
    }
  },
});

/** The latest applicant on a number with their thread, for the simulator and for looking someone up. */
export const thread = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const a = await latestFor(ctx, e164(phone) ?? phone);
    if (!a) return null;
    const messages = await ctx.db.query("messages").withIndex("by_applicant", (q) => q.eq("applicantId", a._id)).collect();
    return {
      applicant: { id: a._id, name: a.name, phone: a.phone, status: a.status, score: a.score, answers: a.answers, notes: a.notes, sourceAdId: a.sourceAdId, interviewAt: a.interviewAt, replying: a.replying === true },
      messages: messages.map((m) => ({ direction: m.direction, body: m.body, at: m.at })),
    };
  },
});

/** Attendance, when Cal.com's webhook doesn't say: `npx convex run applicants:markShowed '{"phone":"+1..."}'`. */
export const markShowed = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const a = await latestFor(ctx, e164(phone) ?? phone);
    if (!a) throw new Error("No applicant with that number");
    await ctx.db.patch(a._id, { status: "interviewed" });
  },
});

/** A missed interview: the rep gets one text with the booking link. `npx convex run applicants:markNoShow '{"phone":"+1..."}'`. */
export const markNoShow = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const a = await latestFor(ctx, e164(phone) ?? phone);
    if (!a) throw new Error("No applicant with that number");
    await noShowIn(ctx, a._id);
  },
});
