import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, ChevronDown, ChevronRight, Clock } from 'lucide-react';

interface WorkPackTask {
  id: string;
  title: string;
  description?: string;
  estimated_hours: number;
  sequence_order: number;
  work_pack_id: string;
  category?: string;
  created_at: string;
}

interface WorkPackTaskListProps {
  workPackId: string;
  onTaskUpdate?: () => void;
}

export const WorkPackTaskList: React.FC<WorkPackTaskListProps> = ({ workPackId, onTaskUpdate }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WorkPackTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    preparation: true,
    demolition: true,
    electrical: true,
    plumbing: true,
    framing: true,
    drywall: true,
    painting: true,
    flooring: true,
    finishing: true,
    general: true
  });
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState('');

  useEffect(() => {
    if (workPackId) {
      loadTasks();
    }
  }, [workPackId]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('work_pack_tasks')
        .select('*')
        .eq('work_pack_id', workPackId)
        .order('sequence_order', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading work pack tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category?: string) => {
    const colors: Record<string, string> = {
      'preparation': '#06b6d4',
      'demolition': '#ef4444',
      'electrical': '#3b82f6',
      'plumbing': '#10b981',
      'framing': '#f59e0b',
      'drywall': '#8b5cf6',
      'painting': '#ec4899',
      'flooring': '#f97316',
      'finishing': '#84cc16',
      'cleanup': '#6b7280'
    };
    return colors[category?.toLowerCase() || ''] || '#6b7280';
  };

  const groupTasksByCategory = () => {
    const groups: Record<string, WorkPackTask[]> = {};
    
    tasks.forEach(task => {
      const category = task.category || 'general';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(task);
    });

    return groups;
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const createTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      const nextSequence = Math.max(...tasks.map(t => t.sequence_order || 0), 0) + 1;
      
      const { data, error } = await supabase
        .from('work_pack_tasks')
        .insert({
          title: newTaskTitle,
          description: newTaskDescription || null,
          estimated_hours: parseFloat(newTaskHours) || 0,
          sequence_order: nextSequence,
          work_pack_id: workPackId,
          category: newTaskCategory || null,
          user_id: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      setTasks([...tasks, data]);
      
      // Reset form
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskHours('');
      setNewTaskCategory('');
      setIsCreating(false);

      if (onTaskUpdate) {
        onTaskUpdate();
      }
    } catch (error) {
      console.error('Error creating work pack task:', error);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      const { error } = await supabase
        .from('work_pack_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      setTasks(tasks.filter(t => t.id !== taskId));

      if (onTaskUpdate) {
        onTaskUpdate();
      }
    } catch (error) {
      console.error('Error deleting work pack task:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      createTask();
    }
    if (e.key === 'Escape') {
      setIsCreating(false);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskHours('');
      setNewTaskCategory('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699]"></div>
      </div>
    );
  }

  const groupedTasks = groupTasksByCategory();
  const totalTasks = tasks.length;
  const totalHours = tasks.reduce((sum, task) => sum + (task.estimated_hours || 0), 0);
  const avgHours = totalTasks > 0 ? totalHours / totalTasks : 0;
  const estimatedCost = totalHours * 50; // $50/hour

  // Category order for logical workflow
  const categoryOrder = ['preparation', 'demolition', 'electrical', 'plumbing', 'framing', 'drywall', 'painting', 'flooring', 'finishing', 'cleanup', 'general'];
  const sortedCategories = Object.keys(groupedTasks).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="space-y-6">
      {/* KPI Header Strip */}
      <div className="pb-6 mb-6 border-b border-[#2a2a2a]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Total Tasks */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Template Tasks</div>
            <div className="text-2xl font-semibold">{totalTasks}</div>
            <div className="text-sm text-gray-500 mt-1">in sequence</div>
          </div>

          {/* Total Hours */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Hours</div>
            <div className="text-2xl font-semibold text-[#5b8fc7]">{totalHours}h</div>
            <div className="text-sm text-gray-500 mt-1">estimated</div>
          </div>

          {/* Average Hours */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Avg per Task</div>
            <div className="text-2xl font-semibold text-[#336699]">{avgHours.toFixed(1)}h</div>
            <div className="text-sm text-gray-500 mt-1">per task</div>
          </div>

          {/* Labor Cost */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Labor Cost</div>
            <div className="text-2xl font-semibold text-green-500">${estimatedCost.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">@ $50/hr</div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button className="text-sm text-gray-500 hover:text-gray-400">
            ○ template tasks <ChevronDown className="inline w-3 h-3 ml-1" />
          </button>
          <button className="text-sm text-gray-500 hover:text-gray-400">
            workflow sequence
          </button>
        </div>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="p-2 hover:bg-[#2a2a2a] rounded transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Task Creation Form */}
      {isCreating && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-gray-600"></div>
            
            <div className="flex-1 space-y-3">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="What task needs to be completed?"
                className="w-full bg-transparent text-white placeholder-gray-500 outline-none text-sm"
                autoFocus
              />
              
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Task description (optional)"
                rows={2}
                className="w-full bg-transparent text-white placeholder-gray-500 outline-none text-sm resize-none"
              />
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <input
                    type="number"
                    value={newTaskHours}
                    onChange={(e) => setNewTaskHours(e.target.value)}
                    placeholder="Hours"
                    step="0.5"
                    className="w-20 bg-transparent text-white placeholder-gray-500 outline-none text-xs border-b border-gray-600 focus:border-[#336699]"
                  />
                  <span className="text-xs text-gray-500">hours</span>
                </div>
                
                <select
                  value={newTaskCategory}
                  onChange={(e) => setNewTaskCategory(e.target.value)}
                  className="text-xs bg-transparent text-gray-500 hover:text-gray-400 outline-none cursor-pointer border border-transparent hover:border-[#336699] rounded px-2 py-1 transition-colors"
                >
                  <option value="" className="bg-[#1a1a1a]">No category</option>
                  <option value="preparation" className="bg-[#1a1a1a]">Preparation</option>
                  <option value="demolition" className="bg-[#1a1a1a]">Demolition</option>
                  <option value="electrical" className="bg-[#1a1a1a]">Electrical</option>
                  <option value="plumbing" className="bg-[#1a1a1a]">Plumbing</option>
                  <option value="framing" className="bg-[#1a1a1a]">Framing</option>
                  <option value="drywall" className="bg-[#1a1a1a]">Drywall</option>
                  <option value="painting" className="bg-[#1a1a1a]">Painting</option>
                  <option value="flooring" className="bg-[#1a1a1a]">Flooring</option>
                  <option value="finishing" className="bg-[#1a1a1a]">Finishing</option>
                  <option value="cleanup" className="bg-[#1a1a1a]">Cleanup</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={createTask}
                className="px-3 py-1 bg-[#336699] hover:bg-[#5A8BB8] text-white rounded text-xs transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewTaskTitle('');
                  setNewTaskDescription('');
                  setNewTaskHours('');
                  setNewTaskCategory('');
                }}
                className="px-3 py-1 text-gray-500 hover:text-gray-400 border border-transparent hover:border-gray-600 rounded text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Groups by Category */}
      <div className="space-y-6">
        {sortedCategories.map(category => (
          <div key={category}>
            <button
              onClick={() => toggleSection(category)}
              className="flex items-center gap-2 text-sm text-gray-400 mb-3"
            >
              {expandedSections[category] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {category} ({groupedTasks[category].length})
            </button>
            {expandedSections[category] && (
              <div className="space-y-2">
                {groupedTasks[category].map(task => (
                  <WorkPackTaskItem 
                    key={task.id} 
                    task={task} 
                    onDelete={deleteTask}
                    getCategoryColor={getCategoryColor} 
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No template tasks yet</p>
          <button 
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-[#336699] hover:bg-[#5A8BB8] text-white rounded-md text-sm transition-colors"
          >
            Create First Task
          </button>
        </div>
      )}
    </div>
  );
};

// Work Pack Task Item Component
const WorkPackTaskItem: React.FC<{
  task: WorkPackTask;
  onDelete: (id: string) => void;
  getCategoryColor: (category?: string) => string;
}> = ({ task, onDelete, getCategoryColor }) => {
  return (
    <div className="flex items-start gap-3 group hover:bg-[#0a0a0a] p-2 -mx-2 rounded transition-colors">
      <div className="mt-0.5 w-5 h-5 rounded-full bg-[#336699] text-white text-xs font-bold flex items-center justify-center">
        {task.sequence_order}
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <span className="text-sm text-white">
            {task.title}
          </span>
          {task.estimated_hours > 0 && (
            <span className="text-xs text-[#5b8fc7] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {task.estimated_hours}h
            </span>
          )}
        </div>
        
        {task.description && (
          <div className="text-xs text-gray-400 mt-1 leading-relaxed">
            {task.description}
          </div>
        )}
        
        {task.category && (
          <div className="mt-1">
            <span 
              className="text-xs px-2 py-0.5 rounded"
              style={{ 
                backgroundColor: `${getCategoryColor(task.category)}20`,
                color: getCategoryColor(task.category)
              }}
            >
              {task.category}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.estimated_hours > 0 && (
          <span className="text-xs text-gray-500">
            ${(task.estimated_hours * 50).toLocaleString()}
          </span>
        )}
        <button
          onClick={() => onDelete(task.id)}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}; 