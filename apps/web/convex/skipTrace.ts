"use node";
// A contact's enrichment, in the Node runtime: reads the contact, runs the
// source waterfall for the fields asked for, and records each field's
// answer (outreach.ts charges a found phone). Sources are whatever keys
// the deployment has; none for a field is a failed cell that says so and
// costs nothing.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { outreachField } from "./schema";
import { KEY_FOR, checkEmails, checkPhones, dedupeEmails, expectedNames, phoneChecker, rankPhones, vendors, verifier, waterfall, type Field, type Found, type Vendor } from "./lib/skipTrace";
import { researchOwner } from "./lib/research";

export const trace = internalAction({
  args: { contactId: v.id("outreachContacts"), fields: v.array(outreachField) },
  handler: async (ctx, { contactId, fields }) => {
    const input = await ctx.runQuery(internal.outreach.contactForTrace, { contactId });
    if (!input) return null;
    // Our own records come first and cost nothing: the home the company's mail goes to, and the permits it pulled.
    const own: Vendor[] = [];
    if (input.company) {
      const home = await ctx.runQuery(internal.outreach.homeAt, { address: input.mailing.address, city: input.mailing.city, zip: input.mailing.zip });
      own.push({
        name: "roll",
        fields: ["person"],
        connected: true,
        applies: () => ("why" in home ? home.why : undefined),
        trace: async () => ("person" in home ? { person: home.person } : {}),
      });
      const permits = await ctx.runQuery(internal.outreach.permitContactsAt, { address: input.property.address, company: input.company });
      const has: Found = permits.found;
      own.push({
        name: "permits",
        fields: ["person", "phone", "email"],
        connected: true,
        applies: () => (permits.permits === 0 ? "No permits at the property" : permits.matched === 0 ? "No permit names the company" : undefined),
        trace: async () => has,
      });
    }
    const external = vendors(process.env);
    const stack = [...own, ...external];
    const wanted = fields.filter((f): f is Field => input.fields.includes(f));
    // Our own records always get their turn; "not connected" is about the outside sources.
    const none = (field: Field) => !external.some((s) => s.connected && s.fields.includes(field));
    const outcomes = await waterfall(input, stack, wanted.filter((f) => f !== "research"));
    // Research isn't a vendor in the stack: Claude reads the web, after the person lookup has named who to read about.
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
    for (const field of wanted) {
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
      let emails = field === "email" ? dedupeEmails(o.found.emails ?? []) : undefined;
      let phones = field === "phone" ? rankPhones(o.found.phones ?? []) : undefined;
      const tries = [...o.tries];
      if (field === "phone" && phones && phones.length > 0) {
        // The carrier's word: dead lines go, live ones carry their type and the name on the account.
        const person = outcomes.find((x) => x.field === "person")?.found.person ?? input.person;
        const checked = await checkPhones(phones, phoneChecker(process.env), expectedNames({ ...input, person }));
        phones = checked.phones;
        tries.push(checked.try);
        if (checked.try.outcome === "hit" || checked.try.outcome === "miss") {
          await ctx.runMutation(internal.outreach.recordCheck, { contactId, source: checked.try.source, field: "phone", hit: checked.try.outcome === "hit" });
        }
      }
      if (field === "email" && emails && emails.length > 0) {
        // Deliverability: dead addresses are dropped before anyone mails them; the checker's turn joins the ledger.
        const checked = await checkEmails(emails, verifier(process.env));
        emails = checked.emails;
        tries.push(checked.try);
        if (checked.try.outcome === "hit" || checked.try.outcome === "miss") {
          await ctx.runMutation(internal.outreach.recordCheck, { contactId, source: checked.try.source, field: "email", hit: checked.try.outcome === "hit" });
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
    return null;
  },
});
