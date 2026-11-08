// The screener: Claude with the brief and the tools, one turn at a time.
//
// A turn loads the applicant, their client and the whole thread, asks Claude,
// runs whatever tools it calls (looping until it answers), and texts the
// answer. If anything goes wrong mid-turn, the applicant is handed to a person
// rather than sent something broken.

import type Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { BRIEF } from "./lib/brief";
import { createMessage } from "./lib/claude";
import { spoken } from "./lib/time";
import { flagHuman, runTool, textApplicant, TOOLS, type TurnState } from "./tools";

/** Tool rounds in one turn before giving up and handing over. */
const MAX_ROUNDS = 8;

/** The thread as Claude sees it: what we know first, then the texts, theirs as user turns and ours as assistant turns. */
export function conversation(applicant: Doc<"applicants">, client: Doc<"clients">, messages: Array<Pick<Doc<"messages">, "direction" | "body">>, note?: string): Anthropic.MessageParam[] {
  const known = [
    `[Applicant: ${applicant.name}, ${applicant.phone}. Applied for ${client.role} with ${client.name} in ${client.city}, from ad ${applicant.sourceAdId}.`,
    `Status: ${applicant.status}${applicant.score ? `, score ${applicant.score}` : ""}.`,
    Object.keys(applicant.answers).length ? `Saved answers: ${JSON.stringify(applicant.answers)}.` : "",
    applicant.interviewAt ? `Interview booked for ${spoken(new Date(applicant.interviewAt), client.timezone)}.` : "",
    `It's ${spoken(new Date(), client.timezone)} where the client is.]`,
  ]
    .filter(Boolean)
    .join(" ");
  const turns: Anthropic.MessageParam[] = [{ role: "user", content: known }];
  for (const m of messages) {
    const role = m.direction === "in" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    // Back-to-back texts from the same side read as one turn.
    if (last.role === role) last.content = `${last.content as string}\n${m.body}`;
    else turns.push({ role, content: m.body });
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
export async function runTurn(ctx: ActionCtx, applicantId: Id<"applicants">, note?: string, opts: { followUp?: boolean } = {}): Promise<string | undefined> {
  const now = await ctx.runQuery(internal.applicants.context, { applicantId });
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
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const now = await ctx.runQuery(internal.applicants.context, { applicantId });
    // Only once: a duplicate apply or a reply that beat it leaves nothing to open.
    if (!now || now.applicant.status !== "new" || now.messages.length > 0) return;
    await runTurn(ctx, applicantId, "They just applied. Send your first text now. It must end with: Reply STOP to opt out.");
  },
});

/** Their reply (or replies) in; ours out. */
export const reply = internalAction({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const startedAt = new Date().toISOString();
    try {
      await runTurn(ctx, applicantId);
    } finally {
      await ctx.runMutation(internal.applicants.finishReply, { applicantId, startedAt });
    }
  },
});

/** A nudge after silence (follow-up 1 or 2), in the brief's voice. */
export const followUp = internalAction({
  args: { applicantId: v.id("applicants"), n: v.number() },
  handler: async (ctx, { applicantId, n }) => {
    const now = await ctx.runQuery(internal.applicants.context, { applicantId });
    // They answered (or left) since this was scheduled: nothing to nudge.
    if (!now || !now.applicant.followUpPending || (now.applicant.status !== "texted" && now.applicant.status !== "screening")) return;
    const wait = n === 1 ? "4 hours" : "a day";
    try {
      await runTurn(ctx, applicantId, `They haven't replied in ${wait}. Send follow-up ${n} of 2: one short, friendly line that picks up where you left off. Don't repeat your last text.`, { followUp: true });
    } finally {
      await ctx.runMutation(internal.followups.clearFollowUp, { applicantId });
    }
  },
});
