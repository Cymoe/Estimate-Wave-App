import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { STARTER_COST_CODES, STARTER_INDUSTRIES, STARTER_ITEMS } from "./catalog/starterCatalog";
import { setup, signUp } from "./test.setup";
import { cityFromSearch, cityFromText } from "./lib/leadCity";
import { fillTimeMs, priceAt, pricingFor } from "./lib/auction";
import { TEXAS_COUNTIES, countyForTown, normalizeCounty } from "./lib/counties";

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

describe("estimates", () => {
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

  test("the contract follows the estimate until it is accepted, then stays as agreed", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const client = await as.mutation(api.clients.create, {
      organizationId,
      data: { name: "Dan Shah", email: "dan@example.com", address: "1 Main St", city: "Austin", state: "TX" },
    });
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: { clientId: client!._id, items: [{ description: "Vanity", quantity: 1, unitPrice: 900 }] },
    });
    const terms = { startDate: "2026-11-01", paymentTerms: "50% deposit, 50% on completion" };
    const withTerms = await as.mutation(api.estimates.update, { id: estimate!._id, data: { contractTerms: terms } });
    expect(withTerms!.contractTerms).toEqual(terms);
    expect(withTerms).not.toHaveProperty("contractLockedAt");

    const accepted = await as.mutation(api.estimates.update, { id: estimate!._id, data: { status: "accepted" } });
    expect(accepted!.contractLockedAt).toEqual(expect.any(String));
    expect(accepted!.contractSnapshot).toMatchObject({
      client: { name: "Dan Shah", email: "dan@example.com", address: "1 Main St, Austin, TX" },
      totalAmount: 900,
      terms,
    });

    // Later estimate changes don't touch the agreed contract.
    const changed = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { items: [{ ...accepted!.items[0], unitPrice: 1200 }] },
    });
    expect(changed!.totalAmount).toBe(1200);
    expect(changed!.contractSnapshot!.totalAmount).toBe(900);
    expect(changed!.contractLockedAt).toBe(accepted!.contractLockedAt);
    await expect(
      as.mutation(api.estimates.update, { id: estimate!._id, data: { contractTerms: { startDate: "2027-01-01" } } }),
    ).rejects.toThrow(/change order/);
  });

  test("signing locks the contract, and the lock can't be set or cleared directly", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: { contractLockedAt: "2020-01-01", contractSnapshot: { items: [], subtotal: 0, taxAmount: 0, totalAmount: 0 } },
    });
    expect(estimate).not.toHaveProperty("contractLockedAt");
    expect(estimate).not.toHaveProperty("contractSnapshot");
    const signed = await as.mutation(api.estimates.sign, { id: estimate!._id, signature: "J. Smith" });
    expect(signed!.contractLockedAt).toEqual(expect.any(String));
    const cleared = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { contractLockedAt: null, contractSnapshot: null },
    });
    expect(cleared!.contractLockedAt).toBe(signed!.contractLockedAt);
  });

  test("a design file is attached, replaced and removed; the signed contract keeps its copy", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, { organizationId, data: {} });
    const store = (type: string, body = "x") => t.run((ctx) => ctx.storage.store(new Blob([body], { type })));
    const exists = (id: Id<"_storage">) => t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);

    expect(await as.mutation(api.estimates.designUploadUrl, { id: estimate!._id })).toEqual(expect.any(String));
    const first = await store("image/png");
    const withDesign = await as.mutation(api.estimates.setDesign, { id: estimate!._id, storageId: first, name: "plan.png" });
    expect(withDesign!.design).toMatchObject({ storageId: first, name: "plan.png" });
    expect(withDesign!.design!.contentType).toMatch(/^image\//);
    expect(withDesign!.design!.url).toEqual(expect.any(String));

    // Replacing deletes the old file.
    const second = await store("application/pdf");
    await as.mutation(api.estimates.setDesign, { id: estimate!._id, storageId: second, name: "plan.pdf" });
    expect(await exists(first)).toBe(false);

    // Other file types are refused.
    const text = await store("text/plain");
    await expect(
      as.mutation(api.estimates.setDesign, { id: estimate!._id, storageId: text, name: "notes.txt" }),
    ).rejects.toThrow(/image or PDF/);

    // The design can't be set through update.
    const updated = await as.mutation(api.estimates.update, { id: estimate!._id, data: { design: null } });
    expect(updated!.design!.storageId).toBe(second);

    // Once accepted, removing the design leaves the signed contract's copy.
    const accepted = await as.mutation(api.estimates.update, { id: estimate!._id, data: { status: "accepted" } });
    expect(accepted!.contractSnapshot!.design!.storageId).toBe(second);
    const removed = await as.mutation(api.estimates.removeDesign, { id: estimate!._id });
    expect(removed).not.toHaveProperty("design");
    expect(await exists(second)).toBe(true);

    // Deleting the estimate deletes its files.
    await as.mutation(api.estimates.remove, { id: estimate!._id });
    expect(await exists(second)).toBe(false);
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
    expect(first).toEqual({ inserted: 2, updated: 0, skipped: 1 });
    const again = await t.mutation(internal.leads.importLeads, { email: "alice@example.com", leads: rows });
    expect(again).toEqual({ inserted: 0, updated: 0, skipped: 3 });
    const refreshed = await t.mutation(internal.leads.importLeads, {
      email: "alice@example.com",
      leads: [{ name: "Sam Ortiz", email: "sam@example.com", status: "scheduled", appointmentAt: "2026-10-08T19:00:00.000Z" }],
      updateExisting: true,
    });
    expect(refreshed).toEqual({ inserted: 0, updated: 1, skipped: 0 });

    const leads = await alice.as.query(api.leads.list, { organizationId: alice.organizationId });
    expect(leads).toHaveLength(2);
    expect(leads.find((lead) => lead.name === "Pat Lee")).toMatchObject({
      status: "quoted",
      estimatedValue: 4200,
      createdAt: "2025-03-01T00:00:00.000Z",
    });
    expect(leads.find((lead) => lead.name === "Sam Ortiz")).toMatchObject({
      status: "scheduled",
      appointmentAt: "2026-10-08T19:00:00.000Z",
    });
    expect(await bob.as.query(api.leads.list, { organizationId: bob.organizationId })).toHaveLength(0);
    await expect(
      t.mutation(internal.leads.importLeads, { email: "nobody@example.com", leads: rows }),
    ).rejects.toThrow(/No user/);
  });

  test("a lead's city comes from the form, the address or the zip", () => {
    expect(cityFromText("3809 Crestline Ave", "midland")).toBe("Midland");
    expect(cityFromText("123 Elm", "116 Midland")).toBe("Midland");
    expect(cityFromText("1658 n Tripp Odessa")).toBe("Odessa");
    expect(cityFromText("12 Main St, Big Spring, TX 79720")).toBe("Big Spring");
    expect(cityFromText("4500 E University Blvd TX 79762")).toBe("Odessa");
    expect(cityFromText("2811 Cimmaron Ave 79705")).toBe("Midland");
    // A street named after a town isn't the town.
    expect(cityFromText("500 Crane Ave")).toBeUndefined();
    expect(cityFromText("3809 Crestline Ave")).toBeUndefined();
    expect(cityFromText(undefined)).toBeUndefined();
    // A map search only counts when every match agrees.
    expect(cityFromSearch([{ address: { city: "Midland" } }, { address: { city: "Midland" } }])).toBe("Midland");
    expect(cityFromSearch([{ address: { city: "Midland" } }, { address: { city: "Odessa" } }])).toBeUndefined();
    expect(cityFromSearch([])).toBeUndefined();
  });

  test("street-only addresses get their city from a map lookup", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (decodeURIComponent(url).includes("Crestline") ? [{ address: { city: "Midland" } }] : []),
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const t = setup();
      const { as, organizationId } = await signUp(t, "a@example.com");
      const named = await as.mutation(api.leads.create, { organizationId, data: { name: "Ann", address: "1658 n Tripp Odessa" } });
      expect(named!.city).toBe("Odessa");
      const street = await as.mutation(api.leads.create, { organizationId, data: { name: "Bo", address: "3809 Crestline Ave" } });
      expect(street!.city).toBeUndefined();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const list = await as.query(api.leads.list, { organizationId });
      expect(list.find((lead) => lead.name === "Bo")!.city).toBe("Midland");

      // A new address is looked up again; a city picked by hand is kept.
      const moved = await as.mutation(api.leads.update, { id: street!._id, data: { address: "9 Nowhere Ln" } });
      expect(moved!.city).toBeUndefined();
      const picked = await as.mutation(api.leads.update, { id: street!._id, data: { address: "10 Nowhere Ln", city: "Odessa" } });
      expect(picked!.city).toBe("Odessa");

      // Leads from before (no city, never checked) are filled in once.
      await t.run(async (ctx) => {
        await ctx.db.patch(named!._id, { city: undefined, cityCheckedAt: undefined });
      });
      expect(await as.mutation(api.leadCity.fillMissing, { organizationId })).toEqual({ set: 1, queued: 0, none: 0 });
      expect(await as.mutation(api.leadCity.fillMissing, { organizationId })).toEqual({ set: 0, queued: 0, none: 0 });
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
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

describe("expenses", () => {
  test("track spending per project, with status changes, tenancy and cleanup", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const project = await alice.as.mutation(api.projects.create, {
      organizationId: alice.organizationId,
      data: { name: "Kitchen", budget: 10000 },
    });

    const lumber = await alice.as.mutation(api.expenses.create, {
      organizationId: alice.organizationId,
      data: { projectId: project!._id, description: "Lumber", amount: 1200.5, category: "Materials", vendor: "Home Depot", date: "2026-10-01" },
    });
    expect(lumber).toMatchObject({ status: "pending", category: "Materials", vendor: "Home Depot" });
    await alice.as.mutation(api.expenses.create, {
      organizationId: alice.organizationId,
      data: { projectId: project!._id, description: "Dumpster", amount: 450, date: "2026-10-03", status: "paid" },
    });
    // An expense without a project belongs to the business only.
    await alice.as.mutation(api.expenses.create, {
      organizationId: alice.organizationId,
      data: { description: "Truck fuel", amount: 80 },
    });

    const forProject = await alice.as.query(api.expenses.list, { organizationId: alice.organizationId, projectId: project!._id });
    expect(forProject.map((e) => e.description)).toEqual(["Dumpster", "Lumber"]);
    expect(await alice.as.query(api.expenses.list, { organizationId: alice.organizationId })).toHaveLength(3);

    const paid = await alice.as.mutation(api.expenses.update, { id: lumber!._id, data: { status: "paid", vendor: null } });
    expect(paid).toMatchObject({ status: "paid" });
    expect(paid!.vendor).toBeUndefined();

    await expect(
      alice.as.mutation(api.expenses.create, { organizationId: alice.organizationId, data: { description: " ", amount: 5 } }),
    ).rejects.toThrow(/what the expense/);
    await expect(
      alice.as.mutation(api.expenses.create, { organizationId: alice.organizationId, data: { description: "x", amount: -5 } }),
    ).rejects.toThrow(/zero or more/);
    await expect(alice.as.mutation(api.expenses.update, { id: lumber!._id, data: { amount: null } })).rejects.toThrow(/cleared/);

    // Another company can't see, change or attach to it.
    await expect(bob.as.query(api.expenses.list, { organizationId: alice.organizationId })).rejects.toThrow(/access/);
    await expect(bob.as.mutation(api.expenses.update, { id: lumber!._id, data: { amount: 1 } })).rejects.toThrow(/Not found/);
    await expect(
      bob.as.mutation(api.expenses.create, { organizationId: bob.organizationId, data: { projectId: project!._id, description: "x", amount: 1 } }),
    ).rejects.toThrow(/Project not found/);

    // Deleting the project deletes its expenses, not the business ones.
    await alice.as.mutation(api.projects.remove, { id: project!._id });
    const left = await alice.as.query(api.expenses.list, { organizationId: alice.organizationId });
    expect(left.map((e) => e.description)).toEqual(["Truck fuel"]);
  });
});

