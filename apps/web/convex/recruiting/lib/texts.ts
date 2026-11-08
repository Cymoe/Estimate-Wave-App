// Recruiting's texts: Jordan's own Twilio number, never the office line's.
// Built on lib/sms.ts (same Twilio account).
//
// Environment: RECRUIT_TWILIO_FROM, the screener's number (with
// TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, already set for the office line).
// RECRUIT_SMS_MODE=simulate logs every recruiting text instead of sending it
// (tests, a dev deployment). A test applicant's texts are always only logged.

import type { SendResult as Sent } from "../../lib/email";
import { sendSms, twilioSignatureOk } from "../../lib/sms";

export { twilioSignatureOk };
export type SendResult = { status: Sent["status"] | "simulated"; error?: string; providerId?: string };

export const simulating = () => process.env.RECRUIT_SMS_MODE === "simulate";

/** One text from the screener's number; "simulated" for a test or in simulate mode, "skipped" without RECRUIT_TWILIO_FROM. */
export async function sendText(to: string, text: string, opts: { test?: boolean } = {}): Promise<SendResult> {
  if (opts.test || simulating()) return { status: "simulated" };
  const from = process.env.RECRUIT_TWILIO_FROM;
  if (!from) return { status: "skipped", error: "Recruiting's Twilio number isn't set (RECRUIT_TWILIO_FROM)" };
  return await sendSms(to, text, from);
}

/** The signature Twilio would send for these params (the tests sign with it). */
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let binary = "";
  for (const b of mac) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Twilio's standard keywords. Matched on the whole message, any case, so "stop texting me so early" goes to Jordan.
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
