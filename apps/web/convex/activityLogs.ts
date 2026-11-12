import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { fail, getOwned, logActivity, requireMember } from "./lib/access";
import { CLIENT_ACTIONS, describe, type ActivityIcon, type ActivityTone } from "./lib/activityText";

const MAX_LIMIT = 500;

/** Newest first. Being a query, this updates live in the UI on every change. */
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    resourceType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, userId, resourceType, limit = 50 }) => {
    await requireMember(ctx, organizationId);
    const take = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
    const base =
      resourceType === undefined
        ? ctx.db.query("activityLogs").withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        : ctx.db
            .query("activityLogs")
            .withIndex("by_organization_and_resource_type", (q) =>
              q.eq("organizationId", organizationId).eq("resourceType", resourceType),
            );
    const ordered = base.order("desc");
    return userId === undefined
      ? await ordered.take(take)
      : await ordered.filter((q) => q.eq(q.field("userId"), userId)).take(take);
  },
});

export const get = query({
  args: { id: v.id("activityLogs") },
  handler: async (ctx, { id }) => (await getOwned(ctx, "activityLogs", id)).doc,
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const { action, resourceType, resourceId, details, metadata } = (data ?? {}) as Record<string, unknown>;
    if (typeof action !== "string" || typeof resourceType !== "string") {
      fail("INVALID", "action and resourceType are required");
    }
    const id = await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action,
      resourceType,
      resourceId: resourceId == null ? undefined : String(resourceId),
      details,
      metadata,
    });
    return await ctx.db.get(id);
  },
});

export type FeedRow = {
  id: Id<"activityLogs">;
  at: string;
  who: string;
  text: string;
  link?: string;
  icon: ActivityIcon;
  tone: ActivityTone;
};

/** Where a row opens in the app, when the thing still exists. */
async function linkFor(ctx: QueryCtx, row: Doc<"activityLogs">, organizationId: Id<"organizations">): Promise<string | undefined> {
  const raw = row.resourceId;
  if (!raw || row.action === "deleted") return undefined;
  const own = <T extends { organizationId?: Id<"organizations"> }>(doc: T | null) => (doc && doc.organizationId === organizationId ? doc : null);
  switch (row.resourceType) {
    case "estimate": {
      const id = ctx.db.normalizeId("estimates", raw);
      return id && own(await ctx.db.get(id)) ? `/estimates/${id}` : undefined;
    }
    case "project": {
      const id = ctx.db.normalizeId("projects", raw);
      return id && own(await ctx.db.get(id)) ? `/projects/${id}` : undefined;
    }
    case "lead": {
      const id = ctx.db.normalizeId("leads", raw);
      return id && own(await ctx.db.get(id)) ? `/leads?lead=${id}` : undefined;
    }
    case "client": {
      const id = ctx.db.normalizeId("clients", raw);
      return id && own(await ctx.db.get(id)) ? `/clients/${id}` : undefined;
    }
    case "purchase_order": {
      const id = ctx.db.normalizeId("purchaseOrders", raw);
      const po = id ? own(await ctx.db.get(id)) : null;
      return po ? `/projects/${po.projectId}` : undefined;
    }
    case "expense": {
      const id = ctx.db.normalizeId("expenses", raw);
      const expense = id ? own(await ctx.db.get(id)) : null;
      return expense?.projectId ? `/projects/${expense.projectId}` : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The company's activity in words, newest first: who did it (a person, the
 * client, or an assistant such as the office line), what, and where it
 * opens. Live: the Activity panel and page update as things happen.
 */
export const feed = query({
  args: { organizationId: v.id("organizations"), resourceType: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { organizationId, resourceType, limit = 50 }): Promise<FeedRow[]> => {
    await requireMember(ctx, organizationId);
    const take = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
    const rows =
      resourceType === undefined
        ? await ctx.db
            .query("activityLogs")
            .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
            .order("desc")
            .take(take)
        : await ctx.db
            .query("activityLogs")
            .withIndex("by_organization_and_resource_type", (q) => q.eq("organizationId", organizationId).eq("resourceType", resourceType))
            .order("desc")
            .take(take);

    const people = new Map<string, string>();
    const person = async (userId: Id<"users">) => {
      if (!people.has(userId)) {
        const user = await ctx.db.get(userId);
        people.set(userId, user?.name || user?.email?.split("@")[0] || "Someone");
      }
      return people.get(userId)!;
    };
    const assistants = new Map<string, string>();
    const assistant = async (connectionId: unknown) => {
      const key = typeof connectionId === "string" ? connectionId : "";
      if (!assistants.has(key)) {
        const id = key ? ctx.db.normalizeId("aiConnections", key) : null;
        const c = id ? await ctx.db.get(id) : null;
        assistants.set(
          key,
          !c ? "An assistant" : c.clientId === "office-line" ? "Office line" : c.app === "claude" ? "Claude" : c.app === "chatgpt" ? "ChatGPT" : c.clientName || "An assistant",
        );
      }
      return assistants.get(key)!;
    };
    const clients = new Map<string, string>();
    const clientOf = async (row: Doc<"activityLogs">) => {
      const d = (row.details ?? {}) as Record<string, unknown>;
      if (typeof d.client === "string" && d.client) return d.client;
      if (typeof d.signerName === "string" && d.signerName) return d.signerName;
      if (typeof d.referredBy === "string" && d.referredBy) return d.referredBy;
      const estimateId = row.resourceType === "estimate" && row.resourceId ? ctx.db.normalizeId("estimates", row.resourceId) : null;
      if (!estimateId) return "Client";
      if (!clients.has(estimateId)) {
        const estimate = await ctx.db.get(estimateId);
        const client = estimate?.clientId ? await ctx.db.get(estimate.clientId) : null;
        clients.set(estimateId, client?.name || "Client");
      }
      return clients.get(estimateId)!;
    };

    const out: FeedRow[] = [];
    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const who = CLIENT_ACTIONS.has(row.action)
        ? await clientOf(row)
        : meta.via === "assistant" || typeof meta.connectionId === "string"
          ? await assistant(meta.connectionId)
          : await person(row.userId);
      out.push({ id: row._id, at: row.createdAt, who, ...describe(row), link: await linkFor(ctx, row, organizationId) });
    }
    return out;
  },
});
