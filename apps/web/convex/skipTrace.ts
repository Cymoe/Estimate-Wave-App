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

export const trace = internalAction({
  args: { contactId: v.id("outreachContacts"), fields: v.array(outreachField) },
  handler: async (ctx, { contactId, fields }) => {
    const input = await ctx.runQuery(internal.outreach.contactForTrace, { contactId });
    if (!input) return null;
    const stack = vendors(process.env);
    const wanted = fields.filter((f): f is Field => input.fields.includes(f));
    const none = (field: Field) => !stack.some((s) => s.connected && s.fields.includes(field));
    const outcomes = await waterfall(input, stack, wanted.filter((f) => !none(f)));
    for (const field of wanted) {
      if (none(field)) {
        await ctx.runMutation(internal.outreach.recordEnrichment, {
          contactId,
          field,
          error: `No source for this is connected yet (${KEY_FOR[field]} isn't set on the Convex deployment).`,
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
      });
    }
    return null;
  },
});
