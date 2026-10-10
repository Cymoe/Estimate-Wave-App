import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EstimatesList } from '../components/estimates/EstimatesList';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { EstimateService } from '../services/EstimateService';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';

/**
 * The estimates list. New estimates start from the yellow + button
 * ("Estimate"), which opens /work?new=1 and with it the drawer below.
 */
export const Work: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [showCreateEstimate, setShowCreateEstimate] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowCreateEstimate(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div className="max-w-[1600px] mx-auto">
      <EstimatesList />

      {/* Modals */}
      <CreateEstimateDrawer
        isOpen={showCreateEstimate}
        onClose={() => setShowCreateEstimate(false)}
        onSave={async (data) => {
          try {
            if (!user) {
              throw new Error('User not authenticated');
            }

            console.log('Creating estimate with data:', data);
            console.log('Selected org:', selectedOrg);
            console.log('User:', user);

            // Calculate subtotal and tax
            const subtotal = data.total_amount;
            const tax_rate = 0; // Can be configured later
            const tax_amount = subtotal * (tax_rate / 100);
            const total_with_tax = subtotal + tax_amount;

            // Validate required fields
            if (!data.issue_date) {
              throw new Error('Issue date is required');
            }
            
            if (!selectedOrg.id) {
              throw new Error('No organization selected');
            }

            const estimateData = {
              user_id: user.id,
              organization_id: selectedOrg.id,
              client_id: data.client_id || null,
              title: data.title || '',
              description: data.description || '',
              subtotal: subtotal,
              tax_rate: tax_rate,
              tax_amount: tax_amount,
              total_amount: total_with_tax,
              status: data.status as any,
              issue_date: data.issue_date,
              expiry_date: data.valid_until || null,
              terms: data.terms || null,
              notes: data.notes || null,
              items: (data.items || []).map((item: any, index: number) => ({
                description: item.description || item.product_name || '',
                quantity: item.quantity || 1,
                unit_price: item.price || item.unit_price || 0,
                red_line_price: item.red_line_price,
                cap_price: item.cap_price,
                total_price: (item.quantity || 1) * (item.price || item.unit_price || 0),
                display_order: index
              }))
            };

            console.log('Final estimate data being sent:', estimateData);

            // Create the estimate with items
            const estimate = await EstimateService.create(estimateData);

            console.log('✅ Estimate created successfully:', estimate);
            console.log('🚀 Navigating to estimate detail page:', `/estimates/${estimate.id}`);

            setShowCreateEstimate(false);
            
            // Navigate to the estimate detail page for immediate review
            navigate(`/estimates/${estimate.id}`);
          } catch (error) {
            console.error('Error creating estimate:', error);
            console.error('Error details:', {
              message: error instanceof Error ? error.message : 'No message',
              stack: error instanceof Error ? error.stack : 'No stack',
              raw: error
            });
            
            // Try to extract more useful error information
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else if (error && typeof error === 'object') {
              // Check for Supabase error format
              if ('message' in error && error.message) {
                errorMessage = error.message as string;
              } else if ('error' in error && error.error) {
                errorMessage = error.error as string;
              } else if ('details' in error && error.details) {
                errorMessage = error.details as string;
              } else {
                errorMessage = JSON.stringify(error);
              }
            }
            
            alert(`Failed to create estimate: ${errorMessage}`);
            throw error; // Re-throw so the drawer doesn't close
          }
        }}
      />
    </div>
  );
};