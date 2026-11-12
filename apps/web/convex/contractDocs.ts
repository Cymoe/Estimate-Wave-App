// A company's own contract PDFs. The library (Settings → Contracts) holds
// its agreement, affidavit of completion and change order (each replacing
// Webb Leads' built-in one) and attachments sent with every estimate; an
// estimate can also have PDFs of its own. A file that has been signed is
// never deleted: removing it only archives it, so signed jobs keep it.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { fail, getOwned, nowIso, requireMember } from "./lib/access";
import { CHOICE_KEY, MAX_CONTRACT_BYTES, fileType, nameFromFile } from "./lib/contractDocs";
import { contractDocKind } from "./schema";

/** Who may change a document: an admin for the company's library, the estimate's editors for a job's own. */
async function canChange(ctx: MutationCtx, organizationId: Id<"organizations">, estimateId?: Id<"estimates">) {
  if (estimateId === undefined) return (await requireMember(ctx, organizationId, "admin")).user;
  const { doc, user } = await getOwned(ctx, "estimates", estimateId);
  if (doc.organizationId !== organizationId) fail("NOT_FOUND", "Not found");
  if (doc.contractLockedAt) fail("INVALID", "The contract was accepted, so its documents can't change.");
  return user;
}

/** The library's other in-use document of this kind stops being the company's default. */
async function clearActive(ctx: MutationCtx, organizationId: Id<"organizations">, kind: Doc<"contractDocs">["kind"], keep?: Id<"contractDocs">) {
  if (kind === "attachment") return;
  const rows = await ctx.db
    .query("contractDocs")
    .withIndex("by_organization_and_kind", (q) => q.eq("organizationId", organizationId).eq("kind", kind))
    .take(200);
  for (const d of rows) if (d.active && d.estimateId === undefined && d._id !== keep) await ctx.db.patch(d._id, { active: false });
}

/** Where the browser uploads a contract PDF before adding it with `add`. */
export const uploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Adds an uploaded PDF: to the company's library (it becomes the company's
 * document of that kind, or an always-included attachment), or to one
 * estimate (it becomes that job's document of that kind).
 */
export const add = mutation({
  args: {
    organizationId: v.id("organizations"),
    kind: contractDocKind,
    storageId: v.id("_storage"),
    fileName: v.string(),
    name: v.optional(v.string()),
    estimateId: v.optional(v.id("estimates")),
  },
  handler: async (ctx, { organizationId, kind, storageId, fileName, name, estimateId }) => {
    const user = await canChange(ctx, organizationId, estimateId);
    const file = await ctx.db.system.get(storageId);
    if (file === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    if (fileType(file.contentType, fileName) !== "application/pdf" || file.size > MAX_CONTRACT_BYTES)
      fail("INVALID", "Contracts must be a PDF of 10MB or less");
    const id = await ctx.db.insert("contractDocs", {
      organizationId,
      kind,
      name: name?.trim() || nameFromFile(fileName),
      fileName,
      storageId,
      size: file.size,
      sha256: file.sha256,
      estimateId,
      active: estimateId === undefined,
      uploadedBy: user._id,
      uploadedAt: nowIso(),
    });
    if (estimateId === undefined) await clearActive(ctx, organizationId, kind, id);
    else if (kind !== "attachment") {
      const estimate = (await ctx.db.get(estimateId))!;
      await ctx.db.patch(estimateId, {
        contractDocs: { ...(estimate.contractDocs ?? {}), [CHOICE_KEY[kind]]: id },
        updatedAt: nowIso(),
      });
    }
    return id;
  },
});

/** The company's library: what's in use, and earlier (archived) versions signed jobs still use. */
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const kinds = ["agreement", "affidavit", "change_order", "attachment"] as const;
    const rows: Doc<"contractDocs">[] = [];
    for (const kind of kinds) {
      const docs = await ctx.db
        .query("contractDocs")
        .withIndex("by_organization_and_kind", (q) => q.eq("organizationId", organizationId).eq("kind", kind))
        .take(200);
      rows.push(...docs.filter((d) => d.estimateId === undefined));
    }
    rows.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return await Promise.all(
      rows.map(async (d) => ({
        id: d._id,
        kind: d.kind,
        name: d.name,
        fileName: d.fileName,
        size: d.size,
        active: d.active,
        archived: d.archivedAt !== undefined,
        signed: d.signedAt !== undefined,
        uploadedAt: d.uploadedAt,
        url: (await ctx.storage.getUrl(d.storageId)) ?? undefined,
      })),
    );
  },
});

/** Makes a library document the company's default for its kind again. */
export const setActive = mutation({
  args: { id: v.id("contractDocs") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (doc === null || doc.estimateId !== undefined) fail("NOT_FOUND", "That document wasn't found");
    await requireMember(ctx, doc.organizationId, "admin");
    await clearActive(ctx, doc.organizationId, doc.kind, id);
    await ctx.db.patch(id, { active: true, archivedAt: undefined });
    return null;
  },
});

/** The company goes back to Webb Leads' built-in document of this kind. */
export const useBuiltIn = mutation({
  args: { organizationId: v.id("organizations"), kind: v.union(v.literal("agreement"), v.literal("affidavit"), v.literal("change_order")) },
  handler: async (ctx, { organizationId, kind }) => {
    await requireMember(ctx, organizationId, "admin");
    await clearActive(ctx, organizationId, kind);
    return null;
  },
});

/**
 * Removes a document. A signed one is archived (signed jobs keep showing
 * it); one never signed is deleted with its file.
 */
export const remove = mutation({
  args: { id: v.id("contractDocs") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (doc === null) fail("NOT_FOUND", "That document wasn't found");
    await canChange(ctx, doc.organizationId, doc.estimateId);
    if (doc.estimateId !== undefined && doc.kind !== "attachment") {
      const estimate = await ctx.db.get(doc.estimateId);
      const key = CHOICE_KEY[doc.kind];
      if (estimate?.contractDocs?.[key] === id) {
        const contractDocs = { ...estimate.contractDocs };
        delete contractDocs[key];
        await ctx.db.patch(estimate._id, { contractDocs, updatedAt: nowIso() });
      }
    }
    if (doc.signedAt !== undefined) {
      await ctx.db.patch(id, { active: false, archivedAt: nowIso() });
      return { archived: true };
    }
    await ctx.db.delete(id);
    if ((await ctx.db.system.get(doc.storageId)) !== null) await ctx.storage.delete(doc.storageId);
    return { archived: false };
  },
});
