import { clientsAPI, estimatesAPI, projectsAPI } from '../lib/api';

export interface EstimateItem {
  id?: string;
  estimate_id?: string;
  work_pack_item_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  original_unit_price?: number;
  total_price: number;
  /** Price-book floor and ceiling when the item was added. */
  red_line_price?: number;
  cap_price?: number;
  product_id?: string;
  cost_code?: string;
  cost_code_name?: string;
  display_order?: number;
}

export interface Estimate {
  id?: string;
  user_id?: string;
  organization_id?: string;
  client_id?: string;
  project_id?: string;
  estimate_number?: string;
  title?: string;
  description?: string;
  status: 'draft' | 'sent' | 'opened' | 'accepted' | 'rejected' | 'expired';
  issue_date: string;
  expiry_date?: string;
  subtotal: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount: number;
  notes?: string;
  terms?: string;
  client_signature?: string;
  signed_at?: string;
  first_opened_at?: string;
  sent_at?: string;
  last_sent_at?: string;
  send_count?: number;
  email_opened_at?: string;
  created_at?: string;
  updated_at?: string;
  items?: EstimateItem[];
  client?: {
    name: string;
    email: string;
    company_name?: string;
    address?: string;
    phone?: string;
  };
  project?: {
    id: string;
    name: string;
    category?: string;
    description?: string;
  };
  user?: {
    id: string;
    email?: string;
    company_name?: string;
    phone?: string;
  };
  // Metadata for package selection (stored in a JSON field or separate table)
  package_level?: string;
  package_id?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

/** Convex client → the snake_case shape these screens read. */
export function toLegacyClient(client: Doc) {
  return {
    id: client._id,
    name: client.name,
    email: client.email ?? '',
    phone: client.phone,
    company_name: client.companyName,
    address: client.address,
    city: client.city,
    state: client.state,
    zip: client.zip,
    notes: client.notes,
    organization_id: client.organizationId,
  };
}

function toLegacy(doc: Doc, clients?: Map<string, Doc>, projects?: Map<string, Doc>): Estimate {
  const client = doc.clientId ? clients?.get(doc.clientId) : undefined;
  const project = doc.projectId ? projects?.get(doc.projectId) : undefined;
  return {
    id: doc._id,
    user_id: doc.userId,
    organization_id: doc.organizationId,
    client_id: doc.clientId,
    project_id: doc.projectId,
    estimate_number: doc.estimateNumber,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    issue_date: doc.issueDate,
    expiry_date: doc.expiryDate,
    subtotal: doc.subtotal,
    tax_rate: doc.taxRate,
    tax_amount: doc.taxAmount,
    total_amount: doc.totalAmount,
    notes: doc.notes,
    terms: doc.terms,
    client_signature: doc.clientSignature,
    signed_at: doc.signedAt,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    items: (doc.items ?? []).map((item: Doc) => ({
      id: item._id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      red_line_price: item.redLinePrice,
      cap_price: item.capPrice,
      product_id: item.productId,
      cost_code: item.costCode,
      display_order: item.displayOrder,
    })),
    client: client ? toLegacyClient(client) : undefined,
    project: project ? { id: project._id, name: project.name, description: project.description } : undefined,
  };
}

/** Snake_case fields from the screens → Convex fields (only those given). */
function toConvex(estimate: Partial<Estimate> & Doc): Doc {
  const map: Record<string, string> = {
    client_id: 'clientId',
    project_id: 'projectId',
    estimate_number: 'estimateNumber',
    title: 'title',
    description: 'description',
    status: 'status',
    issue_date: 'issueDate',
    expiry_date: 'expiryDate',
    tax_rate: 'taxRate',
    notes: 'notes',
    terms: 'terms',
  };
  const out: Doc = {};
  for (const [from, to] of Object.entries(map)) {
    // Empty strings from forms mean "not set".
    if (from in estimate) out[to] = estimate[from] === '' ? null : estimate[from];
  }
  if (estimate.items) {
    out.items = estimate.items.map((item: Doc, index: number) => ({
      description: item.description || item.product_name || '',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price ?? item.price) || 0,
      redLinePrice: item.red_line_price ?? undefined,
      capPrice: item.cap_price ?? undefined,
      costCode: item.cost_code,
      productId: item.product_id,
      displayOrder: item.display_order ?? index,
    }));
  }
  return out;
}

