"use node";
// A contact's enrichment, in the Node runtime: reads the contact, runs the
// source waterfall for the fields asked for, and records each field's
// answer (outreach.ts charges a found phone). Sources are whatever keys
// the deployment has; none for a field is a failed cell that says so and
// costs nothing. Whatever goes wrong, every field asked for ends up
// written: a cell never stays "running" because the lookup blew up.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { outreachField } from "./schema";
import { KEY_FOR, PRACTICE_SKIP, applyEmailCheck, BUSY_RETRY_MS, guarded, isBusy, paced, checkEmails, checkPhonesWith, dedupeEmails, expectedNames, lineOwner, phoneCheckers, phoneScrub, rankPhones, scrubPhones, standsAlone, vendors, verifier, waterfall, type EmailCheck, type Field, type Found, type Progress, type Reuse, type TraceInput, type Try, type Vendor } from "./lib/skipTrace";
import { researchOwner } from "./lib/research";
import { districtOwnerNow, sameOwnerName } from "./lib/district";
import { displayName } from "./lib/outreach";
import { sampleFor, sampleIndex, sampleStack } from "./lib/outreachSample";

type TraceArgs = { contactId: import("./_generated/dataModel").Id<"outreachContacts">; fields: Field[]; attempt?: number };

/** The sources' fetch: calls to a rate-limited source (the Comptroller) wait their turn in one line shared by every lookup. */
const sourceFetch = (ctx: ActionCtx) => guarded(paced(fetch, (source, gapMs) => ctx.runMutation(internal.outreach.paceSlot, { source, gapMs }), process.env));

/**
 * The person wasn't found because a source said "slow down": the lookup goes back in the queue to try again in a few
 * minutes (true), rather than ending as a failure the owner has to retry by hand. False once it has been tried enough.
 */
/** Why nothing was found, when a source errored; a source still saying "slow down" after the retries is said plainly. */
const errorOf = (o: { source?: string; errors: string[] }, field: Field) =>
  o.source || o.errors.length === 0
    ? undefined
    : field === "person" && isBusy(o.errors)
      ? `Still turned away after ${BUSY_RETRY_MS.length} more tries a few minutes apart (too many searches at once, or the month's allowance is used up). Try again later. (${o.errors.join("; ")})`
      : o.errors.join("; ");

async function retryWhenBusy(ctx: ActionCtx, contactId: TraceArgs["contactId"], attempt: number, o: { source?: string; errors: string[]; tries: Try[] }) {
  if (o.source || !isBusy(o.errors)) return false;
  const busy = o.tries.find((t) => t.outcome === "error" && /HTTP 429\b/.test(t.note ?? ""))?.source ?? "A source";
  return await ctx.runMutation(internal.outreach.tryAgainLater, { contactId, field: "person", attempt, source: busy, tries: o.tries });
}

export const trace = internalAction({
  /** queueId: the lookup's place in the queue (outreach.ts pump), freed when it ends so the next one waiting starts. */
  args: { contactId: v.id("outreachContacts"), fields: v.array(outreachField), queueId: v.optional(v.id("outreachQueue")), attempt: v.optional(v.number()) },
  handler: async (ctx, { queueId, ...args }) => {
    try {
      await run(ctx, args);
    } catch (e) {
      // The safety net: whatever is still running for this request is failed with the reason, so Retry shows up.
      const text = e instanceof Error ? e.message : String(e);
      for (const field of args.fields) {
        await ctx.runMutation(internal.outreach.recordEnrichment, { contactId: args.contactId, field, error: `The lookup stopped: ${text}` });
      }
    } finally {
      if (queueId) await ctx.runMutation(internal.outreach.lookupDone, { queueId });
    }
    return null;
  },
});

