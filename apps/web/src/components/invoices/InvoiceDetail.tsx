import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Eye, Send, Share2, Edit, Activity, CheckCircle, Copy } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { DetailSkeleton } from '../skeletons/DetailSkeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { InvoiceService } from '../../services/InvoiceService';

export const InvoiceDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);

  // Get navigation context from location state
  const fromProject = location.state?.from === 'project';
  const projectId = location.state?.projectId;
  const projectName = location.state?.projectName;

  const handleBackNavigation = () => {
    if (fromProject && projectId) {
      navigate(`/projects/${projectId}`);
    } else {
      navigate('/invoices');
    }
  };

  useEffect(() => {
    if (user && id) {
      fetchData();
    }
  }, [user, id]);

  const fetchData = async () => {
    try {
      const [invoiceRes, productsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('*, invoice_items(*)')
          .eq('id', id)
          .eq('user_id', user?.id)
          .single(),
        supabase
          .from('products')
          .select('*')
          .eq('user_id', user?.id)
      ]);

      if (invoiceRes.error) throw invoiceRes.error;
      if (productsRes.error) throw productsRes.error;

      if (invoiceRes.data) {
        setInvoice(invoiceRes.data);
        // Fetch client data
        const clientRes = await supabase
          .from('clients')
          .select('*')
          .eq('id', invoiceRes.data.client_id)
          .eq('user_id', user?.id)
          .single();

        if (clientRes.error) throw clientRes.error;
        setClient(clientRes.data);
      }

      setProducts(productsRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load invoice details');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !invoice || !client) {
    return (
      <div className="min-h-screen bg-[#000000] text-white">
        <DetailSkeleton />
      </div>
    );
  }

  const handleMarkAsPaid = async () => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('id', invoice.id);

      if (error) throw error;
      await fetchData();
    } catch (err) {
      console.error('Error marking invoice as paid:', err);
      setError('Failed to mark invoice as paid');
    }
  };

  const handleSendInvoice = async () => {
    if (!invoice || !client?.email) {
      alert('Cannot send invoice: Client email not found');
      return;
    }

    const confirmed = confirm(`Send this invoice to ${client.email}?`);
    if (!confirmed) return;

    try {
      const result = await InvoiceService.sendInvoice(invoice.id, client.email);
      
      if (!result.success) {
        alert(`Failed to send invoice: ${result.error}`);
        return;
      }
      
      alert('Invoice sent successfully!');
      await fetchData(); // Reload to show updated status
    } catch (err) {
      console.error('Error sending invoice:', err);
      alert('Failed to send invoice');
    }
  };

  const handleShare = () => {
    setShowShareModal(true);
  };

  const handleCopyShareLink = async () => {
    const shareUrl = `${window.location.origin}/share/invoice/${invoice.id}`;
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

  const subtotal = (invoice.invoice_items || []).reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);
  const tax = 0; // 0% tax for now
  const total = subtotal + tax;

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      {/* Header - Improved Two-Row Layout */}
      <div className="border-b border-[#333333] px-6 py-4">
        {/* Row 1: Navigation + Document Info */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackNavigation}
              className="p-2 hover:bg-[#333333] rounded-[4px] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{`INV-${invoice.id.slice(0, 8)}`}</h1>
              <span className={`text-xs px-3 py-1 rounded-[4px] font-medium uppercase ${
                invoice.status === 'paid' ? 'bg-green-500/20 text-green-300' :
                invoice.status === 'signed' ? 'bg-purple-500/20 text-purple-300' :
                invoice.status === 'overdue' ? 'bg-red-500/20 text-red-300' :
                invoice.status === 'sent' ? 'bg-blue-500/20 text-blue-300' :
                'bg-gray-500/20 text-gray-300'
              }`}>
                {invoice.status}
              </span>
              {fromProject && projectName && (
                <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded-[4px]">
                  from {projectName}
                </span>
              )}
              {invoice.last_sent_at && (
                <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded-[4px]">
                  Sent {new Date(invoice.last_sent_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons - Always visible on row 1 */}
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-sm hover:bg-[#2a2a2a] transition-colors text-sm"
              title="Share Invoice"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
            
            <button 
              className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-sm hover:bg-[#2a2a2a] transition-colors text-sm"
              title="Edit Invoice"
            >
              <Edit className="w-4 h-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            
            {invoice.status === 'draft' && (
              <button 
                onClick={handleSendInvoice}
                className="bg-[#336699] text-white px-3 py-2 rounded-sm hover:bg-[#2A5580] transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}
            
            {invoice.status === 'sent' && (
              <>
                <button 
                  onClick={handleSendInvoice}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] text-white px-3 py-2 rounded-[8px] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2 text-sm"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Resend</span>
                </button>
                <button 
                  onClick={handleMarkAsPaid}
                  className="bg-[#388E3C] text-white px-3 py-2 rounded-[8px] hover:bg-[#2E7D32] transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Mark Paid</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Client Information */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="text-white font-medium truncate">{client.name || client.company_name}</div>
            <div className="text-gray-500 text-sm whitespace-nowrap">
              Due {new Date(invoice.due_date).toLocaleDateString()}
            </div>
          </div>
          
          <div className="text-right text-sm text-gray-400 whitespace-nowrap ml-4">
            Total: <span className="text-[#F9D71C] font-semibold text-base">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[#181818] text-white rounded-[4px] shadow-lg p-8 min-h-[800px] border border-[#333333]">
            {/* Invoice Header */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Your Company</h1>
                <div className="text-sm text-gray-400">
                  <p>123 Business Street</p>
                  <p>City, State 12345</p>
                  <p>(555) 123-4567</p>
                  <p>info@yourcompany.com</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-white mb-2">{`INV-${invoice.id.slice(0, 8)}`}</h2>
                <div className="text-sm text-gray-400">
                  <p>Created: {new Date(invoice.issue_date).toLocaleDateString()}</p>
                  <p>Due: {new Date(invoice.due_date).toLocaleDateString()}</p>
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-2 ${
                  invoice.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                  invoice.status === 'signed' ? 'bg-purple-500/20 text-purple-400' :
                  invoice.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                  invoice.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {invoice.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Bill To Section */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">BILL TO</h3>
              <div className="text-sm text-white">
                <p className="font-semibold">{client.name || client.company_name}</p>
                <p className="text-gray-400">{client.address}</p>
                <p className="text-gray-400">{client.email}</p>
                <p className="text-gray-400">{client.phone}</p>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-[#333333]">
                    <th className="text-left py-3 text-sm font-semibold text-gray-400">ITEM</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-400">QTY</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-400">RATE</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-400">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.invoice_items || []).map((item: any, index: number) => {
                    const product = products.find(p => p.id === item.product_id);
                    return (
                      <tr key={index} className="border-b border-[#333333]">
                        <td className="py-4">
                          <div>
                            <p className="font-medium text-white">{product?.name || item.description || 'Service'}</p>
                            <p className="text-sm text-gray-400">{item.description || product?.description}</p>
                          </div>
                        </td>
                        <td className="text-right py-4 text-white">{item.quantity}</td>
                        <td className="text-right py-4 text-white">{formatCurrency(item.unit_price)}</td>
                        <td className="text-right py-4 text-white font-medium">{formatCurrency(item.unit_price * item.quantity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64">
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-white">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-gray-400">Tax (0%)</span>
                  <span className="text-white">{formatCurrency(tax)}</span>
                </div>
                <div className="border-t border-[#333333] pt-2">
                  <div className="flex justify-between py-2">
                    <span className="text-lg font-bold text-white">Total</span>
                    <span className="text-lg font-bold text-white">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-[#1E1E1E] rounded-lg border border-[#333333] p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Share Invoice</h3>
            <p className="text-gray-400 mb-4">
              Generate a shareable link for this invoice. Clients can view the invoice without needing to log in.
            </p>
            
            <div className="bg-[#121212] border border-[#333333] rounded-lg p-3 mb-4">
              <div className="text-xs text-gray-400 mb-1">Shareable Link</div>
              <div className="text-sm text-white break-all">
                {`${window.location.origin}/share/invoice/${invoice.id}`}
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
                  window.open(`/share/invoice/${invoice.id}`, '_blank');
                  setShowShareModal(false);
                }}
                className="px-4 py-2 bg-[#EAB308] hover:bg-[#D97706] text-black rounded-lg transition-colors flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};