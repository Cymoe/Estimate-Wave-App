import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
// A 1×1 PNG, as the signature pad would send.
const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

afterEach(() => vi.useRealTimers());

/** A real two-page PDF in storage. */
async function storePdf(t: T, pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage().drawText(`Page ${i + 1}`, { x: 50, y: 700 });
  const bytes = await doc.save();
  return { bytes, storageId: await t.run((ctx) => ctx.storage.store(new Blob([bytes], { type: "application/pdf" }))) };
}

const fileBytes = async (t: T, id: Id<"_storage">) => new Uint8Array(await t.run(async (ctx) => await (await ctx.storage.get(id))!.arrayBuffer()));
const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("the company's own PDFs, signed", () => {
  test("a signed estimate's uploaded agreement gets a copy with a signature page; the original is untouched", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { as, organizationId } = await signUp(t, "owner@peak.example");
    const { bytes, storageId } = await storePdf(t);
    await as.mutation(api.contractDocs.add, { organizationId, kind: "agreement", storageId, fileName: "Peak Agreement.pdf" });
    const estimate = (await as.mutation(api.estimates.create, {
      organizationId,
      data: { title: "Roof", items: [{ description: "Shingles", quantity: 1, unitPrice: 8000, totalPrice: 8000 }] },
    }))!;
    const token = await as.mutation(api.estimates.shareLink, { id: estimate._id });
    await t.mutation(api.publicEstimates.accept, { token, signature: SIG, agreedToDocuments: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const agreement = (await t.run((ctx) => ctx.db.get(estimate._id)))!.contractSnapshot!.documents!.find((d) => d.kind === "agreement")!;
    expect(agreement.signedCopyId).toBeDefined();
    expect(await pageCount(await fileBytes(t, agreement.signedCopyId!))).toBe(3);
    expect(await fileBytes(t, storageId)).toEqual(bytes);

    const page = (await t.query(api.publicEstimates.get, { token }))!;
    expect(page.documents.find((d) => d.kind === "agreement")).toMatchObject({ url: expect.any(String), signedUrl: expect.any(String) });
    expect((await as.query(api.estimates.documents, { id: estimate._id })).agreement).toMatchObject({ signedUrl: expect.any(String) });
  });

  test("a signed affidavit on the company's PDF gets its signature page too; a damaged file is left alone", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { as, organizationId } = await signUp(t, "owner@peak.example");
    const estimate = (await as.mutation(api.estimates.create, {
      organizationId,
      data: { title: "Roof", items: [{ description: "Shingles", quantity: 1, unitPrice: 8000, totalPrice: 8000 }] },
    }))!;
    const token = await as.mutation(api.estimates.shareLink, { id: estimate._id });
    await t.mutation(api.publicEstimates.accept, { token, signature: SIG });

    const { storageId } = await storePdf(t, 1);
    await as.mutation(api.contractDocs.add, { organizationId, kind: "affidavit", storageId, fileName: "Lien Release.pdf" });
    const sent = await as.mutation(api.signoffs.request, { estimateId: estimate._id, kind: "affidavit" });
    await t.mutation(api.signoffs.sign, { token: sent.token, signerName: "Ann Miller", signature: SIG, agreedToDocument: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const signed = (await t.query(api.signoffs.get, { token: sent.token }))!;
    expect(signed.document.signedUrl).toEqual(expect.any(String));
    const copy = (await t.run((ctx) => ctx.db.query("signoffs").first()))!.document.signedCopyId!;
    expect(await pageCount(await fileBytes(t, copy))).toBe(2);

    // Not a real PDF: signing still works, and there's just no signed copy.
    const broken = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.4 x"], { type: "application/pdf" })));
    await as.mutation(api.contractDocs.add, { organizationId, kind: "affidavit", storageId: broken, fileName: "Broken.pdf" });
    const again = await as.mutation(api.signoffs.request, { estimateId: estimate._id, kind: "affidavit" });
    await t.mutation(api.signoffs.sign, { token: again.token, signerName: "Ann Miller", signature: SIG, agreedToDocument: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.query(api.signoffs.get, { token: again.token }))!).toMatchObject({ status: "signed" });
    expect((await t.query(api.signoffs.get, { token: again.token }))!.document.signedUrl).toBeUndefined();
  });
});
