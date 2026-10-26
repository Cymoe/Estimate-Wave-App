/**
 * Data API backed by Convex.
 *
 * Keeps the same functions and call signatures the screens used with the old
 * Express/MongoDB backend, so callers don't change. Every call runs as the
 * signed-in user and Convex checks organization membership on the server.
 */

import { ConvexError } from "convex/values";
import type { FunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { PlanSummary } from "../components/market/wallet";
import { convex } from "./convex";
import { withId } from "./withId";

export { withId };

class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
};

interface ConvexCaller {
  query(ref: FunctionReference<"query">, args: any): Promise<any>;
  mutation(ref: FunctionReference<"mutation">, args: any): Promise<any>;
}

let client: ConvexCaller = convex;

/** Points the API at another Convex client (used by tests). */
export function setConvexClient(next: ConvexCaller) {
  client = next;
}

function toAPIError(error: unknown): APIError {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string } | string;
    const message = typeof data === 'string' ? data : data?.message ?? 'Request failed';
    const code = typeof data === 'string' ? undefined : data?.code;
    return new APIError(message, (code && STATUS_BY_CODE[code]) || 400, data);
  }
  const message = error instanceof Error ? error.message : String(error);
  // Argument validation failures (e.g. a malformed id) are client errors.
  const status = /ArgumentValidationError|Value does not match validator/.test(message) ? 400 : 500;
  return new APIError(message, status);
}


async function run<T = any>(kind: 'query' | 'mutation' | 'action', ref: FunctionReference<any>, args: Record<string, unknown>): Promise<T> {
  try {
    const result =
      kind === 'query' ? await client.query(ref, args) : kind === 'mutation' ? await client.mutation(ref, args) : await client.action(ref, args);
    return withId(result);
  } catch (error) {
    throw toAPIError(error);
  }
}

/** Drops keys whose value is undefined so Convex validators accept them. */
function defined<T extends Record<string, unknown>>(args: T): T {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)) as T;
}

function requireOrganizationId(data: any): string {
  const organizationId = data?.organizationId ?? data?.organization_id;
  if (!organizationId) throw new APIError('organizationId is required', 400);
  return organizationId;
}

