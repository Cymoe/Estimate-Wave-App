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
export const PARCEL_VERSION = 5;

/** The appraisal district's residential use codes: single-family, mobile home, condo and townhome. */
export const RESIDENTIAL_USE = ["A1", "A2", "A3", "A4", "A5"] as const;
/** Apartments, duplexes and the like (the state's B codes; the layer's exact sub-codes vary, so any B is kept). */
export const MULTIFAMILY_USE = ["B1", "B2", "B3", "B4"] as const;
/** Commercial (F1: shops, offices, shopping centers) and industrial (F2: warehouses, shops) buildings. */
export const COMMERCIAL_USE = ["F1", "F2"] as const;

export const isResidentialUse = (code: string | undefined) => (RESIDENTIAL_USE as readonly string[]).includes(code ?? "");
export const isMultifamilyUse = (code: string | undefined) => /^B\d?$/.test(code ?? "");
export const isCommercialUse = (code: string | undefined) => (COMMERCIAL_USE as readonly string[]).includes(code ?? "");
/** A parcel the roll read keeps: a home, an apartment building or a commercial building. Land, minerals and exempt parcels aren't. */
export const keepsUse = (code: string | undefined) => isResidentialUse(code) || isMultifamilyUse(code) || isCommercialUse(code);

/** The layer query's where clause for every parcel kept. */
export const parcelWhere = () =>
  `GOV_USE_CO IN (${[...RESIDENTIAL_USE, ...MULTIFAMILY_USE, ...COMMERCIAL_USE].map((c) => `'${c}'`).join(",")}) OR GOV_USE_CO LIKE 'B%'`;

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

/** "10/11/2021" → "2021-10-11". A typo'd year on the roll ("9/2/9202", or one before 1850) is no date at all. */
export function deedIso(value: unknown, now = Date.now()): string | undefined {
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  if (!m) return undefined;
  const year = Number(m[3]);
  if (year < 1850 || year > new Date(now).getUTCFullYear()) return undefined;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** The layer's features as parcel rows: homes, apartment and commercial buildings, with an id, an owner and a site address. */
export function rowsToParcels(features: Array<{ attributes?: Record<string, unknown> }>): ParcelRow[] {
  const rows: ParcelRow[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const cadId = text(a.SU_NUM);
    const owner = ownerOf(a.OWNER);
    const useCode = text(a.GOV_USE_CO);
    const site = siteAddress(a);
    if (!cadId || !owner || !useCode || !site) continue;
    if (!keepsUse(useCode)) continue;
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
