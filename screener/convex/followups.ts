// What happens on a clock: follow-ups after silence, then ghosted; interview
// reminders; the rebook text after a no-show. Automated texts keep to 8am–9pm
// where the client is (lib/time.ts); replies to the rep's own texts go any time.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { cancelJobs } from "./applicants";
import { nextSendable, nightBefore, spoken } from "./lib/time";
import { textApplicant } from "./tools";

const HOUR = 3_600_000;
/** Silence before each follow-up, then before giving up: 4 hours, then a day, then a day. */
export const LADDER = [4 * HOUR, 24 * HOUR, 24 * HOUR];

/**
 * Hourly: anyone who went quiet on us gets follow-up 1 after 4 hours,
 * follow-up 2 a day after that, and is marked ghosted a day after that.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const status of ["texted", "screening"] as const) {
      for (const a of await ctx.db.query("applicants").withIndex("by_status", (q) => q.eq("status", status)).collect()) {
        if (a.replying || a.followUpPending || !a.lastOutboundAt) continue;
        // Their turn to talk: our text is the latest.
        if (a.lastInboundAt && a.lastInboundAt >= a.lastOutboundAt) continue;
        const quiet = now - Date.parse(a.lastOutboundAt);
        if (quiet < LADDER[Math.min(a.followUps, 2)]) continue;
        if (a.followUps >= 2) {
          // The brief: ghosting twice mid-conversation is an instant no.
          await ctx.db.patch(a._id, { status: "ghosted", score: a.score ?? "C", notes: [a.notes, "Ghosted after two follow-ups."].filter(Boolean).join("\n") });
          continue;
        }
        const client = await ctx.db.get(a.clientId);
        const at = nextSendable(new Date(now), client?.timezone ?? "America/Chicago").getTime();
        await ctx.db.patch(a._id, { followUps: a.followUps + 1, followUpPending: true });
        await ctx.scheduler.runAt(at, internal.agent.followUp, { applicantId: a._id, n: a.followUps + 1 });
      }
    }
  },
});

/** A follow-up that didn't go out doesn't block the next sweep. */
export const clearFollowUp = internalMutation({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    if (await ctx.db.get(applicantId)) await ctx.db.patch(applicantId, { followUpPending: false });
  },
});

type Booked = { applicantId: Id<"applicants">; interviewAt: string; calBookingUid: string; email?: string };

/** Reminders for an interview just booked (or rebooked); the old ones are cancelled. */
export const booked = internalMutation({
  args: { applicantId: v.id("applicants"), interviewAt: v.string(), calBookingUid: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, args) => markBooked(ctx, args),
});

async function markBooked(ctx: MutationCtx, { applicantId, interviewAt, calBookingUid, email }: Booked) {
    const a = (await ctx.db.get(applicantId))!;
    await cancelJobs(ctx, a);
    const client = (await ctx.db.get(a.clientId))!;
    const at = Date.parse(interviewAt);
    const now = Date.now();
    const jobIds: Id<"_scheduled_functions">[] = [];
    const evening = nightBefore(new Date(at), client.timezone).getTime();
    // Booked for tomorrow after 8pm tonight, or for today: no night-before text.
    if (evening > now) jobIds.push(await ctx.scheduler.runAt(evening, internal.followups.remind, { applicantId, interviewAt, kind: "night_before" }));
    if (at - HOUR > now) jobIds.push(await ctx.scheduler.runAt(at - HOUR, internal.followups.remind, { applicantId, interviewAt, kind: "hour_before" }));
    await ctx.db.patch(applicantId, {
      status: "booked",
      interviewAt,
      calBookingUid,
      bookedAt: new Date(now).toISOString(),
      jobIds,
      remindersSent: [],
      ...(email ? { answers: { ...a.answers, email } } : {}),
    });
}

/** A reminder: a fixed text, so it's right every time. Skipped if the interview moved or they're no longer booked. */
export const remind = internalAction({
  args: { applicantId: v.id("applicants"), interviewAt: v.string(), kind: v.union(v.literal("night_before"), v.literal("hour_before")) },
  handler: async (ctx, { applicantId, interviewAt, kind }) => {
    const now = await ctx.runQuery(internal.applicants.context, { applicantId });
    if (!now || now.applicant.status !== "booked" || now.applicant.interviewAt !== interviewAt) return;
    const { applicant, client } = now;
    const first = applicant.name.split(" ")[0];
    const when = spoken(new Date(interviewAt), client.timezone);
    const body =
      kind === "night_before"
        ? `Hi ${first}, reminder: your interview for the ${client.role} role with ${client.name} is tomorrow, ${when}. Reply here if anything changes.`
        : `Hi ${first}, your ${client.name} interview starts in an hour (${when}). Reply here if you're running late.`;
    await textApplicant(ctx, applicantId, body);
    await ctx.runMutation(internal.followups.reminderSent, { applicantId, kind });
  },
});

