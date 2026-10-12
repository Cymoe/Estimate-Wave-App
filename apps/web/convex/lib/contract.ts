import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { withCategories } from "./categories";
import { resolveContractTemplate } from "./contractTemplates";

/** Freezes the contract as it stands, for an estimate being accepted. */
export async function lockContract(ctx: MutationCtx, estimate: Doc<"estimates">, now: string) {
  const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
  const address = client ? [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ") : "";
  const items = await withCategories(ctx, estimate.items);
  return {
    contractLockedAt: now,
    contractSnapshot: {
      client: client
        ? { name: client.name, email: client.email, phone: client.phone, address: address || undefined }
        : undefined,
      items,
      subtotal: estimate.subtotal,
      taxAmount: estimate.taxAmount,
      totalAmount: estimate.totalAmount,
      terms: {
        ...estimate.contractTerms,
        contractTemplate: resolveContractTemplate(estimate.contractTerms?.contractTemplate, items),
      },
      design: estimate.design,
    },
  };
}
