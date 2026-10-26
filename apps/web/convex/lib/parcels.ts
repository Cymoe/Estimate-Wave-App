// Who owns each home in Midland: the appraisal district's roll, as the city
// publishes it on its public ArcGIS (the same org as the permit feed). Owner
// name, mailing address, value and deed date; no phone numbers. Pure
// functions: parcels.ts fetches, these decide what each row means. Owner
// names are only ever shown to Tolliver staff and callers.

export const MIDLAND_PARCELS = {
  source: "midland-parcels",
  county: "Midland",
  layer:
    "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/ParcelOwnership/FeatureServer/3",
} as const;

/** Bumped when what a stored parcel holds changes: the deploy then reads the roll again instead of skipping. */
export const PARCEL_VERSION = 3;

/** The appraisal district's residential use codes: single-family, mobile home, condo and townhome. */
export const RESIDENTIAL_USE = ["A1", "A2", "A3", "A4", "A5"] as const;

export const PARCEL_FIELDS = [
  "SU_NUM",
  "PIN_1",
  "GOV_USE_CO",
  "SITE_NO",
  "STREET_DIR",
  "STREET",
  "OWNER",
  "OWNER2",
  "ADDRESS_1",
  "CITY_1",
  "STATE_1",
  "ZIP",
  "MKT_VALUE",
  "BLDG_VALUE",
  "DEED_DATE",
] as const;

export type ParcelRow = {
  cadId: string;
  pin?: string;
  useCode: string;
  siteAddress: string;
  addressKey: string;
  looseKey: string;
  street?: string;
  owner: string;
  owner2?: string;
  mailing: { address?: string; city?: string; state?: string; zip?: string };
  ownerOccupied: boolean;
  companyOwned: boolean;
  marketValueCents?: number;
  buildingValueCents?: number;
  deedDate?: string;
};

