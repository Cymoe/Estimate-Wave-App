import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface TemplateTimelineEvent {
  id: string;
  title: string;
  duration: string;
  description: string;
  type: 'milestone' | 'phase';
  estimatedHours: number;
  sequenceOrder: number;
}

interface WorkPackTimelineViewProps {
  workPackId: string;
}

export const WorkPackTimelineView: React.FC<WorkPackTimelineViewProps> = ({ workPackId }) => {
  const [timelineEvents, setTimelineEvents] = useState<TemplateTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workPackId) {
      loadTimelineData();
    } else {
      setLoading(false);
      setError('No work pack ID provided');
    }
  }, [workPackId]);

  const loadTimelineData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load work pack details
      const { data: workPack, error: workPackError } = await supabase
        .from('work_packs')
        .select('name, base_price')
        .eq('id', workPackId)
        .single();

      if (workPackError) {
        throw new Error(`Failed to load work pack: ${workPackError.message}`);
      }

      // Load work pack tasks to build timeline
      const { data: tasks, error: tasksError } = await supabase
        .from('work_pack_tasks')
        .select('*')
        .eq('work_pack_id', workPackId)
        .order('sequence_order', { ascending: true });

      if (tasksError) {
        console.error('Tasks loading error:', tasksError);
      }

      // Generate timeline events based on template workflow
      const events: TemplateTimelineEvent[] = [];

      // Template Creation milestone
      events.push({
        id: 'template-start',
        title: 'Template Ready',
        duration: 'Day 0',
        description: 'Work pack template is configured and ready for project use',
        type: 'milestone',
        estimatedHours: 0,
        sequenceOrder: 0
      });

      // Group tasks by category and create phases
      const tasksByCategory = (tasks || []).reduce((acc: any, task: any) => {
        const category = task.category || 'general';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(task);
        return acc;
      }, {});

      // Define logical phase order for construction workflow
      const phaseOrder = ['preparation', 'demolition', 'electrical', 'plumbing', 'framing', 'drywall', 'painting', 'flooring', 'finishing', 'cleanup', 'general'];
      const sortedCategories = Object.keys(tasksByCategory).sort((a, b) => {
        const aIndex = phaseOrder.indexOf(a);
        const bIndex = phaseOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      // Create phase events
      let cumulativeHours = 0;
      let currentDay = 1;

      sortedCategories.forEach((category, index) => {
        const categoryTasks = tasksByCategory[category];
        const totalHours = categoryTasks.reduce((sum: number, task: any) => sum + (task.estimated_hours || 0), 0);
        const estimatedDays = Math.max(1, Math.ceil(totalHours / 8)); // 8 hours per day
        
        if (totalHours > 0) {
          const endDay = currentDay + estimatedDays - 1;
          
          events.push({
            id: `phase-${category}`,
            title: category.charAt(0).toUpperCase() + category.slice(1),
            duration: estimatedDays === 1 ? `Day ${currentDay}` : `Days ${currentDay}-${endDay}`,
            description: `${categoryTasks.length} task${categoryTasks.length !== 1 ? 's' : ''} • ${totalHours}h estimated`,
            type: 'phase',
            estimatedHours: totalHours,
            sequenceOrder: index + 1
          });

          cumulativeHours += totalHours;
          currentDay = endDay + 1;
        }
      });

      // Template Completion milestone
      const totalDays = Math.max(1, Math.ceil(cumulativeHours / 8));
      events.push({
        id: 'template-completion',
        title: 'Project Completion',
        duration: `Day ${totalDays}`,
        description: `Estimated completion after ${cumulativeHours}h of work (${totalDays} days)`,
        type: 'milestone',
        estimatedHours: cumulativeHours,
        sequenceOrder: sortedCategories.length + 1
      });

      setTimelineEvents(events);
    } catch (error) {
      console.error('Timeline loading error:', error);
      setError(error instanceof Error ? error.message : 'Failed to load timeline data');
      
      // Provide fallback timeline data
      const fallbackEvents: TemplateTimelineEvent[] = [
        {
          id: 'template-start',
          title: 'Template Ready',
          duration: 'Day 0',
          description: 'Work pack template is configured and ready for project use',
          type: 'milestone',
          estimatedHours: 0,
          sequenceOrder: 0
        },
        {
          id: 'phase-preparation',
          title: 'Preparation',
          duration: 'Days 1-2',
          description: '3 tasks • 16h estimated',
          type: 'phase',
          estimatedHours: 16,
          sequenceOrder: 1
        },
        {
          id: 'phase-installation',
          title: 'Installation',
          duration: 'Days 3-7',
          description: '8 tasks • 40h estimated',
          type: 'phase',
          estimatedHours: 40,
          sequenceOrder: 2
        },
        {
          id: 'phase-finishing',
          title: 'Finishing',
          duration: 'Days 8-9',
          description: '4 tasks • 16h estimated',
          type: 'phase',
          estimatedHours: 16,
          sequenceOrder: 3
        },
        {
          id: 'template-completion',
          title: 'Project Completion',
          duration: 'Day 9',
          description: 'Estimated completion after 72h of work (9 days)',
          type: 'milestone',
          estimatedHours: 72,
          sequenceOrder: 4
        }
      ];
      setTimelineEvents(fallbackEvents);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">Template Timeline</h2>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699]"></div>
        </div>
      </div>
    );
  }

  const totalHours = timelineEvents.reduce((sum, event) => sum + event.estimatedHours, 0);
  const totalDays = Math.max(1, Math.ceil(totalHours / 8));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">Template Timeline</h2>
        <div className="text-sm text-[#5b8fc7]">
          {totalHours}h • {totalDays} day{totalDays !== 1 ? 's' : ''} estimated
        </div>
      </div>
      
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-[4px] p-4 mb-4">
          <p className="text-red-400 text-sm">⚠️ {error}</p>
          <p className="text-gray-400 text-xs mt-1">Showing example timeline below</p>
        </div>
      )}

      {/* Timeline Summary */}
      <div className="bg-[#336699]/10 border border-[#336699]/20 rounded-[4px] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-[#5b8fc7] font-medium">Template Workflow</div>
            <div className="text-sm text-gray-400">
              {timelineEvents.filter(e => e.type === 'phase').length} phases • {timelineEvents.filter(e => e.type === 'milestone').length} milestones
            </div>
          </div>
          <div className="text-lg font-bold text-[#5b8fc7]">
            ${(totalHours * 50).toLocaleString()} labor
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-800"></div>
        <div className="space-y-6">
          {timelineEvents.map((event) => (
            <div key={event.id} className="relative pl-14">
              <div
                className={`absolute left-4 top-1.5 w-4 h-4 rounded-full border-2 ${
                  event.type === "milestone"
                    ? "bg-[#336699] border-[#5A8BB8]"
                    : "bg-[#336699] border-[#2a5580]"
                }`}
              ></div>
              <div className="bg-[#111827]/50 border border-gray-800 rounded-[4px] p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium text-white">{event.title}</div>
                  <div className="flex items-center gap-2">
                    {event.estimatedHours > 0 && (
                      <span className="px-2 py-1 rounded text-xs font-medium border border-[#336699]/60 text-[#5b8fc7] bg-[#336699]/10">
                        {event.estimatedHours}h
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium border ${
                        event.type === "milestone"
                          ? "border-[#336699]/60 text-[#336699] bg-[#336699]/10"
                          : "border-gray-700 text-gray-400 bg-gray-900/20"
                      }`}
                    >
                      {event.type === 'milestone' ? 'Milestone' : 'Phase'}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-400 mb-2">{event.duration}</div>
                <div className="text-sm text-gray-300">{event.description}</div>
                {event.estimatedHours > 0 && event.type === 'phase' && (
                  <div className="mt-2 text-xs text-[#5b8fc7]">
                    Estimated cost: ${(event.estimatedHours * 50).toLocaleString()} @ $50/hr
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Template Notes */}
      <div className="bg-[#111827]/30 border border-gray-800/50 rounded-[4px] p-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wider">Template Notes</h4>
        <div className="text-sm text-gray-400 space-y-1">
          <p>• Timeline based on task sequence and estimated hours</p>
          <p>• Actual project duration may vary based on team size and conditions</p>
          <p>• Phase order follows logical construction workflow</p>
          <p>• Labor costs calculated at $50/hour standard rate</p>
        </div>
      </div>
    </div>
  );
}; 