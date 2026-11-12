// The tools Claude has, as the brief names them, and what each one does.
// No Convex functions here: agent.ts calls runTool inside its action.

import type Anthropic from "@anthropic-ai/sdk";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { book, openSlots } from "./lib/calcom";
import { sendText } from "./lib/texts";
import { spoken } from "./lib/time";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "send_text",
    description:
      "Text the applicant now. Use it when you want to send more than one text in a turn; otherwise your final reply is texted for you. Keep it short and plain: no markdown, no emojis.",
    input_schema: { type: "object", properties: { body: { type: "string", description: "The text message, under 320 characters." } }, required: ["body"] },
  },
  {
    name: "get_client_info",
    description: "The client this applicant applied to: the role, the city, the pay plan (comp sheet), the timezone, the next open interview times and the booking link.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "book_interview",
    description:
      "Book the applicant's interview on the client's calendar. Call it with no start to get the open times; then call it with the start the applicant picked (copied exactly from the list) to book it.",
    input_schema: {
      type: "object",
      properties: {
        start: { type: "string", description: "The slot's start, an ISO time from the open times. Leave out to list open times." },
        email: { type: "string", description: "The applicant's email, if they gave one, for the calendar invite." },
      },
    },
  },
  {
    name: "save_applicant",
    description: "Save what you've learned: their answers (merged with what's saved), the A/B/C score, the status and notes for the client.",
    input_schema: {
      type: "object",
      properties: {
        answers: { type: "object", additionalProperties: { type: "string" }, description: "Short question name → their answer, e.g. {\"experience\": \"3 years solar door to door\"}." },
        score: { type: "string", enum: ["A", "B", "C"] },
        status: { type: "string", enum: ["screening", "qualified", "rejected"] },
        notes: { type: "string", description: "Anything the client should know, one or two lines." },
      },
    },
  },
  {
    name: "flag_human",
    description:
      "Alert Myles or a VA with the conversation. Use it when they're angry or confused, ask to stop, ask for a person, or ask something you can't answer from the client info. You stop texting them after this turn.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why, in one line." },
        stop_requested: { type: "boolean", description: "True when they asked to stop being texted in their own words. They're opted out: nothing more is sent to them." },
      },
      required: ["reason"],
    },
  },
];

/** What a turn keeps track of across its tool calls. */
export type TurnState = { applicant: Doc<"recruitApplicants">; client: Doc<"recruitClients">; sentThisTurn: boolean; flagged: boolean };

/** Sends a text to the applicant and logs it. Nothing goes to a number that opted out. */
/** `by`: a staff member's first name, when a person sent it from Ops. */
export async function textApplicant(ctx: ActionCtx, applicantId: Id<"recruitApplicants">, body: string, opts: { followUp?: boolean; by?: string } = {}): Promise<string> {
  const now = await ctx.runQuery(internal.recruiting.applicants.context, { applicantId });
  if (!now || now.optedOut || now.applicant.status === "opted_out") return "Not sent: the applicant opted out.";
  const text = body.trim();
  if (!text) return "Not sent: the text was empty.";
  const r = await sendText(now.applicant.phone, text, { test: now.applicant.test || now.applicant.demo });
  if (r.status === "failed" || r.status === "skipped") throw new Error(`Text not sent: ${r.error}`);
  await ctx.runMutation(internal.recruiting.applicants.logOutbound, { applicantId, body: text, sid: r.providerId, followUp: opts.followUp, by: opts.by });
  return "Sent.";
}