describe("estimate item categories", () => {
  async function priceBookItem() {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", {
        slug: "painting",
        name: "Painting",
        display_order: 1,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    });
    const product = async (code: string, name: string) => {
      const costCode = await as.mutation(api.costCodes.create, {
        data: { code, name, industry_id: "painting", organization_id: organizationId },
      });
      const lineItem = await as.mutation(api.lineItems.create, {
        data: { name, organization_id: organizationId, cost_code_id: costCode!._id, base_price: 3, unit: "sqft" },
      });
      return lineItem._id as string;
    };
    return {
      t,
      as,
      organizationId,
      productId: await product("PT100", "Painting Labor"),
      materialsId: await product("PT500", "Painting Materials"),
    };
  }

  test("an item from the price book is categorised by its trade, so labor and materials group together", async () => {
    const { as, organizationId, productId, materialsId } = await priceBookItem();
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        items: [
          { description: "Paint walls", quantity: 100, unitPrice: 3, productId },
          { description: "Paint", quantity: 5, unitPrice: 40, productId: materialsId },
          { description: "Custom work", quantity: 1, unitPrice: 50 },
          { description: "Bad link", quantity: 1, unitPrice: 5, productId: "not-an-id" },
        ],
      },
    });
    expect(estimate!.items.map((i) => i.category)).toEqual(["Painting", "Painting", undefined, undefined]);
  });

  test("older items get their category when read, and the signed contract keeps it", async () => {
    const { t, as, organizationId, productId } = await priceBookItem();
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: { items: [{ description: "Paint walls", quantity: 1, unitPrice: 3, productId }] },
    });
    const id = estimate!._id;
    // As if saved before categories were trades.
    await t.run(async (ctx) => {
      const doc = (await ctx.db.get(id))!;
      await ctx.db.patch(id, { items: doc.items.map((item) => ({ ...item, category: "Painting Labor" })) });
    });
    expect((await as.query(api.estimates.get, { id }))!.items[0].category).toBe("Painting");
    const token = await as.mutation(api.estimates.shareLink, { id });
    expect((await t.query(api.publicEstimates.get, { token }))!.items[0].category).toBe("Painting");
    await as.mutation(api.estimates.update, { id, data: { status: "accepted" } });
    const accepted = await t.run(async (ctx) => ctx.db.get(id));
    expect(accepted!.contractSnapshot!.items[0].category).toBe("Painting");
  });
});

describe("client link", () => {
  async function sharedEstimate() {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const client = await as.mutation(api.clients.create, { organizationId, data: { name: "Dan Shah" } });
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        clientId: client!._id,
        items: [{ description: "Vanity", quantity: 1, unitPrice: 900, redLinePrice: 600, capPrice: 900 }],
      },
    });
    const token = await as.mutation(api.estimates.shareLink, { id: estimate!._id });
    return { t, as, id: estimate!._id, token };
  }

  test("each estimate gets one secret link, and the token can't be set directly", async () => {
    const { as, id, token } = await sharedEstimate();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await as.mutation(api.estimates.shareLink, { id })).toBe(token);
    const updated = await as.mutation(api.estimates.update, { id, data: { shareToken: "guess" } });
    expect(updated!.shareToken).toBe(token);
  });

  test("anyone with the link sees a client-safe view without logging in", async () => {
    const { t, token } = await sharedEstimate();
    expect(await t.query(api.publicEstimates.get, { token: "nope" })).toBeNull();
    const view = await t.query(api.publicEstimates.get, { token });
    expect(view).toMatchObject({ totalAmount: 900, client: { name: "Dan Shah" }, business: { name: "a@example.com Co" } });
    expect(view!.items).toEqual([{ description: "Vanity", quantity: 1, unitPrice: 900, totalPrice: 900 }]);
    expect(JSON.stringify(view)).not.toMatch(/redLine|capPrice|organizationId|shareToken|contract/);
  });

  test("opening a sent estimate marks it opened, once", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await as.mutation(api.estimates.update, { id, data: { status: "sent" } });
    await t.mutation(api.publicEstimates.markOpened, { token });
    const opened = await as.query(api.estimates.get, { id });
    expect(opened).toMatchObject({ status: "opened" });
    expect(opened!.firstOpenedAt).toEqual(expect.any(String));
  });

  test("the client accepts with a signature, which locks the contract; it can't be answered twice", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await expect(t.mutation(api.publicEstimates.accept, { token, signature: " " })).rejects.toThrow(/sign/);
    await t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,abc" });
    const accepted = await as.query(api.estimates.get, { id });
    expect(accepted).toMatchObject({ status: "accepted", clientSignature: "data:image/png;base64,abc" });
    expect(accepted!.contractSnapshot!.totalAmount).toBe(900);
    await expect(t.mutation(api.publicEstimates.decline, { token })).rejects.toThrow(/no longer/);
    await expect(t.mutation(api.publicEstimates.accept, { token, signature: "x" })).rejects.toThrow(/no longer/);
  });

  test("the client sees the agreement terms they're signing", async () => {
    const { t, as, id, token } = await sharedEstimate();
    let view = await t.query(api.publicEstimates.get, { token });
    expect(view!.agreement).toMatchObject({
      paymentTerms: "50% deposit upon signing, 50% upon completion",
      warrantyPeriod: "1 year",
    });
    await as.mutation(api.estimates.update, {
      id,
      data: { contractTerms: { startDate: "2026-11-02", paymentTerms: "Net 15", propertyAddress: "12 Elm St" } },
    });
    view = await t.query(api.publicEstimates.get, { token });
    expect(view!.agreement).toMatchObject({ startDate: "2026-11-02", paymentTerms: "Net 15", propertyAddress: "12 Elm St" });
    expect(view!.lockedAt).toBeUndefined();
  });

  test("after signing, the link shows what was signed, not later edits", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,abc" });
    await as.mutation(api.estimates.update, {
      id,
      data: { items: [{ description: "Bigger vanity", quantity: 1, unitPrice: 1500, redLinePrice: 600, capPrice: 1500 }] },
    });
    const view = await t.query(api.publicEstimates.get, { token });
    expect(view!.items).toEqual([{ description: "Vanity", quantity: 1, unitPrice: 900, totalPrice: 900 }]);
    expect(view!.totalAmount).toBe(900);
    expect(view!.lockedAt).toEqual(expect.any(String));
  });

  test("the client can decline", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await t.mutation(api.publicEstimates.decline, { token });
    expect(await as.query(api.estimates.get, { id })).toMatchObject({ status: "rejected" });
    await expect(t.mutation(api.publicEstimates.decline, { token: "nope" })).rejects.toThrow(/isn't valid/);
  });
});