async function run(ctx: ActionCtx, { contactId, fields, attempt = 0 }: TraceArgs) {
  const input = await ctx.runQuery(internal.outreach.contactForTrace, { contactId });
  if (!input) return;
  const wanted = fields.filter((f): f is Field => input.fields.includes(f));
  // First, and free: does this owner still own the property? The district's roll is posted twice a year, so a sale
  // since may not be on it yet. A sold one stops here, saying who owns it now, before anything is paid for. Where the
  // owner is the same, the lookup goes out with where the district sends their bill today.
  if (input.stillOwns && !input.sample && wanted.length > 0) {
    await ctx.runMutation(internal.outreach.noteProgress, { contactId, field: wanted[0], asking: "district", tries: [] }).catch(() => {});
    const now = await districtOwnerNow(input.stillOwns.cadId);
    if (now && !sameOwnerName(input.stillOwns, now.owner)) {
      const when = now.boughtOn ? ` ${new Date(`${now.boughtOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}` : "";
      const error = `Sold${when}: the appraisal district now lists ${displayName(now.owner)} as the owner. Nothing was looked up and nothing charged.`;
      for (const field of wanted) {
        await ctx.runMutation(internal.outreach.recordEnrichment, { contactId, field, error, tries: [{ source: "district", outcome: "miss", note: `Owner today: ${displayName(now.owner)}` }] });
      }
      return;
    }
    if (now?.mailing.address) input.mailing = { ...now.mailing, ...(now.mailing.zip ? { zip: now.mailing.zip.slice(0, 5) } : {}) };
  }
  // Until a phone source is connected, the phones, emails and research come from the simulated chain, so the page can
  // be seen working; those are marked simulated and never charged. The person behind a company is looked up for real
  // all the same, from the free sources: a made-up decision maker is no use to anyone.
  // OUTREACH_SIMULATE=off turns it off (the tests of the real path do).
  const simulate = process.env.OUTREACH_SIMULATE !== "off" && !vendors(process.env).some((s) => standsAlone(s, "phone"));
  if (input.sample) return await runSample(ctx, contactId, input, wanted, false);
  const own = await ownRecords(ctx, input, wanted);
  if (simulate) return await runPractice(ctx, contactId, input, wanted, own, attempt);
  const external = vendors(process.env, sourceFetch(ctx));
  const stack = [...own, ...external];
  // Our own records always get their turn; "not connected" is about the outside sources.
  const none = (field: Field) => !external.some((s) => standsAlone(s, field));
  // A decision maker already found, with a phone, on a sister entity: copy it rather than pay for it again.
  const reuse: Reuse = async (field, who) => {
    const hit = who.person ? await ctx.runQuery(internal.outreach.sharedLookup, { contactId, person: who.person }) : null;
    if (!hit) return undefined;
    const note = `Same decision maker as ${hit.from}; copied, no charge`;
    return field === "phone" ? { found: { phones: hit.phones as Found["phones"] }, note } : { found: { emails: hit.emails as Found["emails"] }, note };
  };
  // Each source's turn as it happens, so the page can say what the lookup is doing.
  const progress: Progress = async (field, tries, asking) => {
    await ctx.runMutation(internal.outreach.noteProgress, { contactId, field, asking, tries });
  };
  const say = (field: Field, tries: Try[], asking: string) => progress(field, tries, asking).catch(() => {});
  const outcomes = await waterfall(input, stack, wanted.filter((f) => f !== "research"), reuse, progress);
  const isShared = (field: Field) => outcomes.find((x) => x.field === field)?.source === "shared";
  // Deliverability first, so the one name check rides on a live address, not one about to be dropped.
  const emailOutcome = outcomes.find((x) => x.field === "email");
  let emailsKept = wanted.includes("email") ? dedupeEmails(emailOutcome?.found.emails ?? []) : [];
  let deliverability: Try | undefined;
  // Copied addresses were checked on the owner they came from.
  if (emailsKept.length > 0 && !isShared("email")) {
    await say("email", emailOutcome?.tries ?? [], "zerobounce");
    const checked = await checkEmails(emailsKept, verifier(process.env));
    emailsKept = checked.emails;
    deliverability = checked.try;
  }
  // The phone step runs before the email step: the contact check's word on the first live email rides on the first phone call.
  const checkers = phoneCheckers(process.env);
  const firstEmail = emailsKept[0]?.email;
  let emailCheck: (EmailCheck & { source: string }) | undefined;
  let phonesChecked = false;
  const order: Field[] = ["person", "phone", "email"];
  for (const field of [...wanted].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    if (field === "research") continue;
    const o = outcomes.find((x) => x.field === field)!;
    // The person turned away for now ("slow down"): asked again in a few minutes instead of failed.
    if (field === "person" && (await retryWhenBusy(ctx, contactId, attempt, o))) continue;
    if (!o.source && none(field)) {
      await ctx.runMutation(internal.outreach.recordEnrichment, {
        contactId,
        field,
        error: `No source for this is connected yet (${KEY_FOR[field]} isn't set on the Convex deployment).`.replace("isn't set", field === "person" ? "isn't set" : "aren't set"),
        tries: o.tries,
      });
      continue;
    }
    let emails = field === "email" ? emailsKept : undefined;
    let phones = field === "phone" ? (o.source === "shared" ? (o.found.phones ?? []) : rankPhones(o.found.phones ?? [])) : undefined;
    const tries = [...o.tries];
    // Copied numbers were checked and scrubbed on the owner they came from: no second paid check.
    if (field === "phone" && phones && phones.length > 0 && o.source !== "shared") {
      // The checker's word: dead lines go, live ones carry their type, the name on the account or a name match, and a grade.
      const person = outcomes.find((x) => x.field === "person")?.found.person ?? input.person;
      const who = { ...input, person };
      await say("phone", tries, checkers.find((c) => c.connected)?.name ?? "trestle");
      const checked = await checkPhonesWith(phones, checkers, expectedNames(who), lineOwner(who), firstEmail);
      phones = checked.phones;
      emailCheck = checked.email;
      phonesChecked = checked.tries.some((t) => t.outcome === "hit" || t.outcome === "miss");
      tries.push(...checked.tries);
      // Then the Do Not Call scrub on what's left: flags, never drops, so the sheet can say why not to call.
      await say("phone", [...tries, ...checked.tries], "tracerfy-dnc");
      const scrubbed = await scrubPhones(phones, phoneScrub(process.env));
      phones = scrubbed.phones;
      tries.push(scrubbed.try);
      for (const t of [...checked.tries, scrubbed.try]) {
        if (t.outcome === "hit" || t.outcome === "miss") await ctx.runMutation(internal.outreach.recordCheck, { contactId, source: t.source, field: "phone", hit: t.outcome === "hit" });
      }
    }
    if (field === "email" && deliverability) {
      // Deliverability (already run, above): dead addresses were dropped before anyone mails them; the checker's turn joins the ledger.
      tries.push(deliverability);
      if (deliverability.outcome === "hit" || deliverability.outcome === "miss") {
        await ctx.runMutation(internal.outreach.recordCheck, { contactId, source: deliverability.source, field: "email", hit: deliverability.outcome === "hit" });
      }
      // Whose it is, from the contact check that rode on the phone call; or why it couldn't say.
      const trestle = checkers.find((c) => c.name === "trestle");
      if (emailCheck && firstEmail && emails) {
        const named = applyEmailCheck(emails, firstEmail, emailCheck);
        emails = named.emails;
        tries.push(named.try);
        await ctx.runMutation(internal.outreach.recordCheck, { contactId, source: named.try.source, field: "email", hit: named.try.outcome === "hit" });
      } else if (trestle && emails && emails.length > 0) {
        tries.push({ source: trestle.name, outcome: "skipped", note: !trestle.connected ? "Not connected" : phonesChecked ? "Nothing said about the email" : "Needs a live phone to check alongside" });
      }
    }
    await ctx.runMutation(internal.outreach.recordEnrichment, {
      contactId,
      field,
      source: o.source,
      phones,
      emails,
      person: field === "person" ? o.found.person : undefined,
      error: errorOf(o, field),
      tries,
    });
  }
  // Research last, once the person, phone and email are written: it's the slowest step, and what's found shouldn't wait on it.
  // It isn't a vendor in the stack: Claude reads the web, after the person lookup has named who to read about.
  if (fields.includes("research") && input.fields.includes("research")) {
    const person = outcomes.find((o) => o.field === "person")?.found.person ?? input.person;
    if (!process.env.ANTHROPIC_API_KEY) {
      await ctx.runMutation(internal.outreach.recordEnrichment, {
        contactId,
        field: "research",
        error: "The assistant isn't connected yet (ANTHROPIC_API_KEY isn't set on the Convex deployment).",
        tries: [{ source: "claude", outcome: "skipped", note: "Not connected" }],
      });
    } else {
      try {
        await say("research", [], "claude");
        const r = await researchOwner({ ...input, person }, input.question);
        await ctx.runMutation(internal.outreach.recordEnrichment, {
          contactId,
          field: "research",
          source: "claude",
          research: r.found ? { question: input.question, answer: r.answer, sources: r.sources, at: new Date().toISOString() } : undefined,
          error: r.answer ? undefined : "The assistant gave no answer.",
          tries: [
            r.found
              ? { source: "claude", outcome: "hit", note: `${r.sources.length} ${r.sources.length === 1 ? "page" : "pages"} read` }
              : r.answer
                ? { source: "claude", outcome: "miss", note: "Nothing specific on this owner" }
                : { source: "claude", outcome: "error", note: "No answer came back" },
          ],
        });
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        await ctx.runMutation(internal.outreach.recordEnrichment, { contactId, field: "research", error: `Claude: ${text}`, tries: [{ source: "claude", outcome: "error", note: text }] });
      }
    }
  }
}

