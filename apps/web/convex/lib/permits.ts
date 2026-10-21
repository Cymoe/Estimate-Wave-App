// Building permits from the City of Midland's public ArcGIS layer, mapped to
// the trades that do that kind of work. Pure functions: the action in
// permits.ts fetches, these decide what each permit means.

/** Where Midland publishes its permits (the "Developer Permits" dashboard sits on this layer). */
export const MIDLAND = {
  source: "midland",
  county: "Midland",
  city: "Midland",
  layer:
    "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/Permits/FeatureServer/0",
} as const;

/** The layer's fields we read. */
export const PERMIT_FIELDS = [
  "PermitNumber",
  "PermitStatus",
  "Name",
  "PermitWorkClass",
  "Description",
  "Address",
  "ApplyDate",
  "DateIssued",
  "URL",
] as const;

export type PermitRow = {
  permitNumber: string;
  name: string;
  workClass?: string;
  description?: string;
  status?: string;
  address?: string;
  appliedAt: string;
  issuedAt?: string;
  lat?: number;
  lng?: number;
  residential?: boolean;
  trades: string[];
  url?: string;
};

const BUILDING = ["general-construction", "concrete", "roofing", "drywall", "window-door"];
const REPAIR = ["general-construction", "handyman", "painting", "drywall"];

/**
 * Which trades a permit is work for; empty means it isn't building work we
 * list (signs, events, oil and gas, right of way).
 */
export function tradesForPermit(name: string, workClass?: string | null): string[] {
  const n = name.trim();
  const w = (workClass ?? "").trim();
  if (n === "Residential - Building" || n === "Commercial - Building") {
    if (w === "Solar") return ["electrical", "roofing"];
    if (w === "Alteration & Repair") return REPAIR;
    if (w === "Parking Lot") return ["concrete"];
    return BUILDING;
  }
  if (n.startsWith("Electrical")) return ["electrical"];
  if (n.startsWith("Plumbing") || n.startsWith("Water & Sewer") || n === "Water Well") return ["plumbing"];
  if (n.startsWith("Mechanical")) return ["hvac"];
  if (n === "Pool") return ["outdoor-construction", "concrete"];
  if (n === "Fence" || n === "Irrigation") return ["outdoor-construction"];
  if (n === "Driveway/Sidewalk" || n === "Parking Lot - Standalone") return ["concrete", "outdoor-construction"];
  if (n === "Demolition" || n === "Manufactured Home") return ["general-construction"];
  return [];
}

/** Residential or commercial, when the permit says. */
export function residentialFor(name: string, workClass?: string | null): boolean | undefined {
  const text = `${name} ${workClass ?? ""}`;
  if (/Residential|Single Family|Duplex|Multi Family|Detached Accessory|Mobile Home|Modular Home|MH Mechanical/i.test(text))
    return true;
  if (/Commercial/i.test(text)) return false;
  return undefined;
}

type Feature = {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number } | null;
};

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};
const when = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : undefined;

/** The layer's features as permit rows, keeping only building work we list. */
export function rowsToPermits(features: Feature[]): PermitRow[] {
  const rows: PermitRow[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const permitNumber = text(a.PermitNumber);
    const name = text(a.Name);
    const appliedAt = when(a.ApplyDate);
    if (!permitNumber || !name || !appliedAt) continue;
    const workClass = text(a.PermitWorkClass);
    const trades = tradesForPermit(name, workClass);
    if (trades.length === 0) continue;
    const lat = typeof f.geometry?.y === "number" ? f.geometry.y : undefined;
    const lng = typeof f.geometry?.x === "number" ? f.geometry.x : undefined;
    rows.push({
      permitNumber,
      name,
      workClass,
      description: text(a.Description),
      status: text(a.PermitStatus),
      address: text(a.Address),
      appliedAt,
      issuedAt: when(a.DateIssued),
      lat,
      lng,
      residential: residentialFor(name, workClass),
      trades,
      url: text(a.URL),
    });
  }
  return rows;
}

/** A month key, "2026-10", for grouping. */
export const monthOf = (iso: string) => iso.slice(0, 7);
