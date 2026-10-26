import { FEATURES } from '../../config/features';
import React, { useState, useEffect, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Edit, Send, Share2, Trash2,
  CheckCircle, XCircle, FileText, User,
  Phone, Mail, MapPin, Copy, Eye, Calendar, X, MoreVertical
} from 'lucide-react';
import { EstimateService, Estimate, EstimateItem } from '../../services/EstimateService';
import { priceAt } from '../../utils/priceRange';
import { formatCurrency } from '../../utils/format';
import { clientsAPI, organizationsAPI } from '../../lib/api';
import { Business, changesSinceSigned, contractFor } from '../../services/contract';
import { CreateEstimateDrawer } from './CreateEstimateDrawer';
import { MapModal } from '../common/MapModal';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { AirtableEstimateView } from './AirtableEstimateView';
import { AirtableSidebar } from './AirtableSidebar';
import { ItemPricingDrawer } from './ItemPricingDrawer';
import { ContextualPricingSelector } from './ContextualPricingSelector';
import { DesignUpload } from './DesignUpload';
import { PaymentsTab } from './PaymentsTab';
import { RemindersCard } from './RemindersCard';
import { JobPhotos } from '../common/JobPhotos';
import { ContractTab } from './ContractTab';
import { copyText, duplicateEstimate, sendEstimateLink } from './estimateActions';

// Header actions share one size so they line up; only the main action is filled.
const actionBase = 'h-9 flex items-center gap-2 px-4 border rounded-sm transition-colors text-sm font-medium';
const primaryAction = `${actionBase} bg-[#336699] border-[#336699] text-white hover:bg-[#2a5580]`;
const secondaryAction = `${actionBase} bg-transparent border-[#333333] text-gray-200 hover:bg-[#22272d] hover:text-white`;

/** Fills in the price-range defaults the pricing tools expect, on a copy. */
function prepare(estimate: Estimate): Estimate {
  if (!estimate.items) return estimate;
  return {
    ...estimate,
    items: estimate.items.map((item) => ({
      ...item,
      original_unit_price: item.original_unit_price || item.unit_price,
      cap_price: item.cap_price || item.unit_price,
      red_line_price: item.red_line_price || item.unit_price * 0.7,
    })),
  };
}

/** Pop-ups centred on the whole screen and above the estimate drawer, not boxed inside it. */
const OnTop: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(<div className="relative z-[10010]">{children}</div>, document.body);

interface EstimateDetailProps {
  /** The estimate to show; the route's :id when not given. */
  estimateId?: string;
  /** Closes the estimate (the drawer); without it, leaving goes to the list. */
  onClose?: () => void;
  /** Shown in the estimate drawer rather than as a page. */
  inDrawer?: boolean;
}

