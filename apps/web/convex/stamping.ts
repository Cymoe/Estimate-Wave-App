import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { stampSignature } from "./lib/stampPdf";

// Signed copies of a company's own PDFs: once an estimate or a change order
// or affidavit is signed, each uploaded PDF signed gets a copy with a
// signature page at the end. The original file stays as it was.

/** The uploaded documents on a signed estimate that have no signed copy yet, and the signature. */
export const estimateToStamp = internalQuery({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    const estimate = await ctx.db.get(estimateId);
    const snapshot = estimate?.contractSnapshot;
    if (!estimate || !snapshot || !estimate.signedAt) return null;
    const organization = await ctx.db.get(estimate.organizationId);
    return {
      docs: (snapshot.documents ?? [])
        .map((d, index) => ({ index, storageId: d.storageId, name: d.name, fileName: d.fileName, sha256: d.sha256, done: Boolean(d.signedCopyId) }))
        .filter((d) => d.storageId && !d.done),
      title: estimate.title || "Estimate",
      reference: estimate.estimateNumber,
      company: organization?.name,
      signerName: snapshot.client?.name,
      signedAt: estimate.signedAt,
      acknowledgedAt: snapshot.acknowledgedAt,
      signature: estimate.clientSignature,
    };
  },
});

export const saveEstimateCopies = internalMutation({
  args: { estimateId: v.id("estimates"), copies: v.array(v.object({ index: v.number(), storageId: v.id("_storage") })) },
  handler: async (ctx, { estimateId, copies }) => {
    const estimate = await ctx.db.get(estimateId);
    if (!estimate?.contractSnapshot?.documents) return;
    const documents = estimate.contractSnapshot.documents.map((d, i) => {
      const copy = copies.find((c) => c.index === i);
      return copy && !d.signedCopyId ? { ...d, signedCopyId: copy.storageId } : d;
    });
    await ctx.db.patch(estimateId, { contractSnapshot: { ...estimate.contractSnapshot, documents } });
  },
});

export const stampEstimate = internalAction({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    const job = await ctx.runQuery(internal.stamping.estimateToStamp, { estimateId });
    if (!job) return 0;
    const copies: Array<{ index: number; storageId: Id<"_storage"> }> = [];
    for (const d of job.docs) {
      const file = await ctx.storage.get(d.storageId!);
      if (!file) continue;
      const stamped = await stampSignature(await file.arrayBuffer(), { ...job, fileName: d.fileName, sha256: d.sha256, title: `${d.name} · ${job.title}` }).catch(
        (err) => (console.warn(`Couldn't add a signature page to ${d.fileName}:`, err), null),
      );
      if (!stamped) continue;
      copies.push({ index: d.index, storageId: await ctx.storage.store(new Blob([stamped], { type: "application/pdf" })) });
    }
    if (copies.length) await ctx.runMutation(internal.stamping.saveEstimateCopies, { estimateId, copies });
    return copies.length;
  },
});

export const signoffToStamp = internalQuery({
  args: { signoffId: v.id("signoffs") },
  handler: async (ctx, { signoffId }) => {
    const signoff = await ctx.db.get(signoffId);
    if (!signoff || signoff.status !== "signed" || !signoff.document.storageId || signoff.document.signedCopyId) return null;
    const [estimate, organization] = await Promise.all([ctx.db.get(signoff.estimateId), ctx.db.get(signoff.organizationId)]);
    return {
      storageId: signoff.document.storageId,
      title: signoff.document.name,
      reference: `${signoff.number} · estimate ${estimate?.estimateNumber ?? ""}`.trim(),
      company: organization?.name,
      signerName: signoff.signerName,
      signedAt: signoff.signedAt!,
      acknowledgedAt: signoff.acknowledgedAt,
      signature: signoff.signature,
      fileName: signoff.document.fileName,
      sha256: signoff.document.sha256,
    };
  },
});

export const saveSignoffCopy = internalMutation({
  args: { signoffId: v.id("signoffs"), storageId: v.id("_storage") },
  handler: async (ctx, { signoffId, storageId }) => {
    const signoff = await ctx.db.get(signoffId);
    if (signoff && !signoff.document.signedCopyId) await ctx.db.patch(signoffId, { document: { ...signoff.document, signedCopyId: storageId } });
  },
});

export const stampSignoff = internalAction({
  args: { signoffId: v.id("signoffs") },
  handler: async (ctx, { signoffId }) => {
    const job = await ctx.runQuery(internal.stamping.signoffToStamp, { signoffId });
    if (!job) return 0;
    const file = await ctx.storage.get(job.storageId);
    if (!file) return 0;
    const stamped = await stampSignature(await file.arrayBuffer(), job).catch(
      (err) => (console.warn(`Couldn't add a signature page to ${job.fileName}:`, err), null),
    );
    if (!stamped) return 0;
    await ctx.runMutation(internal.stamping.saveSignoffCopy, { signoffId, storageId: await ctx.storage.store(new Blob([stamped], { type: "application/pdf" })) });
    return 1;
  },
});
