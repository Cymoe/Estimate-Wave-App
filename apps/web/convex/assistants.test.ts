/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-RPC answers are read loosely in these tests */
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

// ---- The connector (/mcp) ----

let rpcId = 0;
async function rpc(t: T, accessToken: string | null, method: string, params?: Record<string, unknown>) {
  const res = await t.fetch("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  return { status: res.status, headers: res.headers, body: res.status === 200 ? ((await res.json()) as { result?: any; error?: any }) : null };
}

async function tool(t: T, accessToken: string, name: string, args: Record<string, unknown> = {}) {
  const { body } = await rpc(t, accessToken, "tools/call", { name, arguments: args });
  const result = body!.result as { content: Array<{ text: string }>; structuredContent?: any; isError?: boolean };
  return { text: result.content[0].text, data: result.structuredContent, isError: Boolean(result.isError) };
}

/** A roofing company with a lead sent to it by Tolliver, and one for sale in the Marketplace. */
async function roofingCompany() {
  const t = setup();
  const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
  const roofer = await signUp(t, "roofer@example.com");
  await t.run(async (ctx) => {
    await ctx.db.patch(roofer.organizationId, { leadTrades: ["roofing"], name: "Peak Roofing" });
  });
  await admin.as.mutation(api.marketplace.setLeadPrice, { jobType: "roofing", price: 300 });
  const forSale = await admin.as.mutation(api.marketplace.createLead, {
    data: { name: "Jane Cole", phone: "432-555-0101", jobType: "roofing", city: "Midland", notes: "Hail damage, needs a new roof" },
  });
  return { t, admin, roofer, forSaleId: forSale!._id as Id<"marketplaceLeads"> };
}

describe("the connector", () => {
  test("asks for sign-in without a token, then speaks MCP: initialize, tools, notifications", async () => {
    const t = setup();
    const owner = await signUp(t, "ana@basin.example");
    const none = await rpc(t, null, "initialize", { protocolVersion: "2025-06-18" });
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${API}/.well-known/oauth-protected-resource/mcp"`);
    expect((await rpc(t, "not-a-token", "tools/list")).status).toBe(401);

    const { accessToken } = await connect(t, owner);
    const init = await rpc(t, accessToken, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "1" } });
    expect(init.body!.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "tolliver", title: "Tolliver" } });
    expect((await rpc(t, accessToken, "initialize", { protocolVersion: "1999-01-01" })).body!.result.protocolVersion).toBe("2025-11-25");

    const notified = await t.fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(notified.status).toBe(202);
    expect((await rpc(t, accessToken, "ping")).body!.result).toEqual({});
    expect((await rpc(t, accessToken, "resources/list")).body!.error.code).toBe(-32601);

    const { tools } = (await rpc(t, accessToken, "tools/list")).body!.result as { tools: Array<{ name: string; annotations: any; securitySchemes: any }> };
    expect(tools.map((x) => x.name)).toEqual(expect.arrayContaining(["whats_new", "my_company", "list_my_leads", "get_lead", "update_lead", "browse_marketplace", "my_bids"]));
    const list = tools.find((x) => x.name === "list_my_leads")!;
    expect(list.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(list.securitySchemes).toEqual([{ type: "oauth2", scopes: ["leads"] }]);
    expect(tools.find((x) => x.name === "update_lead")!.annotations.readOnlyHint).toBe(false);
    expect((await t.fetch("/mcp", { method: "GET", headers: { authorization: `Bearer ${accessToken}` } })).status).toBe(405);
  });

  test("what's new reports a lead once; leads are listed, read, moved and noted like on the web", async () => {
    const { t, admin, roofer, forSaleId } = await roofingCompany();
    const { accessToken } = await connect(t, roofer);
    expect((await tool(t, accessToken, "whats_new")).text).toBe("Nothing new since the last check.");

    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 1000 });
    await admin.as.mutation(api.marketplace.assign, { leadId: forSaleId, organizationId: roofer.organizationId });
    const news = await tool(t, accessToken, "whats_new");
    expect(news.text).toContain("New leads (1):");
    expect(news.text).toContain("Jane Cole");
    expect(news.text).toContain("432-555-0101");
    expect(news.text).toContain("Sent by Tolliver");
    expect(news.text).toContain('not marked "Got it" yet');
    expect((await tool(t, accessToken, "whats_new")).text).toBe("Nothing new since the last check.");

    const leadId = news.data.received[0].id as string;
    const listed = await tool(t, accessToken, "list_my_leads", { search: "jane" });
    expect(listed.data.leads.map((l: { id: string }) => l.id)).toEqual([leadId]);
    expect((await tool(t, accessToken, "list_my_leads", { status: "won" })).text).toBe("No leads match.");

    await tool(t, accessToken, "acknowledge_lead", { lead_id: leadId });
    await tool(t, accessToken, "log_contact", { lead_id: leadId, kind: "call" });
    await tool(t, accessToken, "log_contact", { lead_id: leadId, kind: "note", note: "Booked Tuesday 9am" });
    const moved = await tool(t, accessToken, "update_lead", { lead_id: leadId, status: "scheduled", follow_up_date: "2026-11-03" });
    expect(moved.text).toBe("Jane Cole is now Estimate scheduled, follow up 2026-11-03.");
    const lead = await tool(t, accessToken, "get_lead", { lead_id: leadId });
    expect(lead.data).toMatchObject({ status: "scheduled", calls: 1, gotIt: true });
    expect(lead.text).toContain("Booked Tuesday 9am");
    expect(lead.text).toContain(`${SITE}/leads?lead=${leadId}`);

    // Bad input comes back as a tool error the assistant can read, and changes nothing.
    expect(await tool(t, accessToken, "update_lead", { lead_id: leadId, status: "sold" })).toMatchObject({ isError: true, text: expect.stringContaining("status must be one of") });
    expect((await tool(t, accessToken, "get_lead", { lead_id: "nope" })).isError).toBe(true);
  });

  test("another company's lead reads as not found, and the Marketplace never shows contact details before buying", async () => {
    const { t, roofer, forSaleId } = await roofingCompany();
    const other = await signUp(t, "x@other.example");
    const theirs = await other.as.mutation(api.leads.create, { organizationId: other.organizationId, data: { name: "Private Lead", phone: "555-9999" } });
    const { accessToken } = await connect(t, roofer);
    expect(await tool(t, accessToken, "get_lead", { lead_id: theirs!._id })).toMatchObject({ isError: true, text: "Not found" });
    expect((await tool(t, accessToken, "log_contact", { lead_id: theirs!._id, kind: "call" })).isError).toBe(true);

    const market = await tool(t, accessToken, "browse_marketplace");
    expect(market.data.leads).toEqual([expect.objectContaining({ id: forSaleId, city: "Midland", price: "$300.00" })]);
    expect(market.text).toContain("Hail damage");
    expect(market.text).not.toContain("432-555-0101");
    expect(market.text).not.toContain("Jane");
    expect((await tool(t, accessToken, "browse_marketplace", { trade: "painting" })).data.leads).toEqual([]);

    const company = await tool(t, accessToken, "my_company");
    expect(company.text).toContain("Peak Roofing: balance $0.00");
    expect(company.text).toContain("Buying and bidding are off for this assistant");
    expect((await tool(t, accessToken, "browse_vault")).text).toContain("The Vault needs the Pro plan");
    expect((await tool(t, accessToken, "add_funds_link")).text).toMatch(new RegExp(`^Add funds here: ${SITE}/fund/[a-f0-9]{32}$`));
    expect((await tool(t, accessToken, "my_bids")).text).toContain("No standing bids.");
  });

  test("disconnecting, or leaving the company, cuts the assistant off at once", async () => {
    const { t, roofer } = await roofingCompany();
    const { accessToken } = await connect(t, roofer);
    expect((await rpc(t, accessToken, "tools/list")).status).toBe(200);
    const [connection] = (await roofer.as.query(api.oauth.myConnections, { organizationId: roofer.organizationId })).connections;
    await roofer.as.mutation(api.oauth.disconnect, { id: connection.id });
    const after = await rpc(t, accessToken, "tools/list");
    expect(after.status).toBe(401);
    expect(after.headers.get("www-authenticate")).toContain('error="invalid_token"');

    const again = await connect(t, roofer);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", roofer.userId)).collect();
      for (const row of rows) await ctx.db.delete(row._id);
    });
    expect((await rpc(t, again.accessToken, "tools/list")).status).toBe(401);
  });

  test("an access token lasts an hour", async () => {
    vi.useFakeTimers();
    const { t, roofer } = await roofingCompany();
    const { accessToken } = await connect(t, roofer);
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect((await rpc(t, accessToken, "tools/list")).status).toBe(401);
  });
});

