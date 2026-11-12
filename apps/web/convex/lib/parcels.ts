// Who owns each property in Midland: the appraisal district's roll, as the
// city publishes it on its public ArcGIS (the same org as the permit feed).
// Owner name, mailing address, value and deed date; no phone numbers. Pure
// functions: parcels.ts fetches, these decide what each row means. Callers
// and staff see homes by address; Pro member companies see owners and
// mailing addresses through Outreach (public record, never a phone).

export const MIDLAND_PARCELS = {
  source: "midland-parcels",
  county: "Midland",
  layer:
    "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/ParcelOwnership/FeatureServer/3",
} as const;

/** Bumped when what a stored parcel holds changes: the deploy then reads the roll again instead of skipping. */
export const PARCEL_VERSION = 7;

/** The appraisal district's residential use codes: single-family, mobile home, condo and townhome. */
export const RESIDENTIAL_USE = ["A1", "A2", "A3", "A4", "A5"] as const;
/** Apartments, duplexes and the like (the state's B codes; the layer's exact sub-codes vary, so any B is kept). */
export const MULTIFAMILY_USE = ["B1", "B2", "B3", "B4"] as const;
/** Commercial (F1: shops, offices, shopping centers) and industrial (F2: warehouses, shops) buildings. */
export const COMMERCIAL_USE = ["F1", "F2"] as const;

export const isResidentialUse = (code: string | undefined) => (RESIDENTIAL_USE as readonly string[]).includes(code ?? "");
export const isMultifamilyUse = (code: string | undefined) => /^B\d?$/.test(code ?? "");
export const isCommercialUse = (code: string | undefined) => (COMMERCIAL_USE as readonly string[]).includes(code ?? "");
/**
 * Self-storage and industrial buildings, told apart from the rest of commercial. The state's codes don't separate
 * them (a mini-warehouse is F1 like a shop), so where the roll has the district's own land code, that decides:
 * Midland's CWH03 is mini-storage (self-storage, RV and boat storage); CID.. and CI0.. are industrial sites and
 * CWH04 to CWH99 warehouses. A land code alone isn't enough (it prices the land, so a house or an empty lot can
 * carry one): the parcel must also be a commercial or industrial building by the state's code. A storage company
 * whose building has another land code, or none, is caught by its name. Where a roll has no land code (the other
 * counties so far), storage is by name and industrial is the state's F2.
 */
const STORAGE_LAND = /^CWH03$/;
const INDUSTRIAL_LAND = /^(CID\d|CI0\d|CWH(0[4-9]|99|O4)$)/;
const STORAGE_NAME = /\b(STORAGE|MINI[- ]?WAREHOUSES?)\b/;
type Classed = { useCode: string | undefined; landUse?: string; owner: string };
export const isStorageParcel = (p: Classed) =>
  isCommercialUse(p.useCode) && (STORAGE_LAND.test(p.landUse ?? "") || STORAGE_NAME.test(p.owner.toUpperCase()) || Boolean(storageOperator(p.owner)));
export const isIndustrialParcel = (p: Classed) => isCommercialUse(p.useCode) && !isStorageParcel(p) && (p.useCode === "F2" || INDUSTRIAL_LAND.test(p.landUse ?? ""));

/**
 * What a commercial parcel is filed as beyond "commercial": storage, industrial, or neither. A storage business with a
 * sales-tax permit at the address makes it storage whatever the land code says (an RV and boat lot).
 */
export type ParcelKind = "storage" | "industrial";
export const parcelKind = (p: Classed, storageOutlet = false): ParcelKind | undefined =>
  !isCommercialUse(p.useCode) ? undefined : isStorageParcel(p) || storageOutlet ? "storage" : isIndustrialParcel(p) ? "industrial" : undefined;

