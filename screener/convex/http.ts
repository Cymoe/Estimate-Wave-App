// The screener's web addresses (https://<deployment>.convex.site/...):
//   POST /apply   a new applicant from an ad form (needs APPLY_SECRET)
//   POST /sms     Twilio's "a message comes in" webhook
//   POST /cal     Cal.com's webhook (optional): reschedules, cancels, no-shows
//   GET/POST /review         the ad review page (needs REVIEW_KEY)
//   GET /ads/approved.csv    approved ads for the video team and media buyer (REVIEW_KEY)
//   POST /ads/spend          the media buyer's spend on an ad (APPLY_SECRET)
//   POST /simulate/inbound, GET /simulate/thread   only with SMS_MODE=simulate

import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { calSignatureOk } from "./lib/calcom";
import { reviewPage } from "./lib/reviewPage";
import { e164, simulating, twilioSignatureOk } from "./lib/sms";

const http = httpRouter();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Twilio's answer: empty, or one text back (STOP/HELP replies). */
const twiml = (reply?: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${reply ? `<Message>${escapeXml(reply)}</Message>` : ""}</Response>`, { headers: { "content-type": "text/xml" } });

/** The shared secret, from `Authorization: Bearer <secret>` or `x-apply-secret`. */
function secretOk(request: Request, secret: string): boolean {
  const given = request.headers.get("x-apply-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

http.route({
  path: "/apply",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.APPLY_SECRET;
    if (!secret) return json({ error: "APPLY_SECRET isn't set on the deployment" }, 503);
    if (!secretOk(request, secret)) return json({ error: "unauthorized" }, 401);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : typeof body?.[k] === "number" ? String(body[k]) : "");
    const result = await ctx.runMutation(internal.applicants.apply, { name: str("name"), phone: str("phone"), clientId: str("clientId"), sourceAdId: str("sourceAdId") });
    return result.ok ? json(result, result.existing ? 200 : 201) : json(result, 422);
  }),
});

http.route({
  path: "/sms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!token) return new Response("Texting isn't set up", { status: 503 });
    const params: Record<string, string> = {};
    for (const [k, val] of new URLSearchParams(await request.text())) params[k] = val;
    // Twilio signs the URL it was given; behind a proxy that isn't request.url.
    const url = process.env.TWILIO_WEBHOOK_URL ?? request.url;
    if (!(await twilioSignatureOk(token, url, params, request.headers.get("x-twilio-signature")))) return new Response("Bad signature", { status: 403 });
    if (!params.From || params.Body === undefined) return twiml();
    const { reply } = await ctx.runMutation(internal.applicants.inbound, { from: params.From, body: params.Body, sid: params.MessageSid });
    return twiml(reply);
  }),
});

http.route({
  path: "/cal",
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
    const result = await ctx.runMutation(internal.followups.calEvent, {
      trigger: event.triggerEvent ?? "",
      uid: p.uid,
      startTime: p.startTime,
      phone: rawPhone ? e164(rawPhone) : undefined,
      attendeeNoShow: p.attendees?.some((a) => a.noShow === true),
    });
    return json(result);
  }),
});

/** The review key, from ?key= or the form; compared in constant time. */
function reviewKeyOk(given: string | null): boolean {
  const key = process.env.REVIEW_KEY;
  if (!key || !given || given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

http.route({
  path: "/review",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!process.env.REVIEW_KEY) return html("<p>Set REVIEW_KEY on the deployment to use the review page.</p>", 503);
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!reviewKeyOk(key)) return html("<p>Wrong or missing key.</p>", 401);
    return html(reviewPage(await ctx.runQuery(internal.ads.review, {}), key!, url.searchParams.get("notice") ?? undefined));
  }),
});

http.route({
  path: "/review",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const form = new URLSearchParams(await request.text());
    const key = form.get("key");
    if (!reviewKeyOk(key)) return html("<p>Wrong or missing key.</p>", 401);
    const action = form.get("action");
    let notice = "";
    if (action === "approve" || action === "reject") {
      const id = await ctx.runMutation(internal.ads.decide, { adId: form.get("adId") as Id<"ads">, decision: action });
      notice = action === "approve" ? (id ? `Approved: its source ad id is ${id}.` : "Already decided.") : "Rejected.";
    } else if (action === "approve_clean") {
      const all = await ctx.runQuery(internal.ads.review, {});
      const ids: string[] = [];
      for (const d of all.find((c) => c.client.id === form.get("clientId"))?.drafts ?? []) {
        if (d.warnings.length) continue;
        const id = await ctx.runMutation(internal.ads.decide, { adId: d.id, decision: "approve" });
        if (id) ids.push(id);
      }
      notice = `Approved ${ids.length}: ${ids.join(", ")}.`;
    } else if (action === "retire") {
      await ctx.runMutation(internal.ads.retire, { sourceAdId: form.get("sourceAdId") ?? "" });
      notice = `Retired ${form.get("sourceAdId")}. Tell the media buyer to turn it off.`;
    } else if (action === "write") {
      await ctx.scheduler.runAfter(0, internal.adAgent.writeBatch, { clientId: form.get("clientId") as Id<"clients"> });
      notice = "Writing a new batch: it takes a minute or two. Refresh to see it.";
    }
    const back = `/review?key=${encodeURIComponent(key!)}&notice=${encodeURIComponent(notice)}`;
    return new Response(null, { status: 303, headers: { location: back } });
  }),
});

http.route({
  path: "/ads/approved.csv",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!reviewKeyOk(new URL(request.url).searchParams.get("key"))) return new Response("Wrong or missing key", { status: 401 });
    const rows = await ctx.runQuery(internal.ads.approved, {});
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [["source_ad_id", "client", "kind", "angle", "title", "body", "approved_at"], ...rows.map((r) => [r.sourceAdId, r.client, r.kind, r.angle, r.title, r.body, r.approvedAt])].map((r) => r.map(cell).join(",")).join("\n");
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="approved-ads.csv"' } });
  }),
});

http.route({
  path: "/ads/spend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.APPLY_SECRET;
    if (!secret) return json({ error: "APPLY_SECRET isn't set on the deployment" }, 503);
    if (!secretOk(request, secret)) return json({ error: "unauthorized" }, 401);
    const body = (await request.json().catch(() => null)) as { sourceAdId?: string; dollars?: number } | null;
    if (!body?.sourceAdId || typeof body.dollars !== "number" || body.dollars < 0) return json({ error: "send {sourceAdId, dollars} with the total spent so far" }, 422);
    const result = await ctx.runMutation(internal.ads.setSpend, { sourceAdId: body.sourceAdId, dollars: body.dollars });
    return json(result, result.ok ? 200 : 404);
  }),
});

// The simulator's way in: a text "from" a phone without Twilio, and the thread back. Off unless SMS_MODE=simulate.
http.route({
  path: "/simulate/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!simulating()) return json({ error: "only with SMS_MODE=simulate" }, 404);
    const secret = process.env.APPLY_SECRET;
    if (!secret || !secretOk(request, secret)) return json({ error: "unauthorized" }, 401);
    const { from, body } = (await request.json()) as { from: string; body: string };
    return json(await ctx.runMutation(internal.applicants.inbound, { from, body }));
  }),
});

http.route({
  path: "/simulate/thread",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!simulating()) return json({ error: "only with SMS_MODE=simulate" }, 404);
    const secret = process.env.APPLY_SECRET;
    if (!secret || !secretOk(request, secret)) return json({ error: "unauthorized" }, 401);
    const phone = new URL(request.url).searchParams.get("phone") ?? "";
    return json(await ctx.runQuery(internal.applicants.thread, { phone }));
  }),
});

export default http;
