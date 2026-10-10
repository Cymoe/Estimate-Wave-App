import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, CalendarDays, CalendarCheck, DollarSign, FileText, Trash2, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ProjectService, type Project, type ProjectStatus } from '../../services/ProjectService';
import { ClientService, type Client } from '../../services/ClientService';
import { EstimateService, type Estimate } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';
import { NoteDate, NoteRow, SaveStatus, noteInput, noteSelect, noteTextarea, noteTitle, useNoteFields, useSlideIn } from '../common/StructuredNote';
import { PROJECT_STATUSES, projectStatusInfo } from './projectStatus';

type Draft = {
  name: string;
  client_id: string;
  budget: string;
  start_date: string;
  end_date: string;
  description: string;
};

const draftOf = (project: Project | null): Draft => ({
  name: project?.name ?? '',
  client_id: project?.client_id ?? '',
  budget: project?.budget != null ? String(project.budget) : '',
  start_date: project?.start_date ?? '',
  end_date: project?.end_date ?? '',
  description: project?.description ?? '',
});

const ESTIMATE_PILL: Record<string, string> = {
  draft: 'bg-gray-500/15 text-gray-300',
  sent: 'bg-blue-500/15 text-blue-300',
  opened: 'bg-purple-500/15 text-purple-300',
  accepted: 'bg-green-500/15 text-green-300',
  rejected: 'bg-red-500/15 text-red-300',
  expired: 'bg-yellow-500/15 text-yellow-300',
};

/**
 * A project as a structured note: name, status, client, budget, dates, a
 * description and the project's estimates. An existing project saves each
 * field as you leave it; a new one is added with the button.
 */