/**
 * The big storage operators hold each market in an LLC of its own, so the roll never says the name on the sign:
 * KO Storage's Midland properties are "KOSF II MIDLAND LLC". Each entry here was checked against the operator's own
 * filings or its sales-tax permits (KOSF: Texas TDLR projects at KO Storage's Minnetonka office; AVAD: "Avid Storage"
 * permits under AVAD-ETUDE LLCs; PROPERTY RENEGADES: the broker's announcement of Atlas Self Storage's sale to KO
 * Storage, and the June 1, 2023 deed from Property Renegades LLC to KOSF II at 200 S Norman). A short list on
 * purpose: local names come from the sales-tax permit at the address. A commercial parcel one of them owns is
 * storage whatever its land code says (isStorageParcel).
 */
const STORAGE_OPERATORS: Array<[RegExp, string]> = [
  [/^KOSF\b/, "KO Storage"],
  [/^SROA\b/, "Storage Rentals of America"],
  [/^AVAD\b/, "Avid Storage"],
  [/^PROPERTY RENEGADES\b/, "Atlas Self Storage"],
];
/** The name on the sign for an owner the roll lists by its LLC, when it's one of the operators known here. */
export function storageOperator(owner: string): string | undefined {
  return STORAGE_OPERATORS.find(([re]) => re.test(owner.toUpperCase().trim()))?.[1];
}

