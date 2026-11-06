"use node";
// The unlock's trace, in the Node runtime: reads the contact, runs the
// vendor waterfall, and records what came back (outreach.ts charges on a
// hit). Vendors are whatever keys the deployment has; none configured is
// a failed unlock that says so and costs nothing.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { batchData, waterfall, type Vendor } from "./lib/skipTrace";

/** The vendors this deployment can call, in the order they're tried. */
export function vendors(env: Record<string, string | undefined> = process.env): Vendor[] {
  const out: Vendor[] = [];
  if (env.BATCHDATA_API_KEY) out.push(batchData(env.BATCHDATA_API_KEY));
  return out;
}

export const trace = internalAction({
  args: { contactId: v.id("outreachContacts") },
  handler: async (ctx, { contactId }) => {
    const input = await ctx.runQuery(internal.outreach.contactForTrace, { contactId });
    if (!input) return null;
    const stack = vendors();
    if (stack.length === 0) {
      await ctx.runMutation(internal.outreach.recordUnlock, {
        contactId,
        error: "No skip-trace vendor is connected yet (BATCHDATA_API_KEY isn't set on the Convex deployment).",
      });
      return null;
    }
    const { result, vendor, errors } = await waterfall(input, stack);
    await ctx.runMutation(internal.outreach.recordUnlock, {
      contactId,
      phones: result.phones,
      emails: result.emails,
      vendor,
      error: result.phones.length === 0 && errors.length > 0 ? errors.join("; ") : undefined,
    });
    return null;
  },
});
