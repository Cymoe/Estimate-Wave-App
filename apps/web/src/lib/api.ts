/**
 * Data API backed by Convex.
 *
 * Keeps the same functions and call signatures the screens used with the old
 * Express/MongoDB backend, so callers don't change. Every call runs as the
 * signed-in user and Convex checks organization membership on the server.
 */

import { ConvexError } from 'convex/values';
import { UNLISTED } from '../components/outreach/listsStore';
import type { FunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { PlanSummary } from '../components/market/wallet';
import { convex } from './convex';
import { withId } from './withId';

export { withId };

class APIError extends Error {
  /** A stable word for a refusal on a public page, so it can be shown in the reader's language. */
  public reason?: string;
  constructor(
    message: string,
    public status: number,
    public data?: any,
  ) {
    super(message);
    this.name = 'APIError';
    this.reason = data && typeof data === 'object' ? data.reason : undefined;
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
};

interface ConvexCaller {
  query(ref: FunctionReference<'query'>, args: any): Promise<any>;
  mutation(ref: FunctionReference<'mutation'>, args: any): Promise<any>;
}

let client: ConvexCaller = convex;

/** Points the API at another Convex client (used by tests). */
export function setConvexClient(next: ConvexCaller) {
  client = next;
}

function toAPIError(error: unknown): APIError {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string } | string;
    const message = typeof data === 'string' ? data : (data?.message ?? 'Request failed');
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

/** Calls onUpdate with a query's result now (when it's cached) and after every change on the server; returns a stop function. */
function watchOn<T>(ref: FunctionReference<'query'>, args: Record<string, unknown>, onUpdate: (value: T) => void, onError?: (error: APIError) => void): () => void {
  const watch = convex.watchQuery(ref, args as never);
  const emit = () => {
    try {
      const result = watch.localQueryResult();
      if (result !== undefined) onUpdate(withId(result) as T);
    } catch (error) {
      onError?.(toAPIError(error));
    }
  };
  emit();
  return watch.onUpdate(emit);
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

  /** What clients get back once a job is done: the review link and the referral reward (empty clears). */
  async setPerks(id: string, perks: { reviewUrl?: string; referralReward?: string }): Promise<{ reviewUrl?: string; referralReward?: string } | null> {
    return run('mutation', api.organizations.setPerks, defined({ id, ...perks }));
  },
  /** Sales mode: the red line, cap, pricing options and commission for companies with sales reps. */
  async setSalesMode(id: string, on: boolean): Promise<boolean> {
    return run('mutation', api.organizations.setSalesMode, { id, on });
  },

  /** The company logo on what clients see: upload, then attach (or null to remove). Returns its URL. */
  async logoUploadUrl(id: string): Promise<string> {
    return run('mutation', api.organizations.logoUploadUrl, { id });
  },
  async setLogo(id: string, storageId: string | null, name?: string): Promise<string | null> {
    return run('mutation', api.organizations.setLogo, defined({ id, storageId, name }));
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

  /** The built-in agreement's wording: payment terms, warranty and extra clauses. */
  setAgreement(id: string, wording: AgreementWording): Promise<AgreementWording> {
    return run('mutation', api.organizations.setAgreement, defined({ id, ...wording }));
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

/** One contract document as a page shows it: Webb Leads', or an uploaded PDF (with its link). */
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
  /** Once signed: the file with a signature page added at the end. */
  signedUrl?: string;
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
  useBuiltIn: (organizationId: string, kind: SlotKind) => run('mutation', api.contractDocs.useBuiltIn, { organizationId, kind }),
  remove: (id: string): Promise<{ archived: boolean }> => run('mutation', api.contractDocs.remove, { id }),
};

export type { AgreementWording } from '../../convex/lib/contractDefaults';
import type { AgreementWording } from '../../convex/lib/contractDefaults';

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

export interface JobPhoto {
  id: string;
  url?: string;
  fileName: string;
  /** An image type, or application/pdf. */
  contentType?: string;
  /** On an estimate: goes on its contract with the agreement. */
  inContract?: boolean;
  caption?: string;
  createdAt: string;
  estimateId?: string;
  projectId?: string;
  from?: string;
}

/** Job photos and files (images and PDFs) on an estimate or a project. */
export const photosAPI = {
  list: (target: { estimateId?: string; projectId?: string }): Promise<JobPhoto[]> => run('query', api.photos.list, defined(target)),
  uploadUrl: (organizationId: string): Promise<string> => run('mutation', api.photos.uploadUrl, { organizationId }),
  add: (args: { storageId: string; fileName: string; estimateId?: string; projectId?: string; caption?: string }) =>
    run('mutation', api.photos.add, defined(args)),
  setCaption: (id: string, caption: string) => run('mutation', api.photos.setCaption, { id, caption }),
  setInContract: (id: string, inContract: boolean) => run('mutation', api.photos.setInContract, { id, inContract }),
  remove: (id: string) => run('mutation', api.photos.remove, { id }),
};

export interface CrewMember {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  trade?: string;
  /** The language their task texts come in. */
  language?: 'en' | 'es';
  archived: boolean;
}
export interface CrewInput {
  name: string;
  phone?: string;
  email?: string;
  trade?: string;
  language?: 'en' | 'es';
}

/** The people a company puts on its jobs. */
export const crewAPI = {
  list: (organizationId: string): Promise<CrewMember[]> => run('query', api.crew.list, { organizationId }),
  add: (organizationId: string, data: CrewInput): Promise<string> => run('mutation', api.crew.add, defined({ organizationId, ...data })),
  update: (id: string, data: CrewInput) => run('mutation', api.crew.update, defined({ id, ...data })),
  archive: (id: string, archived: boolean) => run('mutation', api.crew.archive, { id, archived }),
};

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  done: boolean;
  doneAt?: string;
  crew: Array<{ id: string; name: string; phone?: string; trade?: string; language?: 'en' | 'es' }>;
  order: number;
}
export interface ScheduledTask extends ProjectTask {
  projectName: string;
  address?: string;
}
export interface Schedule {
  tasks: ScheduledTask[];
  projects: Array<{ id: string; name: string; status: string; startDate: string; endDate?: string }>;
}
export interface TaskInput {
  title?: string;
  notes?: string;
  startDate?: string | null;
  endDate?: string | null;
  crewIds?: string[];
  done?: boolean;
}

/** The work on a project, and the company's schedule across projects. */
export const tasksAPI = {
  forProject: (projectId: string): Promise<ProjectTask[]> => run('query', api.tasks.forProject, { projectId }),
  add: (projectId: string, data: TaskInput & { title: string }): Promise<string> => run('mutation', api.tasks.add, defined({ projectId, ...data })),
  update: (id: string, data: TaskInput) => run('mutation', api.tasks.update, defined({ id, ...data })),
  remove: (id: string) => run('mutation', api.tasks.remove, { id }),
  schedule: (organizationId: string, from: string, to: string): Promise<Schedule> => run('query', api.tasks.schedule, { organizationId, from, to }),
  /** Each project's tasks done and in all, and whether the completion sign-off is signed. */
  progress: (organizationId: string): Promise<Array<{ projectId: string; done: number; total: number; signedOff: boolean }>> =>
    run('query', api.tasks.progress, { organizationId }),
};

/** A kind of job saved from a project: its estimate lines, tasks and length. */
export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  days?: number;
  total: number;
  itemCount: number;
  taskCount: number;
  usageCount: number;
  updatedAt: string;
}
export const templatesAPI = {
  list: (organizationId: string): Promise<ProjectTemplate[]> => run('query', api.projectTemplates.list, { organizationId }),
  saveFromProject: (projectId: string, name: string, description?: string): Promise<ProjectTemplate> =>
    run('mutation', api.projectTemplates.saveFromProject, defined({ projectId, name, description })),
  update: (id: string, data: { name?: string; description?: string | null; days?: number | null }): Promise<ProjectTemplate> =>
    run('mutation', api.projectTemplates.update, { id, data }),
  remove: (id: string) => run('mutation', api.projectTemplates.remove, { id }),
  /** The project, its draft estimate (if the template has lines) and its tasks, in one go. */
  start: (
    id: string,
    data: { name: string; clientId?: string; startDate?: string; endDate?: string; budget?: number; description?: string },
  ): Promise<{ project: Record<string, unknown> & { _id: string }; estimateId: string | null }> =>
    run('mutation', api.projectTemplates.start, { id, data: defined(data) }),
  /** The same, from a built-in package (convex/catalog/packages.ts). */
  startPackage: (
    organizationId: string,
    packageId: string,
    data: { name: string; clientId?: string; startDate?: string; endDate?: string; budget?: number; description?: string },
  ): Promise<{ project: Record<string, unknown> & { _id: string }; estimateId: string | null }> =>
    run('mutation', api.projectTemplates.startPackage, { organizationId, packageId, data: defined(data) }),
};

export type SignoffKind = 'change_order' | 'affidavit';
export interface Signoff {
  id: string;
  kind: SignoffKind;
  name: string;
  number: string;
  status: 'sent' | 'signed' | 'cancelled';
  token: string;
  changes?: Array<{ description: string; before?: number; after?: number }>;
  previousTotal?: number;
  newTotal?: number;
  completionDate?: string;
  signerName?: string;
  signedAt?: string;
  createdAt: string;
  documentName: string;
}

/** Change orders and the affidavit of completion, signed by the client after the estimate. */
export const signoffsAPI = {
  forEstimate: (estimateId: string): Promise<Signoff[]> => run('query', api.signoffs.forEstimate, { estimateId }),
  request: (estimateId: string, kind: SignoffKind, completionDate?: string): Promise<Signoff> =>
    run('mutation', api.signoffs.request, defined({ estimateId, kind, completionDate })),
  cancel: (id: string) => run('mutation', api.signoffs.cancel, { id }),
  // The client's page (no sign-in).
  get: (token: string) => run('query', api.signoffs.get, { token }),
  sign: (token: string, signerName: string, signature: string, agreedToDocument?: boolean) =>
    run('mutation', api.signoffs.sign, defined({ token, signerName, signature, agreedToDocument })),
  setLanguage: (token: string, language: 'en' | 'es') => run('mutation', api.signoffs.setLanguage, { token, language }),
};

/** What the client picked for an allowance, and how far over (+) or under (−) it comes to. */
export interface AllowancePick {
  id?: string;
  /** Absent while the client is only asked. */
  url?: string;
  name?: string;
  /** Per unit of the line, as the client typed it. */
  unitPrice?: number;
  note?: string;
  /** asked: waiting for the client; picked: theirs to approve; approved: the line has its price. */
  status: 'asked' | 'picked' | 'approved';
  askedAt?: string;
  /** Waiting for the next send from the portal preview. */
  queued?: boolean;
  /** The company entered it itself. */
  entered?: boolean;
  pickedAt?: string;
  approvedAt?: string;
  approvedUnitPrice?: number;
  difference?: number;
}
/** An allowance line: what's included for it, when to pick by, and the client's pick. */
export interface Allowance {
  itemId: string;
  description: string;
  category?: string;
  quantity: number;
  allowanceUnitPrice: number;
  allowanceTotal: number;
  pickBy?: string;
  pick?: AllowancePick;
}

/** One signed estimate on a project and its allowance lines. */
export interface EstimateSelections {
  estimateId: string;
  estimateNumber: string;
  title?: string;
  allowances: Allowance[];
  /** How far the approved picks come to over (+) or under (−) their allowances. */
  picksDifference: number;
  /** Everything changed since the client last signed. */
  changes: number;
  changeOrderQueued: boolean;
  /** A change order sent and waiting for the client's signature. */
  changeOrderWaiting: boolean;
}

/** Selections on the project: the client picks the product (or the company enters it), the company approves it at a price. */
export const selectionsAPI = {
  forProject: (projectId: string): Promise<EstimateSelections[]> => run('query', api.selections.forProject, { projectId }),
  setPickBy: (estimateId: string, itemId: string, pickBy: string | null): Promise<null> =>
    run('mutation', api.selections.setPickBy, { estimateId, itemId, pickBy }),
  ask: (estimateId: string, itemId: string): Promise<null> => run('mutation', api.selections.ask, { estimateId, itemId }),
  unqueue: (estimateId: string, itemId: string): Promise<null> => run('mutation', api.selections.unqueue, { estimateId, itemId }),
  queueChangeOrder: (estimateId: string): Promise<null> => run('mutation', api.selections.queueChangeOrder, { estimateId }),
  unqueueChangeOrder: (estimateId: string): Promise<null> => run('mutation', api.selections.unqueueChangeOrder, { estimateId }),
  record: (estimateId: string, itemId: string, pick: { url?: string; name?: string; unitPrice: number; note?: string }): Promise<null> =>
    run('mutation', api.selections.record, defined({ estimateId, itemId, ...pick })),
  approve: (id: string, unitPrice: number): Promise<null> => run('mutation', api.selections.approve, { id, unitPrice }),
  reopen: (id: string): Promise<null> => run('mutation', api.selections.reopen, { id }),
};

/** One open ask on the client's portal: sign something, or pick something. */
export type PortalAsk =
  | { kind: 'estimate'; at: string; number: string; title?: string; total: number; path: string }
  | {
      kind: 'change_order' | 'affidavit';
      at: string;
      number: string;
      title?: string;
      difference?: number;
      path: string;
    }
  | {
      kind: 'selection';
      at: string;
      estimateId: string;
      itemId: string;
      description: string;
      quantity: number;
      allowanceUnitPrice: number;
      allowanceTotal: number;
      pickBy?: string;
      pick?: { url?: string; name?: string; unitPrice?: number; note?: string; status: 'picked' };
    };
export interface PortalView {
  client: { name: string; language: 'en' | 'es' };
  company?: { name: string; phone?: string; email?: string; logoUrl?: string };
  asks: PortalAsk[];
  jobs: Array<{
    key: string;
    name: string;
    total: number;
    documents: Array<{ kind: 'estimate' | 'change_order' | 'affidavit'; number: string; signedAt?: string; path?: string }>;
    selections: Array<{ description: string; name?: string; url?: string }>;
    /** From the job's project: where it stands and its steps (no notes or crew). */
    status?: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
    startDate?: string;
    endDate?: string;
    steps?: Array<{ title: string; start?: string; end?: string; done: boolean }>;
    /** Once the job-complete sign-off is signed: the home file's warranty and what they've asked to be fixed. */
    completed?: {
      at: string;
      warranty?: string;
      warrantyEnds?: string;
      requests: Array<{ note: string; requestedAt: string; done: boolean }>;
    };
  }>;
  /** What the client gets back once a job is done: a referral link (reward if set) and a review ask (when there's a review link). */
  perks?: {
    reviewUrl?: string;
    referral?: { reward?: string; code?: string; referred: number; earned: number };
  };
}

/** A purchase order on a project: what's bought from one supplier or sub, at the company's cost. */
export interface PoLine {
  _id?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitCost: number;
  kind: 'material' | 'labor';
}
export interface PurchaseOrder {
  id: string;
  number: string;
  title: string;
  vendor?: { name: string; phone?: string; email?: string };
  lines: PoLine[];
  total: number;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  neededBy?: string;
  deliverTo?: string;
  notes?: string;
  shareToken?: string;
  orderedAt?: string;
  receivedAt?: string;
  receivedAmount?: number;
}
export interface ProjectOrders {
  orders: PurchaseOrder[];
  /** Ordered, not yet received. */
  committed: number;
  received: number;
}
/** The vendor's page for a PO (no sign-in). */
export interface VendorPurchaseOrder {
  company?: { name: string; phone?: string; email?: string; logoUrl?: string };
  number: string;
  title: string;
  vendor?: { name: string; phone?: string; email?: string };
  job?: string;
  orderedAt?: string;
  neededBy?: string;
  deliverTo?: string;
  notes?: string;
  status: 'ordered' | 'received';
  lines: Array<{ description: string; quantity: number; unit?: string; unitCost: number }>;
  total: number;
}

export const purchaseOrdersAPI = {
  forProject: (projectId: string): Promise<ProjectOrders> => run('query', api.purchaseOrders.forProject, { projectId }),
  create: (projectId: string, title: string): Promise<string> => run('mutation', api.purchaseOrders.create, { projectId, title }),
  update: (
    id: string,
    patch: { title?: string; vendor?: { name: string; phone?: string; email?: string }; lines?: PoLine[]; neededBy?: string; deliverTo?: string; notes?: string },
  ): Promise<PurchaseOrder> => run('mutation', api.purchaseOrders.update, defined({ id, ...patch })),
  remove: (id: string): Promise<null> => run('mutation', api.purchaseOrders.remove, { id }),
  buildFromEstimate: (projectId: string): Promise<number> => run('mutation', api.purchaseOrders.buildFromEstimate, { projectId }),
  /** Ordered, and its vendor link's token to share. */
  markOrdered: (id: string): Promise<string> => run('mutation', api.purchaseOrders.markOrdered, { id }),
  markReceived: (id: string, amount: number): Promise<string> => run('mutation', api.purchaseOrders.markReceived, { id, amount }),
  reopen: (id: string): Promise<null> => run('mutation', api.purchaseOrders.reopen, { id }),
  cancel: (id: string): Promise<null> => run('mutation', api.purchaseOrders.cancel, { id }),
  get: (token: string): Promise<VendorPurchaseOrder | null> => run('query', api.purchaseOrders.get, { token }),
};

/** A PO's address for its vendor. */
export const purchaseOrderUrl = (token: string) => `${window.location.origin}/po/${token}`;

/** A client's referrals as the company sees them (on the client's page). */
export interface ClientReferrals {
  reward: string | null;
  referrals: Array<{ leadId: string; name: string; status: string; createdAt: string; earned: boolean; paidAt?: string }>;
}

/** Referrals: the friend's page (no sign-in) and the company's side. */
export const referralsAPI = {
  get: (code: string): Promise<{ referrer: string; company: { name: string; phone?: string; logoUrl?: string } } | null> =>
    run('query', api.referrals.get, { code }),
  submit: (code: string, details: { name: string; phone?: string; email?: string; address?: string; note?: string; language?: string }): Promise<null> =>
    run('mutation', api.referrals.submit, defined({ code, ...details })),
  forClient: (clientId: string): Promise<ClientReferrals> => run('query', api.referrals.forClient, { clientId }),
  markPaid: (leadId: string, paid: boolean): Promise<null> => run('mutation', api.referrals.markPaid, { leadId, paid }),
};

/** A referral link's address. */
export const referralUrl = (code: string) => `${window.location.origin}/r/${code}`;

/** The client portal: one private link per client with everything for their jobs. */
export const portalAPI = {
  current: (clientId: string): Promise<string | null> => run('query', api.portal.current, { clientId }),
  link: (clientId: string): Promise<string> => run('mutation', api.portal.link, { clientId }),
  turnOff: (clientId: string): Promise<null> => run('mutation', api.portal.turnOff, { clientId }),
  /** Whose portal a project's is, and how much is waiting for the next send. */
  forProject: (projectId: string): Promise<{ clientId: string; name: string; language: 'en' | 'es'; token: string | null; queued: number } | null> =>
    run('query', api.portal.forProject, { projectId }),
  /** The client's portal exactly as they see it now, its link, and how much waits for the next send. */
  preview: (clientId: string): Promise<PortalView & { token: string | null; queued: number }> => run('query', api.portal.preview, { clientId }),
  /** Sends what's waiting: the picks go onto the portal, the change orders are made. */
  send: (clientId: string): Promise<{ token: string; picks: Array<{ description: string; pickBy?: string }>; changeOrders: number }> =>
    run('mutation', api.portal.send, { clientId }),
  // The client's side (no sign-in).
  get: (token: string): Promise<PortalView | null> => run('query', api.portal.get, { token }),
  pick: (token: string, estimateId: string, itemId: string, pick: { url: string; name?: string; unitPrice?: number; note?: string }): Promise<null> =>
    run('mutation', api.portal.pick, defined({ token, estimateId, itemId, ...pick })),
  setLanguage: (token: string, language: 'en' | 'es') => run('mutation', api.portal.setLanguage, { token, language }),
  /** The client's referral code, made the first time they share it. */
  shareReferral: (token: string): Promise<string> => run('mutation', api.portal.shareReferral, { token }),
  requestWarranty: (token: string, jobKey: string, note: string): Promise<null> => run('mutation', api.portal.requestWarranty, { token, jobKey, note }),
};

/** The portal's address for a token. */
export const portalUrl = (token: string) => `${window.location.origin}/portal/${token}`;

export const estimatesAPI = {
  async list(organizationId: string, filters?: { clientId?: string; status?: string }) {
    return run('query', api.estimates.list, defined({ organizationId, clientId: filters?.clientId, status: filters?.status }));
  },

  async getById(id: string) {
    return run('query', api.estimates.get, { id });
  },

  /** How much of the price the client's link shows: every line and price, the lines without prices, or only the totals by category. */
  setClientDetail(id: string, detail: 'full' | 'lines' | 'categories'): Promise<null> {
    return run('mutation', api.estimates.setClientDetail, { id, detail });
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
  /** Accepts the estimate for the client without their signature. */
  async approve(id: string) {
    return run('mutation', api.estimates.approve, { id });
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

  /** Emails the estimate's link to its client, from the company, and marks it sent. */
  async emailToClient(id: string, message?: string): Promise<{ to: string; link: string }> {
    return run('mutation', api.estimateEmail.email, defined({ id, message }));
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

  /** The client flipped the page's language; remembered on their record. */
  setLanguage: (token: string, language: 'en' | 'es') => run('mutation', api.publicEstimates.setLanguage, { token, language }),
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
    return run(
      'query',
      api.activityLogs.list,
      defined({
        organizationId,
        userId: filters?.userId,
        resourceType: filters?.resourceType,
        limit: filters?.limit,
      }),
    );
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
  async list(
    organizationId: string,
    filters?: {
      costCodeId?: string;
      category?: string;
      search?: string;
      isActive?: boolean;
      includeShared?: boolean;
    },
  ) {
    return run(
      'query',
      api.lineItems.list,
      defined({
        organizationId,
        costCodeId: filters?.costCodeId,
        category: filters?.category,
        search: filters?.search,
        isActive: filters?.isActive,
        includeShared: filters?.includeShared,
      }),
    );
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
  async list(filters?: { industryId?: string; category?: string; isActive?: boolean }) {
    return run(
      'query',
      api.costCodes.list,
      defined({
        industryId: filters?.industryId,
        category: filters?.category,
        isActive: filters?.isActive,
      }),
    );
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
  logContact: (id: string, kind: 'call' | 'text' | 'note', note?: string) => run('mutation', api.leads.logContact, defined({ id, kind, note })),
  /** "Got it, calling now" on a lead Webb Leads sent. Returns when it was acknowledged. */
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
  setCompanyOwner: (organizationId: string, email: string) => run('mutation', api.marketplace.setCompanyOwner, { organizationId, email }),
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
  /** The owner credits a bought lead back without a request: the company told Webb Leads by phone. */
  creditLead: (orgLeadId: string, reason: string, note?: string): Promise<{ amountCents: number }> =>
    run('mutation', api.marketplace.creditLead, defined({ orgLeadId, reason, note })),
};

export const walletAPI = {
  get: (organizationId: string) => run('query', api.marketplace.wallet, { organizationId }),
  feed: (organizationId: string) => run('query', api.marketplace.feed, { organizationId }),
  buy: (leadId: string, organizationId: string) => run('mutation', api.marketplace.buy, { leadId, organizationId }),
  /** A standing offer: buys the lead on its own once its price drops to `max` dollars. */
  placeBid: (leadId: string, organizationId: string, max: number) => run('mutation', api.marketplace.placeBid, { leadId, organizationId, max }),
  cancelBid: (bidId: string) => run('mutation', api.marketplace.cancelBid, { bidId }),
  bids: (organizationId: string) => run('query', api.marketplace.bids, { organizationId }),
  requestCredit: (leadId: string, reason: string, note?: string) => run('mutation', api.marketplace.requestCredit, defined({ leadId, reason, note })),
  /** Older leads: Marketplace leads nobody bought in a week, for companies on the plan. */
  olderLeads: (organizationId: string) => run('query', api.marketplace.olderLeads, { organizationId }),
  claim: (leadId: string, organizationId: string) => run('mutation', api.marketplace.claim, { leadId, organizationId }),
  /** The monthly plan, paid from the lead balance. */
  ensurePlan: (organizationId: string) => run('mutation', api.marketplace.ensurePlan, { organizationId }),
  startPlan: (organizationId: string): Promise<PlanSummary & { chargedCents: number }> =>
    run('mutation', api.marketplace.startPlan, { organizationId }),
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

/** Ads on autopilot: the library, hooks, settings and each week's batch (staff). */
export const adsAPI = {
  uploadUrl: (): Promise<string> => run('mutation', api.ads.uploadUrl, {}),
  addAsset: (args: {
    storageId: string;
    fileName: string;
    tags: string[];
    pairKey?: string;
    note?: string;
    durationSec?: number;
    posterStorageId?: string;
  }) => run('mutation', api.ads.addAsset, defined(args)),
  tagAsset: (id: string, tags: string[], pairKey?: string, note?: string) => run('mutation', api.ads.tagAsset, defined({ id, tags, pairKey, note })),
  removeAsset: (id: string) => run('mutation', api.ads.removeAsset, { id }),
  saveHook: (args: { id?: string; family: string; scope: string; trade: string; textEn: string; active: boolean }) =>
    run('mutation', api.ads.saveHook, defined(args)),
  removeHook: (id: string) => run('mutation', api.ads.removeHook, { id }),
  seedHooks: (): Promise<number> => run('mutation', api.ads.seedHooks, {}),
  seedSwipes: (): Promise<number> => run('mutation', api.ads.seedSwipes, {}),
  importSwipes: (rows: Record<string, unknown>[], source: string): Promise<{ added: number; updated: number }> =>
    run('mutation', api.ads.importSwipes, { rows: rows.map((r) => defined(r)), source }),
  starSwipe: (id: string, starred: boolean) => run('mutation', api.ads.starSwipe, { id, starred }),
  researchNow: () => run('mutation', api.ads.researchNow, {}),
  savePlaybook: (scope: string, text: string) => run('mutation', api.ads.savePlaybook, { scope, text }),
  rewritePlaybook: (scope?: string) => run('mutation', api.ads.rewritePlaybook, defined({ scope })),
  removeSwipe: (id: string) => run('mutation', api.ads.removeSwipe, { id }),
  saveSettings: (args: Record<string, unknown>) => run('mutation', api.ads.saveSettings, defined(args)),
  draftNow: () => run('mutation', api.ads.draftNow, {}),
  activate: (id: string) => run('mutation', api.ads.activate, { id }),
  retire: (id: string) => run('mutation', api.ads.retire, { id }),
  reject: (id: string) => run('mutation', api.ads.reject, { id }),
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

/** Webb Leads callers: the dial check, call outcomes, call lists and the tally. */
export const callsAPI = {
  tally: (days?: number) => run('query', api.calls.tally, defined({ days })),
  check: (phone: string) => run('query', api.calls.check, { phone }),
  log: (args: {
    phone: string;
    outcome: string;
    address: string;
    parcelId?: string;
    owner?: string;
    trade?: string;
    note?: string;
    callbackAt?: string;
  }) => run('mutation', api.calls.log, defined(args)),
  list: (args: { kind: 'trade_permits' | 'recent_buyers' | 'street'; trade?: string; street?: string }) =>
    run('query', api.calls.list, defined(args)),
  myDay: () => run('query', api.calls.myDay, {}),
  takeLead: (args: {
    parcelId?: string;
    phone: string;
    name: string;
    address: string;
    zip?: string;
    jobType: string;
    scope?: string;
    timeline?: string;
    notes?: string;
    isOwner: boolean;
    consented: boolean;
  }) => run('mutation', api.calls.takeLead, defined(args)),
};

/** Midland's monthly courthouse foreclosure auction, kept by hand in Ops. */
export const foreclosuresAPI = {
  sale: (saleDate?: string) => run('query', api.foreclosures.sale, defined({ saleDate })),
  addMany: (saleDate: string, kind: 'mortgage' | 'tax', addresses: string) =>
    run('mutation', api.foreclosures.addMany, { saleDate, kind, addresses }),
  update: (args: {
    id: string;
    status?: string;
    buyer?: { name: string; company: boolean; phone?: string };
    salePriceCents?: number;
    note?: string;
  }) => run('mutation', api.foreclosures.update, defined(args)),
  remove: (id: string) => run('mutation', api.foreclosures.remove, { id }),
};

/** Motivated-seller lists: Midland homes stacked by public-record signals (staff). */
export const sellersAPI = {
  sellers: (args: { lists?: string[]; minLists?: number; limit?: number }) => run('query', api.signals.sellers, defined(args)),
  /** One page of every home matching the filters, for the CSV; read until isDone. */
  exportPage: (args: { lists?: string[]; minLists?: number; cursor: string | null }) =>
    run(
      'query',
      api.signals.sellersExport,
      defined({ lists: args.lists, minLists: args.minLists, paginationOpts: { numItems: 400, cursor: args.cursor } }),
    ),
  home: (parcelId: string) => run('query', api.signals.home, { parcelId }),
  status: () => run('query', api.signals.status, {}),
  syncNow: () => run('action', api.signals.syncNow, {}),
};

/** The Webb Report: a county's week in permits, builders, demand and sales (Pro adds the names). */
export const reportAPI = {
  get: (organizationId: string, opts: { county?: string; trade?: string } = {}) =>
    run('query', api.report.report, defined({ organizationId, county: opts.county, trade: opts.trade })),
};

// ---- Outreach ----

export type OutreachWho = 'investor' | 'builder' | 'manager' | 'commercial' | 'portfolio' | 'multifamily' | 'wealthy' | 'recent_buyer' | 'absentee' | 'long_owned' | 'violation' | 'stalled' | 'contractor' | 'designer' | 'occupant' | 'realtor' | 'custom';
export type OutreachDefinition = {
  county: string;
  who: OutreachWho;
  useCodes?: string[];
  minValueCents?: number;
  maxValueCents?: number;
  minParcels?: number;
  /** At least this many homes they rent out. */
  minRentals?: number;
  ownerOccupied?: boolean;
  companyOwned?: boolean;
  outOfState?: boolean;
  zips?: string[];
  streets?: string[];
  deedWithinDays?: number;
  ownedForDays?: number;
  trades?: string[];
  withinDays?: number;
  limit?: number;
};
export type OutreachMailing = { address?: string; city?: string; state?: string; zip?: string };
/** New, sent to Leads, or skipped; the others are earlier statuses some rows still have. */
export type OutreachRowStatus = 'new' | 'lead' | 'skip' | 'no_answer' | 'callback' | 'interested' | 'not_interested' | 'client' | 'sent' | 'done';
export type OutreachPhoneType = 'mobile' | 'landline' | 'voip' | 'unknown';
/** Whose line: the person's own, or the business's. */
export type OutreachPhoneLine = 'personal' | 'work';
/** line: personal or work, from the source and the carrier; litigator: the subscriber is a known TCPA litigator; grade: the checker's A to F for reaching someone on the line. */
export type OutreachPhone = { number: string; type: OutreachPhoneType; line?: OutreachPhoneLine; dnc?: boolean; verified?: boolean; score?: number; source: string; name?: string; litigator?: boolean; grade?: string };
/** nameMatch: whether the address belongs to the named person, by the contact check; grade: its A to F. */
export type OutreachEmail = { email: string; source: string; verified?: boolean; nameMatch?: boolean; grade?: string };
/** confirmedBy: other free sources that named the same person. */
export type OutreachPerson = { name: string; title?: string; address?: string; source: string; confirmedBy?: string[] };
export type OutreachField = 'phone' | 'email' | 'person' | 'research';
/** One enrichment cell: locked until asked for; running through the stack; found (phone: charged), none (free) or failed (free). */
/** One source's turn in a cell's waterfall, for the sheet's "How we found it". */
export type OutreachTry = { source: string; outcome: 'hit' | 'miss' | 'error' | 'skipped'; note?: string };
/** A running lookup's narration, kept apart from the owner: merged into its running cell on the page. */
export type OutreachProgress = { contactId: string; field: OutreachField; asking?: string; tries: OutreachTry[] };
export type OutreachCell = { status: 'locked' | 'running' | 'found' | 'none' | 'failed'; at?: string; /** Who asked for the lookup; none on what a permit or license gave free when the list was built. */ requestedBy?: string; source?: string; chargedCents?: number; error?: string; tries?: OutreachTry[]; /** While running: the source being asked now. */ asking?: string; /** Made up by the simulated chain while no phone source is connected; never charged. */ simulated?: boolean };
export type OutreachEnrichment = Record<OutreachField, OutreachCell>;
/** What the AI found on the web about an owner, with where it read it. */
export type OutreachResearch = { question: string; answer: string; sources: Array<{ title: string; url: string }>; at: string };
export type OutreachSignal = { kind: 'code_violation' | 'dilapidated' | 'demolition' | 'stalled_permit'; date: string; detail: string; /** First seen in the last week. */ fresh?: boolean };
/** One owner in a company's CRM: pulled by one or more lists, with what the company has paid to learn. */
export type OutreachContact = {
  id: string;
  key: string;
  name: string;
  company?: string;
  mailing: OutreachMailing;
  /** Absent for a realtor, who owns nothing here. */
  property?: { parcelId: string; address: string; useCode: string; valueCents?: number };
  properties: number;
  totalValueCents: number;
  why: string;
  kinds: OutreachWho[];
  listIds: string[];
  status: OutreachRowStatus;
  note?: string;
  /** The lead they became on the Leads page. */
  leadId?: string;
  /** Where that lead stands in Leads (new, contacted, quoted, won…). */
  leadStage?: string;
  phones: OutreachPhone[];
  emails: OutreachEmail[];
  person?: OutreachPerson;
  research?: OutreachResearch;
  enrichment: OutreachEnrichment;
  signals: OutreachSignal[];
  /** Sister entities of the same company family: likely one operator, sharing one lookup. */
  related?: Array<{ id: string; name: string }>;
  /** A client or lead the company already has for this owner, until it's sent: sending joins it rather than making another. */
  known?: { kind: 'client' | 'lead'; id: string; name: string };
  /** Where email outreach stands with them. */
  email?: { state: OwnerEmailState; at: string };
  createdAt: string;
};
/** An Outreach owner behind a lead, for the lead's drawer. */
export type OutreachOwnerOfLead = { id: string; name: string; why: string; properties: number; totalValueCents: number; address?: string };
export type OutreachPreviewRow = Pick<OutreachContact, 'key' | 'name' | 'company' | 'mailing' | 'property' | 'properties' | 'totalValueCents' | 'why'>;
export type OutreachListSummary = {
  id: string;
  title: string;
  who: OutreachWho;
  definition: OutreachDefinition;
  rowCount: number;
  done: number;
  truncated: boolean;
  /** How many owners the list's ask reaches (a floor when truncated); missing on lists saved before it was counted. */
  total?: number;
  /** What the list has turned into in Leads: owners sent, leads with an estimate, jobs sold. */
  results?: { sent: number; estimates: number; sold: number };
  createdAt: string;
  /** Kept at the top of the picker. */
  pinned?: boolean;
  /** Done with: tucked under Archived. */
  archived?: boolean;
  /** Nobody has worked it yet, so it can be deleted; a worked list is archived instead. */
  deletable?: boolean;
  /** The worked owners only this list holds: they stay when it goes, unless asked to go too. */
  worked?: number;
  /** Still adding owners in the background, right after it was saved. */
  filling?: boolean;
};
/** "12 / 200 · 2 sources" on a column header. */
export type OutreachCoverage = { found: number; total: number; sources: number };
export type OutreachContacts = {
  rows: OutreachContact[];
  coverage: Record<OutreachField, OutreachCoverage>;
  balanceCents: number;
  /** Phones the company can still find free: its first five found are on the house. */
  freeLookups?: number;
  unlockCents: number;
  researchCents: number;
  researchQuestion: string;
  /** The company's own phone hit rate so far, 0–1; undefined until it has tried. */
  phoneHitRate?: number;
  /** The latest send of two or more leads in the last day, for Undo: when, and how many leads are still there. */
  lastSend?: { at: string; leads: number } | null;
  /** How many owners are on no list: kept from deleted lists because they were worked. */
  unlisted?: number;
  /** Lookups are simulated (no phone source connected yet), and a simulated result counts as work. */
  simulating?: boolean;
  /** The company's working county (outreach.setCounty); every county switch on the page starts from it. */
  county?: string;
  /** The counties besides Midland whose owners are in, so lists can be built there. */
  readyCounties?: string[];
  /** The server's clock at this read: where the live feed (watchChanges) picks up. */
  asOf?: string;
  /** When owners were last removed from the company's Outreach; the feed says when it moves. */
  removedAt?: string;
};
/** The live feed's answer: the owners changed since a moment (without their related owners or client/lead match), or word to read the view again. */
export type OutreachChanges = {
  rows: OutreachContact[];
  balanceCents: number;
  freeLookups: number;
  removedAt?: string;
  /** More changed than one answer carries: read the view again. */
  reload: boolean;
  /** The latest change in this answer: a later listen can start from here. */
  upTo: string;
};
const contactsArgs = (organizationId: string, listId?: string) => (listId === UNLISTED ? { organizationId, unlisted: true } : defined({ organizationId, listId }));
/** A source in the stack, as staff see it: connected or not, and how it has done for this company. */
export type OutreachSource = {
  name: string;
  fields: OutreachField[];
  connected: boolean;
  /** problem: the source's last answer that needs a hand (a refused key, no credits), until it answers properly again. */
  stats: Array<{ field: OutreachField; attempts: number; hits: number; chargedCents: number; lastAt?: string; problem?: string; problemAt?: string }>;
};
/** count: what one list holds; total: how many owners the ask reaches (a floor when truncated). */
export type OutreachPreview = { count: number; total: number; truncated: boolean; limited: boolean; rows: OutreachPreviewRow[] };
export type OutreachInterpreted =
  | ({ ok: true; definition: OutreachDefinition; title: string; explanation: string; note?: string; preview: OutreachPreviewRow[] } & Omit<OutreachPreview, 'rows'>)
  | { ok: false; explanation: string; suggestion?: { definition: OutreachDefinition; title: string } };

/** Outreach: a CRM of property owners from the county roll, pulled by lists asked for in plain words (Pro). */
export type OwnerEmailState = 'drafted' | 'scheduled' | 'emailed' | 'replied' | 'opted_out';
export type MailboxInfo = {
  connected: { email: string; name?: string; dailyCap: number; connectedAt: string } | null;
  lost: { email: string; why: string } | null;
  /** What the server still needs before anyone can connect, in words. */
  setupMissing: string[];
  /** The company's postal address for the footer; null until it's filled in. */
  postal: string | null;
  /** Replies are caught and sent to Leads. */
  replies: boolean;
  today: number;
};
export type EmailStatus = 'draft' | 'waiting' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'paused';
export type CampaignEmail = { id: string; step: number; subject: string; body: string; status: EmailStatus; writing: boolean; sendAt?: number; sentAt?: string; error?: string };
export type EmailCampaign = {
  id: string;
  status: 'drafting' | 'review' | 'sending' | 'done' | 'cancelled';
  followUps: number[];
  owners: Array<{ contactId: string; name: string; company?: string; property?: string; to: string; sample: boolean; replied: boolean; emails: CampaignEmail[] }>;
  writing: number;
  mailbox: { email: string; dailyCap: number } | null;
  postal: string | null;
  footer: string;
  schedule: { first: number; last: number; days: number } | null;
};
export type OwnerEmails = {
  state?: OwnerEmailState;
  replyText?: string;
  repliedAt?: string;
  emails: Array<{ id: string; step: number; to: string; subject: string; body: string; status: EmailStatus; sendAt?: number; sentAt?: string; sample: boolean; error?: string }>;
};

/** Email outreach from the company's own Gmail (convex/emailOutreach.ts). */
export const emailAPI = {
  mailbox: (organizationId: string): Promise<MailboxInfo> => run('query', api.emailOutreach.mailbox, { organizationId }),
  watchMailbox: (organizationId: string, onUpdate: (m: MailboxInfo) => void, onError?: (e: APIError) => void) => watchOn(api.emailOutreach.mailbox, { organizationId }, onUpdate, onError),
  connect: (organizationId: string, returnTo: string): Promise<string> => run('mutation', api.emailOutreach.connectGmail, { organizationId, returnTo }),
  disconnect: (organizationId: string): Promise<null> => run('mutation', api.emailOutreach.disconnect, { organizationId }),
  setDailyCap: (organizationId: string, dailyCap: number): Promise<null> => run('mutation', api.emailOutreach.setDailyCap, { organizationId, dailyCap }),
  check: (organizationId: string, contactIds: string[]): Promise<{ count: number; sample: number; skipped: string[] }> => run('query', api.emailOutreach.check, { organizationId, contactIds }),
  start: (organizationId: string, contactIds: string[], followUps: boolean): Promise<{ campaignId: string | null; count: number; skipped: string[]; more: number }> =>
    run('mutation', api.emailOutreach.start, { organizationId, contactIds, followUps }),
  watchCampaign: (organizationId: string, campaignId: string, onUpdate: (c: EmailCampaign) => void, onError?: (e: APIError) => void) =>
    watchOn(api.emailOutreach.campaign, { organizationId, campaignId }, onUpdate, onError),
  edit: (organizationId: string, emailId: string, change: { subject?: string; body?: string }): Promise<null> => run('mutation', api.emailOutreach.editDraft, defined({ organizationId, emailId, ...change })),
  removeOwner: (organizationId: string, campaignId: string, contactId: string): Promise<null> => run('mutation', api.emailOutreach.removeOwner, { organizationId, campaignId, contactId }),
  discard: (organizationId: string, campaignId: string): Promise<null> => run('mutation', api.emailOutreach.discard, { organizationId, campaignId }),
  approve: (organizationId: string, campaignId: string): Promise<{ count: number; first: number; last: number }> => run('mutation', api.emailOutreach.approve, { organizationId, campaignId }),
  watchOwner: (organizationId: string, contactId: string, onUpdate: (e: OwnerEmails | null) => void, onError?: (e: APIError) => void) =>
    watchOn(api.emailOutreach.ofOwner, { organizationId, contactId }, onUpdate, onError),
};

export const outreachAPI = {
  lists: (organizationId: string): Promise<OutreachListSummary[]> => run('query', api.outreach.lists, { organizationId }),
  /** Every contact, or those on one list, with the balance for unlocks. */
  contacts: (organizationId: string, listId?: string): Promise<OutreachContacts> => run('query', api.outreach.contacts, contactsArgs(organizationId, listId)),
  /** The contacts, now and on every change: a lookup's progress, a status set elsewhere. Returns a stop function. */
  watchContacts: (organizationId: string, listId: string | undefined, onUpdate: (c: OutreachContacts) => void, onError?: (e: APIError) => void): (() => void) =>
    watchOn(api.outreach.contacts, contactsArgs(organizationId, listId), onUpdate, onError),
  /** The owners changed since a moment, now and on every change: the page reads its view once, then listens here. Returns a stop function. */
  watchChanges: (organizationId: string, since: string, onUpdate: (c: OutreachChanges) => void, onError?: (e: APIError) => void): (() => void) =>
    watchOn(api.outreach.changes, { organizationId, since }, onUpdate, onError),
  /** The company's running lookups as they go (the source asked now, the turns so far), now and on every change. Returns a stop function. */
  watchProgress: (organizationId: string, onUpdate: (p: OutreachProgress[]) => void, onError?: (e: APIError) => void): (() => void) =>
    watchOn(api.outreach.progress, { organizationId }, onUpdate, onError),
  /** The lists, now and on every change. Returns a stop function. */
  watchLists: (organizationId: string, onUpdate: (l: OutreachListSummary[]) => void, onError?: (e: APIError) => void): (() => void) =>
    watchOn(api.outreach.lists, { organizationId }, onUpdate, onError),
  /** county: the page's working county; the list is of it. */
  interpret: (organizationId: string, request: string, county?: string): Promise<OutreachInterpreted> =>
    run('action', api.outreach.interpret, defined({ organizationId, request, county })),
  /** The company's working county, for every device. */
  setCounty: (organizationId: string, county: string) => run('mutation', api.outreach.setCounty, { organizationId, county }),
  preview: (organizationId: string, definition: OutreachDefinition): Promise<OutreachPreview> =>
    run('query', api.outreach.preview, { organizationId, definition }),
  create: (organizationId: string, definition: OutreachDefinition, title?: string): Promise<{ listId: string; rowCount: number; added: number; truncated: boolean }> =>
    run('mutation', api.outreach.create, defined({ organizationId, definition, title })),
  /** Skip or un-skip, and the note; no note sent keeps the one there. */
  setStatus: (organizationId: string, contactId: string, status: OutreachRowStatus, note?: string) =>
    run('mutation', api.outreach.setStatus, defined({ organizationId, contactId, status, note })),
  /** Sends many owners to Leads at once (up to 500); owners run by the same people share one lead. */
  sendManyToLeads: (organizationId: string, contactIds: string[]): Promise<{ sent: number; leads: number; joined: number }> =>
    run('mutation', api.outreach.sendManyToLeads, { organizationId, contactIds }),
  /** Takes back one send to Leads: its leads still at New go, and their owners are New again here. */
  undoSend: (organizationId: string, at: string): Promise<{ removed: number; kept: number }> => run('mutation', api.outreach.undoSend, { organizationId, at }),
  /** Sends an owner to Leads (once); returns the lead's id. */
  sendToLeads: (organizationId: string, contactId: string): Promise<string> => run('mutation', api.outreach.sendToLeads, { organizationId, contactId }),
  /** The Outreach owners a lead came from: who, what they own and why they were picked. */
  ownersOfLead: (organizationId: string, leadId: string): Promise<OutreachOwnerOfLead[]> => run('query', api.outreach.ownersOfLead, { organizationId, leadId }),
  /** alsoWorked: the worked owners only this list holds go too (all but leads and clients). */
  remove: (organizationId: string, listId: string, alsoWorked?: boolean) => run('mutation', api.outreach.remove, defined({ organizationId, listId, alsoWorked })),
  /** The owners on no list (or just contactIds of them) removed; those now a lead or a client stay. */
  removeUnlisted: (organizationId: string, contactIds?: string[]): Promise<{ removed: number; kept: number }> =>
    run('mutation', api.outreach.removeUnlisted, defined({ organizationId, contactIds })),
  organizeList: (organizationId: string, listId: string, change: { title?: string; pinned?: boolean; archived?: boolean }) =>
    run('mutation', api.outreach.organizeList, defined({ organizationId, listId, ...change })),
  /** Loads the next page of a list that reached its cap. */
  extend: (organizationId: string, listId: string): Promise<{ loaded: number; added: number; rowCount: number; total: number; truncated: boolean }> =>
    run('mutation', api.outreach.extend, { organizationId, listId }),
  /** Queues the stack for each contact and field (all three unless given); $1 a phone from the balance, charged only when found. */
  enrich: (organizationId: string, contactIds: string[], fields?: OutreachField[], question?: string): Promise<{ queued: number; costCents: number; at?: string }> =>
    run('mutation', api.outreach.enrich, defined({ organizationId, contactIds, fields, question })),
  /** Staff: the stack in order, with this company's hit rates and spend. */
  sources: (organizationId: string): Promise<OutreachSource[]> => run('query', api.outreach.sources, { organizationId }),
  /** Staff: when the owners were last grouped, from how many parcels, and when the daily records pass last ran; a rebuild and a pass on demand. */
  status: (): Promise<{ syncedAt: string; parcels: number; owners: number; error?: string; records?: { at: string; touched: number; error?: string } } | null> => run('query', api.outreach.status, {}),
  rebuild: (): Promise<{ fetched: number; added: number; updated: number; error?: string }> => run('action', api.outreachRebuild.rebuildNow, {}),
  refresh: (): Promise<{ skipped?: true; fetched: number; added: number; updated: number; error?: string }> => run('action', api.outreachRefresh.refreshNow, {}),
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

/** Claude and ChatGPT connected to Webb Leads: approving a connection and managing them in Settings. */
export const assistantsAPI = {
  request: (clientId: string, redirectUri: string): Promise<AssistantRequest> => run('query', api.oauth.request, { clientId, redirectUri }),
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
  update: (id: string, spending: boolean, dailyCap?: number) => run('mutation', api.oauth.updateConnection, defined({ id, spending, dailyCap })),
  disconnect: (id: string) => run('mutation', api.oauth.disconnect, { id }),
};

export type OfficeLineSettings = {
  on: boolean;
  briefAt?: string;
  allowSpend: boolean;
  notes: string;
  canEdit: boolean;
  myMobile?: string;
  lineNumber?: string;
  ready: { texting: boolean; assistant: boolean };
};

export type OfficeLineRow = {
  id: string;
  at: string;
  direction: 'in' | 'out' | 'internal';
  kind: 'message' | 'action' | 'ask' | 'brief' | 'error';
  text: string;
  ask?: { id: string; number: number; status: 'pending' | 'done' | 'declined' | 'expired' | 'failed'; result?: string };
};

/** The office line: the owner texts Webb Leads and an agent works the company, asking before it sends or spends. */
export const officeLineAPI = {
  get: (organizationId: string): Promise<OfficeLineSettings> => run('query', api.agent.settings, { organizationId }),
  set: (organizationId: string, changes: { on?: boolean; briefAt?: string | null; allowSpend?: boolean; notes?: string }) =>
    run('mutation', api.agent.configure, defined({ organizationId, ...changes })),
  log: (organizationId: string): Promise<OfficeLineRow[]> => run('query', api.agent.log, { organizationId }),
  answer: (organizationId: string, askId: string, yes: boolean) => run('mutation', api.agent.answer, { organizationId, askId, yes }),
  test: (organizationId: string) => run('mutation', api.agent.test, { organizationId }),
};

export { APIError };

// ---- Recruiting (National Sales Registry): Jordan the SMS screener and the recruiting ads. Staff only. ----

export type RecruitClientInput = {
  name: string;
  role: string;
  city: string;
  compSheet: string;
  calEventLink: string;
  calEventTypeId?: number;
  timezone: string;
  reportEmail?: string;
  territory?: string;
  repStories?: string[];
  perks?: string;
  wants?: string;
  adsEnabled?: boolean;
  active?: boolean;
};
export type RecruitBilling = { monthlyCents: number; perHireCents: number; status: 'none' | 'link_sent' | 'active' | 'past_due' | 'canceled'; link?: string; since?: string };
export type RecruitClient = RecruitClientInput & { id: string; active: boolean; applicants: number; A: number; hired: number; createdAt: string; slug: string; hiresToken?: string; demo?: boolean; billing?: RecruitBilling; billedHiresThisMonth?: number };
export type RecruitScore = 'A' | 'B' | 'C';
export type RecruitOutcome = 'hired' | 'not_hired';
export type RecruitApplicant = {
  id: string;
  name: string;
  phone: string;
  clientId: string;
  client: string;
  sourceAdId: string;
  score?: RecruitScore;
  status: string;
  notes?: string;
  answers: Record<string, string>;
  interviewAt?: string;
  outcome?: RecruitOutcome;
  createdAt: string;
  test: boolean;
  demo: boolean;
  replying: boolean;
  lastText: { direction: 'in' | 'out'; body: string; at: string } | null;
};
export type RecruitThread = { applicant: RecruitApplicant; messages: Array<{ id: string; direction: 'in' | 'out'; body: string; at: string; by?: string }> };
export type RecruitAdKind = 'hook' | 'meta_primary' | 'video_script' | 'indeed';
export type RecruitAdPerformance = {
  sourceAdId: string;
  kind?: RecruitAdKind;
  angle?: string;
  status?: string;
  applicants: number;
  A: number;
  aRate: number | null;
  booked: number;
  showRate: number | null;
  spendCents?: number;
  aPer100: number | null;
  hired: number;
  costPerHireCents: number | null;
};
export type RecruitAds = {
  clients: Array<{
    client: { id: string; name: string; adsEnabled: boolean; slug: string };
    writing: boolean;
    failed?: string;
    latest: { createdAt: string; learningNotes?: string; problems: string[]; variations: number; fresh: number } | null;
    drafts: Array<{ id: string; kind: RecruitAdKind; angle: string; title?: string; body: string; variationOf?: string; warnings: string[] }>;
    retire: Array<{ sourceAdId: string; reason: string }>;
    performance: RecruitAdPerformance[];
  }>;
  approved: Array<{ sourceAdId: string; client: string; slug: string; kind: RecruitAdKind; angle: string; title: string; body: string; approvedAt: string }>;
};
export type RecruitByAd = Array<{ sourceAdId: string; applicants: number; A: number; B: number; C: number; booked: number; showed: number; hired: number }>;
export type RecruitSetup = { applyUrl: string; smsWebhook: string; calWebhook: string; spendUrl: string; ready: { claude: boolean; number: boolean; applySecret: boolean; cal: boolean; flags: boolean; stripe?: boolean } };

export const recruitingAPI = {
  watchClients: (onUpdate: (c: RecruitClient[]) => void, onError?: (e: APIError) => void) => watchOn(api.recruiting.ops.clients, {}, onUpdate, onError),
  saveClient: (client: RecruitClientInput & { clientId?: string }): Promise<string> => run('mutation', api.recruiting.ops.saveClient, defined(client)),
  watchApplicants: (filter: { clientId?: string; status?: string; score?: string }, onUpdate: (a: RecruitApplicant[]) => void, onError?: (e: APIError) => void) =>
    watchOn(api.recruiting.ops.applicants, defined(filter), onUpdate, onError),
  watchThread: (applicantId: string, onUpdate: (t: RecruitThread | null) => void, onError?: (e: APIError) => void) => watchOn(api.recruiting.ops.thread, { applicantId }, onUpdate, onError),
  markAttendance: (applicantId: string, showed: boolean) => run('mutation', api.recruiting.ops.markAttendance, { applicantId, showed }),
  markOutcome: (applicantId: string, outcome: RecruitOutcome | null) => run('mutation', api.recruiting.ops.markOutcome, { applicantId, outcome }),
  reply: (applicantId: string, body: string) => run('action', api.recruiting.people.reply, { applicantId, body }),
  handBack: (applicantId: string) => run('mutation', api.recruiting.people.handBack, { applicantId }),
  watchTryIt: (onUpdate: (t: RecruitThread | null) => void, onError?: (e: APIError) => void) => watchOn(api.recruiting.ops.tryIt, {}, onUpdate, onError),
  tryItStart: (clientId: string, name?: string): Promise<string> => run('mutation', api.recruiting.ops.tryItStart, defined({ clientId, name })),
  tryItSend: (body: string): Promise<{ reply?: string }> => run('mutation', api.recruiting.ops.tryItSend, { body }),
  tryItReset: () => run('mutation', api.recruiting.ops.tryItReset, {}),
  watchAds: (onUpdate: (a: RecruitAds) => void, onError?: (e: APIError) => void) => watchOn(api.recruiting.ops.ads, {}, onUpdate, onError),
  decideAd: (adId: string, decision: 'approve' | 'reject'): Promise<string | null> => run('mutation', api.recruiting.ops.decideAd, { adId, decision }),
  approveClean: (clientId: string): Promise<string[]> => run('mutation', api.recruiting.ops.approveClean, { clientId }),
  retireAd: (sourceAdId: string) => run('mutation', api.recruiting.ops.retireAd, { sourceAdId }),
  setSpend: (sourceAdId: string, dollars: number) => run('mutation', api.recruiting.ops.setSpend, { sourceAdId, dollars }),
  writeBatch: (clientId: string) => run('mutation', api.recruiting.ops.writeBatch, { clientId }),
  byAd: (days = 30): Promise<RecruitByAd> => run('query', api.recruiting.ops.byAd, { days }),
  setup: (): Promise<RecruitSetup> => run('query', api.recruiting.ops.setup, {}),
  demoSeed: () => run('mutation', api.recruiting.ops.demoSeed, {}),
  setPlan: (clientId: string, monthlyDollars: number, perHireDollars: number) => run('mutation', api.recruiting.billing.setPlan, { clientId, monthlyDollars, perHireDollars }),
  sendPaymentLink: (clientId: string): Promise<{ link: string; emailed: boolean }> => run('action', api.recruiting.billing.sendPaymentLink, { clientId }),
  demoLive: (): Promise<string> => run('mutation', api.recruiting.ops.demoLive, {}),
  demoClear: (): Promise<{ removed: number }> => run('mutation', api.recruiting.ops.demoClear, {}),
};

/** The public recruiting pages, no login: the apply page an ad links to, and a client's hires link. */
export type RecruitJob = { company: string; role: string; city: string; perks: string | null; service: string; consent: string };
export type RecruitHires = { company: string; role: string; reps: Array<{ id: string; name: string; score: RecruitScore | null; interviewAt: string | null; missed: boolean; outcome: RecruitOutcome | null }> };
export type RecruitSales = { service: string; monthly: number; perHire: number; bookingUrl: string | null; phone: string | null };
export const recruitingPublicAPI = {
  salesInfo: (): Promise<RecruitSales> => run('query', api.recruiting.public.salesInfo, {}),
  job: (slug: string): Promise<RecruitJob | null> => run('query', api.recruiting.public.job, { slug }),
  apply: (details: { slug: string; ad?: string; name: string; phone: string; agreed: boolean }): Promise<{ existing: boolean }> => run('mutation', api.recruiting.public.apply, defined(details)),
  watchHires: (token: string, onUpdate: (h: RecruitHires | null) => void, onError?: (e: APIError) => void) => watchOn(api.recruiting.public.hires, { token }, onUpdate, onError),
  setHire: (token: string, applicantId: string, outcome: RecruitOutcome | null) => run('mutation', api.recruiting.public.setHire, { token, applicantId, outcome }),
};
