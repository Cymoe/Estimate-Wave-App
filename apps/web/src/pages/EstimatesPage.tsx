import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { EstimatesList } from '../components/estimates/EstimatesList';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { EstimateService } from '../services/EstimateService';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';

export const EstimatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Return EstimatesList directly without wrapper to escape DashboardLayout constraints
  return (
    <>
      <EstimatesList 
        onCreateEstimate={() => setShowCreateDrawer(true)} 
        refreshTrigger={refreshTrigger}
      />
      
      <CreateEstimateDrawer
        isOpen={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        onSave={async (data) => {
          console.log('🚀 Starting estimate creation with data:', data);
          try {
            if (!user) {
              throw new Error('User not authenticated');
            }

            if (!selectedOrg?.id) {
              throw new Error('No organization selected');
            }

            console.log('✅ User and org validation passed');

            // Calculate subtotal and tax
            const subtotal = data.total_amount;
            const tax_rate = 0; // Can be configured later
            const tax_amount = subtotal * (tax_rate / 100);
            const total_with_tax = subtotal + tax_amount;

            console.log('✅ Calculations complete, creating estimate...');

            // Create the estimate with items
            const estimate = await EstimateService.create({
              user_id: user.id,
              organization_id: selectedOrg.id, // Use the selected organization ID
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
              expiry_date: data.valid_until, // Note: EstimateService uses expiry_date
              terms: data.terms,
              notes: data.notes,
              items: data.items.map((item, index) => ({
                description: item.description || item.product_name || '',
                quantity: item.quantity,
                unit_price: item.price,
                total_price: item.price * item.quantity,
                display_order: index
              }))
            });

            // Close drawer immediately for better UX
            setShowCreateDrawer(false);
            
            // Debug logging
            console.log('Created estimate:', estimate);
            console.log('Navigating to:', `/estimates/${estimate.id}`);
            
            // Navigate to the estimate detail page for immediate review
            navigate(`/estimates/${estimate.id}`);
          } catch (error) {
            console.error('❌ Error creating estimate:', error);
            console.error('❌ Error details:', {
              message: error.message,
              stack: error.stack,
              cause: error.cause
            });
            alert('Failed to create estimate. Please try again.');
          }
        }}
      />
    </>
  );
};