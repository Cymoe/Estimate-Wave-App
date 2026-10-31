import { v } from "convex/values";
import { mutationDef, queryDef } from "./lib/actor";
import { mutation, query } from "./_generated/server";
import {
  fail,
  getOwned,
  logActivity,
  nowIso,
  pick,
  requireMember,
} from "./lib/access";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { withCategories } from "./lib/categories";
import { lockContract } from "./lib/contract";
import { askForDeposit } from "./lib/invoicing";
import { deletePhotos } from "./photos";
import {
  CHOICE_KEY,
  companyDocs,
  fileType,
  forPage,
  needsAcknowledgment,
  resolveDocuments,
  resolvedForPage,
  stampSignedCopies,
} from "./lib/contractDocs";
import {
  assertLinksInOrg,
  documentNumber,
  normalizeItems,
  withTotals,
} from "./lib/documents";
import { estimateFields, estimateStatus } from "./schema";

// Fields the UI may set directly; signature fields only change via `sign`,
// and the contract is locked by the server when the estimate is accepted.
// The design changes only through setDesign/removeDesign.
// The share link and when it was first opened are set by the server too.
const serverOnly = new Set([
  "clientSignature",
  "signedAt",
  "approvedAt",
  "approvedBy",
  "contractLockedAt",
  "contractSnapshot",
  "design",
  "contractDocs",
  "shareToken",
  "firstOpenedAt",
  "sentAt",
  "remindersSent",
  "lastReminderAt",
  "remindersOff",
  "lastEmailedAt",
]);

const MAX_DESIGN_BYTES = 10 * 1024 * 1024;

/** Deletes a design file unless the signed contract still shows it. */
async function deleteDesignFile(
  ctx: MutationCtx,
  estimate: Doc<"estimates">,
  storageId: Id<"_storage">,
) {
  if (estimate.contractSnapshot?.design?.storageId === storageId) return;
  if ((await ctx.db.system.get(storageId)) !== null)
    await ctx.storage.delete(storageId);
}
const writableFields = Object.fromEntries(
  Object.entries(estimateFields).filter(([key]) => !serverOnly.has(key)),
);

export const listDef = queryDef({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
    status: v.optional(estimateStatus),
  },
  handler: async (ctx, { organizationId, clientId, status }) => {
    await requireMember(ctx, organizationId);
    const estimates = await ctx.db
      .query("estimates")
      .withIndex("by_organization_and_issue_date", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(2000);
    return estimates.filter(
      (e) =>
        (clientId === undefined || e.clientId === clientId) &&
        (status === undefined || e.status === status),
    );
  },
});
export const list = query(listDef);

export const get = query({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    // Estimates saved before items kept their category get it filled in here.
    return { ...doc, items: await withCategories(ctx, doc.items) };
  },
});

export const createDef = mutationDef({
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
      items: await withCategories(ctx, normalizeItems(fields.items)),
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
      details: {
        estimateNumber: doc.estimateNumber,
        totalAmount: doc.totalAmount,
      },
    });
    return await ctx.db.get(id);
  },
});
export const create = mutation(createDef);