export const ProjectDrawer: React.FC<{
  organizationId: string;
  project: Project | null;
  onClose: () => void;
  /** A saved change (or a new project), so the list can show it. */
  onSaved: (project: Project) => void;
  onDeleted: (id: string) => void;
}> = ({ organizationId, project, onClose, onSaved, onDeleted }) => {
  const navigate = useNavigate();
  const { shown, slideOut } = useSlideIn();
  const [clients, setClients] = useState<Client[]>([]);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planned');

  const fields = useNoteFields<Draft>(
    draftOf(project),
    project?.id
      ? async (patch) => onSaved(await ProjectService.update(project.id!, patch as Partial<Project>))
      : null,
    ['name'],
  );
  const { draft, set, choose, commit, state, setState, error, setError } = fields;

  useEffect(() => {
    ClientService.list(organizationId).then(setClients).catch(() => setClients([]));
    if (project?.id) {
      EstimateService.getByProject(project.id, organizationId).then(setEstimates).catch(() => setEstimates([]));
    }
  }, [organizationId, project?.id]);

  const changeStatus = async (next: ProjectStatus) => {
    setStatus(next);
    if (!project?.id) return;
    setState('saving');
    try {
      onSaved(await ProjectService.updateStatus(project.id, next));
      setState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setState('idle');
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (project) {
      (document.activeElement as HTMLElement | null)?.blur(); // Enter saves the field
      return;
    }
    if (!draft.name.trim()) {
      setError('Add a name first');
      return;
    }
    setState('saving');
    try {
      const created = await ProjectService.create({ ...draft, budget: draft.budget as unknown as number, status, organization_id: organizationId });
      slideOut(() => onSaved(created));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the project');
      setState('idle');
    }
  };

  const remove = async () => {
    if (!project?.id || !window.confirm(`Delete “${project.name}”? Its estimates stay.`)) return;
    try {
      await ProjectService.delete(project.id);
      slideOut(() => onDeleted(project.id!));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  const statusInfo = projectStatusInfo(status);
  const added = project?.created_at
    ? new Date(project.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => slideOut(onClose)}
      />
      <form
        onSubmit={create}
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[520px] bg-[#121212] border-l border-[#2A2A2A] shadow-xl flex flex-col transform transition-transform z-[10001] ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-7 pt-4 text-sm text-gray-500">
          <span>{project ? `Project${added ? ` · added ${added}` : ''}` : 'New project'}</span>
          <button type="button" onClick={() => slideOut(onClose)} className="p-1 -mr-1 text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 pt-3 pb-6">
          <input
            value={draft.name}
            onChange={set('name')}
            onBlur={() => commit('name')}
            placeholder="Project name"
            aria-label="Project name"
            autoFocus={!project}
            className={noteTitle}
          />

          {/* The status, as a pill; the real picker sits invisibly on top. */}
          <label className={`relative mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm cursor-pointer ${statusInfo.pill}`}>
            {statusInfo.label}
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value as ProjectStatus)}
              aria-label="Status"
              className="absolute inset-0 opacity-0 cursor-pointer text-base"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-6 space-y-0.5">
            <NoteRow icon={User} label="Client">
              <select
                value={draft.client_id}
                onChange={(e) => choose('client_id', e.target.value)}
                aria-label="Client"
                className={`${noteSelect} ${draft.client_id ? '' : 'text-gray-600'}`}
              >
                <option value="">No client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name ? `${client.company_name} (${client.name})` : client.name}
                  </option>
                ))}
              </select>
              {draft.client_id && (
                <button
                  type="button"
                  onClick={() => navigate(`/clients/${draft.client_id}`)}
                  className="p-1 text-gray-500 hover:text-white"
                  aria-label="Open client"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              )}
            </NoteRow>
            <NoteRow icon={DollarSign} label="Budget">
              {draft.budget && <span className="-mr-1.5 text-[15px] text-gray-400">$</span>}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={draft.budget}
                onChange={set('budget')}
                onBlur={() => commit('budget')}
                placeholder="Add budget"
                aria-label="Budget"
                className={noteInput}
              />
            </NoteRow>
            <NoteRow icon={CalendarDays} label="Start">
              <NoteDate value={draft.start_date} onChange={(value) => choose('start_date', value)} label="Start date" />
            </NoteRow>
            <NoteRow icon={CalendarCheck} label="End">
              <NoteDate value={draft.end_date} onChange={(value) => choose('end_date', value)} label="End date" />
            </NoteRow>
          </div>

          <div className="mt-5 pt-5 border-t border-[#222222]">
            <textarea
              value={draft.description}
              onChange={set('description')}
              onBlur={() => commit('description')}
              placeholder="What's the job? Scope, access, anything worth remembering…"
              aria-label="Description"
              className={noteTextarea}
            />
          </div>

          {project && (
            <div className="mt-5 pt-5 border-t border-[#222222]">
              <h3 className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <FileText className="w-4 h-4 text-gray-600" /> Estimates
              </h3>
              {estimates === null ? (
                <p className="text-sm text-gray-600">Loading…</p>
              ) : estimates.length === 0 ? (
                <p className="text-sm text-gray-600">No estimates for this project yet.</p>
              ) : (
                <div className="-mx-2">
                  {estimates.map((estimate) => (
                    <button
                      key={estimate.id}
                      type="button"
                      onClick={() => navigate(`/estimates/${estimate.id}`)}
                      className="w-full grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-2 py-2 rounded-md hover:bg-[#1B1B1B] text-left text-sm"
                    >
                      <span className="truncate text-gray-100">
                        {estimate.estimate_number}
                        {estimate.title && <span className="text-gray-500"> · {estimate.title}</span>}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${ESTIMATE_PILL[estimate.status] ?? ESTIMATE_PILL.draft}`}>
                        {estimate.status}
                      </span>
                      <span className="tabular-nums text-gray-100">{formatCurrency(estimate.total_amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-7 py-3.5 border-t border-[#222222] flex items-center justify-between text-sm">
          {project ? (
            <>
              <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" /> Delete project
              </button>
              <SaveStatus state={state} />
            </>
          ) : (
            <>
              <span />
              <button type="submit" disabled={state === 'saving'} className="px-4 py-2 rounded-md bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50">
                {state === 'saving' ? 'Adding…' : 'Add project'}
              </button>
            </>
          )}
        </div>
      </form>
    </>,
    document.body,
  );
};
