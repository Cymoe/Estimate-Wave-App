// Shared with the web app (the Purchase orders tab), so keep imports to plain files.
import { workTypeOf } from "./workTypes";

/**
 * Purchase orders, built from a job's lines (a package's, a template's or an
 * estimate's): each line goes to the supplier for its materials and the sub
 * for its labor, by its type of work, at an estimated cost. Labor the
 * company does with its own crew (by its trade) gets no PO, and permits are
 * paid to the city, not ordered.
 */

export type PoKind = "material" | "labor";
export interface PoLine {
  description: string;
  quantity: number;
  unit?: string;
  unitCost: number;
  kind: PoKind;
}
export interface BuiltOrder {
  title: string;
  lines: PoLine[];
}
/** A job line as the builder reads it: what it is, how many, and the client's price each. */
export interface SourceLine {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
}

/** What the company pays, as a share of the client's price: a typical 40% gross margin. */
export const COST_RATIO = 0.6;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Who each type of work is bought from: the supplier for its materials, the
 * sub for its labor, and how much of its cost is materials. `oneVendor`: the
 * sub usually supplies and installs (counters, HVAC), so a company that subs
 * it out gets one PO to the sub; one that does it itself buys from the supplier.
 */
const VENDORS: Record<
  string,
  {
    material?: string;
    labor?: string;
    materialShare: number;
    oneVendor?: boolean;
  }
> = {
  Demolition: { labor: "Demo & haul-off crew", materialShare: 0 },
  "Cleanup & Haul-off": {
    material: "Dumpster & disposal",
    labor: "Dumpster & disposal",
    materialShare: 1,
    oneVendor: true,
  },
  "Service Calls": { labor: "Service technician", materialShare: 0 },
  Restoration: {
    material: "Restoration supply",
    labor: "Restoration contractor",
    materialShare: 0.4,
    oneVendor: true,
  },
  "Fire Protection": {
    material: "Fire protection supply",
    labor: "Fire protection contractor",
    materialShare: 0.5,
    oneVendor: true,
  },
  "Outdoor Kitchens": {
    material: "Grill & outdoor kitchen supplier",
    labor: "Outdoor kitchen installer",
    materialShare: 0.7,
  },
  Framing: {
    material: "Lumber yard",
    labor: "Framing crew",
    materialShare: 0.5,
  },
  Insulation: {
    material: "Insulation supply",
    labor: "Insulation contractor",
    materialShare: 0.5,
    oneVendor: true,
  },
  "Decks & Patios": {
    material: "Lumber yard",
    labor: "Deck & patio crew",
    materialShare: 0.55,
  },
  Hardscape: {
    material: "Hardscape supply",
    labor: "Hardscape crew",
    materialShare: 0.5,
  },
  Roofing: {
    material: "Roofing supply",
    labor: "Roofing crew",
    materialShare: 0.45,
  },
  "Garage Doors": {
    material: "Garage door distributor",
    labor: "Garage door company",
    materialShare: 0.65,
    oneVendor: true,
  },
  Solar: {
    material: "Solar distributor",
    labor: "Solar installer",
    materialShare: 0.7,
  },
  HVAC: {
    material: "HVAC distributor",
    labor: "HVAC contractor",
    materialShare: 0.55,
    oneVendor: true,
  },
  "Cabinets & Vanities": {
    material: "Cabinet supplier",
    labor: "Cabinet installer",
    materialShare: 0.75,
  },
  Electrical: {
    material: "Electrical supply house",
    labor: "Electrician",
    materialShare: 0.35,
  },
  Plumbing: {
    material: "Plumbing supply",
    labor: "Plumber",
    materialShare: 0.4,
  },
  "Site Work": {
    material: "Aggregate & base supplier",
    labor: "Excavation & site work",
    materialShare: 0.3,
    oneVendor: true,
  },
  Concrete: {
    material: "Concrete supplier",
    labor: "Concrete crew",
    materialShare: 0.45,
  },
  Masonry: { material: "Masonry supply", labor: "Mason", materialShare: 0.45 },
  Countertops: {
    material: "Countertop fabricator",
    labor: "Countertop fabricator",
    materialShare: 0.7,
    oneVendor: true,
  },
  Tile: { material: "Tile supplier", labor: "Tile setter", materialShare: 0.4 },
  "Fixtures & Appliances": {
    material: "Plumbing supply",
    labor: "Plumber",
    materialShare: 0.7,
  },
  Drywall: {
    material: "Lumber yard",
    labor: "Drywall & paint crew",
    materialShare: 0.3,
  },
  "Windows & Doors": {
    material: "Window & door supplier",
    labor: "Window & door installer",
    materialShare: 0.65,
  },
  Painting: {
    material: "Paint store",
    labor: "Drywall & paint crew",
    materialShare: 0.2,
  },
  Flooring: {
    material: "Flooring supplier",
    labor: "Flooring installer",
    materialShare: 0.5,
  },
  "Siding & Exterior": {
    material: "Siding supplier",
    labor: "Siding crew",
    materialShare: 0.45,
  },
  "Landscaping & Irrigation": {
    material: "Nursery & landscape supply",
    labor: "Landscape crew",
    materialShare: 0.45,
  },
  "Trim & Carpentry": {
    material: "Lumber yard",
    labor: "Finish carpenter",
    materialShare: 0.4,
  },
  Fencing: {
    material: "Fence supply",
    labor: "Fence crew",
    materialShare: 0.5,
  },
  "Labor & Handyman": {
    material: "Materials",
    labor: "General labor",
    materialShare: 0,
  },
};
const FALLBACK = {
  material: "Materials",
  labor: "General labor",
  materialShare: 0.5,
};

