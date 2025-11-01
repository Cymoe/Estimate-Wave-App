import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  Globe, 
  Calendar, 
  User, 
  Building, 
  CreditCard, 
  MessageSquare, 
  Plus,
  Edit3,
  MoreVertical,
  History,
  DollarSign,
  FileText,
  Clock,
  Star,
  AlertCircle,
  CheckCircle,
  Briefcase,
  TrendingUp,
  Target,
  Users,
  ChevronDown
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { formatCurrency, formatDate } from '../../utils/format';
import { AddInteractionForm } from './AddInteractionForm';

interface Client {
  id: string;
  name: string;
  company_name: string;
  email: string;
  secondary_email?: string;
  phone: string;
  mobile_phone?: string;
  work_phone?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website?: string;
  industry?: string;
  job_title?: string;
  client_type: string;
  client_status: string;
  preferred_contact_method: string;
  lead_source?: string;
  client_since?: string;
  last_contact_date?: string;
  next_follow_up?: string;
  payment_terms: string;
  credit_limit?: number;
  notes?: string;
  tags?: string[];
  created_at: string;
}

interface ClientInteraction {
  id: string;
  type: string;
  subject: string;
  description?: string;
  contact_method?: string;
  duration_minutes?: number;
  interaction_date: string;
  status: string;
  priority: string;
  outcome?: string;
  action_items?: string;
  user_id: string;
  created_at: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  budget: number;
  start_date: string;
  end_date?: string;
}

