// Outreach: who's on the Midland roll, grouped into the people a contractor
// wants to reach. Pure functions: outreach.ts reads and writes, these decide
// what an owner is and what a list means.
//
// The roll holds one row per parcel. Grouped by owner and mailing address it
// becomes one row per owner, with how many properties they hold and of what
// kind. Grouped by mailing address alone it finds the offices that get the
// tax bills for several owners' properties: property managers, in practice.
import { kindOfBusiness } from "./outlets";
import { MIDLAND_PARCELS, addressKey, isCommercialUse, isCompanyOwner, isMultifamilyUse, isResidentialUse, ownerName, streetKey } from "./parcels";
import { tradesForPermit } from "./permits";
import { tradeLabel } from "./workTypes";

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

/** A property as a row shows it; `owner` rides along only where a lookup from an address needs the deed holder (the tenant list). */
export type Property = { parcelId: string; address: string; useCode: string; valueCents?: number; owner?: string };

/** A public record on one of an owner's properties, as the rebuild attaches it (lib/signals.ts). */
export type OwnerSignal = { kind: "code_violation" | "dilapidated" | "demolition" | "stalled_permit"; detail: string; date: string };
/** A person named on a contractor's permits, with what the permit gave for them. */
export type OwnerContact = { role?: string; person?: string; phone?: string; email?: string };

export type OwnerRow = {
  key: string;
  /**
   * Contractor or designer: a company on the city's permits, not an owner on
   * the roll; its parcels are permits. A designer is the architect or
   * engineer applying. An occupant is a business in a space it doesn't own
   * (a tenant); its parcels are its locations. A realtor is a licensed
   * agent or broker (TREC), who owns nothing here: no parcels at all.
   */
  kind: "owner" | "office" | "contractor" | "designer" | "occupant" | "realtor";
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
  /** The deed on the home they live in. */
  homeDeed?: string;
  useCodes: string[];
  streets: string[];
  tops: Record<string, Property>;
  owners?: number;
  /** The newest public records on their properties (SIGNAL_KEEP at most), newest first. */
  signals?: OwnerSignal[];
  /** The trades whose work this is: what the violations call for, or what a contractor's permits are for. */
  trades?: string[];
  /** When the newest signal or permit was. */
  latestAt?: string;
  /** Contractor or occupant: the people its permits (or its sales-tax permit) name, free to use. */
  contacts?: OwnerContact[];
  /** Occupant: which sources named it (occupancy, permit, outlet), what kind of business the Comptroller says it is, and the taxpayer behind it. */
  sources?: OccupantSource[];
  businessKind?: string;
  taxpayer?: string;
  /** Realtor: the license, and the brokerage they hang it with. */
  license?: RealtorLicense;
  brokerage?: string;
};

export type RealtorLicense = {
  number: string;
  type: "agent" | "broker";
  /** When first licensed, when the current license runs out, and since when they've been with the brokerage (ISO dates). */
  since?: string;
  expires?: string;
  withBrokerageSince?: string;
  /** A broker: how many agents hang their licenses with them. */
  sponsors?: number;
  supervisor: boolean;
};

export const FACETS = ["investor", "builder", "office", "commercial", "portfolio", "multifamily", "homeowner", "absentee", "out_of_state", "buyer", "long_owned", "violation", "stalled", "contractor", "designer", "occupant", "realtor"] as const;
export type Facet = (typeof FACETS)[number];

export const WHO = ["investor", "builder", "manager", "commercial", "portfolio", "multifamily", "wealthy", "recent_buyer", "absentee", "long_owned", "violation", "stalled", "contractor", "designer", "occupant", "realtor", "custom"] as const;
export type Who = (typeof WHO)[number];

