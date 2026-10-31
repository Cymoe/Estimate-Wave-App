import React, { useState } from 'react';
import { X } from 'lucide-react';

export interface ClientFormProps {
  title: string;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  submitLabel: string;
  initialData?: {
    company_name: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    discount_percentage?: number;
  };
}

export const ClientForm: React.FC<ClientFormProps> = ({
  title,
  onClose,
  onSubmit,
  submitLabel,
  initialData = {
    company_name: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    discount_percentage: 0
  }
}) => {
  const [formData, setFormData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await onSubmit(formData);
    } catch (err) {
      setError('Failed to submit form');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121212]">
      <div className="flex justify-between items-center p-4 border-b border-[#333333] bg-[#1E1E1E]">
        <h2 className="text-xl font-bold text-[#FFFFFF] font-['Roboto_Condensed'] uppercase">{title}</h2>
        <button onClick={onClose} className="p-2 text-[#9E9E9E] hover:text-[#FFFFFF]">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-[#121212]">
        <form id="client-form" onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-[#D32F2F]/10 border border-[#D32F2F] rounded-[4px]">
              <p className="text-sm text-[#D32F2F] font-['Roboto']">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#FFFFFF] mb-2 font-['Roboto'] uppercase tracking-wider">
              COMPANY NAME
            </label>
            <input
              type="text"
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              className="w-full border border-[#555555] rounded-[4px] p-3 bg-[#333333] text-[#FFFFFF] font-['Roboto'] focus:border-[#0D47A1] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/40"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#FFFFFF] mb-2 font-['Roboto'] uppercase tracking-wider">
              CONTACT NAME
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-[#555555] rounded-[4px] p-3 bg-[#333333] text-[#FFFFFF] font-['Roboto'] focus:border-[#0D47A1] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/40"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#FFFFFF] mb-2 font-['Roboto'] uppercase tracking-wider">
              EMAIL
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full border border-[#555555] rounded-[4px] p-3 bg-[#333333] text-[#FFFFFF] font-['Roboto'] focus:border-[#0D47A1] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/40"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#FFFFFF] mb-2 font-['Roboto'] uppercase tracking-wider">
              PHONE
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full border border-[#555555] rounded-[4px] p-3 bg-[#333333] text-[#FFFFFF] font-['Roboto_Mono'] focus:border-[#0D47A1] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/40"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#FFFFFF] mb-2 font-['Roboto'] uppercase tracking-wider">
              ADDRESS
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full border border-[#555555] rounded-[4px] p-3 bg-[#333333] text-[#FFFFFF] font-['Roboto'] focus:border-[#0D47A1] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/40"
              rows={3}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#FFFFFF] mb-2 font-['Roboto'] uppercase tracking-wider">
              DEFAULT DISCOUNT %
            </label>
            <div className="relative">
              <input
                type="number"
                value={formData.discount_percentage || 0}
                onChange={(e) => {
                  const value = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                  setFormData({ ...formData, discount_percentage: value });
                }}
                className="w-full border border-[#555555] rounded-[4px] p-3 pr-12 bg-[#333333] text-[#FFFFFF] font-['Roboto_Mono'] focus:border-[#0D47A1] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/40"
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E9E9E] font-['Roboto']">%</span>
            </div>
            <p className="mt-1 text-xs text-[#9E9E9E] font-['Roboto']">
              This discount will automatically apply to all estimates for this client
            </p>
          </div>
        </form>
      </div>

      <div className="border-t border-[#333333] p-4 bg-[#1E1E1E]">
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-3 border border-[#555555] rounded-[4px] hover:bg-[#333333] text-[#FFFFFF] font-['Roboto'] uppercase font-medium tracking-wider"
            disabled={loading}
          >
            CANCEL
          </button>
          <button
            type="submit"
            form="client-form"
            className="w-full px-4 py-3 bg-[#336699] text-white rounded-[4px] hover:bg-[#336699]/90 disabled:opacity-50 font-['Roboto'] uppercase font-medium tracking-wider"
            disabled={loading}
          >
            {loading ? 'CREATING...' : submitLabel.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}; 