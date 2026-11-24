// Motivated-seller lists, the way real-estate investors work them: public
// records that say an owner may want to sell, stacked per home. A home on
// several lists (an out-of-state owner with a deteriorated house and a stalled
// permit) ranks above one on a single list. Pure functions: signals.ts reads
// the city's layers and stores what these decide. Kept free of server imports.
//
// Besides the city's records: what the rolls say (an estate or heirs on the deed, the district's mail coming back,
// the owner's homestead gone, an over-65 owner of many years) and court and tax lists staff upload from records
// requests (tax-delinquent, probate, lis pendens, divorce, eviction). Midland and Ector (Odessa) are scored.
import { parseCsv } from "./ads";

export const SIGNAL_LAYERS = {
  codeCases: "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/Code_Cases/FeatureServer/0",
  dilapidated: "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/Dilapidated_Buildings/FeatureServer/0",
  demolition: "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/Demolition/FeatureServer/1",
} as const;

export const SIGNALS_SOURCE = "midland-signals";

/** Bumped when what a stored signal holds changes: the next sync reads every code case again. */
export const SIGNALS_VERSION = 1;

/** The counties whose homes are scored: the city's records are Midland's; the rest is read from both rolls. */
export const SELLER_COUNTIES = ["Midland", "Ector"] as const;
export const isSellerCounty = (county: string) => (SELLER_COUNTIES as readonly string[]).includes(county);

/** Each list, its label, and how much it adds to a home's stack score. */
export const LISTS = {
  pre_foreclosure: { label: "Pre-foreclosure", weight: 3 },
  tax_delinquent: { label: "Tax-delinquent", weight: 3 },
  probate: { label: "Probate", weight: 3 },
  inherited: { label: "Inherited (estate or heirs)", weight: 3 },
  lis_pendens: { label: "Lis pendens", weight: 3 },
  dilapidated: { label: "Dilapidated", weight: 3 },
  demolition: { label: "Demolition order", weight: 3 },
  serious_violation: { label: "Serious violation", weight: 3 },
  divorce: { label: "Divorce", weight: 2 },
  homestead_dropped: { label: "Moved out (homestead dropped)", weight: 2 },
  mail_returned: { label: "Mail returned", weight: 2 },
  repeat_violations: { label: "Repeat violations", weight: 2 },
  stalled_permit: { label: "Stalled permit", weight: 2 },
  out_of_state: { label: "Out-of-state owner", weight: 2 },
  code_violation: { label: "Code violation", weight: 1 },
  eviction: { label: "Eviction filed", weight: 1 },
  senior_long_owned: { label: "Over 65, owned 15+ years", weight: 1 },
  absentee: { label: "Absentee owner", weight: 1 },
  long_owned: { label: "Owned 20+ years", weight: 1 },
  landlord: { label: "Landlord (5+ homes)", weight: 1 },
} as const;
export type ListKey = keyof typeof LISTS;
export const LIST_KEYS = Object.keys(LISTS) as ListKey[];

