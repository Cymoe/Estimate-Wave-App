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
import { KEY_FOR, applyEmailCheck, checkEmails, checkPhonesWith, dedupeEmails, expectedNames, lineOwner, phoneCheckers, phoneScrub, rankPhones, scrubPhones, vendors, verifier, waterfall, type EmailCheck, type Field, type Found, type Reuse, type Try, type Vendor } from "./lib/skipTrace";
import { researchOwner } from "./lib/research";

type TraceArgs = { contactId: import("./_generated/dataModel").Id<"outreachContacts">; fields: Field[] };

export const trace = internalAction({
  args: { contactId: v.id("outreachContacts"), fields: v.array(outreachField) },
  handler: async (ctx, args) => {
    try {
      await run(ctx, args);
    } catch (e) {
      // The safety net: whatever is still running for this request is failed with the reason, so Retry shows up.
      const text = e instanceof Error ? e.message : String(e);
      for (const field of args.fields) {
        await ctx.runMutation(internal.outreach.recordEnrichment, { contactId: args.contactId, field, error: `The lookup stopped: ${text}` });
      }
    }
    return null;
  },
});

async function run(ctx: ActionCtx, { contactId, fields }: TraceArgs) {
  const input = await ctx.runQuery(internal.outreach.contactForTrace, { contactId });
  if (!input) return;
  const wanted = fields.filter((f): f is Field => input.fields.includes(f));
  // Our own records come first and cost nothing: the home the company's mail goes to, and the permits it pulled. Only read when a field they can answer is wanted.
  const own: Vendor[] = [];
  if (input.company && wanted.some((f) => f !== "research")) {
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
    const permits = await ctx.runQuery(internal.outreach.permitContactsAt, { address: input.property.address, company: input.company });
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
  }
  const external = vendors(process.env);
  const stack = [...own, ...external];
  // Our own records always get their turn; "not connected" is about the outside sources.
  const none = (field: Field) => !external.some((s) => s.connected && s.fields.includes(field));
  // A decision maker already found, with a phone, on a sister entity: copy it rather than pay for it again.
  const reuse: Reuse = async (field, who) => {
    const hit = who.person ? await ctx.runQuery(internal.outreach.sharedLookup, { contactId, person: who.person }) : null;
    if (!hit) return undefined;
    const note = `Same decision maker as ${hit.from}; copied, no charge`;
    return field === "phone" ? { found: { phones: hit.phones as Found["phones"] }, note } : { found: { emails: hit.emails as Found["emails"] }, note };
  };
  const outcomes = await waterfall(input, stack, wanted.filter((f) => f !== "research"), reuse);
  const isShared = (field: Field) => outcomes.find((x) => x.field === field)?.source === "shared";
  // Deliverability first, so the one name check rides on a live address, not one about to be dropped.
  const emailOutcome = outcomes.find((x) => x.field === "email");
  let emailsKept = wanted.includes("email") ? dedupeEmails(emailOutcome?.found.emails ?? []) : [];
  let deliverability: Try | undefined;
  // Copied addresses were checked on the owner they came from.
  if (emailsKept.length > 0 && !isShared("email")) {
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
      const checked = await checkPhonesWith(phones, checkers, expectedNames(who), lineOwner(who), firstEmail);
      phones = checked.phones;
      emailCheck = checked.email;
      phonesChecked = checked.tries.some((t) => t.outcome === "hit" || t.outcome === "miss");
      tries.push(...checked.tries);
      // Then the Do Not Call scrub on what's left: flags, never drops, so the sheet can say why not to call.
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
      error: !o.source && o.errors.length > 0 ? o.errors.join("; ") : undefined,
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
