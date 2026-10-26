import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UserCheck, Phone, Mail, Calendar, Users, 
  Plus, Search, Filter, Edit2, Trash2, Eye,
  Shield, CheckCircle, ChevronDown, Settings, List, MoreVertical, Rows3,
  Download, FileText, FileSpreadsheet, Upload
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutContext, OrganizationContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';
import { advancedSearch, SearchableField } from '../../utils/searchUtils';
import { TableSkeleton } from '../skeletons/TableSkeleton';
import { CardSkeleton } from '../skeletons/CardSkeleton';
import { TeamMemberService, TeamMember, DEPARTMENTS, EMPLOYMENT_TYPES } from '../../services/TeamMemberService';
import { CreateTeamMemberModal } from './CreateTeamMemberModal';
import { EditTeamMemberDrawer } from './EditTeamMemberDrawer';
import { TeamMemberExportService } from '../../services/TeamMemberExportService';

interface TeamMembersListProps {
  showAddModal?: boolean;
  setShowAddModal?: (show: boolean) => void;
  hideAddButton?: boolean;
  searchTerm?: string;
}

export const TeamMembersList: React.FC<TeamMembersListProps> = ({ 
  showAddModal: externalShowAddModal, 
  setShowAddModal: externalSetShowAddModal, 
  hideAddButton = false,
  searchTerm = ''
}) => {
  const { user } = useAuth();
  const { isConstrained } = useContext(LayoutContext);
  const { selectedOrg } = useContext(OrganizationContext);
  const navigate = useNavigate();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'compact'>('compact');
  const [internalShowNewModal, setInternalShowNewModal] = useState(false);
  const [editingTeamMember, setEditingTeamMember] = useState<TeamMember | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [deletingTeamMember, setDeletingTeamMember] = useState<TeamMember | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  
  // Use external modal state if provided, otherwise use internal state
  const showNewModal = externalShowAddModal !== undefined ? externalShowAddModal : internalShowNewModal;
  const setShowNewModal = externalSetShowAddModal || setInternalShowNewModal;

  // Load team members data from database
  useEffect(() => {
    if (selectedOrg?.id) {
      loadTeamMembers();
    } else {
      setTeamMembers([]);
      setLoading(false);
    }
  }, [selectedOrg?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside options menu
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(target)) {
        setShowOptionsMenu(false);
      }
      
      // Check if click is outside all dropdown menus
      const isOutsideDropdown = Object.values(dropdownRefs.current).every(ref => 
        !ref || !ref.contains(target)
      );
      
      if (isOutsideDropdown && openDropdownId) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdownId]);

  const loadTeamMembers = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      setLoading(true);
      console.log('🔧 Loading team members for organization:', selectedOrg.id);
      const members = await TeamMemberService.getTeamMembers(selectedOrg.id);
      console.log('🔧 Loaded team members:', members.length);
      setTeamMembers(members);
    } catch (error) {
      console.error('🔧 Error loading team members:', error);
      setTeamMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (member: TeamMember) => {
    setDeletingTeamMember(member);
    setShowDeleteConfirm(true);
    setOpenDropdownId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTeamMember) return;
    
    try {
      await TeamMemberService.deleteTeamMember(deletingTeamMember.id, selectedOrg?.id || '');
      await loadTeamMembers();
      setShowDeleteConfirm(false);
      setDeletingTeamMember(null);
    } catch (error) {
      console.error('Error deleting team member:', error);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeletingTeamMember(null);
  };

  const handleExportToCSV = async () => {
    try {
      await TeamMemberExportService.exportToCSV(filteredTeamMembers);
      console.log('CSV export completed');
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      alert('Failed to export to CSV');
    }
  };

  const handleExportToExcel = async () => {
    try {
      await TeamMemberExportService.exportToExcel(filteredTeamMembers);
      console.log('Excel export completed');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel');
    }
  };

  const handleImportTeamMembers = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !selectedOrg?.id) return;
      
      try {
        const result = await TeamMemberExportService.importFromFile(file, selectedOrg.id);
        
        if (result.errors.length > 0) {
          console.error('Import errors:', result.errors);
          alert(`Import completed with errors:\n- ${result.success} team members imported successfully\n- ${result.errors.length} errors\n\nCheck console for details.`);
        } else {
          alert(`Successfully imported ${result.success} team members!`);
        }
        
        // Refresh the team members list
        await loadTeamMembers();
      } catch (error) {
        console.error('Error importing file:', error);
        alert('Failed to import file. Please check the format and try again.');
      }
    };
    input.click();
  };

  const filteredTeamMembers = teamMembers.filter(member => {
    // Advanced search filter
    let matchesSearch = true;
    if (searchTerm) {
      const searchableFields: SearchableField[] = [
        { 
          key: 'name', 
          weight: 2.0, // Higher weight for member names
          transform: (member) => member.name || ''
        },
        { 
          key: 'email', 
          weight: 1.5, // High weight for emails
          transform: (member) => member.email || ''
        },
        { 
          key: 'job_title', 
          weight: 1.3,
          transform: (member) => member.job_title || ''
        },
        { 
          key: 'department', 
          weight: 1.0,
          transform: (member) => member.department || ''
        },
        { 
          key: 'phone', 
          weight: 0.8,
          transform: (member) => member.phone || ''
        },
        { 
          key: 'employment_type', 
          weight: 0.7,
          transform: (member) => member.employment_type || ''
        },
        { 
          key: 'status', 
          weight: 0.6,
          transform: (member) => member.status || ''
        }
      ];

      const searchResults = advancedSearch([member], searchTerm, searchableFields, {
        minScore: 0.2, // Lower threshold for more inclusive results
        requireAllTerms: false // Allow partial matches
      });

      matchesSearch = searchResults.length > 0;
    }

    const matchesDepartment = selectedDepartment === 'all' || member.department === selectedDepartment;
    const matchesStatus = selectedStatus === 'all' || member.status === selectedStatus;
    
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const getDepartmentStats = () => {
    const stats: Record<string, number> = {};
    teamMembers.forEach(member => {
      stats[member.department] = (stats[member.department] || 0) + 1;
    });
    return stats;
  };

  // Calculate metrics
  const activeMembers = teamMembers.filter(m => m.status === 'active').length;
  const fullTimeMembers = teamMembers.filter(m => m.employment_type === 'full-time').length;
  const totalProjects = teamMembers.reduce((sum, m) => sum + (m.projectsAssigned || 0), 0);
  const totalHours = teamMembers.reduce((sum, m) => sum + (m.hoursThisMonth || 0), 0);

  const getStatusColor = (status: TeamMember['status']) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-400/10';
      case 'inactive': return 'text-gray-400 bg-gray-400/10';
      case 'on-leave': return 'text-yellow-400 bg-yellow-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  return (
    <div>
      {loading ? (
        <div className="pb-8">
          <div className="bg-transparent border border-[#333333]">
            <TableSkeleton rows={5} columns={5} />
          </div>
        </div>
      ) : teamMembers.length === 0 ? (
        // Onboarding/Empty State
        <div className="max-w-4xl mx-auto p-8">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[#336699]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCheck className="w-8 h-8 text-[#336699]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Team Management</h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-8">
              Add and manage your internal team members, assign roles, and track permissions.
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-[#333333] rounded-[4px] p-6 border-l-4 border-[#336699]">
                <h3 className="text-white font-bold mb-2">Add Team Members</h3>
                <p className="text-gray-400 text-sm">
                  Invite employees and contractors to collaborate
                </p>
              </div>
              <div className="bg-[#333333] rounded-[4px] p-6 border-l-4 border-[#336699]">
                <h3 className="text-white font-bold mb-2">Set Permissions</h3>
                <p className="text-gray-400 text-sm">
                  Control what each team member can access
                </p>
              </div>
              <div className="bg-[#333333] rounded-[4px] p-6 border-l-4 border-[#388E3C]">
                <h3 className="text-white font-bold mb-2">Track Activity</h3>
                <p className="text-gray-400 text-sm">
                  Monitor team performance and productivity
                </p>
              </div>
            </div>

            <button 
              onClick={() => setShowNewModal(true)}
              className="px-6 py-3 bg-white text-black rounded-[8px] font-medium hover:bg-gray-100 transition-colors"
            >
              ADD FIRST TEAM MEMBER
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Team Members Section */}
          <div>
            {/* Unified Container */}
                    <div className="bg-transparent">
          {/* Stats Section */}
          <div className={`${isConstrained ? 'px-4 py-3' : 'px-6 py-4'} border-b border-[#333333]/50`}>
                {isConstrained ? (
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">TOTAL</div>
                      <div className="text-base font-semibold mt-1">{teamMembers.length}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">ACTIVE</div>
                      <div className="text-base font-semibold text-green-400 mt-1">{activeMembers}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">PROJECTS</div>
                      <div className="text-base font-semibold text-blue-400 mt-1">{totalProjects}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">HOURS</div>
                      <div className="text-base font-semibold text-yellow-400 mt-1">{totalHours}</div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-6">
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">TOTAL TEAM</div>
                      <div className="text-lg font-semibold mt-1">{teamMembers.length}</div>
                      <div className="text-xs text-gray-500">team members</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">ACTIVE</div>
                      <div className="text-lg font-semibold text-green-400 mt-1">{activeMembers}</div>
                      <div className="text-xs text-gray-500">working now</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">PROJECTS ASSIGNED</div>
                      <div className="text-lg font-semibold text-blue-400 mt-1">{totalProjects}</div>
                      <div className="text-xs text-gray-500">active projects</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">HOURS THIS MONTH</div>
                      <div className="text-lg font-semibold text-yellow-400 mt-1">{totalHours}</div>
                      <div className="text-xs text-gray-500">total hours</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls Section */}
              <div className={`${isConstrained ? 'px-4 py-3' : 'px-6 py-4'} border-b border-[#333333]/50`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <select
                        className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699] appearance-none pr-10 min-w-[200px]"
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                      >
                        <option value="all">All Departments ({teamMembers.length})</option>
                        {DEPARTMENTS.map(dept => (
                          <option key={dept} value={dept}>
                            {dept} ({getDepartmentStats()[dept] || 0})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    
                    <div className="relative">
                      <select
                        className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699] appearance-none pr-10"
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                      >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="on-leave">On Leave</option>
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewMode('compact')}
                        className={`p-1.5 rounded transition-colors ${
                          viewMode === 'compact' ? 'bg-[#2A2A2A] text-white' : 'text-gray-400 hover:text-white'
                        }`}
                        title="Compact View"
                      >
                        <Rows3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded transition-colors ${
                          viewMode === 'list' ? 'bg-[#2A2A2A] text-white' : 'text-gray-400 hover:text-white'
                        }`}
                        title="List View"
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="relative" ref={optionsMenuRef}>
                      <button
                        onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                        className="bg-[#1E1E1E] border border-[#333333] p-2 text-white hover:bg-[#333333] transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      
                      {showOptionsMenu && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-[#1E1E1E] border border-[#333333] shadow-lg z-[9999] py-2">
                          <button
                            onClick={handleImportTeamMembers}
                            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#333333] flex items-center gap-2"
                          >
                            <Upload className="w-4 h-4" />
                            Import Team
                          </button>
                          <div className="border-t border-[#333333] my-1" />
                          <button
                            onClick={handleExportToCSV}
                            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#333333] flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            Export to CSV
                          </button>
                          <button
                            onClick={handleExportToExcel}
                            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#333333] flex items-center gap-2"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            Export to Excel
                          </button>
                        </div>
                      )}
                    </div>
                    
                                          {!hideAddButton && (
                        <button
                          onClick={() => setShowNewModal(true)}
                          className="bg-white hover:bg-gray-100 text-black px-4 py-2 rounded-[8px] text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Team Member</span>
                        </button>
                      )}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto">
                {viewMode === 'compact' ? (
                  <div className="bg-[#121212] overflow-hidden">
                    <div className="space-y-0">
                      {filteredTeamMembers.map((member, index) => (
                        <div key={member.id} className="relative">
                          <div className="w-full text-left p-2 hover:bg-[#333333] transition-all border-b border-gray-700/30 group cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <div 
                                    className="text-sm font-medium text-white hover:text-blue-400 cursor-pointer truncate"
                                    onClick={() => navigate(`/team-members/${member.id}`)}
                                  >
                                    {member.name}
                                  </div>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(member.status)} flex-shrink-0`}>
                                    {member.status}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-3 text-xs text-gray-400">
                                  <span className="text-[#5b8fc7] font-medium truncate">{member.job_title}</span>
                                  <span className="truncate">{member.department}</span>
                                  <span className="capitalize flex-shrink-0">{member.employment_type}</span>
                                  {member.email && <span className="text-blue-400 truncate">{member.email}</span>}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-sm font-semibold text-blue-400">
                                    {member.projectsAssigned || 0} projects
                                  </div>
                                  <div className="text-xs text-yellow-400">
                                    {member.hoursThisMonth || 0}h this month
                                  </div>
                                </div>
                                
                                <div className="relative" ref={(el) => dropdownRefs.current[member.id] = el}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(openDropdownId === member.id ? null : member.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-600 rounded"
                                    title="More options"
                                  >
                                    <MoreVertical className="w-3 h-3 text-gray-400" />
                                  </button>
                                  
                                  {openDropdownId === member.id && (
                                    <div className="absolute top-full right-0 mt-1 w-48 bg-[#2A2A2A] border border-[#404040] shadow-lg z-[10001] py-1 rounded-[4px]">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/team-members/${member.id}`);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <Eye className="w-3 h-3 mr-2" />
                                        View Details
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingTeamMember(member);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <Edit2 className="w-3 h-3 mr-2" />
                                        Edit
                                      </button>
                                      <div className="border-t border-[#404040] my-1"></div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteClick(member);
                                        }}
                                        className="w-full text-left px-3 py-2 text-red-400 text-xs hover:bg-red-600/20 transition-colors flex items-center"
                                      >
                                        <Trash2 className="w-3 h-3 mr-2" />
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {filteredTeamMembers.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-gray-400">No team members match your filters</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#121212] overflow-hidden">
                    <div className="space-y-0">
                      {filteredTeamMembers.map((member, index) => (
                        <div key={member.id} className="relative">
                          <div className="w-full text-left p-3 md:p-4 hover:bg-[#333333] transition-all border-b border-gray-700/30 group cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <div 
                                    className="text-sm font-medium text-white hover:text-blue-400 cursor-pointer"
                                    onClick={() => navigate(`/team-members/${member.id}`)}
                                  >
                                    {member.name}
                                  </div>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(member.status)}`}>
                                    {member.status}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-4 text-xs text-gray-400 mb-1">
                                  <span className="text-[#5b8fc7] font-medium">{member.job_title}</span>
                                  <span>{member.department}</span>
                                  <span className="capitalize">{member.employment_type}</span>
                                </div>
                                
                                <div className="flex items-center gap-4 text-xs text-gray-400">
                                  {member.email && <span className="text-blue-400">{member.email}</span>}
                                  {member.phone && <span>{member.phone}</span>}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-sm font-semibold text-blue-400">
                                    {member.projectsAssigned || 0} projects
                                  </div>
                                  <div className="text-xs text-yellow-400">
                                    {member.hoursThisMonth || 0}h this month
                                  </div>
                                </div>
                                
                                <div className="relative" ref={(el) => dropdownRefs.current[member.id] = el}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(openDropdownId === member.id ? null : member.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-600 rounded"
                                    title="More options"
                                  >
                                    <MoreVertical className="w-4 h-4 text-gray-400" />
                                  </button>
                                  
                                  {openDropdownId === member.id && (
                                    <div className="absolute top-full right-0 mt-1 w-48 bg-[#2A2A2A] border border-[#404040] shadow-lg z-[10001] py-1 rounded-[4px]">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/team-members/${member.id}`);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <Eye className="w-3 h-3 mr-2" />
                                        View Details
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingTeamMember(member);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <Edit2 className="w-3 h-3 mr-2" />
                                        Edit
                                      </button>
                                      <div className="border-t border-[#404040] my-1"></div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteClick(member);
                                        }}
                                        className="w-full text-left px-3 py-2 text-red-400 text-xs hover:bg-red-600/20 transition-colors flex items-center"
                                      >
                                        <Trash2 className="w-3 h-3 mr-2" />
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {filteredTeamMembers.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-gray-400">No team members match your filters</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create Team Member Modal */}
      <CreateTeamMemberModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onTeamMemberCreated={(newTeamMember) => {
          if (newTeamMember) {
            // Add the new team member to the list immediately (optimistic update)
            setTeamMembers(prevMembers => [newTeamMember, ...prevMembers]);
          } else {
            // Fallback to full reload if no team member data returned
          loadTeamMembers();
          }
          // Don't close the modal here - let the modal handle it
        }}
      />

      {/* Edit Team Member Drawer */}
      <EditTeamMemberDrawer
        teamMember={editingTeamMember}
        onClose={() => setEditingTeamMember(null)}
        onSuccess={() => {
          loadTeamMembers();
          setEditingTeamMember(null);
        }}
        onDelete={(teamMemberId) => {
          setTeamMembers(teamMembers.filter(m => m.id !== teamMemberId));
          setEditingTeamMember(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-white/10 shadow-2xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Team Member</h3>
              <p className="text-white/60 mb-6">
                Are you sure you want to delete "{deletingTeamMember?.name}"? This action cannot be undone.
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