// Every company does its own demo, service calls, hourly labor and work that names no trade.
const ALWAYS_IN_HOUSE = [
  "Demolition",
  "Service Calls",
  "Labor & Handyman",
  "General",
];

/**
 * In some trades a line's wording reads as another trade's work: a painter's
 * "cabinet painting" is painting, a garage door company's door is a garage
 * door, a landscaper's pavers are hardscape.
 */
const TRADE_REMAP: Record<string, Record<string, string>> = {
  painting: {
    "Windows & Doors": "Painting",
    "Cabinets & Vanities": "Painting",
    Roofing: "Painting",
    "Trim & Carpentry": "Painting",
    "Siding & Exterior": "Painting",
  },
  "garage-door": { "Windows & Doors": "Garage Doors" },
  "fence-services": { Framing: "Fencing", "Trim & Carpentry": "Fencing" },
  flooring: { Painting: "Flooring" },
  hvac: { Painting: "HVAC" },
  siding: { Roofing: "Siding & Exterior" },
  landscaping: { "Decks & Patios": "Hardscape" },
};
const GENERAL = [
  "Framing",
  "Trim & Carpentry",
  "Cleanup & Haul-off",
  "General",
];
/**
 * The work a company in each trade does with its own crew, so its labor gets
 * no PO (an electrician's panel upgrade orders the panel, not an electrician).
 * "*" is all of it.
 */
const IN_HOUSE: Record<string, string[] | "*"> = {
  "general-construction": GENERAL,
  "residential-construction": GENERAL,
  "commercial-construction": GENERAL,
  "outdoor-construction": [...GENERAL, "Decks & Patios"],
  "kitchen-remodeling": GENERAL,
  "bathroom-remodeling": GENERAL,
  electrical: ["Electrical"],
  plumbing: ["Plumbing", "Fixtures & Appliances"],
  hvac: ["HVAC"],
  roofing: ["Roofing", "Cleanup & Haul-off"],
  flooring: ["Flooring", "Trim & Carpentry"],
  landscaping: ["Landscaping & Irrigation", "Hardscape", "Site Work"],
  solar: ["Solar", "Electrical"],
  handyman: "*",
  "garage-door": ["Garage Doors"],
  "fence-services": ["Fencing"],
  painting: ["Painting", "Drywall"],
  drywall: ["Drywall", "Painting"],
  concrete: ["Concrete", "Site Work", "Masonry"],
  tiling: ["Tile", "Flooring"],
  siding: ["Siding & Exterior", "Trim & Carpentry", "Painting"],
  "window-door": ["Windows & Doors", "Trim & Carpentry"],
};

function inHouse(trade: string | undefined, workType: string): boolean {
  if (ALWAYS_IN_HOUSE.includes(workType)) return true;
  const own = IN_HOUSE[trade ?? ""] ?? GENERAL;
  return own === "*" || own.includes(workType);
}

// Wording that says a line is both the thing and putting it in, and what to strip to name just the thing.
const SUPPLY_AND_INSTALL =
  /,?\s*(supplied and installed|fabricated and installed|supplied and erected|labor and (material|wire)|rough and finish|hung and finished|installed|built)\b/i;
