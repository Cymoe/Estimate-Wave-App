import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, isSuperAdmin, logActivity, nowIso, requireMember, requireUser } from "./lib/access";
import {
  ACCESS_TTL_MS,
  APP_NAMES,
  CODE_TTL_MS,
  DEFAULT_DAILY_CAP_CENTS,
  REFRESH_TTL_MS,
  appFor,
  issuer,
  randomToken,
  redirectMatches,
  resourceOk,
  sha256,
  withParams,
} from "./lib/oauth";

// The sign-in side of the assistant connector: who may connect, the
// approval the person gives on the web app's /connect page, and swapping
// the one-use code for tokens. lib/oauthRoutes.ts serves the HTTP side.

type Ctx = QueryCtx | MutationCtx;

async function clientById(ctx: Ctx, clientId: string) {
  return await ctx.db
    .query("oauthClients")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .unique();
}

/** The person's role in a company, or null when they aren't in it. Super admins count as owners. */
export async function roleIn(ctx: Ctx, user: Doc<"users">, organizationId: Id<"organizations">) {
  const organization = await ctx.db.get(organizationId);
  if (!organization?.isActive) return null;
  if (isSuperAdmin(user)) return "owner" as const;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_organization_and_user", (q) => q.eq("organizationId", organizationId).eq("userId", user._id))
    .unique();
  return membership?.role ?? null;
}

const canSpend = (role: string | null) => role === "owner" || role === "admin";

function capCents(dailyCap: number | undefined): number {
  if (dailyCap === undefined) return DEFAULT_DAILY_CAP_CENTS;
  const cents = Math.round(dailyCap * 100);
  if (!Number.isFinite(cents) || cents <= 0) fail("INVALID", "Enter a daily limit above $0");
  if (cents > 10_000_00) fail("INVALID", "The daily limit can be up to $10,000");
  return cents;
}

// ---- Clients ----

/** Dynamic client registration: an assistant registers its name and where to send people back. */
export const registerClient = internalMutation({
  args: { name: v.optional(v.string()), redirectUris: v.array(v.string()) },
  handler: async (ctx, { name, redirectUris }) => {
    const clientId = `fq_${randomToken(18)}`;
    const now = nowIso();
    await ctx.db.insert("oauthClients", {
      clientId,
      kind: "dcr",
      name: name?.slice(0, 100),
      redirectUris,
      createdAt: now,
      updatedAt: now,
    });
    return clientId;
  },
});

/** Keeps the metadata document of a client known by URL, fetched when it signs someone in. */
export const saveCimdClient = internalMutation({
  args: { clientId: v.string(), name: v.optional(v.string()), redirectUris: v.array(v.string()) },
  handler: async (ctx, { clientId, name, redirectUris }) => {
    const now = nowIso();
    const existing = await clientById(ctx, clientId);
    if (existing) await ctx.db.patch(existing._id, { name: name?.slice(0, 100), redirectUris, updatedAt: now });
    else await ctx.db.insert("oauthClients", { clientId, kind: "cimd", name: name?.slice(0, 100), redirectUris, createdAt: now, updatedAt: now });
  },
});

export const client = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => await clientById(ctx, clientId),
});

// ---- Approval on /connect ----

/**
 * What the approval page shows: which assistant is asking, and the
 * signed-in person's companies with whether they may let it spend.
 */