export const EstimateDetail: React.FC<EstimateDetailProps> = ({ estimateId, onClose, inDrawer = false }) => {
  const params = useParams<{ id: string }>();
  const id = estimateId ?? params.id;
  const navigate = useNavigate();
  const leave = () => (onClose ? onClose() : navigate('/estimates'));
  const { selectedOrg } = useContext(OrganizationContext);
  // The business named on the contract documents.
  const [business, setBusiness] = useState<Business | null>(null);
  useEffect(() => {
    if (!selectedOrg?.id) return;
    let cancelled = false;
    organizationsAPI
      .getById(selectedOrg.id)
      .then((org: Business | null) => !cancelled && setBusiness(org))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedOrg?.id]);

  // An estimate already loaded (from the list) shows at once; the latest copy loads behind it.
  const [estimate, setEstimate] = useState<Estimate | null>(() => {
    const known = id ? EstimateService.cached(id) : undefined;
    return known ? prepare(known) : null;
  });
  const [loading, setLoading] = useState(() => !(id && EstimateService.cached(id)));
  const [showShareModal, setShowShareModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // Edit mode removed - cells are always editable
  const [showPricingSelector, setShowPricingSelector] = useState(false);
  // Item edits save in the background, one save at a time with the latest items.
  const pendingItems = useRef<EstimateItem[] | null>(null);
  const savingItems = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The item whose price is being edited in the pricing drawer.
  const [pricingItemId, setPricingItemId] = useState<string | null>(null);
  
  // Tab state - Default to Line Items for immediate visibility (3-tab structure)
  const [activeTab, setActiveTab] = useState<'items' | 'overview' | 'contract' | 'payments'>('items');
  // The contract tab's inline document preview that's open.

  // The client link, loaded when it's first needed (Share or Send).
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const openShareModal = async () => {
    setShowShareModal(true);
    if (shareUrl || !estimate?.id) return;
    try {
      setShareUrl(await EstimateService.shareUrl(estimate.id));
    } catch (error) {
      console.error('Error creating share link:', error);
    }
  };

  // Choosing the estimate's client from the Overview.
  const [choosingClient, setChoosingClient] = useState(false);
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; name: string }> | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const loadClientOptions = async () => {
    if (clientOptions !== null || !selectedOrg?.id) return;
    try {
      const rows = await clientsAPI.list(selectedOrg.id);
      setClientOptions(
        rows
          .map((c: { _id?: string; id?: string; name: string }) => ({ id: (c.id ?? c._id) as string, name: c.name }))
          .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
      );
    } catch (err) {
      console.error('Error loading clients:', err);
      setClientOptions([]);
    }
  };
  // With no client yet, the picker shows straight away on the Overview.
  useEffect(() => {
    if (activeTab === 'overview' && estimate && !estimate.client) loadClientOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, estimate?.client]);
  const startChoosingClient = () => {
    setChoosingClient(true);
    loadClientOptions();
  };
  const chooseClient = async (clientId: string) => {
    if (!estimate?.id) return;
    setSavingClient(true);
    try {
      await EstimateService.update(estimate.id, { client_id: clientId });
      await loadEstimate(true);
      setChoosingClient(false);
    } catch (err) {
      console.error('Error setting client:', err);
      alert("The client couldn't be saved. Please try again.");
    } finally {
      setSavingClient(false);
    }
  };
  // The total bar is fixed to the screen bottom; it follows the table column's position and width.
  const [tableColumn, setTableColumn] = useState<HTMLDivElement | null>(null);
  const [totalBarBox, setTotalBarBox] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    if (!tableColumn) return;
    const measure = () => {
      const rect = tableColumn.getBoundingClientRect();
      setTotalBarBox({ left: rect.left, width: rect.width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tableColumn);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [tableColumn]);

  // Loads the estimate; quietly (no loading screen) after a change made here.
  const loadEstimate = async (quiet = false) => {
    if (!id) return;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await EstimateService.getById(id);
      setEstimate(result ? prepare(result) : result);
    } catch (err) {
      console.error('Error fetching estimate:', err);
      if (!quiet) setError('Failed to load estimate');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    // As a page it opens at the top; in the drawer the list behind stays put.
    if (!inDrawer) window.scrollTo(0, 0);
    // Shown from what's already loaded: refresh without the loading screen.
    loadEstimate(Boolean(id && EstimateService.cached(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusUpdate = async (status: Estimate['status']) => {
    if (!estimate?.id) return;
    try {
      await EstimateService.updateStatus(estimate.id, status);
      await loadEstimate(true);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update estimate status');
    }
  };

  /**
   * Sends the client the estimate's link: the iPad share sheet (Messages,
   * Mail, AirDrop…) where there is one, otherwise the link is copied.
   * A draft becomes Sent.
   */
  const handleSend = async () => {
    if (!estimate?.id) return;
    try {
      const url = await sendEstimateLink(estimate);
      if (!url) return;
      setShareUrl(url);
      await loadEstimate(true);
    } catch (error) {
      console.error('Error sending estimate:', error);
      alert("The estimate link couldn't be created. Please try again.");
    }
  };

  /** A new draft with the same client, project and items, opened straight away. */
  const handleDuplicate = async () => {
    if (!estimate) return;
    const orgId = estimate.organization_id || selectedOrg?.id;
    if (!orgId) return;
    try {
      const copy = await duplicateEstimate(estimate, orgId);
      if (copy.id) navigate(`/estimates/${copy.id}`, { replace: inDrawer });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not duplicate the estimate');
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!estimate?.id) return;

    try {
      await EstimateService.delete(estimate.id);
      leave();
    } catch (error) {
      console.error('Error deleting estimate:', error);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    await copyText(shareUrl);
    alert('Link copied. Paste it into a text or email to your client.');
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

  const saveItems = async (estimateId: string) => {
    if (savingItems.current) return;
    savingItems.current = true;
    try {
      while (pendingItems.current) {
        const items = pendingItems.current;
        pendingItems.current = null;
        await EstimateService.update(estimateId, { items });
      }
      setSaveError(null);
    } catch (error) {
      console.error('Error saving estimate items:', error);
      setSaveError("Couldn't save your last change. It will be saved with your next edit.");
    } finally {
      savingItems.current = false;
    }
  };

  /**
   * The one way items change on this page: keeps prices at or above each
   * item's red line, recalculates totals, shows the result and saves it.
   */
  const commitItems = (items: EstimateItem[]) => {
    if (!estimate) return;
    const nextItems = items.map(item => {
      const unitPrice = Math.max(Number(item.unit_price) || 0, item.red_line_price ?? 0);
      return { ...item, unit_price: unitPrice, total_price: unitPrice * (Number(item.quantity) || 0) };
    });
    const subtotal = nextItems.reduce((sum, item) => sum + item.total_price, 0);
    const taxAmount = estimate.tax_rate ? (subtotal * estimate.tax_rate / 100) : 0;
    setEstimate({
      ...estimate,
      items: nextItems,
      subtotal,
      tax_amount: taxAmount,
      total_amount: subtotal + taxAmount
    });
    pendingItems.current = nextItems;
    saveItems(estimate.id!);
  };

  const handleBulkPriceAdjust = (position: number) => {
    if (!estimate) return;
    commitItems(estimate.items.map(item => ({
      ...item,
      unit_price: priceAt({ redLine: item.red_line_price ?? 0, cap: item.cap_price ?? item.unit_price }, position)
    })));
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
    // Shaped like the estimate itself: header, tabs, pricing options and line items.
    const bar = (w: string, h = 'h-4') => <div className={`${w} ${h} bg-[#262626] rounded animate-pulse`} />;
    return (
      <div className={`${inDrawer ? 'h-full overflow-hidden' : 'min-h-screen'} bg-[#000000] text-white flex flex-col`} aria-busy="true">
        {/* Header: close, number and status; actions on the right */}
        <div className="border-b border-[#333333] px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {bar('w-6', 'h-6')}
              {bar('w-44', 'h-7')}
              {bar('w-14', 'h-6')}
            </div>
            <div className="flex items-center gap-2">
              {bar('w-20', 'h-9')}
              {bar('w-20', 'h-9')}
              {bar('w-9', 'h-9')}
            </div>
          </div>
          <div className="mt-3">{bar('w-48')}</div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 px-4 py-3 border-b border-[#333333]">
          {bar('w-20')}
          {bar('w-16')}
          {bar('w-16')}
        </div>

        {/* Pricing options beside the line items */}
        <div className="flex flex-1 min-h-0">
          <div className="w-[168px] flex-shrink-0 border-r border-[#333333] py-2 space-y-4 px-3">
            {['w-28', 'w-24', 'w-24', 'w-24', 'w-20', 'w-20'].map((w, i) => (
              <div key={i}>{bar(w)}</div>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4 px-3 py-3 border-b border-[#333333]">
              <div className="flex-1">{bar('w-24')}</div>
              {bar('w-14')}
              {bar('w-8')}
              {bar('w-14')}
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-3 py-3 border-b border-[#333333]">
                <div className="flex-1">{bar(i % 2 ? 'w-40' : 'w-56')}</div>
                {bar('w-16')}
                {bar('w-6')}
                {bar('w-16')}
              </div>
            ))}
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
          onClick={leave}
          className="text-[#5b8fc7] hover:text-white transition-colors"
        >
          Back to Estimates
        </button>
      </div>
    );
  }

  const totalBar = estimate.items && estimate.items.length > 0 ? (
          <div className="flex items-center text-[12px] font-medium">
      <div className="w-20 py-2 px-3 text-gray-500 border-r border-[#333333] text-center">
        {estimate.items.length} items
      </div>
      <div className="flex-1 py-2 px-3 text-right text-gray-500 border-r border-[#333333]">
        Sum
      </div>
      <div className="w-28 py-2 px-3 text-right text-gray-300 border-r border-[#333333]">
        {formatCurrency(estimate.subtotal)}
      </div>
      <div className="w-16 py-2 px-2 text-center text-gray-300 border-r border-[#333333]">
        {estimate.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}
      </div>
      <div className="w-28 py-2 px-3 text-right border-r border-[#333333] flex flex-col items-end">
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
    </div>
  ) : null;

  // The contract documents follow the estimate until it's accepted.
  const contract = contractFor(estimate, business);
  const changeOrder = changesSinceSigned(estimate);

  return (
    <div className={`${inDrawer ? 'h-full' : 'min-h-screen'} bg-[#000000] flex flex-col`}>
      {/* Fixed Header */}
      <div className="sticky top-0 z-30 bg-[#1a1a1a] border-b border-[#333333] flex-shrink-0">
        {/* Row 1: Navigation + Document Info */}
        <div className="flex items-center justify-between mb-2 px-3 py-2">
          <div className="flex items-center gap-4">
            <button
              onClick={leave}
              aria-label={inDrawer ? 'Close' : 'Back to estimates'}
              className="p-2 hover:bg-[#333333] rounded-[4px] transition-colors"
            >
              {inDrawer ? <X className="w-4 h-4 text-gray-400" /> : <ArrowLeft className="w-4 h-4 text-gray-400" />}
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

          {/* Actions: quiet secondary buttons, then the one primary action on the right */}
          <div className="flex items-center gap-2">
            <button
              onClick={openShareModal}
              className={secondaryAction}
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>


            {/* Resend - for already sent estimates */}
            {estimate.status === 'sent' && estimate.client?.email && (
              <button
                onClick={handleSend}
                className={secondaryAction}
              >
                <Send className="w-4 h-4" />
                Resend
              </button>
            )}

            {/* Send - for draft status */}
            {estimate.status === 'draft' && (
              <button
                onClick={handleSend}
                className={primaryAction}
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            )}

            {/* The rest: the client's answer, duplicate and delete */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu((open) => !open)}
                aria-label="More actions"
                className={`${secondaryAction} px-2.5`}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-[#1E1E1E] border border-[#333333] shadow-lg z-50 py-1">
                    {(estimate.status === 'sent' || estimate.status === 'opened') && (
                      <>
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            handleStatusUpdate('accepted');
                          }}
                          className="w-full flex items-center px-3 py-2.5 text-sm text-white hover:bg-[#333333]"
                        >
                          <CheckCircle className="w-4 h-4 mr-3 text-green-400" />
                          Mark as accepted
                        </button>
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            handleStatusUpdate('rejected');
                          }}
                          className="w-full flex items-center px-3 py-2.5 text-sm text-white hover:bg-[#333333]"
                        >
                          <XCircle className="w-4 h-4 mr-3 text-gray-400" />
                          Mark as declined
                        </button>
                        <div className="border-t border-[#333333] my-1" />
                      </>
                    )}
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleDuplicate();
                      }}
                      className="w-full flex items-center px-3 py-2.5 text-sm text-white hover:bg-[#333333]"
                    >
                      <Copy className="w-4 h-4 mr-3 text-gray-400" />
                      Duplicate
                    </button>
                    <div className="border-t border-[#333333] my-1" />
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleDeleteClick();
                      }}
                      className="w-full flex items-center px-3 py-2.5 text-sm text-red-400 hover:bg-[#333333]"
                    >
                      <Trash2 className="w-4 h-4 mr-3" />
                      Delete estimate
                    </button>
                  </div>
                </>
              )}
            </div>
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
              { id: 'contract', label: 'Contract' },
              { id: 'payments', label: 'Payments' }
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
      <div
        className={`flex-1 ${inDrawer ? 'min-h-0' : ''} ${inDrawer && activeTab === 'items' ? 'overflow-hidden' : 'overflow-y-auto'}`}
        style={{ paddingBottom: activeTab === 'items' && !inDrawer ? '60px' : '0' }}
      >
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="p-4 space-y-4">
            {/* Summary: total, items and dates (status is in the header) */}
            <div className="bg-[#1a1a1a] rounded-lg border border-[#333] grid grid-cols-3 divide-x divide-[#333]">
              <div className="p-4 min-w-0">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total</div>
                <div className="text-lg font-semibold text-[#5b8fc7] whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatCurrency(estimate.total_amount)}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Items</div>
                <div className="text-lg font-semibold text-white">{estimate.items?.length || 0}</div>
              </div>
              <div className="p-4 text-sm space-y-0.5">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Dates</div>
                <div className="text-white">Created {new Date(estimate.issue_date).toLocaleDateString()}</div>
                {estimate.expiry_date && (
                  <div className="text-gray-400">Expires {new Date(estimate.expiry_date).toLocaleDateString()}</div>
                )}
                {estimate.last_sent_at && (
                  <div className="text-gray-400">Sent {new Date(estimate.last_sent_at).toLocaleDateString()}</div>
                )}
              </div>
            </div>
            {FEATURES.projects && estimate.project && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${estimate.project!.id}`)}
                className="-mt-3 text-sm text-gray-400 hover:text-white"
              >
                Project: <span className="text-[#336699] hover:underline">{estimate.project.name}</span>
              </button>
            )}

            {/* Client: pick one here when there's none, or change it */}
            <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Client</h3>
                {estimate.client && !choosingClient && (
                  <button type="button" onClick={startChoosingClient} className="text-xs text-[#336699] hover:text-white">
                    Change
                  </button>
                )}
              </div>
              {estimate.client && !choosingClient ? (
                <div className="space-y-1.5">
                  <div className="text-base font-medium text-white">{estimate.client.name}</div>
                  {estimate.client.email && (
                    <a href={`mailto:${estimate.client.email}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
                      <Mail className="w-4 h-4" />
                      <span>{estimate.client.email}</span>
                    </a>
                  )}
                  {estimate.client.phone && (
                    <a href={`tel:${estimate.client.phone}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
                      <Phone className="w-4 h-4" />
                      <span>{estimate.client.phone}</span>
                    </a>
                  )}
                  {estimate.client.address && (
                    <button
                      type="button"
                      onClick={() => setShowMapModal(true)}
                      className="flex items-start gap-2 text-sm text-gray-400 hover:text-white text-left"
                      title="View on map"
                    >
                      <MapPin className="w-4 h-4 mt-0.5" />
                      <span className="hover:underline">{estimate.client.address}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Choose client"
                    value=""
                    disabled={clientOptions === null || savingClient}
                    onChange={(e) => e.target.value && chooseClient(e.target.value)}
                    className="flex-1 min-w-0 bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699]"
                  >
                    <option value="">
                      {savingClient ? 'Saving…' : clientOptions === null ? 'Loading clients…' : clientOptions.length ? 'Choose client' : 'No clients yet'}
                    </option>
                    {(clientOptions ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {estimate.client && (
                    <button type="button" onClick={() => setChoosingClient(false)} className="text-xs text-gray-400 hover:text-white px-2 py-2">
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Reminder emails while the client hasn't signed */}
            {estimate.id && <RemindersCard estimateId={estimate.id} />}

            {/* Job photos */}
            {estimate.id && (estimate.organization_id || selectedOrg?.id) && (
              <JobPhotos organizationId={(estimate.organization_id || selectedOrg?.id)!} estimateId={estimate.id} />
            )}

            {/* Agreed design: shown on the contract */}
            <DesignUpload estimateId={estimate.id!} design={estimate.design} onChange={() => loadEstimate(true)} />

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
          <div className={`w-full flex ${inDrawer ? 'h-full' : ''}`}>
            {/* Airtable Sidebar */}
            <AirtableSidebar
              fill={inDrawer}
              onViewChange={(_viewId, position) => handleBulkPriceAdjust(position)}
              itemsTotal={estimate.items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0}
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
            <div className={`flex-1 min-w-0 ${inDrawer ? 'flex flex-col min-h-0' : ''}`} ref={inDrawer ? undefined : setTableColumn}>
              <div className={inDrawer ? 'flex-1 min-h-0' : ''}>
              <AirtableEstimateView
          fill={inDrawer}
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
            commitItems(estimate.items.map(item => {
              if (item.id !== itemId) return item;
              if (field === 'name') return { ...item, description: value };
              if (field === 'quantity') return { ...item, quantity: value };
              if (field === 'price') return { ...item, unit_price: value };
              return item;
            }));
          }}
          onAddItem={() => setShowPricingSelector(true)}
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
          onEditPrice={setPricingItemId}
        />
              </div>
              {/* In the drawer the total bar sits at the bottom of the table column. */}
              {inDrawer && totalBar && (
                <div className="flex-shrink-0 bg-[#1D1F25] border-t border-[#333333]">{totalBar}</div>
              )}
            </div>
          </div>
        )}


         {/* Contract Tab */}
         {activeTab === 'payments' && estimate.id && <PaymentsTab estimateId={estimate.id} />}

         {activeTab === 'contract' && (
           <div className="p-4">
             {estimate.items && estimate.items.length > 0 ? (
               <ContractTab
                 estimate={estimate}
                 contract={contract}
                 changeOrder={changeOrder}
                 organizationId={estimate.organization_id || selectedOrg?.id}
               />
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
        <OnTop>
        <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-[#1E1E1E] rounded-lg border border-[#333333] p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Share Estimate</h3>
            <p className="text-gray-400 mb-4">
              Anyone with this link can view the estimate and accept or decline it, without logging in.
            </p>
            
            <div className="bg-[#121212] border border-[#333333] rounded-lg p-3 mb-4">
              <div className="text-xs text-gray-400 mb-1">Shareable Link</div>
              <div className="text-sm text-white break-all">
                {shareUrl ?? 'Creating link…'}
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
                disabled={!shareUrl}
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
                disabled={!shareUrl}
                onClick={() => {
                  if (shareUrl) window.open(shareUrl, '_blank');
                  setShowShareModal(false);
                }}
                className="px-4 py-2 bg-[#336699] hover:bg-[#336699]/90 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
          </div>
        </div>
        </OnTop>
      )}

      {/* Mobile Sticky Action Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-[#333] p-4 z-40">
        <div className="flex items-center justify-around gap-2">
          {estimate.status === 'draft' && (
            <button 
              onClick={handleSend}
              className="flex-1 bg-[#336699] text-white px-3 py-3 rounded-lg text-sm font-medium"
            >
              Send
            </button>
          )}
          
          <button 
            onClick={() => setShowEditModal(true)}
            className="flex-1 bg-[#336699] text-white px-3 py-3 rounded-lg text-sm font-medium"
          >
            Edit
          </button>
          
          <button 
            onClick={openShareModal}
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
        <OnTop>
        <MapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          address={estimate.client.address}
          clientName={estimate.client.name}
        />
        </OnTop>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <OnTop>
        <div role="dialog" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
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
        </OnTop>
      )}

      <ItemPricingDrawer
        item={estimate.items?.find(item => item.id === pricingItemId) ?? null}
        onClose={() => setPricingItemId(null)}
        onSave={(changes) => {
          commitItems(estimate.items.map(item => item.id === pricingItemId ? { ...item, ...changes } : item));
        }}
        onRemove={() => {
          commitItems(estimate.items.filter(item => item.id !== pricingItemId));
        }}
      />

      {/* Save problems float over the page so nothing shifts */}
      {saveError && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] bg-[#1D1F25] border border-red-500/60 px-4 py-2 text-sm text-red-300 shadow-lg">
          {saveError}
        </div>
      )}

      {/* Contextual Pricing Selector for adding items in edit mode */}
      {showPricingSelector && selectedOrg && (
        <OnTop>
        <ContextualPricingSelector
          isOpen={showPricingSelector}
          onClose={() => setShowPricingSelector(false)}
          onAddItems={(items) => {
            const newEstimateItems: EstimateItem[] = items.map(item => ({
              id: `new-${Date.now()}-${Math.random()}`,
              product_id: item.lineItemId,
              description: item.name,
              quantity: item.quantity,
              unit_price: item.price,
              total_price: item.price * item.quantity,
              red_line_price: item.red_line_price,
              cap_price: item.cap_price
            }));
            commitItems([...(estimate?.items || []), ...newEstimateItems]);
            setShowPricingSelector(false);
          }}
          organizationId={selectedOrg.id}
          projectContext={{
            projectType: estimate?.project?.category,
            packageLevel: estimate?.package_level,
            packageId: estimate?.package_id
          }}
        />
        </OnTop>
      )}


      {/* Fixed Total Bar - Always visible at bottom of screen */}
      {!inDrawer && activeTab === 'items' && totalBar && totalBarBox && (
        <div className="fixed bottom-0 bg-[#1D1F25] border-t border-[#333333] z-30" style={{ left: totalBarBox.left, width: totalBarBox.width }}>
          {totalBar}
        </div>
      )}
    </div>
  );
};