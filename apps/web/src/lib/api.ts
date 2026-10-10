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
};

// Invoices API
export const invoicesAPI = {
  async list(organizationId: string, filters?: { clientId?: string; status?: string }) {
    return run('query', api.invoices.list, defined({ organizationId, clientId: filters?.clientId, status: filters?.status }));
  },

  async getById(id: string) {
    return run('query', api.invoices.get, { id });
  },

  async create(data: any) {
    return run('mutation', api.invoices.create, { organizationId: requireOrganizationId(data), data });
  },

  async update(id: string, data: any) {
    return run('mutation', api.invoices.update, { id, data });
  },

  async delete(id: string) {
    return run('mutation', api.invoices.remove, { id });
  },

  async markAsPaid(id: string, amountPaid: number) {
    return run('mutation', api.invoices.markAsPaid, { id, amountPaid });
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

// Leads: quote requests, from first call to won or lost.
export const leadsAPI = {
  async list(organizationId: string) {
    return run('query', api.leads.list, { organizationId });
  },

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

export { APIError };
