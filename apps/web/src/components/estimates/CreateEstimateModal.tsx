import React, { useState, useEffect, useContext } from 'react';
import { X, Plus } from 'lucide-react';
import { EstimateService } from '../../services/EstimateService';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { supabase } from '../../lib/supabase';

interface CreateEstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateEstimateModal: React.FC<CreateEstimateModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    client_id: '',
    issue_date: new Date().toISOString().split('T')[0],
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    tax_rate: 0
  });

  useEffect(() => {
    if (isOpen && selectedOrg?.id) {
      loadClients();
    }
  }, [isOpen, selectedOrg?.id]);

  const loadClients = async () => {
    if (!selectedOrg?.id) return;

    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedOrg?.id || !user?.id) return;
    
    setLoading(true);
    try {
      await EstimateService.create({
        ...formData,
        organization_id: selectedOrg.id,
        user_id: user.id,
        status: 'draft',
        subtotal: 0,
        total_amount: 0,
        items: []
      });
      
      onSuccess();
    } catch (error) {
      console.error('Error creating estimate:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" onClick={onClose}>
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div 
          className="bg-[#1a1a1a] border border-[#333] rounded-lg w-full max-w-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[#333]">
            <h2 className="text-xl font-semibold text-white">Create New Estimate</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                  placeholder="e.g., Kitchen Renovation Estimate"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Client *
                </label>
                <select
                  required
                  value={formData.client_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:outline-none focus:border-[#336699]"
                >
                  <option value="">Select a client</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:outline-none focus:border-[#336699]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:outline-none focus:border-[#336699]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-[#336699] resize-none"
                placeholder="Describe the project scope and requirements..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#336699]/90 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Estimate
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};