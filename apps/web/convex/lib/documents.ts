import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./access";
import { estimateTotals, type Discount } from "./totals";

type DocumentItem = Doc<"estimates">["items"][number];

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/** An allowance as given (true, or { pickBy, amount }), keeping only a real date and amount. */
function allowanceOf(raw: unknown): DocumentItem["allowance"] {
  if (raw !== true && (typeof raw !== "object" || raw === null)) return undefined;
  const { pickBy, amount } = (raw === true ? {} : raw) as { pickBy?: unknown; amount?: unknown };
  const out: NonNullable<DocumentItem["allowance"]> = {};
  if (typeof pickBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pickBy)) out.pickBy = pickBy;
  if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) out.amount = amount;
  return out;
}

/**
 * Normalizes line items sent by the UI: gives each a stable string _id,
 * coerces numbers, keeps the unit price at or above the item's red line
 * (in Sales mode: `floor`), and sets totalPrice = quantity × unitPrice.
 */
export function normalizeItems(raw: unknown, { floor = true }: { floor?: boolean } = {}): DocumentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any, index): DocumentItem => {
    const quantity = toNumber(item?.quantity, 1);
    const redLinePrice = toNumber(item?.redLinePrice, NaN);
    const capPrice = toNumber(item?.capPrice, NaN);
    const hasRedLine = Number.isFinite(redLinePrice) && redLinePrice >= 0;
    const unitPrice = Math.max(toNumber(item?.unitPrice, 0), floor && hasRedLine ? redLinePrice : -Infinity);
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
    if (typeof item?.category === "string" && item.category) normalized.category = item.category;
    if (normalized.category && item?.categoryChosen === true) normalized.categoryChosen = true;
    if (item?.workPackItemId != null) normalized.workPackItemId = String(item.workPackItemId);
    if (item?.productId != null) normalized.productId = String(item.productId);
    const allowance = allowanceOf(item?.allowance);
    if (allowance) normalized.allowance = allowance;
    return normalized;
  });
}

/**
 * Same rule as the old backend: when there are items, subtotal/tax/total are
 * derived from them; otherwise any totals the caller supplied are kept.
 */
export function withTotals<
  T extends { items: DocumentItem[]; taxRate: number; subtotal: number; taxAmount: number; totalAmount: number; discount?: Discount },
>(doc: T): T & { discountAmount?: number } {
  if (doc.items.length === 0) return doc;
  const { subtotal, discountAmount, taxAmount, totalAmount } = estimateTotals(doc);
  return { ...doc, subtotal, discountAmount: discountAmount || undefined, taxAmount, totalAmount };
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
