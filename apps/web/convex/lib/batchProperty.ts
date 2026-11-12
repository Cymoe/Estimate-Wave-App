// BatchData's Property Search, as a complete source of a county's storage and industrial buildings: the public rolls
// leave some parcels blank (about 1 in 20 on Midland's map), and BatchData carries every parcel with its owner, the
// owner's mailing address, the deed history and whether the last purchase was cash. Pure: the request bodies and how
// one of its properties becomes a parcel row (batchParcels.ts does the asking and the saving).
//
// Field names are from BatchData's own references: "Property Search Request Body Reference", "BatchData API Datasets
// Field Definitions" and the "Land Use Code Reference" sheet (C32 is "Mini-Warehouse or Self-Storage"; the I.. codes
// are the Industrial category).
import { addressKey, isCompanyOwner, looseKey, ownerOccupied, streetKey, vendorKind, type DeedRow, type ParcelKind, type ParcelRow } from "./parcels";

export const BATCH_BASE = "https://api.batchdata.com/api/v1";
/** The most one search answers with. */
export const BATCH_TAKE = 100;

/** The counties Outreach covers, as BatchData's search names them. */
export const BATCH_COUNTIES = {
  Midland: "Midland County, TX",
  Ector: "Ector County, TX",
  Lubbock: "Lubbock County, TX",
  Taylor: "Taylor County, TX",
} as const;
export type BatchCounty = keyof typeof BATCH_COUNTIES;

/** BatchData's land use code for self-storage. */
export const STORAGE_CODE = "C32";

type Criteria = Record<string, unknown>;
const KIND_CRITERIA: Record<ParcelKind, Criteria> = {
  storage: { general: { standardizedLandUseCode: { equals: STORAGE_CODE } } },
  industrial: { general: { propertyTypeCategory: { equals: "Industrial" } } },
};

/** One page of a county's storage or industrial properties. `take` 0 asks only how many there are. */
export function searchBody(county: BatchCounty, kind: ParcelKind, skip = 0, take = BATCH_TAKE) {
  return { searchCriteria: { query: BATCH_COUNTIES[county], ...KIND_CRITERIA[kind] }, options: { skip, take } };
}

/**
 * A search to check the data by hand: an owner (a word of the name, or the whole name as BatchData spells it), a
 * past owner's whole name, or a street address, within the county.
 */
export function findBody(county: BatchCounty, by: { ownerWord?: string; ownerName?: string; previousOwner?: string; street?: string; city?: string }, take = 25) {
  const searchCriteria: Criteria = { query: BATCH_COUNTIES[county] };
  if (by.ownerWord) searchCriteria.owner = { lastName: { containsWords: by.ownerWord } };
  if (by.ownerName) searchCriteria.owner = { fullName: { equals: by.ownerName } };
  if (by.previousOwner) searchCriteria.previousOwner = { fullName: { equals: by.previousOwner } };
  if (by.street) searchCriteria.address = { street: { equals: by.street }, ...(by.city ? { city: { equals: by.city } } : {}), state: { equals: "TX" } };
  return { searchCriteria, options: { skip: 0, take } };
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const text = (x: unknown): string | undefined => (typeof x === "string" && x.replace(/\s+/g, " ").trim() ? x.replace(/\s+/g, " ").trim() : undefined);
const upper = (x: unknown) => text(x)?.toUpperCase();
const cents = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x * 100) : undefined);

/** "2023-06-01T00:00:00.000Z" → "2023-06-01". A year before 1850 or after this one is no date at all. */
export function isoDay(value: unknown, now = Date.now()): string | undefined {
  const m = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m) return undefined;
  const year = Number(m[1]);
  return year < 1850 || year > new Date(now).getUTCFullYear() ? undefined : `${m[1]}-${m[2]}-${m[3]}`;
}

/** What a search answered: the properties, and how many match in all. */
export function searchResults(body: unknown): { properties: unknown[]; found?: number } {
  const results = obj(obj(body).results);
  const found = obj(obj(results.meta).results).resultsFound;
  return { properties: list(results.properties), found: typeof found === "number" ? found : undefined };
}

/** How many earlier owners are kept for a property. */
const DEEDS_KEEP = 12;

/**
 * The owners before, newest deed first, as the district's deed history is kept (lib/parcels.ts DeedRow): each row is
 * who conveyed the property and when, so the first sold to today's owner. A deed with no seller named is left out, and
 * the same seller on the same day (a deed and its correction) is kept once.
 */
