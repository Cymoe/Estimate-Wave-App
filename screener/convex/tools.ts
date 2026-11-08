// The tools Claude has, as the brief names them, and what each one does.
// No Convex functions here: agent.ts calls runTool inside its action.

import type Anthropic from "@anthropic-ai/sdk";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { book, openSlots } from "./lib/calcom";
import { sendSms } from "./lib/sms";
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
    description: "The client this applicant applied to: the role, the city, the pay plan (comp sheet), the timezone and the booking link.",
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
      "Hand this applicant to a person (Myles). Use it when they're upset, ask for a person, raise anything legal or about safety, or ask something you can't answer from the client info. You stop texting them after this; tell them someone will follow up.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "Why, in one line." } },
      required: ["reason"],
    },
  },
];

/** What a turn keeps track of across its tool calls. */
export type TurnState = { applicant: Doc<"applicants">; client: Doc<"clients">; sentThisTurn: boolean; flagged: boolean };

/** Sends a text to the applicant and logs it. Nothing goes to a number that opted out. */
export async function textApplicant(ctx: ActionCtx, applicantId: Id<"applicants">, body: string, opts: { followUp?: boolean } = {}): Promise<string> {
  const now = await ctx.runQuery(internal.applicants.context, { applicantId });
  if (!now || now.optedOut || now.applicant.status === "opted_out") return "Not sent: the applicant opted out.";
  const text = body.trim();
  if (!text) return "Not sent: the text was empty.";
  const r = await sendSms(now.applicant.phone, text);
  if (r.status === "failed" || r.status === "skipped") throw new Error(`Text not sent: ${r.error}`);
  await ctx.runMutation(internal.applicants.logOutbound, { applicantId, body: text, sid: r.providerId, followUp: opts.followUp });
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
    case "get_client_info":
      return JSON.stringify({
        client: client.name,
        role: client.role,
        city: client.city,
        compSheet: client.compSheet,
        timezone: client.timezone,
        bookingLink: client.calEventLink,
        now: spoken(new Date(), client.timezone),
      });
    case "book_interview": {
      const start = typeof input.start === "string" ? input.start : undefined;
      if (!start) {
        const slots = (await openSlots(client.calEventTypeId, client.timezone)).slice(0, 8);
        if (slots.length === 0) return `No open times in the next week. Send them the booking link instead: ${client.calEventLink}`;
        return JSON.stringify(slots.map((s) => ({ start: s.start, says: spoken(new Date(s.start), client.timezone) })));
      }
      if (Number.isNaN(Date.parse(start))) return "That start isn't a time. Use one of the open times exactly.";
      const email = typeof input.email === "string" && input.email.includes("@") ? input.email : undefined;
      const booking = await book({ eventTypeId: client.calEventTypeId, start, name: applicant.name, phone: applicant.phone, email, timeZone: client.timezone });
      await ctx.runMutation(internal.followups.booked, { applicantId: applicant._id, interviewAt: booking.start, calBookingUid: booking.uid, ...(email ? { email } : {}) });
      return `Booked for ${spoken(new Date(booking.start), client.timezone)} (${client.timezone}). Tell them the time; reminders go out on their own.`;
    }
    case "save_applicant": {
      const answers = input.answers && typeof input.answers === "object" ? Object.fromEntries(Object.entries(input.answers as Record<string, unknown>).map(([k, val]) => [k, String(val)])) : undefined;
      const score = input.score === "A" || input.score === "B" || input.score === "C" ? input.score : undefined;
      const status = input.status === "screening" || input.status === "qualified" || input.status === "rejected" ? input.status : undefined;
      const notes = typeof input.notes === "string" ? input.notes : undefined;
      await ctx.runMutation(internal.applicants.save, { applicantId: applicant._id, answers, score, status, notes });
      return "Saved.";
    }
    case "flag_human":
      await flagHuman(ctx, applicant._id, String(input.reason ?? "No reason given"));
      state.flagged = true;
      return "Flagged. A person will follow up; don't text them again after this turn.";
    default:
      return `There's no tool called ${name}.`;
  }
}

/** Texts Myles a summary and stops the agent replying to this applicant. */
export async function flagHuman(ctx: ActionCtx, applicantId: Id<"applicants">, reason: string): Promise<void> {
  const now = await ctx.runQuery(internal.applicants.context, { applicantId });
  if (!now) return;
  const { applicant, client, messages } = now;
  const last = messages
    .slice(-4)
    .map((m) => `${m.direction === "in" ? applicant.name.split(" ")[0] : "Agent"}: ${m.body}`)
    .join("\n");
  const summary = [`Screener flag: ${applicant.name} ${applicant.phone}`, `${client.name} (${client.role}, ${client.city}) · score ${applicant.score ?? "-"} · ad ${applicant.sourceAdId}`, `Why: ${reason}`, last].filter(Boolean).join("\n");
  await ctx.runMutation(internal.applicants.setStatus, { applicantId, status: "flagged", note: `Flagged: ${reason}` });
  const to = process.env.MYLES_PHONE;
  if (!to) {
    console.error("MYLES_PHONE isn't set; flag not texted:", summary);
    return;
  }
  const r = await sendSms(to, summary.slice(0, 1500));
  if (r.status === "failed" || r.status === "skipped") console.error(`Flag text to Myles failed: ${r.error}`);
  else console.log(`Flag texted to Myles (${r.status}):\n${summary}`);
}