export type Definition = {
  county: string;
  who: Who;
  useCodes?: string[];
  minValueCents?: number;
  maxValueCents?: number;
  /** How many they hold at least: properties, or for portfolio owners commercial buildings, or for contractors and designers permits. */
  minParcels?: number;
  /** At least this many homes they rent out (their residential properties, less the one they live in): landlords, not commercial holders. */
  minRentals?: number;
  ownerOccupied?: boolean;
  companyOwned?: boolean;
  outOfState?: boolean;
  zips?: string[];
  streets?: string[];
  deedWithinDays?: number;
  /** long_owned: the home held at least this long (default LONG_OWNED_YEARS). */
  ownedForDays?: number;
  /** violation, stalled, contractor: only owners whose records call for one of these trades. */
  trades?: string[];
  /** violation, stalled, contractor: the newest record within this many days. */
  withinDays?: number;
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
/** A home held this long is on the long-owned list: its roof, windows and systems are due. */
export const LONG_OWNED_YEARS = 20;
/** Signals this old still put an owner on the violation and stalled lists (lib/signals.ts counts code cases for as long). */
export const SIGNAL_YEARS = 2;
/** Permits this recent make a company an active contractor. */
export const CONTRACTOR_DAYS = 180;
/** A business that arrived within this many days is on the tenant list: moved in, about to build out or just did. */
export const OCCUPANT_DAYS = 365;
/** The start of the permit window, fixed once per read: a page cursor only continues the very same query, so every page must ask from the same instant. */
/** The start of the arrivals window for tenants, fixed once per read like permitsSince. */
export const occupantsSince = (now = Date.now()) => new Date(now - OCCUPANT_DAYS * 24 * 3600_000).toISOString();
export const permitsSince = (now = Date.now()) => new Date(now - CONTRACTOR_DAYS * 24 * 3600_000).toISOString();
/** This many commercial buildings make a portfolio owner: the landlord with the storefronts, whose roofs and systems come up in turn. */
export const PORTFOLIO_BUILDINGS = 2;
/** How many signals an owner row keeps, newest first. */
export const SIGNAL_KEEP = 6;
/** How many permit contacts a contractor row keeps. */
export const CONTACT_KEEP = 5;
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

const LEGAL_WORDS = new Set(["LLC", "L", "C", "LP", "P", "LLP", "LLLP", "LTD", "INC", "CORP", "CORPORATION", "CO", "COMPANY", "PC", "PLLC"]);
const NUMBERING = /^(\d+(-\d+)?|#\d+|I|II|III|IV|V|VI|VII|VIII|IX|X)$/;

/**
 * One family for a company's sister entities: "NUKA HIVA ALPHA 1-54 LLC",
 * "Nuka Hiva Alpha 55-106, LLC" and "NUKA HIVA ALPHA LLC" all give
 * "NUKA HIVA ALPHA". Only the legal words and the numbering go, so
 * "MIDLAND TX PROPERTIES" and "MIDLAND HOLDINGS" stay apart. A stem too
 * short to tell companies apart ("SMITH", "MIDLAND") forms no family.
 */
export function familyKey(name: string): string | undefined {
  const words = ownerKey(name).replace(/[^A-Z0-9#\- ]/g, " ").split(/\s+/).filter(Boolean);
  while (words.length && (LEGAL_WORDS.has(words[words.length - 1]) || NUMBERING.test(words[words.length - 1]) || (words.length > 2 && words[words.length - 1].length === 1))) words.pop();
  const stem = words.filter((w) => !LEGAL_WORDS.has(w) && !NUMBERING.test(w)).join(" ");
  if (!stem || (stem.split(" ").length < 2 && stem.length < 8)) return undefined;
  return stem;
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

const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const value = (p: Condensed) => p.marketValueCents ?? 0;
const property = (p: Condensed): Property => ({ parcelId: p.id, address: p.siteAddress, useCode: p.useCode, valueCents: p.marketValueCents });
/** How many distinct owners an office remembers by name; past this only the count grows, and it's already well past OFFICE_OWNERS. */
const OFFICE_NAMES = 50;
/** Where the owners rebuild records how it went (permitSources). */
export const OWNERS_SOURCE = "midland-owners";
/** Where the daily records pass (outreachRefresh.ts) records how it went. */
export const REFRESH_SOURCE = "midland-owners-records";
/** Bumped when the facets or rows change shape: the deploy rebuilds owners made by an older version. */
export const OWNERS_VERSION = 7;
/** A build id for the owners table: the instant it started, then a few random characters, so ids sort by time. */
export const newBuildId = () => `${new Date().toISOString()}|${Math.random().toString(36).slice(2, 8)}`;
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
  /** The deed on the home they live in (the newest, when they own several). */
  homeDeed?: string;
  useCodes: string[];
  streets: string[];
  tops: Record<string, Property>;
  /** Office only: the distinct owners billed here with how often each (the most common names it when there's no c/o line), and any past OFFICE_NAMES. */
  names?: Array<[string, number]>;
  extraOwners?: number;
  signals?: OwnerSignal[];
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
      if (p.deedDate && (!acc.homeDeed || p.deedDate > acc.homeDeed)) acc.homeDeed = p.deedDate;
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
    homeDeed: acc.homeDeed,
    useCodes: [...acc.useCodes].sort(),
    streets: acc.streets,
    tops: acc.tops,
    ...(acc.signals?.length ? { signals: acc.signals, trades: tradesForSignals(acc.signals), latestAt: acc.signals[0].date } : {}),
    owners: acc.kind === "office" ? (acc.names?.length ?? 0) + (acc.extraOwners ?? 0) : undefined,
  };
}

/** The facets an owner row is on, each with what it's sorted by. */
export function facetsOf(row: OwnerRow, now: number): Array<{ facet: Facet; sort: number }> {
  const out: Array<{ facet: Facet; sort: number }> = [];
  if (row.kind === "contractor" || row.kind === "designer") {
    // Most permits first, then the most work by value.
    out.push({ facet: row.kind, sort: row.parcels * 1e9 + Math.min(row.totalValueCents, 1e9 - 1) });
  } else if (row.kind === "occupant") {
    // Newest arrival first, within the window; a business of unknown date goes last.
    const at = row.latestAt ? Date.parse(row.latestAt) : NaN;
    if (!row.latestAt || now - at <= OCCUPANT_DAYS * DAY_MS) out.push({ facet: "occupant", sort: Number.isFinite(at) ? at : 0 });
  } else if (row.kind === "realtor") {
    // Brokers who sponsor agents first (an office's worth of referrals), then the longest licensed; one of unknown date goes last.
    const since = row.license?.since ? Date.parse(`${row.license.since}T12:00:00Z`) : NaN;
    out.push({ facet: "realtor", sort: (row.license?.sponsors ?? 0) * 1e13 + (Number.isFinite(since) ? 4e12 - since : 0) });
  } else if (row.kind === "office") {
    out.push({ facet: "office", sort: row.parcels });
  } else {
    // Their own home for LONG_OWNED_YEARS or more: longest owned first.
    if (row.homeValueCents !== undefined && !row.company && row.homeDeed && now - Date.parse(`${row.homeDeed}T12:00:00Z`) >= LONG_OWNED_YEARS * 365.25 * DAY_MS) {
      out.push({ facet: "long_owned", sort: -Date.parse(`${row.homeDeed}T12:00:00Z`) });
    }
    // A record on one of their properties within SIGNAL_YEARS: newest first.
    const since = now - SIGNAL_YEARS * 365 * DAY_MS;
    const trouble = (row.signals ?? []).filter((s) => s.kind !== "stalled_permit" && Date.parse(s.date) >= since);
    if (trouble.length) out.push({ facet: "violation", sort: Date.parse(trouble[0].date) });
    const stalled = (row.signals ?? []).filter((s) => s.kind === "stalled_permit" && Date.parse(s.date) >= since);
    if (stalled.length) out.push({ facet: "stalled", sort: Date.parse(stalled[0].date) });
    // Three or more properties, or any company holding property: an LLC with one shopping center is an investor too.
    const upper = row.name.toUpperCase();
    const holder = (row.parcels >= INVESTOR_PARCELS || row.company) && !NOT_INVESTOR.test(upper);
    // Three or more properties, or any company holding property: an LLC with one shopping center is an investor too. Builders are their own list.
    if (holder) out.push({ facet: BUILDER.test(upper) ? "builder" : "investor", sort: row.parcels * 1e9 + Math.min(row.totalValueCents, 1e9 - 1) });
    if (row.commercial > 0) out.push({ facet: "commercial", sort: row.commercialValueCents ?? 0 });
    // Several commercial buildings in private hands (the city and the districts bid their work): the most first, then by what they're worth.
    if (row.commercial >= PORTFOLIO_BUILDINGS && !NOT_INVESTOR.test(upper)) out.push({ facet: "portfolio", sort: row.commercial * 1e9 + Math.min(row.commercialValueCents ?? 0, 1e9 - 1) });
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
  /** Which owner row each parcel went into, so a signal on the parcel finds its owner. */
  private parcelOwner = new Map<string, string>();
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
    this.parcelOwner.set(p.id, key);
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

  /**
   * A public record on one of an owner's parcels, after the roll is in:
   * kept newest first, SIGNAL_KEEP at most, and the newest one's property
   * becomes the row's "signal" property. A parcel off the roll is ignored.
   */
  addSignal(parcelId: string, signal: OwnerSignal, property: Property): boolean {
    const key = this.parcelOwner.get(parcelId);
    const g = key ? this.byOwner.get(key) : undefined;
    if (!g) return false;
    const list = g.signals ?? [];
    list.push(signal);
    list.sort((a, b) => b.date.localeCompare(a.date));
    g.signals = list.slice(0, SIGNAL_KEEP);
    if (g.signals[0] === signal) g.tops.signal = property;
    return true;
  }

  addSignals(rows: Array<{ parcelId: string; signal: OwnerSignal; property: Property }>) {
    let attached = 0;
    for (const r of rows) if (this.addSignal(r.parcelId, r.signal, r.property)) attached++;
    return attached;
  }

  /** The owner-row key a parcel folds into, the same one `add` uses. */
  static keyFor(p: Pick<Condensed, "owner" | "mailing">): string | undefined {
    const ok = ownerKey(p.owner);
    return ok ? `${ok}|${mailKey(p.mailing) ?? ""}` : undefined;
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

// ---- What the records call for ----

/** The trades Outreach knows, as the permit feed names them (lib/permits.ts). */
export const TRADES = ["general-construction", "roofing", "concrete", "drywall", "window-door", "handyman", "painting", "electrical", "plumbing", "hvac", "outdoor-construction"] as const;

/** What a code violation's wording says needs doing, and by whom. Unmatched violations (zoning, signs, parking) call for no trade. */
const VIOLATION_TRADES: Array<[RegExp, string[]]> = [
  [/\broof/i, ["roofing", "general-construction"]],
  [/deteriorat|structur|unsafe|substandard|minimum housing|collaps|dangerous building|unsecured/i, ["general-construction", "roofing"]],
  [/without (a )?permit|unpermitted|no permit/i, ["general-construction"]],
  [/\bfenc/i, ["outdoor-construction"]],
  [/weeds?|grass|vegetation|brush|\blawn|\btrees?\b|landscap/i, ["outdoor-construction"]],
  [/debris|trash|junk|rubbish|litter|refuse|accumulation|\bvehicles?\b|dumping/i, ["handyman", "general-construction"]],
  [/paint|graffiti|exterior (finish|surface)|siding|stucco|facade/i, ["painting"]],
  [/window|\bdoors?\b|glass|screen/i, ["window-door"]],
  [/electric|wiring/i, ["electrical"]],
  [/plumb|sewer|water (leak|line|heater)|septic|drain/i, ["plumbing"]],
  [/\bpool|\bspa\b/i, ["outdoor-construction"]],
  [/driveway|sidewalk|concrete|paving|curb|slab/i, ["concrete"]],
  [/demoli/i, ["general-construction"]],
];

/** The trades one record calls for. */
export function tradesForSignal(s: Pick<OwnerSignal, "kind" | "detail">): string[] {
  if (s.kind === "stalled_permit") return tradesForPermit(s.detail.split(":")[0]);
  if (s.kind === "demolition") return ["general-construction"];
  if (s.kind === "dilapidated") return ["general-construction", "roofing"];
  const out: string[] = [];
  for (const [re, trades] of VIOLATION_TRADES) if (re.test(s.detail)) for (const t of trades) if (!out.includes(t)) out.push(t);
  return out;
}

/** The trades an owner's records call for, in order of first mention. */
export function tradesForSignals(signals: OwnerSignal[]): string[] {
  const out: string[] = [];
  for (const s of signals) for (const t of tradesForSignal(s)) if (!out.includes(t)) out.push(t);
  return out;
}

/**
 * A stored owner row with one more of the city's records on it, the way the
 * weekly build would have folded it: newest first, SIGNAL_KEEP at most, the
 * newest one's property as the row's "signal" property, trades and latestAt
 * redone. Returns the row unchanged when the record is already on it, so the
 * daily pass can tell a real change from a repeat.
 */
export function withSignal<R extends Pick<OwnerRow, "signals" | "trades" | "latestAt" | "tops">>(row: R, signal: OwnerSignal, property: Property): R {
  const have = row.signals ?? [];
  if (have.some((s) => s.kind === signal.kind && s.date === signal.date && s.detail === signal.detail)) return row;
  const signals = [...have, signal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, SIGNAL_KEEP);
  if (!signals.includes(signal)) return row;
  const tops = signals[0] === signal ? { ...row.tops, signal: property } : row.tops;
  return { ...row, signals, trades: tradesForSignals(signals), latestAt: signals[0].date, tops };
}

/** "OAK PLAZA LLC" and "Oak Plaza, L.L.C." are one company. */
export const companyKey = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LLC|L L C|INC|LTD|LP|LLP|CORP|CORPORATION|CO|COMPANY|THE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A company's part on a permit: the contractor building it, or the designer (architect, engineer) who applied for it. */
export type PermitKind = "contractor" | "designer";

/** One permit as the rebuild reads it: a company on it, and what it tells about them. */
export type CondensedPermit = {
  /** The company this row is about: the builder, or for a designer row the firm that applied. */
  builder: string;
  kind?: PermitKind;
  trades: string[];
  address?: string;
  addressKey?: string;
  appliedAt: string;
  valuationCents?: number;
  residential?: boolean;
  /** The permit's contacts for the builder's own company (the owner's and other contractors' are left out). */
  contacts?: OwnerContact[];
};

type ContractorAcc = {
  key: string;
  name: string;
  permits: number;
  residential: number;
  commercial: number;
  total: number;
  max: number;
  trades: string[];
  latestAt: string;
  /** Newest first, a few: the one on the roll becomes the row's property. */
  addressKeys: string[];
  contacts: OwnerContact[];
};

const digits10 = (phone: string | undefined) => {
  const d = (phone ?? "").replace(/\D/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 ? n : undefined;
};

/** A contact's role that says they drew the plans. */
const DESIGNER_ROLE = /architect|engineer|design/i;
const APPLICANT_ROLE = /applicant/i;
const OWNER_ROLE = /owner|tenant/i;
/** A company name that says it builds rather than designs: an applicant with one of these is a contractor applying for itself. */
const TRADE_NAME = /\b(CONSTRUCTION|CONTRACTORS?|CONTRACTING|BUILDERS?|HOMES|ROOFING|ELECTRIC(AL)?|PLUMBING|HVAC|MECHANICAL|AIR|CONCRETE|PAINTING|REMODEL(ING)?|FENCE|POOLS?|SIGNS?)\b/;

export type PermitContact = { role?: string; company?: string; person?: string; phone?: string; email?: string };

/**
 * The design firms on a commercial permit: a contact whose role says
 * architect or engineer, or the applicant when it's a separate company
 * from the owner and the builder and isn't named like a trade. Each with
 * the permit's contacts for that company. Residential permits are left
 * alone: the applicant there is the homeowner or the builder.
 */
export function designersOn(permit: { builder?: string; residential?: boolean; contacts?: PermitContact[] }): Array<{ company: string; contacts: OwnerContact[] }> {
  if (permit.residential !== false) return [];
  const contacts = permit.contacts ?? [];
  const builder = permit.builder ? companyKey(permit.builder) : "";
  const owners = new Set(contacts.filter((c) => c.role && OWNER_ROLE.test(c.role)).map((c) => companyKey(c.company ?? "")).filter(Boolean));
  const firms = new Map<string, string>();
  for (const c of contacts) {
    if (!c.company || !c.role) continue;
    const key = companyKey(c.company);
    if (!key || key === builder || owners.has(key)) continue;
    const designer = DESIGNER_ROLE.test(c.role) || (APPLICANT_ROLE.test(c.role) && !TRADE_NAME.test(key));
    if (designer && !firms.has(key)) firms.set(key, c.company);
  }
  return [...firms].map(([key, company]) => ({
    company,
    contacts: contacts.filter((c) => companyKey(c.company ?? "") === key).map((c) => ({ role: c.role, person: c.person, phone: c.phone, email: c.email })),
  }));
}

// ---- Tenants: the business in a space it doesn't own ----

/**
 * Where a tenant's name comes from, in the order the list trusts them: the
 * certificate of occupancy a business needs to move in; the "owner" a
 * contractor put on a commercial permit when it isn't the deed holder (a
 * tenant paying for its own work); the Comptroller's sales-tax permit at the
 * address, for the businesses the city's records never named.
 */
export type OccupantSource = "occupancy" | "permit" | "outlet";

/** One sighting of a business at an address, from one of those sources. */
export type CondensedOccupant = {
  business: string;
  source: OccupantSource;
  address?: string;
  addressKey?: string;
  /** When they arrived: the certificate's date, the permit's, or when they started selling. */
  at?: string;
  contacts?: PermitContact[];
  mailing?: Mailing;
  taxpayer?: string;
  naics?: string;
};

/**
 * The businesses a permit names as being there: on a certificate of
 * occupancy, the applicant (or the "owner" contact; the description names
 * the business when the portal has no contacts). On a commercial building
 * permit, the owner-role contacts, which may be the deed holder; the
 * grouper settles that once it knows who owns the parcel.
 */
export function occupantsOn(permit: { name: string; detail?: string; residential?: boolean; appliedAt: string; address?: string; addressKey?: string; builder?: string; contacts?: PermitContact[] }): CondensedOccupant[] {
  const contacts = permit.contacts ?? [];
  const at = permit.appliedAt;
  const where = { address: permit.address, addressKey: permit.addressKey, at };
  const builder = permit.builder ? companyKey(permit.builder) : "";
  const forCompany = (company: string) => contacts.filter((c) => companyKey(c.company ?? "") === companyKey(company)).map((c) => ({ role: c.role, person: c.person, phone: c.phone, email: c.email }));
  if (permit.name === "Certificate of Occupancy") {
    const named = contacts.find((c) => c.company && c.role && APPLICANT_ROLE.test(c.role)) ?? contacts.find((c) => c.company && c.role && OWNER_ROLE.test(c.role)) ?? contacts.find((c) => c.company);
    const business = named?.company ?? permit.detail?.trim();
    if (!business || /^certificate of occupancy$/i.test(business)) return [];
    return [{ business, source: "occupancy", ...where, contacts: forCompany(business) }];
  }
  if (permit.residential !== false) return [];
  const out: CondensedOccupant[] = [];
  const seen = new Set<string>();
  for (const c of contacts) {
    if (!c.company || !c.role || !OWNER_ROLE.test(c.role)) continue;
    const key = companyKey(c.company);
    if (!key || key === builder || seen.has(key)) continue;
    seen.add(key);
    out.push({ business: c.company, source: "permit", ...where, contacts: forCompany(c.company) });
  }
  return out;
}

/**
 * Whether two names are the same party for the purpose of "is the business
 * the landlord": the same words in any order ("SMITH JOHN" and "John Smith"),
 * or one name's words all inside the other's ("OAK PLAZA" in "OAK PLAZA
 * HOLDINGS LLC").
 */
export function sameParty(a: string, b: string): boolean {
  const words = (s: string) => new Set(companyKey(s).split(" ").filter((w) => w.length > 1));
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return false;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

type OccupantAcc = {
  key: string;
  name: string;
  nameAt: string;
  locations: Map<string, { address: string; at: string; sources: Set<OccupantSource> }>;
  sources: Set<OccupantSource>;
  contacts: OwnerContact[];
  mailing?: Mailing;
  taxpayer?: string;
  naics?: string;
  latestAt: string;
};

/**
 * The businesses in spaces they don't own, grouped: every sighting of one
 * business, whichever source saw it, on one row. `grouped` gives each its
 * newest location that's a non-residential parcel on the roll, drops one
 * whose only evidence is a permit "owner" who turns out to be the deed
 * holder, and leaves out a business with no such location at all.
 */
export class OccupantGrouper {
  private byBusiness = new Map<string, OccupantAcc>();

  add(o: CondensedOccupant) {
    const key = companyKey(o.business);
    if (!key || !o.addressKey || !o.address) return;
    const at = o.at ?? "0000";
    let c = this.byBusiness.get(key);
    if (!c) {
      c = { key: `occupant:${key}`, name: o.business, nameAt: at, locations: new Map(), sources: new Set(), contacts: [], latestAt: at };
      this.byBusiness.set(key, c);
    }
    // The certificate's spelling of the name beats a permit's, which beats the Comptroller's all-caps.
    const rank = (s: OccupantSource) => (s === "occupancy" ? 2 : s === "permit" ? 1 : 0);
    const best = [...c.sources].reduce((m, s) => Math.max(m, rank(s)), -1);
    if (rank(o.source) > best || (rank(o.source) === best && at > c.nameAt)) {
      c.name = o.business;
      c.nameAt = at;
    }
    c.sources.add(o.source);
    const loc = c.locations.get(o.addressKey);
    if (loc) {
      if (at > loc.at) loc.at = at;
      loc.sources.add(o.source);
    } else c.locations.set(o.addressKey, { address: o.address, at, sources: new Set([o.source]) });
    if (at > c.latestAt) c.latestAt = at;
    if (o.mailing && !c.mailing) c.mailing = o.mailing;
    if (o.taxpayer && !c.taxpayer) c.taxpayer = o.taxpayer;
    if (o.naics && !c.naics) c.naics = o.naics;
    for (const x of o.contacts ?? []) {
      const phone = digits10(x.phone);
      const email = x.email?.trim().toLowerCase() || undefined;
      const person = x.person?.trim() || undefined;
      if (!phone && !email && !person) continue;
      const same = c.contacts.find((y) => (phone && y.phone === phone) || (email && y.email === email) || (person && y.person?.toUpperCase() === person.toUpperCase()));
      if (same) {
        if (!same.phone && phone) same.phone = phone;
        if (!same.email && email) same.email = email;
        if (!same.person && person) same.person = person;
        continue;
      }
      if (c.contacts.length < CONTACT_KEEP) c.contacts.push({ role: x.role, person, phone, email: email && email.includes("@") ? email : undefined });
    }
  }

  addAll(rows: CondensedOccupant[]) {
    for (const o of rows) this.add(o);
    return this;
  }

  get size() {
    return this.byBusiness.size;
  }

  async grouped(lookup: (addressKeys: string[]) => Promise<Record<string, Property>>, now = Date.now()): Promise<GroupedRow[]> {
    const all = [...this.byBusiness.values()];
    const keys = [...new Set(all.flatMap((c) => [...c.locations.keys()]))];
    const found = keys.length ? await lookup(keys) : {};
    const out: GroupedRow[] = [];
    for (const c of all) {
      // Newest location first; only parcels on the roll that aren't homes count as a storefront.
      const locations = [...c.locations].sort((a, b) => b[1].at.localeCompare(a[1].at)).filter(([k]) => found[k] && !isResidentialUse(found[k].useCode));
      const here = locations.find(([k, loc]) => !(loc.sources.size === 1 && loc.sources.has("permit") && found[k].owner && sameParty(c.name, found[k].owner!)));
      if (!here) continue;
      const [key, loc] = here;
      const property = found[key];
      // The taxpayer behind a sales-tax permit is often the owner by name: a person to ask for.
      const contacts = [...c.contacts];
      if (c.taxpayer && !isCompanyOwner(c.taxpayer) && !sameParty(c.taxpayer, c.name) && !contacts.some((x) => x.person) && contacts.length < CONTACT_KEEP) contacts.push({ role: "Sales-tax permit holder", person: displayName(c.taxpayer) });
      const owner: OwnerRow = {
        key: c.key,
        kind: "occupant",
        name: displayName(c.name),
        company: true,
        mailing: c.mailing ?? {},
        parcels: locations.length,
        residential: 0,
        multifamily: 0,
        commercial: locations.length,
        totalValueCents: property.valueCents ?? 0,
        maxValueCents: property.valueCents ?? 0,
        ownerOccupied: false,
        outOfState: outOfState(c.mailing ?? {}),
        useCodes: [property.useCode],
        streets: [],
        tops: { all: property },
        latestAt: loc.at === "0000" ? undefined : loc.at,
        sources: [...c.sources].sort(),
        ...(kindOfBusiness(c.naics) ? { businessKind: kindOfBusiness(c.naics) } : {}),
        ...(c.taxpayer ? { taxpayer: displayName(c.taxpayer) } : {}),
        ...(contacts.length ? { contacts } : {}),
      };
      out.push({ owner, facets: facetsOf(owner, now) });
    }
    return out;
  }
}

/**
 * The companies on the city's permits, grouped: how much they're building
 * (or, for designers, drawing), for whom, and the people the permits name.
 * Not owners on the roll, but who a sub or a supplier sells to. `rows`
 * leaves the property for the action to fill from the roll (`addressKeys`,
 * newest first).
 */
export class ContractorGrouper {
  private byCompany = new Map<string, ContractorAcc>();

  constructor(readonly kind: PermitKind = "contractor") {}

  add(p: CondensedPermit) {
    if ((p.kind ?? "contractor") !== this.kind) return;
    const key = companyKey(p.builder);
    if (!key) return;
    let c = this.byCompany.get(key);
    if (!c) {
      c = { key: `${this.kind}:${key}`, name: p.builder, permits: 0, residential: 0, commercial: 0, total: 0, max: 0, trades: [], latestAt: p.appliedAt, addressKeys: [], contacts: [] };
      this.byCompany.set(key, c);
    }
    c.permits++;
    if (p.residential === true) c.residential++;
    if (p.residential === false) c.commercial++;
    const v = p.valuationCents ?? 0;
    c.total += v;
    if (v > c.max) c.max = v;
    for (const t of p.trades) if (!c.trades.includes(t)) c.trades.push(t);
    if (p.appliedAt > c.latestAt) {
      c.latestAt = p.appliedAt;
      c.name = p.builder;
      if (p.addressKey) c.addressKeys.unshift(p.addressKey);
    } else if (p.addressKey) c.addressKeys.push(p.addressKey);
    c.addressKeys = c.addressKeys.slice(0, 3);
    for (const x of p.contacts ?? []) {
      const phone = digits10(x.phone);
      const email = x.email?.trim().toLowerCase() || undefined;
      const person = x.person?.trim() || undefined;
      if (!phone && !email && !person) continue;
      const same = c.contacts.find((y) => (phone && y.phone === phone) || (email && y.email === email) || (person && y.person?.toUpperCase() === person.toUpperCase()));
      if (same) {
        if (!same.phone && phone) same.phone = phone;
        if (!same.email && email) same.email = email;
        if (!same.person && person) same.person = person;
        continue;
      }
      if (c.contacts.length < CONTACT_KEEP) c.contacts.push({ role: x.role, person, phone, email: email && email.includes("@") ? email : undefined });
    }
  }

  addAll(rows: CondensedPermit[]) {
    for (const p of rows) this.add(p);
    return this;
  }

  get size() {
    return this.byCompany.size;
  }

  /**
   * Each company as an owner row with its property found through `lookup`
   * (the roll's parcel at each address key): the one at its newest permit
   * address that is on the roll. A company with none is left out.
   */
  async grouped(lookup: (addressKeys: string[]) => Promise<Record<string, Property>>, now = Date.now()): Promise<GroupedRow[]> {
    const rows = this.rows();
    const found = rows.length ? await lookup(rows.flatMap((r) => r.addressKeys)) : {};
    const out: GroupedRow[] = [];
    for (const { owner, addressKeys } of rows) {
      const key = addressKeys.find((k) => found[k]);
      if (!key) continue;
      owner.tops = { all: found[key] };
      out.push({ owner, facets: facetsOf(owner, now) });
    }
    return out;
  }

  /** Each company as an owner row without its property, and where to look for one. */
  rows(): Array<{ owner: OwnerRow; addressKeys: string[] }> {
    return [...this.byCompany.values()].map((c) => ({
      owner: {
        key: c.key,
        kind: this.kind,
        name: displayName(c.name),
        company: true,
        mailing: {},
        parcels: c.permits,
        residential: c.residential,
        multifamily: 0,
        commercial: c.commercial,
        totalValueCents: c.total,
        maxValueCents: c.max,
        ownerOccupied: false,
        outOfState: false,
        useCodes: [],
        streets: [],
        tops: {},
        trades: [...c.trades].sort(),
        latestAt: c.latestAt,
        ...(c.contacts.length ? { contacts: c.contacts } : {}),
      },
      addressKeys: c.addressKeys,
    }));
  }
}

// ---- Realtors: the agents and brokers who refer work ----

/** One active license holder, as the rebuild reads it (lib/realtors.ts). */
export type CondensedRealtor = {
  licenseNumber: string;
  type: "agent" | "broker" | "brokerage";
  name: string;
  first?: string;
  last?: string;
  licensedAt?: string;
  expiresAt?: string;
  brokerage?: { licenseNumber: string; name: string; type: "agent" | "broker" | "brokerage" };
  brokerageSince?: string;
  supervisor: boolean;
};

/** "TERRY LANCE MARKER" with first and last given → "Terry Marker"; else the name as printed, title-cased. */
export const realtorName = (r: Pick<CondensedRealtor, "name" | "first" | "last">) => displayName(r.first && r.last ? `${r.first} ${r.last}` : r.name);

/**
 * One row per agent and per individual broker; a brokerage company is the
 * `brokerage` on its agents' rows, not a row of its own. A broker's row
 * counts the agents who hang their licenses with them. No parcels: a
 * realtor owns nothing here, and the lookups work from the name and the
 * brokerage.
 */
export class RealtorGrouper {
  private rows = new Map<string, CondensedRealtor>();

  add(r: CondensedRealtor) {
    if (!r.licenseNumber || !r.name) return;
    this.rows.set(r.licenseNumber, r);
  }

  addAll(rows: CondensedRealtor[]) {
    for (const r of rows) this.add(r);
    return this;
  }

  get size() {
    return this.rows.size;
  }

  *grouped(now: number): Generator<GroupedRow> {
    const sponsors = new Map<string, number>();
    for (const r of this.rows.values()) if (r.brokerage) sponsors.set(r.brokerage.licenseNumber, (sponsors.get(r.brokerage.licenseNumber) ?? 0) + 1);
    for (const r of this.rows.values()) {
      if (r.type === "brokerage") continue;
      const sponsored = sponsors.get(r.licenseNumber);
      const owner: OwnerRow = {
        key: `realtor:${r.licenseNumber}`,
        kind: "realtor",
        name: realtorName(r),
        company: false,
        // Where they work from, as far as the state says: the county.
        mailing: { city: MIDLAND_PARCELS.county, state: "TX" },
        parcels: 0,
        residential: 0,
        multifamily: 0,
        commercial: 0,
        totalValueCents: 0,
        maxValueCents: 0,
        ownerOccupied: false,
        outOfState: false,
        useCodes: [],
        streets: [],
        tops: {},
        license: {
          number: r.licenseNumber,
          type: r.type,
          ...(r.licensedAt ? { since: r.licensedAt } : {}),
          ...(r.expiresAt ? { expires: r.expiresAt } : {}),
          ...(r.brokerageSince ? { withBrokerageSince: r.brokerageSince } : {}),
          ...(sponsored ? { sponsors: sponsored } : {}),
          supervisor: r.supervisor,
        },
        ...(r.brokerage ? { brokerage: displayName(r.brokerage.name) } : {}),
      };
      yield { owner, facets: facetsOf(owner, now) };
    }
  }
}

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
    case "portfolio":
      return "portfolio";
    case "multifamily":
      return "multifamily";
    case "wealthy":
      return "homeowner";
    case "recent_buyer":
      return "buyer";
    case "absentee":
      return def.outOfState === false ? "absentee" : "out_of_state";
    case "long_owned":
      // Under the facet's own threshold, the whole homeowner facet has to be read.
      return def.ownedForDays !== undefined && def.ownedForDays < LONG_OWNED_YEARS * 365.25 ? "homeowner" : "long_owned";
    case "violation":
      return "violation";
    case "stalled":
      return "stalled";
    case "contractor":
      return "contractor";
    case "designer":
      return "designer";
    case "occupant":
      return "occupant";
    case "realtor":
      return "realtor";
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
    case "long_owned":
      return row.homeValueCents ?? 0;
    case "violation":
    case "stalled":
      return row.tops.signal?.valueCents ?? row.maxValueCents;
    case "contractor":
    case "designer":
      return row.totalValueCents;
    case "occupant":
    case "realtor":
      return row.maxValueCents;
    case "absentee":
    case "out_of_state":
      return row.rentalValueCents ?? 0;
    case "commercial":
    case "portfolio":
      return row.commercialValueCents ?? 0;
    case "multifamily":
      return row.multifamilyValueCents ?? 0;
    default:
      return row.maxValueCents;
  }
}

/** The property shown for a row on a list: the one the facet is about. */
export function propertyFor(row: OwnerRow, facet: Facet): Property | undefined {
  const pick = { homeowner: "home", long_owned: "home", absentee: "rental", out_of_state: "rental", commercial: "commercial", portfolio: "commercial", multifamily: "multifamily", violation: "signal", stalled: "signal" } as Partial<Record<Facet, string>>;
  return row.tops[pick[facet] ?? "all"] ?? row.tops.all;
}

/** The records a facet is about: violations (and the dilapidated and demolition listings), or stalled permits. */
export const signalsFor = (row: OwnerRow, facet: Facet): OwnerSignal[] =>
  (row.signals ?? []).filter((s) => (facet === "stalled" ? s.kind === "stalled_permit" : s.kind !== "stalled_permit"));

/** When the newest record a facet is about was: the newest signal of its kind, or a contractor's newest permit. */
export function recordDate(row: OwnerRow, facet: Facet): string | undefined {
  if (facet === "contractor" || facet === "designer" || facet === "occupant") return row.latestAt;
  if (facet === "violation" || facet === "stalled") return signalsFor(row, facet)[0]?.date;
  return undefined;
}

/**
 * A facet is read top-down by what it's sorted on, so once a row is under
 * the definition's floor on that measure, nothing after it can match and
 * the read can stop: holdings for investors, builders and offices, value
 * for the rest. Buyers are sorted by deed date, which has no floor here.
 */
export function underFloor(row: OwnerRow, def: Definition, facet: Facet): boolean {
  if (facet === "investor" || facet === "builder" || facet === "office" || facet === "contractor" || facet === "designer" || facet === "portfolio") return def.minParcels !== undefined && holdings(row, facet) < def.minParcels;
  if (facet === "buyer" || facet === "realtor") return false;
  // Longest owned first: once a home was bought after the cutoff, every one after it was too.
  if (facet === "long_owned") return def.ownedForDays !== undefined && Boolean(row.homeDeed) && Date.parse(`${row.homeDeed}T12:00:00Z`) > Date.now() - def.ownedForDays * DAY_MS;
  // Newest record first: once one is older than the window, the rest are too.
  if (facet === "violation" || facet === "stalled" || facet === "occupant") {
    const at = recordDate(row, facet);
    return def.withinDays !== undefined && at !== undefined && Date.parse(at) < Date.now() - def.withinDays * DAY_MS;
  }
  const minValue = def.minValueCents ?? (def.who === "wealthy" ? WEALTHY_DEFAULT_CENTS : undefined);
  return minValue !== undefined && facetValue(row, facet) < minValue;
}

/** The homes an owner rents out: their residential properties, less the one they live in. */
export const rentalHomes = (row: Pick<OwnerRow, "residential" | "ownerOccupied">) => Math.max(0, row.residential - (row.ownerOccupied ? 1 : 0));

/** What minParcels counts on a facet: commercial buildings for portfolio owners, else the row's parcels (permits for a contractor or designer). */
export const holdings = (row: OwnerRow, facet: Facet) => (facet === "portfolio" ? row.commercial : row.parcels);

/** The filters a definition adds on top of its facet, plus the wealthy and buyer defaults. */
export function matches(row: OwnerRow, def: Definition, facet: Facet, now: number): boolean {
  const minValue = def.minValueCents ?? (def.who === "wealthy" ? WEALTHY_DEFAULT_CENTS : undefined);
  const v = facetValue(row, facet);
  if (minValue !== undefined && v < minValue) return false;
  if (def.maxValueCents !== undefined && v > def.maxValueCents) return false;
  if (def.minParcels !== undefined && holdings(row, facet) < def.minParcels) return false;
  if (def.minRentals !== undefined && rentalHomes(row) < def.minRentals) return false;
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
  const owned = def.ownedForDays ?? (def.who === "long_owned" ? LONG_OWNED_YEARS * 365.25 : undefined);
  if (owned !== undefined) {
    if (!row.homeDeed || row.homeValueCents === undefined || row.company) return false;
    if (now - Date.parse(`${row.homeDeed}T12:00:00Z`) < owned * DAY_MS) return false;
  }
  if (def.trades?.length && !(row.trades ?? []).some((t) => def.trades!.includes(t))) return false;
  if (def.withinDays !== undefined) {
    const at = recordDate(row, facet);
    if (!at || now - Date.parse(at) > def.withinDays * DAY_MS) return false;
  }
  return true;
}

/**
 * The order a list's rows come in, the same one its facet is read in: the
 * biggest holders first for investors, builders and managers; the most
 * valuable property first for the rest. Recent buyers come as pulled,
 * newest deed first. `key` ranks a saved row; higher comes first.
 */
export function listOrder(def: Definition): { label: string; key: (row: { properties: number; totalValueCents: number; property?: { valueCents?: number } }) => number } {
  const facet = facetFor(def);
  if (facet === "investor" || facet === "builder") return { label: "most properties first", key: (r) => r.properties * 1e9 + Math.min(r.totalValueCents, 1e9 - 1) };
  if (facet === "contractor" || facet === "designer") return { label: "most permits first", key: (r) => r.properties * 1e9 + Math.min(r.totalValueCents, 1e9 - 1) };
  if (facet === "office") return { label: "most properties first", key: (r) => r.properties };
  if (facet === "portfolio") return { label: "most buildings first", key: () => 0 };
  if (facet === "buyer") return { label: "newest deed first", key: () => 0 };
  if (facet === "long_owned") return { label: "longest owned first", key: () => 0 };
  if (facet === "violation" || facet === "stalled") return { label: "newest record first", key: () => 0 };
  if (facet === "occupant") return { label: "newest arrival first", key: () => 0 };
  if (facet === "realtor") return { label: "sponsoring brokers first, then longest licensed", key: () => 0 };
  return { label: "highest value first", key: (r) => r.property?.valueCents ?? r.totalValueCents };
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
    case "portfolio":
      return `Owns ${plural(row.commercial, "commercial building")}, the biggest worth ${shortMoney(row.commercialValueCents ?? 0)}${row.parcels > row.commercial ? `; ${plural(row.parcels, "property", "properties")} in all` : ""}`;
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
    case "long_owned":
      return `Owner-occupied since ${row.homeDeed ? monthYear(row.homeDeed) : "before the roll"}, home worth ${shortMoney(row.homeValueCents ?? 0)}`;
    case "violation": {
      const records = signalsFor(row, facet);
      const newest = records[0];
      if (!newest) return "Code violation";
      const more = records.length > 1 ? `; ${plural(records.length, "record")} since ${monthYear(records[records.length - 1].date)}` : "";
      return `${SIGNAL_TEXT[newest.kind]} ${monthYear(newest.date)}: ${newest.detail}${more}`;
    }
    case "stalled": {
      const newest = signalsFor(row, facet)[0];
      return newest ? `Permit stalled ${monthYear(newest.date)}: ${newest.detail.replace(": ", ", ")}` : "Stalled permit";
    }
    case "contractor": {
      const mix = [row.residential ? plural(row.residential, "residential") : "", row.commercial ? plural(row.commercial, "commercial") : ""].filter(Boolean).join(", ");
      const trades = row.trades?.length ? `; ${row.trades.map(tradeLabel).join(", ")}` : "";
      return `Pulled ${plural(row.parcels, "permit")} in the last ${CONTRACTOR_DAYS} days${mix ? ` (${mix})` : ""}${row.totalValueCents ? `, ${shortMoney(row.totalValueCents)} of work` : ""}${trades}`;
    }
    case "designer": {
      const trades = row.trades?.length ? `; ${row.trades.map(tradeLabel).join(", ")}` : "";
      return `Applied for ${plural(row.parcels, "commercial permit")} in the last ${CONTRACTOR_DAYS} days${row.totalValueCents ? `, ${shortMoney(row.totalValueCents)} of work` : ""}${trades}`;
    }
    case "realtor": {
      const l = row.license;
      if (!l) return "Licensed real estate agent";
      const what = l.type === "broker" ? "Broker" : "Sales agent";
      const where = row.brokerage ? ` with ${row.brokerage}${l.withBrokerageSince ? ` since ${monthYear(l.withBrokerageSince)}` : ""}` : "";
      const since = l.since ? `, licensed since ${l.since.slice(0, 4)}` : "";
      const sponsors = l.sponsors ? `; sponsors ${plural(l.sponsors, "agent")}` : l.supervisor ? "; runs an office" : "";
      const through = l.expires ? `; license through ${monthYear(l.expires)}` : "";
      return `${what}${where}${since}${sponsors}${through}`;
    }
    case "occupant": {
      const here = row.tops.all;
      const seen = (row.sources ?? []).map((x) => SOURCE_TEXT[x]).join(", ");
      const more = row.parcels > 1 ? `; ${plural(row.parcels, "location")} here` : "";
      const what = [row.businessKind, row.taxpayer && !sameParty(row.taxpayer, row.name) ? `run by ${row.taxpayer}` : ""].filter(Boolean).join(", ");
      return `${row.latestAt ? `Moved into ${ownerName(here.address)} ${monthYear(row.latestAt)}` : `In ${ownerName(here.address)}`}, a space they don't own${seen ? ` (${seen})` : ""}${more}${what ? `; ${what}` : ""}`;
    }
  }
}

const SOURCE_TEXT: Record<OccupantSource, string> = { occupancy: "certificate of occupancy", permit: "named on a permit", outlet: "sales-tax permit" };

const SIGNAL_TEXT: Record<OwnerSignal["kind"], string> = { code_violation: "Code violation", dilapidated: "Listed dilapidated", demolition: "Demolition order", stalled_permit: "Permit stalled" };

// ---- What the assistant and the tool take ----

/** The `who` guide, as the interpreter's system prompt and the tool's description both state it. */
export const WHO_GUIDE = `Pick exactly one who:
- investor: owns 3 or more Midland properties, or a company (LLC, LP, trust company) that owns any; homebuilders are left out. "Investors", "landlords", "flippers", "people who own rentals".
- builder: a homebuilder (Betenbough, D R Horton, names with Homes, Builders, Construction or Development) holding spec homes and lots. "Builders", "homebuilders", "developers".
- manager: an office whose mailing address receives the tax bills for 5+ properties from 2+ different owners. "Property managers", "management companies".
- commercial: owns a commercial (F1: shops, offices, shopping centers, restaurants' buildings) or industrial (F2: warehouses, yards) building. "Shopping center owners", "strip malls", "commercial property owners", "building owners". For warehouses set use_codes ["F2"].
- portfolio: owns ${PORTFOLIO_BUILDINGS} or more commercial buildings (storefronts, shops, offices), most buildings first: the landlord whose roofs and systems come due in turn; min_parcels is how many buildings. "Retail owners", "shop owners", "storefront owners", "owners of several buildings", "commercial portfolios", "one owner with many stores".
- multifamily: owns an apartment building or duplex (B codes). "Apartment owners", "complexes".
- wealthy: owner-occupied homes worth at least min_value (default $1,000,000). "Wealthy", "rich", "luxury", "high-end homes", "homes worth over $X".
- recent_buyer: deed within deed_within_days (default 90). "Just bought", "new homeowners", "recently moved".
- absentee: a home whose owner's mail goes elsewhere; out of state unless out_of_state is false. "Absentee owners", "out-of-town owners".
- long_owned: people in their own home for owned_for_years or more (default ${LONG_OWNED_YEARS}), whose roof, windows and systems are due. "Long-time homeowners", "owned 20+ years", "older homes", "empty nesters".
- violation: owners of a property with a code violation, a dilapidated-building listing or a demolition order from the city in the last ${SIGNAL_YEARS} years, newest first; set trades to keep only violations that call for that work (a roofer wants roof and deteriorated-structure cases). "Code violations", "fix-it list", "condemned", "dilapidated", "blighted".
- stalled: owners whose building permit stopped (expired, stop-work order, denied) in the last ${SIGNAL_YEARS} years: a job somebody never finished. "Stalled permits", "expired permits", "unfinished jobs".
- contractor: NOT owners: the companies that pulled city permits in the last ${CONTRACTOR_DAYS} days, with the people the permits name, for a sub or supplier who sells to builders and GCs; set trades to the work they pull permits for. "Contractors", "GCs", "builders pulling permits", "who's building right now", "roofing contractors".
- designer: NOT owners: the architects, engineers and design firms named on commercial permits in the last ${CONTRACTOR_DAYS} days (the applicant when it's neither the owner nor the builder), with the people the permits name; they spec the work before a contractor is picked. "Architects", "engineers", "design firms", "who's drawing the plans".
- occupant: NOT owners: the businesses that moved into a space they don't own in the last ${OCCUPANT_DAYS} days (tenants on a lease who pay for their own build-outs), newest first, from the city's certificates of occupancy, the "owner" a commercial permit names when it isn't the landlord, and the state's sales-tax permits; within_days narrows the window. "New businesses", "tenants", "stores opening", "who just moved in", "restaurants opening", "retail tenants".
- realtor: NOT owners: the real estate agents and brokers holding an active Texas license in the county (TREC), each with the brokerage they hang it with; brokers who sponsor agents first, then the longest licensed. They refer make-ready work, inspections' repairs and remodels to contractors they trust. The state withholds their phones and emails, so the lookups find those. "Realtors", "real estate agents", "brokers", "agents who refer work", "listing agents".
- custom: only with explicit use_codes (A homes, B apartments, F1 commercial, F2 industrial).
Filters: min_value and max_value are dollars of the property the list is about; min_parcels is how many properties they own ("5 or more properties" is 5; for portfolio, how many commercial buildings; for contractor and designer, how many permits); min_rentals is how many homes they rent out, for investor ("landlords with 3 or more rental homes" is 3); company_owned true keeps companies only ("company investors", "LLCs"), false keeps people; out_of_state true keeps owners whose mail goes outside Texas; zips filter the owner's MAILING zip (where letters go); streets filter the PROPERTY's street; owned_for_years is for long_owned; trades (${TRADES.join(", ")}) is for violation, stalled, contractor and designer; within_days keeps only records newer than that for violation, stalled, contractor, designer and occupant; limit caps the rows a list holds at once (up to 500, the default; the rest load page by page).`;

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
    min_parcels: { type: "integer", description: "At least this many properties owned (portfolio: commercial buildings; contractor and designer: permits)." },
    min_rentals: { type: "integer", description: "At least this many homes they rent out (houses, not commercial buildings): landlords." },
    owner_occupied: { type: "boolean", description: "True: the owner lives in one of their homes. False: none." },
    company_owned: { type: "boolean", description: "True: only companies. False: only people." },
    out_of_state: { type: "boolean", description: "True: mailing address outside Texas. False: inside." },
    zips: { type: "array", items: { type: "string" }, description: "Mailing zip codes to keep." },
    streets: { type: "array", items: { type: "string" }, description: "Property streets to keep, e.g. 'Midkiff Rd'." },
    deed_within_days: { type: "integer", description: "Bought within this many days." },
    owned_for_years: { type: "number", description: "Only with who long_owned: in their home at least this many years." },
    trades: { type: "array", items: { type: "string", enum: [...TRADES] }, description: "Only with who violation, stalled, contractor or designer: the trades the work calls for." },
    within_days: { type: "integer", description: "Only with who violation, stalled, contractor or designer: the newest record within this many days." },
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
  const trades = list("trades")?.map((t) => t.toLowerCase().replace(/\s+/g, "-"));
  if (trades?.some((t) => !(TRADES as readonly string[]).includes(t))) throw new Error(`trades must be among ${TRADES.join(", ")}`);
  const ownedYears = num("owned_for_years");
  const def: Definition = {
    county,
    who: who as Who,
    useCodes,
    minValueCents: dollars("min_value"),
    maxValueCents: dollars("max_value"),
    minParcels: num("min_parcels"),
    minRentals: num("min_rentals"),
    ownerOccupied: bool("owner_occupied"),
    companyOwned: bool("company_owned"),
    outOfState: bool("out_of_state"),
    zips,
    streets: list("streets"),
    deedWithinDays: num("deed_within_days"),
    ownedForDays: ownedYears === undefined ? undefined : Math.round(ownedYears * 365.25),
    trades,
    withinDays: num("within_days"),
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
  // The records lists first: their words are the most specific.
  if (has(/code (violation|case|enforcement)|\bviolations?\b|fix-?it|dilapidated|condemned|demolition|blight/)) definition = { county, who: "violation" };
  else if (has(/stalled|expired permit|stop[- ]work|unfinished (job|project|work)|abandoned (job|permit|project)/)) definition = { county, who: "stalled" };
  else if (has(/\bcontractors?\b|\bgcs?\b|\bsubs\b|pull(ing|ed|s)? permits|permit activity|active builders|who('s| is) building/)) definition = { county, who: "contractor" };
  else if (has(/architect|\bengineers?\b|\bengineering\b|design(er|ers| firms?| build)\b|drawing (the )?plans|\bplans\b/)) definition = { county, who: "designer" };
  else if (has(/long[- ]?time|long[- ]owned|owned (for |their home(s)? (for )?)?\d+\+? ?years|\d+\+ years|empty[- ]nest|older homes|aging (homes|roofs?)|since (19|20)\d\d/)) definition = { county, who: "long_owned" };
  else if (has(/\bmanag(er|ers|ement)\b/)) definition = { county, who: "manager" };
  else if (has(/\b(home)?builders?\b|\bdevelopers?\b/)) definition = { county, who: "builder" };
  else if (has(/\bwarehouse|industrial\b/)) definition = { county, who: "commercial", useCodes: ["F2"] };
  // The people who sell the homes: realtors, agents, brokers.
  else if (has(/\brealtors?\b|real[- ]?estate (agents?|brokers?|professionals?)|\bbrokers?\b|\bbrokerages?\b|listing agents?|\bagents who\b/)) definition = { county, who: "realtor" };
  // The business in the space, not the landlord: tenants, new businesses, who moved in or is opening.
  else if (has(/\btenants?\b|\blease|new business|business(es)? (opening|moving|that (just )?moved)|moved in|moving in|\bopening\b|certificate of occupancy|\boccupants?\b|restaurant/)) definition = { county, who: "occupant" };
  // Several buildings in one owner's hands: retail, storefronts, "owners with 3+ buildings". A shopping center is still the commercial list.
  else if (has(/shopping|strip (mall|center)/)) definition = { county, who: "commercial" };
  else if (has(/portfolio|retail|storefront|\bshops?\b|\bstores?\b|\bchains?\b|several (commercial )?buildings|multiple (commercial )?buildings|\d+\+? ?(or more )?(commercial )?buildings/)) definition = { county, who: "portfolio" };
  else if (has(/commercial|office building|plaza|\bcenters?\b/)) definition = { county, who: "commercial" };
  else if (has(/apartment|multi-?family|complex|duplex/)) definition = { county, who: "multifamily" };
  else if (has(/investor|landlord|flipper|rental/)) definition = { county, who: "investor" };
  else if (has(/absentee|out[- ]of[- ](state|town)/)) definition = { county, who: "absentee" };
  else if (has(/\bbought\b|new (home)?owners?|recent|just moved/)) definition = { county, who: "recent_buyer" };
  else if (has(/wealthy|\brich\b|luxury|high-end|expensive|million|\bover \$|worth/) || amount !== undefined) definition = { county, who: "wealthy" };
  if (!definition) return undefined;
  if (amount !== undefined && (definition.who === "wealthy" || definition.who === "commercial" || definition.who === "portfolio")) definition.minValueCents = amount;
  if (definition.who === "long_owned") {
    const years = yearsIn(words);
    if (years !== undefined) definition.ownedForDays = Math.round(years * 365.25);
  }
  if (definition.who === "occupant") {
    const days = daysIn(words);
    if (days !== undefined) definition.withinDays = days;
  }
  if (["violation", "stalled", "contractor", "designer"].includes(definition.who)) {
    const trades = tradesIn(words);
    if (trades.length) definition.trades = trades;
    if (definition.who === "contractor" || definition.who === "designer") {
      const floor = parcelsIn(words);
      if (floor !== undefined) definition.minParcels = floor;
    }
  }
  // The cuts a holder list takes: companies only, a floor on how many they own, mail outside Texas.
  if (["investor", "builder", "commercial", "portfolio", "multifamily"].includes(definition.who)) {
    if (has(/\b(compan(y|ies)|llcs?|corporations?|corporate|entities|businesses)\b/)) definition.companyOwned = true;
    else if (has(/\b(individuals?|private owners?|not compan(y|ies))\b/)) definition.companyOwned = false;
    const floor = parcelsIn(words);
    if (floor !== undefined) definition.minParcels = floor;
    if (has(/out[- ]of[- ](state|town)|outside (of )?(texas|the state|tx)\b/)) definition.outOfState = true;
  }
  return { definition, title: defaultTitle(definition) };
}

/** The trade words an ask uses, as the trades they mean. */
const TRADE_WORDS: Array<[RegExp, (typeof TRADES)[number]]> = [
  [/\broof/, "roofing"],
  [/electric/, "electrical"],
  [/plumb/, "plumbing"],
  [/\bhvac\b|air[- ]?condition|heating|\ba\/c\b|\bac\b/, "hvac"],
  [/concrete|driveway|sidewalk|foundation|slab/, "concrete"],
  [/fenc|landscap|\bpool|irrigation|sprinkler|\bdeck|patio|outdoor/, "outdoor-construction"],
  [/\bpaint/, "painting"],
  [/drywall|sheetrock/, "drywall"],
  [/window|\bdoors?\b/, "window-door"],
  [/handyman|handymen/, "handyman"],
  [/general contractor|\bgcs?\b|remodel|structur|deteriorat/, "general-construction"],
];
export function tradesIn(words: string): string[] {
  return TRADE_WORDS.filter(([re]) => re.test(words)).map(([, t]) => t);
}

/** "20+ years", "owned 15 years", "more than 25 years" → the years. */
/** "in the last 90 days", "within 30 days", "past 6 months" → days. */
export function daysIn(words: string): number | undefined {
  const m = words.match(/\b(?:last|past|within|in)\s+(?:the\s+)?(\d{1,3})\s*(days?|weeks?|months?)\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2].startsWith("day") ? n : m[2].startsWith("week") ? n * 7 : Math.round(n * 30.44);
}

export function yearsIn(words: string): number | undefined {
  const m = words.match(/\b(\d{1,2})\s*\+?\s*(?:or more\s+)?years?\b/);
  return m ? Number(m[1]) : undefined;
}

const HOLDINGS = "(?:properties|parcels|buildings|homes|houses|rentals|units|doors|permits|jobs)";
/** "5 or more properties", "5+ properties", "at least 5 properties", "more than 4 properties" → 5. */
export function parcelsIn(words: string): number | undefined {
  const atLeast = words.match(new RegExp(`\\b(\\d{1,3})\\s*(?:\\+|or more|and up|plus|or greater)\\s*${HOLDINGS}?`)) ?? words.match(new RegExp(`\\b(?:at least|minimum of|a minimum of|no fewer than)\\s*(\\d{1,3})\\s*${HOLDINGS}`));
  if (atLeast) return Number(atLeast[1]);
  const moreThan = words.match(new RegExp(`\\b(?:more than|over|above)\\s*(\\d{1,3})\\s*${HOLDINGS}`));
  if (moreThan) return Number(moreThan[1]) + 1;
  return undefined;
}

/** A list's title when the asker gave none. */
export function defaultTitle(def: Definition): string {
  const base: Record<Who, string> = {
    investor: "Real estate investors",
    builder: "Homebuilders",
    manager: "Property managers",
    commercial: "Commercial property owners",
    portfolio: "Commercial portfolio owners",
    multifamily: "Apartment owners",
    wealthy: "Wealthy homeowners",
    recent_buyer: "Recent buyers",
    absentee: "Absentee owners",
    long_owned: "Long-time homeowners",
    violation: "Code violations",
    stalled: "Stalled permits",
    contractor: "Active contractors",
    designer: "Architects and engineers",
    occupant: "New businesses moving in",
    realtor: "Realtors",
    custom: "Property owners",
  };
  // "Company investors with 5+ properties", "Out-of-state investors", "Commercial property owners (companies)".
  let name = base[def.who];
  if (def.companyOwned === true) name = def.who === "investor" ? "Company investors" : `${name} (companies)`;
  if (def.companyOwned === false) name = def.who === "investor" ? "Individual investors" : `${name} (individuals)`;
  if (def.outOfState === true && def.who !== "absentee") name = `Out-of-state ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  // "Roofing contractors", "Code violations for roofing", "Homes owned 30+ years".
  if (def.trades?.length) {
    const labels = def.trades.map(tradeLabel).join(", ");
    name = def.who === "contractor" && def.trades.length === 1 ? `${labels} contractors` : `${name} for ${labels.toLowerCase()}`;
  }
  if (def.who === "long_owned" && def.ownedForDays !== undefined) name = `Homes owned ${Math.round(def.ownedForDays / 365.25)}+ years`;
  // "Landlords with 3+ rental homes": the rentals say it; the properties floor under them doesn't need saying too.
  if (def.minRentals) return `${def.who === "investor" && def.companyOwned === undefined ? "Landlords" : name} with ${def.minRentals}+ rental homes${def.minValueCents ? ` over ${shortMoney(def.minValueCents)}` : ""}, ${def.county}`;
  if (def.who === "occupant" && def.withinDays !== undefined) name = `Businesses moved in within ${def.withinDays} days`;
  const unit = def.who === "contractor" || def.who === "designer" ? "permits" : def.who === "portfolio" ? "buildings" : "properties";
  const parcels = def.minParcels ? ` with ${def.minParcels}+ ${unit}` : "";
  const extra = def.minValueCents ? ` over ${shortMoney(def.minValueCents)}` : "";
  return `${name}${parcels}${extra}, ${def.county}`;
}

/** The short label a list shows for its who. */
export const WHO_LABEL: Record<Who, string> = {
  investor: "Investors",
  builder: "Homebuilders",
  manager: "Property managers",
  commercial: "Commercial owners",
  portfolio: "Portfolio owners",
  multifamily: "Apartment owners",
  wealthy: "Wealthy homeowners",
  recent_buyer: "Recent buyers",
  absentee: "Absentee owners",
  long_owned: "Long-time homeowners",
  violation: "Code violations",
  stalled: "Stalled permits",
  contractor: "Contractors",
  designer: "Architects & engineers",
  occupant: "New businesses",
  realtor: "Realtors",
  custom: "Custom",
};