export const request = query({
  args: { clientId: v.string(), redirectUri: v.string() },
  handler: async (ctx, { clientId, redirectUri }) => {
    const user = await requireUser(ctx);
    const known = await clientById(ctx, clientId);
    if (!known || !redirectMatches(redirectUri, known.redirectUris)) return { ok: false as const };
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(100);
    const companies = [];
    for (const m of memberships) {
      const organization = await ctx.db.get(m.organizationId);
      if (!organization?.isActive) continue;
      companies.push({ id: organization._id, name: organization.name, canSpend: canSpend(m.role) || isSuperAdmin(user) });
    }
    const app = appFor(redirectUri);
    return {
      ok: true as const,
      app,
      appName: app === "other" ? known.name || new URL(redirectUri).hostname : APP_NAMES[app],
      domain: new URL(redirectUri).hostname,
      issuer: issuer(),
      companies: companies.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/** The person approved: a one-use code for the assistant, and where to send them back with it. */
export const approve = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    state: v.optional(v.string()),
    resource: v.optional(v.string()),
    organizationId: v.id("organizations"),
    spending: v.boolean(),
    dailyCap: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const known = await clientById(ctx, args.clientId);
    if (!known || !redirectMatches(args.redirectUri, known.redirectUris)) fail("INVALID", "This connection request isn't valid. Start again from the assistant.");
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(args.codeChallenge)) fail("INVALID", "This connection request isn't valid. Start again from the assistant.");
    if (!resourceOk(args.resource)) fail("INVALID", "This connection request is for another service");
    const role = await roleIn(ctx, user, args.organizationId);
    if (role === null) fail("FORBIDDEN", "You don't have access to this organization");
    if (args.spending && !canSpend(role)) fail("FORBIDDEN", "Only a company's owner or admins can let an assistant spend");
    const code = randomToken();
    await ctx.db.insert("oauthCodes", {
      codeHash: await sha256(code),
      clientId: args.clientId,
      userId: user._id,
      organizationId: args.organizationId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      scopes: args.spending ? ["leads", "spend"] : ["leads"],
      resource: args.resource,
      dailyCapCents: args.spending ? capCents(args.dailyCap) : 0,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
    return withParams(args.redirectUri, { code, state: args.state, iss: issuer() });
  },
});

// ---- Tokens ----

type TokenResult = { ok: true; scopes: string[] } | { ok: false; error: string; description: string };

/** Swaps an approved code (once, within 10 minutes, with the matching PKCE verifier) for a connection's tokens. */
export const exchangeCode = internalMutation({
  args: {
    codeHash: v.string(),
    clientId: v.string(),
    redirectUri: v.optional(v.string()),
    challenge: v.string(),
    accessHash: v.string(),
    refreshHash: v.string(),
  },
  handler: async (ctx, args): Promise<TokenResult> => {
    const bad = (description: string): TokenResult => ({ ok: false, error: "invalid_grant", description });
    const code = await ctx.db
      .query("oauthCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!code) return bad("Unknown code");
    if (code.usedAt) {
      // A code used twice may have been stolen: the connection it made is ended too.
      const made = await liveConnection(ctx, code.userId, code.organizationId, code.clientId);
      if (made) await ctx.db.patch(made._id, { revokedAt: Date.now() });
      return bad("Code already used");
    }
    await ctx.db.patch(code._id, { usedAt: Date.now() });
    if (code.expiresAt < Date.now()) return bad("Code expired");
    if (code.clientId !== args.clientId) return bad("Code was issued to another client");
    if (args.redirectUri !== undefined && args.redirectUri !== code.redirectUri) return bad("redirect_uri doesn't match");
    if (args.challenge !== code.codeChallenge) return bad("PKCE verifier doesn't match");
    const user = await ctx.db.get(code.userId);
    if (!user || (await roleIn(ctx, user, code.organizationId)) === null) return bad("No longer in this company");
    const known = await clientById(ctx, code.clientId);
    const now = Date.now();
    const tokens = {
      accessHash: args.accessHash,
      accessExpiresAt: now + ACCESS_TTL_MS,
      refreshHash: args.refreshHash,
      refreshExpiresAt: now + REFRESH_TTL_MS,
    };
    // Connecting the same assistant to the same company again replaces the old connection.
    const existing = await liveConnection(ctx, code.userId, code.organizationId, code.clientId);
    if (existing) {
      await ctx.db.patch(existing._id, { ...tokens, scopes: code.scopes, dailyCapCents: code.dailyCapCents, clientName: known?.name });
    } else {
      const id = await ctx.db.insert("aiConnections", {
        userId: code.userId,
        organizationId: code.organizationId,
        clientId: code.clientId,
        app: appFor(code.redirectUri),
        clientName: known?.name,
        scopes: code.scopes,
        dailyCapCents: code.dailyCapCents,
        ...tokens,
        createdAt: nowIso(),
        lastCheckedAt: now,
      });
      await logActivity(ctx, {
        organizationId: code.organizationId,
        userId: code.userId,
        action: "assistant_connected",
        resourceType: "assistant",
        resourceId: id,
        details: { app: appFor(code.redirectUri), scopes: code.scopes, dailyCapCents: code.dailyCapCents },
      });
    }
    return { ok: true, scopes: code.scopes };
  },
});

async function liveConnection(ctx: Ctx, userId: Id<"users">, organizationId: Id<"organizations">, clientId: string) {
  return (
    await ctx.db
      .query("aiConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).find((c) => c.organizationId === organizationId && c.clientId === clientId && !c.revokedAt);
}

/** New tokens for a connection; the refresh token is replaced each time. */
export const refresh = internalMutation({
  args: { refreshHash: v.string(), clientId: v.string(), accessHash: v.string(), newRefreshHash: v.string() },
  handler: async (ctx, args): Promise<TokenResult> => {
    const bad = (description: string): TokenResult => ({ ok: false, error: "invalid_grant", description });
    const connection = await ctx.db
      .query("aiConnections")
      .withIndex("by_refresh", (q) => q.eq("refreshHash", args.refreshHash))
      .unique();
    if (!connection || connection.revokedAt) return bad("Not connected");
    if (connection.clientId !== args.clientId) return bad("Token was issued to another client");
    if (connection.refreshExpiresAt < Date.now()) return bad("Expired: connect again");
    const user = await ctx.db.get(connection.userId);
    if (!user || (await roleIn(ctx, user, connection.organizationId)) === null) {
      await ctx.db.patch(connection._id, { revokedAt: Date.now() });
      return bad("No longer in this company");
    }
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      accessHash: args.accessHash,
      accessExpiresAt: now + ACCESS_TTL_MS,
      refreshHash: args.newRefreshHash,
      refreshExpiresAt: now + REFRESH_TTL_MS,
    });
    return { ok: true, scopes: connection.scopes };
  },
});

/** Ends the connection a token belongs to (either kind of token). */
export const revoke = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const connection =
      (await ctx.db.query("aiConnections").withIndex("by_access", (q) => q.eq("accessHash", hash)).unique()) ??
      (await ctx.db.query("aiConnections").withIndex("by_refresh", (q) => q.eq("refreshHash", hash)).unique());
    if (connection && !connection.revokedAt) await ctx.db.patch(connection._id, { revokedAt: Date.now() });
  },
});

