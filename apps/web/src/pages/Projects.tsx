import React, { useState, useEffect, useContext } from 'react';
import { 
  FolderOpen,
  Search
} from 'lucide-react';
import { ProjectList } from '../components/projects/ProjectList';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { supabase } from '../lib/supabase';

export const Projects: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectsCount, setProjectsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Load projects count
  const loadProjectsCount = async () => {
    if (!selectedOrg?.id) {
      setLoading(false);
      return;
    }

    try {
      const { count } = await supabase
        .from('projects')
        .select('id', { count: 'exact' })
        .eq('organization_id', selectedOrg.id);

      setProjectsCount(count || 0);
    } catch (error) {
      console.error('Error fetching projects count:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjectsCount();
  }, [selectedOrg]);


  return (
    <>
      {/* Single Unified Card */}
      <div className="bg-transparent border border-[#333333]">
        {/* Header Section */}
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-white" />
            <h1 className="text-xl font-semibold text-white">Projects</h1>
            <span className="text-sm text-gray-500">({projectsCount})</span>
          </div>
          
          <div className="flex items-center gap-5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="bg-[#1E1E1E] border border-[#333333] pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] w-[300px]"
              />
            </div>
            
          </div>
        </div>
      </div>

      {/* Content Area - Visually connected */}
      <div className="-mt-[1px]">
        <div className="[&>div]:border-t-0">
          <ProjectList searchTerm={searchTerm} />
        </div>
      </div>
    </>
  );
};