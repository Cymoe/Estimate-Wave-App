import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso } from "./lib/access";
import { markSigned, resolveDocuments, type SignedDocument } from "./lib/contractDocs";
import { cents, contractTotal, invoicesFor, paymentSummary } from "./lib/invoicing";

// Signing later in the job: a change order (the scope changed since the
// contract was signed) or the affidavit of completion (the lien release at
// the end), each sent to the client as its own link and signed there.
// A signed change order becomes the agreed scope, so what's left to
// invoice follows it.

type Kind = Doc<"signoffs">["kind"];
const NAMES: Record<Kind, string> = { change_order: "Change Order", affidavit: "Affidavit of Completion" };
const PREFIX: Record<Kind, string> = { change_order: "CO", affidavit: "AFF" };

/** What changed between the signed scope and the estimate now, line by line. */
export function changesSince(signed: Doc<"estimates">["items"], current: Doc<"estimates">["items"]) {
  const changes: Array<{ description: string; before?: number; after?: number }> = [];
  const matched = new Set<string>();
  for (const item of current) {
    const before = signed.find((s) => !matched.has(s._id) && s._id === item._id);
    if (before) {
      matched.add(before._id);
      if (before.totalPrice !== item.totalPrice) changes.push({ description: item.description, before: before.totalPrice, after: item.totalPrice });
    } else changes.push({ description: item.description, after: item.totalPrice });
  }
  for (const item of signed) if (!matched.has(item._id)) changes.push({ description: item.description, before: item.totalPrice });
  return changes;
}

const toSigned = (r: Awaited<ReturnType<typeof resolveDocuments>>["affidavit"]): SignedDocument =>
  r.doc
    ? { kind: r.kind, source: "upload", name: r.name, docId: r.doc._id, fileName: r.doc.fileName, storageId: r.doc.storageId, sha256: r.doc.sha256, size: r.doc.size }
    : { kind: r.kind, source: "tolliver", name: r.name };

function view(s: Doc<"signoffs">) {
  return {
    id: s._id,
    kind: s.kind,
    name: NAMES[s.kind],
    number: s.number,
    status: s.status,
    token: s.token,
    changes: s.changes,
    previousTotal: s.previousTotal,
    newTotal: s.newTotal,
    completionDate: s.completionDate,
    signerName: s.signerName,
    signedAt: s.signedAt,
    createdAt: s.createdAt,
    documentName: s.document.name,
  };
}