export function batchDeeds(history: unknown, now = Date.now()): DeedRow[] {
  const rows: DeedRow[] = [];
  for (const d of list(history).map(obj)) {
    const seller = list(d.sellers).map(upper).filter(Boolean).join(" & ");
    if (!seller) continue;
    const date = isoDay(d.saleDate, now) ?? isoDay(d.recordingDate, now) ?? isoDay(d.documentDate, now);
    const instrument = text(d.documentType);
    rows.push({ seller, ...(date ? { date } : {}), ...(instrument ? { instrument } : {}) });
  }
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return rows.filter((r, i) => i === 0 || r.seller !== rows[i - 1].seller || r.date !== rows[i - 1].date).slice(0, DEEDS_KEEP);
}

export type BatchParcel = {
  /** As the parcels table keeps it. Its cadId is BatchData's own id for the property ("bd:…"). */
  row: ParcelRow;
  deeds: DeedRow[];
  /** BatchData's land use code ("C32"). */
  vendorUse?: string;
  /** The last purchase was cash, where BatchData says. */
  cashBuyer?: boolean;
  /** The county's own parcel number, to match the parcel the public roll already has. */
  apn?: string;
};

/**
 * One of BatchData's properties as a parcel. `kind` is what the search asked for, for a property that came back with
 * no land use code. Nothing without an id, a street address and an owner.
 */
export function batchParcel(property: unknown, kind: ParcelKind, now = Date.now()): BatchParcel | undefined {
  const p = obj(property);
  const address = obj(p.address);
  const owner = obj(p.owner);
  const names = list(owner.names).map(obj);
  const id = text(p._id);
  const site = upper(address.street);
  const name = upper(owner.fullName) ?? upper(names[0]?.full);
  if (!id || !site || !name) return undefined;
  const mail = obj(owner.mailingAddress);
  const mailing = { address: upper(mail.street), city: upper(mail.city), state: upper(mail.state), zip: text(mail.zip)?.match(/^\d{5}/)?.[0] };
  const assessment = obj(p.assessment);
  const sale = obj(obj(p.sale).lastSale);
  const general = obj(p.general);
  const vendorUse = text(general.standardizedLandUseCode);
  const second = upper(names[1]?.full);
  const deedDate = isoDay(sale.saleDate, now) ?? isoDay(sale.recordingDate, now);
  const cash = obj(p.quickLists).cashBuyer;
  const apn = text(obj(p.ids).apn);
  const row: ParcelRow = {
    cadId: `bd:${id}`,
    ...(apn ? { pin: apn } : {}),
    // The state's code the rest of the app reads: a commercial building, or an industrial one.
    useCode: (vendorKind(vendorUse) ?? kind) === "industrial" ? "F2" : "F1",
    siteAddress: site,
    addressKey: addressKey(site),
    looseKey: looseKey(site),
    ...(streetKey(site) ? { street: streetKey(site) } : {}),
    owner: name,
    ...(second && second !== name ? { owner2: second } : {}),
    mailing: Object.fromEntries(Object.entries(mailing).filter(([, v]) => v)) as ParcelRow["mailing"],
    ownerOccupied: owner.ownerOccupied === true || ownerOccupied(site, mailing.address),
    companyOwned: isCompanyOwner(name),
    ...(cents(assessment.totalMarketValue) ? { marketValueCents: cents(assessment.totalMarketValue) } : {}),
    ...(cents(assessment.improvementMarketValue) ? { buildingValueCents: cents(assessment.improvementMarketValue) } : {}),
    ...(deedDate ? { deedDate } : {}),
  };
  return { row, deeds: batchDeeds(p.deedHistory, now), ...(vendorUse ? { vendorUse } : {}), ...(typeof cash === "boolean" ? { cashBuyer: cash } : {}), ...(apn ? { apn } : {}) };
}

/** A property in a few words, for checking a search by hand: who, where, what BatchData calls it, and the owners before. */
export function batchSummary(property: unknown, now = Date.now()) {
  const p = obj(property);
  const general = obj(p.general);
  const address = obj(p.address);
  const parcel = batchParcel(property, "storage", now);
  return {
    owner: parcel?.row.owner ?? upper(obj(p.owner).fullName) ?? null,
    address: [text(address.street), text(address.city)].filter(Boolean).join(", ") || null,
    apn: text(obj(p.ids).apn) ?? null,
    use: [text(general.standardizedLandUseCode), text(general.propertyTypeDetail)].filter(Boolean).join(" ") || null,
    marketValueCents: parcel?.row.marketValueCents ?? null,
    bought: parcel?.row.deedDate ?? null,
    cash: parcel?.cashBuyer ?? null,
    before: (parcel?.deeds ?? []).slice(0, 4).map((d) => `${d.seller}${d.date ? ` (${d.date})` : ""}`),
    // Which parts of the record this key is allowed to see: a missing part means a dataset to ask BatchData for.
    has: Object.keys(p).sort(),
  };
}
