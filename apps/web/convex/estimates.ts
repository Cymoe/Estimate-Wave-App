import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertLinksInOrg, documentNumber, normalizeItems, withTotals } from "./lib/documents";
import { estimateFields, estimateStatus } from "./schema";

// Fields the UI may set directly; signature fields only change via `sign`,
// and the contract is locked by the server when the estimate is accepted.
// The design changes only through setDesign/removeDesign.
const serverOnly = new Set(["clientSignature", "signedAt", "contractLockedAt", "contractSnapshot", "design"]);

const MAX_DESIGN_BYTES = 10 * 1024 * 1024;

/** The file's type, or one guessed from its name when the upload didn't say. */
function designType(contentType: string | undefined, name: string): string {
  if (contentType) return contentType;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return "";
}

/** Deletes a design file unless the signed contract still shows it. */
async function deleteDesignFile(ctx: MutationCtx, estimate: Doc<"estimates">, storageId: Id<"_storage">) {
  if (estimate.contractSnapshot?.design?.storageId === storageId) return;
  if ((await ctx.db.system.get(storageId)) !== null) await ctx.storage.delete(storageId);
}
const writableFields = Object.fromEntries(Object.entries(estimateFields).filter(([key]) => !serverOnly.has(key)));

/** Freezes the contract as it stands, for an estimate being accepted. */
async function lockContract(ctx: MutationCtx, estimate: Doc<"estimates">, now: string) {
  const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
  const address = client ? [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ") : "";
  return {
    contractLockedAt: now,
    contractSnapshot: {
      client: client
        ? { name: client.name, email: client.email, phone: client.phone, address: address || undefined }
        : undefined,
      items: estimate.items,
      subtotal: estimate.subtotal,
      taxAmount: estimate.taxAmount,
      totalAmount: estimate.totalAmount,
      terms: estimate.contractTerms,
      design: estimate.design,
    },
  };
}

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
    status: v.optional(estimateStatus),
  },
  handler: async (ctx, { organizationId, clientId, status }) => {
    await requireMember(ctx, organizationId);
    const estimates = await ctx.db
      .query("estimates")
      .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(2000);
    return estimates.filter(
      (e) => (clientId === undefined || e.clientId === clientId) && (status === undefined || e.status === status),
    );
  },
});

export const get = query({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => (await getOwned(ctx, "estimates", id)).doc,
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = pick(data, writableFields);
    await assertLinksInOrg(ctx, organizationId, fields);
    const now = nowIso();
    const doc = withTotals({
      status: "draft" as const,
      issueDate: now,
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
      estimateNumber: documentNumber("EST"),
      ...fields,
      items: normalizeItems(fields.items),
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    const id = await ctx.db.insert("estimates", doc);
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: doc.estimateNumber, totalAmount: doc.totalAmount },
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("estimates"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    const patch = pick(data, writableFields, { forPatch: true });
    if ("contractTerms" in patch && doc.contractLockedAt) {
      fail("INVALID", "The contract was accepted, so its terms can't change. Use a change order.");
    }
    await assertLinksInOrg(ctx, doc.organizationId, patch);
    if ("items" in patch) patch.items = normalizeItems(patch.items);
    const { subtotal, taxAmount, totalAmount } = withTotals({ ...doc, ...patch });
    const now = nowIso();
    const updated = { ...doc, ...patch, subtotal, taxAmount, totalAmount };
    const lock = patch.status === "accepted" && !doc.contractLockedAt ? await lockContract(ctx, updated, now) : {};
    await ctx.db.patch(id, { ...patch, subtotal, taxAmount, totalAmount, ...lock, updatedAt: now });
    if (patch.status !== undefined && patch.status !== doc.status) {
      await logActivity(ctx, {
        organizationId: doc.organizationId,
        userId: user._id,
        action: "status_changed",
        resourceType: "estimate",
        resourceId: id,
        details: { from: doc.status, to: patch.status },
      });
    }
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    await ctx.db.delete(id);
    for (const file of [doc.design, doc.contractSnapshot?.design]) {
      if (file && (await ctx.db.system.get(file.storageId)) !== null) await ctx.storage.delete(file.storageId);
    }
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: doc.estimateNumber },
    });
    return { message: "Estimate deleted successfully" };
  },
});

export const sign = mutation({
  args: { id: v.id("estimates"), signature: v.string() },
  handler: async (ctx, { id, signature }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    const now = nowIso();
    const lock = doc.contractLockedAt ? {} : await lockContract(ctx, doc, now);
    await ctx.db.patch(id, { clientSignature: signature, signedAt: now, status: "accepted", ...lock, updatedAt: now });
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "signed",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: doc.estimateNumber },
    });
    return await ctx.db.get(id);
  },
});

/** Where the browser uploads a design file before attaching it with setDesign. */
export const designUploadUrl = mutation({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    await getOwned(ctx, "estimates", id);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Attaches an uploaded image or PDF as the estimate's design, replacing any earlier one. */
export const setDesign = mutation({
  args: { id: v.id("estimates"), storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, { id, storageId, name }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    const file = await ctx.db.system.get(storageId);
    if (file === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    const type = designType(file.contentType, name);
    if (!(type.startsWith("image/") || type === "application/pdf") || file.size > MAX_DESIGN_BYTES) {
      fail("INVALID", "The design must be an image or PDF of 10MB or less");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    if (doc.design && doc.design.storageId !== storageId) await deleteDesignFile(ctx, doc, doc.design.storageId);
    await ctx.db.patch(id, { design: { storageId, name, contentType: type, url }, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

export const removeDesign = mutation({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    if (doc.design) await deleteDesignFile(ctx, doc, doc.design.storageId);
    await ctx.db.patch(id, { design: undefined, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});
