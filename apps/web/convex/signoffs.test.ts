import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const SIG = "data:image/png;base64,AAAA";

/** A $10,000 estimate the client signed. */
async function signedJob(t: T) {
  const owner = await signUp(t, "owner@peak.example");
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: {
      title: "Roof",
      items: [
        { _id: "a", description: "Shingles", quantity: 1, unitPrice: 8000, totalPrice: 8000 },
        { _id: "b", description: "Gutters", quantity: 1, unitPrice: 2000, totalPrice: 2000 },
      ],
    },
  }))!;
  const token = await owner.as.mutation(api.estimates.shareLink, { id: estimate._id });
  await t.mutation(api.publicEstimates.accept, { token, signature: SIG });
  return { ...owner, estimateId: estimate._id as Id<"estimates"> };
}

describe("change orders and the affidavit, signed later", () => {
  test("a change order lists what changed; once signed, it's the agreed scope and what's left to invoice", async () => {
    const t = setup();
    const { as, estimateId } = await signedJob(t);
    await expect(as.mutation(api.signoffs.request, { estimateId, kind: "change_order" })).rejects.toThrow(/Nothing has changed/);

    await as.mutation(api.estimates.update, {
      id: estimateId,
      data: {
        items: [
          { _id: "a", description: "Shingles", quantity: 1, unitPrice: 8500, totalPrice: 8500 },
          { _id: "c", description: "Skylight", quantity: 1, unitPrice: 1200, totalPrice: 1200 },
        ],
      },
    });
    const sent = await as.mutation(api.signoffs.request, { estimateId, kind: "change_order" });
    expect(sent).toMatchObject({
      name: "Changes to the work",
      status: "sent",
      previousTotal: 10000,
      newTotal: 9700,
      number: expect.stringMatching(/^CO-/),
    });
    expect(sent.changes).toEqual([
      { description: "Shingles", before: 8000, after: 8500 },
      { description: "Skylight", after: 1200 },
      { description: "Gutters", before: 2000 },
    ]);

    const page = (await t.query(api.signoffs.get, { token: sent.token }))!;
    expect(page).toMatchObject({
      kind: "change_order",
      name: "Changes to the work",
      difference: -300,
      newTotal: 9700,
      document: { source: "tolliver", name: "Changes to the work" },
    });
    await expect(t.mutation(api.signoffs.sign, { token: sent.token, signerName: " ", signature: SIG })).rejects.toThrow(/type your name/);
    await t.mutation(api.signoffs.sign, { token: sent.token, signerName: "Ann Miller", signature: SIG });
    await expect(t.mutation(api.signoffs.sign, { token: sent.token, signerName: "Ann Miller", signature: SIG })).rejects.toThrow(
      /already been signed/,
    );

    const estimate = (await t.run((ctx) => ctx.db.get(estimateId)))!;
    expect(estimate.contractSnapshot!.totalAmount).toBe(9700);
    expect(estimate.contractSnapshot!.items.map((i) => i.description)).toEqual(["Shingles", "Skylight"]);
    expect((await as.query(api.invoices.forEstimate, { estimateId })).summary.contract).toBe(9700);
    expect((await as.query(api.signoffs.forEstimate, { estimateId }))[0]).toMatchObject({ status: "signed", signerName: "Ann Miller" });
  });

  test("the affidavit shows what's been paid; sending again replaces the unsigned one; it waits for the estimate's signature", async () => {
    const t = setup();
    const owner = await signUp(t, "solo@example.com");
    const draft = (await owner.as.mutation(api.estimates.create, { organizationId: owner.organizationId, data: { title: "Paint", items: [] } }))!;
    await expect(owner.as.mutation(api.signoffs.request, { estimateId: draft._id, kind: "affidavit" })).rejects.toThrow(/once the client has signed/);

    const { as, estimateId } = await signedJob(t);
    const first = await as.mutation(api.signoffs.request, { estimateId, kind: "affidavit", completionDate: "2026-11-20" });
    const second = await as.mutation(api.signoffs.request, { estimateId, kind: "affidavit", completionDate: "2026-11-21" });
    expect((await t.query(api.signoffs.get, { token: first.token }))!.status).toBe("cancelled");
    await expect(t.mutation(api.signoffs.sign, { token: first.token, signerName: "Ann", signature: SIG })).rejects.toThrow(/withdrawn/);
    const page = (await t.query(api.signoffs.get, { token: second.token }))!;
    expect(page).toMatchObject({ name: "Job complete sign-off", completionDate: "2026-11-21", contractTotal: 10000, paid: 0 });
    await t.mutation(api.signoffs.sign, { token: second.token, signerName: "Ann Miller", signature: SIG });
    expect((await t.query(api.signoffs.get, { token: second.token }))!).toMatchObject({ status: "signed", signerName: "Ann Miller", signature: SIG });
    expect(await t.query(api.signoffs.get, { token: "nope" })).toBeNull();
  });

  test("the company's own PDF must be confirmed read, and its file is kept once signed", async () => {
    const t = setup();
    const { as, organizationId, estimateId } = await signedJob(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.4 x"], { type: "application/pdf" })));
    await as.mutation(api.contractDocs.add, { organizationId, kind: "affidavit", storageId, fileName: "Peak Lien Release.pdf" });
    const sent = await as.mutation(api.signoffs.request, { estimateId, kind: "affidavit" });
    expect((await t.query(api.signoffs.get, { token: sent.token }))!.document).toMatchObject({
      source: "upload",
      name: "Peak Lien Release",
      url: expect.any(String),
    });
    await expect(t.mutation(api.signoffs.sign, { token: sent.token, signerName: "Ann", signature: SIG })).rejects.toThrow(/confirm you've read/);
    await t.mutation(api.signoffs.sign, { token: sent.token, signerName: "Ann", signature: SIG, agreedToDocument: true });
    const doc = await t.run((ctx) => ctx.db.query("contractDocs").first());
    expect(doc!.signedAt).toEqual(expect.any(String));
    const other = await signUp(t, "rival@example.com");
    await expect(other.as.query(api.signoffs.forEstimate, { estimateId })).rejects.toThrow(/Not found/);
  });
});
