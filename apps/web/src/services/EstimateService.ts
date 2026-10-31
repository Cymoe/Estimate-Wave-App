import { clientsAPI, estimatesAPI, projectsAPI } from '../lib/api';
import { uploadFile } from './uploads';

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
  /** The price book cost code's name, e.g. "Interior Painting". */
  category?: string;
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
  /** Accepted by the company for the client, without their signature. */
  approved_at?: string;
  approved_by_name?: string;
  /** Contract terms the user wrote (see services/contract.ts). */
  contract_terms?: import('./contract').ContractTerms;
  /** Set when the estimate was accepted: the contract as agreed. */
  contract_locked_at?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract_snapshot?: Record<string, any>;
  /** The agreed design (image or PDF) attached to the estimate. */
  design?: { url: string; name: string; type?: string };
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
    language?: 'en' | 'es';
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
    language: client.language,
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
    approved_at: doc.approvedAt,
    approved_by_name: doc.approvedBy?.name,
    contract_terms: doc.contractTerms,
    contract_locked_at: doc.contractLockedAt,
    contract_snapshot: doc.contractSnapshot,
    design: doc.design ? { url: doc.design.url, name: doc.design.name, type: doc.design.contentType } : undefined,
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
      category: item.category,
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
    contract_terms: 'contractTerms',
  };
  const out: Doc = {};
  for (const [from, to] of Object.entries(map)) {
    // Empty strings from forms mean "not set".
    if (from in estimate) out[to] = estimate[from] === '' ? null : estimate[from];
  }
  if (estimate.items) {
    out.items = estimate.items.map((item: Doc, index: number) => ({
      // Keeping the id lets a signed contract match items to the estimate's.
      _id: item.id || undefined,
      description: item.description || item.product_name || '',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price ?? item.price) || 0,
      redLinePrice: item.red_line_price ?? undefined,
      capPrice: item.cap_price ?? undefined,
      costCode: item.cost_code,
      category: item.category || undefined,
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

// The estimates loaded so far (memory only), so an estimate opened from the
// list shows at once while the latest copy loads behind it.
const cache = new Map<string, Estimate>();

/**
 * Keeps an estimate; a copy without client/project details (as mutations
 * return) gets the ones already known, and that fuller copy is returned.
 */
function remember(estimate: Estimate): Estimate {
  if (!estimate?.id) return estimate;
  const known = cache.get(estimate.id);
  const kept = {
    ...estimate,
    client: estimate.client ?? (estimate.client_id && estimate.client_id === known?.client_id ? known.client : undefined),
    project: estimate.project ?? (estimate.project_id && estimate.project_id === known?.project_id ? known.project : undefined),
  };
  cache.set(estimate.id, kept);
  return kept;
}

/** Estimates, stored in Convex (totals and tax are computed by the server). */
export class EstimateService {
  /** The last copy loaded of an estimate, if any. */
  static cached(id: string): Estimate | undefined {
    return cache.get(id);
  }

  static async list(organizationId: string, filters?: { clientId?: string; status?: string }): Promise<Estimate[]> {
    const [estimates, clients, projects] = await Promise.all([
      estimatesAPI.list(organizationId, filters),
      byId(clientsAPI.list(organizationId)),
      byId(projectsAPI.list(organizationId)),
    ]);
    return estimates.map((doc: Doc) => remember(toLegacy(doc, clients, projects)));
  }

  static async getById(id: string): Promise<Estimate | null> {
    const doc = await estimatesAPI.getById(id);
    if (!doc) return null;
    const [client, project] = await Promise.all([
      doc.clientId ? clientsAPI.getById(doc.clientId).catch(() => null) : null,
      doc.projectId ? projectsAPI.getById(doc.projectId).catch(() => null) : null,
    ]);
    return remember(
      toLegacy(
        doc,
        new Map(client ? [[client._id, client]] : []),
        new Map(project ? [[project._id, project]] : []),
      ),
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
    return remember(toLegacy(await estimatesAPI.create(data)));
  }

  static async update(id: string, updates: Partial<Estimate> & { items?: EstimateItem[] }): Promise<Estimate> {
    return remember(toLegacy(await estimatesAPI.update(id, toConvex(updates))));
  }

  static async delete(id: string): Promise<void> {
    await estimatesAPI.delete(id);
    cache.delete(id);
  }

  static async addSignature(id: string, signature: string): Promise<Estimate> {
    return toLegacy(await estimatesAPI.sign(id, signature));
  }

  /** Uploads an image or PDF and attaches it as the estimate's agreed design. */
  static async uploadDesign(id: string, file: File): Promise<Estimate> {
    const storageId = await uploadFile(await estimatesAPI.designUploadUrl(id), file);
    return toLegacy(await estimatesAPI.setDesign(id, storageId, file.name));
  }

  static async removeDesign(id: string): Promise<Estimate> {
    return toLegacy(await estimatesAPI.removeDesign(id));
  }

  static async updateStatus(id: string, status: Estimate['status']): Promise<Estimate> {
    return this.update(id, { status });
  }

  /** Accepts it for the client without their signature (they agreed in person or by phone). */
  static async approve(id: string): Promise<Estimate> {
    return remember(toLegacy(await estimatesAPI.approve(id)));
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
  /** The estimate's client link, where the client views, accepts or declines it. */
  static async shareUrl(id: string): Promise<string> {
    const token = await estimatesAPI.shareLink(id);
    return `${window.location.origin}/share/estimate/${token}`;
  }
}
