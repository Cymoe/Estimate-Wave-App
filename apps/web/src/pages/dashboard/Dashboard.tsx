import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, FileText, Users, Plus, ArrowRight, Clock, CheckCircle, XCircle, AlertCircle, Target, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../../components/layouts/DashboardLayout';
import { GoalSettingModal } from '../../components/analytics/GoalSettingModal';

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

interface Project {
  id: string;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  created_at: string;
  client?: {
    name?: string;
  };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (user && selectedOrg?.id) {
      fetchDashboardData();
      loadCategories();
    }
  }, [user, selectedOrg?.id]);

  const loadCategories = async () => {
    try {
      const { data } = await supabase
        .from('project_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (data) {
        setCategories(data.map(c => ({ id: c.id, name: c.name })));
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch recent projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          *,
          client:clients(name)
        `)
        .eq('organization_id', selectedOrg?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (projectsError) throw projectsError;

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

      setProjects(projectsData || []);
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
    <div className="space-y-6">
      {/* Projects Table - Airtable Style */}
      <div className="bg-[#121212] rounded-lg border border-[#333333] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#333333] flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Projects</h2>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/projects')}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/projects')}
              className="px-3 py-1.5 bg-[#336699] text-white rounded text-sm font-medium hover:bg-[#2a5a8a] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">No projects yet</p>
            <button
              onClick={() => navigate('/projects')}
              className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2a5a8a] transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#333333]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400 w-8">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Project</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Client</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Start</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">End</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Budget</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400 w-8">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="py-3 px-4">
                      <div className="w-2 h-2 rounded-full bg-[#336699]"></div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-white font-medium">{project.name}</div>
                      <div className="text-sm text-gray-400">{new Date(project.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-white">{project.client?.name || 'No client'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-400 text-sm">{project.start_date ? new Date(project.start_date).toLocaleDateString() : '-'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-400 text-sm">{project.end_date ? new Date(project.end_date).toLocaleDateString() : '-'}</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="text-white font-semibold">{project.budget ? formatCurrency(project.budget) : '-'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="text-[#336699] hover:text-[#4a7bb5] transition-colors"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[#333333]">
                  <td className="py-3 px-4">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-gray-500 italic">Add...</div>
                  </td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Goals and Revenue Tracking Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Goals Card */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Revenue Goals</h3>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#336699]" />
              <button
                onClick={() => setShowGoalModal(true)}
                className="text-xs text-[#336699] hover:text-[#4a7bb5] transition-colors"
              >
                Manage Goals
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Monthly Goal</span>
              <span className="text-sm font-medium text-white">$500,000</span>
            </div>
            <div className="w-full bg-[#333333] rounded-full h-2">
              <div className="bg-[#336699] h-2 rounded-full" style={{ width: '97%' }}></div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>$485,200</span>
              <span>97%</span>
            </div>
                  </div>
                </div>

        {/* Profit Tracking Card */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Profit Tracking</h3>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">This Month</span>
              <span className="text-sm font-medium text-white">$145,560</span>
                  </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Profit Margin</span>
              <span className="text-sm font-medium text-green-400">30%</span>
                </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">vs Last Month</span>
              <span className="text-sm font-medium text-green-400">+12%</span>
                  </div>
                </div>
              </div>
            </div>

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

      {/* All Deals Table - Airtable Style */}
      <div className="bg-[#121212] rounded-lg border border-[#333333] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#333333] flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">All Deals</h2>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/work')}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/sales-mode')}
              className="px-3 py-1.5 bg-[#336699] text-white rounded text-sm font-medium hover:bg-[#2a5a8a] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Quick Quote
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
              onClick={() => navigate('/sales-mode')}
              className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2a5a8a] transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Your First Estimate
        </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Airtable-style Table */}
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#333333]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400 w-8">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Description</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Client</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Date</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Total</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400 w-8">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {estimates.map((estimate) => (
                  <tr key={estimate.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="py-3 px-4">
                      <div className="w-2 h-2 rounded-full bg-[#336699]"></div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-white font-medium">{estimate.title || estimate.estimate_number}</div>
                      <div className="text-sm text-gray-400">#{estimate.estimate_number}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-white">{estimate.client?.name || 'No client'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(estimate.status)}`}>
                        {estimate.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-400 text-sm">
                        {new Date(estimate.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="text-white font-semibold">{formatCurrency(estimate.total_amount)}</div>
                    </td>
                    <td className="py-3 px-4">
        <button
                        onClick={() => navigate(`/estimates/${estimate.id}`)}
                        className="text-[#336699] hover:text-[#4a7bb5] transition-colors"
                      >
                        <ArrowRight className="w-4 h-4" />
        </button>
                    </td>
                  </tr>
                ))}
                {/* Add new row placeholder */}
                <tr className="border-t border-[#333333]">
                  <td className="py-3 px-4">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-gray-500 italic">Add...</div>
                  </td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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

      {/* Goal Setting Modal */}
      <GoalSettingModal
        isOpen={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        categories={categories}
        onGoalsUpdate={() => {
          // Refresh goals data if needed
        }}
      />
    </div>
  );
};

export default Dashboard;