interface ClientDetailsProps {
  clientId?: string;
  onBack?: () => void;
  embedded?: boolean;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ 
  clientId: propClientId, 
  onBack, 
  embedded = false 
}) => {
  const { clientId: paramClientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  
  const clientId = propClientId || paramClientId;
  
  const [client, setClient] = useState<Client | null>(null);
  const [interactions, setInteractions] = useState<ClientInteraction[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'invoices' | 'interactions'>('overview');
  const [showAddInteraction, setShowAddInteraction] = useState(false);

  useEffect(() => {
    if (clientId && selectedOrg?.id) {
      loadClientData();
    }
  }, [clientId, selectedOrg?.id]);

  const loadClientData = async () => {
    try {
      setLoading(true);

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('organization_id', selectedOrg?.id)
        .single();

      if (clientError) throw clientError;

      const { data: interactionsData, error: interactionsError } = await supabase
        .from('client_interactions')
        .select('*')
        .eq('client_id', clientId)
        .order('interaction_date', { ascending: false })
        .limit(50);

      if (interactionsError) throw interactionsError;

      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, status, budget, start_date, end_date')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;

      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('id, amount, status, issue_date, due_date, invoice_number')
        .eq('client_id', clientId)
        .order('issue_date', { ascending: false });

      if (invoicesError) throw invoicesError;

      setClient(clientData);
      setInteractions(interactionsData || []);
      setProjects(projectsData || []);
      setInvoices(invoicesData || []);

    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-900/20 text-green-400 border-green-900';
      case 'completed':
        return 'bg-blue-900/20 text-blue-400 border-blue-900';
      case 'planned':
        return 'bg-purple-900/20 text-purple-400 border-purple-900';
      case 'prospect':
        return 'bg-yellow-900/20 text-yellow-400 border-yellow-900';
      case 'inactive':
        return 'bg-gray-900/20 text-gray-400 border-gray-900';
      case 'former':
        return 'bg-red-900/20 text-red-400 border-red-900';
      default:
        return 'bg-gray-900/20 text-gray-400 border-gray-900';
    }
  };

  const getProjectProgress = (project: ProjectSummary) => {
    if (!project.start_date) return 0;
    
    const start = new Date(project.start_date);
    const end = project.end_date ? new Date(project.end_date) : new Date();
    const now = new Date();
    
    if (project.status === 'completed') return 100;
    if (project.status === 'planned') return 0;
    
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const daysElapsed = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    
    return Math.min(100, Math.max(0, Math.round((daysElapsed / totalDays) * 100)));
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'site_visit':
        return <MapPin className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'call':
        return <Phone className="h-4 w-4" />;
      case 'meeting':
        return <Calendar className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const totalProjectValue = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.amount || 0), 0);
  const outstandingAmount = invoices
    .filter(i => i.status !== 'paid')
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

  const recentProjects = [
    {
      id: "1",
      name: "Distribution Center Expansion",
      status: "active",
      value: 450000,
      progress: 65,
      startDate: "Mar 1, 2025",
    },
    {
      id: "2", 
      name: "Office Renovation Phase 2",
      status: "completed",
      value: 125000,
      progress: 100,
      startDate: "Jan 15, 2025",
    },
    {
      id: "3",
      name: "Warehouse Optimization", 
      status: "planned",
      value: 280000,
      progress: 0,
      startDate: "Jun 1, 2025",
    },
  ];

  const recentInteractions = [
    {
      id: "1",
      type: "site_visit",
      title: "Distribution Center Site Evaluation", 
      description: "Scheduled site visit to evaluate the proposed location for new distribution center.",
      date: "Jan 22, 2025",
      duration: "120 min",
    },
    {
      id: "2",
      type: "email",
      title: "Distribution Center Project Information Sent",
      description: "Sent detailed information packet including similar project case studies, timeline",
      date: "Jan 20, 2025",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#336699] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading client data...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#333333] rounded-[4px] flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-white font-medium text-xl mb-2">Client Not Found</h2>
          <p className="text-gray-400 mb-6">The requested client could not be located</p>
          <button
            onClick={handleBackClick}
            className="bg-[#336699] hover:bg-[#336699]/80 text-white px-6 py-3 rounded-[4px] text-sm font-medium transition-colors"
          >
            Back to Clients
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-gray-300 overflow-x-hidden">
      {/* Header */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between min-w-0 mb-6">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {!embedded && (
              <button
                onClick={handleBackClick}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white truncate mb-1">{client.name}</h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select 
                    value={client.client_status} 
                    className={`appearance-none bg-transparent border rounded px-3 py-1 text-xs font-medium uppercase tracking-wide cursor-pointer ${getStatusColor(client.client_status).replace('bg-', 'border-').replace('/20', '')}`}
                  >
                    <option value="active">ACTIVE</option>
                    <option value="prospect">PROSPECT</option>
                    <option value="inactive">INACTIVE</option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
                <span className="text-gray-400">{client.company_name}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="border border-[#333333] bg-[#1E1E1E] hover:bg-[#333333] text-gray-300 px-4 py-2 rounded text-sm transition-colors flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Share
            </button>
            <button className="border border-[#333333] bg-[#1E1E1E] hover:bg-[#333333] text-gray-300 px-4 py-2 rounded text-sm transition-colors flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Edit
            </button>
            <button className="text-gray-400 hover:text-white p-2 hover:bg-[#333333] rounded transition-colors">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b border-[#333333]">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'projects', label: 'Projects', count: projects.length },
            { key: 'invoices', label: 'Invoices', count: invoices.length },
            { key: 'interactions', label: 'Interactions', count: interactions.length }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-[#336699] text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {label}
              {count !== undefined && (
                <span className="ml-2 text-xs text-gray-500">{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-4 min-w-0">

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 min-w-0">
            {/* Left Column */}
            <div className="xl:col-span-2 space-y-6 min-w-0">
              {/* Financial Summary */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                  Financial Summary
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <TrendingUp className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Total Project Value</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-green-400 truncate">{formatCurrency(totalProjectValue)}</div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <DollarSign className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Total Invoiced</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-white truncate">{formatCurrency(totalInvoiced)}</div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <Clock className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Outstanding</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-yellow-400 truncate">{formatCurrency(outstandingAmount)}</div>
                  </div>
                </div>
              </div>

              {/* Recent Projects */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">Recent Projects</h3>
                  <button className="text-[#336699] text-sm hover:text-[#336699]/80 transition-colors">
                    View All Projects
                  </button>
                </div>
                <div className="space-y-4">
                  {recentProjects.map((project) => (
                    <div
                      key={project.id}
                      className="p-3 bg-[#1E1E1E]/30 rounded border border-[#333333]/50 hover:bg-[#1E1E1E]/50 transition-colors overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                          <div className="font-medium text-white text-sm truncate flex-1 min-w-0">{project.name}</div>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0 whitespace-nowrap ${getStatusColor(project.status)}`}>
                            {project.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-white flex-shrink-0 whitespace-nowrap">${project.value.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="text-xs text-gray-400 min-w-0 flex-1 truncate">Started {project.startDate}</div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="text-xs text-gray-400 whitespace-nowrap">{project.progress}%</div>
                          <div className="w-12 h-1 bg-[#333333] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#336699] rounded-full transition-all duration-300"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Interactions */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">
                    Recent Interactions
                  </h3>
                  <button 
                    onClick={() => setShowAddInteraction(true)}
                    className="bg-[#336699] hover:bg-[#336699]/80 text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
                <div className="space-y-4">
                  {recentInteractions.map((interaction) => (
                    <div key={interaction.id} className="p-4 bg-[#1E1E1E]/30 rounded border border-[#333333]/50">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 text-gray-400 flex-shrink-0">{getInteractionIcon(interaction.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white mb-1 break-words">{interaction.title}</div>
                          <div className="text-sm text-gray-400 mb-2 break-words">{interaction.description}</div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span>{interaction.date}</span>
                            {interaction.duration && <span>{interaction.duration}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6 min-w-0">
              {/* Contact Information */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                  Contact Information
                </h3>
                <div className="space-y-3 overflow-hidden">
                  <div className="flex items-start gap-2 min-w-0">
                    <Mail className="h-4 w-4 text-[#336699] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="text-xs text-gray-400 mb-1">Primary Email</div>
                      <div className="text-[#336699] text-xs truncate overflow-hidden">{client.email}</div>
                    </div>
                  </div>
                  {client.phone && (
                    <div className="flex items-start gap-2 min-w-0">
                      <Phone className="h-4 w-4 text-[#336699] flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="text-xs text-gray-400 mb-1">Phone</div>
                        <div className="text-white text-xs truncate overflow-hidden">{client.phone}</div>
                      </div>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="h-4 w-4 text-[#336699] flex-shrink-0 mt-1" />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="text-xs text-gray-400 mb-1">Address</div>
                        <div className="text-white text-xs leading-relaxed overflow-hidden">
                          <div className="truncate">{client.address}</div>
                          <div className="truncate">{client.city}, {client.state} {client.zip}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">Quick Stats</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-400">Projects</div>
                    <div className="text-xl font-bold text-white">{projects.length}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-gray-400">Invoices</div>
                    <div className="text-xl font-bold text-white">{invoices.length}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-gray-400">Interactions</div>
                    <div className="text-xl font-bold text-white">{interactions.length}</div>
                  </div>
                  <div className="pt-2 border-t border-[#333333]">
                    <div className="text-gray-400 mb-1">Client Since</div>
                    <div className="text-white font-medium">
                      {client.client_since ? formatDate(client.client_since) : formatDate(client.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other Tabs - Placeholder */}
        {activeTab !== 'overview' && (
          <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-8 text-center">
            <div className="text-gray-400">Tab content coming soon</div>
          </div>
        )}
      </div>

      {/* Add Interaction Modal */}
      {showAddInteraction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1E1E1E] border border-[#333333] rounded p-6 w-full max-w-2xl mx-4">
            <AddInteractionForm
              clientId={clientId!}
              onClose={() => setShowAddInteraction(false)}
              onSuccess={() => {
                setShowAddInteraction(false);
                loadClientData();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}; 