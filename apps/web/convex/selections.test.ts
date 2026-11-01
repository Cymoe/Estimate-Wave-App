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

/** The client's pick for a line, as it's saved. */
async function picked(t: T, estimateId: Id<"estimates">, organizationId: Id<"organizations">, itemId: string, unitPrice: number) {
  const now = new Date().toISOString();
  return await t.run((ctx) =>
    ctx.db.insert("selections", {
      organizationId,
      estimateId,
      itemId,
      url: "https://homedepot.com/p/1",
      name: "Marble",
      unitPrice,
      status: "picked",
      pickedAt: now,
      updatedAt: now,
    }),
  );
}

describe("allowances", () => {
  test("the estimate link is just the number: an allowance is a line like any other", async () => {
    const t = setup();
    const { token } = await bathroom(t);
    const page = (await t.query(api.publicEstimates.get, { token }))!;
    expect(page).not.toHaveProperty("allowances");
    expect(page.items.map((i) => i.description)).toEqual(["Tile install", "Tile allowance", "Faucet allowance"]);
    expect(page.totalAmount).toBe(3550);
  });

  test("approving a pick prices the line, red line or not; after signing it goes on the next change order; reopening undoes it", async () => {
    const t = setup();
    const { as, estimateId, token, organizationId } = await bathroom(t, { redLine: 3.5 });
    await t.mutation(api.publicEstimates.accept, { token, signature: SIG });
    const id = await picked(t, estimateId, organizationId, "tile", 5.4);

    await as.mutation(api.selections.approve, { id, unitPrice: 3 });
    let estimate = (await t.run((ctx) => ctx.db.get(estimateId)))!;
    const line = estimate.items.find((i) => i._id === "tile")!;
    expect(line).toMatchObject({ unitPrice: 3, totalPrice: 900, allowance: { pickBy: "2026-12-01", amount: 4 } });
    expect(line.redLinePrice).toBeUndefined();
    expect(estimate.totalAmount).toBe(3250);

    const order = await as.mutation(api.signoffs.request, { estimateId, kind: "change_order" });
    expect(order.changes).toEqual([{ description: "Tile allowance", before: 1200, after: 900 }]);

    await as.mutation(api.selections.reopen, { id });
    estimate = (await t.run((ctx) => ctx.db.get(estimateId)))!;
    expect(estimate.items.find((i) => i._id === "tile")).toMatchObject({ unitPrice: 4, totalPrice: 1200, allowance: { pickBy: "2026-12-01" } });
    expect(estimate.totalAmount).toBe(3550);
    expect((await t.run((ctx) => ctx.db.get(id)))!).toMatchObject({ status: "picked" });
  });

  test("a company's own edits keep the allowance; another company can't approve", async () => {
    const t = setup();
    const { as, estimateId, organizationId } = await bathroom(t);
    const doc = (await t.run((ctx) => ctx.db.get(estimateId)))!;
    await as.mutation(api.estimates.update, {
      id: estimateId,
      data: { items: doc.items.map((i) => (i._id === "faucet" ? { ...i, quantity: 2 } : i)) },
    });
    expect((await t.run((ctx) => ctx.db.get(estimateId)))!.items.find((i) => i._id === "faucet")!.allowance).toEqual({});

    const id = await picked(t, estimateId, organizationId, "faucet", 420);
    const rival = await signUp(t, "rival@example.com");
    await expect(rival.as.mutation(api.selections.approve, { id, unitPrice: 1 })).rejects.toThrow();
  });
});
