import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, Filter, MoreVertical, 
  Eye, Edit, Trash2, Send, CheckCircle, 
  XCircle, AlertTriangle, Plus, Share2, Copy 
} from 'lucide-react';
import { EstimateService, Estimate } from '../../services/EstimateService';
import { OrganizationContext, LayoutContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';
import { TableSkeleton } from '../skeletons/TableSkeleton';
import { CreateEstimateDrawer } from '../estimates/CreateEstimateDrawer';

export const WorkEstimatesView: React.FC = () => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const { isConstrained } = useContext(LayoutContext);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Estimate['status']>('all');
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [editingEstimate, setEditingEstimate] = useState<Estimate | null>(null);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingEstimate, setSharingEstimate] = useState<Estimate | null>(null);
  const [deletingEstimate, setDeletingEstimate] = useState<Estimate | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    if (selectedOrg?.id) {
      loadEstimates();
    }
  }, [selectedOrg?.id]);

  const loadEstimates = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      setLoading(true);
      const data = await EstimateService.list(selectedOrg.id);
      setEstimates(data);
    } catch (error: any) {
      console.error('Error loading estimates:', error);
      setEstimates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEditEstimate = (estimate: Estimate) => {
    console.log('WorkEstimatesView handleEditEstimate called', estimate);
    setEditingEstimate(estimate);
    setShowEditDrawer(true);
  };

  const handleDeleteClick = (estimate: Estimate) => {
    setDeletingEstimate(estimate);
    setShowDeleteConfirm(true);
    setDropdownOpen(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingEstimate?.id) return;
    
    try {
      await EstimateService.delete(deletingEstimate.id);
      await loadEstimates();
      setShowDeleteConfirm(false);
      setDeletingEstimate(null);
    } catch (error) {
      console.error('Error deleting estimate:', error);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeletingEstimate(null);
  };

  const handleStatusUpdate = async (id: string, status: Estimate['status']) => {
    try {
      await EstimateService.updateStatus(id, status);
      await loadEstimates();
    } catch (error) {
      console.error('Error updating estimate status:', error);
    }
  };

  const getStatusIcon = (status: Estimate['status']) => {
    switch (status) {
      case 'draft': return <Edit className="w-4 h-4" />;
      case 'sent': return <Send className="w-4 h-4" />;
      case 'opened': return <Eye className="w-4 h-4" />;
      case 'accepted': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'expired': return <AlertTriangle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: Estimate['status']) => {
    switch (status) {
      case 'draft': return 'text-gray-400 bg-gray-400/10';
      case 'sent': return 'text-blue-400 bg-blue-400/10';
      case 'opened': return 'text-purple-400 bg-purple-400/10';
      case 'accepted': return 'text-green-400 bg-green-400/10';
      case 'rejected': return 'text-red-400 bg-red-400/10';
      case 'expired': return 'text-orange-400 bg-orange-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const filteredEstimates = estimates.filter(estimate => {
    const matchesSearch = 
      estimate.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estimate.estimate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estimate.client?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || estimate.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusCounts = estimates.reduce((acc, estimate) => {
    acc[estimate.status] = (acc[estimate.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header with title and add button */}
      <div className="px-6 py-4 border-b border-[#1E1E1E] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Estimates</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search estimates..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="px-3 py-1.5 bg-[#1E1E1E] border border-[#333] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
          />
          <button
            onClick={() => navigate('/estimates/new')}
            className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-100 rounded-lg text-black text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Estimate
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-4 bg-[#1E1E1E]/50 grid grid-cols-4 gap-6 min-h-[88px] flex-shrink-0">
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Total Estimates</div>
          <div className="text-xl font-semibold text-white mt-1">{estimates.length}</div>
          <div className="text-xs text-gray-500 mt-auto">all estimates</div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Total Value</div>
          <div className="text-xl font-semibold text-[#5b8fc7] mt-1">
            {formatCurrency(estimates.reduce((sum, est) => sum + est.total_amount, 0))}
          </div>
          <div className="text-xs text-gray-500 mt-auto">potential revenue</div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Accepted</div>
          <div className="text-xl font-semibold text-green-400 mt-1">{statusCounts.accepted || 0}</div>
          <div className="text-xs text-gray-500 mt-auto">
            {Math.round(((statusCounts.accepted || 0) / Math.max(estimates.length, 1)) * 100)}% win rate
          </div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Pending</div>
          <div className="text-xl font-semibold text-blue-400 mt-1">{statusCounts.sent || 0}</div>
          <div className="text-xs text-gray-500 mt-auto">{statusCounts.draft || 0} draft</div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-[#1E1E1E] flex items-center gap-4 flex-shrink-0">
        <select
          className="bg-[#1E1E1E] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Estimates ({estimates.length})</option>
          <option value="draft">Drafts ({statusCounts.draft || 0})</option>
          <option value="sent">Sent ({statusCounts.sent || 0})</option>
          <option value="opened">Opened ({statusCounts.opened || 0})</option>
          <option value="accepted">Accepted ({statusCounts.accepted || 0})</option>
          <option value="rejected">Rejected ({statusCounts.rejected || 0})</option>
          <option value="expired">Expired ({statusCounts.expired || 0})</option>
        </select>
        <button className="flex items-center gap-2 px-3 py-1.5 bg-[#1E1E1E] hover:bg-[#2A2A2A] border border-[#333] rounded-lg text-sm text-white transition-colors">
          <Filter className="w-4 h-4" />
          More Filters
        </button>
        <button className="ml-auto p-1.5 rounded hover:bg-[#2A2A2A] transition-colors">
          <MoreVertical className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={5} columns={6} />
          </div>
        ) : filteredEstimates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <FileText className="w-12 h-12 text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No estimates found</h3>
            <p className="text-gray-400 text-center mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your filters' 
                : 'Create your first estimate to get started'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <button
                onClick={() => navigate('/estimates/new')}
                className="px-4 py-2 bg-[#336699] hover:bg-[#2a5580] rounded-lg text-white font-medium transition-colors"
              >
                Create Estimate
              </button>
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {isConstrained ? (
              // Mobile/Constrained View - Card Layout
              <div className="space-y-2 p-4">
                {filteredEstimates.map((estimate) => (
                  <div
                    key={estimate.id}
                    onClick={() => navigate(`/estimates/${estimate.id}`)}
                    className="bg-[#1E1E1E] border border-[#333333] rounded-lg p-4 cursor-pointer hover:bg-[#252525] transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs px-2.5 py-1 font-medium ${getStatusColor(estimate.status)}`}>
                        {estimate.status.toUpperCase()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDropdownOpen(dropdownOpen === estimate.id ? null : estimate.id!);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-600 rounded"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    
                    <div className="mb-3">
                      <div className="font-medium text-white text-base">
                        {estimate.title || estimate.estimate_number}
                      </div>
                      <div className="text-sm text-gray-400">
                        {estimate.estimate_number}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-400">Amount</div>
                        <div className="font-mono text-white font-medium">
                          {formatCurrency(estimate.total_amount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Client</div>
                        <div className="text-white">
                          {estimate.client?.name || 'No client'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Date</div>
                        <div className="text-white">
                          {new Date(estimate.issue_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {dropdownOpen === estimate.id && (
                      <div className="absolute right-4 top-12 w-48 bg-[#1E1E1E] border border-[#333] rounded-lg shadow-lg z-50 py-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/estimates/${estimate.id}`);
                            setDropdownOpen(null);
                          }}
                          className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                        >
                          <Eye className="w-4 h-4 mr-3 text-gray-400" />
                          View Details
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditEstimate(estimate);
                            setDropdownOpen(null);
                          }}
                          className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                        >
                          <Edit className="w-4 h-4 mr-3 text-gray-400" />
                          Edit Estimate
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSharingEstimate(estimate);
                            setShowShareModal(true);
                            setDropdownOpen(null);
                          }}
                          className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                        >
                          <Share2 className="w-4 h-4 mr-3 text-gray-400" />
                          Share Estimate
                        </button>
                        {estimate.status === 'draft' && (
                          <>
                            <div className="border-t border-[#333] my-1"></div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusUpdate(estimate.id!, 'sent');
                                setDropdownOpen(null);
                              }}
                              className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                            >
                              <Send className="w-4 h-4 mr-3 text-gray-400" />
                              Send to Client
                            </button>
                          </>
                        )}
                        <div className="border-t border-[#333] my-1"></div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(estimate);
                          }}
                          className="w-full flex items-center px-3 py-2 text-sm text-red-400 hover:bg-[#2A2A2A] transition-colors"
                        >
                          <Trash2 className="w-4 h-4 mr-3" />
                          Delete Estimate
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Desktop View - Table Layout
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-[#1E1E1E] sticky top-0">
                    <tr className="text-xs text-gray-400 uppercase">
                      <th className="text-left px-4 py-3 font-medium">Estimate</th>
                      <th className="text-center px-3 py-3 font-medium">Status</th>
                      <th className="text-right px-3 py-3 font-medium">Amount</th>
                      <th className="text-left px-4 py-3 font-medium">Client</th>
                      <th className="text-left px-3 py-3 font-medium">Date</th>
                      <th className="text-right px-3 py-3 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEstimates.map((estimate) => (
                      <tr
                        key={estimate.id}
                        onClick={() => navigate(`/estimates/${estimate.id}`)}
                        className="border-b border-[#1E1E1E] hover:bg-[#1E1E1E]/50 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-4">
                          <div>
                            <div className="font-medium text-white">
                              {estimate.title || estimate.estimate_number}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {estimate.estimate_number}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(estimate.status)}`}>
                            {getStatusIcon(estimate.status)}
                            {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-right">
                          <div className="font-mono text-white">
                            {formatCurrency(estimate.total_amount)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-white">
                            {estimate.client?.name || 'No client'}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div className="text-sm text-white">
                            {new Date(estimate.issue_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-right">
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDropdownOpen(dropdownOpen === estimate.id ? null : estimate.id!);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-600 rounded"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-400" />
                            </button>
                            
                            {dropdownOpen === estimate.id && (
                              <div className="absolute right-0 top-8 w-48 bg-[#1E1E1E] border border-[#333] rounded-lg shadow-lg z-50 py-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/estimates/${estimate.id}`);
                                    setDropdownOpen(null);
                                  }}
                                  className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                                >
                                  <Eye className="w-4 h-4 mr-3 text-gray-400" />
                                  View Details
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditEstimate(estimate);
                                    setDropdownOpen(null);
                                  }}
                                  className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                                >
                                  <Edit className="w-4 h-4 mr-3 text-gray-400" />
                                  Edit Estimate
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSharingEstimate(estimate);
                                    setShowShareModal(true);
                                    setDropdownOpen(null);
                                  }}
                                  className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                                >
                                  <Share2 className="w-4 h-4 mr-3 text-gray-400" />
                                  Share Estimate
                                </button>
                                {estimate.status === 'draft' && (
                                  <>
                                    <div className="border-t border-[#333] my-1"></div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStatusUpdate(estimate.id!, 'sent');
                                        setDropdownOpen(null);
                                      }}
                                      className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#2A2A2A] transition-colors"
                                    >
                                      <Send className="w-4 h-4 mr-3 text-gray-400" />
                                      Send to Client
                                    </button>
                                  </>
                                )}
                                <div className="border-t border-[#333] my-1"></div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteClick(estimate);
                                  }}
                                  className="w-full flex items-center px-3 py-2 text-sm text-red-400 hover:bg-[#2A2A2A] transition-colors"
                                >
                                  <Trash2 className="w-4 h-4 mr-3" />
                                  Delete Estimate
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Estimate Drawer */}
      <CreateEstimateDrawer
        isOpen={showEditDrawer}
        onClose={() => {
          setShowEditDrawer(false);
          setEditingEstimate(null);
        }}
        editingEstimate={editingEstimate}
        onSave={async (data) => {
          try {
            if (editingEstimate) {
              // Update the estimate
              await EstimateService.update(editingEstimate.id!, {
                ...data,
                organization_id: selectedOrg?.id || '',
              });
              await loadEstimates();
              setShowEditDrawer(false);
              setEditingEstimate(null);
            }
          } catch (error) {
            console.error('Error updating estimate:', error);
          }
        }}
      />

      {/* Share Modal */}
      {showShareModal && sharingEstimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => {
            setShowShareModal(false);
            setSharingEstimate(null);
          }} />
          <div className="relative bg-[#1E1E1E] rounded-lg border border-[#333333] p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Share Estimate</h3>
            <p className="text-gray-400 mb-4">
              Generate a shareable link for this estimate. Clients can view the estimate without needing to log in.
            </p>
            
            <div className="bg-[#121212] border border-[#333333] rounded-lg p-3 mb-4">
              <div className="text-xs text-gray-400 mb-1">Shareable Link</div>
              <div className="text-sm text-white break-all">
                {`${window.location.origin}/share/estimate/${sharingEstimate.id}`}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setSharingEstimate(null);
                }}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const shareUrl = `${window.location.origin}/share/estimate/${sharingEstimate.id}`;
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    alert('Share link copied to clipboard!');
                  } catch (err) {
                    console.error('Failed to copy link:', err);
                    const textArea = document.createElement('textarea');
                    textArea.value = shareUrl;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    alert('Share link copied to clipboard!');
                  }
                  setShowShareModal(false);
                  setSharingEstimate(null);
                }}
                className="px-4 py-2 bg-[#336699] hover:bg-[#2A5580] text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Link
              </button>
              <button
                onClick={() => {
                  window.open(`/share/estimate/${sharingEstimate.id}`, '_blank');
                  setShowShareModal(false);
                  setSharingEstimate(null);
                }}
                className="px-4 py-2 bg-[#336699] hover:bg-[#2a5580] text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-white/10 shadow-2xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Estimate</h3>
              <p className="text-white/60 mb-6">
                Are you sure you want to delete estimate "{deletingEstimate?.title || deletingEstimate?.estimate_number}"? This action cannot be undone.
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
    </div>
  );
};