// Labor alone: taking things out, hooking up, service and upkeep, an hourly or per-visit charge.
const LABOR_ONLY =
  /\b(demo|haul[- ]?off|tear[- ]?off|removal|remove|hookup|installation labor|^install\b|install:|service call|trip charge|diagnos|tune-up|startup|mow|trimming|weeding|move and reset|seal and balance|cable machine|camera inspection)\b/i;
const MATERIAL_ONLY = /\ballowance\b/i;

/** Material, labor or both, from the line's wording and unit. */
function kindsOf(line: SourceLine): PoKind[] {
  const text = line.description;
  if (line.unit === "allowance" || MATERIAL_ONLY.test(text))
    return ["material"];
  if (line.unit === "hour" || line.unit === "visit" || LABOR_ONLY.test(text))
    return ["labor"];
  if (SUPPLY_AND_INSTALL.test(text)) return ["material", "labor"];
  // A product counted by the piece or sheet, with no install wording, is the thing itself.
  if (line.unit === "each" || line.unit === "sheet") return ["material"];
  // A lump sum or measured scope (rough plumbing, framing, 300 sf of drywall) is a trade's materials and labor.
  return ["material", "labor"];
}

/** "Semi-custom cabinets, supplied and installed" → "Semi-custom cabinets". */
const thingOf = (text: string) => text.replace(SUPPLY_AND_INSTALL, "").trim();
const lowerFirst = (text: string) =>
  /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;

/** An estimate line's unit, read back from the ", per sf" its description carries (see packageItems). */
export function splitUnit(description: string): {
  description: string;
  unit?: string;
} {
  const match = description.match(/^(.*), per ([a-z]+)$/i);
  return match ? { description: match[1], unit: match[2] } : { description };
}

/**
 * The purchase orders for a job's lines: one per supplier or sub, in the
 * order their first line comes, each line at its estimated cost.
 */
export function buildOrders(lines: SourceLine[], trade?: string): BuiltOrder[] {
  const orders = new Map<string, PoLine[]>();
  const add = (title: string, line: PoLine) => {
    if (line.unitCost <= 0 && line.quantity <= 0) return;
    const list = orders.get(title) ?? [];
    list.push(line);
    orders.set(title, list);
  };

  for (const source of lines) {
    const read = workTypeOf(source.description);
    const workType = TRADE_REMAP[trade ?? ""]?.[read] ?? read;
    if (workType === "Permits & Fees") continue;
    const total = source.quantity * source.unitPrice;
    if (!(total > 0) || !(source.quantity > 0)) continue;
    const vendors: {
      material?: string;
      labor?: string;
      materialShare: number;
      oneVendor?: boolean;
    } = VENDORS[workType] ?? FALLBACK;
    const cost = total * COST_RATIO;
    const kinds = kindsOf(source);
    const both = kinds.length === 2;
    const ownCrew = inHouse(trade, workType);
    const quantity = source.quantity;
    const unit =
      source.unit && !["job", "allowance"].includes(source.unit)
        ? source.unit
        : undefined;
    const thing = thingOf(source.description) || source.description;
    const installs = SUPPLY_AND_INSTALL.test(source.description);

    // A sub who supplies and installs (counters, HVAC): one line to them for the lot.
    if (both && vendors.oneVendor && !ownCrew && vendors.labor) {
      add(vendors.labor, {
        description: source.description,
        quantity,
        unit,
        unitCost: round2(cost / quantity),
        kind: "labor",
      });
      continue;
    }
    for (const kind of kinds) {
      // The company's own crew does the labor: no PO for it (its materials are still bought).
      if (kind === "labor" && ownCrew) continue;
      const share = !both
        ? 1
        : kind === "material"
          ? vendors.materialShare
          : 1 - vendors.materialShare;
      if (share <= 0) continue;
      const title =
        (kind === "material" ? vendors.material : vendors.labor) ??
        (kind === "material" ? FALLBACK.material : FALLBACK.labor);
      // Split across two POs, each says which half it is; with the labor in-house, the materials are just the thing.
      const description = !both
        ? source.description
        : kind === "material"
          ? installs
            ? thing
            : ownCrew
              ? source.description
              : `${source.description} (materials)`
          : installs
            ? `Install ${lowerFirst(thing)}`
            : `${source.description} (labor)`;
      add(title, {
        description,
        quantity,
        unit,
        unitCost: round2((cost * share) / quantity),
        kind,
      });
    }
  }
  return [...orders.entries()].map(([title, list]) => ({ title, lines: list }));
}

/** A PO's total: what its lines cost. */
export const orderTotal = (
  lines: Array<{ quantity: number; unitCost: number }>,
) =>
  round2(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
