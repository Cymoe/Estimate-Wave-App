// Outreach: who's on the Midland roll, grouped into the people a contractor
// wants to reach. Pure functions: outreach.ts reads and writes, these decide
// what an owner is and what a list means.
//
// The roll holds one row per parcel. Grouped by owner and mailing address it
// becomes one row per owner, with how many properties they hold and of what
// kind. Grouped by mailing address alone it finds the offices that get the
// tax bills for several owners' properties: property managers, in practice.
import { addressKey, isCommercialUse, isMultifamilyUse, isResidentialUse, ownerName, streetKey } from "./parcels";

export type Mailing = { address?: string; city?: string; state?: string; zip?: string };

/** One parcel as the rebuild reads it: just what grouping needs. */
export type Condensed = {
  id: string;
  siteAddress: string;
  street?: string;
  useCode: string;
  owner: string;
  mailing: Mailing;
  ownerOccupied: boolean;
  companyOwned: boolean;
  marketValueCents?: number;
  deedDate?: string;
};

export type Property = { parcelId: string; address: string; useCode: string; valueCents?: number };

export type OwnerRow = {
  key: string;
  kind: "owner" | "office";
  name: string;
  company: boolean;
  mailing: Mailing;
  parcels: number;
  residential: number;
  multifamily: number;
  commercial: number;
  totalValueCents: number;
  maxValueCents: number;
  homeValueCents?: number;
  rentalValueCents?: number;
  commercialValueCents?: number;
  multifamilyValueCents?: number;
  ownerOccupied: boolean;
  outOfState: boolean;
  latestDeed?: string;
  useCodes: string[];
  streets: string[];
  tops: Record<string, Property>;
  owners?: number;
};

export const FACETS = ["investor", "builder", "office", "commercial", "multifamily", "homeowner", "absentee", "out_of_state", "buyer"] as const;
export type Facet = (typeof FACETS)[number];

export const WHO = ["investor", "builder", "manager", "commercial", "multifamily", "wealthy", "recent_buyer", "absentee", "custom"] as const;
export type Who = (typeof WHO)[number];

export type Definition = {
  county: string;
  who: Who;
  useCodes?: string[];
  minValueCents?: number;
  maxValueCents?: number;
  minParcels?: number;
  ownerOccupied?: boolean;
  companyOwned?: boolean;
  outOfState?: boolean;
  zips?: string[];
  streets?: string[];
  deedWithinDays?: number;
  limit?: number;
};

