import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";

describe("auth and tenancy", () => {
  test("signed-out callers are rejected", async () => {
    const t = setup();
    const { organizationId } = await signUp(t, "a@example.com");
    await expect(t.query(api.clients.list, { organizationId })).rejects.toThrow(/signed in/);
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  test("me returns the user with their organization", async () => {
    const t = setup();
    const { as, userId, organizationId } = await signUp(t, "a@example.com");
    expect(await as.query(api.users.me, {})).toMatchObject({
      id: userId,
      email: "a@example.com",
      name: "a",
      organizationId,
      role: "user",
    });
  });

  test("users only see and touch their own organization's data", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");

    const client = await alice.as.mutation(api.clients.create, {
      organizationId: alice.organizationId,
      data: { name: "Smith Residence" },
    });

    expect(await alice.as.query(api.organizations.list, {})).toHaveLength(1);
    expect((await bob.as.query(api.organizations.list, {}))[0]._id).toBe(bob.organizationId);

    await expect(bob.as.query(api.clients.list, { organizationId: alice.organizationId })).rejects.toThrow(
      /access/,
    );
    // Other tenants' records read as "not found" rather than "forbidden".
    await expect(bob.as.query(api.clients.get, { id: client!._id })).rejects.toThrow(/Not found/);
    await expect(bob.as.mutation(api.clients.update, { id: client!._id, data: { name: "x" } })).rejects.toThrow(
      /Not found/,
    );
    await expect(bob.as.mutation(api.clients.remove, { id: client!._id })).rejects.toThrow(/Not found/);
    expect((await alice.as.query(api.clients.get, { id: client!._id })).name).toBe("Smith Residence");
  });

  test("callers can't spoof ownership or link another tenant's records", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const bobsClient = await bob.as.mutation(api.clients.create, {
      organizationId: bob.organizationId,
      data: { name: "Bob's client" },
    });

    const created = await alice.as.mutation(api.clients.create, {
      organizationId: alice.organizationId,
      data: { name: "Mine", userId: bob.userId, organizationId: bob.organizationId, hacked: true },
    });
    expect(created).toMatchObject({ userId: alice.userId, organizationId: alice.organizationId });
    expect(created).not.toHaveProperty("hacked");

    await expect(
      alice.as.mutation(api.estimates.create, {
        organizationId: alice.organizationId,
        data: { clientId: bobsClient!._id, items: [] },
      }),
    ).rejects.toThrow(/Client not found/);
  });

  test("only owners can deactivate an organization", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", {
        organizationId: alice.organizationId,
        userId: bob.userId,
        role: "member",
        createdAt: new Date().toISOString(),
      });
    });
    await expect(bob.as.mutation(api.organizations.remove, { id: alice.organizationId })).rejects.toThrow(/access/);
    await alice.as.mutation(api.organizations.remove, { id: alice.organizationId });
    expect(await alice.as.query(api.organizations.list, {})).toHaveLength(0);
  });
});

describe("estimates and invoices", () => {
  test("totals are derived from items and tax, and recalculated on update", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        title: "Roof replacement",
        taxRate: 10,
        items: [
          { description: "Tear-off", quantity: 20, unitPrice: 85 },
          { description: "Shingles", quantity: "20", unitPrice: 120, totalPrice: 999999 },
        ],
      },
    });
    expect(estimate).toMatchObject({ status: "draft", subtotal: 4100, taxAmount: 410, totalAmount: 4510 });
    expect(estimate!.estimateNumber).toMatch(/^EST-\d{4}-\d{6}$/);
    expect(estimate!.items.map((i) => i.totalPrice)).toEqual([1700, 2400]);
    expect(estimate!.items[0]._id).toEqual(expect.any(String));

    const updated = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { taxRate: 0, status: "sent" },
    });
    expect(updated).toMatchObject({ status: "sent", subtotal: 4100, taxAmount: 0, totalAmount: 4100 });

    const signed = await as.mutation(api.estimates.sign, { id: estimate!._id, signature: "J. Smith" });
    expect(signed).toMatchObject({ status: "accepted", clientSignature: "J. Smith" });
    expect(signed!.signedAt).toEqual(expect.any(String));

    const log = await as.query(api.activityLogs.list, { organizationId, resourceType: "estimate" });
    expect(log.map((entry) => entry.action)).toEqual(["signed", "status_changed", "created"]);
  });

  test("signature can only be set through sign", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: { clientSignature: "forged", signedAt: "2020-01-01" },
    });
    expect(estimate).not.toHaveProperty("clientSignature");
    expect(estimate).not.toHaveProperty("signedAt");
  });

  test("filters by client and status", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const client = await as.mutation(api.clients.create, { organizationId, data: { name: "C" } });
    await as.mutation(api.estimates.create, { organizationId, data: { clientId: client!._id } });
    await as.mutation(api.estimates.create, { organizationId, data: { status: "sent" } });
    expect(await as.query(api.estimates.list, { organizationId })).toHaveLength(2);
    expect(await as.query(api.estimates.list, { organizationId, clientId: client!._id })).toHaveLength(1);
    expect(await as.query(api.estimates.list, { organizationId, status: "sent" })).toHaveLength(1);
  });

  test("invoices can be marked paid", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const invoice = await as.mutation(api.invoices.create, {
      organizationId,
      data: { items: [{ description: "Work", quantity: 1, unitPrice: 500 }] },
    });
    expect(invoice).toMatchObject({ status: "draft", totalAmount: 500, amountPaid: 0 });
    expect(invoice!.invoiceNumber).toMatch(/^INV-/);
    const paid = await as.mutation(api.invoices.markAsPaid, { id: invoice!._id, amountPaid: 500 });
    expect(paid).toMatchObject({ status: "paid", amountPaid: 500 });
    expect(paid!.paidDate).toEqual(expect.any(String));
  });
});

