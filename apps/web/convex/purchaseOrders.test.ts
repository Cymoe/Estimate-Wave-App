import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;

/** Peak starts a kitchen for Ann from the built-in package. */
async function kitchen(t: T) {
  const owner = await signUp(t, "owner@peak.example");
  const { organizationId, as } = owner;
  const clientId = (await as.mutation(api.clients.create, {
    organizationId,
    data: {
      name: "Ann Miller",
      address: "12 Oak St",
      city: "Midland",
      state: "TX",
      zip: "79701",
    },
  }))!._id as Id<"clients">;
  const started = await as.mutation(api.projectTemplates.startPackage, {
    organizationId,
    packageId: "general-construction/remodel/kitchen-remodel",
    data: { name: "Miller kitchen", clientId, startDate: "2026-12-01" },
  });
  return {
    ...owner,
    clientId,
    projectId: started.project._id as Id<"projects">,
    estimateId: started.estimateId as Id<"estimates">,
  };
}

describe("purchase orders", () => {
  test("a project from a package comes with its POs: drafts, numbered, delivered to the client's address", async () => {
    const t = setup();
    const { as, projectId } = await kitchen(t);
    const { orders, committed, received } = await as.query(
      api.purchaseOrders.forProject,
      { projectId },
    );
    expect(orders.map((o) => o.title)).toContain("Cabinet supplier");
    expect(orders.map((o) => o.title)).toContain("Electrician");
    expect(orders.every((o) => o.status === "draft")).toBe(true);
    expect(new Set(orders.map((o) => o.number)).size).toBe(orders.length);
    expect(orders[0]).toMatchObject({
      number: expect.stringMatching(/^PO-\d{4}-\d{6}-1$/),
      deliverTo: "12 Oak St, Midland, TX 79701",
      neededBy: "2026-12-01",
    });
    const cabinets = orders.find((o) => o.title === "Cabinet supplier")!;
    expect(cabinets.lines).toEqual([
      expect.objectContaining({
        description: "Semi-custom cabinets",
        quantity: 22,
        unit: "lf",
        unitCost: 173.25,
        kind: "material",
      }),
    ]);
    expect(cabinets.total).toBe(3811.5);
    expect(committed).toBe(0);
    expect(received).toBe(0);
  });

  test("edit, send to the vendor (their page never shows the client's prices), receive into expenses, reopen", async () => {
    const t = setup();
    const { as, projectId, organizationId } = await kitchen(t);
    let po = (
      await as.query(api.purchaseOrders.forProject, { projectId })
    ).orders.find((o) => o.title === "Cabinet supplier")!;
    await as.mutation(api.purchaseOrders.update, {
      id: po.id,
      vendor: { name: "Midland Cabinet Co", phone: "432-555-0111" },
      lines: [{ ...po.lines[0], unitCost: 160 }],
      notes: "Call before delivery",
    });
    // Not sent yet: no page for it.
    const token = await as.mutation(api.purchaseOrders.markOrdered, {
      id: po.id,
    });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    let list = await as.query(api.purchaseOrders.forProject, { projectId });
    po = list.orders.find((o) => o.id === po.id)!;
    expect(po).toMatchObject({
      status: "ordered",
      total: 3520,
      vendor: { name: "Midland Cabinet Co", phone: "432-555-0111" },
    });
    expect(list.committed).toBe(3520);

    const page = (await t.query(api.purchaseOrders.get, { token }))!;
    expect(page).toMatchObject({
      number: po.number,
      title: "Cabinet supplier",
      job: "Miller kitchen",
      notes: "Call before delivery",
      total: 3520,
    });
    expect(page.lines).toEqual([
      {
        description: "Semi-custom cabinets",
        quantity: 22,
        unit: "lf",
        unitCost: 160,
      },
    ]);
    expect(JSON.stringify(page)).not.toContain("385"); // the client's price per foot
    expect(
      await t.query(api.purchaseOrders.get, { token: "0".repeat(32) }),
    ).toBeNull();

    await as.mutation(api.purchaseOrders.markReceived, {
      id: po.id,
      amount: 3550.25,
    });
    list = await as.query(api.purchaseOrders.forProject, { projectId });
    expect(list.committed).toBe(0);
    expect(list.received).toBe(3550.25);
    const [expense] = await as.query(api.expenses.list, {
      organizationId,
      projectId,
    });
    expect(expense).toMatchObject({
      amount: 3550.25,
      category: "Materials",
      vendor: "Midland Cabinet Co",
      description: `${po.number} · Cabinet supplier`,
    });

    // Reopened, the untouched expense goes away and it's Ordered again.
    await as.mutation(api.purchaseOrders.reopen, { id: po.id });
    expect(
      await as.query(api.expenses.list, { organizationId, projectId }),
    ).toEqual([]);
    expect(
      (
        await as.query(api.purchaseOrders.forProject, { projectId })
      ).orders.find((o) => o.id === po.id)!.status,
    ).toBe("ordered");
  });

  test("an all-labor PO received is a Subcontractor cost; a cancelled PO's link stops working; drafts can be deleted", async () => {
    const t = setup();
    const { as, projectId, organizationId } = await kitchen(t);
    const { orders } = await as.query(api.purchaseOrders.forProject, {
      projectId,
    });
    const sub = orders.find((o) => o.title === "Cabinet installer")!;
    await as.mutation(api.purchaseOrders.markReceived, {
      id: sub.id,
      amount: 1200,
    });
    expect(
      (await as.query(api.expenses.list, { organizationId, projectId }))[0],
    ).toMatchObject({ category: "Subcontractor", vendor: "Cabinet installer" });

    const tile = orders.find((o) => o.title === "Tile supplier")!;
    const token = await as.mutation(api.purchaseOrders.markOrdered, {
      id: tile.id,
    });
    await expect(
      as.mutation(api.purchaseOrders.remove, { id: tile.id }),
    ).rejects.toThrow(/Cancel the PO/);
    await as.mutation(api.purchaseOrders.cancel, { id: tile.id });
    expect(await t.query(api.purchaseOrders.get, { token })).toBeNull();
    await as.mutation(api.purchaseOrders.remove, { id: tile.id });

    const blank = await as.mutation(api.purchaseOrders.create, {
      projectId,
      title: "Appliance store",
    });
    await expect(
      as.mutation(api.purchaseOrders.markOrdered, { id: blank }),
    ).rejects.toThrow(/Add what you're ordering/);
    const after = await as.query(api.purchaseOrders.forProject, { projectId });
    expect(after.orders.map((o) => o.title)).not.toContain("Tile supplier");
    expect(after.orders.at(-1)).toMatchObject({
      title: "Appliance store",
      lines: [],
      status: "draft",
    });
  });

  test("a project without a package builds its POs from the estimate, once", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@peak.example");
    const { organizationId, as } = owner;
    const projectId = (await as.mutation(api.projects.create, {
      organizationId,
      data: { name: "Bath" },
    }))!._id as Id<"projects">;
    expect(
      (await as.query(api.purchaseOrders.forProject, { projectId })).orders,
    ).toEqual([]);
    await expect(
      as.mutation(api.purchaseOrders.buildFromEstimate, { projectId }),
    ).rejects.toThrow(/estimate/);
    await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        title: "Bath",
        projectId,
        items: [
          {
            _id: "a",
            description: "Wall tile, supplied and installed, per sf",
            quantity: 90,
            unitPrice: 32,
          },
          {
            _id: "b",
            description: "Permit and inspections",
            quantity: 1,
            unitPrice: 450,
          },
        ],
      },
    });
    expect(
      await as.mutation(api.purchaseOrders.buildFromEstimate, { projectId }),
    ).toBe(2);
    const { orders } = await as.query(api.purchaseOrders.forProject, {
      projectId,
    });
    expect(orders.map((o) => o.title)).toEqual([
      "Tile supplier",
      "Tile setter",
    ]);
    expect(orders[0].lines[0]).toMatchObject({
      description: "Wall tile",
      unit: "sf",
      quantity: 90,
    });
    expect(
      await as.mutation(api.purchaseOrders.buildFromEstimate, { projectId }),
    ).toBe(0);
  });

  test("another company can't see or touch them", async () => {
    const t = setup();
    const { as, projectId } = await kitchen(t);
    const [po] = (await as.query(api.purchaseOrders.forProject, { projectId }))
      .orders;
    const rival = await signUp(t, "rival@example.com");
    await expect(
      rival.as.query(api.purchaseOrders.forProject, { projectId }),
    ).rejects.toThrow();
    await expect(
      rival.as.mutation(api.purchaseOrders.markOrdered, { id: po.id }),
    ).rejects.toThrow();
    await expect(
      rival.as.mutation(api.purchaseOrders.update, { id: po.id, notes: "x" }),
    ).rejects.toThrow();
    await expect(
      rival.as.mutation(api.purchaseOrders.create, { projectId, title: "x" }),
    ).rejects.toThrow();
  });
});