export const updateDef = mutationDef({
  args: { id: v.id("estimates"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    const patch = pick(data, writableFields, { forPatch: true });
    if ("contractTerms" in patch && doc.contractLockedAt) {
      fail(
        "INVALID",
        "The contract was accepted, so its terms can't change. Use a change order.",
      );
    }
    await assertLinksInOrg(ctx, doc.organizationId, patch);
    if ("items" in patch)
      patch.items = await withCategories(ctx, normalizeItems(patch.items));
    const { subtotal, taxAmount, totalAmount } = withTotals({
      ...doc,
      ...patch,
    });
    const now = nowIso();
    const updated = { ...doc, ...patch, subtotal, taxAmount, totalAmount };
    const lock =
      patch.status === "accepted" && !doc.contractLockedAt
        ? await lockContract(ctx, updated, now)
        : {};
    const approval =
      patch.status === "accepted" && doc.status !== "accepted" && !doc.clientSignature
        ? { approvedAt: now, approvedBy: approver(user) }
        : {};
    await ctx.db.patch(id, {
      ...patch,
      subtotal,
      taxAmount,
      totalAmount,
      ...lock,
      ...approval,
      // Reminders count from when it was first sent.
      ...(patch.status === "sent" && !doc.sentAt ? { sentAt: now } : {}),
      updatedAt: now,
    });
    if ("contractLockedAt" in lock) await askForDeposit(ctx, (await ctx.db.get(id))!, user._id);
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
export const update = mutation(updateDef);

/** Who approved an estimate, as the record shows it. */
function approver(user: Doc<"users">) {
  return { userId: user._id, name: user.name?.trim() || user.email || "Your team" };
}

const OPEN = new Set(["draft", "sent", "opened"]);

/**
 * Accepts the estimate for the client without their signature: they agreed
 * in person or on the phone. The agreement locks as it stands, the deposit
 * is asked for, and the estimate records who approved it, so nothing reads
 * as signed by the client.
 */
export const approve = mutation({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    if (doc.status === "accepted") fail("INVALID", "This estimate is already accepted.");
    if (!OPEN.has(doc.status)) fail("INVALID", "Only an open estimate can be approved. This one was declined or has expired.");
    if ((doc.items ?? []).length === 0) fail("INVALID", "Add line items before approving the estimate.");
    const now = nowIso();
    const lock = doc.contractLockedAt ? {} : await lockContract(ctx, doc, now);
    await ctx.db.patch(id, { status: "accepted", approvedAt: now, approvedBy: approver(user), ...lock, updatedAt: now });
    if ("contractLockedAt" in lock) await askForDeposit(ctx, (await ctx.db.get(id))!, user._id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "approved",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: doc.estimateNumber, from: doc.status },
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    await ctx.db.delete(id);
    for (const file of [doc.design, doc.contractSnapshot?.design]) {
      if (file && (await ctx.db.system.get(file.storageId)) !== null)
        await ctx.storage.delete(file.storageId);
    }
    // Its invoices, photos and change orders go with it.
    await deletePhotos(ctx, { estimateId: id });
    for (const signoff of await ctx.db.query("signoffs").withIndex("by_estimate", (q) => q.eq("estimateId", id)).take(100))
      await ctx.db.delete(signoff._id);
    for (const invoice of await ctx.db.query("invoices").withIndex("by_estimate", (q) => q.eq("estimateId", id)).take(200))
      await ctx.db.delete(invoice._id);
    // The job's own contract PDFs go with it; the company's library stays.
    const jobDocs = await ctx.db
      .query("contractDocs")
      .withIndex("by_estimate", (q) => q.eq("estimateId", id))
      .take(100);
    for (const d of jobDocs) {
      await ctx.db.delete(d._id);
      if ((await ctx.db.system.get(d.storageId)) !== null)
        await ctx.storage.delete(d.storageId);
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
  args: {
    id: v.id("estimates"),
    signature: v.string(),
    agreedToDocuments: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, signature, agreedToDocuments }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    const now = nowIso();
    const lock: Partial<Awaited<ReturnType<typeof lockContract>>> =
      doc.contractLockedAt
        ? {}
        : await lockContract(
            ctx,
            doc,
            now,
            agreedToDocuments ? now : undefined,
          );
    if (
      lock.contractSnapshot &&
      needsAcknowledgment(lock.contractSnapshot.documents) &&
      !agreedToDocuments
    )
      fail("INVALID", "Please confirm you've read the attached documents");
    await ctx.db.patch(id, {
      clientSignature: signature,
      signedAt: now,
      status: "accepted",
      ...lock,
      updatedAt: now,
    });
    await askForDeposit(ctx, (await ctx.db.get(id))!, user._id);
    await stampSignedCopies(ctx, id);
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
  args: {
    id: v.id("estimates"),
    storageId: v.id("_storage"),
    name: v.string(),
  },
  handler: async (ctx, { id, storageId, name }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    const file = await ctx.db.system.get(storageId);
    if (file === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    const type = fileType(file.contentType, name);
    if (
      !(type.startsWith("image/") || type === "application/pdf") ||
      file.size > MAX_DESIGN_BYTES
    ) {
      fail("INVALID", "The design must be an image or PDF of 10MB or less");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    if (doc.design && doc.design.storageId !== storageId)
      await deleteDesignFile(ctx, doc, doc.design.storageId);
    await ctx.db.patch(id, {
      design: { storageId, name, contentType: type, url },
      updatedAt: nowIso(),
    });
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

/**
 * The contract documents this estimate uses, for its Contract tab: the
 * agreement and attachments (as signed, once the contract is locked), the
 * affidavit and change order (used later in the job), and the company's own
 * defaults, so the tab can offer "use the company's".
 */
export const documents = query({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    const resolved = await resolveDocuments(ctx, doc);
    const signed = doc.contractSnapshot?.documents;
    const signedAgreement = signed?.find((d) => d.kind === "agreement");
    const companyAttachments = await companyDocs(
      ctx,
      doc.organizationId,
      "attachment",
    );
    const hidden = new Set(doc.contractDocs?.hiddenAttachments ?? []);
    const defaults = {
      agreement: (await companyDocs(ctx, doc.organizationId, "agreement"))[0]
        ?.name,
      affidavit: (await companyDocs(ctx, doc.organizationId, "affidavit"))[0]
        ?.name,
      changeOrder: (
        await companyDocs(ctx, doc.organizationId, "change_order")
      )[0]?.name,
    };
    return {
      locked: doc.contractLockedAt !== undefined,
      acknowledgedAt: doc.contractSnapshot?.acknowledgedAt,
      agreement: signedAgreement
        ? await forPage(ctx, signedAgreement, "signed")
        : await resolvedForPage(ctx, resolved.agreement),
      affidavit: await resolvedForPage(ctx, resolved.affidavit),
      changeOrder: await resolvedForPage(ctx, resolved.changeOrder),
      attachments: signed
        ? await Promise.all(
            signed
              .filter((d) => d.kind === "attachment")
              .map((d) => forPage(ctx, d, "signed")),
          )
        : await Promise.all(
            resolved.attachments.map((r) => resolvedForPage(ctx, r)),
          ),
      // The company's always-included attachments, with whether this job sends each.
      companyAttachments: companyAttachments.map((d) => ({
        docId: d._id,
        name: d.name,
        included: !hidden.has(d._id),
      })),
      companyDefaults: defaults,
    };
  },
});

const slotKind = v.union(
  v.literal("agreement"),
  v.literal("affidavit"),
  v.literal("change_order"),
);

/** This job's choice for one document: a PDF, Webb Leads', or null for the company's. */
export const setContractDoc = mutation({
  args: {
    id: v.id("estimates"),
    kind: slotKind,
    choice: v.union(v.id("contractDocs"), v.literal("tolliver"), v.null()),
  },
  handler: async (ctx, { id, kind, choice }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    if (doc.contractLockedAt)
      fail(
        "INVALID",
        "The contract was accepted, so its documents can't change.",
      );
    if (choice !== null && choice !== "tolliver") {
      const picked = await ctx.db.get(choice);
      if (
        picked === null ||
        picked.organizationId !== doc.organizationId ||
        picked.kind !== kind ||
        picked.archivedAt !== undefined ||
        (picked.estimateId !== undefined && picked.estimateId !== id)
      )
        fail("NOT_FOUND", "That document wasn't found");
    }
    const key = CHOICE_KEY[kind];
    const contractDocs = { ...(doc.contractDocs ?? {}) };
    if (choice === null) delete contractDocs[key];
    else contractDocs[key] = choice;
    await ctx.db.patch(id, { contractDocs, updatedAt: nowIso() });
    return null;
  },
});

/** Sends, or stops sending, one of the company's always-included attachments with this job. */
export const setAttachment = mutation({
  args: {
    id: v.id("estimates"),
    docId: v.id("contractDocs"),
    included: v.boolean(),
  },
  handler: async (ctx, { id, docId, included }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    if (doc.contractLockedAt)
      fail(
        "INVALID",
        "The contract was accepted, so its documents can't change.",
      );
    const attachment = await ctx.db.get(docId);
    if (
      attachment === null ||
      attachment.organizationId !== doc.organizationId ||
      attachment.kind !== "attachment" ||
      attachment.estimateId !== undefined
    )
      fail("NOT_FOUND", "That document wasn't found");
    const hidden = new Set(doc.contractDocs?.hiddenAttachments ?? []);
    if (included) hidden.delete(docId);
    else hidden.add(docId);
    await ctx.db.patch(id, {
      contractDocs: {
        ...(doc.contractDocs ?? {}),
        hiddenAttachments: [...hidden],
      },
      updatedAt: nowIso(),
    });
    return null;
  },
});

/** The secret for the estimate's client link, created the first time it's asked for. */
export const shareLink = mutation({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc } = await getOwned(ctx, "estimates", id);
    if (doc.shareToken) return doc.shareToken;
    const shareToken = crypto.randomUUID().replace(/-/g, "");
    await ctx.db.patch(id, { shareToken, updatedAt: nowIso() });
    return shareToken;
  },
});
