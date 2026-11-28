import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { siteUrl } from "../delivery";
import {
  acceptableRedirect,
  authorizationServerMetadata,
  challengeFor,
  protectedResourceMetadata,
  randomToken,
  redirectMatches,
  resourceOk,
  sha256,
  withParams,
  issuer,
  ACCESS_TTL_MS,
} from "./oauth";

// The HTTP side of assistant sign-in (see oauth.ts for the rest):
// discovery documents, client registration, /oauth/authorize (which hands
// the person to the web app's /connect page), /oauth/token and revoke.

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...headers },
  });

const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);

/** A page for requests we can't send back to the assistant (unknown client or redirect). */
const errorPage = (message: string) =>
  new Response(`Webb Leads couldn't start this connection: ${message}. Go back to the assistant and try connecting again.`, {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

const preflight = httpAction(async () => new Response(null, { status: 204, headers: CORS }));

/** Reads a client's metadata document (CIMD) from its client_id URL. */
async function fetchClientDocument(clientId: string): Promise<{ name?: string; redirectUris: string[] } | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  try {
    const response = await Promise.race([
      fetch(url.toString(), { headers: { accept: "application/json" } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    if (!response.ok) return null;
    const doc = (await response.json()) as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
    if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
    const redirectUris = doc.redirect_uris.filter((u): u is string => typeof u === "string" && acceptableRedirect(u));
    if (!redirectUris.length) return null;
    return { name: typeof doc.client_name === "string" ? doc.client_name : undefined, redirectUris };
  } catch {
    return null;
  }
}

/** Reads a form-encoded (or JSON) token request body. */
async function formOf(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

export function addOAuthRoutes(http: HttpRouter) {
  const resourceMeta = httpAction(async () => json(protectedResourceMetadata()));
  const serverMeta = httpAction(async () => json(authorizationServerMetadata()));
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    http.route({ path, method: "GET", handler: resourceMeta });
    http.route({ path, method: "OPTIONS", handler: preflight });
  }
  // At the issuer's path (RFC 8414), and at the root for clients that only look there.
  for (const path of ["/.well-known/oauth-authorization-server/oauth", "/.well-known/oauth-authorization-server"]) {
    http.route({ path, method: "GET", handler: serverMeta });
    http.route({ path, method: "OPTIONS", handler: preflight });
  }

  http.route({
    path: "/oauth/register",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      let body: { client_name?: unknown; redirect_uris?: unknown };
      try {
        body = await request.json();
      } catch {
        return oauthError("invalid_client_metadata", "Send JSON");
      }
      const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
      if (!uris.length || uris.some((u) => typeof u !== "string" || !acceptableRedirect(u)))
        return oauthError("invalid_redirect_uri", "redirect_uris must be https (or http on localhost)");
      const name = typeof body.client_name === "string" ? body.client_name : undefined;
      const clientId = await ctx.runMutation(internal.oauth.registerClient, { name, redirectUris: uris as string[] });
      return json(
        {
          client_id: clientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_name: name,
          redirect_uris: uris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
        201,
      );
    }),
  });
  http.route({ path: "/oauth/register", method: "OPTIONS", handler: preflight });

  http.route({
    path: "/oauth/authorize",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const params = new URL(request.url).searchParams;
      const clientId = params.get("client_id") ?? "";
      const redirectUri = params.get("redirect_uri") ?? "";
      if (!clientId) return errorPage("no client_id");
      let client = await ctx.runQuery(internal.oauth.client, { clientId });
      // A client known by URL: read its document (again, after a day) to learn its name and redirects.
      if (clientId.startsWith("https://") && (!client || Date.now() - Date.parse(client.updatedAt) > 24 * 60 * 60 * 1000)) {
        const doc = await fetchClientDocument(clientId);
        if (doc) {
          await ctx.runMutation(internal.oauth.saveCimdClient, { clientId, ...doc });
          client = await ctx.runQuery(internal.oauth.client, { clientId });
        }
      }
      if (!client) return errorPage("this app isn't registered");
      if (!redirectUri || !redirectMatches(redirectUri, client.redirectUris)) return errorPage("the return address doesn't match the app");
      const state = params.get("state") ?? undefined;
      const back = (error: string, description: string) =>
        Response.redirect(withParams(redirectUri, { error, error_description: description, state, iss: issuer() }), 302);
      if (params.get("response_type") !== "code") return back("unsupported_response_type", "Only code is supported");
      const challenge = params.get("code_challenge") ?? "";
      if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge))
        return back("invalid_request", "PKCE with S256 is required");
      const resource = params.get("resource") ?? undefined;
      if (!resourceOk(resource)) return back("invalid_target", "This server only signs in to the Webb Leads connector");
      return Response.redirect(
        withParams(`${siteUrl()}/connect`, { client_id: clientId, redirect_uri: redirectUri, state, code_challenge: challenge, resource }),
        302,
      );
    }),
  });

  http.route({
    path: "/oauth/token",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const form = await formOf(request);
      const clientId = form.client_id ?? "";
      if (!clientId) return oauthError("invalid_client", "client_id is required", 401);
      const accessToken = randomToken();
      const refreshToken = randomToken();
      const issue = (scopes: string[]) =>
        json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: ACCESS_TTL_MS / 1000,
          refresh_token: refreshToken,
          scope: scopes.join(" "),
        });
      if (form.grant_type === "authorization_code") {
        if (!form.code || !form.code_verifier) return oauthError("invalid_request", "code and code_verifier are required");
        const result = await ctx.runMutation(internal.oauth.exchangeCode, {
          codeHash: await sha256(form.code),
          clientId,
          redirectUri: form.redirect_uri,
          challenge: await challengeFor(form.code_verifier),
          accessHash: await sha256(accessToken),
          refreshHash: await sha256(refreshToken),
        });
        return result.ok ? issue(result.scopes) : oauthError(result.error, result.description);
      }
      if (form.grant_type === "refresh_token") {
        if (!form.refresh_token) return oauthError("invalid_request", "refresh_token is required");
        const result = await ctx.runMutation(internal.oauth.refresh, {
          refreshHash: await sha256(form.refresh_token),
          clientId,
          accessHash: await sha256(accessToken),
          newRefreshHash: await sha256(refreshToken),
        });
        return result.ok ? issue(result.scopes) : oauthError(result.error, result.description);
      }
      return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
    }),
  });
  http.route({ path: "/oauth/token", method: "OPTIONS", handler: preflight });

  http.route({
    path: "/oauth/revoke",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const form = await formOf(request);
      if (form.token) await ctx.runMutation(internal.oauth.revoke, { hash: await sha256(form.token) });
      return json({});
    }),
  });
  http.route({ path: "/oauth/revoke", method: "OPTIONS", handler: preflight });
}
