// Every business with a Texas sales-tax permit, from the Comptroller's open
// data: the business, where it sells from, what kind of business it is, when
// it started, and where its tax mail goes. The one public list of who runs
// the store at an address regardless of who owns the building. Pure
// functions; outlets.ts fetches.

/** The Comptroller's "Active Sales Tax Permit Holders" dataset on data.texas.gov (Socrata). */
export const COMPTROLLER_OUTLETS = {
  source: "tx-outlets",
  county: "Midland",
  city: "MIDLAND",
  url: "https://data.texas.gov/resource/jrea-zgmq.json",
  /** Rows per request; the API allows up to 50,000 but the mutation that stores them likes smaller bites. */
  page: 1000,
} as const;

/** One business at one address. `at` is when it started selling there (or the permit date when that's all there is). */
export type OutletRow = {
  taxpayerNumber: string;
  outletNumber: string;
  name: string;
  address: string;
  city: string;
  zip?: string;
  naics?: string;
  at?: string;
  taxpayer?: string;
  mailing?: { address?: string; city?: string; state?: string; zip?: string };
};

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
};
const when = (value: unknown): string | undefined => {
  const t = text(value);
  if (!t) return undefined;
  const ms = Date.parse(t.endsWith("Z") || /[+-]\d\d:\d\d$/.test(t) ? t : `${t}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

/** The Comptroller's rows as outlets; one without a name or street address is skipped. */
export function rowsToOutlets(rows: Array<Record<string, unknown>>): OutletRow[] {
  const out: OutletRow[] = [];
  for (const r of rows) {
    const taxpayerNumber = text(r.taxpayer_number);
    const outletNumber = text(r.outlet_number) ?? "1";
    const name = text(r.outlet_name) ?? text(r.taxpayer_name);
    const address = text(r.outlet_address);
    const city = text(r.outlet_city);
    if (!taxpayerNumber || !name || !address || !city) continue;
    const mailing = {
      address: text(r.taxpayer_address),
      city: text(r.taxpayer_city),
      state: text(r.taxpayer_state),
      zip: text(r.taxpayer_zip_code)?.slice(0, 5),
    };
    out.push({
      taxpayerNumber,
      outletNumber,
      name,
      address,
      city,
      zip: text(r.outlet_zip_code)?.slice(0, 5),
      naics: text(r.outlet_naics_code),
      at: when(r.outlet_first_sales_date) ?? when(r.outlet_permit_issue_date),
      taxpayer: text(r.taxpayer_name),
      ...(mailing.address || mailing.city ? { mailing } : {}),
    });
  }
  return out;
}

/** The query for one page of a city's outlets, oldest first so a page cursor is stable. */
export function outletsQuery(city: string, offset: number, limit: number): string {
  const params = new URLSearchParams({
    $where: `upper(outlet_city)='${city.toUpperCase().replace(/'/g, "''")}'`,
    $order: "taxpayer_number,outlet_number",
    $limit: String(limit),
    $offset: String(offset),
  });
  return `${COMPTROLLER_OUTLETS.url}?${params}`;
}

/** Three-digit NAICS families, in a word a contractor would use. */
const KINDS: Array<[RegExp, string]> = [
  [/^722/, "restaurant"],
  [/^7224/, "bar"],
  [/^721/, "hotel"],
  [/^44[1-9]|^45[1-9]/, "retail"],
  [/^8121/, "salon"],
  [/^812/, "services"],
  [/^62/, "clinic"],
  [/^61/, "school"],
  [/^71/, "recreation"],
  [/^53/, "real estate"],
  [/^52/, "finance"],
  [/^54/, "professional office"],
  [/^81[1-3]/, "repair shop"],
  [/^42/, "wholesale"],
  [/^31|^32|^33/, "manufacturing"],
  [/^48|^49/, "transport"],
  [/^23/, "contractor"],
  [/^21/, "oil and gas"],
  [/^11/, "agriculture"],
];

/** "restaurant", "retail", "salon"…, or nothing when the code says nothing useful. */
export function kindOfBusiness(naics?: string): string | undefined {
  if (!naics) return undefined;
  // Bars sit inside 722, so the more specific test must win.
  if (/^7224/.test(naics)) return "bar";
  for (const [re, kind] of KINDS) if (re.test(naics)) return kind;
  return undefined;
}