/**
 * Our own records, first and free: the home the company's mail goes to, and the permits it pulled. Only read when a
 * field they can answer is wanted.
 */
async function ownRecords(ctx: ActionCtx, input: TraceInput, wanted: Field[]): Promise<Vendor[]> {
  const own: Vendor[] = [];
  if (!input.company || !wanted.some((f) => f !== "research")) return own;
  const company = input.company;
  const home = await ctx.runQuery(internal.outreach.homeAt, { address: input.mailing.address, city: input.mailing.city, zip: input.mailing.zip });
  own.push({
    name: "roll",
    fields: ["person"],
    connected: true,
    free: true,
    authority: 1,
    applies: () => ("why" in home ? home.why : undefined),
    trace: async () => ("person" in home ? { person: home.person } : {}),
  });
  const permits = input.property ? await ctx.runQuery(internal.outreach.permitContactsAt, { address: input.property.address, company }) : { found: { phones: [], emails: [] } as Found, permits: 0, matched: 0 };
  const has: Found = permits.found;
  own.push({
    name: "permits",
    fields: ["person", "phone", "email"],
    connected: true,
    free: true,
    authority: 2,
    applies: () => (permits.permits === 0 ? "No permits at the property" : permits.matched === 0 ? "No permit names the company" : undefined),
    trace: async () => has,
  });
  return own;
}

