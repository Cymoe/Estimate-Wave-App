import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Edit, Send, Download, Share2, Trash2,
  CheckCircle, XCircle, FileText, User,
  Phone, Mail, MapPin, Copy, Eye, Calendar
} from 'lucide-react';
import { EstimateService, Estimate } from '../../services/EstimateService';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';
import { ProjectSelectionModal } from './ProjectSelectionModal';
import { ProjectCreationModal } from '../ProjectCreationModal';
import { CreateEstimateDrawer } from './CreateEstimateDrawer';
import { MapModal } from '../common/MapModal';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { AirtableEstimateView } from './AirtableEstimateView';
import { AirtableSidebar } from './AirtableSidebar';
import { ContextualPricingSelector } from './ContextualPricingSelector';
import { DesignUpload } from './DesignUpload';

export const EstimateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(25);
  const [showProjectSelectionModal, setShowProjectSelectionModal] = useState(false);
  const [pendingInvoiceType, setPendingInvoiceType] = useState<'full' | 'deposit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Edit mode removed - cells are always editable
  const [showPricingSelector, setShowPricingSelector] = useState(false);
  const [currentPricingStrategy, setCurrentPricingStrategy] = useState<string | null>(null);
  const [showPricingStrategy, setShowPricingStrategy] = useState(false);
  
  // Tab state - Default to Line Items for immediate visibility (3-tab structure)
  const [activeTab, setActiveTab] = useState<'items' | 'overview' | 'contract'>('items');

  // Design image state
  const [designImageUrl, setDesignImageUrl] = useState<string | null>(null);
  const [designImageName, setDesignImageName] = useState<string | null>(null);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    
    if (!id) return;
    
    const fetchEstimate = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await EstimateService.getById(id);
        // Store original prices for pricing strategy calculations
        if (result && result.items) {
          result.items = result.items.map(item => ({
            ...item,
            original_unit_price: item.original_unit_price || item.unit_price,
            cap_price: item.cap_price || item.unit_price,
            red_line_price: item.red_line_price || item.unit_price * 0.7
          }));
        }
        setEstimate(result);

        // Fetch design image if project exists
        if (result?.project_id) {
          try {
            const { data: designDocs } = await supabase
              .from('project_documents')
              .select('*')
              .eq('project_id', result.project_id)
              .eq('type', 'agreed_design')
              .order('created_at', { ascending: false })
              .limit(1);

            if (designDocs && designDocs.length > 0) {
              const designDoc = designDocs[0];
              setDesignImageUrl(designDoc.content);
              setDesignImageName(designDoc.name?.replace('Agreed Design - ', '') || 'Project Design');
            }
          } catch (error) {
            console.log('No design document found:', error);
          }
        }
      } catch (err) {
        console.error('Error fetching estimate:', err);
        setError('Failed to load estimate');
      } finally {
        setLoading(false);
      }
    };

    fetchEstimate();
  }, [id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showInvoiceDropdown) {
        const target = event.target as Element;
        if (!target.closest('.relative')) {
          setShowInvoiceDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showInvoiceDropdown]);

  const handleStatusUpdate = async (status: Estimate['status']) => {
    if (!estimate?.id) return;

    try {
      // If changing to 'sent', actually send the email
      if (status === 'sent' && estimate.client?.email) {
        const confirmed = confirm(`Send this estimate to ${estimate.client.email}?`);
        if (!confirmed) return;

        const result = await EstimateService.sendEstimate(estimate.id, estimate.client.email);
        
        if (!result.success) {
          alert(`Failed to send estimate: ${result.error}`);
          return;
        }
        
        alert('Estimate sent successfully!');
      } else {
        // Just update status without sending email
        await EstimateService.updateStatus(estimate.id, status);
      }
      
      // Reload estimate data
      const result = await EstimateService.getById(estimate.id);
      setEstimate(result);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update estimate status');
    }
  };

  const handleConvertToInvoice = async (useDeposit: boolean = false) => {
    if (!estimate?.id) return;
    
    // Check if estimate already has a project
    if (!estimate.project_id) {
      // Store the pending action and show project selection modal
      setPendingInvoiceType(useDeposit ? 'deposit' : 'full');
      setShowProjectSelectionModal(true);
    } else {
      // Estimate already has a project, proceed with conversion
      proceedWithInvoiceCreation(useDeposit);
    }
  };

  const proceedWithInvoiceCreation = async (useDeposit: boolean = false) => {
    if (!estimate?.id) return;

    if (useDeposit) {
      setShowDepositModal(true);
    } else {
      if (!confirm('Convert this estimate to a full invoice? This action cannot be undone.')) return;

      try {
        const invoiceId = await EstimateService.convertToInvoice(estimate.id);
        navigate(`/invoices/${invoiceId}`);
      } catch (error: any) {
        console.error('Error converting to invoice:', error);
        console.error('Error details:', error.message, error.details);
        alert('Failed to convert estimate to invoice: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const handleProjectSelection = async (projectId: string | null) => {
    setShowProjectSelectionModal(false);
    
    if (projectId === 'CREATE_NEW') {
      // Show create project modal
      setShowProjectSelectionModal(true);
      return;
    }

    // Update estimate with selected project (if any)
    if (projectId && estimate?.id) {
      try {
        await EstimateService.update(estimate.id, { project_id: projectId });
        // Reload estimate to get updated data
        const result = await EstimateService.getById(estimate.id);
        setEstimate(result);
      } catch (error) {
        console.error('Error updating estimate with project:', error);
      }
    }

    // Continue with the pending invoice action
    if (pendingInvoiceType) {
      proceedWithInvoiceCreation(pendingInvoiceType === 'deposit');
      setPendingInvoiceType(null);
    }
  };

  const handleCreateDepositInvoice = async () => {
    if (!estimate?.id) return;

    try {
      const invoiceId = await EstimateService.convertToInvoice(estimate.id, depositPercentage);
      setShowDepositModal(false);
      navigate(`/invoices/${invoiceId}`);
    } catch (error: any) {
      console.error('Error creating deposit invoice:', error);
      console.error('Error details:', error.message, error.details);
      alert('Failed to create deposit invoice: ' + (error.message || 'Unknown error'));
    }
  };

  const handleProjectCreated = async (projectId: string) => {
    setShowProjectSelectionModal(false);
    
    // Update estimate with new project
    if (estimate?.id) {
      try {
        await EstimateService.update(estimate.id, { project_id: projectId });
        const result = await EstimateService.getById(estimate.id);
        setEstimate(result);
      } catch (error) {
        console.error('Error updating estimate with project:', error);
      }
    }

    // Continue with pending invoice action
    if (pendingInvoiceType) {
      proceedWithInvoiceCreation(pendingInvoiceType === 'deposit');
      setPendingInvoiceType(null);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!estimate?.id) return;

    try {
      await EstimateService.delete(estimate.id);
      navigate('/estimates');
    } catch (error) {
      console.error('Error deleting estimate:', error);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleCopyShareLink = async () => {
    if (!estimate?.id) return;
    
    const shareUrl = `${window.location.origin}/share/estimate/${estimate.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      // You could add a toast notification here
      alert('Share link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy link:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Share link copied to clipboard!');
    }
  };

  const handleEditSave = async (data: any) => {
    if (!estimate?.id) return;
    
    try {
      await EstimateService.update(estimate.id, data);
      // Reload estimate data
      const result = await EstimateService.getById(estimate.id);
      setEstimate(result);
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating estimate:', error);
      alert('Failed to update estimate');
    }
  };

  const handlePriceUpdate = async (itemId: string, newPrice: number) => {
    if (!estimate) return;
    
    const updatedItems = estimate.items.map(item => 
      item.id === itemId 
        ? { ...item, price: newPrice, total: newPrice * (item.quantity || 1) }
        : item
    );
    
    const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
    
    setEstimate({
      ...estimate,
      items: updatedItems,
      total_amount: newTotal
    });
  };

  const handleBulkPriceAdjust = (position: number) => {
    if (!estimate) return;
    
    const updatedItems = estimate.items.map(item => {
      // Always use the stored cap and redline prices
      const capPrice = item.cap_price || item.original_unit_price || item.unit_price;
      const redlinePrice = item.red_line_price || (item.original_unit_price || item.unit_price) * 0.7;
      
      // Calculate new price based on position between redline and cap
      const newPrice = redlinePrice + (capPrice - redlinePrice) * position;
      
      return {
        ...item,
        unit_price: newPrice,
        total_price: newPrice * (item.quantity || 1)
      };
    });
    
    const newSubtotal = updatedItems.reduce((sum, item) => sum + item.total_price, 0);
    const newTaxAmount = estimate.tax_rate ? (newSubtotal * estimate.tax_rate / 100) : 0;
    const newTotal = newSubtotal + newTaxAmount;
    
    setEstimate({
      ...estimate,
      items: updatedItems,
      subtotal: newSubtotal,
      tax_amount: newTaxAmount,
      total_amount: newTotal
    });
  };

  // Calculate margin position for indicator
  const getMarginPosition = () => {
    if (!estimate || !estimate.items || estimate.items.length === 0) return 1.0;
    
    const totalCurrent = estimate.items.reduce((sum, item) => sum + item.total_price, 0);
    const totalCap = estimate.items.reduce((sum, item) => {
      const capPrice = item.cap_price || item.unit_price;
      return sum + (capPrice * (item.quantity || 1));
    }, 0);
    const totalRedline = estimate.items.reduce((sum, item) => {
      const redlinePrice = item.red_line_price || item.unit_price * 0.7;
      return sum + (redlinePrice * (item.quantity || 1));
    }, 0);
    
    if (totalCap === totalRedline) return 0.5;
    return (totalCurrent - totalRedline) / (totalCap - totalRedline);
  };

  const marginPosition = getMarginPosition();
  const marginColor = marginPosition > 0.3 ? 'text-green-500' : marginPosition > 0.15 ? 'text-yellow-500' : 'text-red-500';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] text-white">
        {/* Header Skeleton */}
        <div className="border-b border-[#333333] px-6 py-4">
          {/* Row 1: Navigation + Document Info */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-[#333333] rounded animate-pulse"></div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-6 bg-[#333333] rounded animate-pulse"></div>
                <div className="w-20 h-5 bg-[#333333] rounded animate-pulse"></div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-28 h-9 bg-[#333333] rounded-lg animate-pulse"></div>
              <div className="w-20 h-9 bg-[#333333] rounded-lg animate-pulse"></div>
              <div className="w-16 h-9 bg-[#333333] rounded-lg animate-pulse"></div>
            </div>
          </div>

          {/* Row 2: Client Information */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="w-48 h-5 bg-[#333333] rounded animate-pulse"></div>
              <div className="w-32 h-4 bg-[#333333] rounded animate-pulse"></div>
            </div>
            <div className="w-24 h-5 bg-[#333333] rounded animate-pulse"></div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Mobile: Total amount card skeleton */}
          <div className="md:hidden bg-[#1a1a1a] rounded-lg border border-[#333] p-4 mb-6">
            <div className="flex justify-between items-center">
              <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
              <div className="w-32 h-6 bg-[#333333] rounded animate-pulse"></div>
            </div>
          </div>

          {/* Client & Project Info Section - 2 Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Client Information Card */}
            <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 bg-[#333333] rounded animate-pulse"></div>
                <div className="w-32 h-5 bg-[#333333] rounded animate-pulse"></div>
              </div>
              <div className="space-y-2">
                <div className="w-40 h-4 bg-[#333333] rounded animate-pulse"></div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-36 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-32 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="flex items-start gap-2 p-2 rounded-lg">
                  <div className="w-4 h-4 bg-[#333333] rounded animate-pulse mt-0.5"></div>
                  <div className="flex-1">
                    <div className="w-48 h-4 bg-[#333333] rounded animate-pulse mb-1"></div>
                    <div className="w-28 h-3 bg-[#333333] rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Estimate Details Card */}
            <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 bg-[#333333] rounded animate-pulse"></div>
                <div className="w-28 h-5 bg-[#333333] rounded animate-pulse"></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <div className="w-20 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="flex justify-between">
                  <div className="w-16 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="flex justify-between">
                  <div className="w-18 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-20 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area - Single Column */}
          <div className="space-y-6">
            {/* Cost Breakdown Card */}
            <div className="bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#333]">
                <div className="w-48 h-5 bg-[#333333] rounded animate-pulse"></div>
              </div>
              <div className="p-6 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between items-center py-1.5">
                    <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
                    <div className="w-20 h-4 bg-[#333333] rounded animate-pulse"></div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-[#555]">
                  <div className="w-16 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="flex justify-between items-center py-1">
                  <div className="w-20 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-20 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[#555]">
                  <div className="w-12 h-4 bg-[#333333] rounded animate-pulse"></div>
                  <div className="w-24 h-4 bg-[#333333] rounded animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Line Items Card */}
            <div className="bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#333]">
                <div className="w-20 h-5 bg-[#333333] rounded animate-pulse"></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#0a0a0a]">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <div className="w-20 h-3 bg-[#333333] rounded animate-pulse"></div>
                      </th>
                      <th className="px-3 py-3 text-center">
                        <div className="w-8 h-3 bg-[#333333] rounded animate-pulse mx-auto"></div>
                      </th>
                      <th className="px-3 py-3 text-right">
                        <div className="w-16 h-3 bg-[#333333] rounded animate-pulse ml-auto"></div>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <div className="w-12 h-3 bg-[#333333] rounded animate-pulse ml-auto"></div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333]">
                    {[1, 2, 3, 4].map((i) => (
                      <tr key={i}>
                        <td className="px-4 py-4">
                          <div className="w-48 h-4 bg-[#333333] rounded animate-pulse mb-1"></div>
                          <div className="w-24 h-3 bg-[#333333] rounded animate-pulse"></div>
                        </td>
                        <td className="px-3 py-4 text-center">
                          <div className="w-8 h-4 bg-[#333333] rounded animate-pulse mx-auto"></div>
                        </td>
                        <td className="px-3 py-4 text-right">
                          <div className="w-16 h-4 bg-[#333333] rounded animate-pulse ml-auto"></div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="w-20 h-4 bg-[#333333] rounded animate-pulse ml-auto"></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">Estimate not found</h3>
        <button
          onClick={() => navigate('/estimates')}
          className="text-[#F9D71C] hover:text-white transition-colors"
        >
          Back to Estimates
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a1a] border-b border-[#333333]">
        {/* Row 1: Navigation + Document Info */}
        <div className="flex items-center justify-between mb-2 px-3 py-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/estimates')}
              className="p-2 hover:bg-[#333333] rounded-[4px] transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-400" />
            </button>
            
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{estimate.estimate_number}</h1>
              <span className={`text-xs px-3 py-1 rounded-[4px] font-medium uppercase ${
                estimate.status === 'accepted' ? 'bg-green-500/20 text-green-300' :
                estimate.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                estimate.status === 'sent' ? 'bg-blue-500/20 text-blue-300' :
                'bg-gray-500/20 text-gray-300'
              }`}>
                {estimate.status}
              </span>
              {estimate.last_sent_at && (
                <span className="text-xs text-gray-500">
                  Sent {new Date(estimate.last_sent_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Cleaner Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Invoice Creation - Consolidated */}
            {estimate.status === 'accepted' && !estimate.converted_to_invoice_id && (
              <div className="relative">
                <button
                  onClick={() => setShowInvoiceDropdown(!showInvoiceDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors text-sm font-medium"
                >
                  Create Invoice
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showInvoiceDropdown && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-[#1E1E1E] border border-[#333333] rounded-lg shadow-lg z-50 py-2">
                    <button
                      onClick={() => {
                        handleConvertToInvoice(false);
                        setShowInvoiceDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#333333] transition-colors"
                    >
                      Full Invoice
                    </button>
                    <button
                      onClick={() => {
                        handleConvertToInvoice(true);
                        setShowInvoiceDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#333333] transition-colors"
                    >
                      Deposit Invoice
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* View Invoice - if already converted */}
            {estimate.converted_to_invoice_id && (
              <button
                onClick={() => navigate(`/invoices/${estimate.converted_to_invoice_id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-sm hover:bg-[#2A5580] transition-colors text-sm font-medium"
              >
                View Invoice
              </button>
            )}
            
            {/* Send - for draft status */}
            {estimate.status === 'draft' && (
              <button 
                onClick={() => handleStatusUpdate('sent')}
                className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-sm hover:bg-[#2A5580] transition-colors text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            )}
            
            {/* Resend - for already sent estimates */}
            {estimate.status === 'sent' && estimate.client?.email && (
              <button 
                onClick={() => handleStatusUpdate('sent')}
                className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] border border-[#404040] text-white rounded-sm hover:bg-[#333333] transition-colors text-sm"
              >
                <Send className="w-4 h-4" />
                Resend
              </button>
            )}
            
            {/* View Contract - Always available for estimates with items */}
            {estimate.items && estimate.items.length > 0 && (
              <button 
                onClick={() => navigate(`/estimates/${estimate.id}/contract`)}
                className="flex items-center gap-2 px-4 py-2 bg-[#fbbf24] text-black rounded-sm hover:bg-[#f59e0b] transition-colors text-sm font-medium"
              >
                <FileText className="w-4 h-4" />
                View Contract
              </button>
            )}
            
            {/* Secondary Actions */}
            <button 
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] border border-[#404040] text-white rounded-sm hover:bg-[#333333] transition-colors text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>

        {/* Simple Client Info */}
        <div className="text-sm text-gray-400 mt-1 px-3">
          {estimate.client?.name || 'No client'} • Created {new Date(estimate.issue_date).toLocaleDateString()}
        </div>

        {/* Tab Navigation */}
        <div className="border-t border-[#333333]">
          <div className="flex items-center">
            {[
              { id: 'items', label: 'Line Items' },
              { id: 'overview', label: 'Overview' },
              { id: 'contract', label: 'Contract' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-white border-[#336699] bg-[#336699]/10'
                    : 'text-gray-400 border-transparent hover:text-white hover:bg-[#2a2a2a]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: activeTab === 'items' ? '60px' : '0' }}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Summary Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total & Status Card */}
              <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">Estimate Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Total Amount</span>
                    <span className="text-xl font-bold text-[#F9D71C]">{formatCurrency(estimate.total_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Status</span>
                    <span className={`text-sm px-2 py-1 rounded-[4px] font-medium uppercase ${
                      estimate.status === 'accepted' ? 'bg-green-500/20 text-green-300' :
                      estimate.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                      estimate.status === 'sent' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-gray-500/20 text-gray-300'
                    }`}>
                      {estimate.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Items</span>
                    <span className="text-sm text-white">{estimate.items?.length || 0}</span>
                  </div>
                </div>
              </div>

              {/* Client Information Card */}
              <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">Client</h3>
                {estimate.client ? (
                  <div className="space-y-2">
                    <div className="text-base font-medium text-white">{estimate.client.name}</div>
                    {estimate.client.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Mail className="w-4 h-4" />
                        <span>{estimate.client.email}</span>
                      </div>
                    )}
                    {estimate.client.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Phone className="w-4 h-4" />
                        <span>{estimate.client.phone}</span>
                      </div>
                    )}
                    {estimate.client.address && (
                      <button
                        onClick={() => setShowMapModal(true)}
                        className="flex items-start gap-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer w-full text-left p-2 -m-2 rounded-lg hover:bg-[#2a2a2a]"
                        title="Click to view on map"
                      >
                        <MapPin className="w-4 h-4 mt-0.5" />
                        <span className="hover:underline">{estimate.client.address}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No client assigned</p>
                )}
              </div>

              {/* Dates & Timeline Card */}
              <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">Timeline</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">Created</span>
                    <span className="text-sm text-white">{new Date(estimate.issue_date).toLocaleDateString()}</span>
                  </div>
                  {estimate.expiry_date && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-400">Expires</span>
                      <span className="text-sm text-white">{new Date(estimate.expiry_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {estimate.last_sent_at && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-400">Last Sent</span>
                      <span className="text-sm text-white">{new Date(estimate.last_sent_at).toLocaleDateString()}</span>
                    </div>
                  )}
                  {estimate.project_id && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-400">Project</span>
                      <span className="text-sm text-green-400">Linked</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Design Upload Section */}
            <DesignUpload
              estimateId={id!}
              projectId={estimate?.project_id}
              currentImageUrl={designImageUrl || undefined}
              currentImageName={designImageName || undefined}
              onUploadComplete={(imageUrl, imageName) => {
                setDesignImageUrl(imageUrl);
                setDesignImageName(imageName);
              }}
              onRemove={() => {
                setDesignImageUrl(null);
                setDesignImageName(null);
              }}
            />

            {/* Notes and Terms */}
            {(estimate.notes || estimate.terms) && (
              <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                {estimate.notes && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">Notes</h3>
                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{estimate.notes}</p>
                  </div>
                )}
                
                {estimate.terms && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">Terms & Conditions</h3>
                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{estimate.terms}</p>
                  </div>
                )}
              </div>
            )}

            {/* Signature Section */}
            {estimate.status === 'accepted' && estimate.client_signature && (
              <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Client Signature</h3>
                <div className="border border-[#333] rounded-lg p-4 bg-white">
                  <img 
                    src={estimate.client_signature} 
                    alt="Client Signature" 
                    className="max-h-32 mx-auto"
                  />
                </div>
                <p className="text-sm text-gray-400 mt-2">
                  Signed on {new Date(estimate.signed_at!).toLocaleDateString()}
                </p>
              </div>
            )}


          </div>
        )}

        {/* Line Items Tab */}
        {activeTab === 'items' && (
          <div className="w-full flex">
            {/* Airtable Sidebar */}
            <AirtableSidebar
              selectedView={currentPricingStrategy}
              onViewChange={(viewId, position) => {
                setCurrentPricingStrategy(viewId);
                handleBulkPriceAdjust(position);
              }}
              estimateTotal={estimate.total_amount}
              capTotal={estimate.items?.reduce((sum, item) => {
                const capPrice = item.cap_price || item.original_unit_price || item.unit_price;
                return sum + (capPrice * (item.quantity || 1));
              }, 0) || 0}
              redlineTotal={estimate.items?.reduce((sum, item) => {
                const redlinePrice = item.red_line_price || (item.original_unit_price || item.unit_price) * 0.7;
                return sum + (redlinePrice * (item.quantity || 1));
              }, 0) || 0}
            />
            
            {/* Airtable-style Spreadsheet */}
            <div className="flex-1">
              <AirtableEstimateView
          items={estimate.items?.map(item => ({
            id: item.id,
            name: item.description || 'Unnamed Item',
            quantity: item.quantity,
            price: item.unit_price,
            original_price: item.original_unit_price,
            unit: item.unit || 'ea',
            total: item.total_price
          })) || []}
          onUpdateItem={(itemId, field, value) => {
            const newItems = estimate.items?.map(item => {
              if (item.id !== itemId) return item;
              
              const updatedItem = { ...item };
              
              if (field === 'name') {
                updatedItem.description = value;
              } else if (field === 'quantity') {
                updatedItem.quantity = value;
                updatedItem.total_price = value * updatedItem.unit_price;
              } else if (field === 'price') {
                updatedItem.unit_price = value;
                updatedItem.total_price = updatedItem.quantity * value;
              }
              
              return updatedItem;
            }) || [];
            
            // Recalculate totals
            const newSubtotal = newItems.reduce((sum, item) => sum + item.total_price, 0);
            const newTaxAmount = estimate.tax_rate ? (newSubtotal * estimate.tax_rate / 100) : 0;
            const newTotal = newSubtotal + newTaxAmount;
            
            setEstimate({ 
              ...estimate, 
              items: newItems,
              subtotal: newSubtotal,
              tax_amount: newTaxAmount,
              total_amount: newTotal
            });
          }}
          onAddItem={() => setShowPricingSelector(true)}
          onRemoveItem={(itemId) => {
            const newItems = estimate.items?.filter(item => item.id !== itemId) || [];
            // Recalculate totals
            const newSubtotal = newItems.reduce((sum, item) => sum + item.total_price, 0);
            const newTaxAmount = estimate.tax_rate ? (newSubtotal * estimate.tax_rate / 100) : 0;
            const newTotal = newSubtotal + newTaxAmount;
            
            setEstimate({ 
              ...estimate, 
              items: newItems,
              subtotal: newSubtotal,
              tax_amount: newTaxAmount,
              total_amount: newTotal
            });
          }}
          isEditable={true}
          subtotal={estimate.subtotal}
          tax={estimate.tax_amount || 0}
          total={estimate.total_amount}
          marginIndicator={{ position: marginPosition, color: marginColor }}
          capTotal={estimate.items?.reduce((sum, item) => {
            const capPrice = item.cap_price || item.original_unit_price || item.unit_price;
            return sum + (capPrice * (item.quantity || 1));
          }, 0) || 0}
          redlineTotal={estimate.items?.reduce((sum, item) => {
            const redlinePrice = item.red_line_price || (item.original_unit_price || item.unit_price) * 0.7;
            return sum + (redlinePrice * (item.quantity || 1));
          }, 0) || 0}
          showStickyFooter={false}
        />
            </div>
          </div>
        )}


         {/* Contract Tab */}
         {activeTab === 'contract' && (
           <div className="p-6 space-y-6">
             {estimate.items && estimate.items.length > 0 ? (
               <>
                 {/* Contract Header */}
                 <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                   <div className="flex justify-between items-center mb-6">
                     <div>
                       <h2 className="text-lg font-semibold text-white">Contracts & Agreements - {estimate.estimate_number}</h2>
                       <p className="text-sm text-gray-400">Complete contract package for {estimate.client?.name || 'No client'}</p>
                     </div>
                     <div className="flex items-center gap-3">
                       <button 
                         onClick={() => navigate(`/estimates/${estimate.id}/contract`)}
                         className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors text-sm font-medium"
                       >
                         <FileText className="w-4 h-4" />
                         Full Contract View
                       </button>
                     </div>
                   </div>
                 </div>

                 {/* 1. Service Contract Agreement */}
                 <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                   <div className="flex justify-between items-center mb-4">
                     <div>
                       <h3 className="text-lg font-semibold text-white">1. Service Contract Agreement</h3>
                       <p className="text-sm text-gray-400">Initial work agreement and terms</p>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded">Active</span>
                       <button className="text-[#336699] hover:text-white transition-colors">
                         <Download className="w-4 h-4" />
                       </button>
                     </div>
                   </div>

                {/* Contract Preview */}
                <div className="bg-white text-black p-6 rounded-lg">
                  <div className="text-center mb-6">
                    <h1 className="text-xl font-bold">SERVICES CONTRACT AGREEMENT</h1>
                  </div>

                  {/* Contract Summary */}
                  <div className="space-y-4 text-sm">
                    <div>
                      <h3 className="font-semibold mb-2">PARTIES</h3>
                      <p>
                        This services contract agreement is entered into between{' '}
                        <strong>Campos Family Properties, LLC</strong> (Constructor) and{' '}
                        <strong>{estimate.client?.name || 'Client'}</strong> (Client).
                      </p>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">AGREED DESIGN</h3>
                      {designImageUrl ? (
                        <div className="space-y-2">
                          <img
                            src={designImageUrl}
                            alt="Agreed Design"
                            className="max-w-full h-auto max-h-48 object-contain border border-gray-300 rounded"
                          />
                          <p className="text-xs text-gray-600">{designImageName}</p>
                        </div>
                      ) : (
                        <p className="text-gray-600 italic">Design to be uploaded in Overview tab</p>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">CONSTRUCTION PROPERTY</h3>
                      <p>{estimate.client?.address || 'Property address to be specified'}</p>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">SCOPE OF WORK</h3>
                      <p>{estimate.description || 'Work description based on selected services'}</p>
                    </div>

                    {/* Line Items Summary */}
                    <div>
                      <h3 className="font-semibold mb-2">PROJECT ITEMS</h3>
                      <div className="space-y-2">
                        {estimate.items.slice(0, 5).map((item, index) => (
                          <div key={index} className="flex justify-between">
                            <span>{item.description}</span>
                            <span>{formatCurrency(item.total_price)}</span>
                          </div>
                        ))}
                        {estimate.items.length > 5 && (
                          <div className="text-gray-600 text-center">
                            ... and {estimate.items.length - 5} more items
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-300">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Contract Amount</span>
                        <span>{formatCurrency(estimate.total_amount)}</span>
                      </div>
                    </div>

                    <div className="pt-4">
                      <h3 className="font-semibold mb-2">PAYMENT TERMS</h3>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Initial deposit (50%)</span>
                          <span>{formatCurrency(estimate.total_amount * 0.5)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stage 2 (40%)</span>
                          <span>{formatCurrency(estimate.total_amount * 0.4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Final payment (10%)</span>
                          <span>{formatCurrency(estimate.total_amount * 0.1)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-gray-100 rounded-lg text-center">
                    <p className="text-sm text-gray-600">
                      This is a preview of your service contract. Click "Full Contract View" above to see the complete contract with all terms and conditions.
                    </p>
                  </div>
                </div>
                 </div>

                 {/* 2. Affidavit of Completion (Lien Release) */}
                 <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                   <div className="flex justify-between items-center mb-4">
                     <div>
                       <h3 className="text-lg font-semibold text-white">2. Affidavit of Completion</h3>
                       <p className="text-sm text-gray-400">Lien release and completion certification</p>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded">Pending</span>
                       <button className="text-[#336699] hover:text-white transition-colors">
                         <Download className="w-4 h-4" />
                       </button>
                     </div>
                   </div>

                   {/* Affidavit Preview */}
                   <div className="bg-white text-black p-6 rounded-lg">
                     <div className="text-center mb-6">
                       <h1 className="text-xl font-bold">AFFIDAVIT OF COMPLETION</h1>
                       <p className="text-sm text-gray-600 mt-2">LIEN RELEASE CERTIFICATE</p>
                     </div>

                     <div className="space-y-4 text-sm">
                       <div>
                         <h3 className="font-semibold mb-2">PROJECT COMPLETION</h3>
                         <p>
                           I, <strong>Campos Family Properties, LLC</strong>, hereby certify that all work 
                           described in Contract {estimate.estimate_number} has been completed in accordance 
                           with the agreed specifications and to the satisfaction of the client.
                         </p>
                       </div>

                       <div>
                         <h3 className="font-semibold mb-2">LIEN RELEASE</h3>
                         <p>
                           This affidavit serves as a release of any and all liens, claims, or encumbrances 
                           against the property located at {estimate.client?.address || 'Property address'} 
                           arising from the work performed under this contract.
                         </p>
                       </div>

                       <div>
                         <h3 className="font-semibold mb-2">FINAL PAYMENT</h3>
                         <p>
                           All payments due under the contract have been received, and no additional 
                           amounts are owed for the work performed.
                         </p>
                       </div>

                       <div className="pt-4 border-t border-gray-300">
                         <div className="flex justify-between">
                           <span>Total Contract Amount</span>
                           <span>{formatCurrency(estimate.total_amount)}</span>
                         </div>
                         <div className="flex justify-between">
                           <span>Final Payment Received</span>
                           <span>{formatCurrency(estimate.total_amount * 0.1)}</span>
                         </div>
                       </div>
                     </div>

                     <div className="mt-6 p-4 bg-gray-100 rounded-lg text-center">
                       <p className="text-sm text-gray-600">
                         This affidavit will be available for download upon project completion and final payment.
                       </p>
                     </div>
                   </div>
                 </div>

                 {/* 3. Change Order Contract */}
                 <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6">
                   <div className="flex justify-between items-center mb-4">
                     <div>
                       <h3 className="text-lg font-semibold text-white">3. Change Order Contract</h3>
                       <p className="text-sm text-gray-400">Modifications and additions to original scope</p>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded">Not Applicable</span>
                       <button className="text-[#336699] hover:text-white transition-colors">
                         <Download className="w-4 h-4" />
                       </button>
                     </div>
                   </div>

                   {/* Change Order Preview */}
                   <div className="bg-white text-black p-6 rounded-lg">
                     <div className="text-center mb-6">
                       <h1 className="text-xl font-bold">CHANGE ORDER AGREEMENT</h1>
                       <p className="text-sm text-gray-600 mt-2">SCOPE MODIFICATION CONTRACT</p>
                     </div>

                     <div className="space-y-4 text-sm">
                       <div>
                         <h3 className="font-semibold mb-2">CHANGE ORDER DETAILS</h3>
                         <p>
                           This change order modifies the original Service Contract Agreement 
                           {estimate.estimate_number} dated {new Date(estimate.issue_date).toLocaleDateString()}.
                         </p>
                       </div>

                       <div>
                         <h3 className="font-semibold mb-2">MODIFICATIONS</h3>
                         <div className="space-y-2">
                           <div className="border border-gray-300 rounded p-3">
                             <p className="text-gray-600 italic">No change orders have been issued for this project.</p>
                           </div>
                         </div>
                       </div>

                       <div>
                         <h3 className="font-semibold mb-2">COST IMPACT</h3>
                         <div className="flex justify-between">
                           <span>Original Contract Amount</span>
                           <span>{formatCurrency(estimate.total_amount)}</span>
                         </div>
                         <div className="flex justify-between">
                           <span>Change Order Amount</span>
                           <span>$0.00</span>
                         </div>
                         <div className="flex justify-between font-semibold border-t border-gray-300 pt-2">
                           <span>New Total Contract Amount</span>
                           <span>{formatCurrency(estimate.total_amount)}</span>
                         </div>
                       </div>
                     </div>

                     <div className="mt-6 p-4 bg-gray-100 rounded-lg text-center">
                       <p className="text-sm text-gray-600">
                         Change orders will appear here when modifications are made to the original contract scope.
                       </p>
                     </div>
                   </div>
                 </div>
               </>
             ) : (
               <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-6 text-center">
                 <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-400 mb-2">No Contract Available</h3>
                 <p className="text-sm text-gray-500">Add line items to your estimate to generate contracts.</p>
               </div>
             )}
           </div>
         )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-[#1E1E1E] rounded-lg border border-[#333333] p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Share Estimate</h3>
            <p className="text-gray-400 mb-4">
              Generate a shareable link for this estimate. Clients can view and accept/reject the estimate without needing to log in.
            </p>
            
            <div className="bg-[#121212] border border-[#333333] rounded-lg p-3 mb-4">
              <div className="text-xs text-gray-400 mb-1">Shareable Link</div>
              <div className="text-sm text-white break-all">
                {`${window.location.origin}/share/estimate/${estimate.id}`}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleCopyShareLink();
                  setShowShareModal(false);
                }}
                className="px-4 py-2 bg-[#336699] hover:bg-[#2A5580] text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Link
              </button>
              <button
                onClick={() => {
                  window.open(`/share/estimate/${estimate.id}`, '_blank');
                  setShowShareModal(false);
                }}
                className="px-4 py-2 bg-[#F9D71C] hover:bg-[#F9D71C]/90 text-black rounded-lg transition-colors flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Invoice Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDepositModal(false)} />
          <div className="relative bg-[#1E1E1E] rounded-lg border border-[#333333] p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Create Deposit Invoice</h3>
            <p className="text-gray-400 mb-6">
              Create a partial invoice for a deposit payment. The remaining balance can be invoiced later.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Deposit Percentage
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="5"
                  value={depositPercentage}
                  onChange={(e) => setDepositPercentage(Number(e.target.value))}
                  className="flex-1"
                />
                <div className="w-20 text-center">
                  <input
                    type="number"
                    min="10"
                    max="90"
                    value={depositPercentage}
                    onChange={(e) => setDepositPercentage(Number(e.target.value))}
                    className="w-full bg-[#333] border border-[#555] rounded px-2 py-1 text-white text-center"
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-[#2a2a2a] rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Estimate Total:</span>
                  <span className="text-white">{formatCurrency(estimate.total_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Deposit Amount:</span>
                  <span className="text-[#F9D71C] font-semibold">
                    {formatCurrency(estimate.total_amount * (depositPercentage / 100))}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDepositModal(false)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDepositInvoice}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Create Deposit Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Selection Modal */}
      {showProjectSelectionModal && (
        <ProjectSelectionModal
          isOpen={showProjectSelectionModal}
          onClose={() => {
            setShowProjectSelectionModal(false);
            setPendingInvoiceType(null);
          }}
          onSelect={handleProjectSelection}
          clientId={estimate?.client_id}
          estimateTitle={estimate?.title || estimate?.estimate_number}
        />
      )}

      {/* Project Creation Modal */}
      {showProjectSelectionModal && estimate && (
        <ProjectCreationModal
          isOpen={showProjectSelectionModal}
          onClose={() => {
            setShowProjectSelectionModal(false);
            setPendingInvoiceType(null);
          }}
          onSuccess={handleProjectCreated}
          workPack={{
            id: estimate.id || '',
            name: estimate.title || estimate.estimate_number || 'Project',
            description: estimate.description || '',
            base_price: estimate.total_amount,
            items: estimate.items || []
          }}
        />
      )}

      {/* Mobile Sticky Action Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-[#333] p-4 z-40">
        <div className="flex items-center justify-around gap-2">
          {estimate.status === 'draft' && (
            <button 
              onClick={() => handleStatusUpdate('sent')}
              className="flex-1 bg-[#336699] text-white px-3 py-3 rounded-lg text-sm font-medium"
            >
              Send
            </button>
          )}
          
          {estimate.status === 'accepted' && !estimate.converted_to_invoice_id && (
            <button
              onClick={() => handleConvertToInvoice(false)}
              className="flex-1 bg-green-600 text-white px-3 py-3 rounded-lg text-sm font-medium"
            >
              Invoice
            </button>
          )}
          
          <button 
            onClick={() => setShowEditModal(true)}
            className="flex-1 bg-[#F9D71C] text-black px-3 py-3 rounded-lg text-sm font-medium"
          >
            Edit
          </button>
          
          <button 
            onClick={() => setShowShareModal(true)}
            className="flex-1 bg-[#2a2a2a] text-white px-3 py-3 rounded-lg text-sm font-medium"
          >
            Share
          </button>
        </div>
      </div>

      {/* Edit Estimate Modal */}
      {showEditModal && (
        <CreateEstimateDrawer
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={handleEditSave}
          editingEstimate={estimate}
        />
      )}

      {/* Map Modal */}
      {showMapModal && estimate?.client?.address && (
        <MapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          address={estimate.client.address}
          clientName={estimate.client.name}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-white/10 shadow-2xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Estimate</h3>
              <p className="text-white/60 mb-6">
                Are you sure you want to delete estimate "{estimate?.title || estimate?.estimate_number}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={handleDeleteCancel}
                  className="h-12 px-6 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all font-medium border border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="h-12 px-6 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-400 hover:to-red-500 transition-all font-medium flex items-center gap-3 shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Pricing Selector for adding items in edit mode */}
      {showPricingSelector && selectedOrg && (
        <ContextualPricingSelector
          isOpen={showPricingSelector}
          onClose={() => setShowPricingSelector(false)}
          onAddItems={(items) => {
            // Add new items to estimate
            const newEstimateItems = items.map(item => ({
              id: `new-${Date.now()}-${Math.random()}`,
              product_id: item.lineItemId,
              description: item.name,
              quantity: item.quantity,
              unit_price: item.price,
              total_price: item.price * item.quantity,
              unit: item.unit
            }));
            
            setEstimate({
              ...estimate,
              items: [...(estimate?.items || []), ...newEstimateItems]
            });
            setShowPricingSelector(false);
          }}
          organizationId={selectedOrg.id}
          projectContext={{
            projectType: estimate?.project?.category,
            packageLevel: estimate?.package_level,
            packageId: estimate?.package_id
          }}
        />
      )}

      {/* Pricing Strategy Modal */}
      {showPricingStrategy && estimate && (
        <PricingStrategyModal
          isOpen={showPricingStrategy}
          onClose={() => setShowPricingStrategy(false)}
          items={estimate.items.map(item => ({
            id: item.id,
            name: item.name,
            capPrice: item.cap_price || item.price,
            currentPrice: item.price,
            redlinePrice: item.red_line_price || item.price * 0.7,
            quantity: item.quantity || 1,
            currentTotal: item.total,
            capTotal: (item.cap_price || item.price) * (item.quantity || 1),
            redlineTotal: (item.red_line_price || item.price * 0.7) * (item.quantity || 1)
          }))}
          onUpdatePrice={handlePriceUpdate}
          onBulkAdjust={handleBulkPriceAdjust}
        />
      )}

      {/* Fixed Total Bar - Always visible at bottom of screen */}
      {activeTab === 'items' && estimate.items && estimate.items.length > 0 && (
        <div className="fixed bottom-0 bg-[#15161f] border-t border-[#3c3d51] z-30" style={{ left: '480px', right: '320px' }}>
          <div className="flex items-center text-[12px] font-medium">
            <div className="w-20 py-2 px-3 text-gray-500 border-r border-[#3c3d51] text-center">
              {estimate.items.length} items
            </div>
            <div className="flex-1 py-2 px-3 text-right text-gray-500 border-r border-[#3c3d51]">
              Sum
            </div>
            <div className="w-32 py-2 px-3 text-right text-gray-300 border-r border-[#3c3d51]">
              {formatCurrency(estimate.subtotal)}
            </div>
            <div className="w-28 py-2 px-3 text-center text-gray-300 border-r border-[#3c3d51]">
              {estimate.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}
            </div>
            <div className="w-32 py-2 px-3 text-right border-r border-[#3c3d51] flex flex-col items-end">
              <span className="text-gray-300">{formatCurrency(estimate.total_amount)}</span>
              {(() => {
                const redlineTotal = estimate.items.reduce((sum, item) => {
                  const redlinePrice = item.red_line_price || (item.original_unit_price || item.unit_price) * 0.7;
                  return sum + (redlinePrice * (item.quantity || 1));
                }, 0);
                const capTotal = estimate.items.reduce((sum, item) => {
                  const capPrice = item.cap_price || item.original_unit_price || item.unit_price;
                  return sum + (capPrice * (item.quantity || 1));
                }, 0);
                
                if (redlineTotal > 0) {
                  return (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-500">Comm:</span>
                      <span className={`text-[11px] font-medium ${
                        estimate.total_amount <= redlineTotal ? 'text-red-400' : 
                        estimate.total_amount - redlineTotal > (capTotal - redlineTotal) * 0.6 ? 'text-green-400' : 
                        estimate.total_amount - redlineTotal > (capTotal - redlineTotal) * 0.3 ? 'text-yellow-400' : 'text-orange-400'
                      }`}>
                        {formatCurrency(Math.max(0, estimate.total_amount - redlineTotal))}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div className="w-10"></div>
          </div>
        </div>
      )}
    </div>
  );
};