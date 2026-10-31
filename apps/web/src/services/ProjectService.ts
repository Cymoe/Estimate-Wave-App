import { clientsAPI, projectsAPI } from '../lib/api';

export type ProjectStatus = 'planned' | 'active' | 'on-hold' | 'completed' | 'cancelled';

export interface Project {
  id?: string;
  user_id?: string;
  organization_id?: string;
  name: string;
  description?: string;
  client_id?: string;
  status: ProjectStatus;
  start_date?: string;
  end_date?: string;
  budget?: number;
  category?: string;
  created_at?: string;
  updated_at?: string;
  client?: {
    id: string;
    name: string;
    company_name?: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

// The screens use the older status names; Convex stores its own.
const TO_CONVEX: Record<string, string> = {
  planned: 'planning',
  active: 'in_progress',
  'on-hold': 'on_hold',
  on_hold: 'on_hold',
  planning: 'planning',
  in_progress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
};
const FROM_CONVEX: Record<string, ProjectStatus> = {
  planning: 'planned',
  in_progress: 'active',
  on_hold: 'on-hold',
  completed: 'completed',
  cancelled: 'cancelled',
};

/** A Convex project in the snake_case shape the project screens read. */
export function toProject(doc: Doc, clients?: Map<string, Doc>): Project {
  const client = doc.clientId ? clients?.get(doc.clientId) : undefined;
  return {
    id: doc._id,
    user_id: doc.userId,
    organization_id: doc.organizationId,
    name: doc.name,
    description: doc.description,
    client_id: doc.clientId,
    status: FROM_CONVEX[doc.status] ?? 'planned',
    start_date: doc.startDate,
    end_date: doc.endDate,
    budget: doc.budget,
    category: doc.category,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    client: client ? { id: client._id, name: client.name, company_name: client.companyName } : undefined,
  };
}

/** The screens' snake_case fields as Convex project fields (empty values clear a field). */
export function toConvexProject(project: Partial<Project> & Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value === undefined) return;
    out[key] = value === '' ? null : value;
  };
  set('name', project.name);
  set('description', project.description);
  set('clientId', project.client_id);
  if (project.status !== undefined) out.status = TO_CONVEX[project.status] ?? 'planning';
  set('startDate', project.start_date);
  set('endDate', project.end_date);
  if (project.budget !== undefined) {
    const budget = Number(project.budget);
    out.budget = project.budget === null || (project.budget as unknown) === '' || !Number.isFinite(budget) ? null : budget;
  }
  set('category', project.category);
  return out;
}

async function clientsById(organizationId: string) {
  const clients: Doc[] = await clientsAPI.list(organizationId);
  return new Map(clients.map((client) => [client._id as string, client]));
}

/** Projects, stored in Convex. */
export class ProjectService {
  static async list(organizationId: string, filters?: { clientId?: string }): Promise<Project[]> {
    const [docs, clients] = await Promise.all([
      projectsAPI.list(organizationId, filters?.clientId ? { clientId: filters.clientId } : undefined),
      clientsById(organizationId),
    ]);
    return docs.map((doc: Doc) => toProject(doc, clients));
  }

  static async getById(id: string): Promise<Project | null> {
    let doc: Doc;
    try {
      doc = await projectsAPI.getById(id);
    } catch {
      return null;
    }
    return toProject(doc, await clientsById(doc.organizationId));
  }

  static async create(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    const doc = await projectsAPI.create({ organizationId: project.organization_id, ...toConvexProject(project) });
    return toProject(doc, await clientsById(doc.organizationId));
  }

  static async update(id: string, updates: Partial<Project>): Promise<Project> {
    const doc = await projectsAPI.update(id, toConvexProject(updates));
    return toProject(doc, await clientsById(doc.organizationId));
  }

  static async updateStatus(id: string, status: ProjectStatus): Promise<Project> {
    return this.update(id, { status });
  }

  static async delete(id: string): Promise<void> {
    await projectsAPI.delete(id);
  }
}
