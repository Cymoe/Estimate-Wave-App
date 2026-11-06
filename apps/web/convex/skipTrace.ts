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
import { KEY_FOR, dedupeEmails, rankPhones, vendors, waterfall, type Field } from "./lib/skipTrace";
import { researchOwner } from "./lib/research";

export const trace = internalAction({
  args: { contactId: v.id("outreachContacts"), fields: v.array(outreachField) },
  handler: async (ctx, { contactId, fields }) => {
    const input = await ctx.runQuery(internal.outreach.contactForTrace, { contactId });
    if (!input) return null;
    const stack = vendors(process.env);
    const wanted = fields.filter((f): f is Field => input.fields.includes(f));
    const none = (field: Field) => !stack.some((s) => s.connected && s.fields.includes(field));
    const outcomes = await waterfall(input, stack, wanted.filter((f) => f !== "research" && !none(f)));
    /** The stack's turns when no source for a field is connected: each one skipped. */
    const unconnected = (field: Field) => stack.filter((s) => s.fields.includes(field)).map((s) => ({ source: s.name, outcome: "skipped" as const, note: "Not connected" }));
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
      if (none(field)) {
        await ctx.runMutation(internal.outreach.recordEnrichment, {
          contactId,
          field,
          error: `No source for this is connected yet (${KEY_FOR[field]} isn't set on the Convex deployment).`.replace("isn't set", field === "person" ? "isn't set" : "aren't set"),
          tries: unconnected(field),
        });
        continue;
      }
      const o = outcomes.find((x) => x.field === field)!;
      await ctx.runMutation(internal.outreach.recordEnrichment, {
        contactId,
        field,
        source: o.source,
        phones: field === "phone" ? rankPhones(o.found.phones ?? []) : undefined,
        emails: field === "email" ? dedupeEmails(o.found.emails ?? []) : undefined,
        person: field === "person" ? o.found.person : undefined,
        error: !o.source && o.errors.length > 0 ? o.errors.join("; ") : undefined,
        tries: o.tries,
      });
    }
    return null;
  },
});