// One spelling for each street word, so "4729 COUNTRY CLUB Drive" on a
// permit and "4729 COUNTRY CLUB DR" on the roll are the same house.
const WORDS: Record<string, string> = {
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  AVENUE: "AV", AVE: "AV", DRIVE: "DR", STREET: "ST", LANE: "LN", COURT: "CT", PLACE: "PL",
  ROAD: "RD", TRAIL: "TRL", TR: "TRL", CIRCLE: "CIR", BOULEVARD: "BLVD", HIGHWAY: "HWY",
  PARKWAY: "PKWY", TERRACE: "TER", COVE: "CV", LOOP: "LP",
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** One normal form for an address line: upper case, no unit or punctuation, short street words, no leading zeros. */
export function addressKey(address: string | undefined): string {
  const line = (address ?? "").split(",")[0].toUpperCase();
  const cut = line.replace(/\s+(APT|UNIT|STE|SUITE|#).*$/, "").replace(/[.#]/g, " ");
  return squash(cut)
    .split(" ")
    .map((w) => (/^\d+$/.test(w) ? String(Number(w)) : (WORDS[w] ?? w)))
    .join(" ");
}

const DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const SUFFIXES = new Set(["DR", "ST", "AV", "LN", "CT", "PL", "RD", "TRL", "CIR", "BLVD", "HWY", "PKWY", "TER", "CV", "LP", "WAY"]);

/**
 * The address key without directions or the street's suffix, for records
 * that leave them off: a code case's "807 WEATHERFORD" and the roll's
 * "807 W WEATHERFORD AV" both give "807 WEATHERFORD". "COUNTY RD 1109"
 * keeps its RD, since it isn't at the end.
 */
export function looseKey(address: string | undefined): string {
  const words = addressKey(address)
    .split(" ")
    .filter((w, i, all) => !(DIRECTIONS.has(w) && all.length > 2 && (i === 1 || i === all.length - 1)));
  if (words.length > 2 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/** The owner as stored: spaces squashed and a trailing "&" dropped (the roll's "MATHES JOE &"). */
export const ownerOf = (value: unknown): string | undefined => text(value)?.replace(/\s*&$/, "");

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = squash(value);
  return trimmed || undefined;
};
const cents = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : undefined;

/** The street part of an address key ("4729 COUNTRY CLUB DR" → "COUNTRY CLUB DR"): homes and permits on one street share it. */
export function streetKey(address: string | undefined): string | undefined {
  const street = addressKey(address).replace(/^\d+[A-Z]?\s+/, "");
  return street && !/^\d+$/.test(street) ? street : undefined;
}

/** The house's own address from the roll's site number, direction and street ("COUNTY RD 01109" → "COUNTY RD 1109"). */
export function siteAddress(a: Record<string, unknown>): string | undefined {
  const number = typeof a.SITE_NO === "number" && a.SITE_NO > 0 ? String(a.SITE_NO) : undefined;
  const street = text(a.STREET)?.replace(/\b0+(\d)/g, "$1");
  if (!number || !street) return undefined;
  return squash([number, text(a.STREET_DIR), street].filter(Boolean).join(" "));
}

/**
 * Owned by a business, church or government rather than a person. A family
 * or living trust is a person's home, so it isn't one: whether they live
 * there is ownerOccupied's call.
 */
export function isCompanyOwner(owner: string): boolean {
  return /\b(LLC|L L C|INC|LTD|LP|L P|CORP|CORPORATION|CO|COMPANY|HOMES?|BUILDERS?|PROPERTIES|PROPERTY|INVESTMENTS?|HOLDINGS|PARTNERS|PARTNERSHIP|CHURCH|MINISTRIES|BANK|MORTGAGE|CITY OF|COUNTY OF|STATE OF|AUTHORITY|ASSOCIATION|ASSN|HOA|REALTY|DEVELOPMENT|RENTALS?)\b/.test(
    owner.toUpperCase(),
  );
}

/** The owner's mailing address is the house itself: they live there. */
export function ownerOccupied(site: string, mailing: string | undefined): boolean {
  if (!mailing) return false;
  const a = addressKey(site).split(" ");
  const b = addressKey(mailing).split(" ");
  // House number and the first word of the street must match; the roll often drops the direction.
  const strip = (w: string[]) => w.filter((x) => !["N", "S", "E", "W"].includes(x));
  const [sa, sb] = [strip(a), strip(b)];
  return sa.length >= 2 && sa[0] === sb[0] && sa[1] === sb[1];
}

/** "10/11/2021" → "2021-10-11". */
export function deedIso(value: unknown): string | undefined {
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  if (!m) return undefined;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** The layer's features as parcel rows: residential, with an id, an owner and a site address. */
export function rowsToParcels(features: Array<{ attributes?: Record<string, unknown> }>): ParcelRow[] {
  const rows: ParcelRow[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const cadId = text(a.SU_NUM);
    const owner = ownerOf(a.OWNER);
    const useCode = text(a.GOV_USE_CO);
    const site = siteAddress(a);
    if (!cadId || !owner || !useCode || !site) continue;
    if (!(RESIDENTIAL_USE as readonly string[]).includes(useCode)) continue;
    const mailing = text(a.ADDRESS_1);
    rows.push({
      cadId,
      pin: text(a.PIN_1),
      useCode,
      siteAddress: site,
      addressKey: addressKey(site),
      looseKey: looseKey(site),
      street: streetKey(site),
      owner,
      owner2: text(a.OWNER2),
      mailing: { address: mailing, city: text(a.CITY_1), state: text(a.STATE_1), zip: text(a.ZIP) },
      ownerOccupied: ownerOccupied(site, mailing),
      companyOwned: isCompanyOwner(owner),
      marketValueCents: cents(a.MKT_VALUE),
      buildingValueCents: cents(a.BLDG_VALUE),
      deedDate: deedIso(a.DEED_DATE),
    });
  }
  return rows;
}

/** "LOZANO ZUNIGA CESAR E" → "Lozano Zuniga Cesar E": the roll's order (surname first), readable. */
export const ownerName = (owner: string) => owner.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
