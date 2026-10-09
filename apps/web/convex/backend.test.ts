import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { STARTER_COST_CODES, STARTER_INDUSTRIES, STARTER_ITEMS } from "./catalog/starterCatalog";
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

  test("an item's price never goes below its red line", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        items: [
          { description: "Wire", quantity: 2, unitPrice: 187.5, redLinePrice: 87.5, capPrice: 187.5 },
          { description: "Custom", quantity: 1, unitPrice: 10 },
        ],
      },
    });
    expect(estimate!.items[0]).toMatchObject({ unitPrice: 187.5, redLinePrice: 87.5, capPrice: 187.5, totalPrice: 375 });

    const updated = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { items: [{ ...estimate!.items[0], unitPrice: 50 }, estimate!.items[1]] },
    });
    expect(updated!.items[0]).toMatchObject({ unitPrice: 87.5, totalPrice: 175 });
    expect(updated!.items[1]).toMatchObject({ unitPrice: 10 });
    expect(updated!.subtotal).toBe(185);
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
  test("seed creates every trade's shared catalog once", async () => {
    const t = setup();
    expect(await t.action(internal.seed.catalog, {})).toEqual({
      pricingModes: 3,
      industries: STARTER_INDUSTRIES.length,
      legacyRoofingCodesRemoved: 0,
      costCodes: STARTER_COST_CODES.length,
      lineItems: STARTER_ITEMS.length,
    });
    expect(await t.action(internal.seed.catalog, {})).toEqual({
      pricingModes: 0,
      industries: 0,
      legacyRoofingCodesRemoved: 0,
      costCodes: 0,
      lineItems: 0,
    });
  });

  test("seed replaces the first roofing seed but keeps codes a company uses", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const now = new Date().toISOString();
    const [unused, used] = await t.run(async (ctx) => {
      const ids = [];
      for (const code of ["ROOF-VENT", "ROOF-LAB"]) {
        const id = await ctx.db.insert("costCodes", {
          code,
          name: code,
          industry_id: "roofing",
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        await ctx.db.insert("lineItems", {
          name: `${code} item`,
          base_price: 1,
          unit: "each",
          cost_code_id: id,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        ids.push(id);
      }
      await ctx.db.insert("lineItems", {
        name: "Alice's roofing labor",
        base_price: 1,
        unit: "hour",
        cost_code_id: ids[1],
        organization_id: alice.organizationId,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      return ids;
    });
    expect(await t.action(internal.seed.catalog, {})).toMatchObject({ legacyRoofingCodesRemoved: 1 });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(unused)).toBeNull();
      expect(await ctx.db.get(used)).not.toBeNull();
    });
  });

  test("orgs see shared items plus their own, never another org's", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const total = STARTER_ITEMS.length;

    const shared = await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId });
    expect(shared).toHaveLength(total);
    const shingles = shared.find((item) => item.name === "Designer Shingles")!;
    expect(shingles).toMatchObject({ base_price: 300, red_line_price: 240, cap_price: 360 });
    expect(shingles.cost_code).toMatchObject({ code: "RF500", name: "Roofing Materials", industry_id: "roofing" });
    expect(shingles.service_category).toBe("Roofing Materials");
    // Items without their own range get the old default: 70% to 150% of base.
    const dripEdge = shared.find((item) => item.name === "Drip Edge")!;
    expect(dripEdge).toMatchObject({ base_price: 4.5, red_line_price: 3.15, cap_price: 6.75 });

    const costCodeId = shingles.cost_code_id;
    const own = await alice.as.mutation(api.lineItems.create, {
      data: { name: "Alice's special", organization_id: alice.organizationId, cost_code_id: costCodeId, base_price: 10, unit: "each" },
    });
    expect(own.user_id).toBe(alice.userId);

    expect(await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId })).toHaveLength(total + 1);
    expect(
      await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId, includeShared: false }),
    ).toHaveLength(1);
    expect(await bob.as.query(api.lineItems.list, { organizationId: bob.organizationId })).toHaveLength(total);
    await expect(bob.as.query(api.lineItems.get, { id: own._id })).rejects.toThrow(/access/);

    const searched = await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId, search: "tear-off" });
    expect(searched.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Double Layer Tear-off", "Single Layer Tear-off"]),
    );

    await alice.as.mutation(api.lineItems.remove, { id: own._id });
    expect(await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId })).toHaveLength(total);
  });

  test("only admins change prices on their organization's items", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
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
    expect(await alice.as.query(api.organizations.myRole, { id: alice.organizationId })).toBe("owner");
    expect(await bob.as.query(api.organizations.myRole, { id: alice.organizationId })).toBe("member");

    const [shared] = await alice.as.query(api.lineItems.list, { organizationId: alice.organizationId });
    const item = await alice.as.mutation(api.lineItems.create, {
      data: {
        name: "Service call",
        organization_id: alice.organizationId,
        cost_code_id: shared.cost_code_id,
        red_line_price: 80,
        cap_price: 150,
        unit: "each",
      },
    });
    expect(item).toMatchObject({ base_price: 80, red_line_price: 80, cap_price: 150 });

    await expect(
      bob.as.mutation(api.lineItems.update, { id: item._id, data: { red_line_price: 50 } }),
    ).rejects.toThrow(/access/);
    const renamed = await bob.as.mutation(api.lineItems.update, { id: item._id, data: { name: "Service visit" } });
    expect(renamed).toMatchObject({ name: "Service visit", red_line_price: 80 });

    await expect(
      alice.as.mutation(api.lineItems.update, { id: item._id, data: { cap_price: 60 } }),
    ).rejects.toThrow(/below the red line/);
    const repriced = await alice.as.mutation(api.lineItems.update, { id: item._id, data: { red_line_price: 90 } });
    expect(repriced).toMatchObject({ base_price: 90, red_line_price: 90, cap_price: 150 });
  });

  test("cost codes carry their trade, and every trade is listed", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const { as, organizationId } = await signUp(t, "a@example.com");

    const industries = await as.query(api.industries.list, {});
    expect(industries).toHaveLength(STARTER_INDUSTRIES.length);
    expect(industries.find((i) => i.id === "hvac")).toMatchObject({ slug: "hvac", name: "HVAC" });

    const hvacCodes = await as.query(api.costCodes.list, { industryId: "hvac" });
    expect(hvacCodes.map((cc) => cc.code)).toContain("HV500");
    expect(hvacCodes[0].industry).toMatchObject({ id: "hvac", name: "HVAC" });

    const items = await as.query(api.lineItems.list, { organizationId });
    const trades = new Set(items.map((item) => item.cost_code?.industry_id));
    for (const slug of ["roofing", "hvac", "electrical", "plumbing", "concrete", "drywall", "handyman", "window-door"]) {
      expect(trades).toContain(slug);
    }
  });

  test("organizations choose their trades; only admins can change them", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");

    await alice.as.mutation(api.industries.setForOrganization, {
      organizationId: alice.organizationId,
      industryIds: ["roofing", "painting", "not-a-trade"],
    });
    const chosen = await alice.as.query(api.industries.forOrganization, { organizationId: alice.organizationId });
    expect(chosen.map((i) => i.id).sort()).toEqual(["painting", "roofing"]);

    await alice.as.mutation(api.industries.setForOrganization, {
      organizationId: alice.organizationId,
      industryIds: ["roofing", "hvac"],
    });
    expect(
      (await alice.as.query(api.industries.forOrganization, { organizationId: alice.organizationId }))
        .map((i) => i.id)
        .sort(),
    ).toEqual(["hvac", "roofing"]);

    await expect(
      bob.as.query(api.industries.forOrganization, { organizationId: alice.organizationId }),
    ).rejects.toThrow(/access/);
    await expect(
      bob.as.mutation(api.industries.setForOrganization, { organizationId: alice.organizationId, industryIds: [] }),
    ).rejects.toThrow(/access/);
  });

  test("only super admins can change the shared catalog", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
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
    await t.action(internal.seed.catalog, {});
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

describe("leads", () => {
  test("create, list in priority order and stay inside the organization", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const organizationId = alice.organizationId;

    const later = await alice.as.mutation(api.leads.create, {
      organizationId,
      data: { name: " Jones ", followUpDate: "2026-11-01", jobType: "roofing", source: "Referral" },
    });
    expect(later).toMatchObject({ name: "Jones", status: "new", userId: alice.userId });
    await alice.as.mutation(api.leads.create, { organizationId, data: { name: "Soon", followUpDate: "2026-10-10" } });
    const lost = await alice.as.mutation(api.leads.create, { organizationId, data: { name: "Gone" } });
    await alice.as.mutation(api.leads.update, { id: lost!._id, data: { status: "lost", lostReason: "Too pricey" } });

    const names = (await alice.as.query(api.leads.list, { organizationId })).map((lead) => lead.name);
    expect(names).toEqual(["Soon", "Jones", "Gone"]);

    await expect(alice.as.mutation(api.leads.create, { organizationId, data: { name: "  " } })).rejects.toThrow(/name/);
    await expect(bob.as.query(api.leads.list, { organizationId })).rejects.toThrow(/access/);
    await expect(bob.as.mutation(api.leads.update, { id: later!._id, data: { name: "x" } })).rejects.toThrow(/Not found/);
    await expect(bob.as.mutation(api.leads.remove, { id: later!._id })).rejects.toThrow(/Not found/);
  });

  test("importLeads adds leads to the user's organization once", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const rows = [
      { name: "Pat Lee", phone: "(555) 010-2000", status: "quoted", estimatedValue: 4200, createdAt: "2025-03-01T00:00:00.000Z" },
      { name: "Sam Ortiz", email: "sam@example.com", status: "won", lostReason: "ignored" },
      { name: "Pat Lee", phone: "555-010-2000" },
    ];

    const first = await t.mutation(internal.leads.importLeads, { email: "alice@example.com", leads: rows });
    expect(first).toEqual({ inserted: 2, skipped: 1 });
    const again = await t.mutation(internal.leads.importLeads, { email: "alice@example.com", leads: rows });
    expect(again).toEqual({ inserted: 0, skipped: 3 });

    const leads = await alice.as.query(api.leads.list, { organizationId: alice.organizationId });
    expect(leads).toHaveLength(2);
    expect(leads.find((lead) => lead.name === "Pat Lee")).toMatchObject({
      status: "quoted",
      estimatedValue: 4200,
      createdAt: "2025-03-01T00:00:00.000Z",
    });
    expect(leads.find((lead) => lead.name === "Sam Ortiz")!.lostReason).toBeUndefined();
    expect(await bob.as.query(api.leads.list, { organizationId: bob.organizationId })).toHaveLength(0);
    await expect(
      t.mutation(internal.leads.importLeads, { email: "nobody@example.com", leads: rows }),
    ).rejects.toThrow(/No user/);
  });

  test("lost keeps its reason only while lost", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const lead = await as.mutation(api.leads.create, { organizationId, data: { name: "Smith" } });
    const lost = await as.mutation(api.leads.update, {
      id: lead!._id,
      data: { status: "lost", lostReason: "Went with another contractor" },
    });
    expect(lost).toMatchObject({ status: "lost", lostReason: "Went with another contractor" });
    const reopened = await as.mutation(api.leads.update, { id: lead!._id, data: { status: "contacted" } });
    expect(reopened!.status).toBe("contacted");
    expect(reopened!.lostReason).toBeUndefined();
  });

  test("ensureClient creates one client; estimates must be the organization's own", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const lead = await alice.as.mutation(api.leads.create, {
      organizationId: alice.organizationId,
      data: { name: "Garcia", phone: "555-0100", email: "g@example.com" },
    });

    const clientId = await alice.as.mutation(api.leads.ensureClient, { id: lead!._id });
    expect(await alice.as.mutation(api.leads.ensureClient, { id: lead!._id })).toBe(clientId);
    const clients = await alice.as.query(api.clients.list, { organizationId: alice.organizationId });
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ name: "Garcia", phone: "555-0100", email: "g@example.com" });

    const bobsEstimate = await bob.as.mutation(api.estimates.create, {
      organizationId: bob.organizationId,
      data: { estimateNumber: "EST-1", status: "draft", issueDate: "2026-10-01", items: [] },
    });
    await expect(
      alice.as.mutation(api.leads.update, { id: lead!._id, data: { estimateId: bobsEstimate!._id } }),
    ).rejects.toThrow(/Estimate not found/);

    const estimate = await alice.as.mutation(api.estimates.create, {
      organizationId: alice.organizationId,
      data: {
        estimateNumber: "EST-2",
        status: "draft",
        issueDate: "2026-10-01",
        clientId,
        items: [{ description: "Roof", quantity: 1, unitPrice: 9000 }],
      },
    });
    await alice.as.mutation(api.leads.update, { id: lead!._id, data: { estimateId: estimate!._id, status: "quoted" } });
    const [listed] = await alice.as.query(api.leads.list, { organizationId: alice.organizationId });
    expect(listed).toMatchObject({ status: "quoted", clientId });
    expect(listed.estimate).toMatchObject({ estimateNumber: "EST-2", status: "draft", totalAmount: 9000 });
  });
});

describe("sample leads", () => {
  test("added only to an empty list, removed without touching real leads", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    expect(await as.mutation(api.leads.addSamples, { organizationId })).toBe(8);
    const leads = await as.query(api.leads.list, { organizationId });
    expect(new Set(leads.map((lead) => lead.status))).toEqual(new Set(["new", "contacted", "quoted", "won", "lost"]));
    await expect(as.mutation(api.leads.addSamples, { organizationId })).rejects.toThrow(/empty/);

    await as.mutation(api.leads.create, { organizationId, data: { name: "Real customer" } });
    expect(await as.mutation(api.leads.removeSamples, { organizationId })).toBe(8);
    expect((await as.query(api.leads.list, { organizationId })).map((lead) => lead.name)).toEqual(["Real customer"]);
  });
});