/** Violations that are about the house itself, not the yard. */
export const SERIOUS = new Set(["Deteriorated Structure", "Building Without Permit", "Heavy Accumulation of Debris"]);
/** Permits that stopped: the money, a dispute, or the owner gave up. */
export const STALLED = new Set(["Stop Work Order", "Expired - after 6 month", "No More Work", "Denied"]);
/** Code cases count for this long; repeat means this many separate cases. */
export const CODE_YEARS = 2;
export const REPEAT_CASES = 3;
export const LANDLORD_HOMES = 5;
/** Court and tax records count for this long from their date; a dropped homestead for this long from when it went. */
export const RECORD_YEARS = 2;
/** An over-65 owner counts once they've owned it this long. */
export const SENIOR_YEARS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The records staff upload from records requests, each a list of its own. */
export const RECORD_KINDS = ["tax_delinquent", "probate", "lis_pendens", "divorce", "eviction"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export type SignalRow = {
  sourceId: string;
  kind: "code_violation" | "dilapidated" | "demolition" | "stalled_permit" | RecordKind;
  address: string;
  detail: string;
  status?: string;
  caseNumber?: string;
  date: string;
};

type Feature = { attributes?: Record<string, unknown> };

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
};
const epoch = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : undefined;
/** "5/8/2025" → ISO. */
const slashDate = (value: unknown): string | undefined => {
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T12:00:00.000Z` : undefined;
};

/** The code case layer's inspections as signals. */
export function codeCaseSignals(features: Feature[]): SignalRow[] {
  const rows: SignalRow[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = text(a.IMINSPECTIONID);
    const address = text(a.ADDRESS);
    const date = epoch(a.CREATED_DATE);
    if (!id || !address || !date) continue;
    rows.push({
      sourceId: `code:${id}`,
      kind: "code_violation",
      address,
      detail: text(a.VIOLATION) ?? "Code violation",
      status: text(a.STATUS),
      caseNumber: text(a.CASE_NUMBER),
      date,
    });
  }
  return rows;
}

/** The dilapidated buildings layer as signals. */
export function dilapidatedSignals(features: Feature[]): SignalRow[] {
  return features.flatMap((f) => {
    const a = f.attributes ?? {};
    const address = text(a.Address);
    const id = text(a.ID) ?? (typeof a.OBJECTID === "number" ? String(a.OBJECTID) : undefined);
    const date = epoch(a.Date) ?? epoch(a.CreationDate);
    if (!address || !id || !date) return [];
    return [{ sourceId: `dilapidated:${id}`, kind: "dilapidated" as const, address, detail: text(a.Zone) ?? "Dilapidated building", date }];
  });
}

/** The demolition layer as signals. */
export function demolitionSignals(features: Feature[]): SignalRow[] {
  return features.flatMap((f) => {
    const a = f.attributes ?? {};
    const address = text(a.Address);
    const id = typeof a.ObjectID === "number" ? String(a.ObjectID) : undefined;
    const date = slashDate(a.Issue_Approval_Date) ?? (typeof a.Year === "number" ? `${a.Year}-01-01T12:00:00.000Z` : undefined);
    if (!address || !id || !date) return [];
    const detail = [text(a.Work_Class), text(a.Abatement_Type)].filter(Boolean).join(", ") || "Demolition";
    return [{ sourceId: `demolition:${id}`, kind: "demolition" as const, address, detail, status: text(a.Status_1), date }];
  });
}

/** A stored permit that stopped, as a signal. */
export function stalledPermitSignal(p: { permitNumber: string; status?: string; address?: string; issuedAt?: string; appliedAt: string; name: string }): SignalRow | null {
  if (!p.status || !STALLED.has(p.status) || !p.address) return null;
  return { sourceId: `permit:${p.permitNumber}`, kind: "stalled_permit", address: p.address, detail: `${p.name}: ${p.status}`, status: p.status, date: p.issuedAt ?? p.appliedAt };
}

export type Stack = { lists: ListKey[]; score: number; codeCases: number; seriousCases: number; lastSignalAt?: string };

/** Which lists a home is on, and its stack score. */
export function stackFor(
  parcel: {
    ownerOccupied: boolean;
    mailing: { state?: string };
    deedDate?: string;
    owner?: string;
    owner2?: string;
    homestead?: boolean;
    over65?: boolean;
    homesteadDroppedAt?: string;
    returnedMail?: boolean;
  },
  signals: Array<Pick<SignalRow, "kind" | "detail" | "caseNumber" | "date" | "sourceId">>,
  extra: { preForeclosure: boolean; landlord: boolean },
  now = Date.now(),
): Stack {
  const lists = new Set<ListKey>();
  const codeFrom = new Date(now - CODE_YEARS * 365 * DAY_MS).toISOString();
  const recordFrom = new Date(now - RECORD_YEARS * 365 * DAY_MS).toISOString();
  for (const kind of RECORD_KINDS) if (signals.some((s) => s.kind === kind && s.date >= recordFrom)) lists.add(kind);
  if (isEstateName(parcel.owner) || isEstateName(parcel.owner2)) lists.add("inherited");
  if (parcel.returnedMail) lists.add("mail_returned");
  if (parcel.homestead === false && parcel.homesteadDroppedAt && parcel.homesteadDroppedAt >= recordFrom) lists.add("homestead_dropped");
  if (parcel.over65 && parcel.deedDate && parcel.deedDate <= new Date(now - SENIOR_YEARS * 365.25 * DAY_MS).toISOString().slice(0, 10)) lists.add("senior_long_owned");
  const code = signals.filter((s) => s.kind === "code_violation" && s.date >= codeFrom);
  const cases = new Set(code.map((s) => s.caseNumber ?? s.sourceId));
  const serious = new Set(code.filter((s) => SERIOUS.has(s.detail)).map((s) => s.caseNumber ?? s.sourceId));
  if (cases.size) lists.add("code_violation");
  if (serious.size) lists.add("serious_violation");
  if (cases.size >= REPEAT_CASES) lists.add("repeat_violations");
  if (signals.some((s) => s.kind === "dilapidated")) lists.add("dilapidated");
  if (signals.some((s) => s.kind === "demolition")) lists.add("demolition");
  if (signals.some((s) => s.kind === "stalled_permit")) lists.add("stalled_permit");
  if (extra.preForeclosure) lists.add("pre_foreclosure");
  if (!parcel.ownerOccupied) lists.add("absentee");
  const state = parcel.mailing.state?.toUpperCase();
  if (state && state !== "TX" && state !== "TEXAS") lists.add("out_of_state");
  if (parcel.deedDate && parcel.deedDate <= new Date(now - 20 * 365.25 * DAY_MS).toISOString().slice(0, 10)) lists.add("long_owned");
  if (extra.landlord) lists.add("landlord");
  const ordered = LIST_KEYS.filter((k) => lists.has(k));
  const dates = signals.map((s) => s.date).sort();
  return {
    lists: ordered,
    score: ordered.reduce((sum, k) => sum + LISTS[k].weight, 0),
    codeCases: cases.size,
    seriousCases: serious.size,
    lastSignalAt: dates[dates.length - 1],
  };
}

const csvCell = (value: unknown) => {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rows as CSV text, header first. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/**
 * An estate or heirs on the roll (lib/parcels.ts isEstateOwner, repeated here to keep this file free of other
 * imports' weight): "ESTATE OF …", "… EST", "HEIRS OF …", "… DECD". "REAL ESTATE" is a business.
 */
export function isEstateName(owner: string | undefined): boolean {
  if (!owner) return false;
  const name = owner.toUpperCase().replace(/[.,]/g, " ").replace(/\bREAL\s+ESTATE\b/g, " ");
  // "PREMIUM ESTATE PROPERTIES LLC" and "AMERICAN ESTATE & TRUST LC" are businesses named for estates, not one.
  if (ESTATE_BUSINESS.test(name)) return false;
  return /\b(ESTATE|EST|HEIRS?|DECEASED|DEC'?D|DECD)\b/.test(name);
}

/** A business word on the roll (lib/parcels.ts isCompanyOwner's, plus LC and PLLC): such a name is never an estate. */
const ESTATE_BUSINESS =
  /\b(LLC|L L C|LC|PLLC|INC|LTD|LP|L P|CORP|CORPORATION|CO|COMPANY|HOMES?|BUILDERS?|PROPERTIES|PROPERTY|INVESTMENTS?|HOLDINGS|PARTNERS|PARTNERSHIP|CHURCH|MINISTRIES|BANK|MORTGAGE|AUTHORITY|ASSOCIATION|ASSN|REALTY|DEVELOPMENT|RENTALS?|ESTATES)\b/;

/** One row of an uploaded court or tax list: where, whose, when and which case. */
export type RecordLine = { line: number; address?: string; owner?: string; date?: string; caseNumber?: string; detail?: string };

const HEADS = {
  address: /\b(property address|situs|site address|address|property|location|street)\b/i,
  owner: /\b(owner|name|decedent|deceased|defendant|respondent|petitioner|tenant|taxpayer)\b/i,
  date: /\b(filed|filing date|date filed|file date|date|recorded)\b/i,
  caseNumber: /\b(case|cause|instrument|account|number|no\.?|#)\b/i,
} as const;

/** "5/8/2025", "2025-05-08", "May 8, 2025" → "2025-05-08", or nothing. */
export function recordDate(value: string | undefined): string | undefined {
  const v = (value ?? "").trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) && /[a-z]/i.test(v) ? new Date(t).toISOString().slice(0, 10) : undefined;
}

/**
 * Pasted or uploaded records, as rows. With a header, its columns are found by name (address, owner/decedent/
 * defendant, date/filed, case/cause/account); without one, each line is an address. Blank lines are skipped.
 */
export function parseRecords(text: string): RecordLine[] {
  const rows = parseCsv(text.trim()).filter((r) => r.some((c) => c.trim()));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const find = (re: RegExp, taken: number[]) => header.findIndex((h, i) => !taken.includes(i) && re.test(h));
  const taken: number[] = [];
  const at: Partial<Record<keyof typeof HEADS, number>> = {};
  for (const key of ["address", "owner", "date", "caseNumber"] as const) {
    const i = find(HEADS[key], taken);
    if (i >= 0) {
      at[key] = i;
      taken.push(i);
    }
  }
  const hasHeader = at.address !== undefined || at.owner !== undefined;
  const cell = (r: string[], i: number | undefined) => (i === undefined ? undefined : r[i]?.replace(/\s+/g, " ").trim() || undefined);
  const body = hasHeader ? rows.slice(1) : rows;
  return body.map((r, k) => {
    const line = k + (hasHeader ? 2 : 1);
    if (!hasHeader) return { line, address: r.join(" ").replace(/\s+/g, " ").trim() || undefined };
    const rest = r.filter((_, i) => !taken.includes(i)).map((c) => c.trim()).filter(Boolean);
    return {
      line,
      address: cell(r, at.address),
      owner: cell(r, at.owner),
      date: recordDate(cell(r, at.date)),
      caseNumber: cell(r, at.caseNumber),
      detail: rest.join(" · ").slice(0, 200) || undefined,
    };
  });
}

/** A person's name as written on a court list ("John A Smith") the roll's way round too ("SMITH JOHN A"). */
export function nameOrders(name: string): string[] {
  const words = name.toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length < 2) return words.length ? [words.join(" ")] : [];
  const rollOrder = [words[words.length - 1], ...words.slice(0, -1)].join(" ");
  return [...new Set([words.join(" "), rollOrder])];
}
