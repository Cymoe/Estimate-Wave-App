import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./access";

type DocumentItem = Doc<"estimates">["items"][number];

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * Normalizes line items sent by the UI: gives each a stable string _id,
 * coerces numbers, keeps the unit price at or above the item's red line,
 * and sets totalPrice = quantity × unitPrice.
 */
export function normalizeItems(raw: unknown): DocumentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any, index): DocumentItem => {
    const quantity = toNumber(item?.quantity, 1);
    const redLinePrice = toNumber(item?.redLinePrice, NaN);
    const capPrice = toNumber(item?.capPrice, NaN);
    const hasRedLine = Number.isFinite(redLinePrice) && redLinePrice >= 0;
    const unitPrice = Math.max(toNumber(item?.unitPrice, 0), hasRedLine ? redLinePrice : -Infinity);
    const normalized: DocumentItem = {
      _id: typeof item?._id === "string" && item._id ? item._id : crypto.randomUUID(),
      description: String(item?.description ?? ""),
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
      displayOrder: toNumber(item?.displayOrder, index),
    };
    if (hasRedLine) normalized.redLinePrice = redLinePrice;
    if (Number.isFinite(capPrice) && capPrice >= 0) normalized.capPrice = capPrice;
    if (item?.costCode != null) normalized.costCode = String(item.costCode);
    if (item?.workPackItemId != null) normalized.workPackItemId = String(item.workPackItemId);
    if (item?.productId != null) normalized.productId = String(item.productId);
    return normalized;
  });
}

/**
 * Same rule as the old backend: when there are items, subtotal/tax/total are
 * derived from them; otherwise any totals the caller supplied are kept.
 */
export function withTotals<T extends { items: DocumentItem[]; taxRate: number; subtotal: number; taxAmount: number; totalAmount: number }>(
  doc: T,
): T {
  if (doc.items.length === 0) return doc;
  const subtotal = doc.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = (subtotal * doc.taxRate) / 100;
  return { ...doc, subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}

export async function assertLinksInOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  links: { clientId?: unknown; projectId?: unknown; estimateId?: unknown },
): Promise<void> {
  const checks = [
    ["clients", links.clientId, "Client"],
    ["projects", links.projectId, "Project"],
    ["estimates", links.estimateId, "Estimate"],
  ] as const;
  for (const [table, id, label] of checks) {
    if (id === undefined) continue;
    const normalized = typeof id === "string" ? ctx.db.normalizeId(table, id) : null;
    const doc = normalized === null ? null : await ctx.db.get(normalized);
    if (doc === null || doc.organizationId !== organizationId) fail("INVALID", `${label} not found`);
  }
}

export function documentNumber(prefix: "EST" | "INV"): string {
  const year = new Date().getFullYear();
  const suffix = Date.now().toString().slice(-6);
  return `${prefix}-${year}-${suffix}`;
}
