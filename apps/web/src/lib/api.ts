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
import { convex } from "./convex";

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

/** Adds an `id` alias for `_id`, which older screens read. */
function withId<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withId) as T;
  if (value && typeof value === 'object' && '_id' in value && !('id' in value)) {
    return { ...value, id: (value as { _id: string })._id };
  }
  return value;
}

async function run<T = any>(kind: 'query' | 'mutation', ref: FunctionReference<any>, args: Record<string, unknown>): Promise<T> {
  try {
    const result = kind === 'query' ? await client.query(ref, args) : await client.mutation(ref, args);
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

  async sign(id: string, signature: string) {
    return run('mutation', api.estimates.sign, { id, signature });
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

  async accept(token: string, signature: string) {
    return run('mutation', api.publicEstimates.accept, { token, signature });
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
  archiveLead: (id: string) => run('mutation', api.marketplace.archiveLead, { id }),
  recordTopUp: (organizationId: string, payment: { amount: number; bonus?: number; method?: string; note?: string }) =>
    run('mutation', api.marketplace.recordTopUp, defined({ organizationId, ...payment })),
  prices: () => run('query', api.marketplace.listLeadPrices, {}),
  setPrice: (jobType: string, price: number | null, schedule?: { floor?: number | null; drop?: number | null; dropEveryMinutes?: number | null }) =>
    run('mutation', api.marketplace.setLeadPrice, { jobType, price, ...(schedule ?? {}) }),
  pendingCredits: () => run('query', api.marketplace.pendingCredits, {}),
  reviewCredit: (orgLeadId: string, approve: boolean) => run('mutation', api.marketplace.reviewCredit, { orgLeadId, approve }),
  addDemoData: () => run('mutation', api.marketplace.addDemoData, {}),
  addSampleLeads: () => run('mutation', api.marketplace.addSampleLeads, {}),
  addDemoBids: () => run('mutation', api.marketplace.addDemoBids, {}),
  removeDemoData: () => run('mutation', api.marketplace.removeDemoData, {}),
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
  startPlan: (organizationId: string) => run('mutation', api.marketplace.startPlan, { organizationId }),
  cancelPlan: (organizationId: string) => run('mutation', api.marketplace.cancelPlan, { organizationId }),
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
  submit: (token: string, payment: { amountCents: number; method: 'card' | 'apple_pay'; payerName?: string; payerEmail?: string }) =>
    run('mutation', api.funding.submit, defined({ token, ...payment })),
  pending: () => run('query', api.funding.pending, {}),
  confirm: (id: string) => run('mutation', api.funding.confirm, { id }),
  cancel: (id: string) => run('mutation', api.funding.cancel, { id }),
};

export { APIError };
