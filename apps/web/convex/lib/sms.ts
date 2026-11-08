// Texts over plain HTTPS through Twilio. No Convex imports, so any module
// (and the tests) can use it.
//
// Environment (set on the Convex deployment, never committed):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   the account
//   TWILIO_FROM                             the number texts come from (and the office line answers on)

import type { SendResult } from "./email";

/** Sends one text; "skipped" without Twilio set up, "failed" with Twilio's reason. `fromNumber` sends from another of the account's numbers (recruiting has its own). */
export async function sendSms(to: string, text: string, fromNumber?: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = fromNumber ?? process.env.TWILIO_FROM;
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
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let binary = "";
  for (const b of mac) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
