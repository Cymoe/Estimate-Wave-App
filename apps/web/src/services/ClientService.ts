import { clientsAPI } from '../lib/api';
import { toLegacyClient } from './EstimateService';

export interface Client {
  id?: string;
  user_id?: string;
  organization_id?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  company_name?: string;
  website?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

/** A Convex client in the snake_case shape the client screens read. */
export function toClient(doc: Doc): Client {
  return {
    ...toLegacyClient(doc),
    user_id: doc.userId,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

/** The screens' snake_case fields as Convex client fields (empty strings clear a field). */
export function toConvexClient(client: Partial<Client>) {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value === undefined) return;
    out[key] = typeof value === 'string' && value.trim() === '' ? null : value;
  };
  set('name', client.name);
  set('email', client.email);
  set('phone', client.phone);
  set('companyName', client.company_name);
  set('address', client.address);
  set('city', client.city);
  set('state', client.state);
  set('zip', client.zip);
  set('notes', client.notes);
  return out;
}

/** Clients, stored in Convex. */
export class ClientService {
  static async list(organizationId: string): Promise<Client[]> {
    const docs = await clientsAPI.list(organizationId);
    return docs.map(toClient).sort((a: Client, b: Client) => a.name.localeCompare(b.name));
  }

  static async getById(id: string): Promise<Client | null> {
    try {
      return toClient(await clientsAPI.getById(id));
    } catch {
      return null;
    }
  }

  static async create(client: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client> {
    const doc = await clientsAPI.create({ organizationId: client.organization_id, ...toConvexClient(client) });
    return toClient(doc);
  }

  static async update(id: string, updates: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>): Promise<Client> {
    return toClient(await clientsAPI.update(id, toConvexClient(updates)));
  }

  static async delete(id: string): Promise<void> {
    await clientsAPI.delete(id);
  }
}
