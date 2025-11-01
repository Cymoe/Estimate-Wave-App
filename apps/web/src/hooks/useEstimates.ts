import { useState, useEffect } from 'react';
import { estimatesAPI } from '@/lib/api';

export interface EstimateItem {
  _id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  costCode?: string;
  displayOrder: number;
}

export interface Estimate {
  _id: string;
  userId: string;
  organizationId: string;
  clientId: string;
  projectId?: string;
  estimateNumber: string;
  title?: string;
  description?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  issueDate: string;
  expiryDate?: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  terms?: string;
  clientSignature?: string;
  signedAt?: string;
  items: EstimateItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook to manage estimates with MongoDB backend
 * Replaces Supabase estimate queries
 */
export function useEstimates(organizationId: string, filters?: {
  clientId?: string;
  status?: string;
}) {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEstimates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await estimatesAPI.list(organizationId, filters);
      setEstimates(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch estimates');
      console.error('Error fetching estimates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchEstimates();
    }
  }, [organizationId, filters?.clientId, filters?.status]);

  const createEstimate = async (estimateData: Partial<Estimate>) => {
    try {
      const newEstimate = await estimatesAPI.create(estimateData);
      setEstimates(prev => [newEstimate, ...prev]);
      return newEstimate;
    } catch (err: any) {
      setError(err.message || 'Failed to create estimate');
      throw err;
    }
  };

  const updateEstimate = async (id: string, updates: Partial<Estimate>) => {
    try {
      const updated = await estimatesAPI.update(id, updates);
      setEstimates(prev => prev.map(est => est._id === id ? updated : est));
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to update estimate');
      throw err;
    }
  };

  const deleteEstimate = async (id: string) => {
    try {
      await estimatesAPI.delete(id);
      setEstimates(prev => prev.filter(est => est._id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete estimate');
      throw err;
    }
  };

  const signEstimate = async (id: string, signature: string) => {
    try {
      const signed = await estimatesAPI.sign(id, signature);
      setEstimates(prev => prev.map(est => est._id === id ? signed : est));
      return signed;
    } catch (err: any) {
      setError(err.message || 'Failed to sign estimate');
      throw err;
    }
  };

  return {
    estimates,
    loading,
    error,
    refetch: fetchEstimates,
    createEstimate,
    updateEstimate,
    deleteEstimate,
    signEstimate,
  };
}

