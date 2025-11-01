import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Edit, MoreVertical, Share2, FileText, Camera, 
  MessageSquare, DollarSign, CheckSquare, Plus, Phone, Mail, MapPin, ExternalLink, Users, Calendar, Tag
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';
import { TaskList } from '../tasks/TaskList';
import { ExpensesList } from '../expenses/ExpensesList';
import { CreateInvoiceDrawer } from '../invoices/CreateInvoiceDrawer';
import { ProjectDocuments } from './ProjectDocuments';
import { BudgetAnalysis } from './BudgetAnalysis';
import { TimelineView } from './TimelineView';
import { StatusBadge } from './StatusBadge';
import { StatusTransition } from './StatusTransition';
import { ActivityLogService } from '../../services/ActivityLogService';

interface ProjectWithDetails {
  id: string;
  name: string;
  description: string;
  client_id: string;
  status: string; // Updated to support all workflow statuses
  budget: number;
  start_date: string;
  end_date: string;
  created_at: string;
  category_id?: string;
  client?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    address?: string;
  };
  photo_storage_link?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  due_date: string;
  assigned_to?: string;
  completed_at?: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  vendor: string;
  receipt_url?: string;
  status: 'pending' | 'approved' | 'paid';
}

interface Photo {
  id: string;
  url: string;
  caption: string;
  taken_at: string;
  phase: string;
}

interface Note {
  id: string;
  content: string;
  created_at: string;
  created_by: string;
  is_pinned: boolean;
}

type TabType = 'overview' | 'tasks' | 'expenses' | 'budget' | 'timeline' | 'photos' | 'documents';

