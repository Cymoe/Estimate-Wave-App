import { v } from "convex/values";
import { logoUrlOf } from "./lib/organizations";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { fail, logActivity, nowIso } from "./lib/access";
import { isLang, langOf } from "./lib/i18n";
import { withCategories } from "./lib/categories";
import { lockContract } from "./lib/contract";
import { projectOnAccept } from "./lib/projectOnAccept";
import { needsAcknowledgment, resolveDocuments, signedDocuments, stampSignedCopies } from "./lib/contractDocs";
import { resolveTerms } from "./lib/contractDefaults";

// The client's side of an estimate, reached through its share link. No login:
// the link's token is the only key, and only what a client should see leaves
// the server (no red line or cap prices, no contract internals).

/** Statuses a client can still accept or decline from. */
const OPEN = new Set(["draft", "sent", "opened"]);

async function byToken(ctx: QueryCtx | MutationCtx, token: string): Promise<Doc<"estimates"> | null> {
  if (!token) return null;
  return await ctx.db
    .query("estimates")
    .withIndex("by_share_token", (q) => q.eq("shareToken", token))
    .unique();
}

async function requireByToken(ctx: MutationCtx, token: string): Promise<Doc<"estimates">> {
  const estimate = await byToken(ctx, token);
  if (estimate === null) fail("NOT_FOUND", "This estimate link isn't valid", "link_invalid");
  return estimate;
}

/** The note to the client with "{first name}" (or "{name}") filled in. */
function personalNote(note: string | undefined, clientName: string | undefined): string | undefined {
  const text = note?.trim();
  if (!text) return undefined;
  const full = clientName?.trim() ?? "";
  const first = full.split(/\s+/)[0] ?? "";
  // With no client name, "Hi {first name}," reads "Hi,".
  return text
    .replace(/ ?\{\s*first\s*name\s*\}/gi, first ? ` ${first}` : "")
    .replace(/ ?\{\s*name\s*\}/gi, full ? ` ${full}` : "")
    .replace(/^ /gm, "");
}

type Line = { description: string; quantity: number; unitPrice: number; totalPrice: number; category?: string };
type ClientDetail = "full" | "lines" | "categories";