/** A sales-tax permit in the storage business: the state's industry code for mini-warehouses, or a name that says so. */
export const isStorageOutlet = (o: { naics?: string; name: string }) => o.naics === "531130" || STORAGE_NAME.test(o.name.toUpperCase());
/** "AVID STORAGE - CALDERA" → "Avid Storage": the business's name without the branch it's at. */
export const outletBrand = (name: string): string =>
  ownerName(name.replace(/\s+-\s+.*$/, "").replace(/,?\s+(L\.?L\.?C\.?|INC\.?|LP|LTD)\.?$/i, "").trim()).replace(/\b(Rv|Llc)\b/g, (m) => m.toUpperCase()).replace(/'S\b/g, "'s");

/** A parcel the roll read keeps: a home, an apartment building or a commercial building. Land, minerals and exempt parcels aren't. */
export const keepsUse = (code: string | undefined) => isResidentialUse(code) || isMultifamilyUse(code) || isCommercialUse(code);

/** The layer query's where clause for every parcel kept. */
export const parcelWhere = () =>
  `GOV_USE_CO IN (${[...RESIDENTIAL_USE, ...MULTIFAMILY_USE, ...COMMERCIAL_USE].map((c) => `'${c}'`).join(",")}) OR GOV_USE_CO LIKE 'B%'`;

export const PARCEL_FIELDS = [
  "SU_NUM",
  "PIN_1",
  "GOV_USE_CO",
  "LAND_USE",
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
  /** The district's own land code ("CWH03"), where the roll has one: what tells storage and industrial apart. */
  landUse?: string;
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
 * A commercial building the roll gives no street number (a yard on the interstate, a storage lot on the highway):
 * its street alone ("HWY 80"), so the building and its owner aren't lost. Homes are never kept this way.
 */
export function streetAlone(a: Record<string, unknown>): string | undefined {
  const street = text(a.STREET)?.replace(/\b0+(\d)/g, "$1");
  if (!street || street.toUpperCase() === "NULL") return undefined;
  return squash([text(a.STREET_DIR), street].filter(Boolean).join(" "));
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

/** "10/11/2021" → "2021-10-11". A typo'd year on the roll ("9/2/9202", or one before 1850) is no date at all. */
export function deedIso(value: unknown, now = Date.now()): string | undefined {
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  if (!m) return undefined;
  const year = Number(m[3]);
  if (year < 1850 || year > new Date(now).getUTCFullYear()) return undefined;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Midland's deed history: the appraisal district's public page for a property lists who conveyed it at each deed, so
 * the roll's one owner becomes the chain of owners before. Read only for storage and industrial parcels (parcels.ts
 * readDeedHistory), slowly.
 */
export const MIDLAND_DEEDS = {
  source: "midland-deeds",
  page: (cadId: string) => `https://iswdataclient.azurewebsites.net/webProperty.aspx?dbkey=MIDLANDCAD&id=${encodeURIComponent(cadId)}`,
} as const;

/** One deed on a property: who conveyed it (the owner before), when, and the county clerk's instrument number. */
export type DeedRow = { seller: string; date?: string; instrument?: string };

const cellText = (html: string) =>
  html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#0?39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();

/**
 * The "Deed History" table of the district's property page, newest first: each row names who conveyed the property
 * and when, so the first row's seller sold to today's owner and each later row's sold to the one above. Rows said
 * twice are kept once; a name the page cut off at "&" loses the dangling "&" (ownerOf). Undefined when the page has no such
 * table (the page changed, or it isn't a property's), which a property with no deeds on file doesn't do: that's [].
 */
export function deedHistory(html: string, now = Date.now()): DeedRow[] | undefined {
  const table = html.match(/<tbody[^>]*\bid=["']tableSale["'][^>]*>([\s\S]*?)<\/tbody>/i);
  if (!table) return undefined;
  const rows: DeedRow[] = [];
  const seen = new Set<string>();
  for (const tr of table[1].match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(cellText);
    if (cells.length < 5) continue;
    const seller = ownerOf(cells[0]);
    if (!seller) continue;
    const date = deedIso(cells[3], now);
    const instrument = cells[4] || undefined;
    const key = `${seller}|${date ?? ""}|${instrument ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ seller, ...(date ? { date } : {}), ...(instrument ? { instrument } : {}) });
  }
  return rows;
}

/**
 * Midland's blank parcels. About one shape in twenty on the city's layer has no owner, value or use at all (the
 * roll's row never joined to it): a storage facility at 200 S Norman among them. The appraisal district's public
 * property search has every one, so each blank shape's street address (from the city's address points) is looked
 * up there, slowly (parcels.ts findGaps, fillGaps). One search lists every property on a street.
 */
export const MIDLAND_GAPS = {
  source: "midland-gaps",
  addresses: "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/EsiteAddr_Collab/FeatureServer/0",
  search: (street: string, number: string) => `https://iswdataclient.azurewebsites.net/webSearchAddress.aspx?dbkey=MIDLANDCAD&stype=situs&sdata=${encodeURIComponent(`${street}|${number}|`)}`,
} as const;

/** One property in the district's search results: its id, owner, and where it is ("NORMAN   200   S" → street, number, direction). */
export type DistrictRow = { id: string; owner: string; street: string; number: string; dir?: string; marketValueCents?: number };

const dollarCents = (s: string): number | undefined => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return s.includes("$") && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
};

/**
 * The rows of the district's address search: real property only (ids starting "R"; "P" is a business's equipment),
 * each id once. Undefined when the page isn't a search result at all.
 */
export function districtSearchRows(html: string): DistrictRow[] | undefined {
  if (!/Your search of/i.test(html)) return undefined;
  const rows: DistrictRow[] = [];
  const seen = new Set<string>();
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(cellText);
    const at = cells.findIndex((c) => /^R\d{6,}$/.test(c));
    if (at < 0 || cells.length < at + 6) continue;
    const id = cells[at];
    const owner = ownerOf(cells[at + 2]);
    // "MARLIN AV   1120  " or "NORMAN   200   S": the page's own spacing is squashed by now, so read it from the raw cell.
    const raw = (tr.match(/<td[\s\S]*?<\/td>/gi) ?? [])[at + 3].replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ");
    const [street, number, dir] = raw.split(/\s{2,}/).map((x) => x.trim());
    if (!owner || !street || !number || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, owner, street: street.toUpperCase(), number, ...(dir ? { dir: dir.toUpperCase() } : {}), ...(dollarCents(cells[at + 5]) ? { marketValueCents: dollarCents(cells[at + 5]) } : {}) });
  }
  return rows;
}

/** Whether a search row is at this house number on this street: "MARLIN AV" is MARLIN, "NORMANDY LN" is not NORMAN. */
export function atAddress(row: DistrictRow, number: string, street: string, dir?: string): boolean {
  const name = squash(street.toUpperCase());
  if (row.number !== number.trim() || number.trim() === "0") return false;
  if (row.street !== name && !row.street.startsWith(`${name} `)) return false;
  return !dir || !row.dir || row.dir === dir.toUpperCase();
}

/** What the district's property page says of a property: who owns it, where their bill goes, what's built on it, and the deeds. */
export type DistrictProperty = {
  owner?: string;
  mailing: { address?: string; city?: string; state?: string; zip?: string };
  /** The building kinds on it, as the page codes them: RES a house, COMM a commercial building, PKLT a parking lot. */
  buildings: string[];
  buildingValueCents?: number;
  deeds: DeedRow[];
};

const byId = (html: string, id: string): string | undefined => html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/td>`, "i"))?.[1];

/** The district's property page, read whole. Undefined when it isn't a property's page (no owner on it). */
export function districtProperty(html: string, now = Date.now()): DistrictProperty | undefined {
  const owner = ownerOf(cellText(byId(html, "webprop_name") ?? ""));
  if (!owner) return undefined;
  // "10301 WAYZATA BLVD<br/>MINNETONKA, MN 55305": the last line is the city; the one before it the street or box.
  const lines = (byId(html, "webprop_mailaddress") ?? "").split(/<br\s*\/?>/i).map(cellText).filter(Boolean);
  const last = lines[lines.length - 1]?.match(/^(.*?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  const mailing = last
    ? { address: lines.length > 1 ? lines[lines.length - 2] : undefined, city: last[1].trim() || undefined, state: last[2].toUpperCase(), zip: last[3] }
    : { address: lines[0] };
  const built = html.match(/<tbody[^>]*\bid=["']tableBld["'][^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const buildings = [...new Set((built.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((tr) => (tr.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(cellText)[1]?.toUpperCase()).filter((x): x is string => Boolean(x)))];
  // "Improvements | + | $416,930 | …": this year's first.
  const improvements = html.match(/>\s*Improvements\s*<[\s\S]*?(\$[\d,]+)/i)?.[1];
  return { owner, mailing, buildings, ...(improvements && dollarCents(improvements) ? { buildingValueCents: dollarCents(improvements) } : {}), deeds: deedHistory(html, now) ?? [] };
}

/**
 * The state's use code for a property the district's page describes: the page has no code, only what is built there.
 * A commercial building makes it commercial, a house a home; land or a parking lot alone isn't kept (as on the roll).
 */
export const useFromBuildings = (buildings: string[]): string | undefined => (buildings.includes("COMM") ? "F1" : buildings.includes("RES") ? "A1" : undefined);

/**
 * The parcel a blank shape turns out to be: one owner's accounts at one address (two half-interest accounts are one
 * property, valued once), with the page of the first. Nothing when there's no building on it to keep.
 */
export function districtParcel(accounts: DistrictRow[], page: DistrictProperty): ParcelRow | undefined {
  const first = accounts[0];
  const useCode = useFromBuildings(page.buildings);
  if (!first || !useCode || !page.owner) return undefined;
  const site = [first.number, first.dir, first.street].filter(Boolean).join(" ");
  const value = Math.max(0, ...accounts.map((a) => a.marketValueCents ?? 0));
  return {
    cadId: first.id,
    useCode,
    siteAddress: site,
    addressKey: addressKey(site),
    looseKey: looseKey(site),
    street: streetKey(site),
    owner: page.owner,
    mailing: page.mailing,
    ownerOccupied: isResidentialUse(useCode) ? ownerOccupied(site, page.mailing.address) : false,
    companyOwned: isCompanyOwner(page.owner),
    ...(value ? { marketValueCents: value } : {}),
    ...(page.buildingValueCents ? { buildingValueCents: page.buildingValueCents } : {}),
    // The newest deed is when today's owner took it.
    ...(page.deeds[0]?.date ? { deedDate: page.deeds[0].date } : {}),
  };
}

/** The layer's features as parcel rows: homes, apartment and commercial buildings, with an id, an owner and a site address. */
export function rowsToParcels(features: Array<{ attributes?: Record<string, unknown> }>): ParcelRow[] {
  const rows: ParcelRow[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const cadId = text(a.SU_NUM);
    const owner = ownerOf(a.OWNER);
    const useCode = text(a.GOV_USE_CO);
    const numbered = siteAddress(a);
    const site = numbered ?? (isCommercialUse(useCode) ? streetAlone(a) : undefined);
    if (!cadId || !owner || !useCode || !site) continue;
    if (!keepsUse(useCode)) continue;
    const mailing = text(a.ADDRESS_1);
    rows.push({
      cadId,
      pin: text(a.PIN_1),
      useCode,
      landUse: text(a.LAND_USE)?.toUpperCase(),
      siteAddress: site,
      addressKey: addressKey(site),
      looseKey: looseKey(site),
      street: streetKey(site),
      owner,
      owner2: text(a.OWNER2),
      mailing: { address: mailing, city: text(a.CITY_1), state: text(a.STATE_1), zip: text(a.ZIP) },
      ownerOccupied: numbered ? ownerOccupied(site, mailing) : false,
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

// ---- Odessa and Lubbock ----
//
// Ector County (Odessa): the appraisal district's own public map (owners,
// use, value, sale date), with each parcel's street address from the City
// of Odessa's address points, matched by the district's PIN. Lubbock: the
// City of Lubbock's parcel layer (the appraisal district's roll: owners,
// use, values, homestead) with its address points, matched the same way.
// Neither gives a parcel's address itself, so a parcel with no address
// point is left off, as Midland's are. Taylor County (Abilene): the City of
// Abilene's parcel layer, the appraisal district's roll already joined to the
// city's address points (owners, use, values and the street address on each
// row; a parcel with several addresses is there once for each).

export type CountyRoll = {
  county: "Ector" | "Lubbock" | "Taylor";
  /** The sync's name on the permit feed's status table. */
  source: string;
  /** The parcel layer. */
  layer: string;
  /** Rows per parcel request: the layer's maxRecordCount. */
  pageSize: number;
  /** The parcel layer's id field, read in this order. */
  orderBy: string;
  /** The parcel layer's fields read. */
  fields: readonly string[];
  /** The parcel layer's where clause for the uses kept. */
  where: string;
  /** The parcel layer's field holding the PIN its address points carry. */
  pinField: string;
  /** Address point layers, tried in order: the first with an address for a PIN gives it. */
  addresses: ReadonlyArray<{ layer: string; pin: string; address: string; where?: string }>;
};

const quoted = (codes: readonly string[]) => codes.map((c) => `'${c}'`).join(",");

/** Ector's use codes kept, as Midland's: A4 there is a lot with a garage or shed only, so it's left off. */
const ECTOR_USE: Record<string, string> = {
  A1: "A1", // single-family
  A2: "A2", // mobile home on its own land
  A3: "A1", // a house on leased land
  A5: "A1", // a duplex its owner lives in
  A6: "A1", // condominium
  A7: "A1", // townhouse
  B1: "B1", // apartments
  B2: "B2", // duplex to fourplex, rented
  F1: "F1", // commercial
  F2: "F2", // industrial
  F3: "F1", // commercial building on leased land
  F5: "F1", // hotel or motel
};
const LUBBOCK_USE = ["A1", "A2", "B1", "B2", "F1", "F2"] as const;

export const ECTOR_ROLL: CountyRoll = {
  county: "Ector",
  source: "ector-parcels",
  layer: "https://gis11.cama.io/arcgis/rest/services/Ector/EctorCounty_Basemap/MapServer/0",
  pageSize: 1000,
  orderBy: "OBJECTID",
  fields: ["PIN", "use_cd", "owner_name", "owner_addr", "bxcm_val", "land_val", "dos", "homestead", "deleted_flg"],
  where: `use_cd IN (${quoted(Object.keys(ECTOR_USE))})`,
  pinField: "PIN",
  addresses: [
    // The City of Odessa's address points.
    { layer: "https://services6.arcgis.com/96XBo0KviQ3nV6zg/arcgis/rest/services/AddressSitePoints_Collab_(public_view)/FeatureServer/0", pin: "PIN", address: "FULLADDR" },
    // The utility district's parcels, for west Odessa outside the city.
    { layer: "https://services6.arcgis.com/yS6YJ1WDC0B5ITTL/arcgis/rest/services/ECUD_Map_Public/FeatureServer/17", pin: "PIN", address: "PROP_LOC" },
  ],
};

export const LUBBOCK_ROLL: CountyRoll = {
  county: "Lubbock",
  source: "lubbock-parcels",
  layer: "https://pubgis.ci.lubbock.tx.us/server/rest/services/Layers/ParcelMap/MapServer/5",
  pageSize: 2000,
  orderBy: "OBJECTID",
  fields: ["PIN", "LCADID", "SPTB_CODE", "OWNER_NAME", "OWNER_ADDRESS", "OWNER_ADDRESS2", "OWNER_CITY", "OWNER_ST", "OWNER_ZIP", "TOTALVALUE", "IMPVALUE", "EXEMPTIONS"],
  where: `SPTB_CODE IN (${quoted(LUBBOCK_USE)})`,
  pinField: "PIN",
  addresses: [{ layer: "https://pubgis.ci.lubbock.tx.us/server/rest/services/Layers/ParcelMap/MapServer/0", pin: "PIN", address: "FULL_ADDRESS", where: "Master='MAIN'" }],
};

const TAYLOR_USE = ["A1", "A2", "B1", "B2", "F1", "F2"] as const;

export const TAYLOR_ROLL: CountyRoll = {
  county: "Taylor",
  source: "taylor-parcels",
  // The city's current join of the district's roll to its addresses. (Its older "CourierParcels" has the same fields, a tax year behind.)
  layer: "https://services6.arcgis.com/iBFmWI3dYPQqS1KF/arcgis/rest/services/Courier_Parcels_Beta/FeatureServer/0",
  pageSize: 2000,
  orderBy: "OBJECTID",
  fields: ["PROP_ID", "OWNER", "ADD1", "ADD2", "ADD3", "CITY", "STATE", "ZIP", "SITUS", "STATE_CD", "TOTALVALUE", "CURRTOTAL", "IMPVALUE"],
  // Abilene runs a little into Jones County: only Taylor's parcels are kept.
  where: `COUNTY LIKE 'Taylor%' AND STATE_CD IN (${quoted(TAYLOR_USE)})`,
  pinField: "PROP_ID",
  // The street address is on each row.
  addresses: [],
};

export const COUNTY_ROLLS: Record<CountyRoll["county"], CountyRoll> = { Ector: ECTOR_ROLL, Lubbock: LUBBOCK_ROLL, Taylor: TAYLOR_ROLL };

const zip5 = (value: unknown) => text(value)?.match(/^\d{5}/)?.[0];

/**
 * Ector's one-line mailing address, "80 SUGAR CREEK CENTER BLVD  SUGAR LAND TX 77478-3542":
 * the street, then two spaces, then the city, state and zip.
 */
export function splitMailing(value: unknown): ParcelRow["mailing"] {
  const line = typeof value === "string" ? value.trim() : "";
  if (!line) return {};
  const m = line.match(/^(.*?)\s{2,}(.+?)\s+([A-Z]{2})\s+(\d{5})(?:-?\d{4})?$/);
  if (m) return { address: squash(m[1]), city: squash(m[2]), state: m[3], zip: m[4] };
  const tail = line.match(/^(.*?)\s+([A-Z]{2})\s+(\d{5})(?:-?\d{4})?$/);
  if (!tail) return { address: squash(line) };
  // One space all through ("6977 KING RANCH RD ODESSA TX 79765"): the city starts after the street's last suffix or box number.
  const words = squash(tail[1]).split(" ");
  let end = -1;
  words.forEach((w, i) => {
    if (i > 0 && i < words.length - 1 && (STREET_ENDS.has(w) || (/^\d+$/.test(w) && words[i - 1] === "BOX"))) end = i;
    // A suite or unit and its number: "1204 BROADWAY STE 103".
    if (i > 0 && i < words.length - 2 && UNIT_WORDS.has(w)) end = i + 1;
  });
  // What can follow a street's suffix: a direction ("MAIN ST N"), a highway's number ("HIGHWAY 80 W"), a unit.
  while (end >= 0 && end < words.length - 2 && (DIRECTION_WORDS.has(words[end + 1]) || /^#?\d+[A-Z]?$/.test(words[end + 1]))) end++;
  if (end < 0) return { address: words.join(" "), state: tail[2], zip: tail[3] };
  return { address: words.slice(0, end + 1).join(" "), city: words.slice(end + 1).join(" "), state: tail[2], zip: tail[3] };
}
const DIRECTION_WORDS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const UNIT_WORDS = new Set(["STE", "SUITE", "APT", "UNIT", "BLDG", "#"]);
const STREET_ENDS = new Set([
  ...Object.keys(WORDS).filter((w) => !["NORTH", "SOUTH", "EAST", "WEST"].includes(w)),
  ...Object.values(WORDS).filter((w) => !["N", "S", "E", "W"].includes(w)),
  "AVE", "WAY", "LP", "LOOP", "PKY", "PKWY", "RUN", "PASS", "XING", "SQ", "PT", "ROW", "HIGHWAY", "FM", "BROADWAY", "CRT", "CRK", "HOLW", "VW", "RDG", "TRCE", "PATH",
]);

/** The shortest address a PIN has: the building's own, not one of its suites. */
export function addressByPin(features: Array<{ attributes?: Record<string, unknown> }>, pin: string, address: string, into: Map<string, string> = new Map()) {
  for (const f of features) {
    const p = text(f.attributes?.[pin]);
    const a = text(f.attributes?.[address])?.toUpperCase();
    if (!p || !a || !/^\d/.test(a)) continue;
    const had = into.get(p);
    if (!had || a.length < had.length) into.set(p, a);
  }
  return into;
}

const parcelOf = (
  county: string,
  id: string,
  site: string,
  owner: string,
  fields: Omit<ParcelRow, "cadId" | "siteAddress" | "addressKey" | "looseKey" | "street" | "owner" | "ownerOccupied" | "companyOwned"> & { homestead?: boolean },
): ParcelRow => {
  const { homestead, ...rest } = fields;
  return {
    cadId: `${county}:${id}`,
    siteAddress: site,
    addressKey: addressKey(site),
    looseKey: looseKey(site),
    street: streetKey(site),
    owner,
    ...rest,
    ownerOccupied: Boolean(homestead) || ownerOccupied(site, rest.mailing.address),
    companyOwned: isCompanyOwner(owner),
  };
};

/** Ector's parcel features as rows, each at its PIN's address; parcels without one, or deleted, are skipped. */
export function ectorParcels(features: Array<{ attributes?: Record<string, unknown> }>, addresses: Map<string, string>): ParcelRow[] {
  const rows: ParcelRow[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const pin = text(a.PIN);
    const owner = ownerOf(a.owner_name);
    const useCode = ECTOR_USE[text(a.use_cd) ?? ""];
    const site = pin && addresses.get(pin);
    if (!pin || !owner || !useCode || !site || a.deleted_flg === 1) continue;
    const market = cents(a.bxcm_val);
    const land = cents(a.land_val) ?? 0;
    const sold = text(a.dos);
    rows.push(
      parcelOf("Ector", pin, site, owner, {
        pin,
        useCode,
        mailing: splitMailing(a.owner_addr),
        marketValueCents: market,
        buildingValueCents: market && market > land ? market - land : undefined,
        deedDate: sold && /^\d{4}-\d{2}-\d{2}$/.test(sold) && sold >= "1850" ? sold : undefined,
        homestead: typeof a.homestead === "number" && a.homestead > 0,
      }),
    );
  }
  return rows;
}

/** Lubbock's parcel features as rows, each at its PIN's address. The layer gives no deed date. */
export function lubbockParcels(features: Array<{ attributes?: Record<string, unknown> }>, addresses: Map<string, string>): ParcelRow[] {
  const rows: ParcelRow[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const pin = text(a.PIN);
    const id = text(a.LCADID) ?? pin;
    // "WOOD, LEONARD W": the roll's comma dropped, as Midland's and Odessa's are written.
    const owner = ownerOf(typeof a.OWNER_NAME === "string" ? a.OWNER_NAME.replace(/,/g, " ") : a.OWNER_NAME);
    const useCode = text(a.SPTB_CODE);
    const site = pin && addresses.get(pin);
    if (!pin || !id || !owner || !useCode || !site || !(LUBBOCK_USE as readonly string[]).includes(useCode)) continue;
    rows.push(
      parcelOf("Lubbock", id, site, owner, {
        pin,
        useCode,
        mailing: {
          address: text([text(a.OWNER_ADDRESS), text(a.OWNER_ADDRESS2)].filter(Boolean).join(" ")),
          city: text(a.OWNER_CITY),
          state: text(a.OWNER_ST),
          zip: zip5(a.OWNER_ZIP),
        },
        marketValueCents: cents(a.TOTALVALUE),
        buildingValueCents: cents(a.IMPVALUE),
        homestead: /\bHS\b/.test(text(a.EXEMPTIONS) ?? ""),
      }),
    );
  }
  return rows;
}

/**
 * Taylor's parcel features as rows. A parcel with several address points (a center's suites, an apartment office) is
 * there once for each: it's kept once, at its shortest street address (the building's own). The mailing street is the
 * second line; the first is a care-of or attention line, used only when it's all there is. The layer gives no deed date.
 */
export function taylorParcels(features: Array<{ attributes?: Record<string, unknown> }>): ParcelRow[] {
  const byId = new Map<string, ParcelRow>();
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = typeof a.PROP_ID === "number" ? String(a.PROP_ID) : text(a.PROP_ID);
    const owner = ownerOf(a.OWNER);
    const useCode = text(a.STATE_CD);
    const site = text(a.SITUS)?.toUpperCase();
    if (!id || !owner || !useCode || !site || !/^\d/.test(site) || !(TAYLOR_USE as readonly string[]).includes(useCode)) continue;
    const had = byId.get(id);
    if (had && had.siteAddress.length <= site.length) continue;
    byId.set(
      id,
      parcelOf("Taylor", id, site, owner, {
        pin: id,
        useCode,
        mailing: {
          address: text([text(a.ADD2), text(a.ADD3)].filter(Boolean).join(" ")) ?? text(a.ADD1),
          city: text(a.CITY),
          state: text(a.STATE),
          zip: zip5(a.ZIP),
        },
        marketValueCents: cents(a.TOTALVALUE) ?? cents(a.CURRTOTAL),
        buildingValueCents: cents(a.IMPVALUE),
      }),
    );
  }
  return [...byId.values()];
}

/** A county roll's features as rows. */
export const countyParcels = (roll: CountyRoll, features: Array<{ attributes?: Record<string, unknown> }>, addresses: Map<string, string>) =>
  roll.county === "Ector" ? ectorParcels(features, addresses) : roll.county === "Lubbock" ? lubbockParcels(features, addresses) : taylorParcels(features);
