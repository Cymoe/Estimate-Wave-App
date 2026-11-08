// Texts over plain HTTPS through Twilio. No Convex imports, so tests can use it.
//
// Environment (on the Convex deployment, never committed):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   the account
//   TWILIO_FROM                             the screener's own number
//   SMS_MODE=simulate                       log texts instead of sending them (tests, the simulator)

export type SendResult = { status: "sent" | "simulated" | "failed" | "skipped"; error?: string; providerId?: string };

export const simulating = () => process.env.SMS_MODE === "simulate";

/** Sends one text; "simulated" in simulate mode, "skipped" without Twilio, "failed" with Twilio's reason. */
export async function sendSms(to: string, text: string): Promise<SendResult> {
  if (simulating()) return { status: "simulated" };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { status: "skipped", error: "Twilio not set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { status: "failed", error: data.message ?? `Twilio ${res.status}` };
    return { status: "sent", providerId: data.sid };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Whether a request really came from Twilio: X-Twilio-Signature is the
 * base64 HMAC-SHA1, keyed with the auth token, of the full URL followed by
 * each form field's name and value, sorted by name.
 */
export async function twilioSignatureOk(authToken: string, url: string, params: Record<string, string>, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const expected = await twilioSignature(authToken, url, params);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** The signature Twilio would send for these params (also used by the tests). */
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let binary = "";
  for (const b of mac) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Twilio's standard keywords. Matched on the whole message, any case, so "stop texting me so early" goes to the agent.
const OPT_OUT = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const OPT_IN = new Set(["START", "UNSTOP", "YES"]);
const HELP = new Set(["HELP", "INFO"]);

export type Keyword = "stop" | "start" | "help";
/** STOP, START or HELP when the whole text is one of Twilio's keywords; otherwise nothing. */
export function keywordOf(body: string, optedOut: boolean): Keyword | undefined {
  const word = body.trim().replace(/[.!]+$/, "").toUpperCase();
  if (OPT_OUT.has(word)) return "stop";
  // YES only counts as opting back in for a number that opted out; otherwise it's an answer.
  if (OPT_IN.has(word) && (word !== "YES" || optedOut)) return "start";
  if (HELP.has(word)) return "help";
  return undefined;
}

/** "(432) 555-0100", "432.555.0100", "+1 432 555 0100" → "+14325550100"; undefined if it isn't a US number. */
export function e164(phone: string): string | undefined {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return undefined;
}
