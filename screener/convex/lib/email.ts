// Email over plain HTTPS through Resend.
//
// Environment: RESEND_API_KEY, RESEND_FROM (e.g. "Screening <reports@yourdomain.com>").

export type EmailResult = { status: "sent" | "failed" | "skipped"; error?: string };

export async function sendEmail(to: string, body: { subject: string; text: string; html: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return { status: "skipped", error: "Resend not set up (RESEND_API_KEY, RESEND_FROM)" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: body.subject, text: body.text, html: body.html }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return { status: "failed", error: data.message ?? `Resend ${res.status}` };
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