// ---- Settings: Connected assistants ----

/** The signed-in person's assistants connected to a company. */
export const myConnections = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user } = await requireMember(ctx, organizationId);
    const role = await roleIn(ctx, user, organizationId);
    const rows = (
      await ctx.db
        .query("aiConnections")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).filter((c) => c.organizationId === organizationId && !c.revokedAt);
    return {
      canSpend: canSpend(role),
      connections: rows
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((c) => ({
          id: c._id,
          app: c.app,
          appName: c.app === "other" ? c.clientName || "An app" : APP_NAMES[c.app],
          connectedAt: c.createdAt,
          lastUsedAt: c.lastUsedAt,
          spending: c.scopes.includes("spend"),
          dailyCapCents: c.dailyCapCents,
          spentTodayCents: c.spendDay === undefined ? 0 : c.spentTodayCents ?? 0,
        })),
    };
  },
});

async function ownConnection(ctx: MutationCtx, id: Id<"aiConnections">) {
  const user = await requireUser(ctx);
  const connection = await ctx.db.get(id);
  if (!connection || connection.userId !== user._id || connection.revokedAt) fail("NOT_FOUND", "Not found");
  return { user, connection };
}

/** Turns spending on or off for a connection, or changes its daily limit. */
export const updateConnection = mutation({
  args: { id: v.id("aiConnections"), spending: v.boolean(), dailyCap: v.optional(v.number()) },
  handler: async (ctx, { id, spending, dailyCap }) => {
    const { user, connection } = await ownConnection(ctx, id);
    if (spending && !canSpend(await roleIn(ctx, user, connection.organizationId)))
      fail("FORBIDDEN", "Only a company's owner or admins can let an assistant spend");
    await ctx.db.patch(id, {
      scopes: spending ? ["leads", "spend"] : ["leads"],
      dailyCapCents: spending ? capCents(dailyCap ?? connection.dailyCapCents / 100) : 0,
    });
    await logActivity(ctx, {
      organizationId: connection.organizationId,
      userId: user._id,
      action: "assistant_updated",
      resourceType: "assistant",
      resourceId: id,
      details: { spending, dailyCap },
    });
  },
});

/** Disconnects an assistant: its tokens stop working at once. */
export const disconnect = mutation({
  args: { id: v.id("aiConnections") },
  handler: async (ctx, { id }) => {
    const { user, connection } = await ownConnection(ctx, id);
    await ctx.db.patch(id, { revokedAt: Date.now() });
    await logActivity(ctx, {
      organizationId: connection.organizationId,
      userId: user._id,
      action: "assistant_disconnected",
      resourceType: "assistant",
      resourceId: id,
      details: { app: connection.app },
    });
  },
});
