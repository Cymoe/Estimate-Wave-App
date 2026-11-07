// One call to Claude, as the office line and Outreach's interpreter make
// it: a plain fetch, the current Opus, and the server-side fallback so a
// declined request is re-run on another model inside the same call.

export const MODEL = "claude-opus-5-5";
/** How long one call may take, web searches included, before it counts as no answer; Convex stops the whole action at ten minutes. */
export const CLAUDE_TIMEOUT_MS = 150_000;

export type Block = { type: string; [key: string]: unknown };

export async function callClaude(body: Record<string, unknown>): Promise<{ content: Block[]; stop_reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        // If the model declines, the same request is re-run on a fallback model.
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({ model: MODEL, fallbacks: "default", ...body }),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`No answer after ${Math.round(CLAUDE_TIMEOUT_MS / 1000)} seconds`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { content?: Block[]; stop_reason?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Claude ${res.status}`);
  return { content: data.content ?? [], stop_reason: data.stop_reason ?? "end_turn" };
}
