/**
 * Runs the React app's data layer (src/lib/api.ts and the services built on
 * it) against the real Convex functions, to check the screens get data in
 * the shape they expect.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { STARTER_COST_CODES, STARTER_ITEMS } from "./catalog/starterCatalog";
import { setup, signUp } from "./test.setup";

vi.mock("../src/lib/convex", () => ({ convex: {} }));

const { setConvexClient, clientsAPI, estimatesAPI, costCodesAPI, organizationsAPI, APIError } = await import(
  "../src/lib/api"
);
const { MongoEstimateService } = await import("../src/services/MongoEstimateService");
const { MongoLineItemService } = await import("../src/services/MongoLineItemService");
const { EstimateService } = await import("../src/services/EstimateService");
const { templatesAPI } = await import("../src/lib/api");

let t: ReturnType<typeof setup>;

beforeEach(() => {
  t = setup();
});

describe("src/lib/api.ts on Convex", () => {
  test("returns documents with both _id and id", async () => {
    const { as, organizationId } = await signUp(t, "a@example.com");
    setConvexClient(as);

    const client = await clientsAPI.create({ organizationId, name: "Smith Residence", email: "s@example.com" });
    expect(client.id).toBe(client._id);
    const [listed] = await clientsAPI.list(organizationId);
    expect(listed).toMatchObject({ id: client._id, name: "Smith Residence" });

    const [org] = await organizationsAPI.list();
    expect(org.id).toBe(organizationId);
  });

  test("maps server errors to APIError statuses", async () => {
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    setConvexClient(alice.as);
    const client = await clientsAPI.create({ organizationId: alice.organizationId, name: "Private" });

    setConvexClient(bob.as);
    await expect(clientsAPI.getById(client._id)).rejects.toMatchObject({ name: "APIError", status: 404 });
    await expect(clientsAPI.list(alice.organizationId)).rejects.toMatchObject({ status: 403 });
    await expect(clientsAPI.create({ name: "No org" })).rejects.toBeInstanceOf(APIError);

    setConvexClient(t);
    await expect(clientsAPI.list(alice.organizationId)).rejects.toMatchObject({ status: 401 });
  });

  test("Sales Mode estimate flow returns the legacy snake_case shape", async () => {
    const { as, userId, organizationId } = await signUp(t, "a@example.com");
    setConvexClient(as);

    // Same payload SalesMode.tsx sends.
    const estimate = await MongoEstimateService.create({
      organization_id: organizationId,
      user_id: "ignored-by-server",
      status: "draft",
      issue_date: "2026-10-06",
      title: "Roof Replacement - Asphalt",
      description: "Standard asphalt shingles",
      subtotal: 18500,
      tax_rate: 0,
      tax_amount: 0,
      total_amount: 18500,
      items: [
        { description: "Standard asphalt shingles", quantity: 1, unit_price: 18000, total_price: 18000, display_order: 0 },
        { description: "Gutter guards", quantity: 1, unit_price: 500, total_price: 500, display_order: 1 },
      ],
    });

    expect(estimate).toMatchObject({
      id: expect.any(String),
      user_id: userId,
      organization_id: organizationId,
      estimate_number: expect.stringMatching(/^EST-/),
      status: "draft",
      issue_date: "2026-10-06",
      subtotal: 18500,
      total_amount: 18500,
    });
    expect(estimate.items).toHaveLength(2);
    expect(estimate.items[1]).toMatchObject({ id: expect.any(String), unit_price: 500, total_price: 500 });

    const [listed] = await MongoEstimateService.list(organizationId);
    expect(listed.id).toBe(estimate.id);

    const signed = await MongoEstimateService.addSignature(estimate.id, "Pat Customer");
    expect(signed).toMatchObject({ status: "accepted", client_signature: "Pat Customer" });

    expect(await estimatesAPI.list(organizationId, { status: "accepted" })).toHaveLength(1);
  });

  test("Price Book reads shared items with cost codes and Redline/Cap pricing", async () => {
    await t.action(internal.seed.catalog, {});
    const { as, organizationId } = await signUp(t, "a@example.com");
    setConvexClient(as);

    const costCodes = await costCodesAPI.list({ isActive: true });
    expect(costCodes).toHaveLength(STARTER_COST_CODES.length);
    expect(costCodes.find((cc: { code: string }) => cc.code === "RF500")).toMatchObject({
      name: "Roofing Materials",
      industry: { id: "roofing", name: "Roofing" },
    });

    const items = await MongoLineItemService.list(organizationId);
    expect(items).toHaveLength(STARTER_ITEMS.length);
    const standard = items.find((item) => item.name === "Shingle Installation - Standard")!;
    expect(standard.id).toEqual(expect.any(String));
    expect(MongoLineItemService.calculatePrice(standard, 0.5)).toBe(250);
    expect(MongoLineItemService.isPriceInBounds(standard, 310)).toBe(false);
  });

  test("EstimateService: the estimate screens create, list, edit and invoice estimates", async () => {
    const { as, organizationId } = await signUp(t, "a@example.com");
    setConvexClient(as);
    const client = await clientsAPI.create({ organizationId, name: "Smith Residence", companyName: "Smith LLC" });

    const created = await EstimateService.create({
      organization_id: organizationId,
      client_id: client._id,
      title: "Kitchen",
      status: "draft",
      issue_date: "2026-10-01",
      expiry_date: "",
      subtotal: 0,
      total_amount: 0,
      tax_rate: 10,
      items: [
        { description: "Cabinets", quantity: 2, unit_price: 500, total_price: 1000 },
        { product_name: "Paint", quantity: 3, price: 50 } as never,
      ],
    });
    expect(created).toMatchObject({ subtotal: 1150, tax_amount: 115, total_amount: 1265, status: "draft" });
    expect(created.estimate_number).toMatch(/^EST-/);

    const [listed] = await EstimateService.list(organizationId);
    expect(listed.client).toMatchObject({ id: client._id, name: "Smith Residence", company_name: "Smith LLC" });
    expect(listed.items?.map((item) => item.description)).toEqual(["Cabinets", "Paint"]);

    const edited = await EstimateService.update(created.id!, {
      items: [{ description: "Cabinets", quantity: 1, unit_price: 500, total_price: 500 }],
    });
    expect(edited.subtotal).toBe(500);

    await expect(EstimateService.convertToInvoice(created.id!)).rejects.toThrow(/accepted/);
    await EstimateService.updateStatus(created.id!, "accepted");
    const invoiceId = await EstimateService.convertToInvoice(created.id!, 50);
    const [invoice] = await as.query(api.invoices.list, { organizationId });
    expect(invoice._id).toBe(invoiceId);
    expect(invoice).toMatchObject({ estimateId: created.id, subtotal: 250, totalAmount: 275 });
  });

  test("templates keep their items and totals", async () => {
    const { as, organizationId } = await signUp(t, "a@example.com");
    setConvexClient(as);
    await templatesAPI.create(organizationId, {
      name: "Roof tune-up",
      items: [{ name: "Inspection", quantity: 1, unitPrice: 175 }],
    });
    const [template] = await templatesAPI.list(organizationId);
    expect(template).toMatchObject({ id: template._id, name: "Roof tune-up", total: 175 });
  });
});
