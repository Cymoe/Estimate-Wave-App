import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { fail, logActivity, nowIso } from "./lib/access";
import { lockContract } from "./lib/contract";
import {
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_WARRANTY,
} from "./lib/contractDefaults";

// The client's side of an estimate, reached through its share link. No login:
// the link's token is the only key, and only what a client should see leaves
// the server (no red line or cap prices, no contract internals).

/** Statuses a client can still accept or decline from. */
const OPEN = new Set(["draft", "sent", "opened"]);

async function byToken(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<Doc<"estimates"> | null> {
  if (!token) return null;
  return await ctx.db
    .query("estimates")
    .withIndex("by_share_token", (q) => q.eq("shareToken", token))
    .unique();
}

async function requireByToken(
  ctx: MutationCtx,
  token: string,
): Promise<Doc<"estimates">> {
  const estimate = await byToken(ctx, token);
  if (estimate === null) fail("NOT_FOUND", "This estimate link isn't valid");
  return estimate;
}

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const estimate = await byToken(ctx, token);
    if (estimate === null) return null;
    const [client, organization] = await Promise.all([
      estimate.clientId ? ctx.db.get(estimate.clientId) : null,
      ctx.db.get(estimate.organizationId),
    ]);
    const address = organization
      ? [
          organization.address,
          organization.city,
          organization.state,
          organization.zip,
        ]
          .filter(Boolean)
          .join(", ")
      : "";
    // Once signed, the client sees what they signed, not later edits.
    const signed = estimate.contractSnapshot;
    const terms = (signed ? signed.terms : estimate.contractTerms) ?? {};
    const design = signed ? signed.design : estimate.design;
    const clientAddress = signed
      ? signed.client?.address
      : client
        ? [client.address, client.city, client.state, client.zip]
            .filter(Boolean)
            .join(", ") || undefined
        : undefined;
    return {
      estimateNumber: estimate.estimateNumber,
      title: estimate.title,
      description: estimate.description,
      status: estimate.status,
      issueDate: estimate.issueDate,
      expiryDate: estimate.expiryDate,
      items: (signed ? signed.items : estimate.items).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      subtotal: signed ? signed.subtotal : estimate.subtotal,
      taxRate: estimate.taxRate,
      taxAmount: signed ? signed.taxAmount : estimate.taxAmount,
      totalAmount: signed ? signed.totalAmount : estimate.totalAmount,
      notes: estimate.notes,
      terms: estimate.terms,
      design: design
        ? {
            url: design.url,
            name: design.name,
            contentType: design.contentType,
          }
        : undefined,
      agreement: {
        propertyAddress: terms.propertyAddress || clientAddress,
        workDescription: terms.workDescription || estimate.description,
        startDate: terms.startDate,
        completionDate: terms.completionDate,
        paymentTerms: terms.paymentTerms || DEFAULT_PAYMENT_TERMS,
        warrantyPeriod: terms.warrantyPeriod || DEFAULT_WARRANTY,
      },
      lockedAt: estimate.contractLockedAt,
      clientSignature: estimate.clientSignature,
      signedAt: estimate.signedAt,
      client: client ? { name: client.name } : undefined,
      business: organization
        ? {
            name: organization.name,
            email: organization.email,
            phone: organization.phone,
            address: address || undefined,
          }
        : undefined,
    };
  },
});

/** Marks a sent estimate as opened the first time the client views it. */
export const markOpened = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const estimate = await byToken(ctx, token);
    if (estimate === null || estimate.firstOpenedAt) return;
    const now = nowIso();
    await ctx.db.patch(estimate._id, {
      firstOpenedAt: now,
      ...(estimate.status === "sent"
        ? { status: "opened" as const, updatedAt: now }
        : {}),
    });
  },
});

export const accept = mutation({
  args: { token: v.string(), signature: v.string() },
  handler: async (ctx, { token, signature }) => {
    const estimate = await requireByToken(ctx, token);
    if (!OPEN.has(estimate.status))
      fail("INVALID", "This estimate can no longer be accepted");
    if (!signature.trim())
      fail("INVALID", "Please sign to accept the estimate");
    const now = nowIso();
    const lock = estimate.contractLockedAt
      ? {}
      : await lockContract(ctx, estimate, now);
    await ctx.db.patch(estimate._id, {
      clientSignature: signature,
      signedAt: now,
      status: "accepted",
      ...lock,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: estimate.userId,
      action: "accepted_by_client",
      resourceType: "estimate",
      resourceId: estimate._id,
      details: { estimateNumber: estimate.estimateNumber },
    });
  },
});

export const decline = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const estimate = await requireByToken(ctx, token);
    if (!OPEN.has(estimate.status))
      fail("INVALID", "This estimate can no longer be declined");
    await ctx.db.patch(estimate._id, {
      status: "rejected",
      updatedAt: nowIso(),
    });
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: estimate.userId,
      action: "declined_by_client",
      resourceType: "estimate",
      resourceId: estimate._id,
      details: { estimateNumber: estimate.estimateNumber },
    });
  },
});