/**
 * Practice mode, for a real owner: the person behind a company is found for real, from our own records and the free
 * outside sources (a paid one is passed over and says so); then the phones, emails and research are simulated around
 * that person, or around the company itself when nobody was found, never around someone made up.
 */
async function runPractice(ctx: ActionCtx, contactId: TraceArgs["contactId"], input: Parameters<typeof runSample>[2], wanted: Field[], own: Vendor[], attempt = 0) {
  let person = input.person;
  let nobody = false;
  if (wanted.includes("person")) {
    const free = vendors(process.env, sourceFetch(ctx))
      .filter((v) => v.fields.includes("person"))
      .map((v): Vendor => (v.connected && !v.free ? { ...v, applies: () => PRACTICE_SKIP } : v));
    const progress: Progress = async (field, tries, asking) => {
      await ctx.runMutation(internal.outreach.noteProgress, { contactId, field, asking, tries });
    };
    const [o] = await waterfall(input, [...own.filter((v) => v.fields.includes("person")), ...free], ["person"], undefined, progress);
    // Turned away for now: the person is asked again in a few minutes; the rest goes ahead around the company.
    if (await retryWhenBusy(ctx, contactId, attempt, o)) {
      const rest = wanted.filter((f) => f !== "person");
      if (rest.length > 0) await runSample(ctx, contactId, input, rest, true, Boolean(input.company));
      return;
    }
    await ctx.runMutation(internal.outreach.recordEnrichment, {
      contactId,
      field: "person",
      source: o.source,
      person: o.found.person,
      error: errorOf(o, "person"),
      tries: o.tries,
    });
    person = o.found.person;
    nobody = !person;
  }
  const rest = wanted.filter((f) => f !== "person");
  if (rest.length === 0) return;
  await runSample(ctx, contactId, { ...input, person }, rest, true, nobody && Boolean(input.company));
}

/**
 * A sample owner's rerun: the same waterfall over a stack that answers from
 * the sample, a moment per source, then the line check, the Do Not Call
 * scrub and the email check, each narrated. Nothing outside is called and
 * nothing is charged (recordEnrichment sees the sample mark).
 */
