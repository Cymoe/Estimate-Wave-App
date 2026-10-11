import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Freezes the contract as it stands, for an estimate being accepted. */
export async function lockContract(ctx: MutationCtx, estimate: Doc<"estimates">, now: string) {
  const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
  const address = client ? [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ") : "";
  return {
    contractLockedAt: now,
    contractSnapshot: {
      client: client
        ? { name: client.name, email: client.email, phone: client.phone, address: address || undefined }
        : undefined,
      items: estimate.items,
      subtotal: estimate.subtotal,
      taxAmount: estimate.taxAmount,
      totalAmount: estimate.totalAmount,
      terms: estimate.contractTerms,
      design: estimate.design,
    },
  };
}
