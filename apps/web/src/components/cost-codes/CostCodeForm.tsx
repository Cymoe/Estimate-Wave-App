import React, { useState, useEffect, useContext } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../contexts/AuthContext';
import { IndustryService } from '../../services/IndustryService';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { Industry } from '../../types';
import { supabase } from '../../lib/supabase';

interface CostCodeFormData {
  name: string;
  code: string;
  description: string;
  category: 'labor' | 'material' | 'equipment' | 'subcontractor' | 'service';
  industry_id: string;
}

interface CostCodeFormProps {
  onSubmit: (data: CostCodeFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<CostCodeFormData>;
  submitLabel?: string;
}

const CATEGORY_OPTIONS = [
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'service', label: 'Service' }
];

export const CostCodeForm: React.FC<CostCodeFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  submitLabel = 'Save'
}) => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors }, setError, clearErrors, watch } = useForm({
    defaultValues: {
      name: initialData?.name || '',
      code: initialData?.code || '',
      description: initialData?.description || '',
      category: initialData?.category || 'material',
      industry_id: initialData?.industry_id || ''
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const codeValue = watch('code');

  useEffect(() => {
    fetchIndustries();
  }, [selectedOrg]);

  // Check for duplicate cost codes
  useEffect(() => {
    const checkDuplicateCode = async () => {
      if (!codeValue || !selectedOrg?.id || codeValue === initialData?.code) {
        clearErrors('code');
        return;
      }

      setIsCheckingCode(true);
      try {
        const { data, error } = await supabase
          .from('cost_codes')
          .select('id')
          .eq('organization_id', selectedOrg.id)
          .eq('code', codeValue)
          .single();

        if (data) {
          setError('code', {
            type: 'manual',
            message: 'This code already exists'
          });
        } else {
          clearErrors('code');
        }
      } catch (error) {
        // No duplicate found (expected error)
        clearErrors('code');
      } finally {
        setIsCheckingCode(false);
      }
    };

    const timer = setTimeout(checkDuplicateCode, 500);
    return () => clearTimeout(timer);
  }, [codeValue, selectedOrg?.id, setError, clearErrors, initialData?.code]);

  const fetchIndustries = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      const orgIndustries = await IndustryService.getOrganizationIndustries(selectedOrg.id);
      // A company that hasn't picked its trades yet can still file a cost code under any.
      setIndustries(orgIndustries.length ? orgIndustries : await IndustryService.listAll());
    } catch (error) {
      console.error('Error fetching industries:', error);
    }
  };

  const onFormSubmit = async (data: any) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setIsLoading(true);
    
    try {
      await onSubmit({
        name: data.name,
        code: data.code,
        description: data.description,
        category: data.category,
        industry_id: data.industry_id
      });
    } catch (error) {
      console.error('Error submitting cost code:', error);
      // Set user-friendly error message
      if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError('Failed to save cost code. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="p-3 space-y-3">
      {/* Error Alert */}
      {submitError && (
        <div className="bg-red-500/10 border border-red-500 rounded p-2.5 mb-3">
          <p className="text-xs text-red-400">{submitError}</p>
        </div>
      )}
      
      <div>
        <label htmlFor="name" className="block text-xs font-medium text-gray-400 mb-1">
          Name
        </label>
        <input
          {...register('name', { 
            required: 'Name is required',
            minLength: {
              value: 2,
              message: 'Name must be at least 2 characters'
            },
            maxLength: {
              value: 100,
              message: 'Name must be 100 characters or less'
            }
          })}
          type="text"
          id="name"
          className="w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40"
          placeholder="Enter name"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-[#D32F2F]">{errors.name.message as string}</p>
        )}
      </div>

      <div>
        <label htmlFor="code" className="block text-xs font-medium text-gray-400 mb-1">
          Code
        </label>
        <div className="relative">
          <input
            {...register('code', { 
              required: 'Code is required',
              maxLength: {
                value: 10,
                message: 'Code must be 10 characters or less'
              },
              pattern: {
                value: /^[A-Za-z0-9-_]+$/,
                message: 'Code can only contain letters, numbers, hyphens, and underscores'
              }
            })}
            type="text"
            id="code"
            className="w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 font-mono pr-8"
            placeholder="Enter code (max 10 characters)"
            maxLength={10}
          />
          {isCheckingCode && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        {errors.code && (
          <p className="mt-1 text-xs text-[#D32F2F]">{errors.code.message as string}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-xs font-medium text-gray-400 mb-1">
          Description
        </label>
        <textarea
          {...register('description')}
          id="description"
          rows={2}
          className="w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 resize-none"
          placeholder="Enter description (optional)"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category" className="block text-xs font-medium text-gray-400 mb-1">
            Category
          </label>
          <select
            {...register('category', { required: 'Category is required' })}
            id="category"
            className="w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40"
          >
            {CATEGORY_OPTIONS.map(option => (
              <option key={option.value} value={option.value} className="bg-[#333333] text-white">
                {option.label}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="mt-1 text-xs text-[#D32F2F]">{errors.category.message as string}</p>
          )}
        </div>

        <div>
          <label htmlFor="industry_id" className="block text-xs font-medium text-gray-400 mb-1">
            Industry
          </label>
          <select
            {...register('industry_id', { required: 'Industry is required' })}
            id="industry_id"
            className="w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40"
          >
            <option value="" className="bg-[#333333] text-gray-400">Select Industry</option>
            {industries.map(industry => (
              <option 
                key={industry.id} 
                value={industry.id} 
                className="bg-[#333333] text-white"
              >
                {industry.icon} {industry.name}
              </option>
            ))}
          </select>
          {errors.industry_id && (
            <p className="mt-1 text-xs text-[#D32F2F]">{errors.industry_id.message as string}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 border border-[#336699]/40 rounded text-sm text-white hover:bg-[#333333] transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-3 py-1.5 bg-white text-black rounded text-sm hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting || isCheckingCode}
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};