// Sample results for a list, as a run with every key set would leave them:
// the person behind each company, ranked phones with their checks, emails,
// research, and the misses, failures and flags a real run has too. Only for
// seeing the page before the keys are in. Everything is marked: 555-01xx
// numbers (reserved for fiction), example.com addresses, and the note.

import type { Infer } from "convex/values";
import type { outreachEmail, outreachPerson, outreachPhone, outreachResearch, outreachTry } from "../schema";
import type { Found, Vendor } from "./skipTrace";

export const SAMPLE_NOTE = "Sample data to show the layout, not a real lookup.";
/** How many owners one run fills at most. */
export const SAMPLE_MAX = 50;

type Phone = Infer<typeof outreachPhone>;
type Email = Infer<typeof outreachEmail>;
type Person = Infer<typeof outreachPerson>;
type Research = Infer<typeof outreachResearch>;
type Try = Infer<typeof outreachTry>;
export type SampleCell =
  | { status: "locked" }
  | { status: "found" | "none" | "failed"; at: string; source?: string; chargedCents?: number; error?: string; tries: Try[] };
export type Sample = {
  person?: Person;
  phones?: Phone[];
  emails?: Email[];
  research?: Research;
  cells: { person: SampleCell; phone: SampleCell; email: SampleCell; research: SampleCell };
};

/** A sample number: 432-555-01xx, never a real line. */
export const isSampleNumber = (n: string) => /^43255501\d\d$/.test(n);

const PEOPLE: Array<[string, string]> = [
  ["Mark", "Ellison"], ["Dana", "Whitfield"], ["Luis", "Ortega"], ["Karen", "Holt"], ["Brian", "Castillo"],
  ["Jill", "Navarro"], ["Travis", "Kemp"], ["Rosa", "Delgado"], ["Wade", "Pruitt"], ["Angela", "Moss"],
  ["Cody", "Brennan"], ["Teresa", "Vance"], ["Hector", "Ruiz"], ["Melissa", "Crane"], ["Garrett", "Shaw"],
  ["Priya", "Raman"], ["Dale", "Hutchins"], ["Erin", "Faulk"], ["Victor", "Salinas"], ["Leah", "Booker"],
];
const TITLES = ["Managing member", "Manager", "President", "General partner", "Director"];
const DEFAULT_QUESTION = "Who is this owner, what do they do, and is there any sign of planned construction?";

const skipped = (source: string, note: string): Try => ({ source, outcome: "skipped", note });
const NOT_NEEDED = "Not needed, already found";

/**
 * What the run turned up for the i-th owner on the list. The mix follows a
 * real run: most owners give a person and a phone, some only one, a few
 * nothing; one in ten fails and waits on Retry, and one in ten is left
 * unlooked so the Look up button still has something to do.
 */