export async function runTool(ctx: ActionCtx, state: TurnState, name: string, input: Record<string, unknown>): Promise<string> {
  const { applicant, client } = state;
  switch (name) {
    case "send_text": {
      const result = await textApplicant(ctx, applicant._id, String(input.body ?? ""));
      if (result === "Sent.") state.sentThisTurn = true;
      return result;
    }
    case "get_client_info": {
      // The open times, when the calendar can be read; the booking link always works.
      let openTimes: unknown;
      try {
        openTimes = (await openSlots(client.calEventTypeId, client.timezone, 7, new Date(), applicant.test || applicant.demo)).slice(0, 6).map((s) => ({ start: s.start, says: spoken(new Date(s.start), client.timezone) }));
      } catch (err) {
        openTimes = `Couldn't read the calendar (${err instanceof Error ? err.message : String(err)}); send the booking link.`;
      }
      return JSON.stringify({
        client: client.name,
        role: client.role,
        city: client.city,
        compSheet: client.compSheet,
        timezone: client.timezone,
        openInterviewTimes: openTimes,
        bookingLink: client.calEventLink,
        now: spoken(new Date(), client.timezone),
      });
    }
    case "book_interview": {
      const start = typeof input.start === "string" ? input.start : undefined;
      if (!start) {
        const slots = (await openSlots(client.calEventTypeId, client.timezone, 7, new Date(), applicant.test || applicant.demo)).slice(0, 8);
        if (slots.length === 0) return `No open times in the next week. Send them the booking link instead: ${client.calEventLink}`;
        return JSON.stringify(slots.map((s) => ({ start: s.start, says: spoken(new Date(s.start), client.timezone) })));
      }
      if (Number.isNaN(Date.parse(start))) return "That start isn't a time. Use one of the open times exactly.";
      const email = typeof input.email === "string" && input.email.includes("@") ? input.email : undefined;
      const booking = await book({ eventTypeId: client.calEventTypeId, start, name: applicant.name, phone: applicant.phone, email, timeZone: client.timezone, test: applicant.test || applicant.demo });
      await ctx.runMutation(internal.recruiting.followups.booked, { applicantId: applicant._id, interviewAt: booking.start, calBookingUid: booking.uid, ...(email ? { email } : {}) });
      return `Booked for ${spoken(new Date(booking.start), client.timezone)} (${client.timezone}). Tell them the time; reminders go out on their own.`;
    }
    case "save_applicant": {
      const answers = input.answers && typeof input.answers === "object" ? Object.fromEntries(Object.entries(input.answers as Record<string, unknown>).map(([k, val]) => [k, String(val)])) : undefined;
      const score = input.score === "A" || input.score === "B" || input.score === "C" ? input.score : undefined;
      const status = input.status === "screening" || input.status === "qualified" || input.status === "rejected" ? input.status : undefined;
      const notes = typeof input.notes === "string" ? input.notes : undefined;
      await ctx.runMutation(internal.recruiting.applicants.save, { applicantId: applicant._id, answers, score, status, notes });
      return "Saved.";
    }
    case "flag_human": {
      const stop = input.stop_requested === true;
      await flagHuman(ctx, applicant._id, String(input.reason ?? "No reason given"), { stopRequested: stop });
      state.flagged = true;
      return stop ? "Flagged, and they're opted out: nothing more can be texted to them, this turn included." : "Flagged. A person will follow up; don't text them again after this turn.";
    }
    default:
      return `There's no tool called ${name}.`;
  }
}

/** Who gets flags: RECRUIT_FLAG_PHONES (comma-separated, e.g. Myles and a VA), else RECRUIT_MYLES_PHONE. */
export const flagPhones = () =>
  (process.env.RECRUIT_FLAG_PHONES ?? process.env.RECRUIT_MYLES_PHONE ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * Hands an applicant to a person: texts Myles (or a VA) a summary with the
 * end of the conversation, and the agent stops replying. When they asked to
 * stop in their own words, they're opted out too, as STOP would.
 */
export async function flagHuman(ctx: ActionCtx, applicantId: Id<"recruitApplicants">, reason: string, opts: { stopRequested?: boolean } = {}): Promise<string> {
  const now = await ctx.runQuery(internal.recruiting.applicants.context, { applicantId });
  if (!now) return "";
  const { applicant, client, messages } = now;
  const first = applicant.name.split(" ")[0];
  const last = messages
    .slice(-6)
    .map((m: { direction: string; body: string }) => `${m.direction === "in" ? first : "Jordan"}: ${m.body}`)
    .join("\n");
  const summary = [
    `Screener flag: ${applicant.name} ${applicant.phone}${opts.stopRequested ? " (asked to stop: opted out)" : ""}`,
    `${client.name} (${client.role}, ${client.city}) · score ${applicant.score ?? "-"} · ad ${applicant.sourceAdId}`,
    `Why: ${reason}`,
    last,
    `Whole thread: ${process.env.SITE_URL ?? ""}/ops/recruiting?applicant=${applicant._id}`,
  ]
    .filter(Boolean)
    .join("\n");
  await ctx.runMutation(internal.recruiting.applicants.setStatus, { applicantId, status: "flagged", note: `Flagged: ${reason}` });
  if (opts.stopRequested) await ctx.runMutation(internal.recruiting.applicants.optOut, { applicantId });
  const to = flagPhones();
  if (to.length === 0) console.error("RECRUIT_FLAG_PHONES isn't set; flag not texted:", summary);
  for (const phone of to) {
    // A test applicant's flag is only logged: nobody gets texted about a test.
    const r = await sendText(phone, summary.slice(0, 1500), { test: applicant.test || applicant.demo });
    if (r.status === "failed" || r.status === "skipped") console.error(`Flag text to ${phone} failed: ${r.error}`);
    else console.log(`Flag texted to ${phone} (${r.status}):\n${summary}`);
  }
  return summary;
}
