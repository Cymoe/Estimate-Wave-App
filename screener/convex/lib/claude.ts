// The one place that talks to Claude, through the Anthropic SDK.
//
// Environment: ANTHROPIC_API_KEY; CLAUDE_MODEL to pick another model.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = () => process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;

/** One request: the brief as a cached system prompt, the conversation, the tools. */
export async function createMessage(params: { system: string; messages: Anthropic.MessageParam[]; tools: Anthropic.Tool[] }): Promise<Anthropic.Message> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY isn't set on the deployment");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 2 });
  return await client.messages.create({
    model: MODEL(),
    max_tokens: 4000,
    // The brief is the same on every call: cache it.
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    tools: params.tools,
    messages: params.messages,
  });
}
