import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail } from "./lib/access";
import { actAs } from "./lib/actor";
import { findTool, type ToolResult } from "./lib/mcpTools";
import { roleIn } from "./oauth";

// The connector's server side: checks a request's token and runs a tool
// for the person and company behind it. lib/mcpServer.ts speaks MCP over
// HTTP and calls these.

/** How often a connection's "last used" is written, at most. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

async function live(ctx: QueryCtx | MutationCtx, accessHash: string): Promise<Doc<"aiConnections"> | null> {
  const connection = await ctx.db
    .query("aiConnections")
    .withIndex("by_access", (q) => q.eq("accessHash", accessHash))
    .unique();
  if (!connection || connection.revokedAt || connection.accessExpiresAt < Date.now()) return null;
  // Someone removed from the company loses their assistant at once.
  const user = await ctx.db.get(connection.userId);
  if (!user || (await roleIn(ctx, user, connection.organizationId)) === null) return null;
  return connection;
}

/** Whether a token is good for the connector right now, and what it may do. */
export const authorize = internalQuery({
  args: { accessHash: v.string() },
  handler: async (ctx, { accessHash }) => {
    const connection = await live(ctx, accessHash);
    return connection ? { ok: true as const, scopes: connection.scopes } : { ok: false as const };
  },
});

/** Runs one tool for the connection. Any error undoes everything the tool did. */
export const call = internalMutation({
  args: { accessHash: v.string(), name: v.string(), args: v.any() },
  handler: async (ctx, { accessHash, name, args }): Promise<ToolResult> => {
    const connection = await live(ctx, accessHash);
    if (!connection) fail("UNAUTHENTICATED", "Sign in to Webb Leads again");
    const tool = findTool(name);
    if (!tool) fail("INVALID", `Unknown tool ${name}`);
    if (!connection.scopes.includes(tool.scope))
      fail("FORBIDDEN", "Buying and bidding are off for this assistant. The person can turn them on in Webb Leads → Company settings → Assistants.");
    const now = Date.now();
    if (!connection.lastUsedAt || now - connection.lastUsedAt > TOUCH_EVERY_MS) await ctx.db.patch(connection._id, { lastUsedAt: now });
    const input = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
    return await tool.run(actAs(ctx as MutationCtx, connection.userId, connection._id), connection, input);
  },
});