export const INVESTOR_PARCELS = 3;
export const OFFICE_PARCELS = 5;
export const OFFICE_OWNERS = 2;
/** "Wealthy" unless the ask names a number: a home worth $1M or more. */
export const WEALTHY_DEFAULT_CENTS = 100_000_000;
export const BUYER_DEFAULT_DAYS = 90;
/** Deeds older than this don't make the buyer facet at all. */
export const BUYER_FACET_DAYS = 730;
export const MAX_ROWS = 500;
/** A list holds up to this many at once; the rest load page by page. */
export const DEFAULT_ROWS = 500;
const MAX_STREETS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Governments, schools, churches, HOAs and lenders own a lot of parcels without being investors. */
/** Homebuilders: dozens of spec homes and lots on the roll, but not investors. */
const BUILDER = /\b(HOMES|HOMEBUILDERS?|BUILDERS?|BUILDING CO|CONSTRUCTION|DEVELOPMENT|HORTON|LENNAR)\b/;
// The roll writes "MIDLAND COUNTY" and "MIDLAND COUNTY HOSPITAL DISTRICT", so a name
// ending in COUNTY or DISTRICT is a government too; "COUNTY LINE LLC" is not.
const NOT_INVESTOR = /\b(CITY OF|COUNTY OF|STATE OF|ISD|SCHOOL|COLLEGE|UNIVERSITY|CHURCH|MINISTRIES|CEMETERY|FOUNDATION|HOA|HOMEOWNERS|ASSOCIATION|ASSN|AUTHORITY|BANK|CREDIT UNION|MORTGAGE|HOUSING|HABITAT|UNITED STATES|USA)\b|\b(COUNTY|DISTRICT)$/;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** One spelling of an owner, so "SMITH JOHN &", "SMITH JOHN ET AL" and "Smith, John" group together. */
export function ownerKey(owner: string): string {
  return squash(
    owner
      .toUpperCase()
      .replace(/[.,'"]/g, " ")
      .replace(/\s*&\s*$/, "")
      .replace(/\s+(ET\s?AL|ETAL|ET\s?UX|ETUX|ET\s?VIR|ETVIR)\b.*$/, ""),
  );
}

/** One spelling of a mailing address, with the zip, so two owners billed at one office share it. */
export function mailKey(mailing: Mailing): string | undefined {
  const line = addressKey(mailing.address);
  if (!line) return undefined;
  return `${line}|${(mailing.zip ?? "").slice(0, 5)}`;
}

/** The business named on a "C/O ACME MANAGEMENT" mailing line. */
export function careOf(address: string | undefined): string | undefined {
  const m = (address ?? "").trim().match(/^(?:C\/O|%|ATTN:?|C\s?O:?)\s+(.+)$/i);
  const name = m ? squash(m[1]).replace(/[.,]+$/, "") : undefined;
  return name && !/^\d/.test(name) ? name.toUpperCase() : undefined;
}

const TX = new Set(["TX", "TEXAS"]);
export const outOfState = (mailing: Mailing) => Boolean(mailing.state) && !TX.has(mailing.state!.trim().toUpperCase());

const KEEP_UPPER = new Set(["LLC", "LLP", "LP", "LTD", "INC", "PC", "PLLC", "II", "III", "IV", "DBA", "USA", "TX", "ISD", "HOA", "PO", "LLLP"]);
/** "OAK PLAZA LLC" → "Oak Plaza LLC"; a person as ownerName gives it. */
export function displayName(owner: string): string {
  return ownerName(owner)
    .split(" ")
    .map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .join(" ");
}

/** "$4.2M", "$850K", "$52,674". */
export function shortMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (dollars >= 100_000) return `$${Math.round(dollars / 1_000)}K`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const value = (p: Condensed) => p.marketValueCents ?? 0;
const property = (p: Condensed): Property => ({ parcelId: p.id, address: p.siteAddress, useCode: p.useCode, valueCents: p.marketValueCents });
/** How many distinct owners an office remembers by name; past this only the count grows, and it's already well past OFFICE_OWNERS. */
const OFFICE_NAMES = 50;
/** Where the owners rebuild records how it went (permitSources). */
export const OWNERS_SOURCE = "midland-owners";
/** Bumped when the facets or rows change shape: the deploy rebuilds owners made by an older version. */
export const OWNERS_VERSION = 3;
/** What unlocking a contact's phone and email costs, charged only when the trace finds something. */
export const UNLOCK_CENTS = 100;
/** What a research answer costs, charged only when the AI found something worth saying. */
export const RESEARCH_CENTS = 25;
/** The question the research column answers unless the company asks another. */
export const DEFAULT_RESEARCH_QUESTION =
  "Who is this owner, what do they do, and is there any sign of planned construction, renovation, expansion or a recent sale?";

/**
 * Pass one over the roll: how many parcels each mailing address gets the
 * bills for, and whether from more than one owner. Three small fields per
 * address, so 50,000 addresses are a few megabytes.
 */
export class AddressCounter {
  private counts = new Map<string, { n: number; first: string; multi: boolean }>();

  add(p: Condensed) {
    const ok = ownerKey(p.owner);
    const mk = ok ? mailKey(p.mailing) : undefined;
    if (!ok || !mk) return;
    const c = this.counts.get(mk);
    if (!c) this.counts.set(mk, { n: 1, first: ok, multi: false });
    else {
      c.n++;
      if (!c.multi && c.first !== ok) c.multi = true;
    }
  }

  addAll(rows: Condensed[]) {
    for (const p of rows) this.add(p);
    return this;
  }

  /** The mailing addresses that might be offices: OFFICE_PARCELS or more parcels from more than one owner. */
  candidates(): Set<string> {
    const out = new Set<string>();
    for (const [mk, c] of this.counts) if (c.n >= OFFICE_PARCELS && c.multi) out.add(mk);
    return out;
  }
}

/** One owner (or office) as the roll is read: totals and the best of each kind, never the parcels themselves. Arrays, not Sets: smaller. */
type Acc = {
  key: string;
  kind: "owner" | "office";
  mailing: Mailing;
  owner: string;
  company: boolean;
  parcels: number;
  homes: number;
  rentals: number;
  commercial: number;
  multifamily: number;
  total: number;
  max: number;
  homeMax?: number;
  rentalMax?: number;
  commercialMax?: number;
  multifamilyMax?: number;
  latestDeed?: string;
  useCodes: string[];
  streets: string[];
  tops: Record<string, Property>;
  /** Office only: the distinct owners billed here with how often each (the most common names it when there's no c/o line), and any past OFFICE_NAMES. */
  names?: Array<[string, number]>;
  extraOwners?: number;
};

function fold(acc: Acc, p: Condensed) {
  const v = value(p);
  const top = (k: string) => {
    const t = acc.tops[k];
    if (!t || v > (t.valueCents ?? 0)) acc.tops[k] = property(p);
  };
  acc.parcels++;
  acc.total += v;
  if (v > acc.max) acc.max = v;
  top("all");
  if (isResidentialUse(p.useCode)) {
    if (p.ownerOccupied) {
      acc.homes++;
      acc.homeMax = Math.max(acc.homeMax ?? 0, v);
      top("home");
    } else {
      acc.rentals++;
      acc.rentalMax = Math.max(acc.rentalMax ?? 0, v);
      top("rental");
    }
  } else if (isCommercialUse(p.useCode)) {
    acc.commercial++;
    acc.commercialMax = Math.max(acc.commercialMax ?? 0, v);
    top("commercial");
  } else if (isMultifamilyUse(p.useCode)) {
    acc.multifamily++;
    acc.multifamilyMax = Math.max(acc.multifamilyMax ?? 0, v);
    top("multifamily");
  }
  if (p.deedDate && (!acc.latestDeed || p.deedDate > acc.latestDeed)) acc.latestDeed = p.deedDate;
  if (!acc.useCodes.includes(p.useCode)) acc.useCodes.push(p.useCode);
  const street = p.street ?? streetKey(p.siteAddress);
  if (street && acc.streets.length < MAX_STREETS && !acc.streets.includes(street)) acc.streets.push(street);
}

const fresh = (key: string, kind: Acc["kind"], mailing: Mailing, owner: string, company: boolean): Acc => ({
  key, kind, mailing, owner, company, parcels: 0, homes: 0, rentals: 0, commercial: 0, multifamily: 0, total: 0, max: 0,
  useCodes: [], streets: [], tops: {},
});

/** The owner row an accumulator has become. */
function rowFor(acc: Acc, name: string, company: boolean): OwnerRow {
  return {
    key: acc.key,
    kind: acc.kind,
    name,
    company,
    mailing: acc.mailing,
    parcels: acc.parcels,
    residential: acc.homes + acc.rentals,
    multifamily: acc.multifamily,
    commercial: acc.commercial,
    totalValueCents: acc.total,
    maxValueCents: acc.max,
    homeValueCents: acc.homeMax,
    rentalValueCents: acc.rentalMax,
    commercialValueCents: acc.commercialMax,
    multifamilyValueCents: acc.multifamilyMax,
    ownerOccupied: acc.homes > 0,
    outOfState: outOfState(acc.mailing),
    latestDeed: acc.latestDeed,
    useCodes: [...acc.useCodes].sort(),
    streets: acc.streets,
    tops: acc.tops,
    owners: acc.kind === "office" ? (acc.names?.length ?? 0) + (acc.extraOwners ?? 0) : undefined,
  };
}

/** The facets an owner row is on, each with what it's sorted by. */
export function facetsOf(row: OwnerRow, now: number): Array<{ facet: Facet; sort: number }> {
  const out: Array<{ facet: Facet; sort: number }> = [];
  if (row.kind === "office") {
    out.push({ facet: "office", sort: row.parcels });
  } else {
    // Three or more properties, or any company holding property: an LLC with one shopping center is an investor too.
    const upper = row.name.toUpperCase();
    const holder = (row.parcels >= INVESTOR_PARCELS || row.company) && !NOT_INVESTOR.test(upper);
    // Three or more properties, or any company holding property: an LLC with one shopping center is an investor too. Builders are their own list.
    if (holder) out.push({ facet: BUILDER.test(upper) ? "builder" : "investor", sort: row.parcels * 1e9 + Math.min(row.totalValueCents, 1e9 - 1) });
    if (row.commercial > 0) out.push({ facet: "commercial", sort: row.commercialValueCents ?? 0 });
    if (row.multifamily > 0) out.push({ facet: "multifamily", sort: row.multifamilyValueCents ?? 0 });
    if (row.homeValueCents !== undefined && !row.company) out.push({ facet: "homeowner", sort: row.homeValueCents });
    if (row.rentalValueCents !== undefined && !row.company) {
      out.push({ facet: "absentee", sort: row.rentalValueCents });
      if (row.outOfState) out.push({ facet: "out_of_state", sort: row.rentalValueCents });
    }
    if (row.latestDeed && now - Date.parse(`${row.latestDeed}T12:00:00Z`) <= BUYER_FACET_DAYS * DAY_MS) {
      out.push({ facet: "buyer", sort: Date.parse(`${row.latestDeed}T12:00:00Z`) });
    }
  }
  return out;
}

export type GroupedRow = { owner: OwnerRow; facets: Array<{ facet: Facet; sort: number }> };
export type Grouped = { owners: OwnerRow[]; facets: Map<string, Array<{ facet: Facet; sort: number }>> };

/**
 * Pass two over the roll: owner rows and office rows, folded in a parcel
 * at a time. An owner row is one owner at one mailing address; an office
 * row is one mailing address that pass one found getting the bills for
 * OFFICE_PARCELS or more parcels from OFFICE_OWNERS or more owners. Only
 * those addresses get an accumulator, so memory is the owners, not the
 * addresses.
 */
export class OwnerGrouper {
  private byOwner = new Map<string, Acc>();
  private byMail = new Map<string, Acc>();
  seen = 0;

  constructor(private offices: Set<string>) {}

  add(p: Condensed) {
    const ok = ownerKey(p.owner);
    if (!ok) return;
    this.seen++;
    const mk = mailKey(p.mailing);
    const key = `${ok}|${mk ?? ""}`;
    let g = this.byOwner.get(key);
    if (!g) {
      g = fresh(key, "owner", p.mailing, p.owner, p.companyOwned);
      this.byOwner.set(key, g);
    }
    fold(g, p);
    if (mk && this.offices.has(mk)) {
      let o = this.byMail.get(mk);
      if (!o) {
        o = fresh(`office:${mk}`, "office", p.mailing, p.owner, true);
        o.names = [];
        this.byMail.set(mk, o);
      }
      fold(o, p);
      const named = o.names!.find((n) => n[0] === ok);
      if (named) named[1]++;
      else if (o.names!.length < OFFICE_NAMES) o.names!.push([ok, 1]);
      else o.extraOwners = (o.extraOwners ?? 0) + 1;
    }
  }

  addAll(rows: Condensed[]) {
    for (const p of rows) this.add(p);
    return this;
  }

  /** The rows, one at a time, each dropped from memory as it goes out. */
  *rows(now = Date.now()): Generator<GroupedRow> {
    for (const [key, g] of this.byOwner) {
      this.byOwner.delete(key);
      const owner = rowFor(g, displayName(g.owner), g.company);
      yield { owner, facets: facetsOf(owner, now) };
    }
    for (const [key, o] of this.byMail) {
      this.byMail.delete(key);
      const distinct = o.names!.length + (o.extraOwners ?? 0);
      if (o.parcels < OFFICE_PARCELS || distinct < OFFICE_OWNERS) continue;
      const most = [...o.names!].sort((a, b) => b[1] - a[1])[0][0];
      const owner = rowFor(o, careOf(o.mailing.address) ?? displayName(most), true);
      yield { owner, facets: facetsOf(owner, now) };
    }
  }

  get size() {
    return this.byOwner.size + this.byMail.size;
  }

  finish(now = Date.now()): Grouped {
    const owners: OwnerRow[] = [];
    const facets = new Map<string, Array<{ facet: Facet; sort: number }>>();
    for (const r of this.rows(now)) {
      owners.push(r.owner);
      facets.set(r.owner.key, r.facets);
    }
    return { owners, facets };
  }
}

/** The whole roll at once (both passes), for tests and small reads. */
export const groupOwners = (rows: Condensed[], now = Date.now()): Grouped =>
  new OwnerGrouper(new AddressCounter().addAll(rows).candidates()).addAll(rows).finish(now);

// ---- Lists ----

/** The facet a definition reads, and what its value filters compare against. */
export function facetFor(def: Definition): Facet {
  switch (def.who) {
    case "investor":
      return "investor";
    case "builder":
      return "builder";
    case "manager":
      return "office";
    case "commercial":
      return "commercial";
    case "multifamily":
      return "multifamily";
    case "wealthy":
      return "homeowner";
    case "recent_buyer":
      return "buyer";
    case "absentee":
      return def.outOfState === false ? "absentee" : "out_of_state";
    case "custom": {
      const codes = def.useCodes ?? [];
      if (codes.some((c) => c.startsWith("F"))) return "commercial";
      if (codes.some((c) => c.startsWith("B"))) return "multifamily";
      if (codes.some((c) => c.startsWith("A"))) return def.ownerOccupied === false ? "absentee" : "homeowner";
      throw new Error("A custom list needs a use code: A for homes, B for apartments, F1 or F2 for commercial");
    }
  }
}

/** The value a facet is sorted and filtered by: the home for homeowners, the rental for absentee owners, and so on. */
export function facetValue(row: OwnerRow, facet: Facet): number {
  switch (facet) {
    case "homeowner":
      return row.homeValueCents ?? 0;
    case "absentee":
    case "out_of_state":
      return row.rentalValueCents ?? 0;
    case "commercial":
      return row.commercialValueCents ?? 0;
    case "multifamily":
      return row.multifamilyValueCents ?? 0;
    default:
      return row.maxValueCents;
  }
}

/** The property shown for a row on a list: the one the facet is about. */
export function propertyFor(row: OwnerRow, facet: Facet): Property | undefined {
  const pick = { homeowner: "home", absentee: "rental", out_of_state: "rental", commercial: "commercial", multifamily: "multifamily" } as Partial<Record<Facet, string>>;
  return row.tops[pick[facet] ?? "all"] ?? row.tops.all;
}

/** The filters a definition adds on top of its facet, plus the wealthy and buyer defaults. */
export function matches(row: OwnerRow, def: Definition, facet: Facet, now: number): boolean {
  const minValue = def.minValueCents ?? (def.who === "wealthy" ? WEALTHY_DEFAULT_CENTS : undefined);
  const v = facetValue(row, facet);
  if (minValue !== undefined && v < minValue) return false;
  if (def.maxValueCents !== undefined && v > def.maxValueCents) return false;
  if (def.minParcels !== undefined && row.parcels < def.minParcels) return false;
  if (def.ownerOccupied !== undefined && row.ownerOccupied !== def.ownerOccupied) return false;
  if (def.companyOwned !== undefined && row.company !== def.companyOwned) return false;
  if (def.outOfState !== undefined && row.outOfState !== def.outOfState) return false;
  if (def.useCodes?.length && !def.useCodes.some((c) => row.useCodes.some((u) => u.startsWith(c)))) return false;
  if (def.zips?.length && !def.zips.includes((row.mailing.zip ?? "").slice(0, 5))) return false;
  if (def.streets?.length) {
    const wanted = def.streets.map((s) => streetKey(`1 ${s}`)).filter(Boolean);
    if (!wanted.some((s) => row.streets.includes(s!))) return false;
  }
  const days = def.deedWithinDays ?? (def.who === "recent_buyer" ? BUYER_DEFAULT_DAYS : undefined);
  if (days !== undefined) {
    if (!row.latestDeed) return false;
    if (now - Date.parse(`${row.latestDeed}T12:00:00Z`) > days * DAY_MS) return false;
  }
  return true;
}

/**
 * The order a list's rows come in, the same one its facet is read in: the
 * biggest holders first for investors, builders and managers; the most
 * valuable property first for the rest. Recent buyers come as pulled,
 * newest deed first. `key` ranks a saved row; higher comes first.
 */
export function listOrder(def: Definition): { label: string; key: (row: { properties: number; totalValueCents: number; property: { valueCents?: number } }) => number } {
  const facet = facetFor(def);
  if (facet === "investor" || facet === "builder") return { label: "most properties first", key: (r) => r.properties * 1e9 + Math.min(r.totalValueCents, 1e9 - 1) };
  if (facet === "office") return { label: "most properties first", key: (r) => r.properties };
  if (facet === "buyer") return { label: "newest deed first", key: () => 0 };
  return { label: "highest value first", key: (r) => r.property.valueCents ?? r.totalValueCents };
}

/** Why someone is on the list, in a line. */
export function why(row: OwnerRow, facet: Facet): string {
  const kinds = [
    row.commercial ? plural(row.commercial, "commercial building") : "",
    row.multifamily ? plural(row.multifamily, "apartment building") : "",
  ].filter(Boolean);
  switch (facet) {
    case "investor":
      return `Owns ${plural(row.parcels, "Midland property", "Midland properties")}${kinds.length ? ` (${kinds.join(", ")})` : ""}, ${shortMoney(row.totalValueCents)} on the roll`;
    case "builder":
      return `Homebuilder with ${plural(row.parcels, "Midland property", "Midland properties")} on the roll, ${shortMoney(row.totalValueCents)} in all`;
    case "office":
      return `Gets the tax bills for ${plural(row.parcels, "property", "properties")} from ${plural(row.owners ?? 0, "owner")}`;
    case "commercial":
      return `${row.commercial === 1 ? "Commercial building" : plural(row.commercial, "commercial building")} worth ${shortMoney(row.commercialValueCents ?? 0)}`;
    case "multifamily":
      return `${row.multifamily === 1 ? "Apartment building" : plural(row.multifamily, "apartment building")} worth ${shortMoney(row.multifamilyValueCents ?? 0)}`;
    case "homeowner":
      return `Home worth ${shortMoney(row.homeValueCents ?? 0)}, owner-occupied`;
    case "absentee":
    case "out_of_state": {
      const where = [row.mailing.city && ownerName(row.mailing.city), row.mailing.state?.toUpperCase()].filter(Boolean).join(", ");
      return `Owns ${row.residential === 1 ? "a home" : plural(row.residential, "home")} here${where ? `, mail goes to ${where}` : ""}`;
    }
    case "buyer":
      return `Bought ${monthYear(row.latestDeed!)}`;
  }
}

// ---- What the assistant and the tool take ----

/** The `who` guide, as the interpreter's system prompt and the tool's description both state it. */
export const WHO_GUIDE = `Pick exactly one who:
- investor: owns 3 or more Midland properties, or a company (LLC, LP, trust company) that owns any; homebuilders are left out. "Investors", "landlords", "flippers", "people who own rentals".
- builder: a homebuilder (Betenbough, D R Horton, names with Homes, Builders, Construction or Development) holding spec homes and lots. "Builders", "homebuilders", "developers".
- manager: an office whose mailing address receives the tax bills for 5+ properties from 2+ different owners. "Property managers", "management companies".
- commercial: owns a commercial (F1: shops, offices, shopping centers, restaurants' buildings) or industrial (F2: warehouses, yards) building. "Shopping center owners", "strip malls", "commercial property owners", "building owners". For warehouses set use_codes ["F2"].
- multifamily: owns an apartment building or duplex (B codes). "Apartment owners", "complexes".
- wealthy: owner-occupied homes worth at least min_value (default $1,000,000). "Wealthy", "rich", "luxury", "high-end homes", "homes worth over $X".
- recent_buyer: deed within deed_within_days (default 90). "Just bought", "new homeowners", "recently moved".
- absentee: a home whose owner's mail goes elsewhere; out of state unless out_of_state is false. "Absentee owners", "out-of-town owners".
- custom: only with explicit use_codes (A homes, B apartments, F1 commercial, F2 industrial).
Filters: min_value and max_value are dollars of the property the list is about; min_parcels is how many properties they own; zips filter the owner's MAILING zip (where letters go); streets filter the PROPERTY's street; limit caps the rows a list holds at once (up to 500, the default; the rest load page by page).`;

/** The definition as JSON schema, in the words the assistant and the tool use (dollars, snake_case). */
export const DEFINITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["who"],
  properties: {
    who: { type: "string", enum: [...WHO], description: "Who the list is of." },
    use_codes: { type: "array", items: { type: "string" }, description: "Only with who custom, or to narrow commercial to F2: appraisal use codes." },
    min_value: { type: "number", description: "Lowest value, in dollars, of the property the list is about." },
    max_value: { type: "number", description: "Highest value, in dollars." },
    min_parcels: { type: "integer", description: "At least this many properties owned." },
    owner_occupied: { type: "boolean", description: "True: the owner lives in one of their homes. False: none." },
    company_owned: { type: "boolean", description: "True: only companies. False: only people." },
    out_of_state: { type: "boolean", description: "True: mailing address outside Texas. False: inside." },
    zips: { type: "array", items: { type: "string" }, description: "Mailing zip codes to keep." },
    streets: { type: "array", items: { type: "string" }, description: "Property streets to keep, e.g. 'Midkiff Rd'." },
    deed_within_days: { type: "integer", description: "Bought within this many days." },
    limit: { type: "integer", description: "How many rows at most (1 to 500)." },
  },
} as const;

/** What the interpreter returns: a list, or why it can't make one and the closest it can. */
export const OUTREACH_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "explanation"],
  properties: {
    kind: { type: "string", enum: ["list", "cannot"] },
    title: { type: "string", description: "A name for the list, 50 characters or fewer." },
    explanation: { type: "string", description: "One sentence: what the list is and what it leaves out, or why it can't be made." },
    definition: DEFINITION_SCHEMA,
    closest: {
      type: "object",
      additionalProperties: false,
      required: ["definition", "title"],
      properties: { definition: DEFINITION_SCHEMA, title: { type: "string" } },
    },
  },
} as const;