/** How much of the price the client sees; the earlier on/off switch reads as "categories". */
function clientDetailOf(estimate: Doc<"estimates">): ClientDetail {
  return estimate.clientDetail ?? (estimate.hideLineItems ? "categories" : "full");
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** The total per category ("" for lines without one), in the order the lines first use them. */
function categoryTotals(lines: Line[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const category = line.category?.trim() || "";
    totals.set(category, cents((totals.get(category) ?? 0) + line.totalPrice));
  }
  return [...totals].map(([category, total]) => ({ category: category || undefined, total }));
}

/**
 * The lines the client sees: each with its price, each without its price
 * (no line's price leaves the server), or one line per category.
 */
function clientItems(items: Line[], detail: ClientDetail) {
  const lines = items.map(({ description, quantity, unitPrice, totalPrice, category }) => ({
    description,
    quantity,
    unitPrice,
    totalPrice,
    category,
  }));
  if (detail === "lines") return lines.map(({ description, quantity, category }) => ({ description, quantity, category }));
  if (detail === "categories")
    return categoryTotals(lines).map(({ category, total }) => ({
      description: category ?? "",
      quantity: 1,
      unitPrice: total,
      totalPrice: total,
      category,
    }));
  return lines;
}

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const estimate = await byToken(ctx, token);
    if (estimate === null) return null;
    const [client, organization] = await Promise.all([estimate.clientId ? ctx.db.get(estimate.clientId) : null, ctx.db.get(estimate.organizationId)]);
    const address = organization ? [organization.address, organization.city, organization.state, organization.zip].filter(Boolean).join(", ") : "";
    // Once signed, the client sees what they signed, not later edits.
    const signed = estimate.contractSnapshot;
    const terms = resolveTerms(organization?.agreement, signed ? signed.terms : estimate.contractTerms);
    const design = signed ? signed.design : estimate.design;
    // What the client signs besides the estimate: the agreement and any
    // attachments (the uploaded PDFs as signed, once signed). Fingerprints
    // only go out after signing, on the signed record.
    const docs = signed?.documents ?? signedDocuments(await resolveDocuments(ctx, estimate));
    const documents = await Promise.all(
      docs.map(async (d) => ({
        kind: d.kind,
        source: d.source,
        name: d.name,
        fileName: d.fileName,
        size: d.size,
        sha256: signed ? d.sha256 : undefined,
        url: d.storageId ? ((await ctx.storage.getUrl(d.storageId)) ?? undefined) : undefined,
        signedUrl: signed && d.signedCopyId ? ((await ctx.storage.getUrl(d.signedCopyId)) ?? undefined) : undefined,
      })),
    );
    const clientAddress = signed
      ? signed.client?.address
      : client
        ? [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ") || undefined
        : undefined;
    const lines = await withCategories(ctx, signed ? signed.items : estimate.items);
    return {
      estimateNumber: estimate.estimateNumber,
      title: estimate.title,
      description: estimate.description,
      clientMessage: personalNote(estimate.clientMessage, client?.name),
      status: estimate.status,
      issueDate: estimate.issueDate,
      expiryDate: estimate.expiryDate,
      // What the company shows: every line and price, the lines without prices, or one line per category.
      clientDetail: clientDetailOf(estimate),
      items: clientItems(lines, clientDetailOf(estimate)),
      categoryTotals: categoryTotals(lines),
      subtotal: signed ? signed.subtotal : estimate.subtotal,
      discountAmount: (signed ? signed.discountAmount : estimate.discountAmount) || undefined,
      discountLabel: signed ? signed.discountLabel : estimate.discountAmount ? estimate.discount?.label : undefined,
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
        paymentTerms: terms.paymentTerms,
        warrantyPeriod: terms.warrantyPeriod,
        extraTerms: terms.extraTerms,
      },
      documents,
      acknowledgedAt: signed?.acknowledgedAt,
      lockedAt: estimate.contractLockedAt,
      clientSignature: estimate.clientSignature,
      signedAt: estimate.signedAt,
      approvedAt: estimate.approvedAt,
      client: client ? { name: client.name, language: langOf(client) } : undefined,
      // The client's portal (everything for their jobs), when the company has made one.
      portalToken: client?.portalToken,
      business: organization
        ? {
            name: organization.name,
            email: organization.email,
            phone: organization.phone,
            address: address || undefined,
            logoUrl: await logoUrlOf(ctx, organization),
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
      ...(estimate.status === "sent" ? { status: "opened" as const, updatedAt: now } : {}),
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
    if (!OPEN.has(estimate.status)) fail("INVALID", "This estimate can no longer be accepted", "estimate_closed");
    if (!signature.trim()) fail("INVALID", "Please sign to accept the estimate", "signature_required");
    const now = nowIso();
    const lock: Partial<Awaited<ReturnType<typeof lockContract>>> = estimate.contractLockedAt
      ? {}
      : await lockContract(ctx, estimate, now, agreedToDocuments ? now : undefined);
    // Uploaded documents are signed only once the client says they've read them.
    if (lock.contractSnapshot && needsAcknowledgment(lock.contractSnapshot.documents) && !agreedToDocuments)
      fail("INVALID", "Please confirm you've read the attached documents", "documents_unread");
    const project = await projectOnAccept(ctx, estimate, estimate.userId, now);
    await ctx.db.patch(estimate._id, {
      clientSignature: signature,
      signedAt: now,
      status: "accepted",
      ...lock,
      ...project,
      updatedAt: now,
    });
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
    if (!OPEN.has(estimate.status)) fail("INVALID", "This estimate can no longer be declined", "estimate_closed");
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

/**
 * The client flipped the page to English or Spanish: remember it on their
 * record, so their emails and texts come in that language too.
 */
export const setLanguage = mutation({
  args: { token: v.string(), language: v.string() },
  handler: async (ctx, { token, language }) => {
    if (!isLang(language)) fail("INVALID", "Pick English or Spanish");
    const estimate = await requireByToken(ctx, token);
    if (!estimate.clientId) return null;
    const client = await ctx.db.get(estimate.clientId);
    if (client && client.language !== language) await ctx.db.patch(client._id, { language, updatedAt: nowIso() });
    return null;
  },
});
