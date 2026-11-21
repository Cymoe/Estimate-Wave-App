import type { Estimate } from './EstimateService';

/** What a contract shows. Built from the estimate; nothing to generate or save. */
export interface ContractData {
  propertyAddress: string;
  clientName: string;
  clientAddress: string;
  contractorName: string;
  contractorAddress: string;
  contractorEmail: string;
  contractorPhone: string;
  workDescription: string;
  totalAmount: number;
  /** A discount taken off the work, and what it's called. */
  discountAmount?: number;
  discountLabel?: string;
  taxAmount?: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
    category?: string;
  }>;
  startDate: string;
  completionDate: string;
  paymentTerms: string;
  warrantyPeriod: string;
  /** The company's own clauses, shown under Additional terms. */
  extraTerms?: string;
  /** When the estimate was accepted and this contract stopped following it. */
  lockedAt?: string;
  /** The files that go with the agreement: the design and any file marked In contract (images or PDFs). */
  agreedDesigns: Array<{ url: string; name: string; type?: string }>;
}

/** The parts of the contract the user writes, saved on the estimate. */
export interface ContractTerms {
  startDate?: string;
  completionDate?: string;
  paymentTerms?: string;
  warrantyPeriod?: string;
  workDescription?: string;
  propertyAddress?: string;
  extraTerms?: string;
}

/** The contractor's details, from the organization. */
export interface Business {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** The company logo shown to clients. */
  logoUrl?: string;
  /** The company's wording for the built-in agreement (Settings → Contracts). */
  agreement?: AgreementWording;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Snapshot = Record<string, any>;

export { DEFAULT_PAYMENT_TERMS, DEFAULT_WARRANTY } from '../../convex/lib/contractDefaults';
import { resolveTerms, type AgreementWording } from '../../convex/lib/contractDefaults';

const joinAddress = (parts: Array<string | undefined>) => parts.filter(Boolean).join(', ');

/**
 * The contract for an estimate. While the estimate is a draft or sent it
 * follows the estimate; once accepted it shows the contract as agreed.
 */
export function contractFor(estimate: Estimate, business?: Business | null): ContractData {
  const snapshot: Snapshot | undefined = estimate.contract_snapshot;
  // A signed contract carries its wording; a live one reads the company's defaults.
  const terms: ContractTerms = resolveTerms(snapshot ? undefined : business?.agreement, snapshot ? snapshot.terms : estimate.contract_terms);
  const client = snapshot ? snapshot.client : estimate.client && { name: estimate.client.name, address: estimate.client.address };
  const lineItems = snapshot
    ? (snapshot.items ?? []).map((item: Snapshot) => ({
        description: item.description,
        quantity: item.quantity,
        unit: 'ea',
        unitPrice: item.unitPrice,
        total: item.totalPrice,
        category: item.category,
      }))
    : (estimate.items ?? []).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: 'ea',
        unitPrice: item.unit_price,
        total: item.total_price,
        category: item.category,
      }));
  const clientAddress = client?.address ?? '';
  return {
    propertyAddress: terms.propertyAddress || clientAddress,
    clientName: client?.name ?? '',
    clientAddress,
    contractorName: business?.name ?? '',
    contractorAddress: joinAddress([business?.address, business?.city, business?.state, business?.zip]),
    contractorEmail: business?.email ?? '',
    contractorPhone: business?.phone ?? '',
    workDescription: terms.workDescription || estimate.description || '',
    totalAmount: snapshot ? snapshot.totalAmount : estimate.total_amount,
    discountAmount: (snapshot ? snapshot.discountAmount : estimate.discount_amount) || undefined,
    discountLabel: snapshot ? snapshot.discountLabel : estimate.discount?.label,
    taxAmount: (snapshot ? snapshot.taxAmount : estimate.tax_amount) || undefined,
    lineItems,
    startDate: terms.startDate ?? '',
    completionDate: terms.completionDate ?? '',
    paymentTerms: terms.paymentTerms ?? '',
    warrantyPeriod: terms.warrantyPeriod ?? '',
    extraTerms: terms.extraTerms,
    lockedAt: estimate.contract_locked_at,
    // As signed once signed (one design on contracts signed before the list), else as they stand.
    agreedDesigns: snapshot
      ? ((snapshot.designs ?? (snapshot.design ? [snapshot.design] : [])) as Snapshot[]).map((d) => ({ url: d.url, name: d.name, type: d.contentType }))
      : estimate.contract_files ?? (estimate.design ? [estimate.design] : []),
  };
}

/** Business details the contract needs but the organization doesn't have yet. */
export function missingBusinessDetails(business?: Business | null): string[] {
  const missing: string[] = [];
  if (!business?.name) missing.push('business name');
  if (!business?.address) missing.push('address');
  if (!business?.email && !business?.phone) missing.push('email or phone');
  return missing;
}

export interface ContractChange {
  description: string;
  /** The line total in the signed contract; absent for an added item. */
  before?: number;
  /** The line total on the estimate now; absent for a removed item. */
  after?: number;
}

/**
 * How the estimate differs from the signed contract: the change order.
 * Null while the contract isn't signed.
 */
export function changesSinceSigned(estimate: Estimate): { changes: ContractChange[]; difference: number } | null {
  const snapshot: Snapshot | undefined = estimate.contract_snapshot;
  if (!snapshot) return null;
  const signed: Snapshot[] = snapshot.items ?? [];
  const current = estimate.items ?? [];
  // Matched by id, then (lines saved again with new ids) by the same description, as the server does.
  const used = new Set<number>();
  const match = new Map<number, number>();
  const sameProduct = (a?: string, b?: string) => a === undefined || b === undefined || a === b;
  current.forEach((item, ci) => {
    const si = signed.findIndex((s, i) => !used.has(i) && s._id === item.id);
    if (si < 0) return;
    used.add(si);
    match.set(ci, si);
  });
  current.forEach((item, ci) => {
    if (match.has(ci)) return;
    const si = signed.findIndex((s, i) => !used.has(i) && s.description === item.description && sameProduct(s.productId, item.product_id));
    if (si < 0) return;
    used.add(si);
    match.set(ci, si);
  });
  const changes: ContractChange[] = [];
  current.forEach((item, ci) => {
    const si = match.get(ci);
    if (si === undefined) changes.push({ description: item.description, after: item.total_price });
    else if (signed[si].totalPrice !== item.total_price)
      changes.push({ description: item.description, before: signed[si].totalPrice, after: item.total_price });
  });
  signed.forEach((item, si) => {
    if (!used.has(si)) changes.push({ description: item.description, before: item.totalPrice });
  });
  return { changes, difference: estimate.total_amount - snapshot.totalAmount };
}

export const OTHER_CATEGORY = 'Other';

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

/**
 * The estimate summed by category, the way a client first reads it:
 * alphabetical, with uncategorised items under Other at the end.
 */
export function categoryTotals(items: Array<{ category?: string; total: number }>): CategoryTotal[] {
  const byCategory = new Map<string, CategoryTotal>();
  for (const item of items) {
    const category = item.category?.trim() || OTHER_CATEGORY;
    const entry = byCategory.get(category) ?? { category, total: 0, count: 0 };
    entry.total += item.total;
    entry.count += 1;
    byCategory.set(category, entry);
  }
  return Array.from(byCategory.values()).sort((a, b) =>
    a.category === OTHER_CATEGORY ? 1 : b.category === OTHER_CATEGORY ? -1 : a.category.localeCompare(b.category),
  );
}