export function sampleFor(i: number, owner: { name: string; company: boolean; properties: number }, at: string, named?: string): Sample {
  // The person already on the owner, when there is one, so a rerun keeps the same name.
  const parts = named?.trim().split(/\s+/) ?? [];
  const [first, last] = parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : PEOPLE[i % PEOPLE.length];
  const who = owner.company ? (parts.length >= 2 ? named!.trim() : `${first} ${last}`) : owner.name;
  const title = TITLES[i % TITLES.length];
  const n = (k: number) => String(4325550100 + ((i * 2 + k) % 100));
  const mail = `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
  const locked: SampleCell = { status: "locked" };
  const kind = i % 10;
  if (kind === 6) return { cells: { person: locked, phone: locked, email: locked, research: locked } };

  // Step 2: the person behind a company, free; people own in their own name.
  const personTries: Try[] = [
    skipped("roll", "The mail doesn't go to a street address"),
    skipped("permits", "No permits at the property"),
    kind === 7 ? { source: "tx-comptroller", outcome: "miss", note: "No match" } : { source: "tx-comptroller", outcome: "hit", note: `${who}, ${title}` },
    kind === 7 ? { source: "cobalt", outcome: "miss", note: "No officer or agent who is a person" } : skipped("cobalt", NOT_NEEDED),
  ];
  const person: Person | undefined =
    owner.company && kind !== 7
      ? { name: who, title, address: `${100 + i} W Wall St, Midland, TX, 79701`, source: "tx-comptroller", ...(kind === 2 ? { confirmedBy: ["roll"] } : {}) }
      : undefined;
  if (person && kind === 2) personTries[0] = { source: "roll", outcome: "hit", note: `Also names ${who}` };
  const personCell: SampleCell = owner.company
    ? person
      ? { status: "found", at, source: "tx-comptroller", tries: personTries }
      : { status: "none", at, tries: personTries }
    : locked;

  // Step 3: the phone, $1 when found.
  const phoneVendors = (hit: "batchdata" | "tracerfy" | undefined, count: number): Try[] => [
    skipped("permits", "No permits at the property"),
    hit === "batchdata" ? { source: "batchdata", outcome: "hit", note: `${count} numbers` } : { source: "batchdata", outcome: "miss", note: "No match" },
    hit === "tracerfy" ? { source: "tracerfy", outcome: "hit", note: `${count} numbers` } : hit ? skipped("tracerfy", NOT_NEEDED) : { source: "tracerfy", outcome: "miss", note: "No match" },
    hit ? skipped("enformion", NOT_NEEDED) : { source: "enformion", outcome: "miss", note: "No match" },
  ];
  let phones: Phone[] | undefined;
  let phoneCell: SampleCell;
  if (kind === 3 || kind === 7) {
    phoneCell = { status: "none", at, tries: phoneVendors(undefined, 0) };
  } else if (kind === 9) {
    phoneCell = {
      status: "failed",
      at,
      error: "batchdata: HTTP 503 Service Unavailable",
      tries: [skipped("permits", "No permits at the property"), { source: "batchdata", outcome: "error", note: "HTTP 503 Service Unavailable" }, { source: "tracerfy", outcome: "error", note: "Took longer than 20 seconds" }, { source: "enformion", outcome: "miss", note: "No match" }],
    };
  } else {
    const via = kind === 1 ? "tracerfy" : "batchdata";
    phones =
      kind === 4
        ? [
            { number: n(0), type: "mobile", verified: true, dnc: true, score: 90, grade: "B", source: via },
            { number: n(1), type: "landline", verified: true, dnc: true, score: 55, grade: "C", source: via },
          ]
        : kind === 8
          ? [
              { number: n(0), type: "mobile", verified: true, litigator: true, score: 90, grade: "B", source: via },
              { number: n(1), type: "landline", verified: true, score: 60, grade: "C", name: who.toUpperCase(), source: via },
            ]
          : kind === 1
            ? [
                { number: n(0), type: "voip", verified: true, score: 80, grade: "C", source: via },
                { number: n(1), type: "mobile", verified: true, score: 75, grade: "B", source: via },
              ]
            : [
                { number: n(0), type: "mobile", verified: true, score: 100, grade: "A", name: who.toUpperCase(), source: via },
                { number: n(1), type: "landline", verified: true, score: 60, grade: "C", source: via },
              ];
    const flagged = phones.filter((p) => p.dnc || p.litigator).length;
    phoneCell = {
      status: "found",
      at,
      source: via,
      chargedCents: 100,
      tries: [
        ...phoneVendors(via, phones.length),
        { source: "trestle", outcome: "hit", note: `${phones.length} of ${phones.length} live · ${phones.filter((p) => p.name).length} in the owner's name` },
        skipped("twilio", "Not needed, already checked"),
        { source: "tracerfy-dnc", outcome: "hit", note: flagged ? `${flagged} flagged: ${kind === 8 ? "a known litigator" : "on the Do Not Call list"}` : `${phones.length} clear` },
      ],
    };
  }

  // Step 4: the email, included.
  const emailVendors = (hit: string | undefined): Try[] => [
    skipped("permits", "No permits at the property"),
    hit === "batchdata" ? { source: "batchdata", outcome: "hit", note: "1 email" } : { source: "batchdata", outcome: "miss", note: "No match" },
    skipped("tracerfy", hit ? NOT_NEEDED : "No match"),
    skipped("enformion", hit ? NOT_NEEDED : "No match"),
    hit === "hunter" ? { source: "hunter", outcome: "hit", note: "1 email" } : hit ? skipped("hunter", NOT_NEEDED) : { source: "hunter", outcome: "miss", note: "No match" },
    hit ? skipped("leadmagic", NOT_NEEDED) : { source: "leadmagic", outcome: "miss", note: "No match" },
  ];
  let emails: Email[] | undefined;
  let emailCell: SampleCell;
  if (kind === 1 || kind === 3 || kind === 7) {
    emailCell = { status: "none", at, tries: emailVendors(undefined) };
  } else if (kind === 9) {
    emailCell = { status: "failed", at, error: "batchdata: HTTP 503 Service Unavailable", tries: [skipped("permits", "No permits at the property"), { source: "batchdata", outcome: "error", note: "HTTP 503 Service Unavailable" }] };
  } else {
    const via = kind === 2 ? "hunter" : "batchdata";
    emails =
      kind === 2
        ? [
            { email: `office@${last.toLowerCase()}holdings.example.com`, source: via, verified: true, nameMatch: false, grade: "D" },
            { email: mail, source: via, verified: true },
          ]
        : [{ email: mail, source: via, verified: true, nameMatch: true, grade: "A" }];
    emailCell = {
      status: "found",
      at,
      source: via,
      tries: [...emailVendors(via), { source: "zerobounce", outcome: "hit", note: `${emails.length} deliverable` }, kind === 2 ? { source: "trestle", outcome: "miss", note: "Not in the owner's name · grade D" } : { source: "trestle", outcome: "hit", note: "In the owner's name · grade A" }],
    };
  }

  // Research, 25¢, on the biggest holders.
  const asked = kind === 0 || kind === 5;
  const research: Research | undefined = asked
    ? {
        question: DEFAULT_QUESTION,
        answer: `Sample: ${owner.name} holds ${owner.properties} Midland ${owner.properties === 1 ? "property" : "properties"}${person ? `, run by ${person.name}` : ""}. A site-work permit was filed in the last year, and the company lists new rentals on its website.`,
        sources: [{ title: "Company website (sample)", url: "https://example.com/owner" }, { title: "Midland permit search (sample)", url: "https://example.com/permits" }],
        at,
      }
    : undefined;
  const researchCell: SampleCell = asked ? { status: "found", at, source: "claude", chargedCents: 25, tries: [{ source: "claude", outcome: "hit", note: "2 pages read" }] } : locked;

  return { person, phones, emails, research, cells: { person: personCell, phone: phoneCell, email: emailCell, research: researchCell } };
}

