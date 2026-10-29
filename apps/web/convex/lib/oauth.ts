// Sign-in for assistants. Claude and ChatGPT connect to Webb Leads'
// connector (/mcp) with OAuth 2.1: the person signs in on the web app,
// picks a company and approves, and the assistant gets a token that acts
// for them in that company. Tokens are random; only their SHA-256 is stored.

export const SCOPES = ["leads", "spend"] as const;
export type Scope = (typeof SCOPES)[number];

export const CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** What a new connection may spend a day, unless the person picks another amount. */
export const DEFAULT_DAILY_CAP_CENTS = 50_000;

/** Where the connector lives: the deployment's own HTTP address. */
export const apiOrigin = () =>
  (process.env.CONVEX_SITE_URL ?? "https://basic-owl-573.convex.site").replace(/\/$/, "");
export const issuer = () => `${apiOrigin()}/oauth`;
export const resourceUrl = () => `${apiOrigin()}/mcp`;
export const resourceMetadataUrl = () => `${apiOrigin()}/.well-known/oauth-protected-resource/mcp`;

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export async function sha256(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

/** The S256 PKCE challenge for a verifier. */
export const challengeFor = sha256;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

/** A redirect a client may register: https anywhere, or http back to this computer (Claude Code). */
export function acceptableRedirect(uri: string): boolean {
  const url = parse(uri);
  if (!url || url.hash) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
}

/** Exact match, except a loopback redirect may use any port (RFC 8252). */
export function redirectMatches(uri: string, registered: string[]): boolean {
  if (registered.includes(uri)) return true;
  const url = parse(uri);
  if (!url || url.protocol !== "http:" || !LOOPBACK.has(url.hostname)) return false;
  return registered.some((r) => {
    const reg = parse(r);
    return reg !== null && reg.protocol === "http:" && reg.hostname === url.hostname && reg.pathname === url.pathname && reg.search === url.search;
  });
}

export type App = "claude" | "chatgpt" | "other";

/** Which assistant a connection is, from where it sends people back. */
export function appFor(redirectUri: string): App {
  const host = parse(redirectUri)?.hostname ?? "";
  if (host === "claude.ai" || host.endsWith(".claude.ai") || host === "claude.com" || host.endsWith(".claude.com")) return "claude";
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host.endsWith(".openai.com")) return "chatgpt";
  return "other";
}

export const APP_NAMES: Record<App, string> = { claude: "Claude", chatgpt: "ChatGPT", other: "An app" };

/** The resource a client asks for must be this connector (trailing slash or not). */
export function resourceOk(resource: string | null | undefined): boolean {
  if (!resource) return true;
  return resource.replace(/\/$/, "") === resourceUrl();
}

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Webb Leads",
  };
}

export function authorizationServerMetadata() {
  const o = apiOrigin();
  return {
    issuer: issuer(),
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/oauth/token`,
    registration_endpoint: `${o}/oauth/register`,
    revocation_endpoint: `${o}/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

/** Adds query parameters to a redirect, keeping any it already has. */
export function withParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [k, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(k, value);
  return url.toString();
}

/** Today's date in Central time, for the daily spending cap. */
export function centralDay(ms = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}