describe("buying and bidding from an assistant", () => {
  test("off unless the owner turned it on; then a buy checks the quoted price and the daily limit, and is logged as the assistant", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-26T15:00:00.000Z") });
    const { t, admin, roofer, forSaleId } = await roofingCompany();
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 1000 });
    const second = (await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Bob Ray", phone: "432-555-0102", jobType: "roofing", city: "Odessa" },
    }))!._id;

    const readOnly = await connect(t, roofer);
    expect(await tool(t, readOnly.accessToken, "buy_lead", { lead_id: forSaleId, expected_price: 300 })).toMatchObject({
      isError: true,
      text: expect.stringContaining("Buying and bidding are off"),
    });

    const spender = await connect(t, roofer, { spending: true, dailyCap: 500 });
    let accessToken = spender.accessToken;
    const stale = await tool(t, accessToken, "buy_lead", { lead_id: forSaleId, expected_price: 250 });
    expect(stale).toMatchObject({ isError: true, text: expect.stringContaining("It's $300.00 now, not $250.00. Nothing was bought") });

    const bought = await tool(t, accessToken, "buy_lead", { lead_id: forSaleId, expected_price: 300 });
    expect(bought.isError).toBe(false);
    expect(bought.text).toContain("Bought for $300.00.");
    expect(bought.text).toContain("Jane Cole · 432-555-0101");
    expect(bought.data.origin).toBe("Bought in the Marketplace · $300.00");
    expect((await tool(t, accessToken, "my_company")).text).toContain("up to $500.00 today ($300.00 spent so far)");

    // $300 more would pass the $500 limit: refused, and nothing is charged.
    const over = await tool(t, accessToken, "buy_lead", { lead_id: second, expected_price: 300 });
    expect(over).toMatchObject({ isError: true, text: expect.stringContaining("over today's $500.00 limit for this assistant ($300.00 spent so far, this is $300.00)") });
    expect((await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId })).balanceCents).toBe(70_000);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(second))!.status).toBe("available");
    });
    const connections = await roofer.as.query(api.oauth.myConnections, { organizationId: roofer.organizationId });
    expect(connections.connections.find((c) => c.spending)!.spentTodayCents).toBe(30_000);

    // A new day in Texas starts the limit over (the lead has dropped in price by then too).
    vi.setSystemTime(Date.parse("2026-10-27T15:00:00.000Z"));
    // The hour-long access token has run out by then; the assistant refreshes it, as Claude and ChatGPT do.
    expect((await rpc(t, accessToken, "tools/list")).status).toBe(401);
    accessToken = (await token(t, { grant_type: "refresh_token", refresh_token: spender.refreshToken, client_id: spender.clientId })).body.access_token;
    const price = (await tool(t, accessToken, "browse_marketplace")).data.leads[0].priceCents / 100;
    expect(price).toBeLessThan(300);
    expect((await tool(t, accessToken, "buy_lead", { lead_id: second, expected_price: price })).text).toContain(`Bought for $${price.toFixed(2)}`);

    await t.run(async (ctx) => {
      const logs = await ctx.db.query("activityLogs").withIndex("by_organization", (q) => q.eq("organizationId", roofer.organizationId)).collect();
      const spends = logs.filter((l) => l.action === "bought_lead");
      expect(spends).toHaveLength(2);
      expect(spends[0].metadata).toMatchObject({ via: "claude" });
      expect(spends[0].details).toEqual({ amountCents: 30_000 });
    });
  });

  test("standing bids stay under the limit; buy orders count toward it; a member can't spend even with an old grant", async () => {
    const { t, admin, roofer, forSaleId } = await roofingCompany();
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 1000 });
    const { accessToken } = await connect(t, roofer, { spending: true, dailyCap: 400 });

    expect(await tool(t, accessToken, "set_standing_bid", { county: "Midland", trade: "Roofing", amount: 450 })).toMatchObject({
      isError: true,
      text: expect.stringContaining("above this assistant's $400.00 daily limit"),
    });
    const set = await tool(t, accessToken, "set_standing_bid", { county: "midland", trade: "roofing", amount: 250 });
    expect(set.text).toBe("Standing bid set: $250.00 per roofing lead in Midland County · winning.");
    expect((await tool(t, accessToken, "set_standing_bid", { county: "Midland", trade: "Painting", amount: 250 })).text).toContain("Add Painting to your trades");
    const bids = await tool(t, accessToken, "my_bids");
    expect(bids.text).toContain("roofing in Midland County: $250.00 · winning");

    const order = await tool(t, accessToken, "place_buy_order", { lead_id: forSaleId, max: 250 });
    expect(order.text).toContain("Buy order placed at $250.00");
    expect((await tool(t, accessToken, "place_buy_order", { lead_id: forSaleId, max: 200 })).text).toContain("over today's $400.00 limit");
    const orderId = (await tool(t, accessToken, "my_bids")).data.orders[0].id;
    expect((await tool(t, accessToken, "cancel_buy_order", { order_id: orderId })).text).toBe("Buy order cancelled.");
    expect((await tool(t, accessToken, "remove_standing_bid", { bid_id: set.data.bidId })).text).toBe("Removed the Midland County bid.");

    // Moved down to member after connecting: the web's own admin check still says no.
    await t.run(async (ctx) => {
      const m = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", roofer.userId)).unique();
      await ctx.db.patch(m!._id, { role: "member" });
    });
    expect(await tool(t, accessToken, "set_standing_bid", { county: "Midland", trade: "roofing", amount: 100 })).toMatchObject({ isError: true, text: expect.stringContaining("access") });
  });
});

