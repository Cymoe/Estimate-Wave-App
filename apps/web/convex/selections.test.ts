import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const SIG = "data:image/png;base64,AAAA";

/** A bathroom job: an estimate on a project with a tile allowance (300 sq ft at $4) and a faucet allowance ($350). */
async function bathroom(t: T, { redLine, sign = true }: { redLine?: number; sign?: boolean } = {}) {
  const owner = await signUp(t, "owner@peak.example");
  const projectId = (await owner.as.mutation(api.projects.create, {
    organizationId: owner.organizationId,
    data: { name: "Bathroom" },
  }))!._id as Id<"projects">;
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: {
      title: "Bathroom",
      projectId,
      items: [
        { _id: "labor", description: "Tile install", quantity: 1, unitPrice: 2000 },
        { _id: "tile", description: "Tile allowance", quantity: 300, unitPrice: 4, redLinePrice: redLine, allowance: true },
        { _id: "faucet", description: "Faucet allowance", quantity: 1, unitPrice: 350, allowance: true },
      ],
    },
  }))!;
  const token = await owner.as.mutation(api.estimates.shareLink, { id: estimate._id });
  if (sign) await t.mutation(api.publicEstimates.accept, { token, signature: SIG });
  return { ...owner, projectId, estimateId: estimate._id as Id<"estimates">, token };
}