describe("lead market", () => {
  async function market() {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const roofer = await signUp(t, "roofer@example.com");
    const painter = await signUp(t, "painter@example.com");
    await admin.as.mutation(api.marketplace.setLeadPrice, { jobType: "roofing", price: 285 });
    await admin.as.mutation(api.marketplace.setLeadPrice, { jobType: "default", price: 240 });
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "  Jane Cole ", phone: "555-0101", jobType: "roofing", address: "1 Oak St" },
    });
    return { t, admin, roofer, painter, leadId: lead!._id };
  }

  test("only platform admins can run the market", async () => {
    const { roofer, leadId } = await market();
    await expect(roofer.as.query(api.marketplace.listInbox, {})).rejects.toThrow(/admins/);
    await expect(roofer.as.mutation(api.marketplace.assign, { leadId, organizationId: roofer.organizationId })).rejects.toThrow(/admins/);
    await expect(
      roofer.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 1000 }),
    ).rejects.toThrow(/admins/);
  });

  test("a top-up and its bonus are recorded, and companies can't set their own balance", async () => {
    const { admin, roofer } = await market();
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: roofer.organizationId,
      amount: 500,
      bonus: 25,
      method: "Zelle",
    });
    await roofer.as.mutation(api.organizations.update, { id: roofer.organizationId, data: { walletBalanceCents: 999999 } });
    const wallet = await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId });
    expect(wallet.balanceCents).toBe(52500);
    expect(wallet.transactions.map((t) => [t.type, t.amountCents, t.balanceAfterCents])).toEqual([
      ["bonus", 2500, 52500],
      ["top_up", 50000, 50000],
    ]);
  });

  test("selling a lead charges its trade price once, and it goes to one company only", async () => {
    const { admin, roofer, painter, leadId } = await market();
    await expect(
      admin.as.mutation(api.marketplace.assign, { leadId, organizationId: roofer.organizationId }),
    ).rejects.toThrow(/Balance too low/);
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 300 });
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: painter.organizationId, amount: 300 });
    await admin.as.mutation(api.marketplace.assign, { leadId, organizationId: roofer.organizationId });
    await expect(
      admin.as.mutation(api.marketplace.assign, { leadId, organizationId: painter.organizationId }),
    ).rejects.toThrow(/already sent/);

    const leads = await roofer.as.query(api.leads.list, { organizationId: roofer.organizationId });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ name: "Jane Cole", source: "FieldQuote Lead", status: "new", pricePaidCents: 28500, wonVia: "sent" });
    expect((await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId })).balanceCents).toBe(1500);
    expect(await painter.as.query(api.leads.list, { organizationId: painter.organizationId })).toHaveLength(0);
    // The other company can't see the buyer's wallet.
    await expect(painter.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId })).rejects.toThrow(/access/);

    const overview = await admin.as.query(api.marketplace.companiesOverview, {});
    expect(overview.find((c) => c.id === roofer.organizationId)).toMatchObject({ balanceCents: 1500, leads30d: 1, spent30dCents: 28500 });
  });

  test("a bad lead can be credited back once, within three days", async () => {
    const { t, admin, roofer, leadId } = await market();
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 300 });
    const { orgLeadId } = await admin.as.mutation(api.marketplace.assign, { leadId, organizationId: roofer.organizationId });
    await expect(roofer.as.mutation(api.marketplace.requestCredit, { leadId: orgLeadId, reason: "made_up" })).rejects.toThrow(/reason/);
    await roofer.as.mutation(api.marketplace.requestCredit, { leadId: orgLeadId, reason: "wrong_number" });
    await expect(roofer.as.mutation(api.marketplace.requestCredit, { leadId: orgLeadId, reason: "duplicate" })).rejects.toThrow(/already/);
    // Companies can't approve their own credits or edit what they paid.
    await expect(roofer.as.mutation(api.marketplace.reviewCredit, { orgLeadId, approve: true })).rejects.toThrow(/admins/);
    await roofer.as.mutation(api.leads.update, { id: orgLeadId, data: { pricePaidCents: 1 } });

    expect(await admin.as.query(api.marketplace.pendingCredits, {})).toHaveLength(1);
    await admin.as.mutation(api.marketplace.reviewCredit, { orgLeadId, approve: true });
    await expect(admin.as.mutation(api.marketplace.reviewCredit, { orgLeadId, approve: true })).rejects.toThrow(/no open credit/);
    const wallet = await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId });
    expect(wallet.balanceCents).toBe(30000);
    expect(wallet.transactions[0]).toMatchObject({ type: "credit", amountCents: 28500 });

    // A lead older than three days can't be credited.
    const old = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Old lead" } });
    const { orgLeadId: oldLead } = await admin.as.mutation(api.marketplace.assign, { leadId: old!._id, organizationId: roofer.organizationId });
    await t.run(async (ctx) => ctx.db.patch(oldLead, { assignedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString() }));
    await expect(roofer.as.mutation(api.marketplace.requestCredit, { leadId: oldLead, reason: "duplicate" })).rejects.toThrow(/3 days/);
  });

  test("a company set up for a new contractor becomes theirs when they sign up", async () => {
    const { t, admin } = await market();
    const company = await admin.as.mutation(api.marketplace.createCompany, {
      data: { name: "Peak Roofing", ownerEmail: "Owner@Peak.example", leadTrades: ["roofing"] },
    });
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "owner@peak.example" });
      const { acceptInvites } = await import("./lib/organizations");
      await acceptInvites(ctx, id, "owner@peak.example");
      return id;
    });
    const owner = t.withIdentity({ subject: `${userId}|session-x` });
    const orgs = await owner.query(api.organizations.list, {});
    expect(orgs.map((o) => o._id)).toEqual([company!._id]);
    expect(await owner.query(api.organizations.myRole, { id: company!._id })).toBe("owner");
  });

  test("a company name can't be used twice, and only empty companies can be removed", async () => {
    const { t, admin, roofer } = await market();
    const first = await admin.as.mutation(api.marketplace.createCompany, { data: { name: "Picante Painting" } });
    await expect(
      admin.as.mutation(api.marketplace.createCompany, { data: { name: "  picante   PAINTING " } }),
    ).rejects.toThrow(/already exists/);

    // A company with leads or money stays.
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: roofer.organizationId, amount: 1000 });
    await expect(admin.as.mutation(api.marketplace.removeCompany, { organizationId: roofer.organizationId })).rejects.toThrow(
      /Only empty companies/,
    );
    await expect(roofer.as.mutation(api.marketplace.removeCompany, { organizationId: first!._id })).rejects.toThrow(/admins/);

    const overview = await admin.as.query(api.marketplace.companiesOverview, {});
    expect(overview.find((c) => c.id === first!._id)?.isEmpty).toBe(true);
    expect(overview.find((c) => c.id === roofer.organizationId)?.isEmpty).toBe(false);

    await admin.as.mutation(api.marketplace.removeCompany, { organizationId: first!._id });
    const ids = (await admin.as.query(api.organizations.list, {})).map((o) => o._id);
    expect(ids).not.toContain(first!._id);
    expect(ids).toContain(roofer.organizationId);
    // The name is free again once the empty copy is gone.
    await admin.as.mutation(api.marketplace.createCompany, { data: { name: "Picante Painting" } });
    expect(await t.run(async (ctx) => (await ctx.db.get(first!._id))?.isActive)).toBe(false);
  });
});