export const reminderSent = internalMutation({
  args: { applicantId: v.id("applicants"), kind: v.string() },
  handler: async (ctx, { applicantId, kind }) => {
    const a = (await ctx.db.get(applicantId))!;
    await ctx.db.patch(applicantId, { remindersSent: [...(a.remindersSent ?? []), kind] });
  },
});

/** A missed interview: marked, and the rep gets one text to pick a new time. */
export async function markNoShow(ctx: MutationCtx, applicantId: Id<"applicants">) {
  const a = await ctx.db.get(applicantId);
  if (!a || a.status === "opted_out" || a.status === "no_show") return;
  await cancelJobs(ctx, a);
  await ctx.db.patch(applicantId, { status: "no_show" });
  const client = await ctx.db.get(a.clientId);
  const at = nextSendable(new Date(), client?.timezone ?? "America/Chicago").getTime();
  await ctx.scheduler.runAt(at, internal.followups.rebook, { applicantId });
}

export const noShow = internalMutation({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => markNoShow(ctx, applicantId),
});

/** "You're booked for Tue, Nov 10 at 10:00 AM": for a time picked through the booking link. */
export const confirmBooking = internalAction({
  args: { applicantId: v.id("applicants"), interviewAt: v.string() },
  handler: async (ctx, { applicantId, interviewAt }) => {
    const now = await ctx.runQuery(internal.applicants.context, { applicantId });
    if (!now || now.applicant.status !== "booked" || now.applicant.interviewAt !== interviewAt) return;
    const { applicant, client } = now;
    await textApplicant(ctx, applicantId, `You're booked, ${applicant.name.split(" ")[0]}: ${client.name} interview ${spoken(new Date(interviewAt), client.timezone)}. See you then!`);
  },
});

export const rebook = internalAction({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const now = await ctx.runQuery(internal.applicants.context, { applicantId });
    if (!now || now.applicant.status !== "no_show") return;
    const { applicant, client } = now;
    await textApplicant(ctx, applicantId, `Hi ${applicant.name.split(" ")[0]}, we missed you at the ${client.name} interview. Want to grab another time? Pick one here: ${client.calEventLink} or reply with a day that works.`);
  },
});

/**
 * Cal.com's webhook: a rebooking or a reschedule made on Cal.com moves the
 * reminders, a cancel clears them, a no-show mark sends the rebook text and a
 * finished meeting counts as showed. Matched by booking id, else by phone.
 */
export const calEvent = internalMutation({
  args: { trigger: v.string(), uid: v.optional(v.string()), startTime: v.optional(v.string()), phone: v.optional(v.string()), attendeeNoShow: v.optional(v.boolean()) },
  handler: async (ctx, { trigger, uid, startTime, phone, attendeeNoShow }) => {
    const byUid = uid ? await ctx.db.query("applicants").withIndex("by_booking", (q) => q.eq("calBookingUid", uid)).first() : null;
    const byPhone = phone ? (await ctx.db.query("applicants").withIndex("by_phone", (q) => q.eq("phone", phone)).collect()).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0] : undefined;
    const a = byUid ?? byPhone ?? null;
    if (!a) return { matched: false };
    if ((trigger === "BOOKING_CREATED" || trigger === "BOOKING_RESCHEDULED") && uid && startTime) {
      const interviewAt = new Date(startTime).toISOString();
      // Booked through the link (or moved on Cal.com): confirm it by text. One Jordan booked already has its confirmation.
      const known = a.calBookingUid === uid && a.interviewAt === interviewAt;
      await markBooked(ctx, { applicantId: a._id, interviewAt, calBookingUid: uid });
      if (!known) await ctx.scheduler.runAfter(0, internal.followups.confirmBooking, { applicantId: a._id, interviewAt });
    } else if (trigger === "BOOKING_CANCELLED" && a.status === "booked") {
      await cancelJobs(ctx, a);
      await ctx.db.patch(a._id, { status: "qualified", interviewAt: undefined, calBookingUid: undefined });
    } else if (trigger === "BOOKING_NO_SHOW_UPDATED" && attendeeNoShow) {
      await markNoShow(ctx, a._id);
    } else if (trigger === "MEETING_ENDED" && a.status === "booked") {
      await ctx.db.patch(a._id, { status: "interviewed" });
    }
    return { matched: true };
  },
});
