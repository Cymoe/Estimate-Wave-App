import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";
import { challengeFor } from "./lib/oauth";

type T = ReturnType<typeof setup>;
type Person = Awaited<ReturnType<typeof signUp>>;

const API = "https://api.example";
const SITE = "https://app.example";
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(20) + "-verifier-that-is-long-enough_0123456789";

beforeEach(() => {
  vi.stubEnv("CONVEX_SITE_URL", API);
  vi.stubEnv("SITE_URL", SITE);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const form = (body: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(body).toString(),
});

async function register(t: T, redirect = CLAUDE_CALLBACK) {
  const res = await t.fetch("/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Claude", redirect_uris: [redirect] }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

/** Approves a connection on /connect as `person` and returns the code handed back. */
async function approve(
  person: Person,
  clientId: string,
  opts: { spending?: boolean; dailyCap?: number; organizationId?: Id<"organizations">; verifier?: string } = {},
) {
  const back = await person.as.mutation(api.oauth.approve, {
    clientId,
    redirectUri: CLAUDE_CALLBACK,
    codeChallenge: await challengeFor(opts.verifier ?? VERIFIER),
    state: "xyz",
    resource: `${API}/mcp`,
    organizationId: opts.organizationId ?? person.organizationId,
    spending: opts.spending ?? false,
    dailyCap: opts.dailyCap,
  });
  const url = new URL(back);
  expect(`${url.origin}${url.pathname}`).toBe(CLAUDE_CALLBACK);
  expect(url.searchParams.get("state")).toBe("xyz");
  expect(url.searchParams.get("iss")).toBe(`${API}/oauth`);
  return url.searchParams.get("code")!;
}

async function token(t: T, body: Record<string, string>) {
  const res = await t.fetch("/oauth/token", form(body));
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

/** The whole sign-in: register, approve, swap the code. Returns the tokens. */
export async function connect(t: T, person: Person, opts: { spending?: boolean; dailyCap?: number; clientId?: string } = {}) {
  const clientId = opts.clientId ?? (await register(t));
  const code = await approve(person, clientId, opts);
  const { status, body } = await token(t, {
    grant_type: "authorization_code",
    code,
    code_verifier: VERIFIER,
    client_id: clientId,
    redirect_uri: CLAUDE_CALLBACK,
  });
  expect(status).toBe(200);
  return { clientId, accessToken: body.access_token, refreshToken: body.refresh_token, scope: body.scope };
}

describe("assistant sign-in", () => {
  test("discovery documents point Claude and ChatGPT at our sign-in", async () => {
    const t = setup();
    const resource = await (await t.fetch("/.well-known/oauth-protected-resource/mcp")).json();
    expect(resource).toMatchObject({ resource: `${API}/mcp`, authorization_servers: [`${API}/oauth`] });
    const server = await (await t.fetch("/.well-known/oauth-authorization-server/oauth")).json();
    expect(server).toMatchObject({
      issuer: `${API}/oauth`,
      authorization_endpoint: `${API}/oauth/authorize`,
      token_endpoint: `${API}/oauth/token`,
      registration_endpoint: `${API}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    });
    expect((await t.fetch("/oauth/register", { method: "OPTIONS" })).headers.get("access-control-allow-origin")).toBe("*");
  });

  test("authorize checks the app and its return address, then hands the person to /connect", async () => {
    const t = setup();
    const clientId = await register(t);
    const query = (extra: Record<string, string>) =>
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: CLAUDE_CALLBACK,
        code_challenge: "c".repeat(43),
        code_challenge_method: "S256",
        state: "s1",
        resource: `${API}/mcp`,
        ...extra,
      }).toString();
    const ok = await t.fetch(`/oauth/authorize?${query({})}`, { redirect: "manual" });
    expect(ok.status).toBe(302);
    const to = new URL(ok.headers.get("location")!);
    expect(`${to.origin}${to.pathname}`).toBe(`${SITE}/connect`);
    expect(to.searchParams.get("client_id")).toBe(clientId);
    expect(to.searchParams.get("state")).toBe("s1");
    // A return address the app didn't register is never redirected to.
    expect((await t.fetch(`/oauth/authorize?${query({ redirect_uri: "https://evil.example/cb" })}`, { redirect: "manual" })).status).toBe(400);
    expect((await t.fetch(`/oauth/authorize?${query({ client_id: "nobody" })}`, { redirect: "manual" })).status).toBe(400);
    // No PKCE: back to the app with an error.
    const plain = await t.fetch(`/oauth/authorize?${query({ code_challenge_method: "plain" })}`, { redirect: "manual" });
    expect(new URL(plain.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
    const other = await t.fetch(`/oauth/authorize?${query({ resource: "https://other.example/mcp" })}`, { redirect: "manual" });
    expect(new URL(other.headers.get("location")!).searchParams.get("error")).toBe("invalid_target");
  });

  test("an app known by its metadata URL is read once and its redirects enforced", async () => {
    const t = setup();
    const clientId = "https://claude.ai/oauth/client.json";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ client_id: clientId, client_name: "Claude", redirect_uris: [CLAUDE_CALLBACK] })));
    vi.stubGlobal("fetch", fetchMock);
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: CLAUDE_CALLBACK,
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
    });
    expect((await t.fetch(`/oauth/authorize?${query}`, { redirect: "manual" })).status).toBe(302);
    expect((await t.fetch(`/oauth/authorize?${query}`, { redirect: "manual" })).status).toBe(302);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    query.set("redirect_uri", "https://claude.ai/somewhere-else");
    expect((await t.fetch(`/oauth/authorize?${query}`, { redirect: "manual" })).status).toBe(400);
  });

  test("the approval page lists the person's companies and who may let it spend", async () => {
    const t = setup();
    const owner = await signUp(t, "ana@basin.example");
    const clientId = await register(t);
    const asked = await owner.as.query(api.oauth.request, { clientId, redirectUri: CLAUDE_CALLBACK });
    expect(asked).toMatchObject({ ok: true, app: "claude", appName: "Claude", domain: "claude.ai" });
    expect(asked.ok && asked.companies).toEqual([{ id: owner.organizationId, name: "ana@basin.example Co", canSpend: true }]);
    expect(await owner.as.query(api.oauth.request, { clientId, redirectUri: "https://evil.example/cb" })).toEqual({ ok: false });

    // A plain member may connect to read, but not let it spend.
    const crew = await signUp(t, "crew@basin.example");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", { organizationId: owner.organizationId, userId: crew.userId, role: "member", createdAt: new Date().toISOString() });
    });
    await expect(approve(crew, clientId, { organizationId: owner.organizationId, spending: true })).rejects.toThrow(/owner or admins/);
    expect(await approve(crew, clientId, { organizationId: owner.organizationId })).toBeTruthy();
    // Nobody connects to a company they aren't in.
    const stranger = await signUp(t, "x@other.example");
    await expect(approve(stranger, clientId, { organizationId: owner.organizationId })).rejects.toThrow(/access/);
  });

  test("a code works once, with its verifier, within 10 minutes; refresh tokens are replaced on use", async () => {
    vi.useFakeTimers();
    const t = setup();
    const owner = await signUp(t, "ana@basin.example");
    const clientId = await register(t);
    const swap = (code: string, verifier = VERIFIER) =>
      token(t, { grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: CLAUDE_CALLBACK });

    const wrong = await swap(await approve(owner, clientId), "w".repeat(43));
    expect(wrong).toMatchObject({ status: 400, body: { error: "invalid_grant" } });

    const late = await approve(owner, clientId);
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect((await swap(late)).body.error).toBe("invalid_grant");

    const code = await approve(owner, clientId, { spending: true, dailyCap: 100 });
    const first = await swap(code);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "leads spend" });
    // Used again: refused, and the connection it made is ended in case the code was stolen.
    expect((await swap(code)).body.error).toBe("invalid_grant");
    expect((await owner.as.query(api.oauth.myConnections, { organizationId: owner.organizationId })).connections).toHaveLength(0);

    const again = await connect(t, owner, { spending: true, dailyCap: 100 });
    const refreshed = await token(t, { grant_type: "refresh_token", refresh_token: again.refreshToken, client_id: again.clientId });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refresh_token).not.toBe(again.refreshToken);
    expect((await token(t, { grant_type: "refresh_token", refresh_token: again.refreshToken, client_id: again.clientId })).body.error).toBe("invalid_grant");
    expect((await token(t, { grant_type: "client_credentials", client_id: again.clientId })).body.error).toBe("unsupported_grant_type");
  });

  test("Connected assistants: change the limit, turn spending off, disconnect; leaving the company ends it too", async () => {
    const t = setup();
    const owner = await signUp(t, "ana@basin.example");
    const tokens = await connect(t, owner, { spending: true, dailyCap: 250 });
    const listed = await owner.as.query(api.oauth.myConnections, { organizationId: owner.organizationId });
    expect(listed.canSpend).toBe(true);
    expect(listed.connections).toEqual([
      expect.objectContaining({ app: "claude", appName: "Claude", spending: true, dailyCapCents: 25_000, spentTodayCents: 0 }),
    ]);
    const id = listed.connections[0].id;
    // Connecting the same app to the same company again replaces it rather than adding a second.
    await connect(t, owner, { spending: true, dailyCap: 250, clientId: tokens.clientId });
    expect((await owner.as.query(api.oauth.myConnections, { organizationId: owner.organizationId })).connections.map((c) => c.id)).toEqual([id]);
    // The old tokens stop working once it's replaced.
    expect((await token(t, { grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: tokens.clientId })).body.error).toBe("invalid_grant");

    await owner.as.mutation(api.oauth.updateConnection, { id, spending: true, dailyCap: 75 });
    await owner.as.mutation(api.oauth.updateConnection, { id, spending: false });
    const after = (await owner.as.query(api.oauth.myConnections, { organizationId: owner.organizationId })).connections.find((c) => c.id === id)!;
    expect(after).toMatchObject({ spending: false, dailyCapCents: 0 });
    const other = await signUp(t, "x@other.example");
    await expect(other.as.mutation(api.oauth.disconnect, { id })).rejects.toThrow(/Not found/);

    await owner.as.mutation(api.oauth.disconnect, { id });
    expect((await owner.as.query(api.oauth.myConnections, { organizationId: owner.organizationId })).connections).toHaveLength(0);

    // Someone removed from the company can't refresh their way back in.
    const crew = await signUp(t, "crew@basin.example");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", { organizationId: owner.organizationId, userId: crew.userId, role: "admin", createdAt: new Date().toISOString() });
    });
    const clientId = await register(t);
    const code = await approve(crew, clientId, { organizationId: owner.organizationId });
    const crewTokens = (await token(t, { grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: clientId })).body;
    await t.run(async (ctx) => {
      const m = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", crew.userId)).collect();
      for (const row of m.filter((r) => r.organizationId === owner.organizationId)) await ctx.db.delete(row._id);
    });
    expect((await token(t, { grant_type: "refresh_token", refresh_token: crewTokens.refresh_token, client_id: clientId })).body.error).toBe("invalid_grant");

    // Revoking a token ends its connection.
    const last = await connect(t, owner);
    expect((await t.fetch("/oauth/revoke", form({ token: last.accessToken }))).status).toBe(200);
    expect((await token(t, { grant_type: "refresh_token", refresh_token: last.refreshToken, client_id: last.clientId })).body.error).toBe("invalid_grant");
  });
});
