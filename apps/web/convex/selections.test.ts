import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const SIG = "data:image/png;base64,AAAA";

/** A bathroom with a tile allowance (300 sq ft at $4) and a faucet allowance ($350), shared with the client. */
async function bathroom(t: T, { redLine }: { redLine?: number } = {}) {
  const owner = await signUp(t, "owner@peak.example");
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: {
      title: "Bathroom",
      items: [
        { _id: "labor", description: "Tile install", quantity: 1, unitPrice: 2000 },
        { _id: "tile", description: "Tile allowance", quantity: 300, unitPrice: 4, redLinePrice: redLine, allowance: { pickBy: "2026-12-01" } },
        { _id: "faucet", description: "Faucet allowance", quantity: 1, unitPrice: 350, allowance: true },
      ],
    },
  }))!;
  const token = await owner.as.mutation(api.estimates.shareLink, { id: estimate._id });
  return { ...owner, estimateId: estimate._id as Id<"estimates">, token };
}

describe("allowances the client picks for", () => {
  test("the client sees each allowance, even with prices hidden, and sends a link to what they chose", async () => {
    const t = setup();
    const { as, estimateId, token } = await bathroom(t);
    await as.mutation(api.estimates.setClientDetail, { id: estimateId, detail: "categories" });
    const page = (await t.query(api.publicEstimates.get, { token }))!;
    expect(page.allowances).toEqual([
      expect.objectContaining({
        itemId: "tile",
        description: "Tile allowance",
        quantity: 300,
        allowanceUnitPrice: 4,
        allowanceTotal: 1200,
        pickBy: "2026-12-01",
      }),
      expect.objectContaining({ itemId: "faucet", allowanceTotal: 350 }),
    ]);

    expect(page.allowances[1].pick).toBeUndefined();
    expect(page.items).toHaveLength(2); // categories only, yet the allowances are all there

    await t.mutation(api.publicEstimates.pick, {
      token,
      itemId: "tile",
      url: "homedepot.com/p/Daltile-Marble-12-in/123",
      name: "  Daltile Marble 12 in. ",
      unitPrice: 5.4,
      note: "The gray one",
    });
    const after = (await t.query(api.publicEstimates.get, { token }))!;
    expect(after.allowances[0].pick).toEqual({
      url: "https://homedepot.com/p/Daltile-Marble-12-in/123",
      name: "Daltile Marble 12 in.",
      unitPrice: 5.4,
      note: "The gray one",
      status: "picked",
      approvedUnitPrice: undefined,
      difference: 420,
    });
    // Picking again changes it; the price isn't touched until it's approved.
    await t.mutation(api.publicEstimates.pick, { token, itemId: "tile", url: "https://www.lowes.com/pd/tile/456" });
    const rows = await as.query(api.selections.forEstimate, { estimateId });
    expect(rows[0].pick).toMatchObject({ url: "https://www.lowes.com/pd/tile/456", status: "picked" });
    expect(rows[0].pick!.unitPrice).toBeUndefined();
    expect(rows[0].pick!.difference).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(estimateId)))!.totalAmount).toBe(3550);
  });

  test("links are checked, and only allowance lines can be picked", async () => {
    const t = setup();
    const { token } = await bathroom(t);
    await expect(t.mutation(api.publicEstimates.pick, { token, itemId: "tile", url: "javascript:alert(1)" })).rejects.toThrow(/Paste the link/);
    await expect(t.mutation(api.publicEstimates.pick, { token, itemId: "tile", url: " " })).rejects.toThrow(/Paste the link/);
    await expect(t.mutation(api.publicEstimates.pick, { token, itemId: "labor", url: "https://example.com" })).rejects.toThrow(
      /isn't on the estimate/,
    );
    await expect(t.mutation(api.publicEstimates.pick, { token, itemId: "tile", url: "https://example.com", unitPrice: -1 })).rejects.toThrow(
      /\$0 or more/,
    );
    await expect(t.mutation(api.publicEstimates.pick, { token: "nope", itemId: "tile", url: "https://example.com" })).rejects.toThrow(/isn't valid/);
  });

  test("approving a pick prices the line, red line or not; after signing it goes on the next change order; reopening undoes it", async () => {
    const t = setup();
    const { as, estimateId, token } = await bathroom(t, { redLine: 3.5 });
    await t.mutation(api.publicEstimates.accept, { token, signature: SIG });
    await t.mutation(api.publicEstimates.pick, { token, itemId: "tile", url: "https://homedepot.com/p/1", name: "Marble", unitPrice: 5.4 });
    const [tile] = await as.query(api.selections.forEstimate, { estimateId });

    // The company approves at a cheaper price than the client typed (say they found it on sale): under red line is fine.
    await as.mutation(api.selections.approve, { id: tile.pick!.id, unitPrice: 3 });
    let estimate = (await t.run((ctx) => ctx.db.get(estimateId)))!;
    const line = estimate.items.find((i) => i._id === "tile")!;
    expect(line).toMatchObject({ unitPrice: 3, totalPrice: 900, allowance: { pickBy: "2026-12-01", amount: 4 } });
    expect(line.redLinePrice).toBeUndefined();
    expect(estimate.totalAmount).toBe(3250);
    expect((await as.query(api.selections.forEstimate, { estimateId }))[0]).toMatchObject({
      allowanceUnitPrice: 4,
      allowanceTotal: 1200,
      pick: { status: "approved", approvedUnitPrice: 3, difference: -300 },
    });
    await expect(t.mutation(api.publicEstimates.pick, { token, itemId: "tile", url: "https://homedepot.com/p/2" })).rejects.toThrow(
      /already approved/,
    );

    const order = await as.mutation(api.signoffs.request, { estimateId, kind: "change_order" });
    expect(order.changes).toEqual([{ description: "Tile allowance", before: 1200, after: 900 }]);

    await as.mutation(api.selections.reopen, { id: tile.pick!.id });
    estimate = (await t.run((ctx) => ctx.db.get(estimateId)))!;
    expect(estimate.items.find((i) => i._id === "tile")).toMatchObject({ unitPrice: 4, totalPrice: 1200, allowance: { pickBy: "2026-12-01" } });
    expect(estimate.totalAmount).toBe(3550);
    expect((await as.query(api.selections.forEstimate, { estimateId }))[0].pick).toMatchObject({ status: "picked", difference: 420 });
  });

  test("a company's own edits keep the allowance; another company can't approve", async () => {
    const t = setup();
    const { as, estimateId, token } = await bathroom(t);
    await t.mutation(api.publicEstimates.pick, { token, itemId: "faucet", url: "https://lowes.com/pd/faucet", unitPrice: 420 });
    const doc = (await t.run((ctx) => ctx.db.get(estimateId)))!;
    await as.mutation(api.estimates.update, {
      id: estimateId,
      data: { items: doc.items.map((i) => (i._id === "faucet" ? { ...i, quantity: 2 } : i)) },
    });
    const [, faucet] = await as.query(api.selections.forEstimate, { estimateId });
    expect(faucet).toMatchObject({ quantity: 2, allowanceTotal: 700, pick: { difference: 140 } });

    const rival = await signUp(t, "rival@example.com");
    await expect(rival.as.mutation(api.selections.approve, { id: faucet.pick!.id, unitPrice: 1 })).rejects.toThrow();
    await expect(rival.as.query(api.selections.forEstimate, { estimateId })).rejects.toThrow();
  });
});
