// Shared with the web app, so the screens show the same totals the server saves: keep this file free of imports.

/** A discount on the whole estimate: a dollar amount or a percent of the subtotal, with an optional label ("Fall special"). */
export type Discount = { kind: "amount" | "percent"; value: number; label?: string };

type Line = { totalPrice: number; quantity?: number; redLinePrice?: number; optional?: boolean; included?: boolean };

/** Money rounded to the cent. */
export const cents = (n: number) => Math.round(n * 100) / 100;

/** Whether a line is in the price: every line except an optional add-on the client hasn't chosen. */
export const countsInTotal = (line: { optional?: boolean; included?: boolean }) => !line.optional || line.included === true;

/** What a discount takes off a subtotal: never less than nothing, never more than the subtotal. */
export function discountAmountOf(subtotal: number, discount: Discount | undefined | null): number {
  if (!discount || !(discount.value > 0)) return 0;
  const raw = discount.kind === "percent" ? (subtotal * Math.min(discount.value, 100)) / 100 : discount.value;
  return cents(Math.min(raw, Math.max(subtotal, 0)));
}

/** Subtotal of the lines in the price, the discount, tax on what's left, and the total. */
export function estimateTotals(doc: { items: Line[]; taxRate?: number; discount?: Discount | null }) {
  const subtotal = cents(doc.items.filter(countsInTotal).reduce((sum, line) => sum + line.totalPrice, 0));
  const discountAmount = discountAmountOf(subtotal, doc.discount);
  const taxAmount = cents(((subtotal - discountAmount) * (doc.taxRate ?? 0)) / 100);
  return { subtotal, discountAmount, taxAmount, totalAmount: cents(subtotal - discountAmount + taxAmount) };
}

/** The lowest the lines in the price can go: each line's red line times its quantity. */
export function redLineTotal(items: Line[]): number {
  return cents(items.filter(countsInTotal).reduce((sum, line) => sum + (line.redLinePrice ?? 0) * (line.quantity ?? 1), 0));
}
