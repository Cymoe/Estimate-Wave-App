// Motivated-seller lists, the way real-estate investors work them: public
// records that say an owner may want to sell, stacked per home. A home on
// several lists (an out-of-state owner with a deteriorated house and a stalled
// permit) ranks above one on a single list. Pure functions: signals.ts reads
// the city's layers and stores what these decide. Kept free of server imports.

export const SIGNAL_LAYERS = {
  codeCases: "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/Code_Cases/FeatureServer/0",
  dilapidated: "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/Dilapidated_Buildings/FeatureServer/0",
  demolition: "https://services.arcgis.com/0H6bQdxd9223gQB5/arcgis/rest/services/Demolition/FeatureServer/1",
} as const;

export const SIGNALS_SOURCE = "midland-signals";

/** Bumped when what a stored signal holds changes: the next sync reads every code case again. */
export const SIGNALS_VERSION = 1;

/** Each list, its label, and how much it adds to a home's stack score. */
export const LISTS = {
  pre_foreclosure: { label: "Pre-foreclosure", weight: 3 },
  dilapidated: { label: "Dilapidated", weight: 3 },
  demolition: { label: "Demolition order", weight: 3 },
  serious_violation: { label: "Serious violation", weight: 3 },
  repeat_violations: { label: "Repeat violations", weight: 2 },
  stalled_permit: { label: "Stalled permit", weight: 2 },
  out_of_state: { label: "Out-of-state owner", weight: 2 },
  code_violation: { label: "Code violation", weight: 1 },
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
const DAY_MS = 24 * 60 * 60 * 1000;

export type SignalRow = {
  sourceId: string;
  kind: "code_violation" | "dilapidated" | "demolition" | "stalled_permit";
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
  parcel: { ownerOccupied: boolean; mailing: { state?: string }; deedDate?: string },
  signals: Array<Pick<SignalRow, "kind" | "detail" | "caseNumber" | "date" | "sourceId">>,
  extra: { preForeclosure: boolean; landlord: boolean },
  now = Date.now(),
): Stack {
  const lists = new Set<ListKey>();
  const codeFrom = new Date(now - CODE_YEARS * 365 * DAY_MS).toISOString();
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
