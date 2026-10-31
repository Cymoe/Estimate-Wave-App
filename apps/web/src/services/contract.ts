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
  /** The agreed design (image or PDF) attached to the estimate. */
  agreedDesign?: { url: string; name: string; type?: string };
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
    lineItems,
    startDate: terms.startDate ?? '',
    completionDate: terms.completionDate ?? '',
    paymentTerms: terms.paymentTerms ?? '',
    warrantyPeriod: terms.warrantyPeriod ?? '',
    extraTerms: terms.extraTerms,
    lockedAt: estimate.contract_locked_at,
    agreedDesign: snapshot
      ? snapshot.design && { url: snapshot.design.url, name: snapshot.design.name, type: snapshot.design.contentType }
      : estimate.design,
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
  const changes: ContractChange[] = [];
  const matched = new Set<Snapshot>();
  for (const item of current) {
    const before = signed.find((s) => !matched.has(s) && s._id === item.id);
    if (before) {
      matched.add(before);
      if (before.totalPrice !== item.total_price) {
        changes.push({ description: item.description, before: before.totalPrice, after: item.total_price });
      }
    } else {
      changes.push({ description: item.description, after: item.total_price });
    }
  }
  for (const item of signed) {
    if (!matched.has(item)) changes.push({ description: item.description, before: item.totalPrice });
  }
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
