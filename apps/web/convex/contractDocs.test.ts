import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;

const store = (t: T, type = "application/pdf", body = "%PDF-1.4 x") =>
  t.run((ctx) => ctx.storage.store(new Blob([body], { type })));
const exists = (t: T, id: Id<"_storage">) => t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);

/** A company, an estimate with one item and a share link. */
async function company(t: T) {
  const owner = await signUp(t, "owner@roof.example");
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: { title: "Roof", items: [{ description: "Shingles", quantity: 1, unitPrice: 100, totalPrice: 100 }] },
  }))!;
  const token = await owner.as.mutation(api.estimates.shareLink, { id: estimate._id });
  return { ...owner, estimateId: estimate._id, token };
}

async function upload(t: T, as: Awaited<ReturnType<typeof signUp>>["as"], args: Record<string, unknown>) {
  const storageId = await store(t);
  return await as.mutation(api.contractDocs.add, { storageId, fileName: "Basin Agreement.pdf", ...args } as never);
}

describe("company contract documents", () => {
  test("only PDFs of 10MB or less, and only admins change the company's library", async () => {
    const t = setup();
    const { as, organizationId, estimateId } = await company(t);
    expect(await as.mutation(api.contractDocs.uploadUrl, { organizationId })).toEqual(expect.any(String));
    const png = await store(t, "image/png");
    await expect(
      as.mutation(api.contractDocs.add, { organizationId, kind: "agreement", storageId: png, fileName: "a.png" }),
    ).rejects.toThrow(/PDF of 10MB/);
    const big = await store(t, "application/pdf", "x".repeat(10 * 1024 * 1024 + 1));
    await expect(
      as.mutation(api.contractDocs.add, { organizationId, kind: "agreement", storageId: big, fileName: "big.pdf" }),
    ).rejects.toThrow(/PDF of 10MB/);

    // A plain member can't change the library, but can add a PDF to a job.
    const member = await signUp(t, "rep@roof.example");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", { organizationId, userId: member.userId, role: "member", createdAt: new Date().toISOString() });
    });
    await expect(upload(t, member.as, { organizationId, kind: "agreement" })).rejects.toThrow(/access/);
    expect(await upload(t, member.as, { organizationId, kind: "attachment", estimateId })).toEqual(expect.any(String));

    // Another company can't touch it.
    const other = await signUp(t, "other@paint.example");
    await expect(upload(t, other.as, { organizationId, kind: "attachment", estimateId })).rejects.toThrow();
  });

  test("each document is the job's choice, else the company's PDF, else Webb Leads'", async () => {
    const t = setup();
    const { as, organizationId, estimateId } = await company(t);
    const docs = () => as.query(api.estimates.documents, { id: estimateId });

    let d = await docs();
    expect([d.agreement.source, d.agreement.origin, d.agreement.name]).toEqual(["tolliver", "tolliver", "Service Contract Agreement"]);
    expect(d.affidavit.name).toBe("Affidavit of Completion");
    expect(d.attachments).toEqual([]);

    // The company's agreement and a warranty sheet sent with every estimate.
    const agreement = await upload(t, as, { organizationId, kind: "agreement" });
    const warranty = await upload(t, as, { organizationId, kind: "attachment", fileName: "Warranty.pdf" });
    d = await docs();
    expect(d.agreement).toMatchObject({ source: "upload", origin: "company", name: "Basin Agreement", fileName: "Basin Agreement.pdf", url: expect.any(String) });
    expect(d.attachments.map((a) => a.name)).toEqual(["Warranty"]);
    expect(d.companyDefaults.agreement).toBe("Basin Agreement");

    // A newer company agreement replaces it as the default.
    const newer = await upload(t, as, { organizationId, kind: "agreement", fileName: "Agreement 2026.pdf" });
    expect((await docs()).agreement.name).toBe("Agreement 2026");
    const library = await as.query(api.contractDocs.list, { organizationId });
    expect(library.filter((x) => x.kind === "agreement").map((x) => [x.name, x.active])).toEqual([
      ["Agreement 2026", true],
      ["Basin Agreement", false],
    ]);
    await as.mutation(api.contractDocs.setActive, { id: agreement });
    expect((await docs()).agreement.name).toBe("Basin Agreement");

    // This job uses Webb Leads'; another goes back to the company's.
    await as.mutation(api.estimates.setContractDoc, { id: estimateId, kind: "agreement", choice: "tolliver" });
    expect((await docs()).agreement).toMatchObject({ source: "tolliver", origin: "job" });
    await as.mutation(api.estimates.setContractDoc, { id: estimateId, kind: "agreement", choice: null });
    expect((await docs()).agreement.origin).toBe("company");

    // A PDF uploaded for this job only becomes this job's agreement.
    await upload(t, as, { organizationId, kind: "agreement", estimateId, fileName: "Smith job.pdf" });
    expect((await docs()).agreement).toMatchObject({ origin: "job", name: "Smith job" });
    expect((await as.query(api.contractDocs.list, { organizationId })).map((x) => x.name)).not.toContain("Smith job");

    // The warranty is turned off for this job, and a job attachment added.
    await as.mutation(api.estimates.setAttachment, { id: estimateId, docId: warranty as Id<"contractDocs">, included: false });
    await upload(t, as, { organizationId, kind: "attachment", estimateId, fileName: "HOA form.pdf" });
    d = await docs();
    expect(d.attachments.map((a) => [a.name, a.origin])).toEqual([["HOA form", "job"]]);
    expect(d.companyAttachments).toEqual([{ docId: warranty, name: "Warranty", included: false }]);

    // The company goes back to Webb Leads' agreement: it has no default left.
    await as.mutation(api.contractDocs.useBuiltIn, { organizationId, kind: "agreement" });
    expect((await docs()).companyDefaults.agreement).toBeUndefined();
    expect(library.find((x) => x.id === newer)!.active).toBe(true);
  });

  test("signing keeps the exact files with their fingerprints; uploads need the client's tick", async () => {
    const t = setup();
    const { as, organizationId, estimateId, token } = await company(t);
    const agreementId = (await upload(t, as, { organizationId, kind: "agreement" })) as Id<"contractDocs">;
    const before = await t.query(api.publicEstimates.get, { token });
    expect(before!.documents).toEqual([
      { kind: "agreement", source: "upload", name: "Basin Agreement", fileName: "Basin Agreement.pdf", size: expect.any(Number), sha256: undefined, url: expect.any(String) },
    ]);

    await expect(t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,x" })).rejects.toThrow(
      /read the attached/,
    );
    // Nothing was signed by the refused try.
    expect((await t.run((ctx) => ctx.db.get(agreementId)))!.signedAt).toBeUndefined();
    await t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,x", agreedToDocuments: true });

    const signed = await t.run((ctx) => ctx.db.get(estimateId));
    const [doc] = signed!.contractSnapshot!.documents!;
    const stored = await t.run((ctx) => ctx.db.get(agreementId));
    expect(doc).toMatchObject({ kind: "agreement", source: "upload", docId: agreementId, sha256: stored!.sha256, size: stored!.size });
    expect(signed!.contractSnapshot!.acknowledgedAt).toEqual(expect.any(String));
    expect(stored!.signedAt).toEqual(expect.any(String));
    const after = await t.query(api.publicEstimates.get, { token });
    expect(after!.documents[0].sha256).toBe(stored!.sha256);
    expect(after!.acknowledgedAt).toEqual(expect.any(String));

    // Replacing the company's agreement doesn't change what this job signed.
    await upload(t, as, { organizationId, kind: "agreement", fileName: "New agreement.pdf" });
    expect((await as.query(api.estimates.documents, { id: estimateId })).agreement).toMatchObject({ origin: "signed", name: "Basin Agreement" });
    // The job's documents can't change once signed.
    await expect(as.mutation(api.estimates.setContractDoc, { id: estimateId, kind: "agreement", choice: "tolliver" })).rejects.toThrow(
      /accepted/,
    );

    // Removing the signed file archives it and keeps the file; an unsigned one is deleted.
    expect(await as.mutation(api.contractDocs.remove, { id: agreementId })).toEqual({ archived: true });
    expect(await exists(t, stored!.storageId)).toBe(true);
    const library = await as.query(api.contractDocs.list, { organizationId });
    const unsigned = library.find((x) => x.name === "New agreement")!;
    const unsignedFile = (await t.run((ctx) => ctx.db.get(unsigned.id)))!.storageId;
    expect(await as.mutation(api.contractDocs.remove, { id: unsigned.id })).toEqual({ archived: false });
    expect(await exists(t, unsignedFile)).toBe(false);
    expect((await as.query(api.contractDocs.list, { organizationId })).map((x) => [x.name, x.archived, x.signed])).toEqual([
      ["Basin Agreement", true, true],
    ]);
  });

  test("Webb Leads' own documents need no tick, and the owner signs on the device the same way", async () => {
    const t = setup();
    const { as, organizationId, estimateId, token } = await company(t);
    await t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,x" });
    const signed = await t.run((ctx) => ctx.db.get(estimateId));
    expect(signed!.contractSnapshot!.documents).toEqual([{ kind: "agreement", source: "tolliver", name: "Service Contract Agreement" }]);
    expect(signed!.contractSnapshot!.acknowledgedAt).toBeUndefined();

    const second = (await as.mutation(api.estimates.create, { organizationId, data: { title: "Gutters" } }))!;
    await upload(t, as, { organizationId, kind: "attachment", fileName: "Warranty.pdf" });
    await expect(as.mutation(api.estimates.sign, { id: second._id, signature: "x" })).rejects.toThrow(/read the attached/);
    const ok = await as.mutation(api.estimates.sign, { id: second._id, signature: "x", agreedToDocuments: true });
    expect(ok!.contractSnapshot!.documents!.map((d) => [d.kind, d.source])).toEqual([
      ["agreement", "tolliver"],
      ["attachment", "upload"],
    ]);
  });

  test("deleting an estimate deletes its own PDFs, not the company's", async () => {
    const t = setup();
    const { as, organizationId, estimateId } = await company(t);
    const company1 = (await upload(t, as, { organizationId, kind: "attachment" })) as Id<"contractDocs">;
    const job = (await upload(t, as, { organizationId, kind: "agreement", estimateId })) as Id<"contractDocs">;
    const jobFile = (await t.run((ctx) => ctx.db.get(job)))!.storageId;
    await as.mutation(api.estimates.remove, { id: estimateId });
    expect(await t.run((ctx) => ctx.db.get(job))).toBeNull();
    expect(await exists(t, jobFile)).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(company1))).not.toBeNull();
  });
});
