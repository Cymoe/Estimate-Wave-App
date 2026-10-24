import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { EstimateService } from '../services/EstimateService';
import { useAuth } from '../contexts/AuthContext';

export const EditEstimatePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadEstimate();
    }
  }, [id]);

  const loadEstimate = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await EstimateService.getById(id);
      setEstimate(data);
    } catch (error) {
      console.error('Error loading estimate:', error);
      alert('Failed to load estimate');
      navigate('/estimates');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#F9D71C]"></div>
      </div>
    );
  }

  return (
    <CreateEstimateDrawer
      isOpen={true}
      onClose={() => navigate(`/estimates/${id}`)}
      editingEstimate={estimate}
      onSave={async (data) => {
        try {
          if (!user || !id) {
            throw new Error('User not authenticated or estimate ID missing');
          }

          // Calculate subtotal and tax
          const subtotal = data.total_amount;
          const tax_rate = estimate?.tax_rate || 0;
          const tax_amount = subtotal * (tax_rate / 100);
          const total_with_tax = subtotal + tax_amount;

          // Update the estimate
          await EstimateService.update(id, {
            client_id: data.client_id,
            project_id: data.project_id,
            title: data.title || '',
            description: data.description,
            subtotal: subtotal,
            tax_rate: tax_rate,
            tax_amount: tax_amount,
            total_amount: total_with_tax,
            status: data.status as any,
            issue_date: data.issue_date,
            expiry_date: data.valid_until,
            terms: data.terms,
            notes: data.notes,
            items: data.items.map((item, index) => ({
              description: item.description || item.product_name || '',
              quantity: item.quantity,
              unit_price: item.price,
              red_line_price: item.red_line_price,
              cap_price: item.cap_price,
              total_price: item.price * item.quantity,
              display_order: index
            }))
          });

          // Navigate back to the estimate detail page
          navigate(`/estimates/${id}`);
        } catch (error) {
          console.error('Error updating estimate:', error);
          alert('Failed to update estimate. Please try again.');
        }
      }}
    />
  );
};