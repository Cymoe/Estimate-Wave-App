// Which contract documents an estimate uses. Each of the agreement, the
// affidavit of completion and the change order is, in order: the job's own
// choice (a PDF uploaded for it, or Tolliver's), the company's uploaded PDF,
// or Tolliver's built-in document. Attachments are the company's "always
// include" PDFs (less any turned off for the job) plus the job's own.
// The agreement and the attachments are what the client signs.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ContractDocKind = Doc<"contractDocs">["kind"];
export type SlotKind = Exclude<ContractDocKind, "attachment">;
export type SignedDocument = NonNullable<NonNullable<Doc<"estimates">["contractSnapshot"]>["documents"]>[number];

export const SLOT_KINDS: SlotKind[] = ["agreement", "affidavit", "change_order"];
export const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;

/** Tolliver's built-in documents, used when a company has none of its own. */
export const TOLLIVER_NAMES: Record<SlotKind, string> = {
  agreement: "Service Contract Agreement",
  affidavit: "Affidavit of Completion",
  change_order: "Change Order",
};

/** The estimate field holding the job's choice for each document. */
export const CHOICE_KEY = { agreement: "agreement", affidavit: "affidavit", change_order: "changeOrder" } as const;

/** The file's type, or one guessed from its name when the upload didn't say. */
export function fileType(contentType: string | undefined, name: string): string {
  if (contentType) return contentType;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return "";
}

/** "Basin Roofing Agreement.pdf" → "Basin Roofing Agreement". */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").trim() || fileName;
}

export type Origin = "job" | "company" | "tolliver";
export interface Resolved {
  kind: ContractDocKind;
  source: "tolliver" | "upload";
  origin: Origin;
  name: string;
  doc?: Doc<"contractDocs">;
}

/** A company's library documents in use: its default per kind and its always-included attachments. */
export async function companyDocs(ctx: QueryCtx, organizationId: Id<"organizations">, kind: ContractDocKind) {
  const rows = await ctx.db
    .query("contractDocs")
    .withIndex("by_organization_and_kind", (q) => q.eq("organizationId", organizationId).eq("kind", kind))
    .take(200);
  return rows.filter((d) => d.estimateId === undefined && d.active && d.archivedAt === undefined);
}

/** The documents this estimate uses right now (not what was signed; see signedDocuments). */
export async function resolveDocuments(ctx: QueryCtx, estimate: Doc<"estimates">) {
  const choices = estimate.contractDocs ?? {};
  const jobDocs = (
    await ctx.db
      .query("contractDocs")
      .withIndex("by_estimate", (q) => q.eq("estimateId", estimate._id))
      .take(100)
  ).filter((d) => d.archivedAt === undefined);

  const slot = async (kind: SlotKind): Promise<Resolved> => {
    const choice = choices[CHOICE_KEY[kind]];
    if (choice === "tolliver") return { kind, source: "tolliver", origin: "job", name: TOLLIVER_NAMES[kind] };
    if (choice !== undefined) {
      const doc = await ctx.db.get(choice);
      if (doc && doc.organizationId === estimate.organizationId && doc.kind === kind && doc.archivedAt === undefined)
        return { kind, source: "upload", origin: "job", name: doc.name, doc };
    }
    const [company] = await companyDocs(ctx, estimate.organizationId, kind);
    if (company) return { kind, source: "upload", origin: "company", name: company.name, doc: company };
    return { kind, source: "tolliver", origin: "tolliver", name: TOLLIVER_NAMES[kind] };
  };

  const hidden = new Set(choices.hiddenAttachments ?? []);
  const attachments: Resolved[] = [
    ...(await companyDocs(ctx, estimate.organizationId, "attachment"))
      .filter((d) => !hidden.has(d._id))
      .map((doc): Resolved => ({ kind: "attachment", source: "upload", origin: "company", name: doc.name, doc })),
    ...jobDocs
      .filter((d) => d.kind === "attachment")
      .map((doc): Resolved => ({ kind: "attachment", source: "upload", origin: "job", name: doc.name, doc })),
  ];

  return {
    agreement: await slot("agreement"),
    affidavit: await slot("affidavit"),
    changeOrder: await slot("change_order"),
    attachments,
  };
}

/** What goes out for signing: the agreement and the attachments, as the signed contract keeps them. */
export function signedDocuments(resolved: Awaited<ReturnType<typeof resolveDocuments>>): SignedDocument[] {
  return [resolved.agreement, ...resolved.attachments].map((r) =>
    r.doc
      ? {
          kind: r.kind,
          source: "upload" as const,
          name: r.name,
          docId: r.doc._id,
          fileName: r.doc.fileName,
          storageId: r.doc.storageId,
          sha256: r.doc.sha256,
          size: r.doc.size,
        }
      : { kind: r.kind, source: "tolliver" as const, name: r.name },
  );
}

/** True when the client must confirm reading uploaded documents before signing. */
export function needsAcknowledgment(documents: SignedDocument[] | undefined): boolean {
  return (documents ?? []).some((d) => d.source === "upload");
}

/** Marks the uploaded documents as signed, so their files are kept for good. */
export async function markSigned(ctx: MutationCtx, documents: SignedDocument[], now: string) {
  for (const d of documents) {
    if (!d.docId) continue;
    const doc = await ctx.db.get(d.docId);
    if (doc && doc.signedAt === undefined) await ctx.db.patch(d.docId, { signedAt: now });
  }
}

/** A document for a page: its name, whose it is, and a link to the file when it's a PDF. */
export async function forPage(
  ctx: QueryCtx,
  d: { kind: ContractDocKind; source: "tolliver" | "upload"; name: string; fileName?: string; storageId?: Id<"_storage">; sha256?: string; size?: number; docId?: Id<"contractDocs"> },
  origin: Origin | "signed",
) {
  return {
    kind: d.kind,
    source: d.source,
    origin,
    name: d.name,
    docId: d.docId,
    fileName: d.fileName,
    sha256: d.sha256,
    size: d.size,
    url: d.storageId ? ((await ctx.storage.getUrl(d.storageId)) ?? undefined) : undefined,
  };
}

/** A resolved document for a page. */
export async function resolvedForPage(ctx: QueryCtx, r: Resolved) {
  return await forPage(
    ctx,
    r.doc
      ? { kind: r.kind, source: "upload", name: r.name, docId: r.doc._id, fileName: r.doc.fileName, storageId: r.doc.storageId, sha256: r.doc.sha256, size: r.doc.size }
      : { kind: r.kind, source: "tolliver", name: r.name },
    r.origin,
  );
}
