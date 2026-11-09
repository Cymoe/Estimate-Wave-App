// When a person takes a conversation from Jordan: staff text the rep from Ops
// (from Jordan's number, on the same thread), Jordan stays quiet while they
// have it, anything the rep texts back is relayed to the flag phones, and
// "Hand back to Jordan" lets the agent pick up again.

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation } from "../_generated/server";
import { fail, requireStaff } from "../lib/access";
import { flagPhones, textApplicant } from "./tools";
import { sendText } from "./lib/texts";

/** The staff member sending, by first name, as the thread shows it. */
export const whoIsSending = internalQuery({
  args: {},
  handler: async (ctx): Promise<string> => {
    const user = await requireStaff(ctx);
    return (user.name ?? user.email ?? "Staff").trim().split(/[\s@]+/)[0] || "Staff";
  },
});

/** A person has the conversation now: Jordan won't answer until it's handed back. */
export const takeOver = internalMutation({
  args: { applicantId: v.id("recruitApplicants"), by: v.string() },
  handler: async (ctx, { applicantId, by }) => {
    const a = await ctx.db.get(applicantId);
    if (!a) fail("NOT_FOUND", "No such applicant");
    if (a.status === "opted_out") fail("INVALID", "They texted STOP: nothing can be sent to them.");
    if (a.status !== "flagged") {
      await ctx.db.patch(applicantId, { status: "flagged", replying: false, followUpPending: false, notes: [a.notes, `${by} took over from Jordan.`].filter(Boolean).join("\n") });
    }
  },
});

/** Ops → Recruiting: a staff member texts the rep. Sent from Jordan's number and logged on the thread under their name. */
export const reply = action({
  args: { applicantId: v.id("recruitApplicants"), body: v.string() },
  handler: async (ctx, { applicantId, body }): Promise<null> => {
    const by = await ctx.runQuery(internal.recruiting.people.whoIsSending, {});
    const text = body.trim();
    if (!text) fail("INVALID", "Write the text first.");
    if (text.length > 1000) fail("INVALID", "That's too long for a text: keep it under 1,000 characters.");
    await ctx.runMutation(internal.recruiting.people.takeOver, { applicantId, by });
    let result: string;
    try {
      result = await textApplicant(ctx, applicantId, text, { by });
    } catch (err) {
      fail("INVALID", (err instanceof Error ? err.message : String(err)).replace(/^Text not sent: /, "Not sent: "));
    }
    if (result.startsWith("Not sent")) fail("INVALID", result);
    return null;
  },
});

/** Jordan picks the conversation back up; if the rep's text is the last one, Jordan answers it now. */
export const handBack = mutation({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(applicantId);
    if (!a) fail("NOT_FOUND", "No such applicant");
    if (a.status !== "flagged") return;
    const upcoming = a.interviewAt && Date.parse(a.interviewAt) > Date.now() && a.calBookingUid;
    const theirTurnDone = a.lastInboundAt !== undefined && (!a.lastOutboundAt || a.lastInboundAt > a.lastOutboundAt);
    // A demo rep is scripted: Jordan never runs for one.
    const answer = theirTurnDone && !a.demo;
    await ctx.db.patch(applicantId, {
      status: upcoming ? "booked" : "screening",
      notes: [a.notes, "Handed back to Jordan."].filter(Boolean).join("\n"),
      ...(answer ? { replying: true } : {}),
    });
    if (answer) await ctx.scheduler.runAfter(0, internal.recruiting.agent.reply, { applicantId });
  },
});

/** A rep a person has texted again: the flag phones get it, so nobody has to watch the page. */
export const relay = internalAction({
  args: { applicantId: v.id("recruitApplicants"), body: v.string() },
  handler: async (ctx, { applicantId, body }) => {
    const now = await ctx.runQuery(internal.recruiting.applicants.context, { applicantId });
    if (!now) return;
    const a: Doc<"recruitApplicants"> = now.applicant;
    const text = `${a.name} (${now.client.name}) replied: "${body.slice(0, 600)}"\nAnswer in Ops: ${process.env.SITE_URL ?? ""}/ops/recruiting?applicant=${a._id}`;
    for (const phone of flagPhones()) {
      const r = await sendText(phone, text, { test: a.test || a.demo });
      if (r.status === "failed" || r.status === "skipped") console.error(`Relay to ${phone} not sent: ${r.error}`);
    }
  },
});
