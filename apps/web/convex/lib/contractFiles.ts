import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { contractSnapshot, estimateDesign } from "../schema";

/** A file on the contract: an image (shown as a picture) or a PDF (a link). */
export type ContractFile = Infer<typeof estimateDesign>;

/**
 * The files going on an estimate's contract right now: its agreed design
 * (from before files could be marked) and every file marked In contract,
 * oldest first.
 */
export async function contractFiles(ctx: QueryCtx, estimate: Doc<"estimates">): Promise<ContractFile[]> {
  const files: ContractFile[] = estimate.design ? [estimate.design] : [];
  const rows = await ctx.db
    .query("jobPhotos")
    .withIndex("by_estimate", (q) => q.eq("estimateId", estimate._id))
    .take(500);
  for (const file of rows.filter((r) => r.inContract).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const url = await ctx.storage.getUrl(file.storageId);
    if (url) files.push({ storageId: file.storageId, name: file.fileName, contentType: file.contentType, url });
  }
  return files;
}

/** The files a signed contract went out with (one design on contracts signed before the list). */
export function signedFiles(snapshot: Infer<typeof contractSnapshot>): ContractFile[] {
  return snapshot.designs ?? (snapshot.design ? [snapshot.design] : []);
}

/** Whether a signed contract still shows this stored file, so it mustn't be deleted. */
export function signedWith(estimate: Doc<"estimates"> | null, storageId: Id<"_storage">): boolean {
  return !!estimate?.contractSnapshot && signedFiles(estimate.contractSnapshot).some((f) => f.storageId === storageId);
}
