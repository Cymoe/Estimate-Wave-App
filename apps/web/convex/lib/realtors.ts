// Every active real estate license holder in the county, from the Texas
// Real Estate Commission's open data: the agent or broker, the brokerage
// they hang their license with, and how long they've been at it. The state
// withholds phones, emails and addresses (SB 510), so those come from the
// lookups. Pure functions; realtors.ts fetches.

/** TREC's "Broker and Sales Agent License Holder Information" on data.texas.gov (Socrata), updated daily. */
export const TREC_REALTORS = {
  source: "trec-realtors",
  county: "Midland",
  url: "https://data.texas.gov/resource/s7ft-44qi.json",
  page: 1000,
} as const;

/** A sales agent, an individual broker, or the brokerage company a license sits under. */
export type RealtorType = "agent" | "broker" | "brokerage";

export type RealtorRow = {
  licenseNumber: string;
  type: RealtorType;
  /** As TREC prints it, all caps: "TERRY LANCE MARKER" or "FATHOM REALTY, LLC". */
  name: string;
  first?: string;
  last?: string;
  /** When the license was first issued, and when the current one runs out (ISO dates). */
  licensedAt?: string;
  expiresAt?: string;
  /** The sponsoring broker (an agent's brokerage, or the broker an agent hangs with) and since when. */
  brokerage?: { licenseNumber: string; name: string; type: RealtorType };
  brokerageSince?: string;
  /** A broker TREC lists as a designated supervisor: runs an office. */
  supervisor: boolean;
};

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
};

/** TREC's "MM/DD/YYYY" as an ISO date; anything else is nothing. */
export const trecDate = (value: unknown): string | undefined => {
  const t = text(value);
  const m = t?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

const TYPES: Record<string, RealtorType> = { "sales agent": "agent", "broker individual": "broker", "broker company": "brokerage" };
export const realtorType = (value: unknown): RealtorType | undefined => TYPES[text(value)?.toLowerCase() ?? ""];

/** TREC's rows as license holders; a row with no number or name, or of a type we don't list (inspectors, REITs), is skipped. */
export function rowsToRealtors(rows: Array<Record<string, unknown>>): RealtorRow[] {
  const out: RealtorRow[] = [];
  for (const r of rows) {
    const licenseNumber = text(r.license_number);
    const name = text(r.full_name);
    const type = realtorType(r.license_type);
    if (!licenseNumber || !name || !type) continue;
    const related = text(r.related_license_number);
    const relatedName = text(r.related_license_full_name);
    const relatedType = realtorType(r.related_license_type);
    const first = text(r.first_name);
    const last = text(r.last_name);
    out.push({
      licenseNumber,
      type,
      name,
      ...(type !== "brokerage" && first ? { first } : {}),
      ...(type !== "brokerage" && last ? { last } : {}),
      licensedAt: trecDate(r.original_license_date),
      expiresAt: trecDate(r.license_expiration_date),
      ...(related && relatedName && relatedType ? { brokerage: { licenseNumber: related, name: relatedName, type: relatedType } } : {}),
      brokerageSince: trecDate(r.related_license_start_date),
      supervisor: text(r.designated_supervisor_flag) === "1",
    });
  }
  return out;
}

/** One page of a county's active agents, brokers and brokerages, in license-number order so a page cursor is stable. */
export function realtorsQuery(county: string, offset: number, limit: number): string {
  const params = new URLSearchParams({
    $where: `upper(county)='${county.toUpperCase().replace(/'/g, "''")}' AND status='Active' AND license_type in('Sales Agent','Broker Individual','Broker Company')`,
    $order: "license_number",
    $limit: String(limit),
    $offset: String(offset),
  });
  return `${TREC_REALTORS.url}?${params}`;
}