// Organizations API
export const organizationsAPI = {
  async list() {
    return run('query', api.organizations.list, {});
  },

  async getById(id: string) {
    return run('query', api.organizations.get, { id });
  },

  /** 'owner' | 'admin' | 'member' for the signed-in user. */
  async myRole(id: string): Promise<'owner' | 'admin' | 'member'> {
    return run('query', api.organizations.myRole, { id });
  },

  async create(data: any) {
    return run('mutation', api.organizations.create, { data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.organizations.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.organizations.remove, { id });
  },

  /** Reminder emails to clients who haven't signed: on or off, and after how many days. */
  setFollowUps(id: string, settings: { enabled: boolean; afterDays: number }): Promise<{ enabled: boolean; afterDays: number }> {
    return run('mutation', api.organizations.setFollowUps, { id, ...settings });
  },

  /** How clients pay the company: deposit at signing, pay link, instructions. */
  setPayments(id: string, settings: PaymentSettings): Promise<PaymentSettings> {
    return run('mutation', api.organizations.setPayments, defined({ id, ...settings }));
  },
};

// Clients API
export const clientsAPI = {
  async list(organizationId: string) {
    return run('query', api.clients.list, { organizationId });
  },

  async getById(id: string) {
    return run('query', api.clients.get, { id });
  },

  async create(data: any) {
    return run('mutation', api.clients.create, { organizationId: requireOrganizationId(data), data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.clients.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.clients.remove, { id });
  },
};

// Estimates API
export type SlotKind = 'agreement' | 'affidavit' | 'change_order';
export type ContractDocKind = SlotKind | 'attachment';

/** One contract document as a page shows it: Tolliver's, or an uploaded PDF (with its link). */
export interface ContractDocument {
  kind: ContractDocKind;
  source: 'tolliver' | 'upload';
  /** job: chosen for this estimate; company: the company's default; signed: as signed. */
  origin: 'job' | 'company' | 'tolliver' | 'signed';
  name: string;
  docId?: string;
  fileName?: string;
  sha256?: string;
  size?: number;
  url?: string;
}

export interface EstimateDocuments {
  locked: boolean;
  acknowledgedAt?: string;
  agreement: ContractDocument;
  affidavit: ContractDocument;
  changeOrder: ContractDocument;
  attachments: ContractDocument[];
  companyAttachments: Array<{ docId: string; name: string; included: boolean }>;
  companyDefaults: { agreement?: string; affidavit?: string; changeOrder?: string };
}

/** A PDF in the company's contract library (Settings → Contracts). */
export interface LibraryDoc {
  id: string;
  kind: ContractDocKind;
  name: string;
  fileName: string;
  size: number;
  active: boolean;
  archived: boolean;
  signed: boolean;
  uploadedAt: string;
  url?: string;
}

/** A company's own contract PDFs: its library, and PDFs uploaded for one job. */
export const contractDocsAPI = {
  list: (organizationId: string): Promise<LibraryDoc[]> => run('query', api.contractDocs.list, { organizationId }),
  uploadUrl: (organizationId: string): Promise<string> => run('mutation', api.contractDocs.uploadUrl, { organizationId }),
  add: (args: { organizationId: string; kind: ContractDocKind; storageId: string; fileName: string; estimateId?: string }) =>
    run('mutation', api.contractDocs.add, defined(args)),
  setActive: (id: string) => run('mutation', api.contractDocs.setActive, { id }),
  useTolliver: (organizationId: string, kind: SlotKind) => run('mutation', api.contractDocs.useTolliver, { organizationId, kind }),
  remove: (id: string): Promise<{ archived: boolean }> => run('mutation', api.contractDocs.remove, { id }),
};

export type InvoiceKind = 'deposit' | 'balance' | 'other';
export interface InvoicePayment { _id: string; amount: number; method: string; paidAt: string; note?: string }
export interface InvoiceView {
  id: string;
  number: string;
  kind: InvoiceKind;
  label: string;
  description: string;
  total: number;
  paid: number;
  due: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate?: string;
  paidDate?: string;
  payments: InvoicePayment[];
}
export interface PaymentSummary { contract: number; invoiced: number; paid: number; due: number; toInvoice: number }
export interface EstimatePayments {
  signed: boolean;
  invoices: InvoiceView[];
  summary: PaymentSummary;
  depositPercent: number;
  methods: string[];
}
export interface PaymentSettings { depositPercent: number; payLink?: string; instructions?: string }

/** Getting paid for a signed estimate: deposits, the balance and payments recorded by hand. */
export const invoicesAPI = {
  forEstimate: (estimateId: string): Promise<EstimatePayments> => run('query', api.invoices.forEstimate, { estimateId }),
  forProject: (projectId: string): Promise<{ invoiced: number; paid: number; due: number }> => run('query', api.invoices.forProject, { projectId }),
  requestDeposit: (estimateId: string, ask: { percent?: number; amount?: number }) =>
    run('mutation', api.invoices.requestDeposit, defined({ estimateId, ...ask })),
  invoiceBalance: (estimateId: string) => run('mutation', api.invoices.invoiceBalance, { estimateId }),
  recordPayment: (id: string, payment: { amount: number; method: string; paidAt?: string; note?: string }): Promise<InvoiceView> =>
    run('mutation', api.invoices.recordPayment, defined({ id, ...payment })),
  removePayment: (id: string, paymentId: string): Promise<InvoiceView> => run('mutation', api.invoices.removePayment, { id, paymentId }),
  cancel: (id: string) => run('mutation', api.invoices.cancel, { id }),
};

export interface ReminderStatus {
  companyOn: boolean;
  afterDays: number;
  on: boolean;
  clientEmail?: string;
  sent: number;
  max: number;
  lastAt?: string;
  nextAt?: string;
  open: boolean;
}

/** Reminder emails to clients who haven't signed. */
export const followUpsAPI = {
  status: (estimateId: string): Promise<ReminderStatus> => run('query', api.followUps.status, { estimateId }),
  setForEstimate: (estimateId: string, on: boolean) => run('mutation', api.followUps.setForEstimate, { estimateId, on }),
};

export const estimatesAPI = {
  async list(organizationId: string, filters?: { clientId?: string; status?: string }) {
    return run('query', api.estimates.list, defined({ organizationId, clientId: filters?.clientId, status: filters?.status }));
  },

  async getById(id: string) {
    return run('query', api.estimates.get, { id });
  },

  async create(data: any) {
    return run('mutation', api.estimates.create, { organizationId: requireOrganizationId(data), data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.estimates.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.estimates.remove, { id });
  },

  async sign(id: string, signature: string, agreedToDocuments?: boolean) {
    return run('mutation', api.estimates.sign, defined({ id, signature, agreedToDocuments }));
  },

  /** The contract documents the estimate uses (its Contract tab). */
  async documents(id: string): Promise<EstimateDocuments> {
    return run('query', api.estimates.documents, { id });
  },

  /** This job's choice for one document: a PDF's id, 'tolliver', or null for the company's. */
  async setContractDoc(id: string, kind: SlotKind, choice: string | null) {
    return run('mutation', api.estimates.setContractDoc, { id, kind, choice });
  },

  /** Sends, or stops sending, one of the company's attachments with this job. */
  async setAttachment(id: string, docId: string, included: boolean) {
    return run('mutation', api.estimates.setAttachment, { id, docId, included });
  },

  /** A one-time URL to upload a design file to. */
  async designUploadUrl(id: string): Promise<string> {
    return run('mutation', api.estimates.designUploadUrl, { id });
  },

  async setDesign(id: string, storageId: string, name: string) {
    return run('mutation', api.estimates.setDesign, { id, storageId, name });
  },

  async removeDesign(id: string) {
    return run('mutation', api.estimates.removeDesign, { id });
  },

  /** The secret token in the estimate's client link. */
  async shareLink(id: string): Promise<string> {
    return run('mutation', api.estimates.shareLink, { id });
  },
};

/** The client's side of an estimate, through its link. No login needed. */
export const publicEstimatesAPI = {
  async get(token: string) {
    return run('query', api.publicEstimates.get, { token });
  },

  async markOpened(token: string) {
    return run('mutation', api.publicEstimates.markOpened, { token });
  },

  async accept(token: string, signature: string, agreedToDocuments?: boolean) {
    return run('mutation', api.publicEstimates.accept, defined({ token, signature, agreedToDocuments }));
  },

  async decline(token: string) {
    return run('mutation', api.publicEstimates.decline, { token });
  },
};

// Projects API
export const projectsAPI = {
  async list(organizationId: string, filters?: { clientId?: string; status?: string }) {
    return run('query', api.projects.list, defined({ organizationId, clientId: filters?.clientId, status: filters?.status }));
  },

  async getById(id: string) {
    return run('query', api.projects.get, { id });
  },

  async create(data: any) {
    return run('mutation', api.projects.create, { organizationId: requireOrganizationId(data), data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.projects.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.projects.remove, { id });
  },
};

// Activity Logs API
export const activityLogsAPI = {
  async list(organizationId: string, filters?: { userId?: string; resourceType?: string; limit?: number }) {
    return run('query', api.activityLogs.list, defined({
      organizationId,
      userId: filters?.userId,
      resourceType: filters?.resourceType,
      limit: filters?.limit,
    }));
  },

  async getById(id: string) {
    return run('query', api.activityLogs.get, { id });
  },

  async create(data: any) {
    return run('mutation', api.activityLogs.create, { organizationId: requireOrganizationId(data), data });
  },
};

// Line Items (Price Book) API 🎯
export const lineItemsAPI = {
  async list(organizationId: string, filters?: {
    costCodeId?: string;
    category?: string;
    search?: string;
    isActive?: boolean;
    includeShared?: boolean;
  }) {
    return run('query', api.lineItems.list, defined({
      organizationId,
      costCodeId: filters?.costCodeId,
      category: filters?.category,
      search: filters?.search,
      isActive: filters?.isActive,
      includeShared: filters?.includeShared,
    }));
  },

  async getById(id: string) {
    return run('query', api.lineItems.get, { id });
  },

  async create(data: any) {
    return run('mutation', api.lineItems.create, { data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.lineItems.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.lineItems.remove, { id });
  },

  async bulkCreate(items: any[]) {
    return run('mutation', api.lineItems.bulkCreate, { items });
  },
};

// Cost Codes API
export const costCodesAPI = {
  async list(filters?: {
    industryId?: string;
    category?: string;
    isActive?: boolean;
  }) {
    return run('query', api.costCodes.list, defined({
      industryId: filters?.industryId,
      category: filters?.category,
      isActive: filters?.isActive,
    }));
  },

  async getById(id: string) {
    return run('query', api.costCodes.get, { id });
  },

  async create(data: any) {
    return run('mutation', api.costCodes.create, { data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.costCodes.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.costCodes.remove, { id });
  },

  async bulkCreate(items: any[]) {
    return run('mutation', api.costCodes.bulkCreate, { items });
  },
};

// Pricing Modes API
export const pricingModesAPI = {
  async list(organizationId?: string) {
    return run('query', api.pricingModes.list, defined({ organizationId }));
  },

  async presets() {
    return run('query', api.pricingModes.presets, {});
  },

  async create(organizationId: string, data: any) {
    return run('mutation', api.pricingModes.create, { organizationId, data });
  },
};

// Industries (trades). An industry's `id` is its slug.
export const industriesAPI = {
  async list() {
    return run('query', api.industries.list, {});
  },

  async forOrganization(organizationId: string) {
    return run('query', api.industries.forOrganization, { organizationId });
  },

  async setForOrganization(organizationId: string, industryIds: string[]) {
    return run('mutation', api.industries.setForOrganization, { organizationId, industryIds });
  },
};

// Expenses: money spent on a job (or on the business).
export const expensesAPI = {
  async list(organizationId: string, projectId?: string) {
    return run('query', api.expenses.list, defined({ organizationId, projectId }));
  },

  async create(organizationId: string, data: any) {
    return run('mutation', api.expenses.create, { organizationId, data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.expenses.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.expenses.remove, { id });
  },
};

// Leads: quote requests, from first call to won or lost.
export const leadsAPI = {
  async list(organizationId: string) {
    return run('query', api.leads.list, { organizationId });
  },

  /** A call or text (counted), or a note typed on the card (stamped with the day). */
  logContact: (id: string, kind: 'call' | 'text' | 'note', note?: string) =>
    run('mutation', api.leads.logContact, defined({ id, kind, note })),
  /** "Got it, calling now" on a lead Tolliver sent. Returns when it was acknowledged. */
  acknowledge: (id: string): Promise<string> => run('mutation', api.leads.acknowledge, { id }),
  /** Which of your companies a lead is in (for an alert link opened under another company), or null. */
  companyOf: (id: string): Promise<{ organizationId: string; name: string } | null> => run('query', api.leads.companyOf, { id }),

  /** Calls onUpdate with the org's leads now and after every change. Returns a stop function. */
  watch(organizationId: string, onUpdate: (leads: any[]) => void): () => void {
    const watch = convex.watchQuery(api.leads.list, { organizationId: organizationId as Id<'organizations'> });
    const emit = () => {
      try {
        const result = watch.localQueryResult();
        if (result !== undefined) onUpdate(withId(result));
      } catch (error) {
        console.error('Error watching leads:', error);
      }
    };
    emit();
    return watch.onUpdate(emit);
  },

  async create(organizationId: string, data: any) {
    return run('mutation', api.leads.create, { organizationId, data });
  },

  /** Works out the city for leads that don't have one yet. */
  async fillMissingCities(organizationId: string) {
    return run('mutation', api.leadCity.fillMissing, { organizationId });
  },

  async update(id: string, data: any) {
    return run('mutation', api.leads.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.leads.remove, { id });
  },

  async addSamples(organizationId: string): Promise<number> {
    return run('mutation', api.leads.addSamples, { organizationId });
  },

  async removeSamples(organizationId: string): Promise<number> {
    return run('mutation', api.leads.removeSamples, { organizationId });
  },

  /** Returns the lead's client id, creating the client the first time. */
  async ensureClient(id: string): Promise<string> {
    return run('mutation', api.leads.ensureClient, { id });
  },
};

/** The Lead Market (platform admins), plus each company's wallet. */
export const marketplaceAPI = {
  inbox: () => run('query', api.marketplace.listInbox, {}),
  createLead: (data: any) => run('mutation', api.marketplace.createLead, { data }),
  importLeads: (leads: any[]) => run('mutation', api.marketplace.importLeads, { leads }),
  updateLead: (id: string, data: any) => run('mutation', api.marketplace.updateLead, { id, data }),
  removeLead: (id: string) => run('mutation', api.marketplace.removeLead, { id }),
  assign: (leadId: string, organizationId: string) => run('mutation', api.marketplace.assign, { leadId, organizationId }),
  companies: () => run('query', api.marketplace.companiesOverview, {}),
  createCompany: (data: any) => run('mutation', api.marketplace.createCompany, { data }),
  removeCompany: (organizationId: string) => run('mutation', api.marketplace.removeCompany, { organizationId }),
  setCompanyOwner: (organizationId: string, email: string) =>
    run('mutation', api.marketplace.setCompanyOwner, { organizationId, email }),
  setCompanyTrades: (organizationId: string, leadTrades: string[]) =>
    run('mutation', api.marketplace.setCompanyTrades, { organizationId, leadTrades }),
  setPlan: (
    organizationId: string,
    changes: { status?: 'trial' | 'active' | 'past_due' | 'cancelled'; monthlyCents?: number; claimsIncluded?: number; extraClaimCents?: number },
  ) => run('mutation', api.marketplace.setPlan, defined({ organizationId, ...changes })),
  recordTopUp: (organizationId: string, payment: { amount: number; bonus?: number; method?: string; note?: string }) =>
    run('mutation', api.marketplace.recordTopUp, defined({ organizationId, ...payment })),
  prices: () => run('query', api.marketplace.listLeadPrices, {}),
  setPrice: (jobType: string, price: number | null, schedule?: { floor?: number | null; drop?: number | null; dropEveryMinutes?: number | null }) =>
    run('mutation', api.marketplace.setLeadPrice, { jobType, price, ...(schedule ?? {}) }),
  pendingCredits: () => run('query', api.marketplace.pendingCredits, {}),
  reviewCredit: (orgLeadId: string, approve: boolean) => run('mutation', api.marketplace.reviewCredit, { orgLeadId, approve }),
  /** The owner credits a bought lead back without a request: the company told Tolliver by phone. */
  creditLead: (orgLeadId: string, reason: string, note?: string): Promise<{ amountCents: number }> =>
    run('mutation', api.marketplace.creditLead, defined({ orgLeadId, reason, note })),
};

export const walletAPI = {
  get: (organizationId: string) => run('query', api.marketplace.wallet, { organizationId }),
  feed: (organizationId: string) => run('query', api.marketplace.feed, { organizationId }),
  buy: (leadId: string, organizationId: string) => run('mutation', api.marketplace.buy, { leadId, organizationId }),
  /** A standing offer: buys the lead on its own once its price drops to `max` dollars. */
  placeBid: (leadId: string, organizationId: string, max: number) =>
    run('mutation', api.marketplace.placeBid, { leadId, organizationId, max }),
  cancelBid: (bidId: string) => run('mutation', api.marketplace.cancelBid, { bidId }),
  bids: (organizationId: string) => run('query', api.marketplace.bids, { organizationId }),
  requestCredit: (leadId: string, reason: string, note?: string) =>
    run('mutation', api.marketplace.requestCredit, defined({ leadId, reason, note })),
  /** Older leads: Marketplace leads nobody bought in a week, for companies on the plan. */
  olderLeads: (organizationId: string) => run('query', api.marketplace.olderLeads, { organizationId }),
  claim: (leadId: string, organizationId: string) => run('mutation', api.marketplace.claim, { leadId, organizationId }),
  /** The monthly plan, paid from the lead balance. */
  ensurePlan: (organizationId: string) => run('mutation', api.marketplace.ensurePlan, { organizationId }),
  startPlan: (organizationId: string): Promise<PlanSummary & { chargedCents: number }> => run('mutation', api.marketplace.startPlan, { organizationId }),
  cancelPlan: (organizationId: string) => run('mutation', api.marketplace.cancelPlan, { organizationId }),
};

/** The intake queue: leads on their way in, before staff confirm and list them. */
export interface IntakeFields {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  zip?: string;
  county?: string;
  jobType?: string;
  scope?: string;
  timeline?: string;
  isOwner?: boolean;
  notes?: string;
}
export const intakeAPI = {
  queue: (status?: 'open' | 'closed' | 'confirmed') => run('query', api.intake.queue, defined({ status })),
  get: (id: string) => run('query', api.intake.get, { id }),
  create: (source: 'call' | 'manual', fields: IntakeFields) => run('mutation', api.intake.create, defined({ source, ...fields })),
  update: (id: string, fields: IntakeFields) => run('mutation', api.intake.update, defined({ id, ...fields })),
  logAttempt: (id: string, outcome: string, note?: string) => run('mutation', api.intake.logAttempt, defined({ id, outcome, note })),
  close: (id: string, disposition: string, note?: string) => run('mutation', api.intake.close, defined({ id, disposition, note })),
  reopen: (id: string) => run('mutation', api.intake.reopen, { id }),
  confirm: (id: string, checks: Record<string, boolean>, fields: IntakeFields, note?: string, allowDuplicate?: boolean) =>
    run('mutation', api.intake.confirm, defined({ id, checks, note, allowDuplicate, ...fields })),
};

/** The demand board: where funded bids are, by county and trade (staff). */
export const demandAPI = {
  board: () => run('query', api.demand.board, {}),
  slot: (county: string, jobType: string) => run('query', api.demand.slot, { county, jobType }),
  setPlanCpl: (jobType: string, cents: number | null) => run('mutation', api.demand.setPlanCpl, { jobType, cents }),
};

/** Lead alerts: what was sent to whom when a lead was awarded (staff). */
export const deliveryAPI = {
  recent: () => run('query', api.delivery.recent, {}),
  resend: (orgLeadId: string) => run('mutation', api.delivery.resend, { orgLeadId }),
  /** "Called, they have it": stops the red and the chase. */
  markHandled: (leadId: string): Promise<string> => run('mutation', api.delivery.markHandled, { leadId }),
};

/** The signed-in person's own settings. */
export const usersAPI = {
  setMobile: (mobile: string): Promise<string | null> => run('mutation', api.users.setMobile, { mobile }),
};

/** Who runs the Lead Market, and who makes calls (owner only). */
export const staffAPI = {
  list: () => run('query', api.staff.list, {}),
  invite: (email: string, role: 'staff' | 'caller' = 'staff') => run('mutation', api.staff.invite, { email, role }),
  removeInvite: (id: string) => run('mutation', api.staff.removeInvite, { id }),
  remove: (id: string) => run('mutation', api.staff.remove, { id }),
};

/** Building permits near a company, from the city's public feed (the Vault's second tab). */
export const permitsAPI = {
  near: (organizationId: string, days?: number) => run('query', api.permits.near, defined({ organizationId, days })),
  monthly: () => run('query', api.permits.monthly, {}),
  status: () => run('query', api.permits.status, {}),
  syncNow: () => run('action', api.permits.syncNow, {}),
  syncOwners: () => run('action', api.parcels.syncNow, {}),
};

/** Tolliver callers: the dial check, call outcomes, call lists and the tally. */
export const callsAPI = {
  tally: (days?: number) => run('query', api.calls.tally, defined({ days })),
  check: (phone: string) => run('query', api.calls.check, { phone }),
  log: (args: { phone: string; outcome: string; address: string; parcelId?: string; owner?: string; trade?: string; note?: string; callbackAt?: string }) =>
    run('mutation', api.calls.log, defined(args)),
  list: (args: { kind: 'trade_permits' | 'recent_buyers' | 'street'; trade?: string; street?: string }) => run('query', api.calls.list, defined(args)),
  myDay: () => run('query', api.calls.myDay, {}),
  takeLead: (args: {
    parcelId?: string; phone: string; name: string; address: string; zip?: string; jobType: string;
    scope?: string; timeline?: string; notes?: string; isOwner: boolean; consented: boolean;
  }) => run('mutation', api.calls.takeLead, defined(args)),
};

/** Midland's monthly courthouse foreclosure auction, kept by hand in Ops. */
export const foreclosuresAPI = {
  sale: (saleDate?: string) => run('query', api.foreclosures.sale, defined({ saleDate })),
  addMany: (saleDate: string, kind: 'mortgage' | 'tax', addresses: string) => run('mutation', api.foreclosures.addMany, { saleDate, kind, addresses }),
  update: (args: { id: string; status?: string; buyer?: { name: string; company: boolean; phone?: string }; salePriceCents?: number; note?: string }) =>
    run('mutation', api.foreclosures.update, defined(args)),
  remove: (id: string) => run('mutation', api.foreclosures.remove, { id }),
};

/** Motivated-seller lists: Midland homes stacked by public-record signals (staff). */
export const sellersAPI = {
  sellers: (args: { lists?: string[]; minLists?: number; limit?: number }) => run('query', api.signals.sellers, defined(args)),
  /** One page of every home matching the filters, for the CSV; read until isDone. */
  exportPage: (args: { lists?: string[]; minLists?: number; cursor: string | null }) =>
    run('query', api.signals.sellersExport, defined({ lists: args.lists, minLists: args.minLists, paginationOpts: { numItems: 400, cursor: args.cursor } })),
  home: (parcelId: string) => run('query', api.signals.home, { parcelId }),
  status: () => run('query', api.signals.status, {}),
  syncNow: () => run('action', api.signals.syncNow, {}),
};

/** The Tolliver Report: a county's week in permits, builders, demand and sales (Pro adds the names). */
export const reportAPI = {
  get: (organizationId: string, opts: { county?: string; trade?: string } = {}) =>
    run('query', api.report.report, defined({ organizationId, county: opts.county, trade: opts.trade })),
};

/** Standing bids by county and service type, and the leads they won or missed. */
export const bidsAPI = {
  listStanding: (organizationId: string) => run('query', api.bids.listStanding, { organizationId }),
  setStanding: (organizationId: string, county: string, jobType: string, amount: number) =>
    run('mutation', api.bids.setStanding, { organizationId, county, jobType, amount }),
  removeStanding: (id: string) => run('mutation', api.bids.removeStanding, { id }),
  /** The company has seen its bids: outbids so far stop being news. */
  markOutbidSeen: (organizationId: string) => run('mutation', api.bids.markOutbidSeen, { organizationId }),
  results: (organizationId: string) => run('query', api.bids.results, { organizationId }),
};

/** Funding links: the page a company pays through to load its lead balance. */
export const fundingAPI = {
  createLink: (organizationId: string) => run('mutation', api.funding.createLink, { organizationId }),
  url: (token: string) => `${window.location.origin}/fund/${token}`,
  get: (token: string) => run('query', api.funding.get, { token }),
  /** Opens a Stripe Checkout session for the amount; the caller sends the payer to the URL. */
  checkout: (token: string, amountCents: number): Promise<{ url: string }> => run('action', api.funding.checkout, { token, amountCents }),
};

/** Applications from the landing page: companies that want to buy leads. */
export const applicationsAPI = {
  options: (): Promise<{ trades: Array<{ slug: string; name: string }>; counties: string[]; westTexas: string[] }> =>
    run('query', api.applications.options, {}),
  submit: (form: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    trades: string[];
    county: string;
    jobsPerMonth?: string;
    notes?: string;
  }): Promise<{ duplicate: boolean; id?: string }> => run('mutation', api.applications.submit, defined(form)),
  list: () => run('query', api.applications.list, {}),
  approve: (id: string): Promise<{ organizationId: string }> => run('mutation', api.applications.approve, { id }),
  decline: (id: string) => run('mutation', api.applications.decline, { id }),
};

export type AssistantRequest =
  | { ok: false }
  | {
      ok: true;
      app: 'claude' | 'chatgpt' | 'other';
      appName: string;
      domain: string;
      issuer: string;
      companies: Array<{ id: string; name: string; canSpend: boolean }>;
    };

export type AssistantConnection = {
  id: string;
  app: 'claude' | 'chatgpt' | 'other';
  appName: string;
  connectedAt: string;
  lastUsedAt?: number;
  spending: boolean;
  dailyCapCents: number;
  spentTodayCents: number;
};

/** Claude and ChatGPT connected to Tolliver: approving a connection and managing them in Settings. */
export const assistantsAPI = {
  request: (clientId: string, redirectUri: string): Promise<AssistantRequest> =>
    run('query', api.oauth.request, { clientId, redirectUri }),
  approve: (args: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state?: string;
    resource?: string;
    organizationId: string;
    spending: boolean;
    dailyCap?: number;
  }): Promise<string> => run('mutation', api.oauth.approve, defined(args)),
  connections: (organizationId: string): Promise<{ canSpend: boolean; connections: AssistantConnection[] }> =>
    run('query', api.oauth.myConnections, { organizationId }),
  update: (id: string, spending: boolean, dailyCap?: number) =>
    run('mutation', api.oauth.updateConnection, defined({ id, spending, dailyCap })),
  disconnect: (id: string) => run('mutation', api.oauth.disconnect, { id }),
};

export { APIError };