describe("price book", () => {
  test("seed creates the shared catalog once", async () => {
    const t = setup();
    expect(await t.mutation(internal.seed.catalog, {})).toEqual({ pricingModes: 3, costCodes: 5, lineItems: 15 });
    expect(await t.mutation(internal.seed.catalog, {})).toEqual({ pricingModes: 0, costCodes: 0, lineItems: 0 });
  });

  test("orgs see shared items plus their own, never another org's", async () => {
    const t = setup();
    await t.mutation(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");

    const shared = await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId });
    expect(shared).toHaveLength(15);
    const shingles = shared.find((item) => item.name === "Designer Shingles")!;
    expect(shingles).toMatchObject({ base_price: 300, red_line_price: 240, cap_price: 360 });
    expect(shingles.cost_code).toMatchObject({ code: "ROOF-MAT", name: "Roofing Materials" });
    const dripEdge = shared.find((item) => item.name === "Drip Edge")!;
    expect(dripEdge).toMatchObject({ base_price: 4.5, red_line_price: 4, cap_price: 5 });

    const costCodeId = shingles.cost_code_id;
    const own = await alice.as.mutation(api.lineItems.create, {
      data: { name: "Alice's special", organization_id: alice.organizationId, cost_code_id: costCodeId, base_price: 10, unit: "each" },
    });
    expect(own.user_id).toBe(alice.userId);

    expect(await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId })).toHaveLength(16);
    expect(
      await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId, includeShared: false }),
    ).toHaveLength(1);
    expect(await bob.as.query(api.lineItems.list, { organizationId: bob.organizationId })).toHaveLength(15);
    await expect(bob.as.query(api.lineItems.get, { id: own._id })).rejects.toThrow(/access/);

    const searched = await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId, search: "tear" });
    expect(searched.map((item) => item.name).sort()).toEqual(["Double Layer Tear-off", "Single Layer Tear-off"]);

    await alice.as.mutation(api.lineItems.remove, { id: own._id });
    expect(await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId })).toHaveLength(15);
  });

  test("only super admins can change the shared catalog", async () => {
    const t = setup();
    await t.mutation(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const admin = await signUp(t, "admin@example.com", { role: "super_admin" });
    const [item] = await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId });

    await expect(alice.as.mutation(api.lineItems.update, { id: item._id, data: { base_price: 1 } })).rejects.toThrow(
      /administrators/,
    );
    await expect(
      alice.as.mutation(api.costCodes.create, { data: { code: "X", name: "Shared" } }),
    ).rejects.toThrow(/administrators/);

    const updated = await admin.as.mutation(api.lineItems.update, { id: item._id, data: { base_price: 1 } });
    expect(updated.base_price).toBe(1);
  });

  test("org cost codes stay private and can't be used by other orgs", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const code = await alice.as.mutation(api.costCodes.create, {
      data: { code: "AL100", name: "Alice Labor", organization_id: alice.organizationId },
    });
    expect((await alice.as.query(api.costCodes.list, {})).map((cc) => cc.code)).toEqual(["AL100"]);
    expect(await bob.as.query(api.costCodes.list, {})).toHaveLength(0);
    await expect(
      bob.as.mutation(api.lineItems.create, {
        data: { name: "x", organization_id: bob.organizationId, cost_code_id: code!._id, base_price: 1, unit: "each" },
      }),
    ).rejects.toThrow(/Cost code not found/);
  });

  test("pricing modes: presets plus the org's own", async () => {
    const t = setup();
    await t.mutation(internal.seed.catalog, {});
    const { as, organizationId } = await signUp(t, "a@example.com");
    await as.mutation(api.pricingModes.create, {
      organizationId,
      data: { name: "Storm Season", adjustments: { all: 1.25 }, is_preset: true },
    });
    const modes = await as.query(api.pricingModes.list, { organizationId });
    // Presets first, then the organization's own modes.
    expect(modes.map((m) => m.is_preset)).toEqual([true, true, true, false]);
    expect(modes[3]).toMatchObject({ name: "Storm Season", is_preset: false, id: modes[3]._id });
    expect((await as.query(api.pricingModes.presets, {})).map((m) => m.name)).toEqual([
      "Busy Season",
      "Competitive",
      "Need This Job",
    ]);
  });
});
