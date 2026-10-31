import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { EstimateService, type Estimate } from '../../services/EstimateService';
import { ProjectService, type Project } from '../../services/ProjectService';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const link = 'text-xs text-[#336699] hover:text-white disabled:opacity-50';

/**
 * Which project the estimate belongs to. An estimate made first can be added
 * to a project later, moved to another, or start a new project of its own.
 */
export function EstimateProject({
  estimate,
  organizationId,
  onChanged,
  /** The project is right behind this estimate (opened from its drawer): no link to open it. */
  behind = false,
}: {
  estimate: Estimate;
  organizationId?: string;
  onChanged: () => void | Promise<void>;
  behind?: boolean;
}) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = estimate.id!;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setChoosing(false);
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const startChoosing = async () => {
    setChoosing(true);
    setError(null);
    if (projects !== null || !organizationId) return;
    try {
      const all = await ProjectService.list(organizationId);
      // This client's projects first, then the rest by name.
      const mine = (p: Project) => (estimate.client_id && p.client_id === estimate.client_id ? 0 : 1);
      setProjects([...all].sort((a, b) => mine(a) - mine(b) || a.name.localeCompare(b.name)));
    } catch (err) {
      setError(errorText(err));
      setProjects([]);
    }
  };

  const attach = (projectId: string) => run(() => EstimateService.update(id, { project_id: projectId }));
  const startProject = () =>
    run(async () => {
      if (!organizationId) throw new Error('Pick a company first');
      const name = estimate.title?.trim() || (estimate.client?.name ? `${estimate.client.name} job` : `Job for ${estimate.estimate_number}`);
      const project = await ProjectService.create({
        organization_id: organizationId,
        name,
        client_id: estimate.client_id,
        status: 'planned',
        budget: estimate.total_amount || undefined,
      });
      await EstimateService.update(id, { project_id: project.id });
    });

  const project = estimate.project;
  return (
    <div className="bg-[#1a1a1a] rounded-lg border border-[#333] p-4" data-testid="estimate-project">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Project</h3>
        {project && !choosing && (
          <button type="button" onClick={startChoosing} className={link} disabled={busy}>
            Change
          </button>
        )}
      </div>

      {choosing ? (
        <div className="space-y-2">
          {projects === null ? (
            <p className="text-sm text-gray-500">Loading projects…</p>
          ) : (
            <select
              aria-label="Add to project"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '__none') run(() => EstimateService.update(id, { project_id: '' }));
                else if (value) attach(value);
              }}
              className="w-full bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-sm text-white"
            >
              <option value="" disabled>
                {projects.length ? 'Pick a project' : 'No projects yet'}
              </option>
              {projects
                .filter((p) => p.id !== project?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.client?.name ? ` · ${p.client.name}` : ''}
                  </option>
                ))}
              {project && <option value="__none">Not part of a project</option>}
            </select>
          )}
          <div className="flex gap-4">
            {!project && (
              <button type="button" onClick={startProject} className={link} disabled={busy}>
                Start a new project from this estimate
              </button>
            )}
            <button type="button" onClick={() => setChoosing(false)} className="text-xs text-gray-400 hover:text-white" disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : project ? (
        behind ? (
          <p className="flex items-center gap-2 text-base font-medium text-white">
            <FolderOpen className="w-4 h-4 text-gray-400" />
            {project.name}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => navigate(`/projects/${project.id}?tab=estimates`)}
            className="flex items-center gap-2 text-base font-medium text-[#5b8fc7] hover:underline"
          >
            <FolderOpen className="w-4 h-4" />
            {project.name}
          </button>
        )
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Not part of a project yet.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={startChoosing} className={link} disabled={busy}>
              Add to a project
            </button>
            <button type="button" onClick={startProject} className={link} disabled={busy}>
              Start a new project from it
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
