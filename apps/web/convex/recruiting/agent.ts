// The screener: Claude with the brief and the tools, one turn at a time.
//
// A turn loads the applicant, their client and the whole thread, asks Claude,
// runs whatever tools it calls (looping until it answers), and texts the
// answer. If anything goes wrong mid-turn, the applicant is handed to a person
// rather than sent something broken.

import type Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { BRIEF } from "./lib/briefs";
import { createMessage } from "./lib/claude";
import { spoken } from "./lib/time";
import { flagHuman, runTool, textApplicant, TOOLS, type TurnState } from "./tools";

/** Tool rounds in one turn before giving up and handing over. */
const MAX_ROUNDS = 8;

/** The thread as Claude sees it: what we know first, then the texts, theirs as user turns and ours as assistant turns. */
/** How fast they answer us: the median minutes from our text to their next one, once they've answered twice. */
export function replySpeed(messages: Array<Pick<Doc<"recruitMessages">, "direction" | "at">>): number | undefined {
  const gaps: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].direction === "in" && messages[i - 1].direction === "out") gaps.push((Date.parse(messages[i].at) - Date.parse(messages[i - 1].at)) / 60_000);
  }
  if (gaps.length < 2) return undefined;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)];
}

const minutes = (m: number) => (m < 1 ? "under a minute" : m < 90 ? `about ${Math.round(m)} minute${Math.round(m) === 1 ? "" : "s"}` : `about ${Math.round(m / 60)} hours`);

export function conversation(applicant: Doc<"recruitApplicants">, client: Doc<"recruitClients">, messages: Array<Pick<Doc<"recruitMessages">, "direction" | "body" | "at"> & { by?: string }>, note?: string): Anthropic.MessageParam[] {
  const speed = replySpeed(messages);
  const known = [
    `[Applicant: ${applicant.name}, ${applicant.phone}. Applied for ${client.role} with ${client.name} in ${client.city}, from ad ${applicant.sourceAdId}.`,
    `Status: ${applicant.status}${applicant.score ? `, score ${applicant.score}` : ""}.`,
    Object.keys(applicant.answers).length ? `Saved answers: ${JSON.stringify(applicant.answers)}.` : "",
    applicant.interviewAt ? `Interview booked for ${spoken(new Date(applicant.interviewAt), client.timezone)}.` : "",
    speed !== undefined ? `They typically reply in ${minutes(speed)}.` : "",
    `It's ${spoken(new Date(), client.timezone)} where the client is.]`,
  ]
    .filter(Boolean)
    .join(" ");
  const turns: Anthropic.MessageParam[] = [{ role: "user", content: known }];
  for (const m of messages) {
    const role = m.direction === "in" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    // A person on the team texted this one, not Jordan.
    const body = m.by ? `[${m.by}, a person on the team, texted this while they had the conversation:] ${m.body}` : m.body;
    // Back-to-back texts from the same side read as one turn.
    if (last.role === role) last.content = `${last.content as string}\n${body}`;
    else turns.push({ role, content: body });
  }
  // Claude answers a user turn: when we spoke last (a first text, a follow-up), the note says what's wanted.
  const last = turns[turns.length - 1];
  if (note || last.role === "assistant") {
    const ask = `[${note ?? "Continue."}]`;
    if (last.role === "user") last.content = `${last.content as string}\n${ask}`;
    else turns.push({ role: "user", content: ask });
  }
  return turns;
}

/** One turn: Claude, the tools, the reply. Returns the text sent, if any. */
export async function runTurn(ctx: ActionCtx, applicantId: Id<"recruitApplicants">, note?: string, opts: { followUp?: boolean } = {}): Promise<string | undefined> {
  const now = await ctx.runQuery(internal.recruiting.applicants.context, { applicantId });
  if (!now || now.optedOut) return;
  const { applicant, client } = now;
  if (applicant.status === "flagged" || applicant.status === "opted_out") return;
  const state: TurnState = { applicant, client, sentThisTurn: false, flagged: false };
  const messages = conversation(applicant, client, now.messages, note);
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await createMessage({ system: BRIEF, messages, tools: TOOLS });
      messages.push({ role: "assistant", content: response.content });
      const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || calls.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (text && !state.sentThisTurn) {
          await textApplicant(ctx, applicantId, text, opts);
          return text;
        }
        return;
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        let content: string;
        let isError = false;
        try {
          content = await runTool(ctx, state, call.name, (call.input ?? {}) as Record<string, unknown>);
        } catch (err) {
          content = err instanceof Error ? err.message : String(err);
          isError = true;
        }
        results.push({ type: "tool_result", tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
    throw new Error(`No reply after ${MAX_ROUNDS} rounds of tools`);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error(`Turn failed for ${applicantId}: ${why}`);
    if (!state.flagged) await flagHuman(ctx, applicantId, `The agent hit an error: ${why}`);
  }
}

/** The opener, a minute or two after they apply. */
export const firstText = internalAction({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }) => {
    const now = await ctx.runQuery(internal.recruiting.applicants.context, { applicantId });
    // Only once: a duplicate apply or a reply that beat it leaves nothing to open.
    if (!now || now.applicant.status !== "new" || now.messages.length > 0) return;
    await runTurn(ctx, applicantId, "They just applied. Send your first text now. It must end with: Reply STOP to opt out.");
  },
});

/** Their reply (or replies) in; ours out. */
export const reply = internalAction({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }) => {
    const startedAt = new Date().toISOString();
    try {
      await runTurn(ctx, applicantId);
    } finally {
      await ctx.runMutation(internal.recruiting.applicants.finishReply, { applicantId, startedAt });
    }
  },
});

/** A nudge after silence (follow-up 1 or 2), in the brief's voice. */
export const followUp = internalAction({
  args: { applicantId: v.id("recruitApplicants"), n: v.number() },
  handler: async (ctx, { applicantId, n }) => {
    const now = await ctx.runQuery(internal.recruiting.applicants.context, { applicantId });
    // They answered (or left) since this was scheduled: nothing to nudge.
    if (!now || !now.applicant.followUpPending || (now.applicant.status !== "texted" && now.applicant.status !== "screening")) return;
    const wait = n === 1 ? "4 hours" : "a day";
    try {
      await runTurn(ctx, applicantId, `They haven't replied in ${wait}. Send follow-up ${n} of 2: one short, friendly line that picks up where you left off. Don't repeat your last text.`, { followUp: true });
    } finally {
      await ctx.runMutation(internal.recruiting.followups.clearFollowUp, { applicantId });
    }
  },
});