const USE_CODE = /^[ABF]\d?$/;
const ZIP = /^\d{5}/;

/**
 * A definition from what the assistant or a tool sent (dollars, snake_case),
 * checked: unknown who, bad codes or a limit over MAX_ROWS are errors.
 */
export function definitionFromArgs(args: Record<string, unknown>, county = "Midland"): Definition {
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : undefined);
  const num = (k: string) => {
    const v = args[k];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`${k} must be a number of 0 or more`);
    return v;
  };
  const bool = (k: string) => {
    const v = args[k];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "boolean") throw new Error(`${k} must be true or false`);
    return v;
  };
  const list = (k: string) => {
    const v = args[k];
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`${k} must be a list of text`);
    const items = (v as string[]).map((x) => x.trim()).filter(Boolean);
    return items.length ? items.slice(0, 20) : undefined;
  };
  const who = str("who");
  if (!who || !(WHO as readonly string[]).includes(who)) throw new Error(`who must be one of ${WHO.join(", ")}`);
  const useCodes = list("use_codes")?.map((c) => c.toUpperCase());
  if (useCodes?.some((c) => !USE_CODE.test(c))) throw new Error("use_codes must be appraisal codes like A1, B1, F1 or F2");
  const zips = list("zips")?.map((z) => z.slice(0, 5));
  if (zips?.some((z) => !ZIP.test(z))) throw new Error("zips must be 5-digit zip codes");
  const dollars = (k: string) => {
    const v = num(k);
    return v === undefined ? undefined : Math.round(v * 100);
  };
  const limit = num("limit");
  const def: Definition = {
    county,
    who: who as Who,
    useCodes,
    minValueCents: dollars("min_value"),
    maxValueCents: dollars("max_value"),
    minParcels: num("min_parcels"),
    ownerOccupied: bool("owner_occupied"),
    companyOwned: bool("company_owned"),
    outOfState: bool("out_of_state"),
    zips,
    streets: list("streets"),
    deedWithinDays: num("deed_within_days"),
    limit: limit === undefined ? undefined : Math.max(1, Math.min(MAX_ROWS, Math.round(limit))),
  };
  if (def.minValueCents !== undefined && def.maxValueCents !== undefined && def.minValueCents > def.maxValueCents) throw new Error("min_value is above max_value");
  facetFor(def); // throws when custom has no usable code
  // Drop the undefined keys so the stored definition is exactly what was asked.
  return Object.fromEntries(Object.entries(def).filter(([, v]) => v !== undefined)) as Definition;
}

