import { useState, useEffect } from 'react';
import { clientsAPI } from '@/lib/api';

export interface Client {
  _id: string;
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook to manage clients with MongoDB backend
 * Replaces Supabase client queries
 */
export function useClients(organizationId: string) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clientsAPI.list(organizationId);
      setClients(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch clients');
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchClients();
    }
  }, [organizationId]);

  const createClient = async (clientData: Partial<Client>) => {
    try {
      const newClient = await clientsAPI.create(clientData);
      setClients(prev => [newClient, ...prev]);
      return newClient;
    } catch (err: any) {
      setError(err.message || 'Failed to create client');
      throw err;
    }
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    try {
      const updated = await clientsAPI.update(id, updates);
      setClients(prev => prev.map(client => client._id === id ? updated : client));
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to update client');
      throw err;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      await clientsAPI.delete(id);
      setClients(prev => prev.filter(client => client._id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete client');
      throw err;
    }
  };

  return {
    clients,
    loading,
    error,
    refetch: fetchClients,
    createClient,
    updateClient,
    deleteClient,
  };
}

