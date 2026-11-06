// Enrichment: a property owner in, the person behind the company, their
// phones and emails out. Sources are tried in order (the waterfall) for
// each field until one has it; each adapter is a plain function over fetch
// so it can be tested without the vendor. Nothing here touches the
// database or the wallet.

export type Field = "phone" | "email" | "person" | "research";
export type PhoneType = "mobile" | "landline" | "voip" | "unknown";
export type Phone = { number: string; type: PhoneType; dnc?: boolean; verified?: boolean; score?: number; source: string };
export type Email = { email: string; source: string; verified?: boolean };
export type Person = { name: string; title?: string; address?: string; source: string };

export type TraceInput = {
  name: string;
  /** For research: what to find out. */
  question?: string;
  /** Set when the owner is a company: vendors match people, so the person found first (or the name's words) is traced. */
  company?: string;
  person?: Person;
  property: { address: string; city: string; state: string; zip?: string };
  mailing: { address?: string; city?: string; state?: string; zip?: string };
};

export type Found = { phones?: Phone[]; emails?: Email[]; person?: Person };

export type Vendor = {
  name: string;
  /** What this source can answer; it's only called for those. */
  fields: Field[];
  /** True when the deployment holds its key. */
  connected: boolean;
  trace: (input: TraceInput) => Promise<Found>;
};

type Fetch = typeof fetch;

