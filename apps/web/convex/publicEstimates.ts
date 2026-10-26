import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { fail, logActivity, nowIso } from "./lib/access";
import { withCategories } from "./lib/categories";
import { lockContract } from "./lib/contract";
import { askForDeposit, cents, contractTotal, invoicesFor, paymentSummary } from "./lib/invoicing";
import {
  needsAcknowledgment,
  resolveDocuments,
  signedDocuments,
  stampSignedCopies,
} from "./lib/contractDocs";
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

/** What the client has been asked to pay and how, once they've signed. */
async function clientPayments(ctx: QueryCtx, estimate: Doc<"estimates">, organization: Doc<"organizations"> | null) {
  if (estimate.status !== "accepted") return undefined;
  const invoices = (await invoicesFor(ctx, estimate._id)).filter((i) => i.status !== "cancelled");
  if (invoices.length === 0) return undefined;
  return {
    invoices: invoices.map((i) => ({
      number: i.invoiceNumber,
      kind: i.kind ?? "other",
      description: i.items[0]?.description ?? "",
      total: i.totalAmount,
      paid: i.amountPaid,
      due: cents(i.totalAmount - i.amountPaid),
      dueDate: i.dueDate,
      paidDate: i.paidDate,
    })),
    ...paymentSummary(contractTotal(estimate), invoices),
    payLink: organization?.payments?.payLink,
    instructions: organization?.payments?.instructions,
  };
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
    // What the client signs besides the estimate: the agreement and any
    // attachments (the uploaded PDFs as signed, once signed). Fingerprints
    // only go out after signing, on the signed record.
    const docs =
      signed?.documents ??
      signedDocuments(await resolveDocuments(ctx, estimate));
    const documents = await Promise.all(
      docs.map(async (d) => ({
        kind: d.kind,
        source: d.source,
        name: d.name,
        fileName: d.fileName,
        size: d.size,
        sha256: signed ? d.sha256 : undefined,
        url: d.storageId
          ? ((await ctx.storage.getUrl(d.storageId)) ?? undefined)
          : undefined,
        signedUrl:
          signed && d.signedCopyId
            ? ((await ctx.storage.getUrl(d.signedCopyId)) ?? undefined)
            : undefined,
      })),
    );
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
      items: (
        await withCategories(ctx, signed ? signed.items : estimate.items)
      ).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        category: item.category,
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
      documents,
      payments: await clientPayments(ctx, estimate, organization),
      acknowledgedAt: signed?.acknowledgedAt,
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
  args: {
    token: v.string(),
    signature: v.string(),
    agreedToDocuments: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, signature, agreedToDocuments }) => {
    const estimate = await requireByToken(ctx, token);
    if (!OPEN.has(estimate.status))
      fail("INVALID", "This estimate can no longer be accepted");
    if (!signature.trim())
      fail("INVALID", "Please sign to accept the estimate");
    const now = nowIso();
    const lock: Partial<Awaited<ReturnType<typeof lockContract>>> =
      estimate.contractLockedAt
        ? {}
        : await lockContract(
            ctx,
            estimate,
            now,
            agreedToDocuments ? now : undefined,
          );
    // Uploaded documents are signed only once the client says they've read them.
    if (
      lock.contractSnapshot &&
      needsAcknowledgment(lock.contractSnapshot.documents) &&
      !agreedToDocuments
    )
      fail("INVALID", "Please confirm you've read the attached documents");
    await ctx.db.patch(estimate._id, {
      clientSignature: signature,
      signedAt: now,
      status: "accepted",
      ...lock,
      updatedAt: now,
    });
    await askForDeposit(ctx, (await ctx.db.get(estimate._id))!, estimate.userId);
    await stampSignedCopies(ctx, estimate._id);
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
