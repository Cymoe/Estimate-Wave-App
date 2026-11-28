import { describe, expect, test } from "vitest";
import { BUILT_IN_PACKAGES } from "./catalog/packages";
import { WORK_TYPE_NAMES, tradeLabel, workTypeOf } from "./lib/workTypes";

describe("type of work from a line's wording", () => {
  test("a bathroom remodel reads as its parts, not one lump", () => {
    const lines: Array<[string, string]> = [
      ["Demo to studs and haul-off", "Demolition"],
      ["Rough plumbing: relocate or replace valves, drain and supplies", "Plumbing"],
      ["Electrical: GFCI outlets, vanity light and exhaust fan", "Electrical"],
      ["Cement board and waterproofing", "Tile"],
      ["Wall tile to ceiling, supplied and installed", "Tile"],
      ["Vanity with top, faucet and mirror, installed", "Cabinets & Vanities"],
      ["Toilet, installed", "Fixtures & Appliances"],
      ["Drywall, prime and paint", "Drywall"],
      ["Permit and inspections", "Permits & Fees"],
    ];
    for (const [line, type] of lines) expect([line, workTypeOf(line)]).toEqual([line, type]);
  });

  test("lines that name no work fall back to the trade, then to General", () => {
    expect(workTypeOf("Materials allowance", "Drywall")).toBe("Drywall");
    expect(workTypeOf("Materials allowance")).toBe("General");
    expect(tradeLabel("kitchen-remodeling")).toBe("Kitchen Remodeling");
  });

  test("near misses go to the right place", () => {
    expect(workTypeOf("Paint and supplies")).toBe("Painting");
    expect(workTypeOf("Shrub trimming and bed weeding")).toBe("Landscaping & Irrigation");
    expect(workTypeOf("Fire sprinkler modifications")).toBe("Fire Protection");
    expect(workTypeOf("Camera inspection")).toBe("Plumbing");
    expect(workTypeOf("Registers and grilles")).toBe("HVAC");
    expect(workTypeOf("Vinyl sliding patio door, supplied and installed")).toBe("Windows & Doors");
  });

  test("every built-in package line gets a type of work or its package's trade", () => {
    const unplaced = BUILT_IN_PACKAGES.flatMap((p) => p.lines.map((l) => workTypeOf(l.description, tradeLabel(p.trade)))).filter(
      (t) => t === "General",
    );
    expect(unplaced).toEqual([]);
  });

  test("the editor's list names each type once, in order", () => {
    expect(new Set(WORK_TYPE_NAMES).size).toBe(WORK_TYPE_NAMES.length);
    expect([...WORK_TYPE_NAMES].sort()).toEqual(WORK_TYPE_NAMES);
  });
});