describe("smoke tests and demo data", () => {
  test("super admins don't see deactivated companies", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const gone = await signUp(t, "gone@example.com");
    await gone.as.mutation(api.organizations.remove, { id: gone.organizationId });
    const ids = (await admin.as.query(api.organizations.list, {})).map((o) => o._id);
    expect(ids).toContain(admin.organizationId);
    expect(ids).not.toContain(gone.organizationId);
  });

  test("smoke-test accounts and their companies are removed; real ones are kept", async () => {
    const t = setup();
    const real = await signUp(t, "real@example.com");
    const smoke = await signUp(t, "smoke-test+1@fieldquote.test");
    const shared = await signUp(t, "smoke-test+2@fieldquote.test");
    await smoke.as.mutation(api.clients.create, { organizationId: smoke.organizationId, data: { name: "Smoke Test Customer" } });
    // A real person joined the second smoke company, so it stays.
    await t.run(async (ctx) =>
      ctx.db.insert("memberships", { organizationId: shared.organizationId, userId: real.userId, role: "member", createdAt: "x" }),
    );
    const result = await t.mutation(internal.seed.removeSmokeTests, {});
    expect(result).toMatchObject({ users: 2, companies: 1 });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(smoke.organizationId)).toBeNull();
      expect(await ctx.db.get(smoke.userId)).toBeNull();
      expect(await ctx.db.get(shared.organizationId)).not.toBeNull();
      expect(await ctx.db.get(real.userId)).not.toBeNull();
      expect(await ctx.db.query("clients").collect()).toHaveLength(0);
    });
  });

  test("demo companies and leads can be added once and removed in one go", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const contractor = await signUp(t, "roofer@example.com");
    await expect(contractor.as.mutation(api.marketplace.addDemoData, {})).rejects.toThrow(/admins/);
    expect(await admin.as.mutation(api.marketplace.addDemoData, {})).toEqual({ companies: 6, leads: 10 });
    await expect(admin.as.mutation(api.marketplace.addDemoData, {})).rejects.toThrow(/already/);

    const companies = await admin.as.query(api.marketplace.companiesOverview, {});
    const roofing = companies.find((c) => c.name === "Permian Roofing & Exteriors")!;
    expect(roofing).toMatchObject({ isSample: true, balanceCents: 110000 - 28500, leadsTotal: 1, wonCents: 1850000 });
    const inbox = await admin.as.query(api.marketplace.listInbox, {});
    expect(inbox.available).toHaveLength(6);
    expect(inbox.sold).toHaveLength(4);

    expect(await admin.as.mutation(api.marketplace.removeDemoData, {})).toEqual({ companies: 6, leads: 10, standingBids: 0 });
    const left = await admin.as.query(api.marketplace.companiesOverview, {});
    expect(left.map((c) => c.name).sort()).toEqual([`admin@fieldquote.example Co`, `roofer@example.com Co`]);
    expect((await admin.as.query(api.marketplace.listInbox, {})).available).toHaveLength(0);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("walletTransactions").collect()).toHaveLength(0);
    });
  });

  test("sample leads fill the market at different points on their schedules", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const company = await signUp(t, "mio@example.com");
    await admin.as.mutation(api.marketplace.setCompanyTrades, { organizationId: company.organizationId, leadTrades: ["landscaping"] });
    await expect(company.as.mutation(api.marketplace.addSampleLeads, {})).rejects.toThrow(/admins/);
    expect(await admin.as.mutation(api.marketplace.addSampleLeads, {})).toEqual({ added: 20 });
    const feed = await company.as.query(api.marketplace.feed, { organizationId: company.organizationId });
    expect(feed).toHaveLength(20);
    expect(feed.filter((l) => l.matchesTrades)).toHaveLength(12);
    const prices = new Set(feed.map((l) => priceAt(l.auction, Date.now()).priceCents));
    expect(prices.size).toBeGreaterThan(1);
    expect(JSON.stringify(feed)).not.toMatch(/555-03|Humble Ave/);
    expect(await admin.as.mutation(api.marketplace.removeDemoData, {})).toEqual({ companies: 0, leads: 20, standingBids: 0 });
  });

  test("demo bids give every company funds, standing bids and awarded leads, and come back out cleanly", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const mio = await signUp(t, "mio@example.com");
    const soco = await signUp(t, "soco@example.com");
    const picante = await signUp(t, "picante@example.com");
    for (const [who, trades] of [[mio, ["landscaping"]], [soco, ["landscaping"]], [picante, ["painting"]]] as const)
      await admin.as.mutation(api.marketplace.setCompanyTrades, { organizationId: who.organizationId, leadTrades: [...trades] });
    // Mio already has real money and a real lead, which must survive.
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: mio.organizationId, amount: 300 });
    await mio.as.mutation(api.leads.create, { organizationId: mio.organizationId, data: { name: "Real Customer", jobType: "landscaping" } });
    const balanceOf = async (who: { as: any; organizationId: any }) =>
      (await who.as.query(api.marketplace.wallet, { organizationId: who.organizationId })).balanceCents;

    await expect(mio.as.mutation(api.marketplace.addDemoBids, {})).rejects.toThrow(/admins/);
    const added = await admin.as.mutation(api.marketplace.addDemoBids, {});
    // Four companies (the admin's own has no trades, so general construction), 14 leads; the Stanton one has
    // no bidder here (that pattern belongs to a third landscaper), so 10 are awarded.
    expect(added).toEqual({ companies: 4, standingBids: 4 + 3 + 3 + 2, leads: 14, sold: 10 });
    await expect(admin.as.mutation(api.marketplace.addDemoBids, {})).rejects.toThrow(/already/);

    // Mio (first landscaper by name) leads Midland at $275 against Soco's $250; Soco leads Ector at $260.
    const mioBids = await mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId });
    expect(mioBids.map((b) => [b.county, b.amountCents, b.funded, b.leading])).toEqual([
      ["Andrews", 21500, true, true],
      ["Ector", 22500, true, false],
      ["Howard", 21000, true, true],
      ["Midland", 27500, true, true],
    ]);
    const socoBids = await soco.as.query(api.bids.listStanding, { organizationId: soco.organizationId });
    expect(socoBids.find((b) => b.county === "Andrews")).toMatchObject({ amountCents: 90000, funded: false, leading: false });
    expect(socoBids.find((b) => b.county === "Ector")).toMatchObject({ leading: true });

    // Results: Mio won Midland leads and lost Ector ones; Soco's Andrews bid was too much for its funds.
    const mioResults = await mio.as.query(api.bids.results, { organizationId: mio.organizationId });
    expect(mioResults.some((r) => r.won && r.county === "Midland")).toBe(true);
    expect(mioResults.some((r) => !r.won && r.county === "Ector" && r.outcome === "Outbid: a higher bid won it")).toBe(true);
    const socoResults = await soco.as.query(api.bids.results, { organizationId: soco.organizationId });
    expect(socoResults.find((r) => r.county === "Andrews")?.outcome).toMatch(/Balance too low/);
    expect((await picante.as.query(api.bids.results, { organizationId: picante.organizationId })).filter((r) => r.won)).toHaveLength(3);
    // Money moved: demo funds in, won leads out.
    expect(await balanceOf(picante)).toBe(150000 - 22000 - 24000 - 22000); // Odessa, Midland, Odessa
    expect(await balanceOf(soco)).toBeLessThan(60000);
    const inbox = await admin.as.query(api.marketplace.listInbox, {});
    expect(inbox.available.map((l) => l.jobType).sort()).toEqual(["hvac", "landscaping", "landscaping", "roofing"]);
    expect(inbox.sold.every((l) => l.wonBy === "bid")).toBe(true);
    expect((await admin.as.query(api.marketplace.companiesOverview, {})).find((c) => c.id === mio.organizationId)).toMatchObject({ sampleBids: 4 });
    expect(await mio.as.query(api.leads.list, { organizationId: mio.organizationId })).toHaveLength(1 + mioResults.filter((r) => r.won).length);

    // Everything comes back out, and balances are what they were.
    expect(await admin.as.mutation(api.marketplace.removeDemoData, {})).toEqual({ companies: 0, leads: 14, standingBids: 12 });
    expect(await mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId })).toHaveLength(0);
    expect(await mio.as.query(api.bids.results, { organizationId: mio.organizationId })).toHaveLength(0);
    expect(await balanceOf(mio)).toBe(30000);
    expect(await balanceOf(soco)).toBe(0);
    expect(await balanceOf(picante)).toBe(0);
    expect((await mio.as.query(api.leads.list, { organizationId: mio.organizationId })).map((l) => l.name)).toEqual(["Real Customer"]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("marketplaceLeads").collect()).toHaveLength(0);
      expect(await ctx.db.query("leadBids").collect()).toHaveLength(0);
      expect((await ctx.db.query("walletTransactions").collect()).map((t) => t.amountCents)).toEqual([30000]);
    });
  });

  test("the real companies replace the demo data, without duplicating ones that exist", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    await admin.as.mutation(api.marketplace.addDemoData, {});
    // Picante Painting is already here, with its own leads and no trades yet.
    const picante = await signUp(t, "owner@picante.example");
    await picante.as.mutation(api.organizations.update, { id: picante.organizationId, data: { name: "Picante Painting" } });
    await picante.as.mutation(api.leads.create, { organizationId: picante.organizationId, data: { name: "Their lead" } });

    const first = await t.mutation(internal.seed.realCompanies, {});
    expect(first).toMatchObject({
      demoRemoved: { companies: 6, leads: 10 },
      created: ["Mio Homes", "Soco Outdoor", "Buried Stone", "A&E Landscaping"],
      updated: ["Picante Painting"],
    });
    expect(await t.mutation(internal.seed.realCompanies, {})).toMatchObject({ created: [], updated: [] });

    const companies = await admin.as.query(api.marketplace.companiesOverview, {});
    const names = companies.map((c) => c.name);
    expect(names.filter((n) => n === "Picante Painting")).toHaveLength(1);
    expect(names.some((n) => n.includes("Permian"))).toBe(false);
    expect(companies.find((c) => c.name === "Picante Painting")).toMatchObject({
      id: picante.organizationId,
      leadTrades: ["painting"],
      owners: ["owner@picante.example"],
    });
    expect(companies.find((c) => c.name === "Mio Homes")?.leadTrades).toEqual(["landscaping"]);

    // A removed company isn't brought back.
    const mio = companies.find((c) => c.name === "Mio Homes")!;
    await admin.as.mutation(api.marketplace.removeCompany, { organizationId: mio.id });
    expect((await t.mutation(internal.seed.realCompanies, {})).created).toEqual([]);
  });

  test("empty duplicate companies are switched off, keeping the one with data", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const real = await signUp(t, "owner@picante.example");
    await real.as.mutation(api.organizations.update, { id: real.organizationId, data: { name: "Picante Painting" } });
    await real.as.mutation(api.leads.create, { organizationId: real.organizationId, data: { name: "Their lead" } });
    // The empty copy, made later from the Lead Market, has the trades.
    const copy = await t.run(async (ctx) => {
      const { createOrganization } = await import("./lib/organizations");
      return await createOrganization(ctx, { name: "picante painting", leadTrades: ["painting"] });
    });
    const solo = await admin.as.mutation(api.marketplace.createCompany, { data: { name: "Mio Homes" } });

    expect(await t.mutation(internal.seed.removeEmptyDuplicates, {})).toEqual({ removed: ["picante painting"] });
    expect(await t.mutation(internal.seed.removeEmptyDuplicates, {})).toEqual({ removed: [] });
    const ids = (await admin.as.query(api.organizations.list, {})).map((o) => o._id);
    expect(ids).toContain(real.organizationId);
    expect(ids).toContain(solo!._id);
    expect(ids).not.toContain(copy);
    const kept = await t.run(async (ctx) => ctx.db.get(real.organizationId));
    expect(kept?.leadTrades).toEqual(["painting"]);
  });

  test("the real leads move from Picante Painting to Mio Homes", async () => {
    const t = setup();
    const picante = await signUp(t, "owner@picante.example");
    await picante.as.mutation(api.organizations.update, { id: picante.organizationId, data: { name: "Picante Painting" } });
    const client = await picante.as.mutation(api.clients.create, { organizationId: picante.organizationId, data: { name: "Ann" } });
    const lead = await picante.as.mutation(api.leads.create, {
      organizationId: picante.organizationId,
      data: { name: "Backyard redo", clientId: client!._id },
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(lead!._id, { clientId: client!._id });
    });
    const sample = await t.run(async (ctx) =>
      ctx.db.insert("leads", {
        name: "Example",
        status: "new",
        isSample: true,
        organizationId: picante.organizationId,
        userId: picante.userId,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      } as any),
    );
    await t.mutation(internal.seed.realCompanies, {});

    const result = await t.mutation(internal.seed.moveLeadsToMioHomes, {});
    expect(result).toMatchObject({ moved: 1 });
    const mio = await t.run(async (ctx) => (await ctx.db.query("organizations").collect()).find((o) => o.name === "Mio Homes")!);
    expect(mio.leadTrades).toEqual(["landscaping"]);
    const moved = await t.run(async (ctx) => ctx.db.get(lead!._id));
    expect(moved).toMatchObject({ organizationId: mio._id, name: "Backyard redo" });
    expect(moved?.clientId).toBeUndefined();
    expect((await t.run(async (ctx) => ctx.db.get(sample)))?.organizationId).toBe(picante.organizationId);
    // Picante keeps its client and company.
    expect(result.picante).toEqual([{ active: true, clients: 1, estimates: 0, fundingLinks: 0, walletEntries: 0 }]);
  });

  test("the small test Picante Painting becomes the Myles Webb workspace", async () => {
    const t = setup();
    const real = await signUp(t, "owner@picante.example");
    const test = await signUp(t, "test@picante.example");
    for (const c of [real, test])
      await c.as.mutation(api.organizations.update, { id: c.organizationId, data: { name: "Picante Painting" } });
    const client = await real.as.mutation(api.clients.create, { organizationId: real.organizationId, data: { name: "Ann" } });
    await real.as.mutation(api.estimates.create, {
      organizationId: real.organizationId,
      data: { clientId: client!._id, items: [] },
    });

    expect(await t.mutation(internal.seed.renameTestPicante, {})).toMatchObject({ renamed: true });
    const [kept, renamed] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(real.organizationId), ctx.db.get(test.organizationId)]),
    );
    expect(kept?.name).toBe("Picante Painting");
    expect(renamed).toMatchObject({ name: "Myles Webb", industryId: "general-construction", isActive: true });
    // Only one Picante left, so running it again does nothing.
    expect(await t.mutation(internal.seed.renameTestPicante, {})).toEqual({ renamed: false, picantes: 1 });
  });

  test("an owner can be set on a company: invited, or added if they have an account", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const company = await admin.as.mutation(api.marketplace.createCompany, { data: { name: "Soco Outdoor" } });
    await expect(admin.as.mutation(api.marketplace.setCompanyOwner, { organizationId: company!._id, email: "nope" })).rejects.toThrow(
      /valid owner email/,
    );
    expect(await admin.as.mutation(api.marketplace.setCompanyOwner, { organizationId: company!._id, email: "Old@Soco.example" })).toBe(
      "invited",
    );
    expect(await admin.as.mutation(api.marketplace.setCompanyOwner, { organizationId: company!._id, email: "owner@soco.example" })).toBe(
      "invited",
    );
    let row = (await admin.as.query(api.marketplace.companiesOverview, {})).find((c) => c.id === company!._id)!;
    expect(row.invitePending).toBe("owner@soco.example");

    const existing = await signUp(t, "boss@soco.example");
    await expect(existing.as.mutation(api.marketplace.setCompanyOwner, { organizationId: company!._id, email: "boss@soco.example" })).rejects.toThrow(
      /admins/,
    );
    expect(await admin.as.mutation(api.marketplace.setCompanyOwner, { organizationId: company!._id, email: "boss@soco.example" })).toBe(
      "added",
    );
    row = (await admin.as.query(api.marketplace.companiesOverview, {})).find((c) => c.id === company!._id)!;
    expect(row.owners).toEqual(["boss@soco.example"]);
    expect(row.invitePending).toBeUndefined();
    expect(await existing.as.query(api.organizations.myRole, { id: company!._id })).toBe("owner");
  });
});

