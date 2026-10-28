import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarDays, DollarSign, Plus, User, X } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { Client, ClientService } from '../../services/ClientService';
import { Project, ProjectService } from '../../services/ProjectService';
import { NewClientModal } from '../clients/NewClientModal';
import { NoteDate, NoteRow, noteInput, noteSelect, noteTextarea, noteTitle, useNoteFields, useSlideIn } from '../common/StructuredNote';

/**
 * A new project, started the way a new lead is: one sheet with a name, the
 * client, dates and budget. Creating it opens the project, where everything
 * else (estimates, tasks, crew, costs, photos) lives.
 */
export const NewProjectDrawer: React.FC<{
  onClose: () => void;
  onCreated: (project: Project) => void;
}> = ({ onClose, onCreated }) => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const orgId: string | undefined = selectedOrg?.id;
  const { shown, slideOut } = useSlideIn();
  const [clients, setClients] = useState<Client[]>([]);
  const [showNewClient, setShowNewClient] = useState(false);
  const { draft, set, choose, state, setState, error, setError } = useNoteFields(
    { name: '', client_id: '', budget: '', start_date: '', end_date: '', description: '' },
    null,
  );

  useEffect(() => {
    if (!orgId) return;
    ClientService.list(orgId)
      .then(setClients)
      .catch(() => setClients([]));
  }, [orgId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !showNewClient) slideOut(onClose);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Give the project a name first');
      return;
    }
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      setError('The end date is before the start date');
      return;
    }
    setState('saving');
    setError(null);
    try {
      const project = await ProjectService.create({
        organization_id: orgId,
        name,
        description: draft.description.trim() || undefined,
        client_id: draft.client_id || undefined,
        status: 'planned',
        start_date: draft.start_date || undefined,
        end_date: draft.end_date || undefined,
        budget: draft.budget ? Number(draft.budget) : undefined,
      });
      onCreated(project);
      navigate(`/projects/${project.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project');
      setState('idle');
    }
  };

  const addClient = async (data: Partial<Client>) => {
    if (!orgId) return;
    try {
      const created = await ClientService.create({ ...(data as Client), organization_id: orgId });
      setClients((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
      choose('client_id', created.id ?? '');
      setShowNewClient(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the client');
    }
  };

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => slideOut(onClose)}
      />
      <form
        onSubmit={create}
        aria-label="New project"
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[520px] bg-[#121212] border-l border-[#2A2A2A] shadow-xl flex flex-col transform transition-transform z-[10001] ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-7 pt-4 text-sm text-gray-500">
          <span>New project</span>
          <button type="button" onClick={() => slideOut(onClose)} className="p-1 -mr-1 text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 pt-3 pb-6">
          <input value={draft.name} onChange={set('name')} placeholder="Project name" aria-label="Project name" autoFocus className={noteTitle} />
          <p className="mt-2 text-sm text-gray-500">Starts as planned. Change its status from the project once work begins.</p>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-6 space-y-0.5">
            <NoteRow icon={User} label="Client">
              <select
                id="new-project-client"
                value={draft.client_id}
                onChange={(e) => choose('client_id', e.target.value)}
                aria-label="Client"
                className={`${noteSelect} ${draft.client_id ? '' : 'text-gray-600'}`}
              >
                <option value="">No client yet</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name ? `${client.company_name} (${client.name})` : client.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 border border-[#333] hover:text-white hover:bg-[#1E1E1E] whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
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

          <div className="mt-5 pt-4 border-t border-[#222222]">
            <textarea
              value={draft.description}
              onChange={set('description')}
              placeholder="What's the job? Scope, access, anything worth remembering…"
              aria-label="Description"
              className={noteTextarea}
            />
          </div>
        </div>

        <div className="px-7 py-3.5 border-t border-[#222222] flex items-center justify-between text-sm">
          <span className="text-gray-500">Add estimates, tasks and crew from the project.</span>
          <button type="submit" disabled={state === 'saving'} className="px-4 py-2 bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50">
            {state === 'saving' ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>

      {showNewClient && orgId && (
        <div className="relative z-[10002]" onClick={(e) => e.stopPropagation()}>
          <NewClientModal onClose={() => setShowNewClient(false)} onSave={(data) => void addClient(data as Partial<Client>)} />
        </div>
      )}
    </>,
    document.body,
  );
};