export const ProjectDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [project, setProject] = useState<ProjectWithDetails | null>(null);
  const [taskCount, setTaskCount] = useState(0);
  const [completedTaskCount, setCompletedTaskCount] = useState(0);
  const [expenseCount, setExpenseCount] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expensePaid, setExpensePaid] = useState(0);
  const [expensePending, setExpensePending] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [photoLink, setPhotoLink] = useState<string>('');
  const [isEditingPhotoLink, setIsEditingPhotoLink] = useState(false);
  const [isSavingPhotoLink, setIsSavingPhotoLink] = useState(false);
  const [projectInvoices, setProjectInvoices] = useState<any[]>([]);
  const [showInvoiceDrawer, setShowInvoiceDrawer] = useState(false);

  // Legacy template data - now replaced by database templates
  // const projectTemplates = {
  //   kitchen_remodel: {
  //     tasks: [
  //       { title: 'Demo existing kitchen', description: 'Remove old cabinets, countertops, and appliances', priority: 'high', estimated_hours: 16 },
  //       { title: 'Rough plumbing work', description: 'Install new plumbing lines for sink and dishwasher', priority: 'high', estimated_hours: 8 },
  //       { title: 'Electrical rough-in', description: 'Install new electrical circuits and outlets', priority: 'high', estimated_hours: 12 },
  //       { title: 'Drywall installation', description: 'Patch and install new drywall as needed', priority: 'medium', estimated_hours: 10 },
  //       { title: 'Flooring installation', description: 'Install new kitchen flooring', priority: 'medium', estimated_hours: 12 },
  //       { title: 'Cabinet installation', description: 'Install new kitchen cabinets', priority: 'high', estimated_hours: 16 },
  //       { title: 'Countertop installation', description: 'Template and install countertops', priority: 'high', estimated_hours: 8 },
  //       { title: 'Backsplash installation', description: 'Install tile or stone backsplash', priority: 'medium', estimated_hours: 8 },
  //       { title: 'Appliance installation', description: 'Install and connect all appliances', priority: 'medium', estimated_hours: 6 },
  //       { title: 'Final plumbing fixtures', description: 'Install sink, faucet, and water connections', priority: 'medium', estimated_hours: 4 },
  //       { title: 'Final electrical work', description: 'Install light fixtures and switches', priority: 'medium', estimated_hours: 4 },
  //       { title: 'Paint and finish work', description: 'Final paint touch-ups and trim work', priority: 'low', estimated_hours: 8 }
  //     ],
  //     expenses: [
  //       { description: 'Cabinet materials', category: 'materials', estimated_amount: 8000 },
  //       { description: 'Countertop materials', category: 'materials', estimated_amount: 3000 },
  //       { description: 'Appliances', category: 'materials', estimated_amount: 5000 },
  //       { description: 'Flooring materials', category: 'materials', estimated_amount: 2000 },
  //       { description: 'Plumbing fixtures', category: 'materials', estimated_amount: 1500 },
  //       { description: 'Electrical materials', category: 'materials', estimated_amount: 800 },
  //       { description: 'Paint and finishing materials', category: 'materials', estimated_amount: 500 },
  //       { description: 'Demolition labor', category: 'labor', estimated_amount: 1200 },
  //       { description: 'Installation labor', category: 'labor', estimated_amount: 6000 },
  //       { description: 'Permit fees', category: 'permits', estimated_amount: 300 },
  //       { description: 'Disposal costs', category: 'other', estimated_amount: 400 }
  //     ]
  //   },
  //   bathroom_remodel: {
  //     tasks: [
  //       { title: 'Demo existing bathroom', description: 'Remove old fixtures, tile, and vanity', priority: 'high', estimated_hours: 12 },
  //       { title: 'Rough plumbing work', description: 'Relocate or install new plumbing lines', priority: 'high', estimated_hours: 10 },
  //       { title: 'Electrical rough-in', description: 'Install GFCI outlets and lighting circuits', priority: 'high', estimated_hours: 6 },
  //       { title: 'Waterproofing', description: 'Install vapor barrier and waterproof membrane', priority: 'high', estimated_hours: 8 },
  //       { title: 'Tile installation', description: 'Install floor and wall tile', priority: 'medium', estimated_hours: 16 },
  //       { title: 'Vanity installation', description: 'Install new vanity and countertop', priority: 'medium', estimated_hours: 6 },
  //       { title: 'Toilet installation', description: 'Install new toilet and connections', priority: 'medium', estimated_hours: 3 },
  //       { title: 'Shower/tub installation', description: 'Install shower or bathtub', priority: 'high', estimated_hours: 8 },
  //       { title: 'Final plumbing fixtures', description: 'Install faucets and accessories', priority: 'medium', estimated_hours: 4 },
  //       { title: 'Final electrical work', description: 'Install light fixtures and exhaust fan', priority: 'medium', estimated_hours: 3 },
  //       { title: 'Paint and finish work', description: 'Final paint and trim installation', priority: 'low', estimated_hours: 6 }
  //     ],
  //     expenses: [
  //       { description: 'Tile materials', category: 'materials', estimated_amount: 2500 },
  //       { description: 'Vanity and countertop', category: 'materials', estimated_amount: 2000 },
  //       { description: 'Shower/tub materials', category: 'materials', estimated_amount: 1800 },
  //       { description: 'Plumbing fixtures', category: 'materials', estimated_amount: 1200 },
  //       { description: 'Electrical materials', category: 'materials', estimated_amount: 400 },
  //       { description: 'Waterproofing materials', category: 'materials', estimated_amount: 300 },
  //       { description: 'Paint and finishing materials', category: 'materials', estimated_amount: 200 },
  //       { description: 'Installation labor', category: 'labor', estimated_amount: 4500 },
  //       { description: 'Permit fees', category: 'permits', estimated_amount: 200 },
  //       { description: 'Disposal costs', category: 'other', estimated_amount: 300 }
  //     ]
  //   },
  //   flooring_installation: {
  //     tasks: [
  //       { title: 'Remove existing flooring', description: 'Demo and dispose of old flooring', priority: 'high', estimated_hours: 8 },
  //       { title: 'Subfloor preparation', description: 'Level and prepare subfloor', priority: 'high', estimated_hours: 6 },
  //       { title: 'Underlayment installation', description: 'Install appropriate underlayment', priority: 'medium', estimated_hours: 4 },
  //       { title: 'Flooring installation', description: 'Install new flooring material', priority: 'high', estimated_hours: 12 },
  //       { title: 'Transition strips', description: 'Install transition strips and trim', priority: 'low', estimated_hours: 3 },
  //       { title: 'Final cleanup', description: 'Clean and inspect completed work', priority: 'low', estimated_hours: 2 }
  //     ],
  //     expenses: [
  //       { description: 'Flooring materials', category: 'materials', estimated_amount: 3000 },
  //       { description: 'Underlayment', category: 'materials', estimated_amount: 300 },
  //       { description: 'Transition strips and trim', category: 'materials', estimated_amount: 200 },
  //       { description: 'Installation labor', category: 'labor', estimated_amount: 2000 },
  //       { description: 'Disposal costs', category: 'other', estimated_amount: 200 }
  //     ]
  //   },
  //   general_renovation: {
  //     tasks: [
  //       { title: 'Project planning and permits', description: 'Finalize plans and obtain permits', priority: 'high', estimated_hours: 8 },
  //       { title: 'Demolition work', description: 'Remove existing materials as needed', priority: 'high', estimated_hours: 16 },
  //       { title: 'Structural work', description: 'Any required structural modifications', priority: 'high', estimated_hours: 12 },
  //       { title: 'Electrical work', description: 'Update electrical systems', priority: 'high', estimated_hours: 8 },
  //       { title: 'Plumbing work', description: 'Update plumbing systems', priority: 'high', estimated_hours: 8 },
  //       { title: 'Insulation and drywall', description: 'Install insulation and drywall', priority: 'medium', estimated_hours: 12 },
  //       { title: 'Flooring installation', description: 'Install new flooring', priority: 'medium', estimated_hours: 10 },
  //       { title: 'Paint and finish work', description: 'Paint and final finishing', priority: 'low', estimated_hours: 10 }
  //     ],
  //     expenses: [
  //       { description: 'Construction materials', category: 'materials', estimated_amount: 5000 },
  //       { description: 'Electrical materials', category: 'materials', estimated_amount: 800 },
  //       { description: 'Plumbing materials', category: 'materials', estimated_amount: 600 },
  //       { description: 'Labor costs', category: 'labor', estimated_amount: 8000 },
  //       { description: 'Permit fees', category: 'permits', estimated_amount: 500 },
  //       { description: 'Equipment rental', category: 'equipment', estimated_amount: 800 },
  //       { description: 'Disposal costs', category: 'other', estimated_amount: 400 }
  //     ]
  //   }
  // };

  const loadProjectData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      // Run all queries in parallel for faster loading
      const [projectResult, tasksResult, expensesResult, photosResult, invoicesResult, documentsResult] = await Promise.all([
        // Load project with client details
        supabase
          .from('projects')
          .select(`
            *,
            client:clients(*)
          `)
          .eq('id', id)
          .single(),
        
        // Load tasks
        supabase
          .from('tasks')
          .select('status')
          .eq('project_id', id),
        
        // Load expenses with status
        supabase
          .from('expenses')
          .select('amount, status')
          .eq('project_id', id),
        
        // Load photo count
        supabase
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id),
          
        // Load invoices
        supabase
          .from('invoices')
          .select('*')
          .eq('project_id', id)
          .order('created_at', { ascending: false }),
          
        // Load document count
        supabase
          .from('project_documents')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id)
      ]);
      
      // Process project data
      if (projectResult.error) throw projectResult.error;
      setProject(projectResult.data);
      setPhotoLink(projectResult.data.photo_storage_link || '');
      
      // Process tasks data
      if (!tasksResult.error && tasksResult.data) {
        setTaskCount(tasksResult.data.length);
        setCompletedTaskCount(tasksResult.data.filter(t => t.status === 'completed').length);
      }
      
      // Process expenses data
      if (!expensesResult.error && expensesResult.data) {
        setExpenseCount(expensesResult.data.length);
        const total = expensesResult.data.reduce((sum, expense) => sum + expense.amount, 0);
        const paid = expensesResult.data.filter(e => e.status === 'paid').reduce((sum, expense) => sum + expense.amount, 0);
        const pending = expensesResult.data.filter(e => e.status === 'pending').reduce((sum, expense) => sum + expense.amount, 0);
        
        setExpenseTotal(total);
        setExpensePaid(paid);
        setExpensePending(pending);
      }
      
      // Process photos data
      if (!photosResult.error && photosResult.count !== null) {
        setPhotoCount(photosResult.count);
      }

      // Process invoices data
      if (!invoicesResult.error && invoicesResult.data) {
        setProjectInvoices(invoicesResult.data);
      }
      
      // Process documents data
      if (!documentsResult.error && documentsResult.count !== null) {
        setDocumentCount(documentsResult.count);
      }

      // Mock recent activity for now
      // TODO: Load real activity data from database
      setRecentActivity([
        // Temporarily disabled mock data - causing incorrect health scores
        // { type: 'task', icon: '✓', text: 'Task "Order kitchen cabinets" marked complete', time: '2 hours ago' },
        // { type: 'expense', icon: '$', text: 'New expense added: $2,500 for electrical work', time: 'Yesterday at 3:45 PM' },
        // { type: 'photo', icon: '📷', text: '2 new photos uploaded', time: '3 days ago' },
        // { type: 'update', icon: '📝', text: 'Project timeline updated', time: '5 days ago' },
      ]);
      
    } catch (error) {
      console.error('Error loading project data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load when component mounts or dependencies change
  useEffect(() => {
    if (id && user) {
      loadProjectData(true); // Show spinner on initial load
    }
  }, [id, user]);

  // Refresh invoices when returning to the page
  useEffect(() => {
    const handleFocus = () => {
      // Only refresh invoices data, not the entire page
      if (id && user && project) {
        supabase
          .from('invoices')
          .select('*')
          .eq('project_id', id)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (!error && data) {
              setProjectInvoices(data);
            }
          });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [id, user, project]);

  // Removed aggressive refresh on visibility/focus changes - too annoying
  // If you need to refresh data, use the manual refresh button or navigate away and back

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.client-dropdown') && !target.closest('.client-dropdown-trigger')) {
        setShowClientDropdown(false);
      }
      if (!target.closest('.more-menu') && !target.closest('.more-menu-trigger')) {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const calculateProgress = () => {
    if (!project) return 0;
    if (taskCount === 0) return 0;
    return Math.round((completedTaskCount / taskCount) * 100);
  };

  const calculateTimelineProgress = () => {
    if (!project) return { days: 0, status: 'on-schedule' };
    
    const start = new Date(project.start_date).getTime();
    const end = new Date(project.end_date).getTime();
    const now = new Date().getTime();
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.ceil((now - start) / (1000 * 60 * 60 * 24));
    
    return {
      days: totalDays,
      status: elapsedDays > totalDays ? 'overdue' : 'on-schedule'
    };
  };

  const calculateHealthScore = () => {
    if (!project) return 100;
    
    let score = 100;
    
    // Deduct points for being over budget
    if (expenseTotal > project.budget) {
      const overBudgetPercent = ((expenseTotal - project.budget) / project.budget) * 100;
      score -= Math.min(overBudgetPercent * 2, 40); // Max 40 point deduction
    }
    
    // Deduct points for being behind schedule
    const start = new Date(project.start_date).getTime();
    const end = new Date(project.end_date).getTime();
    const now = new Date().getTime();
    const totalDuration = end - start;
    const elapsed = now - start;
    const timeProgress = (elapsed / totalDuration) * 100;
    
    if (timeProgress > progress && taskCount > 0) {
      const behindBy = timeProgress - progress;
      score -= Math.min(behindBy, 30); // Max 30 point deduction
    }
    
    // Deduct points for incomplete tasks near deadline
    if (now > end && completedTaskCount < taskCount) {
      score -= 20;
    }
    
    return Math.max(0, Math.round(score));
  };

  const handleGenerateInvoice = () => {
    setShowInvoiceDrawer(true);
  };

  const savePhotoLink = async (link: string) => {
    try {
      setIsSavingPhotoLink(true);
      const { error } = await supabase
        .from('projects')
        .update({ photo_storage_link: link })
        .eq('id', id);

      if (error) throw error;
      setPhotoLink(link);
      setIsEditingPhotoLink(false);
    } catch (error) {
      console.error('Error saving photo link:', error);
    } finally {
      setIsSavingPhotoLink(false);
    }
  };

  const getQuickActionsForTab = (tab: TabType) => {
    switch (tab) {
      case 'overview':
        return [
          {
            icon: <DollarSign className="w-5 h-5" />,
            label: 'Generate Invoice',
            action: handleGenerateInvoice,
            colorClass: 'group-hover:text-[#F9D71C]',
            primary: true // Made primary since it's the main action now
          },
          {
            icon: <Phone className="w-5 h-5" />,
            label: 'Contact Client',
            action: () => {
              if (project?.client?.phone) {
                window.location.href = `tel:${project.client.phone}`;
              }
            },
            colorClass: 'group-hover:text-[#336699]',
            disabled: !project?.client?.phone,
            primary: false
          }
        ];
      
      case 'tasks':
      case 'timeline':
      case 'photos':
        // These tabs don't have quick actions
        return null;
      
      case 'expenses':
        return [
          {
            icon: <Plus className="w-5 h-5" />,
            label: 'Add Expense',
            action: () => {
              // TODO: Open add expense modal
              console.log('Add expense');
            },
            colorClass: 'group-hover:text-[#F9D71C]',
            primary: true
          },
          {
            icon: <DollarSign className="w-5 h-5" />,
            label: 'Generate Invoice',
            action: handleGenerateInvoice,
            colorClass: 'group-hover:text-[#F9D71C]',
            primary: false
          },
          {
            icon: <FileText className="w-5 h-5" />,
            label: 'Export Report',
            action: () => {
              // TODO: Export expense report
              console.log('Export report');
            },
            colorClass: 'group-hover:text-[#336699]',
            primary: false
          },
          {
            icon: <Tag className="w-5 h-5" />,
            label: 'Bulk Categorize',
            action: () => {
              // TODO: Open bulk categorize modal
              console.log('Bulk categorize');
            },
            colorClass: 'group-hover:text-[#F9D71C]',
            primary: false
          }
        ];
      
      case 'budget':
        return [
          {
            icon: <DollarSign className="w-5 h-5" />,
            label: 'Compare Margins',
            action: () => {
              // TODO: Show margin comparison view
              console.log('Compare margins');
            },
            colorClass: 'group-hover:text-[#F9D71C]',
            primary: true
          },
          {
            icon: <FileText className="w-5 h-5" />,
            label: 'Export Report',
            action: () => {
              // TODO: Export budget report
              console.log('Export budget report');
            },
            colorClass: 'group-hover:text-[#336699]',
            primary: false
          }
        ];
      
      case 'documents':
        return [
          {
            icon: <FileText className="w-5 h-5" />,
            label: 'Add Document',
            action: () => {
              // TODO: Open add document modal
              console.log('Add document');
            },
            colorClass: 'group-hover:text-[#F9D71C]',
            primary: true
          },
          {
            icon: <MessageSquare className="w-5 h-5" />,
            label: 'Generate Contract',
            action: () => {
              // TODO: Generate contract from template
              console.log('Generate contract');
            },
            colorClass: 'group-hover:text-[#336699]',
            primary: false
          }
        ];
      
      default:
        return [];
    }
  };

  const getNoActionsMessage = (tab: TabType) => {
    switch (tab) {
      case 'timeline':
        return '📅 Use the timeline to drag and adjust schedules';
      case 'photos':
        return '📷 Drag photos here or use the upload button below';
      case 'documents':
        return '📄 View project documents';
      default:
        return '';
    }
  };

  const handleStatusChange = async (newStatus: string, reason?: string) => {
    if (!project || !user) return;
    
    try {
      const { error } = await supabase
        .from('projects')
        .update({ 
          status: newStatus,
          status_changed_by: user.id,
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', project.id);

      if (error) throw error;

      // Log the activity
      try {
        await ActivityLogService.log({
          organizationId: selectedOrg.id,
          entityType: 'project',
          entityId: project.id,
          action: 'status_changed',
          description: `updated project ${project.name} status to ${newStatus}`,
          metadata: {
            old_status: project.status,
            new_status: newStatus,
            client_name: project.client?.name
          }
        });
      } catch (logError) {
        console.error('Failed to log project status update:', logError);
      }

      // Update local state
      setProject(prev => prev ? { ...prev, status: newStatus } : null);
      
      // Refresh project data to get any automatic updates
      await loadProjectData(false);
      
    } catch (error) {
      console.error('Error updating project status:', error);
      throw error; // Re-throw so StatusTransition can handle the error
    }
  };

  if (loading && !project) {
    return (
      <div className="max-w-[1600px] mx-auto p-8">
        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#1a1a1a] rounded animate-pulse" />
              <div>
                <div className="h-8 w-64 bg-[#1a1a1a] rounded mb-2 animate-pulse" />
                <div className="flex items-center gap-4">
                  <div className="h-6 w-20 bg-[#1a1a1a] rounded animate-pulse" />
                  <div className="h-5 w-32 bg-[#1a1a1a] rounded animate-pulse" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-24 bg-[#1a1a1a] rounded animate-pulse" />
              <div className="h-10 w-20 bg-[#1a1a1a] rounded animate-pulse" />
              <div className="h-10 w-10 bg-[#1a1a1a] rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Tabs Skeleton */}
        <div className="flex justify-between mb-8 border-b border-[#2a2a2a]">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-1 pb-4">
              <div className="h-5 w-16 bg-[#1a1a1a] rounded mx-auto animate-pulse" />
            </div>
          ))}
        </div>

        {/* Content Skeleton */}
        <div className="space-y-4">
          {/* Project Health Skeleton */}
          <section className="bg-[#181818] rounded-xl p-5">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="h-4 w-24 bg-[#121212] rounded animate-pulse" />
                <div className="h-6 w-32 bg-[#121212] rounded-full animate-pulse" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-[#121212] rounded-lg p-4">
                  <div className="h-6 w-16 bg-[#0a0a0a] rounded mx-auto mb-2 animate-pulse" />
                  <div className="h-3 w-20 bg-[#0a0a0a] rounded mx-auto animate-pulse" />
                </div>
              ))}
            </div>
          </section>

          {/* Client Info Skeleton */}
          <section className="bg-[#181818] rounded-xl p-5">
            <div className="h-4 w-32 bg-[#121212] rounded mb-4 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-5 w-32 bg-[#121212] rounded animate-pulse" />
              ))}
            </div>
          </section>

          {/* Two Column Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <section key={i} className="bg-[#181818] rounded-xl p-6">
                <div className="h-4 w-32 bg-[#121212] rounded mb-6 animate-pulse" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-12 bg-[#121212] rounded animate-pulse" />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-white text-lg">Project not found</p>
        </div>
      </div>
    );
  }

  const progress = calculateProgress();
  const budgetSpentPercentage = project.budget ? Math.round((expenseTotal / project.budget) * 100) : 0;
  const timeline = calculateTimelineProgress();

  return (
    <div className="max-w-[1600px] mx-auto p-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/projects')}
              className="p-2 hover:bg-[#1a1a1a] rounded transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-500" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold text-white mb-1">{project.name}</h1>
              <div className="flex items-center gap-4">
                <StatusTransition 
                  currentStatus={project.status}
                  projectId={project.id}
                  projectName={project.name}
                  onStatusChange={handleStatusChange}
                />
                {project.client ? (
                  <div className="relative">
                    <button
                      onClick={() => setShowClientDropdown(!showClientDropdown)}
                      onMouseEnter={() => setShowClientDropdown(true)}
                      onMouseLeave={() => setShowClientDropdown(false)}
                      className="client-dropdown-trigger text-gray-500 hover:text-gray-300 transition-colors cursor-pointer underline-offset-2 hover:underline"
                    >
                      {project.client.name}
                    </button>
                    
                    {showClientDropdown && (
                      <div 
                        className="client-dropdown absolute top-full left-0 mt-2 w-64 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg z-50 p-4"
                        onMouseEnter={() => setShowClientDropdown(true)}
                        onMouseLeave={() => setShowClientDropdown(false)}
                      >
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Client</div>
                            <div className="text-sm font-medium text-white">{project.client.name}</div>
                          </div>
                          
                          {project.client.phone && (
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Phone</div>
                              <a href={`tel:${project.client.phone}`} className="text-sm text-[#336699] hover:text-[#5A8BB8] flex items-center gap-2">
                                <Phone className="w-3 h-3" />
                                {project.client.phone}
                              </a>
                            </div>
                          )}
                          
                          {project.client.email && (
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Email</div>
                              <a href={`mailto:${project.client.email}`} className="text-sm text-[#336699] hover:text-[#5A8BB8] break-all flex items-center gap-2">
                                <Mail className="w-3 h-3 flex-shrink-0" />
                                {project.client.email}
                              </a>
                            </div>
                          )}
                          
                          {project.client.address && (
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Address</div>
                              <div className="text-sm text-gray-300 flex items-start gap-2">
                                <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                {project.client.address}
                              </div>
                            </div>
                          )}
                          
                          <div className="border-t border-[#2a2a2a] pt-3 mt-3">
                            <button
                              onClick={() => navigate(`/clients/${project.client_id}`)}
                              className="w-full text-center text-sm text-[#336699] hover:text-[#5A8BB8] flex items-center justify-center gap-1"
                            >
                              View Full Client Details
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-500">No client assigned</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-sm hover:bg-[#2a2a2a] transition-colors">
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </button>
            <button 
              onClick={() => navigate(`/projects/${project.id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-sm hover:bg-[#2a2a2a] transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="more-menu-trigger w-10 h-10 flex items-center justify-center border border-[#2a2a2a] rounded-sm hover:bg-[#1a1a1a] transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              
              {showMoreMenu && (
                <div className="more-menu absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm shadow-lg z-50">
                  <button className="w-full text-left px-4 py-3 text-sm hover:bg-[#2a2a2a] transition-colors">
                    Export Data
                  </button>
                  <button className="w-full text-left px-4 py-3 text-sm hover:bg-[#2a2a2a] transition-colors">
                    Generate Report
                  </button>
                  <div className="border-t border-[#2a2a2a]" />
                  <button className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-[#2a2a2a] transition-colors">
                    Delete Project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex justify-between mb-8 border-b border-[#2a2a2a]">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 pb-4 text-sm font-medium transition-colors relative text-center after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
            activeTab === 'overview'
              ? 'text-white after:bg-[#336699]'
              : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 pb-4 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
            activeTab === 'tasks'
              ? 'text-white after:bg-[#336699]'
              : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
          }`}
        >
          Tasks
          <span className="text-xs text-gray-500">{taskCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 pb-4 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
            activeTab === 'expenses'
              ? 'text-white after:bg-[#336699]'
              : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
          }`}
        >
          Expenses
          <span className="text-xs text-gray-500">{expenseCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('budget')}
          className={`flex-1 pb-4 text-sm font-medium transition-colors relative text-center after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
            activeTab === 'budget'
              ? 'text-white after:bg-[#336699]'
              : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
          }`}
        >
          Budget
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 pb-4 text-sm font-medium transition-colors relative text-center after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
            activeTab === 'timeline'
              ? 'text-white after:bg-[#336699]'
              : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
          }`}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab('photos')}
          className={`flex-1 pb-4 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
            activeTab === 'photos'
              ? 'text-white after:bg-[#336699]'
              : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
          }`}
        >
          Photos
          {photoCount > 0 && <span className="text-xs text-gray-500">{photoCount}</span>}
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`flex-1 pb-4 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
            activeTab === 'documents'
              ? 'text-white after:bg-[#336699]'
              : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
          }`}
        >
          Documents
          {documentCount > 0 && <span className="text-xs text-gray-500">{documentCount}</span>}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Floating Quick Actions Bar */}
          {(() => {
            const actions = getQuickActionsForTab(activeTab);
            if (!actions) {
              return (
                <div className="bg-[#181818] rounded-xl p-8 text-center">
                  <p className="text-gray-500 text-sm">{getNoActionsMessage(activeTab)}</p>
                </div>
              );
            }
            return (
              <div className="bg-gradient-to-r from-[#181818] to-[#1a1a1a] rounded-xl p-1 mb-6">
                <div className={`grid ${actions.length === 2 ? 'grid-cols-2' : actions.length === 3 ? 'grid-cols-3' : 'grid-cols-4'} gap-1`}>
                  {actions.map((action, index) => (
                    <button 
                      key={index}
                      onClick={action.action}
                      className={`relative flex flex-col items-center justify-center py-4 px-2 rounded-lg transition-all group ${
                        action.primary 
                          ? 'bg-[#0f1729] border border-[#336699] hover:bg-[#1a2940] hover:border-[#5A8BB8]' 
                          : 'bg-[#121212] hover:bg-[#1a1a1a]'
                      }`}
                      disabled={action.disabled}
                    >
                      <div className={`w-5 h-5 mb-1.5 text-gray-400 ${action.colorClass} transition-colors`}>
                        {action.icon}
                      </div>
                      <span className="text-xs font-medium">{action.label}</span>
                      {action.primary && (
                        <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-[#F9D71C]">Most Used</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Project Health Section - Compact Design */}
          <section className="bg-[#181818] rounded-xl p-5">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Project Health</h2>
                <div className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${(() => {
                  const score = calculateHealthScore();
                  if (score >= 80) return 'bg-[#1a3a1a] text-green-400';
                  if (score >= 60) return 'bg-[#3a3a1a] text-yellow-400';
                  return 'bg-[#3a1a1a] text-red-400';
                })()}`}>
                  <span className={(() => {
                    const score = calculateHealthScore();
                    if (score >= 80) return 'text-green-400';
                    if (score >= 60) return 'text-yellow-400';
                    return 'text-red-400';
                  })()}>●</span>
                  {(() => {
                    const score = calculateHealthScore();
                    if (score >= 80) return `${score}% Healthy`;
                    if (score >= 60) return `${score}% Fair`;
                    return `${score}% Needs Attention`;
                  })()}
                </div>
              </div>
              
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#121212] rounded-lg p-4 text-center cursor-pointer hover:bg-[#1a1a1a] transition-all">
                <div className={`text-lg font-bold mb-1 ${expenseTotal <= project.budget ? 'text-green-400' : 'text-red-400'}`}>
                  {(() => {
                    const difference = project.budget - expenseTotal;
                    if (difference >= 0) {
                      return `$${(difference / 1000).toFixed(1)}K`;
                    } else {
                      return `-$${Math.abs(difference / 1000).toFixed(1)}K`;
                    }
                  })()}
                </div>
                <div className="text-[11px] text-gray-300 uppercase tracking-wide">
                  {expenseTotal <= project.budget ? 'Under Budget' : 'Over Budget'}
                </div>
              </div>
              
              <div className="bg-[#121212] rounded-lg p-4 text-center cursor-pointer hover:bg-[#1a1a1a] transition-all">
                <div className={`text-lg font-bold mb-1 ${(() => {
                  const start = new Date(project.start_date).getTime();
                  const end = new Date(project.end_date).getTime();
                  const now = new Date().getTime();
                  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                  const daysElapsed = Math.ceil((now - start) / (1000 * 60 * 60 * 24));
                  const expectedProgress = (daysElapsed / totalDays) * 100;
                  const progressDiff = progress - expectedProgress;
                  
                  if (taskCount === 0) return 'text-green-400';
                  if (progressDiff >= 0) return 'text-green-400';
                  if (progressDiff < -10) return 'text-red-400';
                  return 'text-yellow-400';
                })()}`}>
                  {(() => {
                    const start = new Date(project.start_date).getTime();
                    const end = new Date(project.end_date).getTime();
                    const now = new Date().getTime();
                    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    const daysElapsed = Math.ceil((now - start) / (1000 * 60 * 60 * 24));
                    const expectedProgress = (daysElapsed / totalDays) * 100;
                    
                    if (taskCount === 0) return '100%';
                    
                    const progressDiff = progress - expectedProgress;
                    return progressDiff >= 0 ? '100%' : `${Math.round(100 + progressDiff)}%`;
                  })()}
                </div>
                <div className="text-[11px] text-gray-300 uppercase tracking-wide">On Schedule</div>
              </div>
              
              <div className="bg-[#121212] rounded-lg p-4 text-center cursor-pointer hover:bg-[#1a1a1a] transition-all">
                <div className={`text-lg font-bold mb-1 ${(() => {
                  const openTasks = taskCount - completedTaskCount;
                  if (openTasks === 0) return 'text-green-400';
                  if (openTasks <= 5) return 'text-yellow-400';
                  if (openTasks <= 10) return 'text-orange-400';
                  return 'text-red-400';
                })()}`}>
                  {taskCount - completedTaskCount}
                </div>
                <div className="text-[11px] text-gray-300 uppercase tracking-wide">Open Tasks</div>
              </div>
              
              <div className="bg-[#121212] rounded-lg p-4 text-center cursor-pointer hover:bg-[#1a1a1a] transition-all">
                <div className={`text-lg font-bold mb-1 ${(() => {
                  if (expenseCount === 0) return 'text-gray-400';
                  const paidPercentage = (expensePaid / expenseTotal) * 100;
                  if (paidPercentage >= 80) return 'text-green-400';
                  if (paidPercentage >= 50) return 'text-[#F9D71C]';
                  return 'text-red-400';
                })()}`}>
                  {(() => {
                    if (expenseCount === 0) return '0%';
                    const paidPercentage = (expensePaid / expenseTotal) * 100;
                    return `${Math.round(paidPercentage)}%`;
                  })()}
                </div>
                <div className="text-[11px] text-gray-300 uppercase tracking-wide">Expenses Paid</div>
              </div>
            </div>

            {/* Quick stats row */}
            {(projectInvoices.length > 0 || expenseCount > 0) && (
              <div className="mt-4 pt-4 border-t border-[#2a2a2a] flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  {projectInvoices.length > 0 && (
                    <>
                      <span className="text-gray-500">
                        {projectInvoices.length} invoice{projectInvoices.length !== 1 ? 's' : ''} generated
                      </span>
                      {(() => {
                        const totalInvoiced = projectInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
                        const paidInvoices = projectInvoices.filter(inv => inv.status === 'paid');
                        const totalPaid = paidInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
                        
                        return (
                          <>
                            <span className="text-gray-500">
                              ${totalInvoiced.toLocaleString()} invoiced
                            </span>
                            {paidInvoices.length > 0 && (
                              <span className="text-green-400">
                                ${totalPaid.toLocaleString()} paid
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                  
                  {expenseCount > 0 && (
                    <>
                      <span className="text-green-400">
                        ${expensePaid.toLocaleString()} paid expenses
                      </span>
                      <span className="text-[#F9D71C]">
                        ${expensePending.toLocaleString()} pending
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Invoices */}
          {projectInvoices.length > 0 ? (
            <section className="bg-[#181818] rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider">Invoices</h3>
                <button 
                  onClick={handleGenerateInvoice}
                  className="text-xs text-[#F9D71C] hover:text-[#E6C419]"
                >
                  + New Invoice
                </button>
              </div>
              <div className="space-y-3">
                {projectInvoices.map((invoice) => (
                  <div 
                    key={invoice.id} 
                    className="bg-[#121212] rounded-lg p-4 hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                    onClick={() => navigate(`/invoices/${invoice.id}`, { 
                      state: { 
                        from: 'project', 
                        projectId: project.id,
                        projectName: project.name 
                      } 
                    })}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">Invoice #{invoice.id ? invoice.id.slice(0, 8).toUpperCase() : 'Unknown'}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            invoice.status === 'paid' 
                              ? 'bg-green-500/20 text-green-400' 
                              : invoice.status === 'sent'
                              ? 'bg-[#336699]/20 text-[#336699]'
                              : invoice.status === 'overdue'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {invoice.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Created {new Date(invoice.created_at).toLocaleDateString()}
                          {invoice.due_date && ` • Due ${new Date(invoice.due_date).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">${(invoice.amount || invoice.total_amount || 0).toLocaleString()}</div>
                        {invoice.status === 'paid' && invoice.paid_at && (
                          <div className="text-xs text-gray-500">
                            Paid {new Date(invoice.paid_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="bg-[#181818] rounded-xl p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Invoices</h3>
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">No invoices generated yet</p>
                <button 
                  onClick={handleGenerateInvoice}
                  className="px-4 py-2 bg-[#F9D71C] text-black rounded-md text-sm hover:bg-[#E6C419] transition-colors"
                >
                  Generate First Invoice
                </button>
              </div>
            </section>
          )}

          {/* Tasks */}
          {taskCount > 0 ? (
            <section className="bg-[#181818] rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider">Tasks</h3>
              </div>
              <div className="space-y-3">
                <div className="bg-[#121212] rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium mb-1">Task Progress</div>
                      <div className="text-xs text-gray-500">
                        {completedTaskCount} of {taskCount} tasks completed
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-medium ${progress >= 75 ? 'text-green-400' : progress >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {progress}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${progress >= 75 ? 'bg-green-400' : progress >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('tasks')}
                  className="w-full bg-[#121212] hover:bg-[#1a1a1a] rounded-lg p-4 text-left transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">View all tasks</span>
                    <span className="text-xs text-[#F9D71C]">→</span>
                  </div>
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-[#181818] rounded-xl p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Tasks</h3>
              <div className="text-center py-8">
                <CheckSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No tasks found</p>
              </div>
            </section>
          )}

          {/* Expenses */}
          {expenseCount > 0 ? (
            <section className="bg-[#181818] rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider">Expenses</h3>
              </div>
              <div className="space-y-3">
                {/* Total Expenses Card */}
                <div className="bg-[#121212] rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium mb-1">Total Expenses</div>
                      <div className="text-xs text-gray-500">
                        {expenseCount} expense{expenseCount !== 1 ? 's' : ''} • {budgetSpentPercentage}% of budget
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-medium ${expenseTotal <= project.budget ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(expenseTotal)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${expenseTotal <= project.budget ? 'bg-green-400' : 'bg-red-400'}`}
                        style={{ width: `${Math.min(budgetSpentPercentage, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                {/* Status Breakdown Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#121212] rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm font-medium mb-1 text-green-400">Paid</div>
                        <div className="text-xs text-gray-500">
                          {expenseTotal > 0 ? Math.round((expensePaid / expenseTotal) * 100) : 0}% of total
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-medium text-green-400">
                          {formatCurrency(expensePaid)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-[#121212] rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm font-medium mb-1 text-[#F9D71C]">Pending</div>
                        <div className="text-xs text-gray-500">
                          awaiting payment
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-medium text-[#F9D71C]">
                          {formatCurrency(expensePending)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => setActiveTab('expenses')}
                  className="w-full bg-[#121212] hover:bg-[#1a1a1a] rounded-lg p-4 text-left transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">View all expenses</span>
                    <span className="text-xs text-[#F9D71C]">→</span>
                  </div>
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-[#181818] rounded-xl p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Expenses</h3>
              <div className="text-center py-8">
                <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No expenses found</p>
              </div>
            </section>
          )}

          {/* Recent Activity */}
          <section className="bg-[#181818] rounded-xl p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Recent Activity</h3>
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="w-8 h-8 bg-[#2a2a2a] rounded-full flex items-center justify-center flex-shrink-0 text-sm">
                      {activity.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-white">{activity.text}</div>
                      <div className="text-xs text-gray-500">{activity.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-500">
                <div className="text-sm">No recent activity</div>
              </div>
            )}
          </section>

          {/* Project Details */}
          <section className="bg-[#181818] rounded-xl p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Project Details</h3>
            
            <div className="mb-6">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Description</div>
              <div className="text-white">{project.description || 'Complete master bathroom renovation'}</div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Start Date</div>
                <div className="text-white">{new Date(project.start_date).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">End Date</div>
                <div className="text-white">{new Date(project.end_date).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Project Manager</div>
                <div className="text-white">Mike Thompson</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Contract Type</div>
                <div className="text-white">Fixed Price</div>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <TaskList 
              projectId={project.id} 
              categoryId={project.category_id}
              onTaskUpdate={() => loadProjectData(false)} 
            />
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <ExpensesList projectId={project.id} />
          </div>
        </div>
      )}

      {activeTab === 'budget' && (
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <BudgetAnalysis projectId={project.id} />
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <TimelineView projectId={project.id} />
          </div>
        </div>
      )}

      {activeTab === 'photos' && (
        <div className="space-y-4">
          {/* Info message for drag-and-drop area */}
          <div className="bg-[#181818] rounded-xl p-8 text-center mb-6">
            <p className="text-gray-500 text-sm">{getNoActionsMessage(activeTab)}</p>
          </div>
          
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-semibold uppercase tracking-wider">Project Photos</h3>
                {!isEditingPhotoLink && (
                  <button
                    onClick={() => setIsEditingPhotoLink(true)}
                    className="text-sm text-[#F9D71C] hover:text-[#E6C419]"
                  >
                    {photoLink ? 'Edit Link' : 'Add Link'}
                  </button>
                )}
              </div>

              {isEditingPhotoLink ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
                      Photo Storage Link
                    </label>
                    <input
                      type="url"
                      value={photoLink}
                      onChange={(e) => setPhotoLink(e.target.value)}
                      placeholder="https://drive.google.com/... or https://dropbox.com/..."
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] transition-colors"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Add a link to where your project photos are stored (Google Drive, Dropbox, etc.)
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => savePhotoLink(photoLink)}
                      disabled={isSavingPhotoLink}
                      className="px-4 py-2 bg-[#F9D71C] text-black rounded-md text-sm hover:bg-[#E6C419] transition-colors disabled:opacity-50"
                    >
                      {isSavingPhotoLink ? 'Saving...' : 'Save Link'}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingPhotoLink(false);
                        setPhotoLink(project?.photo_storage_link || '');
                      }}
                      className="px-4 py-2 text-gray-500 hover:text-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : photoLink ? (
                <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                        Photo Storage Location
                      </div>
                      <a
                        href={photoLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#336699] hover:text-[#5A8BB8] break-all"
                      >
                        {photoLink}
                      </a>
                    </div>
                    <button
                      onClick={() => window.open(photoLink, '_blank')}
                      className="px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-md text-sm hover:bg-[#2a2a2a] transition-colors"
                    >
                      View Photos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No photo storage location set</p>
                  <button
                    onClick={() => setIsEditingPhotoLink(true)}
                    className="px-4 py-2 bg-[#F9D71C] text-black rounded-md text-sm hover:bg-[#E6C419] transition-colors"
                  >
                    Add Photo Storage Link
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4">
          {/* Floating Quick Actions Bar */}
          {(() => {
            const actions = getQuickActionsForTab(activeTab);
            if (!actions) {
              return (
                <div className="bg-[#181818] rounded-xl p-8 text-center">
                  <p className="text-gray-500 text-sm">{getNoActionsMessage(activeTab)}</p>
                </div>
              );
            }
            return (
              <div className="bg-gradient-to-r from-[#181818] to-[#1a1a1a] rounded-xl p-1 mb-6">
                <div className={`grid ${actions.length === 2 ? 'grid-cols-2' : actions.length === 3 ? 'grid-cols-3' : 'grid-cols-4'} gap-1`}>
                  {actions.map((action, index) => (
                    <button 
                      key={index}
                      onClick={action.action}
                      className={`relative flex flex-col items-center justify-center py-4 px-2 rounded-lg transition-all group ${
                        action.primary 
                          ? 'bg-[#0f1729] border border-[#336699] hover:bg-[#1a2940] hover:border-[#5A8BB8]' 
                          : 'bg-[#121212] hover:bg-[#1a1a1a]'
                      }`}
                      disabled={action.disabled}
                    >
                      <div className={`w-5 h-5 mb-1.5 text-gray-400 ${action.colorClass} transition-colors`}>
                        {action.icon}
                      </div>
                      <span className="text-xs font-medium">{action.label}</span>
                      {action.primary && (
                        <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-[#F9D71C]">Most Used</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          
          <ProjectDocuments projectId={project.id} />
        </div>
      )}

      {/* Create Invoice Drawer */}
      <CreateInvoiceDrawer
        isOpen={showInvoiceDrawer}
        onClose={() => setShowInvoiceDrawer(false)}
        organizationId={selectedOrg?.id}
        projectContext={project ? {
          projectId: project.id,
          clientId: project.client_id,
          projectName: project.name,
          projectBudget: project.budget
        } : undefined}
        onSave={async (data) => {
          try {
            console.log('Invoice save started with data:', data);
            
            const invoiceData = {
              user_id: user?.id,
              organization_id: selectedOrg?.id,
              client_id: data.client_id,
              amount: data.total_amount,
              status: data.status,
              issue_date: data.issue_date,
              due_date: data.due_date,
              description: data.description,
              project_id: data.project_id || null
            };
            
            console.log('Invoice data to insert:', invoiceData);
            
            const { data: invoice, error: invoiceError } = await supabase
              .from('invoices')
              .insert(invoiceData)
              .select()
              .single();

            if (invoiceError) {
              console.error('Error creating invoice:', invoiceError);
              alert(`Error creating invoice: ${invoiceError.message}`);
              throw invoiceError;
            }

            console.log('Invoice created successfully:', invoice);

            // Create invoice items
            const itemsToInsert = data.items.map(item => ({
              invoice_id: invoice.id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.price,
              total_price: item.price * item.quantity,
              description: item.description
            }));

            console.log('Inserting invoice items:', itemsToInsert);

            const { error: itemsError } = await supabase
              .from('invoice_items')
              .insert(itemsToInsert);

            if (itemsError) {
              console.error('Error inserting invoice items:', itemsError);
              alert(`Error inserting invoice items: ${itemsError.message}`);
              throw itemsError;
            }
            
            console.log('Invoice and items created successfully!');
            
            // Refresh the invoices list
            await loadProjectData(false);
            setShowInvoiceDrawer(false);
            
            // Show success message
            alert('Invoice created successfully!');
          } catch (error) {
            console.error('Error saving invoice:', error);
          }
        }}
      />
    </div>
  );
};

export default ProjectDetails;
