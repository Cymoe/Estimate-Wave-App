import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { withCategories } from "./categories";
import { resolveTerms } from "./contractDefaults";
import { markSigned, resolveDocuments, signedDocuments } from "./contractDocs";

/**
 * Freezes the contract as it stands, for an estimate being accepted: its
 * data and the documents signed with it (the agreement and attachments,
 * with each uploaded file's fingerprint). `acknowledgedAt` is when the
 * client confirmed reading the uploaded ones.
 */
export async function lockContract(ctx: MutationCtx, estimate: Doc<"estimates">, now: string, acknowledgedAt?: string) {
  const documents = signedDocuments(await resolveDocuments(ctx, estimate));
  await markSigned(ctx, documents, now);
  const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
  const address = client ? [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ") : "";
  // The wording as it reads today, so later changes to the company's defaults don't touch a signed contract.
  const organization = await ctx.db.get(estimate.organizationId);
  return {
    contractLockedAt: now,
    contractSnapshot: {
      client: client ? { name: client.name, email: client.email, phone: client.phone, address: address || undefined } : undefined,
      items: await withCategories(ctx, estimate.items),
      subtotal: estimate.subtotal,
      taxAmount: estimate.taxAmount,
      totalAmount: estimate.totalAmount,
      terms: resolveTerms(organization?.agreement, estimate.contractTerms),
      design: estimate.design,
      documents,
      ...(acknowledgedAt ? { acknowledgedAt } : {}),
    },
  };
}
