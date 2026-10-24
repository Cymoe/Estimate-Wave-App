// Turning whatever a form, a connector or a person sends into an intake
// lead. Pure functions: the mutations in ../intake.ts call these.

import { normalizeCounty, TEXAS_COUNTIES } from "./counties";

/** How long the same phone counts as the same homeowner (Angi credits a duplicate inside 45 days). */
export const DUPLICATE_WINDOW_DAYS = 45;

/** Ten digits for a US number, or undefined when it isn't one. */
export function normalizePhone(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : undefined;
}

/** What the connector or form gave us, in our names. */
export interface IntakeFields {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  zip?: string;
  county?: string;
  jobType?: string;
  scope?: string;
  timeline?: string;
  isOwner?: boolean;
  notes?: string;
  externalId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  formId?: string;
  consent?: { text?: string; value?: string; at?: string };
  createdTime?: string;
}

// Keys as connectors send them, compared without case, spaces or underscores.
const KEYS: Record<keyof Omit<IntakeFields, "consent" | "isOwner">, string[]> = {
  name: ["fullname", "name", "firstname"],
  phone: ["phonenumber", "phone", "mobile", "cell"],
  email: ["email", "emailaddress"],
  address: ["streetaddress", "address", "street"],
  city: ["city", "town"],
  zip: ["zipcode", "zip", "postcode", "postalcode"],
  county: ["county"],
  jobType: ["jobtype", "trade", "service", "servicetype", "whatdoyouneed"],
  scope: ["scope", "projecttype", "whatkindofwork"],
  timeline: ["timeline", "whendoyouwantthisdone", "whendoyouneedit", "timing"],
  notes: ["notes", "description", "details", "message", "comments"],
  externalId: ["leadgenid", "leadid", "id"],
  campaignName: ["campaignname", "campaign"],
  adsetName: ["adsetname", "adset"],
  adName: ["adname", "ad"],
  formId: ["formid", "form"],
  createdTime: ["createdtime", "created", "timestamp", "submittedat"],
};

// Question-style keys ("Which county is the home in?") match by what they contain.
const CONTAINS: Partial<Record<keyof typeof KEYS, string[]>> = {
  county: ["county"],
  timeline: ["whendoyou", "howsoon", "timeline"],
  zip: ["zip"],
  jobType: ["whatservice", "whatdoyouneed", "typeofwork", "trade"],
  notes: ["describe", "tellus", "details"],
};

const squash = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return text(value[0]);
  const s = String(value).trim();
  return s ? s : undefined;
};

/** Meta's raw lead has answers as [{ name, values: [...] }]; flatten those into the object. */
function flatten(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  const fieldData = payload.field_data ?? payload.fieldData;
  if (Array.isArray(fieldData)) {
    for (const entry of fieldData) {
      if (entry && typeof entry === "object" && "name" in entry) {
        const e = entry as { name: string; values?: unknown[] };
        out[e.name] = e.values?.[0];
      }
    }
  }
  return out;
}

/**
 * Picks our fields out of a JSON body from Zapier, LeadsBridge, Make, a Meta
 * webhook read, or our own form. Unknown keys are left in `raw` by the caller.
 */
export function fieldsFromPayload(payload: unknown): IntakeFields {
  if (!payload || typeof payload !== "object") return {};
  const flat = flatten(payload as Record<string, unknown>);
  const bySquashed = new Map<string, unknown>();
  for (const [key, value] of Object.entries(flat)) bySquashed.set(squash(key), value);

  const fields: IntakeFields = {};
  for (const [ours, theirs] of Object.entries(KEYS) as Array<[keyof typeof KEYS, string[]]>) {
    for (const candidate of theirs) {
      const value = text(bySquashed.get(candidate));
      if (value !== undefined) {
        fields[ours] = value;
        break;
      }
    }
    if (fields[ours] !== undefined) continue;
    for (const part of CONTAINS[ours] ?? []) {
      const key = [...bySquashed.keys()].find((k) => k.includes(part));
      const value = key === undefined ? undefined : text(bySquashed.get(key));
      if (value !== undefined) {
        fields[ours] = value;
        break;
      }
    }
  }
  // A first name plus a last name, when the form split them.
  const last = text(bySquashed.get("lastname"));
  if (fields.name && last && bySquashed.get("fullname") === undefined && bySquashed.get("name") === undefined) {
    fields.name = `${fields.name} ${last}`;
  }
  // Meta ids are numbers too big for JS; keep whatever string form arrived.
  if (fields.externalId && /^\d+(\.\d+)?e\+\d+$/i.test(fields.externalId)) delete fields.externalId;

  // Consent: any key mentioning consent or disclaimer, plus Meta's custom_disclaimer_responses.
  for (const [key, value] of bySquashed) {
    if (key.includes("consent") || key.includes("disclaimer") || key.includes("agree")) {
      const v = Array.isArray(value) && value[0] && typeof value[0] === "object"
        ? (value[0] as { is_checked?: unknown; checkbox_key?: unknown })
        : undefined;
      fields.consent = v
        ? { text: text(v.checkbox_key), value: text(v.is_checked), at: fields.createdTime }
        : { text: key, value: text(value), at: fields.createdTime };
      break;
    }
  }
  // "I own this home": yes/no answers.
  const ownerKey = [...bySquashed.keys()].find((k) => k === "isowner" || k === "owner" || k.includes("ownthishome") || k.includes("homeowner"));
  const ownerAnswer = ownerKey === undefined ? undefined : text(bySquashed.get(ownerKey));
  if (ownerAnswer !== undefined) fields.isOwner = /^(yes|y|true|1|own|i own)/i.test(ownerAnswer);
  if (fields.county) fields.county = normalizeCounty(fields.county) ?? fields.county;
  return fields;
}

const code = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/**
 * Reads the county and trade out of a campaign (or ad set) name such as
 * "TX_MIDLAND_ROOFING_LG_202610". Counties and trades may hold underscores
 * ("TOM_GREEN", "GENERAL_CONSTRUCTION"), so the longest run of tokens that
 * matches wins. Anything after the trade is ignored.
 */
export function parseCampaign(
  name: string | undefined,
  trades: readonly string[],
): { county?: string; jobType?: string } {
  if (!name) return {};
  const tokens = code(name).split("_").filter(Boolean);
  let start = tokens[0] === "TX" ? 1 : 0;
  const match = (options: readonly string[]) => {
    for (let len = Math.min(3, tokens.length - start); len >= 1; len--) {
      const candidate = tokens.slice(start, start + len).join("_");
      const found = options.find((o) => code(o) === candidate);
      if (found) {
        start += len;
        return found;
      }
    }
    return undefined;
  };
  const county = match(TEXAS_COUNTIES);
  const jobType = match(trades);
  return { county, jobType };
}

/** Something to call the lead by in a list when the form had no name. */
export function intakeLabel(fields: { name?: string; phone?: string; email?: string }): string {
  return fields.name ?? fields.phone ?? fields.email ?? "No name";
}