describe("alerts for companies with an assistant", () => {
  test("a new lead's email and text offer to open it in the assistant someone connected; nobody else's alerts change", async () => {
    const { t, admin, roofer, forSaleId } = await roofingCompany();
    await t.run(async (ctx) => {
      await ctx.db.patch(roofer.organizationId, { email: "office@peak.example" });
    });
    await roofer.as.mutation(api.users.setMobile, { mobile: "(432) 555-0177" });
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 1000 });
    const second = (await admin.as.mutation(api.marketplace.createLead, { data: { name: "Bob Ray", phone: "432-555-0102", jobType: "roofing", city: "Odessa" } }))!._id;

    const sent: Array<{ url: string; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url, body: String(init.body) });
        return { ok: true, status: 200, json: async () => ({ id: "x", sid: "SM1" }) };
      }),
    );
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_FROM", "+14320000000");
    const sell = async (leadId: Id<"marketplaceLeads">) => {
      vi.useFakeTimers();
      try {
        await admin.as.mutation(api.marketplace.assign, { leadId, organizationId: roofer.organizationId });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
      } finally {
        vi.useRealTimers();
      }
      const email = JSON.parse(sent.find((s) => s.url.includes("resend"))!.body) as { html: string; text: string };
      const sms = new URLSearchParams(sent.find((s) => s.url.includes("twilio"))!.body).get("Body")!;
      sent.length = 0;
      return { email, sms };
    };

    const before = await sell(forSaleId);
    expect(before.email.text).not.toContain("/open/");
    expect(before.sms).not.toContain("Ask ");

    await connect(t, roofer);
    const after = await sell(second);
    const orgLead = await t.run(async (ctx) => (await ctx.db.get(second))!.orgLeadId!);
    expect(after.email.text).toContain(`Open it in Claude: ${SITE}/open/claude/${orgLead}`);
    expect(after.email.html).toContain(`href="${SITE}/open/claude/${orgLead}"`);
    expect(after.sms).toContain(`Ask Claude: ${SITE}/open/claude/${orgLead}`);
  });
});

