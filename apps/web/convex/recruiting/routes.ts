// Recruiting's web addresses, added to http.ts (https://<deployment>.convex.site/...):
//   POST /recruiting/apply       a new applicant from an ad form (needs RECRUIT_APPLY_SECRET)
//   POST /recruiting/sms         Twilio's "a message comes in" webhook for the screener's own number
//   POST /recruiting/cal         Cal.com's webhook (optional): link bookings, reschedules, cancels, no-shows
//   POST /recruiting/ads/spend   the media buyer's spend on an ad (RECRUIT_APPLY_SECRET)

import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { calSignatureOk } from "./lib/calcom";
import { e164, recruitAccount, twilioSignatureOk } from "./lib/texts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Twilio's answer: empty, or one text back (STOP/HELP replies). */
const twiml = (reply?: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${reply ? `<Message>${escapeXml(reply)}</Message>` : ""}</Response>`, { headers: { "content-type": "text/xml" } });

/** The shared secret, from `Authorization: Bearer <secret>` or `x-apply-secret`, compared in constant time. */
function secretOk(request: Request, secret: string): boolean {
  const given = request.headers.get("x-apply-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export function addRecruitingRoutes(http: HttpRouter) {
  http.route({
    path: "/recruiting/apply",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const secret = process.env.RECRUIT_APPLY_SECRET;
      if (!secret) return json({ error: "RECRUIT_APPLY_SECRET isn't set on the deployment" }, 503);
      if (!secretOk(request, secret)) return json({ error: "unauthorized" }, 401);
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : typeof body?.[k] === "number" ? String(body[k]) : "");
      const result = await ctx.runMutation(internal.recruiting.applicants.apply, { name: str("name"), phone: str("phone"), clientId: str("clientId"), sourceAdId: str("sourceAdId") });
      return result.ok ? json(result, result.existing ? 200 : 201) : json(result, 422);
    }),
  });

  http.route({
    path: "/recruiting/sms",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      // Twilio signs with the auth token of the account the number is in.
      const token = recruitAccount().token;
      if (!token) return new Response("Texting isn't set up", { status: 503 });
      const params: Record<string, string> = {};
      for (const [k, val] of new URLSearchParams(await request.text())) params[k] = val;
      // Twilio signs the URL it was given; behind a proxy that isn't request.url.
      const url = process.env.RECRUIT_TWILIO_WEBHOOK_URL ?? request.url;
      if (!(await twilioSignatureOk(token, url, params, request.headers.get("x-twilio-signature")))) return new Response("Bad signature", { status: 403 });
      if (!params.From || params.Body === undefined) return twiml();
      const { reply } = await ctx.runMutation(internal.recruiting.applicants.inbound, { from: params.From, body: params.Body, sid: params.MessageSid });
      return twiml(reply);
    }),
  });

  http.route({
    path: "/recruiting/cal",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const secret = process.env.CAL_WEBHOOK_SECRET;
      if (!secret) return new Response("Cal.com webhook isn't set up", { status: 503 });
      const raw = await request.text();
      if (!(await calSignatureOk(secret, raw, request.headers.get("x-cal-signature-256")))) return new Response("Bad signature", { status: 403 });
      const event = JSON.parse(raw) as {
        triggerEvent?: string;
        payload?: { uid?: string; startTime?: string; attendees?: Array<{ phoneNumber?: string; noShow?: boolean }>; responses?: { attendeePhoneNumber?: { value?: string } } };
      };
      const p = event.payload ?? {};
      const rawPhone = p.attendees?.find((a) => a.phoneNumber)?.phoneNumber ?? p.responses?.attendeePhoneNumber?.value;
      const result = await ctx.runMutation(internal.recruiting.followups.calEvent, {
        trigger: event.triggerEvent ?? "",
        uid: p.uid,
        startTime: p.startTime,
        phone: rawPhone ? e164(rawPhone) : undefined,
        attendeeNoShow: p.attendees?.some((a) => a.noShow === true),
      });
      return json(result);
    }),
  });

  http.route({
    path: "/recruiting/ads/spend",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const secret = process.env.RECRUIT_APPLY_SECRET;
      if (!secret) return json({ error: "RECRUIT_APPLY_SECRET isn't set on the deployment" }, 503);
      if (!secretOk(request, secret)) return json({ error: "unauthorized" }, 401);
      const body = (await request.json().catch(() => null)) as { sourceAdId?: string; dollars?: number } | null;
      if (!body?.sourceAdId || typeof body.dollars !== "number" || body.dollars < 0) return json({ error: "send {sourceAdId, dollars} with the total spent so far" }, 422);
      const result = await ctx.runMutation(internal.recruiting.ads.setSpend, { sourceAdId: body.sourceAdId, dollars: body.dollars });
      return json(result, result.ok ? 200 : 404);
    }),
  });
}
