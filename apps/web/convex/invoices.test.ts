import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;

/** A company with a $10,000 estimate and its client link. */
async function company(t: T, depositPercent?: number) {
  const owner = await signUp(t, "owner@roof.example");
  if (depositPercent !== undefined)
    await owner.as.mutation(api.organizations.setPayments, {
      id: owner.organizationId,
      depositPercent,
      payLink: "https://pay.example/peak",
      instructions: "Checks to Peak Roofing LLC",
    });
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: { title: "Roof", items: [{ description: "Shingles", quantity: 1, unitPrice: 10000, totalPrice: 10000 }] },
  }))!;
  const token = await owner.as.mutation(api.estimates.shareLink, { id: estimate._id });
  return { ...owner, estimateId: estimate._id as Id<"estimates">, token };
}

const accept = (t: T, token: string) => t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,AAAA" });

describe("getting paid", () => {
  test("the company's deposit is asked for when the client signs, and shown on their link", async () => {
    const t = setup();
    const { as, estimateId, token } = await company(t, 30);
    expect((await t.query(api.publicEstimates.get, { token }))!.payments).toBeUndefined();
    await accept(t, token);

    const money = await as.query(api.invoices.forEstimate, { estimateId });
    expect(money.invoices).toHaveLength(1);
    expect(money.invoices[0]).toMatchObject({ kind: "deposit", label: "Deposit", description: expect.stringMatching(/^Deposit \(30%\) for EST-/), total: 3000, paid: 0, due: 3000, status: "sent" });
    expect(money.summary).toEqual({ contract: 10000, invoiced: 3000, paid: 0, due: 3000, toInvoice: 7000 });

    const shown = (await t.query(api.publicEstimates.get, { token }))!.payments!;
    expect(shown).toMatchObject({ due: 3000, payLink: "https://pay.example/peak", instructions: "Checks to Peak Roofing LLC" });
    expect(shown.invoices).toEqual([expect.objectContaining({ kind: "deposit", total: 3000, due: 3000 })]);
  });

  test("no deposit set, nothing asked at signing; one can be asked for after, then the balance", async () => {
    const t = setup();
    const { as, estimateId, token } = await company(t);
    await expect(as.mutation(api.invoices.requestDeposit, { estimateId, percent: 25 })).rejects.toThrow(/once the client signs/);
    await accept(t, token);
    expect((await as.query(api.invoices.forEstimate, { estimateId })).invoices).toHaveLength(0);

    await as.mutation(api.invoices.requestDeposit, { estimateId, percent: 25 });
    await expect(as.mutation(api.invoices.requestDeposit, { estimateId, amount: 8000 })).rejects.toThrow(/more than the 7500.00 left/);
    await as.mutation(api.invoices.invoiceBalance, { estimateId });
    await expect(as.mutation(api.invoices.invoiceBalance, { estimateId })).rejects.toThrow(/has been invoiced/);
    const money = await as.query(api.invoices.forEstimate, { estimateId });
    expect(money.invoices.map((i: { kind: string; total: number }) => [i.kind, i.total])).toEqual([
      ["deposit", 2500],
      ["balance", 7500],
    ]);
    expect(money.summary.toInvoice).toBe(0);
  });

  test("payments are recorded by hand; an invoice is paid once it's all in, and mistakes come off", async () => {
    const t = setup();
    const { as, estimateId, token } = await company(t, 30);
    await accept(t, token);
    const [deposit] = (await as.query(api.invoices.forEstimate, { estimateId })).invoices;

    await expect(as.mutation(api.invoices.recordPayment, { id: deposit.id, amount: 3500, method: "Check" })).rejects.toThrow(/Only \$3000.00 is due/);
    await expect(as.mutation(api.invoices.recordPayment, { id: deposit.id, amount: 100, method: "Bitcoin" })).rejects.toThrow(/How it was paid/);
    const part = await as.mutation(api.invoices.recordPayment, { id: deposit.id, amount: 1000, method: "Zelle", paidAt: "2026-10-20" });
    expect(part).toMatchObject({ paid: 1000, due: 2000, status: "sent" });
    const full = await as.mutation(api.invoices.recordPayment, { id: deposit.id, amount: 2000, method: "Check", note: "Check #1043" });
    expect(full).toMatchObject({ paid: 3000, due: 0, status: "paid" });
    await expect(as.mutation(api.invoices.cancel, { id: deposit.id })).rejects.toThrow(/take them off first/);

    const back = await as.mutation(api.invoices.removePayment, { id: deposit.id, paymentId: full.payments[1]._id });
    expect(back).toMatchObject({ paid: 1000, status: "sent" });
    expect(back.paidDate).toBeUndefined();
    expect((await t.query(api.publicEstimates.get, { token }))!.payments).toMatchObject({ paid: 1000, due: 2000 });
  });

  test("a cancelled invoice drops out, and the deposit isn't asked twice", async () => {
    const t = setup();
    const { as, estimateId, token } = await company(t, 50);
    await accept(t, token);
    const [deposit] = (await as.query(api.invoices.forEstimate, { estimateId })).invoices;
    await as.mutation(api.invoices.cancel, { id: deposit.id });
    const money = await as.query(api.invoices.forEstimate, { estimateId });
    expect(money.summary).toMatchObject({ invoiced: 0, toInvoice: 10000 });
    expect(money.invoices[0].status).toBe("cancelled");
    expect((await t.query(api.publicEstimates.get, { token }))!.payments).toBeUndefined();
  });

  test("payment settings are checked and only owners and admins change them; others can't touch the invoices", async () => {
    const t = setup();
    const { as, organizationId, estimateId, token } = await company(t, 30);
    await expect(as.mutation(api.organizations.setPayments, { id: organizationId, depositPercent: 120 })).rejects.toThrow(/0 to 100/);
    await expect(as.mutation(api.organizations.setPayments, { id: organizationId, depositPercent: 10, payLink: "http://pay.example" })).rejects.toThrow(/https:\/\//);
    expect(await as.mutation(api.organizations.setPayments, { id: organizationId, depositPercent: 10 })).toEqual({ depositPercent: 10 });

    await accept(t, token);
    const other = await signUp(t, "rival@example.com");
    await expect(other.as.query(api.invoices.forEstimate, { estimateId })).rejects.toThrow(/Not found/);
    const [deposit] = (await as.query(api.invoices.forEstimate, { estimateId })).invoices;
    await expect(other.as.mutation(api.invoices.recordPayment, { id: deposit.id, amount: 1, method: "Cash" })).rejects.toThrow();
    await expect(other.as.mutation(api.organizations.setPayments, { id: organizationId, depositPercent: 0 })).rejects.toThrow();
  });

  test("a project adds up what its signed estimates have been invoiced and paid; deleting an estimate takes its invoices", async () => {
    const t = setup();
    const { as, organizationId, estimateId, token } = await company(t, 40);
    const project = (await as.mutation(api.projects.create, { organizationId, data: { name: "Miller roof" } }))!;
    await as.mutation(api.estimates.update, { id: estimateId, data: { projectId: project._id } });
    await accept(t, token);
    const [deposit] = (await as.query(api.invoices.forEstimate, { estimateId })).invoices;
    await as.mutation(api.invoices.recordPayment, { id: deposit.id, amount: 4000, method: "Card" });
    expect(await as.query(api.invoices.forProject, { projectId: project._id })).toEqual({ invoiced: 4000, paid: 4000, due: 0 });

    await as.mutation(api.estimates.remove, { id: estimateId });
    expect(await t.run((ctx) => ctx.db.query("invoices").collect())).toHaveLength(0);
  });
});
