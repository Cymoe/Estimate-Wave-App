import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, FileText, Users, Plus, ArrowRight, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { DashboardLayout } from './layouts/DashboardLayout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from './common/PageHeader';
import { OrganizationContext } from './layouts/DashboardLayout';

interface Estimate {
  id: string;
  estimate_number: string;
  title: string;
  total_amount: number;
  status: string;
  created_at: string;
  client: {
    name: string;
  };
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  date: string;
  client: {
    name: string;
  };
}

interface Client {
  id: string;
  name: string;
  company_name: string;
  email: string;
  phone: string;
  created_at: string;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && selectedOrg?.id) {
      fetchDashboardData();
    }
  }, [user, selectedOrg?.id]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch recent estimates
      const { data: estimatesData, error: estimatesError } = await supabase
        .from('estimates')
        .select(`
          *,
          client:clients(name)
        `)
        .eq('organization_id', selectedOrg?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (estimatesError) throw estimatesError;

      // Fetch recent invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select(`
          *,
          client:clients(name)
        `)
        .eq('organization_id', selectedOrg?.id)
        .order('date', { ascending: false })
        .limit(5);

      if (invoicesError) throw invoicesError;

      // Fetch recent clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('organization_id', selectedOrg?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (clientsError) throw clientsError;

      setEstimates(estimatesData || []);
      setInvoices(invoicesData || []);
      setClients(clientsData || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateMetrics = () => {
    const totalRevenue = invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.total_amount, 0);

    const pendingRevenue = estimates
      .filter(est => est.status === 'pending' || est.status === 'sent')
      .reduce((sum, est) => sum + est.total_amount, 0);

    return {
      totalRevenue,
      totalEstimates: estimates.length,
      totalInvoices: invoices.length,
      totalClients: clients.length,
      pendingRevenue
    };
  };

  const metrics = calculateMetrics();

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'draft':
        return 'bg-gray-500/20 text-gray-400';
      case 'sent':
      case 'pending':
        return 'bg-blue-500/20 text-blue-400';
      case 'approved':
      case 'paid':
        return 'bg-green-500/20 text-green-400';
      case 'rejected':
      case 'overdue':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'draft':
        return <Clock className="w-3 h-3" />;
      case 'sent':
      case 'pending':
        return <AlertCircle className="w-3 h-3" />;
      case 'approved':
      case 'paid':
        return <CheckCircle className="w-3 h-3" />;
      case 'rejected':
      case 'overdue':
        return <XCircle className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  return (
    <DashboardLayout>
      <PageHeader hideTitle={true} />
      
      <div className="space-y-6">
        {/* Metrics Summary Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">Total Revenue</div>
                <div className="text-2xl font-semibold text-white">{formatCurrency(metrics.totalRevenue)}</div>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">Pending</div>
                <div className="text-2xl font-semibold text-white">{formatCurrency(metrics.pendingRevenue)}</div>
              </div>
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">Estimates</div>
                <div className="text-2xl font-semibold text-white">{metrics.totalEstimates}</div>
              </div>
              <FileText className="w-8 h-8 text-yellow-500" />
            </div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">Clients</div>
                <div className="text-2xl font-semibold text-white">{metrics.totalClients}</div>
              </div>
              <Users className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>

        {/* Recent Estimates Table */}
        <div className="bg-[#121212] rounded-lg border border-[#333333] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#333333] flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Recent Estimates</h2>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/estimates')}
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                View All
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/estimates')}
                className="px-3 py-1.5 bg-[#336699] text-white rounded text-sm font-medium hover:bg-[#2a5a8a] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Estimate
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : estimates.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">No estimates yet</p>
              <button
                onClick={() => navigate('/estimates')}
                className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2a5a8a] transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Your First Estimate
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider bg-[#1a1a1a]">
                <div className="col-span-5">Estimate</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-3">Client</div>
              </div>
              <div>
                {estimates.map((estimate) => (
                  <div
                    key={estimate.id}
                    onClick={() => navigate(`/estimates/${estimate.id}`)}
                    className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-[#1a1a1a] transition-colors cursor-pointer border-b border-[#333333]/50 last:border-b-0"
                  >
                    <div className="col-span-5">
                      <div className="font-medium text-white">{estimate.estimate_number}</div>
                      {estimate.title && (
                        <div className="text-xs text-gray-400 mt-0.5">{estimate.title}</div>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(estimate.status)}`}>
                        {getStatusIcon(estimate.status)}
                        {estimate.status}
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-mono text-white">
                      {formatCurrency(estimate.total_amount)}
                    </div>
                    <div className="col-span-3 text-sm text-gray-300">
                      {estimate.client?.name || 'No client'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recent Invoices Table */}
        <div className="bg-[#121212] rounded-lg border border-[#333333] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#333333] flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Recent Invoices</h2>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/invoices')}
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                View All
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/invoices')}
                className="px-3 py-1.5 bg-[#336699] text-white rounded text-sm font-medium hover:bg-[#2a5a8a] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Invoice
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">No invoices yet</p>
              <button
                onClick={() => navigate('/invoices')}
                className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2a5a8a] transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Your First Invoice
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider bg-[#1a1a1a]">
                <div className="col-span-5">Invoice</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-3">Client</div>
              </div>
              <div>
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                    className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-[#1a1a1a] transition-colors cursor-pointer border-b border-[#333333]/50 last:border-b-0"
                  >
                    <div className="col-span-5">
                      <div className="font-medium text-white">{invoice.invoice_number}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(invoice.date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                        {getStatusIcon(invoice.status)}
                        {invoice.status}
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-mono text-white">
                      {formatCurrency(invoice.total_amount)}
                    </div>
                    <div className="col-span-3 text-sm text-gray-300">
                      {invoice.client?.name || 'No client'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recent Clients Table */}
        <div className="bg-[#121212] rounded-lg border border-[#333333] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#333333] flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Recent Clients</h2>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/clients')}
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                View All
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/clients')}
                className="px-3 py-1.5 bg-[#336699] text-white rounded text-sm font-medium hover:bg-[#2a5a8a] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Client
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">No clients yet</p>
              <button
                onClick={() => navigate('/clients')}
                className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2a5a8a] transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Your First Client
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider bg-[#1a1a1a]">
                <div className="col-span-4">Name</div>
                <div className="col-span-3">Company</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Phone</div>
              </div>
              <div>
                {clients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-[#1a1a1a] transition-colors cursor-pointer border-b border-[#333333]/50 last:border-b-0"
                  >
                    <div className="col-span-4">
                      <div className="font-medium text-white">{client.name}</div>
                    </div>
                    <div className="col-span-3 text-sm text-gray-300">
                      {client.company_name || '-'}
                    </div>
                    <div className="col-span-3 text-sm text-gray-300">
                      {client.email || '-'}
                    </div>
                    <div className="col-span-2 text-sm text-gray-300">
                      {client.phone || '-'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};
