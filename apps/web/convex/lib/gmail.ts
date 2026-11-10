// Sending from a company's own Gmail. The company connects once (Google's
// "send email on your behalf", the gmail.send scope only: the app never
// reads the inbox); the refresh token is kept sealed (lib/secretBox.ts) and
// each send asks Google for a fresh access token when the last has run out.
// Pure where it can be: the message builder has no network or Convex.
//
// Environment: AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, the same Google client
// as sign-in; its authorized redirects must include gmailRedirect().

import { apiOrigin } from "./oauth";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const SCOPES = ["openid", "email", GMAIL_SCOPE];

/** Where Google sends the person back after they allow sending. */
export const gmailRedirect = () => `${apiOrigin()}/google/gmail/callback`;

/** What's missing on the deployment before a company can connect Gmail, in words; empty when ready. */
export function setupMissing(env: Record<string, string | undefined> = process.env): string[] {
  const missing: string[] = [];
  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) missing.push("the Google client (AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET)");
  if (!env.MAILBOX_KEY) missing.push("MAILBOX_KEY");
  return missing;
}

export function authUrl(state: string, loginHint?: string, env: Record<string, string | undefined> = process.env): string {
  const params = new URLSearchParams({
    client_id: env.AUTH_GOOGLE_ID ?? "",
    redirect_uri: gmailRedirect(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Always the consent screen: without it Google sends no refresh token on a second connect.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type Tokens = { access: string; expiresAt: number; refresh?: string; scope: string; email?: string; name?: string };

/** The email and name in Google's id token. It came straight from Google over TLS, so its claims are read, not re-verified. */
export function idClaims(idToken: string | undefined): { email?: string; name?: string } {
  const payload = idToken?.split(".")[1];
  if (!payload) return {};
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payload.length % 4)) % 4))) as { email?: string; name?: string };
    return { email: json.email, name: json.name };
  } catch {
    return {};
  }
}

async function tokenCall(body: Record<string, string>, f: typeof fetch = fetch): Promise<Tokens> {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID ?? "", client_secret: process.env.AUTH_GOOGLE_SECRET ?? "", ...body }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new GmailError(data.error ?? `Google ${res.status}`, data.error_description ?? data.error ?? `Google answered ${res.status}`);
  return { access: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000, refresh: data.refresh_token, scope: data.scope ?? "", ...idClaims(data.id_token) };
}

export const exchangeCode = (code: string, f?: typeof fetch) => tokenCall({ code, grant_type: "authorization_code", redirect_uri: gmailRedirect() }, f);
export const refreshAccess = (refresh: string, f?: typeof fetch) => tokenCall({ refresh_token: refresh, grant_type: "refresh_token" }, f);

/** A Google answer with its code: "invalid_grant" means the person took the permission back (or the token lapsed). */
export class GmailError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
/** The connection is gone and only reconnecting helps. */
export const isRevoked = (e: unknown) => e instanceof GmailError && (e.code === "invalid_grant" || e.code === "unauthorized" || e.code === "401");

// ---- The message ----

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64url = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** A header value in plain ASCII as is, anything else as an RFC 2047 encoded word. */
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Lines wrapped at 76 for a base64 body. */
const wrap = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();

export type Outgoing = {
  from: { name?: string; email: string };
  to: string;
  subject: string;
  body: string;
  /** The company and its postal address, the law's footer. */
  footer: string;
  unsubscribeUrl: string;
  /** Where a reply goes, when the app catches replies (lib/emailOutreach.ts replyAddress). */
  replyTo?: string;
  /** This message's own id, and for a follow-up the first message's, to thread it. */
  messageId: string;
  inReplyTo?: string;
};

/** The text a person reads: the body, then the footer and the way out. */
export function textOf(m: Pick<Outgoing, "body" | "footer" | "unsubscribeUrl">): string {
  return `${m.body.trim()}\n\n--\n${m.footer}\nDon't want these emails? Unsubscribe: ${m.unsubscribeUrl}`;
}

export function htmlOf(m: Pick<Outgoing, "body" | "footer" | "unsubscribeUrl">): string {
  const paras = m.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${paras}<p style="margin:24px 0 0;font-size:12px;color:#777">${escapeHtml(m.footer)}<br>Don't want these emails? <a href="${escapeHtml(m.unsubscribeUrl)}" style="color:#777">Unsubscribe</a></p></div>`;
}

/** The whole message, as Gmail's send call takes it (base64url of the RFC 5322 text). */
export function rawMessage(m: Outgoing): string {
  const boundary = `b-${m.messageId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
  const from = m.from.name ? `${word(m.from.name)} <${m.from.email}>` : m.from.email;
  const headers = [
    `From: ${from}`,
    `To: ${m.to}`,
    `Subject: ${word(m.subject)}`,
    `Message-ID: ${m.messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `List-Unsubscribe: <${m.unsubscribeUrl}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, content: string) => [`--${boundary}`, `Content-Type: ${type}; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", wrap(b64(content))].join("\r\n");
  const text = [...headers, "", part("text/plain", textOf(m)), part("text/html", htmlOf(m)), `--${boundary}--`, ""].join("\r\n");
  return b64url(text);
}

/** Sends one message from the connected mailbox; a follow-up goes in the first one's thread. */
export async function sendRaw(access: string, raw: string, threadId?: string, f: typeof fetch = fetch): Promise<{ id: string; threadId: string }> {
  const res = await f("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: { code?: number; message?: string; status?: string } };
  if (!res.ok || !data.id) {
    const code = res.status === 401 ? "401" : (data.error?.status ?? String(res.status));
    throw new GmailError(code, data.error?.message ?? `Gmail answered ${res.status}`);
  }
  return { id: data.id, threadId: data.threadId ?? data.id };
}