async function runSample(
  ctx: ActionCtx,
  contactId: TraceArgs["contactId"],
  input: { name: string; company?: string; person?: { name: string }; properties: number; question: string } & Parameters<typeof waterfall>[0],
  wanted: Field[],
  simulated = false,
  noPerson = false,
) {
  const step = Number(process.env.SAMPLE_STEP_MS ?? 1100);
  const mark = simulated ? { simulated: true } : {};
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, step));
  const s = sampleFor(sampleIndex(input.name), { name: input.name, company: Boolean(input.company), properties: input.properties }, new Date().toISOString(), input.person?.name, { noPerson });
  const progress: Progress = async (field, tries, asking) => {
    await ctx.runMutation(internal.outreach.noteProgress, { contactId, field, asking, tries });
  };
  const outcomes = await waterfall(input, sampleStack(s, wait), wanted.filter((f) => f !== "research"), undefined, progress);
  const after = (field: "phone" | "email", sources: string[]) => {
    const cell = s.cells[field];
    return cell.status === "locked" ? [] : cell.tries.filter((t) => sources.includes(t.source));
  };
  for (const field of ["person", "phone", "email"] as Field[]) {
    if (!wanted.includes(field)) continue;
    const o = outcomes.find((x) => x.field === field)!;
    const tries = [...o.tries];
    if (field === "phone" && o.found.phones?.length) {
      await progress("phone", tries, "trestle");
      await wait();
      tries.push(...after("phone", ["trestle", "twilio"]));
      await progress("phone", tries, "tracerfy-dnc");
      await wait();
      tries.push(...after("phone", ["tracerfy-dnc"]));
    }
    if (field === "email" && o.found.emails?.length) {
      await progress("email", tries, "zerobounce");
      await wait();
      tries.push(...after("email", ["zerobounce", "trestle"]));
    }
    await ctx.runMutation(internal.outreach.recordEnrichment, {
      contactId,
      field,
      source: o.source,
      phones: field === "phone" ? o.found.phones : undefined,
      emails: field === "email" ? o.found.emails : undefined,
      person: field === "person" ? o.found.person : undefined,
      tries,
      ...mark,
    });
  }
  if (wanted.includes("research")) {
    await progress("research", [], "claude");
    await wait();
    await wait();
    const research = s.research ? { ...s.research, question: input.question } : undefined;
    await ctx.runMutation(internal.outreach.recordEnrichment, {
      contactId,
      field: "research",
      source: "claude",
      research,
      tries: [research ? { source: "claude", outcome: "hit", note: "2 pages read" } : { source: "claude", outcome: "miss", note: "Nothing specific on this owner" }],
      ...mark,
    });
  }
}

/**
 * Asks the free person sources outside the app (the Texas Comptroller) who runs a company, to check a key by hand.
 * Nothing is saved and nothing is charged.
 * `npx convex run skipTrace:tryPerson '{"company":"KOSF II MIDLAND LLC"}'`.
 */
export const tryPerson = internalAction({
  args: { company: v.string(), zip: v.optional(v.string()), raw: v.optional(v.boolean()) },
  handler: async (_ctx, { company, zip, raw }) => {
    // What the Comptroller has on file for the company, as filed: its matches, and each one's officers by name, title and
    // where they are. To see why a company gave nobody (its officers are other companies, or it isn't registered here).
    if (raw) {
      const key = process.env.TX_COMPTROLLER_API_KEY;
      if (!key) return { error: "TX_COMPTROLLER_API_KEY isn't set" };
      const base = "https://api.comptroller.texas.gov/public-data/v1/public";
      const headers = { Accept: "application/json", "x-api-key": key };
      const list = await fetch(`${base}/franchise-tax-list?name=${encodeURIComponent(company.toUpperCase().slice(0, 50))}`, { headers });
      if (!list.ok) return { error: `HTTP ${list.status}` };
      const found = ((await list.json()) as { data?: Array<Record<string, unknown>> }).data ?? [];
      const out = [];
      for (const e of found.slice(0, 5)) {
        const id = typeof e.taxpayerId === "string" ? e.taxpayerId : undefined;
        const details = id ? await fetch(`${base}/franchise-tax/${encodeURIComponent(id)}`, { headers }) : undefined;
        const body = details?.ok ? ((await details.json()) as { data?: Record<string, unknown> }).data : undefined;
        const officers = (Array.isArray(body?.officerInfo) ? (body!.officerInfo as Array<Record<string, unknown>>) : []).map((o) => ({ name: o.AGNT_NM, title: o.AGNT_TITL_TX, city: o.CITY_NM, state: o.ST_CD }));
        const rest = Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => k !== "officerInfo"));
        out.push({ match: e.name, taxpayerId: id, zip: e.mailingAddressZip, fields: Object.keys(rest).sort(), stateOfFormation: rest.stateOfFormation ?? rest.STATE_OF_FORMATION ?? null, officers });
      }
      return { matches: found.length, entities: out };
    }
    const free = vendors(process.env).filter((s) => s.fields.includes("person") && s.free);
    const input: TraceInput = { name: company, company, mailing: zip ? { zip } : {} };
    const out: Array<{ source: string; connected: boolean; person?: unknown; error?: string }> = [];
    for (const s of free) {
      if (!s.connected) {
        out.push({ source: s.name, connected: false });
        continue;
      }
      try {
        const found = await s.trace(input);
        out.push({ source: s.name, connected: true, person: found.person ?? null });
      } catch (e) {
        out.push({ source: s.name, connected: true, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  },
});