function newNumber(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

async function byId(load: Promise<Doc[]>): Promise<Map<string, Doc>> {
  return new Map((await load).map((row) => [row._id, row]));
}

/** Estimates, stored in Convex (totals and tax are computed by the server). */
export class EstimateService {
  static async list(organizationId: string, filters?: { clientId?: string; status?: string }): Promise<Estimate[]> {
    const [estimates, clients, projects] = await Promise.all([
      estimatesAPI.list(organizationId, filters),
      byId(clientsAPI.list(organizationId)),
      byId(projectsAPI.list(organizationId)),
    ]);
    return estimates.map((doc: Doc) => toLegacy(doc, clients, projects));
  }

  static async getById(id: string): Promise<Estimate | null> {
    const doc = await estimatesAPI.getById(id);
    if (!doc) return null;
    const [client, project] = await Promise.all([
      doc.clientId ? clientsAPI.getById(doc.clientId).catch(() => null) : null,
      doc.projectId ? projectsAPI.getById(doc.projectId).catch(() => null) : null,
    ]);
    return toLegacy(
      doc,
      new Map(client ? [[client._id, client]] : []),
      new Map(project ? [[project._id, project]] : []),
    );
  }

  static async create(
    estimate: Omit<Estimate, 'id' | 'created_at' | 'updated_at' | 'estimate_number'> & {
      organization_id: string;
      estimate_number?: string;
      items?: EstimateItem[];
    },
  ): Promise<Estimate> {
    const data: Doc = {
      status: 'draft',
      issueDate: new Date().toISOString().split('T')[0],
      items: [],
      ...toConvex(estimate),
      organization_id: estimate.organization_id,
    };
    if (!data.estimateNumber) data.estimateNumber = newNumber('EST');
    return toLegacy(await estimatesAPI.create(data));
  }

  static async update(id: string, updates: Partial<Estimate> & { items?: EstimateItem[] }): Promise<Estimate> {
    return toLegacy(await estimatesAPI.update(id, toConvex(updates)));
  }

  static async delete(id: string): Promise<void> {
    await estimatesAPI.delete(id);
  }

  static async addSignature(id: string, signature: string): Promise<Estimate> {
    return toLegacy(await estimatesAPI.sign(id, signature));
  }

  static async updateStatus(id: string, status: Estimate['status']): Promise<Estimate> {
    return this.update(id, { status });
  }

  static async getByClient(clientId: string, organizationId?: string): Promise<Estimate[]> {
    if (!organizationId) return [];
    return this.list(organizationId, { clientId });
  }

  static async getByStatus(organizationId: string, status: Estimate['status']): Promise<Estimate[]> {
    return this.list(organizationId, { status });
  }

  static async getByProject(projectId: string, organizationId?: string): Promise<Estimate[]> {
    if (!organizationId) return [];
    return (await this.list(organizationId)).filter((estimate) => estimate.project_id === projectId);
  }

  static async createFromServicePackage(data: {
    organization_id: string;
    user_id: string;
    client_id: string;
    project_id?: string;
    title: string;
    description?: string;
    service_package_id: string;
    service_package_items: Doc[];
  }): Promise<Estimate> {
    return this.create({
      organization_id: data.organization_id,
      client_id: data.client_id,
      project_id: data.project_id,
      title: data.title,
      description: data.description,
      status: 'draft',
      issue_date: new Date().toISOString().split('T')[0],
      subtotal: 0,
      total_amount: 0,
      items: data.service_package_items.map((item, index) => ({
        description: item.description || item.name || '',
        quantity: item.quantity || 1,
        unit_price: item.price || 0,
        total_price: (item.quantity || 1) * (item.price || 0),
        display_order: index,
      })),
    });
  }

  /**
   * Emailing estimates went through a Supabase function that no longer
   * exists, so this reports that instead of pretending to send.
   */
  static async sendEstimate(
    estimateId: string,
    recipientEmail: string,
    options?: { message?: string; ccEmails?: string[] },
  ): Promise<{ success: boolean; error?: string }> {
    console.warn('Email sending is not available', { estimateId, recipientEmail, cc: options?.ccEmails });
    return {
      success: false,
      error: "Emailing estimates isn't set up yet. Share the estimate link with your client instead.",
    };
  }
}