describe("funding links and the lead feed", () => {
  async function company() {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const roofer = await signUp(t, "roofer@example.com");
    const rival = await signUp(t, "rival@example.com");
    const token = await roofer.as.mutation(api.funding.createLink, { organizationId: roofer.organizationId });
    return { t, admin, roofer, rival, token };
  }
  const balance = async (who: { as: any; organizationId: any }) =>
    (await who.as.query(api.marketplace.wallet, { organizationId: who.organizationId })).balanceCents;

  test("paying through the link records the payment but loads nothing until it's confirmed", async () => {
    const { t, admin, roofer, rival, token } = await company();
    expect(await roofer.as.mutation(api.funding.createLink, { organizationId: roofer.organizationId })).toBe(token);
    await expect(rival.as.mutation(api.funding.createLink, { organizationId: roofer.organizationId })).rejects.toThrow(/access/);

    const page = await t.query(api.funding.get, { token });
    expect(page).toMatchObject({ companyName: "roofer@example.com Co", status: "open", minimumCents: 500000 });
    expect(page!.tiers.map((tier) => tier.bonusCents)).toEqual([0, 37500, 100000]);

    await expect(t.mutation(api.funding.submit, { token, amountCents: 499999, method: "card" })).rejects.toThrow(/minimum/);
    await t.mutation(api.funding.submit, { token, amountCents: 1_000_000, method: "apple_pay", payerName: "Pat Roofer" });
    await expect(t.mutation(api.funding.submit, { token, amountCents: 1_000_000, method: "card" })).rejects.toThrow(/already been used/);
    expect(await balance(roofer)).toBe(0);
    expect((await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId })).pendingFunding).toEqual({
      amountCents: 1_000_000,
      bonusCents: 100000,
    });

    const [pending] = await admin.as.query(api.funding.pending, {});
    await expect(roofer.as.mutation(api.funding.confirm, { id: pending.id })).rejects.toThrow(/admins/);
    await admin.as.mutation(api.funding.confirm, { id: pending.id });
    await expect(admin.as.mutation(api.funding.confirm, { id: pending.id })).rejects.toThrow(/isn't waiting/);
    expect(await balance(roofer)).toBe(1_100_000);
    expect((await t.query(api.funding.get, { token }))!.status).toBe("confirmed");
  });

  test("the feed hides contact details until a company buys the lead, and only one company can", async () => {
    const { t, admin, roofer, rival } = await company();
    await admin.as.mutation(api.marketplace.setLeadPrice, { jobType: "roofing", price: 285 });
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Jane Cole", phone: "555-0101", email: "jane@example.com", address: "1 Oak St", city: "Midland", jobType: "roofing", notes: "Hail damage" },
    });
    const feed = await roofer.as.query(api.marketplace.feed, { organizationId: roofer.organizationId });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ jobType: "roofing", city: "Midland", summary: "Hail damage" });
    expect(feed[0].auction).toMatchObject({ startCents: 28500, floorCents: 5700, dropCents: 1000, dropEveryMs: 3_600_000 });
    expect(JSON.stringify(feed)).not.toMatch(/Jane|555-0101|jane@|Oak St/);

    await expect(roofer.as.mutation(api.marketplace.buy, { leadId: lead!._id, organizationId: roofer.organizationId })).rejects.toThrow(
      /Balance too low/,
    );
    await expect(rival.as.mutation(api.marketplace.buy, { leadId: lead!._id, organizationId: roofer.organizationId })).rejects.toThrow(/access/);
    for (const who of [roofer, rival]) {
      await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: who.organizationId, amount: 5000 });
    }
    await roofer.as.mutation(api.marketplace.buy, { leadId: lead!._id, organizationId: roofer.organizationId });
    await expect(rival.as.mutation(api.marketplace.buy, { leadId: lead!._id, organizationId: rival.organizationId })).rejects.toThrow(
      /just bought/,
    );
    const mine = await roofer.as.query(api.leads.list, { organizationId: roofer.organizationId });
    expect(mine[0]).toMatchObject({ name: "Jane Cole", phone: "555-0101", pricePaidCents: 28500, wonVia: "buy" });
    expect(await balance(roofer)).toBe(500000 - 28500);
    expect(await rival.as.query(api.marketplace.feed, { organizationId: rival.organizationId })).toHaveLength(0);
    void t;
  });
});