describe("lead origin wording after the rename", () => {
  test("leads stored with the old or new network source never read as Added by hand with that source", async () => {
    const { leadRoute } = await import("./lib/mcpTools");
    expect(leadRoute({ source: "FieldQuote Lead" } as never)).toBe("Added by hand");
    expect(leadRoute({ source: "Tolliver Lead" } as never)).toBe("Added by hand");
    expect(leadRoute({ source: "Referral" } as never)).toBe("Added by hand · Referral");
    expect(leadRoute({ marketplaceLeadId: "m1", wonVia: "sent", pricePaidCents: 4000, source: "FieldQuote Lead" } as never)).toBe("Sent by Tolliver · $40.00");
  });
});

describe("the Tolliver Report", () => {
  async function market() {
    const { t, admin, roofer, forSaleId } = await roofingCompany();
    const rival = await signUp(t, "rival@example.com");
    const now = Date.now();
    const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();
    await t.run(async (ctx) => {
      const stamp = new Date().toISOString();
      await ctx.db.insert("industries", { slug: "roofing", name: "Roofing", display_order: 1, is_active: true, created_at: stamp, updated_at: stamp });
      await ctx.db.insert("industries", { slug: "electrical", name: "Electrical", display_order: 2, is_active: true, created_at: stamp, updated_at: stamp });
      await ctx.db.patch(rival.organizationId, { name: "Rival Roofing Co", leadTrades: ["roofing"], walletBalanceCents: 100_000 });
      await ctx.db.insert("standingBids", { organizationId: rival.organizationId, county: "Midland", jobType: "roofing", amountCents: 32_000, createdBy: rival.userId, createdAt: stamp, updatedAt: stamp });
      const home = ["general-construction", "concrete", "roofing", "drywall", "window-door"];
      const permit = (n: string, address: string, appliedAt: string, extra: Record<string, unknown> = {}) =>
        ctx.db.insert("permits", {
          source: "midland",
          permitNumber: n,
          name: "Residential - Building",
          workClass: "Single Family",
          detail: "New Construction",
          address,
          county: "Midland",
          city: "Midland",
          appliedAt,
          trades: home,
          importedAt: stamp,
          url: `https://permits.example/${n}`,
          ...extra,
        });
      await permit("RES-1", "2837 ROLLING PLAINS LN", daysAgo(1));
      await permit("RES-2", "2841 ROLLING PLAINS LN", daysAgo(2));
      await permit("RES-3", "2845 ROLLING PLAINS LN", daysAgo(3));
      await permit("ELE-1", "100 MAIN ST", daysAgo(2), { name: "Electrical - Construction", workClass: undefined, detail: "Panel upgrade", trades: ["electrical"] });
      await permit("RES-4", "6600 HONEY LOCUST LN", daysAgo(9));
      await permit("RES-5", "6604 HONEY LOCUST LN", daysAgo(20));
      await permit("OLD-1", "1 OLD RD", daysAgo(60));
    });
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 1000 });
    await t.run(async (ctx) => {
      await ctx.db.patch(forSaleId, { county: "Midland" });
    });
    await admin.as.mutation(api.marketplace.assign, { leadId: forSaleId, organizationId: roofer.organizationId });
    return { t, roofer };
  }

  const proPlan = () => ({
    status: "active" as const,
    monthlyCents: 9900,
    claimsIncluded: 5,
    extraClaimCents: 2500,
    periodStart: new Date().toISOString(),
    nextChargeAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    claimsThisPeriod: 0,
  });

  test("free: the county's numbers, with the addresses, streets and own week held back for Pro", async () => {
    const { t, roofer } = await market();
    const { accessToken } = await connect(t, roofer);
    const report = await tool(t, accessToken, "tolliver_report");
    expect(report.text).toMatch(/^THE TOLLIVER REPORT · Midland County · /);
    expect(report.text).toContain("4 filed this week, up 300% on last week (1).");
    expect(report.text).toContain("New homes: 3 (1 the week before).");
    expect(report.text).toContain("By trade: Roofing 3 (yours) · Concrete 3 · Drywall 3 · General construction 3 · Window door 3 · Electrical 1");
    expect(report.text).toContain("Roofing (yours): leads win at $320.00 (1 funded bid)");
    expect(report.text).toContain("1 lead(s) sold, none last week.");
    expect(report.text).toContain("2 street(s) with several new homes going up this month; the Pro report names them.");
    expect(report.text).toContain("3 of them are in your trades.");
    expect(report.text).toContain(`comes with the Pro plan: ${SITE}/vault`);
    expect(report.text).not.toContain("Rolling Plains");
    expect(report.data.permits.list).toBeUndefined();
    expect(report.data.mine).toBeUndefined();
    // Other companies are never named, in the words or the data.
    expect(JSON.stringify(report)).not.toContain("Rival");
  });

  test("Pro: where homes are going up, this week's permits in the company's trades, and its own week", async () => {
    const { t, roofer } = await market();
    await t.run(async (ctx) => {
      await ctx.db.patch(roofer.organizationId, { plan: proPlan() });
    });
    const { accessToken } = await connect(t, roofer);
    const report = await tool(t, accessToken, "tolliver_report");
    expect(report.text).toContain("Where homes are going up (last 30 days): Rolling Plains Ln (3), Honey Locust Ln (2).");
    expect(report.text).toContain("- 2837 ROLLING PLAINS LN · New home · ");
    expect(report.text).not.toContain("100 MAIN ST");
    expect(report.text).toContain("YOUR WEEK");
    expect(report.text).toContain("3 permit(s) in your trades; 1 new lead(s) from Tolliver.");
    expect(report.text).toContain("No standing bids in Midland County.");
    expect(report.text).not.toContain("Pro plan:");
    expect(JSON.stringify(report)).not.toContain("Rival");

    // One trade: only its permits; an electrical company would see the panel upgrade.
    const electrical = await tool(t, accessToken, "tolliver_report", { trade: "Electrical" });
    expect(electrical.text).toMatch(/^THE TOLLIVER REPORT · Midland County · Electrical · /);
    expect(electrical.text).toContain("1 filed this week");
    expect(electrical.text).toContain("100 MAIN ST · Electrical - Construction: Panel upgrade");
    expect((await tool(t, accessToken, "tolliver_report", { trade: "Basket weaving" })).text).toBe("No trade called Basket weaving");
  });

  test("a county with no permit feed says so and still gives demand and sales", async () => {
    const { t, roofer } = await market();
    const { accessToken } = await connect(t, roofer);
    const report = await tool(t, accessToken, "tolliver_report", { county: "ector county" });
    expect(report.text).toMatch(/^THE TOLLIVER REPORT · Ector County · /);
    expect(report.text).toContain("No public permit feed for Ector County yet.");
    expect(report.text).toContain("No bids or leads in Ector County yet.");
    expect(report.text).toContain("No leads sold this week.");
  });

  test("street names and new homes are read from the permit's own words", async () => {
    const { streetOf, isNewHome, hotStreets } = await import("./lib/report");
    expect(streetOf("2837 ROLLING PLAINS LN")).toBe("Rolling Plains Ln");
    expect(streetOf("1002 S ATLANTA ST, Unit 4")).toBe("S Atlanta St");
    expect(streetOf("4234")).toBeUndefined();
    expect(isNewHome({ name: "Residential - Building", workClass: "Single Family", detail: "New Construction" })).toBe(true);
    expect(isNewHome({ name: "Residential - Building", detail: "New Residence" })).toBe(true);
    expect(isNewHome({ name: "Residential - Building", workClass: "Single Family", detail: "24X40 DETACHED CARPORT" })).toBe(false);
    expect(isNewHome({ name: "Residential - Building", workClass: "Addition", detail: "Addition" })).toBe(false);
    expect(hotStreets([{ name: "Residential - Building", workClass: "Single Family", address: "1 A ST" }])).toEqual([]);
  });
});