/** Which run an owner gets on a rerun, from its name: the same each time, never "not looked up" or "failed". */
export function sampleIndex(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  const i = h % 10;
  return i === 6 ? 0 : i === 9 ? 5 : i;
}

/**
 * The stack a sample owner's rerun walks: every real source by name, in the
 * real order, each taking a moment and answering from the sample, so the
 * page shows the whole chain the way a run with keys does. Nothing outside
 * is called.
 */
export function sampleStack(s: Sample, wait: () => Promise<void>): Vendor[] {
  const phoneVia = s.cells.phone.status === "found" ? s.cells.phone.source : undefined;
  const emailVia = s.cells.email.status === "found" ? s.cells.email.source : undefined;
  const answer = (name: string): Found => ({
    ...(name === "tx-comptroller" && s.person ? { person: s.person } : {}),
    ...(name === "roll" && s.person?.confirmedBy?.includes("roll") ? { person: { ...s.person, source: "roll", confirmedBy: undefined } } : {}),
    ...(phoneVia === name && s.phones ? { phones: s.phones } : {}),
    ...(emailVia === name && s.emails ? { emails: s.emails } : {}),
  });
  const vendor = (name: string, fields: Vendor["fields"], extra: Partial<Vendor> = {}): Vendor => ({
    name,
    fields,
    connected: true,
    trace: async () => {
      await wait();
      return answer(name);
    },
    ...extra,
  });
  return [
    vendor("roll", ["person"], { free: true, authority: 1 }),
    vendor("permits", ["person", "phone", "email"], { free: true, authority: 2 }),
    vendor("tx-comptroller", ["person"], { free: true, authority: 3 }),
    vendor("cobalt", ["person"]),
    vendor("batchdata", ["phone", "email"]),
    vendor("tracerfy", ["phone", "email"]),
    vendor("enformion", ["phone", "email"]),
    vendor("hunter", ["email"]),
    vendor("leadmagic", ["email"]),
  ];
}