/** "$1.5M", "$1,500,000" or "1.5 million" in an ask, in cents. */
export function dollarsIn(ask: string): number | undefined {
  const m = ask.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?(m|k|million|thousand)?\b/i) ?? ask.match(/\b(\d[\d,]*(?:\.\d+)?)\s?(m|million|k|thousand)\b/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = (m[2] ?? "").toLowerCase();
  const dollars = unit.startsWith("m") ? n * 1_000_000 : unit.startsWith("k") || unit === "thousand" ? n * 1_000 : n;
  return Math.round(dollars * 100);
}

/**
 * The list an ask most likely means, from its words alone: what the page
 * builds while the assistant isn't connected. Conservative: a wrong guess
 * is worse than none.
 */
export function guessDefinition(ask: string, county = "Midland"): { definition: Definition; title: string } | undefined {
  const words = ask.toLowerCase();
  const has = (re: RegExp) => re.test(words);
  const amount = dollarsIn(ask);
  let definition: Definition | undefined;
  if (has(/\bmanag(er|ers|ement)\b/)) definition = { county, who: "manager" };
  else if (has(/\b(home)?builders?\b|\bdevelopers?\b/)) definition = { county, who: "builder" };
  else if (has(/\bwarehouse|industrial\b/)) definition = { county, who: "commercial", useCodes: ["F2"] };
  else if (has(/shopping|strip (mall|center)|retail|commercial|office building|plaza|\bcenters?\b/)) definition = { county, who: "commercial" };
  else if (has(/apartment|multi-?family|complex|duplex/)) definition = { county, who: "multifamily" };
  else if (has(/investor|landlord|flipper|rental/)) definition = { county, who: "investor" };
  else if (has(/absentee|out[- ]of[- ](state|town)/)) definition = { county, who: "absentee" };
  else if (has(/\bbought\b|new (home)?owners?|recent|just moved/)) definition = { county, who: "recent_buyer" };
  else if (has(/wealthy|\brich\b|luxury|high-end|expensive|million|\bover \$|worth/) || amount !== undefined) definition = { county, who: "wealthy" };
  if (!definition) return undefined;
  if (amount !== undefined && (definition.who === "wealthy" || definition.who === "commercial")) definition.minValueCents = amount;
  return { definition, title: defaultTitle(definition) };
}

/** A list's title when the asker gave none. */
export function defaultTitle(def: Definition): string {
  const base: Record<Who, string> = {
    investor: "Real estate investors",
    builder: "Homebuilders",
    manager: "Property managers",
    commercial: "Commercial property owners",
    multifamily: "Apartment owners",
    wealthy: "Wealthy homeowners",
    recent_buyer: "Recent buyers",
    absentee: "Absentee owners",
    custom: "Property owners",
  };
  const extra = def.minValueCents ? ` over ${shortMoney(def.minValueCents)}` : "";
  return `${base[def.who]}${extra}, ${def.county}`;
}

/** The short label a list shows for its who. */
export const WHO_LABEL: Record<Who, string> = {
  investor: "Investors",
  builder: "Homebuilders",
  manager: "Property managers",
  commercial: "Commercial owners",
  multifamily: "Apartment owners",
  wealthy: "Wealthy homeowners",
  recent_buyer: "Recent buyers",
  absentee: "Absentee owners",
  custom: "Custom",
};
