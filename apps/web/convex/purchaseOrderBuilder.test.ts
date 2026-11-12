import { describe, expect, test } from "vitest";
import { BUILT_IN_PACKAGES, findPackage } from "./catalog/packages";
import {
  buildOrders,
  COST_RATIO,
  orderTotal,
  splitUnit,
} from "./lib/purchaseOrders";

const linesOf = (id: string) => {
  const p = findPackage(id)!;
  return {
    p,
    lines: p.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
    })),
  };
};
const titles = (orders: ReturnType<typeof buildOrders>) =>
  orders.map((o) => o.title);

describe("pre-built purchase orders", () => {
  test("a general contractor's kitchen: a PO per supplier and per sub, no permit, no PO for its own demo", () => {
    const { p, lines } = linesOf(
      "general-construction/remodel/kitchen-remodel",
    );
    const orders = buildOrders(lines, p.trade);
    expect(titles(orders)).toEqual([
      "Electrical supply house",
      "Electrician",
      "Cabinet supplier",
      "Cabinet installer",
      "Countertop fabricator",
      "Tile supplier",
      "Tile setter",
      "Plumbing supply",
      "Plumber",
      "Flooring supplier",
      "Flooring installer",
      "Lumber yard",
      "Drywall & paint crew",
    ]);
    const text = JSON.stringify(orders);
    expect(text).not.toMatch(/permit/i);
    expect(text).not.toMatch(/demo/i);
    // Supplied and installed: the thing to the supplier, its install to the sub, with the unit.
    expect(orders.find((o) => o.title === "Cabinet supplier")!.lines).toEqual([
      {
        description: "Semi-custom cabinets",
        quantity: 22,
        unit: "lf",
        unitCost: 173.25,
        kind: "material",
      },
    ]);
    expect(orders.find((o) => o.title === "Cabinet installer")!.lines).toEqual([
      {
        description: "Install semi-custom cabinets",
        quantity: 22,
        unit: "lf",
        unitCost: 57.75,
        kind: "labor",
      },
    ]);
    // One vendor fabricates and installs counters.
    expect(
      orders.find((o) => o.title === "Countertop fabricator")!.lines,
    ).toHaveLength(1);
    // Estimated at 60% of the client's price, less the permit and the in-house demo.
    const priced = lines
      .filter((l) => !/permit|demo/i.test(l.description))
      .reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    const total = orders.reduce((sum, o) => sum + orderTotal(o.lines), 0);
    expect(total).toBeCloseTo(priced * COST_RATIO, 0);
  });

  test("an electrician's panel upgrade orders the panel from the supply house, and no electrician", () => {
    const { p, lines } = linesOf("electrical/panel-upgrade/200a-panel-upgrade");
    const orders = buildOrders(lines, p.trade);
    expect(titles(orders)).toEqual(["Electrical supply house"]);
    expect(JSON.stringify(orders)).not.toMatch(/"kind":"labor"/);
  });

  test("an HVAC company buys the equipment from the distributor; a general contractor subs it to the HVAC contractor", () => {
    const hvac = linesOf("hvac/system-replacement/3-ton-split-system");
    expect(titles(buildOrders(hvac.lines, hvac.p.trade))).toEqual([
      "HVAC distributor",
    ]);
    const gc = linesOf("general-construction/remodel/basement-finish");
    expect(titles(buildOrders(gc.lines, gc.p.trade))).toContain(
      "HVAC contractor",
    );
  });

  test("trades read their own wording: a painter's cabinet repaint is paint, a landscaper's pavers are hardscape", () => {
    const paint = linesOf("painting/cabinets-and-trim/kitchen-cabinet-repaint");
    expect(titles(buildOrders(paint.lines, paint.p.trade))).not.toContain(
      "Cabinet supplier",
    );
    const pavers = linesOf("landscaping/hardscape/paver-patio");
    expect(titles(buildOrders(pavers.lines, pavers.p.trade))).toContain(
      "Hardscape supply",
    );
  });

  test("every built-in package builds, with no empty PO and no zero cost", () => {
    expect(BUILT_IN_PACKAGES.length).toBeGreaterThan(100);
    for (const p of BUILT_IN_PACKAGES) {
      const orders = buildOrders(
        p.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
        })),
        p.trade,
      );
      for (const order of orders) {
        expect(order.lines.length, `${p.id} ${order.title}`).toBeGreaterThan(0);
        expect(
          orderTotal(order.lines),
          `${p.id} ${order.title}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  test("reads the unit back from an estimate line", () => {
    expect(splitUnit("Wall tile, supplied and installed, per sf")).toEqual({
      description: "Wall tile, supplied and installed",
      unit: "sf",
    });
    expect(splitUnit("Toilet, installed")).toEqual({
      description: "Toilet, installed",
    });
  });
});