describe("dropping prices and buy orders", () => {
  const HOUR = 3_600_000;

  test("a trade's schedule fills in from the start price", () => {
    expect(pricingFor({ priceCents: 28500 })).toEqual({ startCents: 28500, floorCents: 5700, dropCents: 1000, dropEveryMs: HOUR });
    // Nothing lists for less than $200.
    expect(pricingFor({ priceCents: 1600 })).toEqual({ startCents: 20000, floorCents: 4000, dropCents: 700, dropEveryMs: HOUR });
    expect(pricingFor({ priceCents: 25000, floorCents: 3500, dropCents: 500, dropEveryMinutes: 30 })).toEqual({
      startCents: 25000,
      floorCents: 3500,
      dropCents: 500,
      dropEveryMs: 30 * 60_000,
    });
    const a = { startCents: 15000, floorCents: 3500, dropCents: 500, dropEveryMs: HOUR, listedAt: "2026-10-17T00:00:00.000Z" };
    const listed = Date.parse(a.listedAt);
    expect(priceAt(a, listed + 59 * 60_000)).toMatchObject({ priceCents: 15000, nextPriceCents: 14500, nextDropAtMs: listed + HOUR });
    expect(priceAt(a, listed + 2.5 * HOUR).priceCents).toBe(14000);
    expect(priceAt(a, listed + 23 * HOUR)).toMatchObject({ priceCents: 3500, atFloor: true, floorAtMs: listed + 23 * HOUR });
    expect(priceAt(a, listed + 100 * HOUR).priceCents).toBe(3500);
    expect(fillTimeMs(a, 14000)).toBe(listed + 2 * HOUR);
    expect(fillTimeMs(a, 14200)).toBe(listed + 2 * HOUR);
    expect(fillTimeMs(a, 3500)).toBe(listed + 23 * HOUR);
    expect(fillTimeMs(a, 100)).toBe(listed + 23 * HOUR);
  });

  async function market() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const roofer = await signUp(t, "roofer@example.com");
    const rival = await signUp(t, "rival@example.com");
    await expect(admin.as.mutation(api.marketplace.setLeadPrice, { jobType: "roofing", price: 150 })).rejects.toThrow(/start at \$200/);
    await admin.as.mutation(api.marketplace.setLeadPrice, { jobType: "roofing", price: 285, floor: 220, drop: 5 });
    for (const who of [roofer, rival])
      await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: who.organizationId, amount: 300 });
    const lead = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Jane Cole", jobType: "roofing" } });
    return { t, admin, roofer, rival, leadId: lead!._id };
  }
  const balance = async (who: { as: any; organizationId: any }) =>
    (await who.as.query(api.marketplace.wallet, { organizationId: who.organizationId })).balanceCents;
  const sold = async (t: any, leadId: any) => t.run(async (ctx: any) => ctx.db.get(leadId));

  test("the price drops on the schedule, and buy now pays what it is at the time", async () => {
    try {
      const { t, admin, roofer, leadId } = await market();
      const feed = await roofer.as.query(api.marketplace.feed, { organizationId: roofer.organizationId });
      expect(feed[0].auction).toMatchObject({ startCents: 28500, floorCents: 22000, dropCents: 500, listedAt: "2026-10-17T12:00:00.000Z" });
      const inbox = await admin.as.query(api.marketplace.listInbox, {});
      expect(inbox.available[0]).toMatchObject({ price: 28500, floorCents: 22000, openBids: 0, floorAt: "2026-10-18T01:00:00.000Z" });

      vi.setSystemTime(new Date("2026-10-17T14:30:00.000Z"));
      expect((await admin.as.query(api.marketplace.listInbox, {})).available[0].price).toBe(27500);
      await roofer.as.mutation(api.marketplace.buy, { leadId, organizationId: roofer.organizationId });
      expect(await balance(roofer)).toBe(30000 - 27500);
      expect(await sold(t, leadId)).toMatchObject({ status: "assigned", priceCents: 27500 });
      // Changing the trade's prices later doesn't move a lead already listed.
      const other = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Bo", jobType: "roofing" } });
      await admin.as.mutation(api.marketplace.setLeadPrice, { jobType: "roofing", price: 200 });
      expect((await roofer.as.query(api.marketplace.feed, { organizationId: roofer.organizationId }))[0]).toMatchObject({
        id: other!._id,
        auction: { startCents: 28500 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("a buy order fills on its own when the price reaches it; the highest order wins", async () => {
    try {
      const { t, admin, roofer, rival, leadId } = await market();
      const place = (who: any, max: number) =>
        who.as.mutation(api.marketplace.placeBid, { leadId, organizationId: who.organizationId, max });
      await expect(place(roofer, 10)).rejects.toThrow(/won't go below \$220/);
      await expect(place(roofer, 285)).rejects.toThrow(/already \$285.00: buy it now/);
      const broke = await signUp(t, "broke@example.com");
      await expect(place(broke, 260)).rejects.toThrow(/Add funds/);
      await expect(rival.as.mutation(api.marketplace.placeBid, { leadId, organizationId: roofer.organizationId, max: 60 })).rejects.toThrow(
        /access/,
      );

      expect(await place(roofer, 260)).toMatchObject({ fillsAt: "2026-10-17T17:00:00.000Z" });
      // A second order from the same company replaces the first.
      const { bidId } = await place(roofer, 255);
      expect(await place(rival, 270)).toMatchObject({ fillsAt: "2026-10-17T15:00:00.000Z" });
      expect((await admin.as.query(api.marketplace.listInbox, {})).available[0].openBids).toBe(2);
      const mine = await roofer.as.query(api.marketplace.feed, { organizationId: roofer.organizationId });
      expect(mine[0].myBid).toMatchObject({ id: bidId, maxCents: 25500 });
      expect((await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId })).openBids).toBe(1);

      // 15:00: the price reaches $270 and the rival's order fills at that price.
      vi.advanceTimersByTime(3 * HOUR);
      await t.finishInProgressScheduledFunctions();
      expect(await sold(t, leadId)).toMatchObject({ status: "assigned", assignedOrganizationId: rival.organizationId, priceCents: 27000 });
      // 17:00: the roofer's order comes due, but the lead is gone.
      vi.advanceTimersByTime(2 * HOUR);
      await t.finishInProgressScheduledFunctions();
      expect(await balance(rival)).toBe(30000 - 27000);
      expect(await balance(roofer)).toBe(30000);
      const rivals = await rival.as.query(api.marketplace.bids, { organizationId: rival.organizationId });
      expect(rivals[0]).toMatchObject({ status: "filled", maxCents: 27000, pricePaidCents: 27000 });
      // Their Leads board says the buy order brought it in.
      const theirs = await rival.as.query(api.leads.list, { organizationId: rival.organizationId });
      expect(theirs[0]).toMatchObject({ pricePaidCents: 27000, wonVia: "order" });
      const roofers = await roofer.as.query(api.marketplace.bids, { organizationId: roofer.organizationId });
      expect(roofers.map((b) => b.status).sort()).toEqual(["lost"]);
      expect(roofers[0].outcome).toMatch(/Another company/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("buy orders can be cancelled, lose to a buy now, and need the balance when they fill", async () => {
    try {
      const { t, admin, roofer, rival, leadId } = await market();
      const { bidId } = await roofer.as.mutation(api.marketplace.placeBid, { leadId, organizationId: roofer.organizationId, max: 260 });
      await expect(rival.as.mutation(api.marketplace.cancelBid, { bidId })).rejects.toThrow(/access/);
      await roofer.as.mutation(api.marketplace.cancelBid, { bidId });
      await expect(roofer.as.mutation(api.marketplace.cancelBid, { bidId })).rejects.toThrow(/already closed/);

      await roofer.as.mutation(api.marketplace.placeBid, { leadId, organizationId: roofer.organizationId, max: 260 });
      await rival.as.mutation(api.marketplace.buy, { leadId, organizationId: rival.organizationId });
      const lost = await roofer.as.query(api.marketplace.bids, { organizationId: roofer.organizationId });
      expect(lost.find((b) => b.status === "lost")?.outcome).toMatch(/bought it first/);

      // Spending the balance before the order fills loses it.
      const second = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Bo", jobType: "roofing" } });
      await roofer.as.mutation(api.marketplace.placeBid, { leadId: second!._id, organizationId: roofer.organizationId, max: 260 });
      const third = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Cy", jobType: "roofing" } });
      await roofer.as.mutation(api.marketplace.buy, { leadId: third!._id, organizationId: roofer.organizationId });
      expect(await balance(roofer)).toBe(30000 - 28500);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await sold(t, second!._id)).toMatchObject({ status: "available" });
      const after = await roofer.as.query(api.marketplace.bids, { organizationId: roofer.organizationId });
      expect(after.find((b) => b.leadId === second!._id)?.outcome).toMatch(/Balance too low/);

      // The admin sending a lead by hand also closes its orders.
      await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: rival.organizationId, amount: 300 });
      await rival.as.mutation(api.marketplace.placeBid, { leadId: second!._id, organizationId: rival.organizationId, max: 225 });
      await admin.as.mutation(api.marketplace.assign, { leadId: second!._id, organizationId: rival.organizationId });
      const rivals = await rival.as.query(api.marketplace.bids, { organizationId: rival.organizationId });
      expect(rivals.find((b) => b.leadId === second!._id)).toMatchObject({ status: "lost", outcome: "You bought this lead" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("standing bids and instant awards", () => {
  test("Texas counties and the towns we know", () => {
    expect(TEXAS_COUNTIES).toHaveLength(254);
    expect(new Set(TEXAS_COUNTIES).size).toBe(254);
    expect(countyForTown("Odessa")).toBe("Ector");
    expect(countyForTown("big spring")).toBe("Howard");
    expect(countyForTown("Nowhere")).toBeUndefined();
    expect(normalizeCounty(" midland county ")).toBe("Midland");
    expect(normalizeCounty("Atlantis")).toBe("Atlantis");
  });

  async function market() {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const mio = await signUp(t, "mio@example.com");
    const soco = await signUp(t, "soco@example.com");
    const broke = await signUp(t, "broke@example.com");
    for (const who of [mio, soco]) await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: who.organizationId, amount: 1000 });
    return { t, admin, mio, soco, broke };
  }
  const balance = async (who: { as: any; organizationId: any }) =>
    (await who.as.query(api.marketplace.wallet, { organizationId: who.organizationId })).balanceCents;
  const standing = (who: { as: any; organizationId: any }, county: string, jobType: string, amount: number) =>
    who.as.mutation(api.bids.setStanding, { organizationId: who.organizationId, county, jobType, amount });
  const results = (who: { as: any; organizationId: any }) => who.as.query(api.bids.results, { organizationId: who.organizationId });

  test("a standing bid needs a real county, a trade, $200 or more and the balance to cover it", async () => {
    const { admin, mio, soco, broke } = await market();
    await expect(standing(mio, "Narnia", "landscaping", 250)).rejects.toThrow(/isn't a Texas county/);
    await expect(standing(mio, "Midland", "", 250)).rejects.toThrow(/service type/);
    await expect(standing(mio, "Midland", "landscaping", 150)).rejects.toThrow(/start at \$200/);
    await expect(standing(broke, "Midland", "landscaping", 250)).rejects.toThrow(/Add funds/);
    await expect(soco.as.mutation(api.bids.setStanding, { organizationId: mio.organizationId, county: "Midland", jobType: "landscaping", amount: 250 })).rejects.toThrow(/access/);

    await standing(mio, "midland county", "landscaping", 250);
    await standing(mio, "Midland", "landscaping", 275); // replaces, doesn't duplicate
    await standing(mio, "Ector", "landscaping", 225);
    const mine = await mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId });
    expect(mine.map((b) => [b.county, b.jobType, b.amountCents, b.funded, b.leading, b.contested])).toEqual([
      ["Ector", "landscaping", 22500, true, true, false],
      ["Midland", "landscaping", 27500, true, true, false],
    ]);
    await expect(soco.as.mutation(api.bids.removeStanding, { id: mine[0].id })).rejects.toThrow(/access/);
    await mio.as.mutation(api.bids.removeStanding, { id: mine[0].id });
    expect(await mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId })).toHaveLength(1);
    const overview = await admin.as.query(api.marketplace.companiesOverview, {});
    expect(overview.find((c) => c.id === mio.organizationId)?.standingBids).toEqual([{ county: "Midland", jobType: "landscaping", amountCents: 27500 }]);
  });

  test("a lead with a standing bid is the company's the moment it's listed; one without goes to the Marketplace", async () => {
    const { admin, mio, soco } = await market();
    await standing(mio, "Midland", "landscaping", 250);
    // The town gives the county when the lead has none.
    const lead = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Patricia Nguyen", city: "Midland", jobType: "landscaping", notes: "Sod" } });
    expect(lead).toMatchObject({ county: "Midland", status: "assigned", priceCents: 25000, assignedOrganizationId: mio.organizationId });
    expect(await balance(mio)).toBe(100000 - 25000);
    const theirs = await mio.as.query(api.leads.list, { organizationId: mio.organizationId });
    expect(theirs[0]).toMatchObject({ name: "Patricia Nguyen", pricePaidCents: 25000, source: "FieldQuote Lead", wonVia: "bid" });
    const won = await results(mio);
    expect(won[0]).toMatchObject({ leadId: lead!._id, county: "Midland", won: true, myBidCents: 25000 });
    expect(JSON.stringify(won)).not.toMatch(/Patricia|Nguyen/);
    expect(await results(soco)).toHaveLength(0);

    const roofing = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Rachel Dunn", city: "Midland", jobType: "roofing" } });
    expect(roofing!.status).toBe("available");
    const elsewhere = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Gloria Tran", county: "Martin", jobType: "landscaping" } });
    expect(elsewhere!.status).toBe("available");
    const feed = await mio.as.query(api.marketplace.feed, { organizationId: mio.organizationId });
    expect(feed.map((l) => l.id).sort()).toEqual([roofing!._id, elsewhere!._id].sort());

    // The Leads page's "new leads" count only counts leads in a company's trades:
    // mio's landscaping bid covers Gloria, not the roofing lead; soco has no trades
    // or bids, so nothing; give soco roofing and the roofing lead counts.
    const available = async (who: { as: any; organizationId: any }) =>
      (await who.as.query(api.marketplace.wallet, { organizationId: who.organizationId })).availableLeads;
    expect(await available(mio)).toBe(1);
    expect(await available(soco)).toBe(0);
    await admin.as.mutation(api.marketplace.setCompanyTrades, { organizationId: soco.organizationId, leadTrades: ["roofing"] });
    expect(await available(soco)).toBe(1);

    // The admin sees it sold by bid; the buy-order views ignore award rows.
    const inbox = await admin.as.query(api.marketplace.listInbox, {});
    expect(inbox.available).toHaveLength(2);
    expect(inbox.sold[0]).toMatchObject({ _id: lead!._id, wonBy: "bid", companyName: expect.any(String) });
    expect(await mio.as.query(api.marketplace.bids, { organizationId: mio.organizationId })).toHaveLength(0);
    expect((await mio.as.query(api.marketplace.wallet, { organizationId: mio.organizationId })).standingBids).toBe(1);
  });

  test("the highest bid that can pay wins, ties go to the earlier bid, and losers see why", async () => {
    const { admin, mio, soco, broke } = await market();
    await standing(mio, "Ector", "painting", 250);
    await standing(soco, "Ector", "painting", 250);
    // Broke had money when it bid, then spent it.
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: broke.organizationId, amount: 400 });
    await standing(broke, "Ector", "painting", 400);
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: broke.organizationId, amount: 1 });
    const other = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Spend", city: "Midland", jobType: "roofing" } });
    await broke.as.mutation(api.marketplace.buy, { leadId: other!._id, organizationId: broke.organizationId });
    expect(await balance(broke)).toBe(40100 - 20000);

    // Broke's $400 is highest on paper but unfunded, so it doesn't count; Mio and Soco tie at $250 and Mio bid first.
    const mine = await mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId });
    expect(mine[0]).toMatchObject({ funded: true, leading: true, contested: true });
    const theirs = await soco.as.query(api.bids.listStanding, { organizationId: soco.organizationId });
    expect(theirs[0]).toMatchObject({ funded: true, leading: false, contested: true });
    expect((await broke.as.query(api.bids.listStanding, { organizationId: broke.organizationId }))[0]).toMatchObject({ funded: false, leading: false });

    const lead = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Carlos Benavides", city: "Odessa", jobType: "painting" } });
    expect(lead).toMatchObject({ status: "assigned", priceCents: 25000, assignedOrganizationId: mio.organizationId });
    expect(await balance(mio)).toBe(75000);
    expect(await balance(soco)).toBe(100000);
    expect((await results(soco))[0]).toMatchObject({ won: false, outcome: "Outbid: a higher bid won it" });
    expect((await results(broke))[0].outcome).toMatch(/Balance too low: \$400\.00 needed, \$201\.00 available/);

    // Soco raises its standing bid and now leads; the next lead is Soco's.
    await standing(soco, "Ector", "painting", 300);
    expect((await soco.as.query(api.bids.listStanding, { organizationId: soco.organizationId }))[0].leading).toBe(true);
    expect((await mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId }))[0].leading).toBe(false);
    const next = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Dana Ruiz", city: "Odessa", jobType: "painting" } });
    expect(next).toMatchObject({ status: "assigned", priceCents: 30000, assignedOrganizationId: soco.organizationId });
  });

  test("a lead nobody can pay for goes to the Marketplace, and a legacy round still closes", async () => {
    const { t, admin, mio, soco } = await market();
    await standing(mio, "Howard", "landscaping", 900);
    // Spend down so the bid can't be paid when the lead arrives.
    const filler = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Filler", city: "Midland", jobType: "roofing" } });
    await mio.as.mutation(api.marketplace.buy, { leadId: filler!._id, organizationId: mio.organizationId });
    const lead = await admin.as.mutation(api.marketplace.createLead, { data: { name: "Renee Oliver", city: "Big Spring", jobType: "landscaping" } });
    expect(lead).toMatchObject({ county: "Howard", status: "available" });
    expect((await soco.as.query(api.marketplace.feed, { organizationId: soco.organizationId })).map((l) => l.id)).toContain(lead!._id);
    expect((await results(mio))[0]).toMatchObject({ won: false, outcome: expect.stringMatching(/Balance too low/) });

    // A round scheduled before awards became instant: the highest payable bid wins when it fires.
    const legacy = await t.run(async (ctx) => {
      const lead = (await ctx.db.query("marketplaceLeads").filter((q) => q.eq(q.field("name"), "Renee Oliver")).first())!;
      await ctx.db.patch(lead._id, { status: "bidding", round: { opensAt: "2026-10-18T12:00:00.000Z", closesAt: "2026-10-18T13:00:00.000Z" } });
      const user = (await ctx.db.query("users").first())!;
      for (const [organizationId, maxCents] of [[mio.organizationId, 90000], [soco.organizationId, 30000]] as const)
        await ctx.db.insert("leadBids", { marketplaceLeadId: lead._id, organizationId, kind: "round", maxCents, status: "open", createdBy: user._id, createdAt: "2026-10-18T12:00:00.000Z" });
      return lead._id;
    });
    await t.mutation(internal.bids.closeRound, { leadId: legacy });
    const sold = await t.run(async (ctx) => ctx.db.get(legacy));
    expect(sold).toMatchObject({ status: "assigned", priceCents: 30000, assignedOrganizationId: soco.organizationId });
    expect((await results(mio))[0]).toMatchObject({ won: false, outcome: expect.stringMatching(/Balance too low/) });
    expect((await results(soco))[0]).toMatchObject({ won: true, myBidCents: 30000 });
  });
});
