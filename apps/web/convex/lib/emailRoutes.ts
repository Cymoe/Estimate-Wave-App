// Email outreach's web addresses (emailOutreach.ts): Google's return from
// "Connect Gmail", Resend's webhook for replies to the reply address, and the
// one-tap unsubscribe every email links to.
import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { siteUrl } from "../delivery";
import { tokenFrom, svixOk } from "./emailOutreach";
import { exchangeCode, GMAIL_SCOPE } from "./gmail";
import { seal } from "./secretBox";
import { sha256 } from "./oauth";

const page = (title: string, line: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#222"><h1 style="font-size:20px">${title}</h1><p style="line-height:1.5">${line}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const htmlText = (html: string) =>
  html
    .replace(/<(br|\/p|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');

export function addEmailRoutes(http: HttpRouter) {
  // Back from Google's "send email on your behalf": the code traded for tokens, the refresh token sealed and kept.
  http.route({
    path: "/google/gmail/callback",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const url = new URL(request.url);
      const state = url.searchParams.get("state");
      const taken = state ? await ctx.runMutation(internal.emailOutreach.takeState, { state: await sha256(state) }) : null;
      if (!taken) return page("That link has expired", "Go back to Webb Leads and tap Connect Gmail again.", 400);
      const back = (query: string) => Response.redirect(`${siteUrl()}${taken.returnTo}${taken.returnTo.includes("?") ? "&" : "?"}${query}`, 302);
      const code = url.searchParams.get("code");
      if (!code) return back(`gmail=${encodeURIComponent(url.searchParams.get("error") === "access_denied" ? "denied" : "failed")}`);
      try {
        const tokens = await exchangeCode(code);
        if (!tokens.scope.split(" ").includes(GMAIL_SCOPE)) return back("gmail=no_send");
        if (!tokens.refresh || !tokens.email) return back("gmail=failed");
        await ctx.runMutation(internal.emailOutreach.saveMailbox, {
          organizationId: taken.organizationId,
          userId: taken.userId,
          email: tokens.email,
          name: tokens.name,
          refreshTokenEnc: await seal(tokens.refresh),
          accessToken: tokens.access,
          accessExpiresAt: tokens.expiresAt,
        });
        return back("gmail=connected");
      } catch {
        return back("gmail=failed");
      }
    }),
  });

  // Replies to r-<token>@REPLY_DOMAIN, from Resend's receiving webhook (signed with RESEND_WEBHOOK_SECRET).
  http.route({
    path: "/email/inbound",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const secret = process.env.RESEND_WEBHOOK_SECRET;
      if (!secret) return new Response("Replies aren't set up", { status: 503 });
      const body = await request.text();
      const signed = await svixOk(secret, { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") }, body);
      if (!signed) return new Response("Bad signature", { status: 403 });
      const event = JSON.parse(body) as { type?: string; data?: { email_id?: string; from?: string; to?: string[]; subject?: string } };
      if (event.type !== "email.received" || !event.data?.email_id) return new Response("ignored");
      const token = tokenFrom(event.data.to ?? []);
      if (!token) return new Response("not a reply address");
      // The webhook carries no body: it's fetched from Resend's received-emails API.
      const res = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, { headers: { authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}` } });
      if (!res.ok) return new Response("couldn't read the email", { status: 502 });
      const email = (await res.json()) as { from?: string; subject?: string; text?: string | null; html?: string | null; headers?: Record<string, string> };
      const text = email.text ?? (email.html ? htmlText(email.html) : "");
      const from = (email.from ?? event.data.from ?? "").trim();
      await ctx.runMutation(internal.emailOutreach.recordReply, {
        token,
        from,
        subject: email.subject ?? event.data.subject,
        text,
        headers: Object.fromEntries(Object.entries(email.headers ?? {}).filter(([, val]) => typeof val === "string")),
      });
      return new Response("ok");
    }),
  });

  // Unsubscribe: the link in the footer shows a button (so a mail scanner opening links can't unsubscribe anyone); the
  // List-Unsubscribe one-click POST, and the button, do it.
  http.route({
    pathPrefix: "/u/",
    method: "GET",
    handler: httpAction(async (_ctx, request) => {
      const token = new URL(request.url).pathname.split("/u/")[1] ?? "";
      if (!token) return page("Not found", "This link isn't complete.", 404);
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#222"><h1 style="font-size:20px">Stop these emails?</h1><form method="post" action="/u/${esc(token)}"><button type="submit" style="font-size:16px;padding:10px 18px;border:0;border-radius:6px;background:#336699;color:#fff">Unsubscribe</button></form></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }),
  });
  http.route({
    pathPrefix: "/u/",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const token = new URL(request.url).pathname.split("/u/")[1] ?? "";
      const done = token ? await ctx.runMutation(internal.emailOutreach.optOut, { token }) : null;
      if (!done) return page("Not found", "This link isn't complete.", 404);
      return page("You're unsubscribed", `${esc(done.company)} won't email you again.`);
    }),
  });
}