/** Sends a change order or the affidavit to the client: a new link, replacing any unsigned one of the same kind. */
export const request = mutation({
  args: {
    estimateId: v.id("estimates"),
    kind: v.union(v.literal("change_order"), v.literal("affidavit")),
    completionDate: v.optional(v.string()),
  },
  handler: async (ctx, { estimateId, kind, completionDate }) => {
    const { doc: estimate, user } = await getOwned(ctx, "estimates", estimateId);
    const snapshot = estimate.contractSnapshot;
    if (estimate.status !== "accepted" || !snapshot) fail("INVALID", "Send it once the client has signed the estimate");
    const now = nowIso();
    let fields: Partial<Doc<"signoffs">> = {};
    if (kind === "change_order") {
      const changes = changesSince(snapshot.items, estimate.items);
      if (changes.length === 0) fail("INVALID", "Nothing has changed since the estimate was signed");
      fields = {
        changes,
        items: estimate.items,
        previousTotal: snapshot.totalAmount,
        subtotal: estimate.subtotal,
        taxAmount: estimate.taxAmount,
        newTotal: estimate.totalAmount,
      };
    } else {
      const day = completionDate ?? now.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("INVALID", "The completion date must be YYYY-MM-DD");
      fields = { completionDate: day };
    }
    for (const open of await ctx.db.query("signoffs").withIndex("by_estimate", (q) => q.eq("estimateId", estimateId)).take(100))
      if (open.kind === kind && open.status === "sent") await ctx.db.patch(open._id, { status: "cancelled", updatedAt: now });
    const resolved = await resolveDocuments(ctx, estimate);
    const document = toSigned(kind === "affidavit" ? resolved.affidavit : resolved.changeOrder);
    const id = await ctx.db.insert("signoffs", {
      organizationId: estimate.organizationId,
      estimateId,
      kind,
      number: `${PREFIX[kind]}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
      token: crypto.randomUUID().replace(/-/g, ""),
      status: "sent",
      ...fields,
      document,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, { organizationId: estimate.organizationId, userId: user._id, action: "sent_for_signature", resourceType: "estimate", resourceId: estimateId, details: { kind, estimateNumber: estimate.estimateNumber } });
    return view((await ctx.db.get(id))!);
  },
});

/** The change orders and affidavits sent for an estimate, newest first. */
export const forEstimate = query({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    await getOwned(ctx, "estimates", estimateId);
    const rows = await ctx.db.query("signoffs").withIndex("by_estimate", (q) => q.eq("estimateId", estimateId)).take(100);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(view);
  },
});

/** Withdraws one the client hasn't signed. */
export const cancel = mutation({
  args: { id: v.id("signoffs") },
  handler: async (ctx, { id }) => {
    const signoff = await ctx.db.get(id);
    if (signoff === null) fail("NOT_FOUND", "Not found");
    await getOwned(ctx, "estimates", signoff.estimateId);
    if (signoff.status !== "sent") fail("INVALID", "Only an unsigned one can be cancelled");
    await ctx.db.patch(id, { status: "cancelled", updatedAt: nowIso() });
    return null;
  },
});

async function byToken(ctx: QueryCtx | MutationCtx, token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return await ctx.db
    .query("signoffs")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

/** The client's page: what they're asked to sign, from whom, and the record once signed. */
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const signoff = await byToken(ctx, token);
    if (signoff === null) return null;
    const estimate = await ctx.db.get(signoff.estimateId);
    if (estimate === null) return null;
    const [organization, client] = await Promise.all([ctx.db.get(signoff.organizationId), estimate.clientId ? ctx.db.get(estimate.clientId) : null]);
    const paid = signoff.kind === "affidavit" ? paymentSummary(contractTotal(estimate), await invoicesFor(ctx, estimate._id)).paid : undefined;
    return {
      kind: signoff.kind,
      name: NAMES[signoff.kind],
      number: signoff.number,
      status: signoff.status,
      estimateNumber: estimate.estimateNumber,
      title: estimate.title,
      propertyAddress: estimate.contractSnapshot?.terms?.propertyAddress || estimate.contractSnapshot?.client?.address,
      clientName: client?.name ?? estimate.contractSnapshot?.client?.name,
      company: organization ? { name: organization.name, phone: organization.phone, email: organization.email } : undefined,
      changes: signoff.changes,
      previousTotal: signoff.previousTotal,
      newTotal: signoff.newTotal,
      difference: signoff.newTotal !== undefined && signoff.previousTotal !== undefined ? cents(signoff.newTotal - signoff.previousTotal) : undefined,
      contractTotal: contractTotal(estimate),
      paid,
      completionDate: signoff.completionDate,
      document: {
        name: signoff.document.name,
        source: signoff.document.source,
        fileName: signoff.document.fileName,
        url: signoff.document.storageId ? ((await ctx.storage.getUrl(signoff.document.storageId)) ?? undefined) : undefined,
        sha256: signoff.status === "signed" ? signoff.document.sha256 : undefined,
      },
      signerName: signoff.signerName,
      signature: signoff.signature,
      signedAt: signoff.signedAt,
      acknowledgedAt: signoff.acknowledgedAt,
    };
  },
});

/** The client signs. A change order then becomes the agreed scope and total. */
export const sign = mutation({
  args: { token: v.string(), signerName: v.string(), signature: v.string(), agreedToDocument: v.optional(v.boolean()) },
  handler: async (ctx, { token, signerName, signature, agreedToDocument }) => {
    const signoff = await byToken(ctx, token);
    if (signoff === null) fail("NOT_FOUND", "This link isn't valid");
    if (signoff.status !== "sent") fail("INVALID", signoff.status === "signed" ? "This has already been signed" : "This was withdrawn");
    if (!signature.trim()) fail("INVALID", "Please sign");
    if (!signerName.trim()) fail("INVALID", "Please type your name");
    if (signoff.document.source === "upload" && !agreedToDocument) fail("INVALID", "Please confirm you've read the attached document");
    const estimate = await ctx.db.get(signoff.estimateId);
    if (estimate === null || !estimate.contractSnapshot) fail("NOT_FOUND", "This link isn't valid");
    const now = nowIso();
    await ctx.db.patch(signoff._id, {
      status: "signed",
      signerName: signerName.trim().slice(0, 200),
      signature,
      signedAt: now,
      ...(signoff.document.source === "upload" ? { acknowledgedAt: now } : {}),
      updatedAt: now,
    });
    await markSigned(ctx, [signoff.document], now);
    if (signoff.kind === "change_order" && signoff.items)
      await ctx.db.patch(estimate._id, {
        contractSnapshot: {
          ...estimate.contractSnapshot,
          items: signoff.items,
          subtotal: signoff.subtotal ?? estimate.contractSnapshot.subtotal,
          taxAmount: signoff.taxAmount ?? estimate.contractSnapshot.taxAmount,
          totalAmount: signoff.newTotal ?? estimate.contractSnapshot.totalAmount,
        },
        updatedAt: now,
      });
    await logActivity(ctx, {
      organizationId: signoff.organizationId,
      userId: estimate.userId,
      action: signoff.kind === "change_order" ? "change_order_signed" : "affidavit_signed",
      resourceType: "estimate",
      resourceId: estimate._id,
      details: { number: signoff.number, estimateNumber: estimate.estimateNumber, signerName: signerName.trim() },
    });
    return null;
  },
});

