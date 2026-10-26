import React, { useState, useEffect } from 'react';
import { X, Folder, Plus, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Project {
  id: string;
  name: string;
  client_id: string;
  status: string;
  client?: {
    name: string;
    company_name?: string;
  };
}

interface ProjectSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (projectId: string | null) => void;
  clientId?: string;
  estimateTitle?: string;
}

export const ProjectSelectionModal: React.FC<ProjectSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  clientId,
  estimateTitle
}) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen, clientId]);

  const loadProjects = async () => {
    if (!user?.organizationId) return;

    try {
      setLoading(true);
      let query = supabase
        .from('projects')
        .select(`
          *,
          client:clients(name, company_name)
        `)
        .eq('organization_id', user.organizationId)
        .order('created_at', { ascending: false });

      // Filter by client if provided
      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    if (showCreateProject) {
      // Close this modal and trigger project creation flow
      onSelect('CREATE_NEW');
    } else {
      onSelect(selectedProjectId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1E1E1E] rounded-lg border border-[#333333] p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Link to Project</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#333333] rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <p className="text-gray-400 mb-6">
          Would you like to link this invoice to a project? This helps track project profitability and progress.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699]"></div>
          </div>
        ) : (
          <div className="space-y-4 flex-1 overflow-y-auto">
            {/* Create New Project Option */}
            <div
              onClick={() => {
                setShowCreateProject(true);
                setSelectedProjectId(null);
              }}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                showCreateProject
                  ? 'border-[#336699] bg-[#336699]/10'
                  : 'border-[#333333] hover:border-[#555555] bg-[#2a2a2a]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5 text-[#5b8fc7]" />
                <div className="flex-1">
                  <h3 className="text-white font-medium">Create New Project</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Start a new project for {estimateTitle || 'this work'}
                  </p>
                </div>
              </div>
            </div>

            {/* Existing Projects */}
            {projects.length > 0 && (
              <>
                <div className="text-sm text-gray-500 mt-4 mb-2">Or select existing project:</div>
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setShowCreateProject(false);
                    }}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedProjectId === project.id
                        ? 'border-[#336699] bg-[#336699]/10'
                        : 'border-[#333333] hover:border-[#555555] bg-[#2a2a2a]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Folder className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <h3 className="text-white font-medium">{project.name}</h3>
                        <p className="text-sm text-gray-400">
                          {project.client?.company_name || project.client?.name} • {project.status}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Skip Option */}
            <div
              onClick={() => {
                setSelectedProjectId(null);
                setShowCreateProject(false);
              }}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                !selectedProjectId && !showCreateProject
                  ? 'border-[#555555] bg-[#333333]/50'
                  : 'border-[#333333] hover:border-[#555555] bg-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <ArrowRight className="w-5 h-5 text-gray-500" />
                <div className="flex-1">
                  <h3 className="text-white font-medium">Skip for Now</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Create invoice without linking to a project
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-[#333333]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#336699]/90 transition-colors flex items-center gap-2"
          >
            {showCreateProject ? 'Create Project' : selectedProjectId ? 'Select Project' : 'Skip & Continue'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};