/** "SMITH JOHN & MARY" → first "John", last "Smith"; the roll writes last name first. A person found by name is "First Last". */
export function splitName(name: string, order: "roll" | "person" = "roll"): { first?: string; last?: string } {
  const clean = name
    .replace(/\b(ET ?AL|ETUX|ET ?VIR|TRUSTEES?|JR|SR|II|III)\b\.?/gi, " ")
    .replace(/[&,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(" ").filter(Boolean);
  if (words.length === 0) return {};
  if (words.length === 1) return { last: words[0] };
  return order === "person" ? { first: words[0], last: words[words.length - 1] } : { last: words[0], first: words[1] };
}

const digits = (s: string) => s.replace(/\D/g, "");
/** "(432) 555-0100" and "+1 432 555 0100" are one number. */
export function normalizePhone(raw: string): string | undefined {
  const d = digits(raw);
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 ? n : undefined;
}

const TYPE_RANK: Record<PhoneType, number> = { mobile: 0, landline: 1, voip: 2, unknown: 3 };
/** "Mobile", "cell", "wireless" → mobile; "Land Line" → landline; the rest unknown. */
export function phoneType(raw: unknown): PhoneType {
  const t = typeof raw === "string" ? raw.toLowerCase() : "";
  if (/mobile|cell|wireless/.test(t)) return "mobile";
  if (/land/.test(t)) return "landline";
  if (/voip/.test(t)) return "voip";
  return "unknown";
}

/** One of each number, best first: the vendor's score, then mobile before landline before VoIP. */
export function rankPhones(phones: Phone[]): Phone[] {
  const seen = new Map<string, Phone>();
  for (const p of phones) {
    const n = normalizePhone(p.number);
    if (n && !seen.has(n)) seen.set(n, { ...p, number: n });
  }
  return [...seen.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || TYPE_RANK[a.type] - TYPE_RANK[b.type]);
}

/** One of each email, lower-cased. */
export function dedupeEmails(emails: Email[]): Email[] {
  const seen = new Map<string, Email>();
  for (const e of emails) {
    const k = e.email.trim().toLowerCase();
    if (k.includes("@") && !seen.has(k)) seen.set(k, { ...e, email: k });
  }
  return [...seen.values()];
}

const asArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);
const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/**
 * BatchData's property skip trace (v1): one request per property, the
 * person's name alongside it. Phones come back under persons[].phoneNumbers
 * (v3 says phones), each with a type, a DNC flag, whether the carrier says
 * it's live, and a score.
 */
export function batchData(key: string | undefined, fetchFn: Fetch = fetch, base = "https://api.batchdata.com/api/v1"): Vendor {
  return {
    name: "batchdata",
    fields: ["phone", "email"],
    connected: Boolean(key),
    trace: async (input) => {
      const who = input.person ? splitName(input.person.name, "person") : splitName(input.company ?? input.name);
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
      const body = (await response.json()) as { results?: { persons?: unknown[] } };
      const persons = asArray(body.results?.persons) as Array<Record<string, unknown>>;
      const phones: Phone[] = [];
      const emails: Email[] = [];
      for (const person of persons) {
        for (const p of asArray(person.phoneNumbers ?? person.phones) as Array<Record<string, unknown>>) {
          const number = str(p.number) ?? str(p.phone);
          if (!number) continue;
          phones.push({
            number,
            type: phoneType(p.type),
            dnc: p.dnc === true || p.tcpa === true ? true : undefined,
            verified: p.reachable === true ? true : undefined,
            score: num(p.score),
            source: "batchdata",
          });
        }
        for (const e of asArray(person.emails) as Array<Record<string, unknown> | string>) {
          const email = typeof e === "string" ? str(e) : str(e.email) ?? str(e.address);
          if (email) emails.push({ email, source: "batchdata", verified: typeof e === "object" && e.verified === true ? true : undefined });
        }
      }
      return { phones, emails };
    },
  };
}

/**
 * Tracerfy's instant lookup: one property, the person to find when we know
 * one (the Comptroller's officer, or the roll's personal name), else the
 * owner. Up to 8 phones ranked 1 first, each with a type and DNC/TCPA
 * flags; 2¢ a hit, a miss free. TRACERFY_API_BASE can point at the
 * sandbox (mock.tracerfy.com) for a free dry run.
 */
export function tracerfy(key: string | undefined, fetchFn: Fetch = fetch, base = "https://tracerfy.com/v1/api"): Vendor {
  return {
    name: "tracerfy",
    fields: ["phone", "email"],
    connected: Boolean(key),
    trace: async (input) => {
      const who = input.person ? splitName(input.person.name, "person") : input.company ? {} : splitName(input.name);
      const byName = Boolean(who.first && who.last);
      const response = await fetchFn(`${base.replace(/\/$/, "")}/trace/lookup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          address: input.property.address,
          city: input.property.city,
          state: input.property.state,
          ...(input.property.zip ? { zip: input.property.zip } : {}),
          find_owner: !byName,
          ...(byName ? { first_name: who.first, last_name: who.last } : {}),
        }),
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = (await response.json()) as { error?: unknown; detail?: unknown; retry_after_seconds?: unknown };
          detail = str(body.error) ?? str(body.detail) ?? (num(body.retry_after_seconds) !== undefined ? `retry after ${num(body.retry_after_seconds)}s` : "");
        } catch {
          // No JSON body: the status is the message.
        }
        throw new Error(`Tracerfy: HTTP ${response.status}${detail ? ` (${detail})` : ""}`);
      }
      const body = (await response.json()) as { hit?: boolean; persons?: unknown[] };
      if (body.hit === false) return { phones: [], emails: [] };
      let persons = asArray(body.persons) as Array<Record<string, unknown>>;
      // Several people at the address: the one with the name we asked for, when any has it.
      if (who.last) {
        const same = persons.filter((p) => (str(p.last_name) ?? "").toUpperCase() === who.last!.toUpperCase());
        if (same.length) persons = same;
      }
      const phones: Phone[] = [];
      const emails: Email[] = [];
      for (const person of persons) {
        for (const p of asArray(person.phones) as Array<Record<string, unknown>>) {
          const number = str(p.number);
          if (!number) continue;
          const rank = num(p.rank);
          phones.push({
            number,
            type: phoneType(p.type),
            dnc: p.dnc === true || p.tcpa === true ? true : undefined,
            score: rank !== undefined ? Math.max(0, 100 - rank) : undefined,
            source: "tracerfy",
          });
        }
        for (const e of asArray(person.emails) as Array<Record<string, unknown> | string>) {
          const email = typeof e === "string" ? str(e) : str(e.email);
          if (email) emails.push({ email, source: "tracerfy" });
        }
      }
      return { phones, emails };
    },
  };
}

/** The officer titles that run a company, most useful first. */
const RUNS_IT = [/MANAG/i, /PRESIDENT/i, /\bCEO\b/i, /OWNER/i, /MEMBER/i, /PARTNER/i, /DIRECTOR/i, /PRINCIPAL/i, /SECRETARY|TREASURER/i];

/**
 * The Texas Comptroller's public franchise-tax data: an entity by name,
 * then its officers and managers from the latest Public Information
 * Report. Free with a registered key, so it runs first and gives the paid
 * trace a person to find.
 */
export function comptrollerTexas(key: string | undefined, fetchFn: Fetch = fetch, base = "https://api.comptroller.texas.gov/public-data/v1/public"): Vendor {
  const headers = { Accept: "application/json", "x-api-key": key ?? "" };
  return {
    name: "tx-comptroller",
    fields: ["person"],
    connected: Boolean(key),
    trace: async (input) => {
      if (!input.company) return {};
      const name = input.company.toUpperCase().replace(/[<>]/g, "").replace(/\s*&\s*$/, "").trim().slice(0, 50);
      if (name.length < 2) return {};
      const list = await fetchFn(`${base}/franchise-tax-list?name=${encodeURIComponent(name)}`, { headers });
      if (!list.ok) throw new Error(`Texas Comptroller: HTTP ${list.status}`);
      const found = (await list.json()) as { data?: Array<{ name?: string; taxpayerId?: string; mailingAddressZip?: string }> };
      const entities = asArray(found.data) as Array<{ name?: string; taxpayerId?: string; mailingAddressZip?: string }>;
      const wanted = name;
      const zip = input.mailing.zip?.slice(0, 5);
      const entity =
        entities.find((e) => e.name?.toUpperCase() === wanted && (!zip || e.mailingAddressZip?.slice(0, 5) === zip)) ??
        entities.find((e) => e.name?.toUpperCase() === wanted) ??
        entities.find((e) => zip && e.mailingAddressZip?.slice(0, 5) === zip) ??
        entities[0];
      if (!entity?.taxpayerId) return {};
      const details = await fetchFn(`${base}/franchise-tax/${encodeURIComponent(entity.taxpayerId)}`, { headers });
      if (!details.ok) throw new Error(`Texas Comptroller: HTTP ${details.status}`);
      const body = (await details.json()) as { data?: { officerInfo?: unknown[] } };
      const officers = (asArray(body.data?.officerInfo) as Array<Record<string, unknown>>)
        .map((o) => ({ name: str(o.AGNT_NM), title: str(o.AGNT_TITL_TX), street: str(o.AD_STR_POB_TX), city: str(o.CITY_NM), state: str(o.ST_CD), zip: str(o.AD_ZP) }))
        .filter((o): o is typeof o & { name: string } => Boolean(o.name) && !/\b(LLC|L L C|INC|LTD|LP|CORP|COMPANY|TRUST)\b/i.test(o.name!));
      if (officers.length === 0) return {};
      const rank = (title?: string) => {
        const i = RUNS_IT.findIndex((re) => title && re.test(title));
        return i === -1 ? RUNS_IT.length : i;
      };
      const best = [...officers].sort((a, b) => rank(a.title) - rank(b.title))[0];
      const address = [best.street, [best.city, best.state].filter(Boolean).join(", "), best.zip?.slice(0, 5)].filter(Boolean).join(", ");
      return {
        person: {
          name: titleCase(best.name),
          title: best.title ? titleCase(best.title) : undefined,
          address: address || undefined,
          source: "tx-comptroller",
        },
      };
    },
  };
}

/** The stack, in the order it's tried: free state records first, then the paid traces. */
export function vendors(env: Record<string, string | undefined>): Vendor[] {
  return [comptrollerTexas(env.TX_COMPTROLLER_API_KEY), batchData(env.BATCHDATA_API_KEY), tracerfy(env.TRACERFY_API_KEY, fetch, env.TRACERFY_API_BASE || undefined)];
}

// ---- Email deliverability ----

/** What a checker says about one address. */
export type Verdict = "valid" | "invalid" | "catch-all" | "unknown";
export type Verifier = {
  name: string;
  /** True when the deployment holds its key. */
  connected: boolean;
  verify: (email: string) => Promise<Verdict>;
};

/**
 * ZeroBounce: GET /v2/validate?api_key=&email= answers {status, sub_status}.
 * valid is a mailbox that exists and accepts mail; invalid, spam traps,
 * abuse reporters and do-not-mail addresses are dropped; catch-all and
 * unknown are kept, unverified. An error in the body (a bad key, no
 * credits) throws, so the check is skipped and the emails stay as found.
 */
export function zeroBounce(key: string | undefined, fetchFn: Fetch = fetch, base = "https://api.zerobounce.net"): Verifier {
  return {
    name: "zerobounce",
    connected: Boolean(key),
    verify: async (email) => {
      const response = await fetchFn(`${base}/v2/validate?api_key=${encodeURIComponent(key ?? "")}&email=${encodeURIComponent(email)}&ip_address=`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`ZeroBounce: HTTP ${response.status}`);
      const body = (await response.json()) as { status?: string; error?: string };
      if (body.error) throw new Error(`ZeroBounce: ${body.error}`);
      switch (body.status) {
        case "valid":
          return "valid";
        case "invalid":
        case "spamtrap":
        case "abuse":
        case "do_not_mail":
          return "invalid";
        case "catch-all":
          return "catch-all";
        default:
          return "unknown";
      }
    },
  };
}

export function verifier(env: Record<string, string | undefined>): Verifier {
  return zeroBounce(env.ZEROBOUNCE_API_KEY);
}

/** How many of a contact's emails get checked; the rest stay as found. */
const CHECK_AT_MOST = 3;

/**
 * Runs the found emails through the checker: deliverable ones are marked
 * verified, dead ones dropped, the rest kept as they were. Returns the
 * emails to keep and the checker's turn for the ledger.
 */
export async function checkEmails(emails: Email[], checker: Verifier): Promise<{ emails: Email[]; try: Try }> {
  if (emails.length === 0) return { emails, try: { source: checker.name, outcome: "skipped", note: "Nothing to check" } };
  if (!checker.connected) return { emails, try: { source: checker.name, outcome: "skipped", note: "Not connected" } };
  const kept: Email[] = [];
  let valid = 0;
  let dropped = 0;
  let checked = 0;
  try {
    for (const e of emails) {
      if (checked >= CHECK_AT_MOST) {
        kept.push(e);
        continue;
      }
      checked++;
      const verdict = await checker.verify(e.email);
      if (verdict === "valid") {
        valid++;
        kept.push({ ...e, verified: true });
      } else if (verdict === "invalid") dropped++;
      else kept.push(e);
    }
  } catch (e) {
    return { emails, try: { source: checker.name, outcome: "error", note: e instanceof Error ? e.message : String(e) } };
  }
  const note = [`${valid} of ${checked} deliverable`, dropped ? `${dropped} dropped` : ""].filter(Boolean).join(" · ");
  return { emails: kept, try: { source: checker.name, outcome: valid > 0 ? "hit" : "miss", note } };
}

/** The keys a field's sources need, for the "not connected" note. */
export const KEY_FOR: Record<Field, string> = {
  person: "TX_COMPTROLLER_API_KEY",
  phone: "BATCHDATA_API_KEY or TRACERFY_API_KEY",
  email: "BATCHDATA_API_KEY or TRACERFY_API_KEY",
  research: "ANTHROPIC_API_KEY",
};

/** One source's turn for a field: what it said, or why it wasn't asked. */
export type Try = { source: string; outcome: "hit" | "miss" | "error" | "skipped"; note?: string };
export type Outcome = { field: Field; found: Found; source?: string; errors: string[]; tries: Try[] };

/** What a hit says in the ledger: the person's name and title, or how many numbers or addresses. */
const hitNote = (field: Field, found: Found) => {
  if (field === "person") return `${found.person!.name}${found.person!.title ? `, ${found.person!.title}` : ""}`;
  const n = field === "phone" ? rankPhones(found.phones!).length : dedupeEmails(found.emails!).length;
  const what = field === "phone" ? "number" : "email";
  return `${n} ${what}${n === 1 ? "" : "s"}`;
};

/**
 * Runs the stack for the fields asked for, in the order person → phone →
 * email, so a person found for a company is who the phone vendors look
 * up. Each source is called at most once per contact; its answer feeds
 * every field it covers. A source that throws is skipped (its message
 * kept), so one outage doesn't fail the unlock.
 */
export async function waterfall(input: TraceInput, vendors: Vendor[], fields: Field[]): Promise<Outcome[]> {
  const answers = new Map<string, Promise<Found>>();
  const ask = (vendor: Vendor) => {
    let p = answers.get(vendor.name);
    if (!p) {
      p = vendor.trace(input);
      answers.set(vendor.name, p);
    }
    return p;
  };
  const has = (field: Field, found: Found) =>
    field === "person" ? Boolean(found.person) : field === "phone" ? (found.phones?.length ?? 0) > 0 : (found.emails?.length ?? 0) > 0;
  const out: Outcome[] = [];
  const order: Field[] = ["person", "phone", "email"];
  for (const field of order) {
    if (!fields.includes(field)) continue;
    const errors: string[] = [];
    const tries: Try[] = [];
    let result: Outcome | undefined;
    for (const vendor of vendors) {
      if (!vendor.fields.includes(field)) continue;
      if (!vendor.connected) {
        tries.push({ source: vendor.name, outcome: "skipped", note: "Not connected" });
        continue;
      }
      if (result) {
        tries.push({ source: vendor.name, outcome: "skipped", note: "Not needed, already found" });
        continue;
      }
      try {
        const found = await ask(vendor);
        if (has(field, found)) {
          result = { field, found, source: vendor.name, errors, tries };
          tries.push({ source: vendor.name, outcome: "hit", note: hitNote(field, found) });
        } else {
          tries.push({ source: vendor.name, outcome: "miss", note: "No match" });
        }
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        const message = `${vendor.name}: ${text}`;
        if (!errors.includes(message)) errors.push(message);
        tries.push({ source: vendor.name, outcome: "error", note: text });
      }
    }
    result ??= { field, found: {}, errors, tries };
    if (field === "person" && result.found.person) input = { ...input, person: result.found.person };
    out.push(result);
  }
  return out;
}
