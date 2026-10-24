// Email over plain HTTPS through Resend. No Convex imports, so auth.ts
// (which runs before any of our functions) and tests can use it too.
//
// Environment (set on the Convex deployment, never committed):
//   RESEND_API_KEY   the key
//   RESEND_FROM      the sender, e.g. "FieldQuote <leads@fieldquote.app>"

export type SendResult = { status: "sent" | "failed" | "skipped"; error?: string; providerId?: string };

/** Sends one email to the addresses given; "skipped" without a key, "failed" with Resend's reason. */
export async function sendEmail(to: string[], body: { subject: string; text: string; html: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "FieldQuote <leads@fieldquote.app>";
  if (!key) return { status: "skipped", error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", error: data.message ?? `Resend ${res.status}` };
    return { status: "sent", providerId: data.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