/** The client's pick for a line, as the portal saves it. */
async function clientPicks(t: T, estimateId: Id<"estimates">, organizationId: Id<"organizations">, itemId: string, unitPrice: number) {
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

const line = async (t: T, estimateId: Id<"estimates">, itemId: string) =>
  (await t.run((ctx) => ctx.db.get(estimateId)))!.items.find((i) => i._id === itemId)!;

describe("selections on the project", () => {
  test("the estimate link is just the number: an allowance is a line like any other", async () => {
    const t = setup();
    const { token } = await bathroom(t, { sign: false });
    const page = (await t.query(api.publicEstimates.get, { token }))!;
    expect(page).not.toHaveProperty("allowances");
    expect(page.items.map((i) => i.description)).toEqual(["Tile install", "Tile allowance", "Faucet allowance"]);
  });

  test("they start once the estimate is signed, listed per estimate", async () => {
    const t = setup();
    const unsigned = await bathroom(t, { sign: false });
    expect(await unsigned.as.query(api.selections.forProject, { projectId: unsigned.projectId })).toEqual([]);
    await expect(unsigned.as.mutation(api.selections.ask, { estimateId: unsigned.estimateId, itemId: "tile" })).rejects.toThrow(
      /once the estimate is signed/,
    );

    await t.mutation(api.publicEstimates.accept, { token: unsigned.token, signature: SIG });
    const [job] = await unsigned.as.query(api.selections.forProject, { projectId: unsigned.projectId });
    expect(job).toMatchObject({ estimateId: unsigned.estimateId, title: "Bathroom" });
    expect(job.allowances.map((a) => [a.itemId, a.allowanceTotal, a.pick])).toEqual([
      ["tile", 1200, undefined],
      ["faucet", 350, undefined],
    ]);
  });

  test("a pick-by date, asking the client, and only allowance lines", async () => {
    const t = setup();
    const { as, projectId, estimateId } = await bathroom(t);
    await as.mutation(api.selections.setPickBy, { estimateId, itemId: "tile", pickBy: "2026-12-01" });
    expect((await line(t, estimateId, "tile")).allowance).toEqual({ pickBy: "2026-12-01" });
    await as.mutation(api.selections.ask, { estimateId, itemId: "tile" });
    const [job] = await as.query(api.selections.forProject, { projectId });
    expect(job.allowances[0]).toMatchObject({ pickBy: "2026-12-01", pick: { status: "asked", askedAt: expect.any(String) } });
    expect(job.allowances[0].pick!.difference).toBeUndefined();
    await as.mutation(api.selections.setPickBy, { estimateId, itemId: "tile", pickBy: null });
    expect((await line(t, estimateId, "tile")).allowance).toEqual({});
    await expect(as.mutation(api.selections.ask, { estimateId, itemId: "labor" })).rejects.toThrow(/isn't on the estimate/);
    await expect(as.mutation(api.selections.setPickBy, { estimateId, itemId: "tile", pickBy: "soon" })).rejects.toThrow(/Pick a date/);
    // Nothing to approve until the client picks.
    await expect(as.mutation(api.selections.approve, { id: job.allowances[0].pick!.id, unitPrice: 5 })).rejects.toThrow(/hasn't picked/);
  });

  test("the company enters the pick itself: approved at once, and the difference goes on the change order", async () => {
    const t = setup();
    const { as, projectId, estimateId } = await bathroom(t);
    await expect(as.mutation(api.selections.record, { estimateId, itemId: "faucet", unitPrice: 420 })).rejects.toThrow(/link or say what it is/);
    await expect(as.mutation(api.selections.record, { estimateId, itemId: "faucet", url: "javascript:x", unitPrice: 420 })).rejects.toThrow(
      /doesn't look right/,
    );
    await as.mutation(api.selections.record, { estimateId, itemId: "faucet", name: " Delta Trinsic ", unitPrice: 420, note: "Matte black" });
    expect(await line(t, estimateId, "faucet")).toMatchObject({ unitPrice: 420, totalPrice: 420, allowance: { amount: 350 } });
    const [job] = await as.query(api.selections.forProject, { projectId });
    expect(job.allowances[1].pick).toMatchObject({
      name: "Delta Trinsic",
      note: "Matte black",
      status: "approved",
      entered: true,
      approvedUnitPrice: 420,
      difference: 70,
    });
    // Entered again (they changed their mind), it's still measured against the allowance.
    await as.mutation(api.selections.record, { estimateId, itemId: "faucet", url: "lowes.com/pd/faucet", unitPrice: 300 });
    expect(await line(t, estimateId, "faucet")).toMatchObject({ unitPrice: 300, allowance: { amount: 350 } });
    const order = await as.mutation(api.signoffs.request, { estimateId, kind: "change_order" });
    expect(order.changes).toEqual([{ description: "Faucet allowance", before: 350, after: 300 }]);
  });

  test("approving the client's pick prices the line, red line or not; reopening undoes it", async () => {
    const t = setup();
    const { as, estimateId, organizationId } = await bathroom(t, { redLine: 3.5 });
    const id = await clientPicks(t, estimateId, organizationId, "tile", 5.4);
    await as.mutation(api.selections.approve, { id, unitPrice: 3 });
    const tile = await line(t, estimateId, "tile");
    expect(tile).toMatchObject({ unitPrice: 3, totalPrice: 900, allowance: { amount: 4 } });
    expect(tile.redLinePrice).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(estimateId)))!.totalAmount).toBe(3250);

    await as.mutation(api.selections.reopen, { id });
    expect(await line(t, estimateId, "tile")).toMatchObject({ unitPrice: 4, totalPrice: 1200, allowance: {} });
    expect((await t.run((ctx) => ctx.db.get(id)))!).toMatchObject({ status: "picked" });
  });

  test("another company can't see or touch them", async () => {
    const t = setup();
    const { projectId, estimateId, organizationId } = await bathroom(t);
    const id = await clientPicks(t, estimateId, organizationId, "faucet", 420);
    const rival = await signUp(t, "rival@example.com");
    await expect(rival.as.query(api.selections.forProject, { projectId })).rejects.toThrow();
    await expect(rival.as.mutation(api.selections.approve, { id, unitPrice: 1 })).rejects.toThrow();
    await expect(rival.as.mutation(api.selections.record, { estimateId, itemId: "faucet", name: "x", unitPrice: 1 })).rejects.toThrow();
    await expect(rival.as.mutation(api.selections.ask, { estimateId, itemId: "faucet" })).rejects.toThrow();
  });
});
