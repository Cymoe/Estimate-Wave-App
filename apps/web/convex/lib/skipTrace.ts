// Skip tracing: a property owner's name and addresses in, their phones and
// emails out. Vendors are tried in order (the waterfall) until one finds a
// phone; each adapter is a plain function over fetch so it can be tested
// without the vendor. Nothing here touches the database or the wallet.

export type TraceInput = {
  name: string;
  /** Set when the owner is a company: vendors match people, so the c/o or the name's first and last words are tried. */
  company?: string;
  property: { address: string; city: string; state: string; zip?: string };
  mailing: { address?: string; city?: string; state?: string; zip?: string };
};

export type Phone = { number: string; type?: string; dnc?: boolean; source: string };
export type Email = { email: string; source: string };
export type TraceResult = { phones: Phone[]; emails: Email[] };

export type Vendor = {
  name: string;
  trace: (input: TraceInput) => Promise<TraceResult>;
};

type Fetch = typeof fetch;

/** "SMITH JOHN & MARY" → first "John", last "Smith"; the roll writes last name first. */
export function splitName(name: string): { first?: string; last?: string } {
  const clean = name
    .replace(/\b(ET ?AL|ETUX|ET ?VIR|TRUSTEES?|JR|SR|II|III)\b\.?/gi, " ")
    .replace(/[&,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(" ").filter(Boolean);
  if (words.length === 0) return {};
  if (words.length === 1) return { last: words[0] };
  return { last: words[0], first: words[1] };
}

const digits = (s: string) => s.replace(/\D/g, "");
/** "(432) 555-0100" and "+1 432 555 0100" are one number. */
export function normalizePhone(raw: string): string | undefined {
  const d = digits(raw);
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 ? n : undefined;
}

/** Keeps the first of each phone and email, in the order found. */
export function dedupe(result: TraceResult): TraceResult {
  const phones = new Map<string, Phone>();
  for (const p of result.phones) {
    const n = normalizePhone(p.number);
    if (n && !phones.has(n)) phones.set(n, { ...p, number: n });
  }
  const emails = new Map<string, Email>();
  for (const e of result.emails) {
    const k = e.email.trim().toLowerCase();
    if (k.includes("@") && !emails.has(k)) emails.set(k, { ...e, email: k });
  }
  return { phones: [...phones.values()], emails: [...emails.values()] };
}

const asArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);

/**
 * BatchData's property skip trace (v1): one request per property, the
 * owner's name alongside it. Phones come back under persons[].phoneNumbers
 * (v3 says phones), each with a type, a DNC flag and a score.
 */
export function batchData(key: string, fetchFn: Fetch = fetch, base = "https://api.batchdata.com/api/v1"): Vendor {
  return {
    name: "batchdata",
    trace: async (input) => {
      const who = splitName(input.company ?? input.name);
      const response = await fetchFn(`${base}/property/skip-trace`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          requests: [
            {
              propertyAddress: { street: input.property.address, city: input.property.city, state: input.property.state, zip: input.property.zip },
              ...(input.mailing.address && input.mailing.city && input.mailing.state
                ? { mailingAddress: { street: input.mailing.address, city: input.mailing.city, state: input.mailing.state, zip: input.mailing.zip } }
                : {}),
              ...(who.first || who.last ? { name: { first: who.first, last: who.last } } : {}),
            },
          ],
          options: { skipTrace: true },
        }),
      });
      if (!response.ok) throw new Error(`BatchData: HTTP ${response.status}`);
      const body = (await response.json()) as { results?: { persons?: unknown[] }; status?: { code?: number; text?: string } };
      const persons = asArray(body.results?.persons) as Array<Record<string, unknown>>;
      const phones: Phone[] = [];
      const emails: Email[] = [];
      for (const person of persons) {
        for (const p of asArray(person.phoneNumbers ?? person.phones) as Array<Record<string, unknown>>) {
          const number = str(p.number) ?? str(p.phone);
          if (!number) continue;
          phones.push({ number, type: str(p.type)?.toLowerCase(), dnc: p.dnc === true || p.tcpa === true ? true : undefined, source: "batchdata" });
        }
        for (const e of asArray(person.emails) as Array<Record<string, unknown> | string>) {
          const email = typeof e === "string" ? str(e) : str(e.email) ?? str(e.address);
          if (email) emails.push({ email, source: "batchdata" });
        }
      }
      return { phones, emails };
    },
  };
}

/**
 * Tries each vendor in turn; the first one to find a phone wins, and emails
 * from the vendors before it ride along. A vendor that throws is skipped
 * (its message kept), so one outage doesn't fail the unlock.
 */
export async function waterfall(input: TraceInput, vendors: Vendor[]): Promise<{ result: TraceResult; vendor?: string; errors: string[] }> {
  const errors: string[] = [];
  let emails: Email[] = [];
  for (const vendor of vendors) {
    try {
      const found = dedupe(await vendor.trace(input));
      emails = dedupe({ phones: [], emails: [...emails, ...found.emails] }).emails;
      if (found.phones.length > 0) return { result: { phones: found.phones, emails }, vendor: vendor.name, errors };
    } catch (e) {
      errors.push(`${vendor.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { result: { phones: [], emails }, vendor: emails.length ? emails[0].source : undefined, errors };
}
