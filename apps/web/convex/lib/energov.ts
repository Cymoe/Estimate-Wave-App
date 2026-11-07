// Midland's permit portal (Tyler EnerGov Citizen Self Service) has, for
// each permit, the companies on it and what the job is worth. The public
// permit layer (lib/permits.ts) doesn't. These read the portal's own JSON:
// the same request its permit page makes, no login. Pure functions; the
// action in permits.ts fetches.

export const MIDLAND_ENERGOV = {
  base: "https://comapps.midlandtexas.gov/energov/selfservice/api/energov/permits/permit/",
  headers: {
    accept: "application/json",
    tenantId: "1",
    "Tyler-TenantUrl": "www.midlandtexas.gov",
    "Tyler-Tenant-Culture": "en-US",
  },
} as const;

/** The portal's id for a permit, from the link the city stores ("…#/permit/9ee91cca-…"). */
export function permitGuid(url: string | undefined): string | undefined {
  return url?.match(/#\/permit\/([0-9a-f-]{36})/i)?.[1];
}

export type PermitContact = { role: string; company: string; person?: string; phone?: string; email?: string };
export type PermitDetails = {
  valuationCents?: number;
  squareFeet?: number;
  contacts: PermitContact[];
  builder?: string;
};

const clean = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text || undefined;
};

/**
 * What a permit's portal record says: value, size and the companies on it.
 * A contact without a company name is left out (that's usually a homeowner
 * pulling their own permit), and the same company in the same role once.
 */
export function detailsFrom(result: unknown): PermitDetails {
  const r = (result ?? {}) as { ValuationValue?: unknown; SquareFeet?: unknown; Contacts?: unknown };
  const contacts: PermitContact[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(r.Contacts) ? (r.Contacts as Record<string, unknown>[]) : []) {
    const company = clean(c.GlobalEntityName);
    const role = clean(c.ContactTypeName) ?? "Contact";
    if (!company) continue;
    const key = `${role.toLowerCase()}|${company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const person = clean([c.FirstName, c.LastName].filter((x) => typeof x === "string").join(" "));
    contacts.push({
      role,
      company,
      ...(person && person.toLowerCase() !== company.toLowerCase() ? { person } : {}),
      ...(clean(c.Phone) ? { phone: clean(c.Phone) } : {}),
      ...(clean(c.EmailTo) ? { email: clean(c.EmailTo) } : {}),
    });
  }
  const value = typeof r.ValuationValue === "number" && r.ValuationValue > 0 ? Math.round(r.ValuationValue * 100) : undefined;
  const size = typeof r.SquareFeet === "number" && r.SquareFeet > 0 ? Math.round(r.SquareFeet) : undefined;
  const builder = (contacts.find((c) => c.role === "Contractor") ?? contacts.find((c) => c.role === "Applicant"))?.company;
  return { valuationCents: value, squareFeet: size, contacts, builder };
}

/** A contact that did the work (Contractor, Electrical Contractor, Mechanical Contractor…), not the applicant or owner. */
export const isContractor = (c: PermitContact) => /contractor/i.test(c.role);
