/**
 * The public records on an Outreach owner's property, kept on the owner
 * (outreachContacts.signals) so the owners page reads them with the owners
 * instead of one lookup each: written when the owner is added, again
 * whenever a record on that property comes in or changes, and once for
 * owners saved before (outreach:backfillContactSignals).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type StoredSignal = NonNullable<Doc<"outreachContacts">["signals"]>[number];

/** The newest record of each kind on a property, from its last ten. */
export async function signalsAt(ctx: QueryCtx | MutationCtx, parcelId: Id<"parcels">): Promise<StoredSignal[]> {
  const rows = await ctx.db
    .query("signals")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
    .order("desc")
    .take(10);
  const out: StoredSignal[] = [];
  for (const r of rows) if (!out.some((o) => o.kind === r.kind)) out.push({ kind: r.kind, date: r.date, detail: r.detail, importedAt: r.importedAt });
  return out;
}

/** Every company's owners of these properties get their records again. */
export async function syncContactSignals(ctx: MutationCtx, parcelIds: Iterable<Id<"parcels">>) {
  for (const parcelId of new Set(parcelIds)) {
    const contacts = await ctx.db
      .query("outreachContacts")
      .withIndex("by_parcel", (q) => q.eq("property.parcelId", parcelId))
      .collect();
    if (!contacts.length) continue;
    const signals = await signalsAt(ctx, parcelId);
    for (const c of contacts) await ctx.db.patch(c._id, { signals });
  }
}
