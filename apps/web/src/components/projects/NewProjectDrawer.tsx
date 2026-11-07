import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarDays, DollarSign, LayoutTemplate, Package, Plus, User, X } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { industriesAPI, templatesAPI, type ProjectTemplate } from '../../lib/api';
import { Client, ClientService } from '../../services/ClientService';
import { Project, ProjectService, toProject } from '../../services/ProjectService';
import { NewClientModal } from '../clients/NewClientModal';
import { NoteDate, NoteRow, noteInput, noteSelect, noteTextarea, noteTitle, useNoteFields, useSlideIn } from '../common/StructuredNote';
import { formatCurrency } from '../../utils/format';
import { projectTypesFor } from './projectTypes';
import { templateSummary } from '../../lib/templates';
import { packagesFor, packageTotal, type BuiltInPackage } from '../../../convex/catalog/packages';

interface Trade {
  id: string;
  slug: string;
  name: string;
}

/**
 * Something a project can start from: one of the company's saved templates
 * (a job it has done, with the estimate's lines, the tasks and how long it
 * took), or just a kind of job in one of its trades.
 */
type Template = { kind: 'type'; id: string; name: string; description: string; trade: Trade } | ({ kind: 'saved' } & ProjectTemplate);

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const plusDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** The project name a template suggests, before the owner changes it. */
const suggestedName = (from: { name: string } | null, client: Client | undefined) =>
  from ? [from.name, client?.name].filter(Boolean).join(' – ') : '';

/**
 * A new project, started the way a new lead is: one sheet with a name, the
 * client, dates and budget. A template fills it in; creating it opens the
 * project, where everything else (estimates, tasks, crew, costs, photos) lives.
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [saved, setSaved] = useState<ProjectTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  // A built-in package under the chosen kind of job (convex/catalog/packages.ts).
  const [packageId, setPackageId] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const { draft, set, choose, state, setState, error, setError } = useNoteFields(
    { name: '', client_id: '', budget: '', start_date: todayIso(), end_date: '', description: '' },
    null,
  );
  // The name the template last wrote, so a name the owner typed is kept.
  const autoName = useRef('');

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const [mine, all, templates, clientList] = await Promise.all([
        industriesAPI.forOrganization(orgId).catch(() => []),
        industriesAPI.list().catch(() => []),
        templatesAPI.list(orgId).catch(() => []),
        ClientService.list(orgId).catch(() => []),
      ]);
      if (cancelled) return;
      // Without chosen trades, offer every trade rather than nothing.
      setTrades((mine.length > 0 ? mine : all).map((t: Trade) => ({ id: t.id, slug: t.slug, name: t.name })));
      setSaved(templates);
      setClients(clientList);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !showNewClient) slideOut(onClose);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const templates = useMemo<Template[]>(
    () => [
      ...saved.map((t) => ({ kind: 'saved' as const, ...t })),
      ...trades.flatMap((trade) =>
        projectTypesFor(trade).map((type) => ({
          kind: 'type' as const,
          id: `${trade.slug}:${type.name}`,
          name: type.name,
          description: type.description,
          trade,
        })),
      ),
    ],
    [saved, trades],
  );
  const template = templates.find((t) => t.id === templateId) ?? null;
  const client = clients.find((c) => c.id === draft.client_id);

  const renameFrom = (nextTemplate: { name: string } | null, nextClient: Client | undefined) => {
    const next = suggestedName(nextTemplate, nextClient);
    if (!draft.name.trim() || draft.name === autoName.current) choose('name', next);
    autoName.current = next;
  };

  const packages = template?.kind === 'type' ? packagesFor(template.trade.slug, template.name) : [];
  const chosenPackage = packages.find((p) => p.id === packageId) ?? null;

  const fillFrom = (from: { total: number; days?: number; description?: string }) => {
    if (from.total > 0) choose('budget', String(from.total));
    if (from.days && draft.start_date) choose('end_date', plusDays(draft.start_date, from.days - 1));
    if (from.description && !draft.description.trim()) choose('description', from.description);
  };

  const choosePackage = (id: string, from: BuiltInPackage[] = packages) => {
    setPackageId(id);
    const chosen = from.find((p) => p.id === id) ?? null;
    renameFrom(chosen ?? template, client);
    if (chosen) fillFrom({ total: packageTotal(chosen), days: chosen.days, description: chosen.description });
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    setPackageId('');
    const chosen = templates.find((t) => t.id === id) ?? null;
    renameFrom(chosen, client);
    if (chosen?.kind === 'saved') fillFrom(chosen);
  };

  const chooseClient = (id: string) => {
    choose('client_id', id);
    renameFrom(
      chosenPackage ?? template,
      clients.find((c) => c.id === id),
    );
  };

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
      let project: Project;
      const sheet = {
        name,
        clientId: draft.client_id || undefined,
        startDate: draft.start_date || undefined,
        endDate: draft.end_date || undefined,
        budget: draft.budget ? Number(draft.budget) : undefined,
        description: draft.description.trim() || undefined,
      };
      if (chosenPackage) {
        // The package brings its estimate lines and tasks along.
        project = toProject((await templatesAPI.startPackage(orgId, chosenPackage.id, sheet)).project);
      } else if (template?.kind === 'saved') {
        // The template brings its estimate lines and tasks along.
        project = toProject((await templatesAPI.start(template.id, sheet)).project);
      } else {
        project = await ProjectService.create({
          organization_id: orgId,
          name,
          description: draft.description.trim() || undefined,
          client_id: draft.client_id || undefined,
          status: 'planned',
          start_date: draft.start_date || undefined,
          end_date: draft.end_date || undefined,
          budget: draft.budget ? Number(draft.budget) : undefined,
          category: template?.name,
        });
      }
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
      chooseClient(created.id ?? '');
      setShowNewClient(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the client');
    }
  };

  const tradesWithTypes = trades.filter((trade) => templates.some((t) => t.kind === 'type' && t.trade.slug === trade.slug));

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
            <NoteRow icon={LayoutTemplate} label="Template">
              <select
                id="new-project-template"
                value={templateId}
                onChange={(e) => chooseTemplate(e.target.value)}
                aria-label="Template"
                className={`${noteSelect} ${templateId ? '' : 'text-gray-600'}`}
              >
                <option value="">Start from scratch</option>
                {saved.length > 0 && (
                  <optgroup label="Your templates">
                    {saved.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.total > 0 ? ` · ${formatCurrency(t.total)}` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {tradesWithTypes.map((trade) => (
                  <optgroup key={trade.slug} label={trade.name}>
                    {templates
                      .filter((t) => t.kind === 'type' && t.trade.slug === trade.slug)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </NoteRow>
            {template ? (
              <p className="pl-[8rem] -mt-0.5 pb-1 text-xs text-gray-500">
                {template.kind === 'saved' ? templateSummary(template) : template.description || template.trade.name}
              </p>
            ) : (
              saved.length === 0 && (
                <p className="pl-[8rem] -mt-0.5 pb-1 text-xs text-gray-500">Save any project as a template from its ⋯ menu, and it shows up here.</p>
              )
            )}
            {packages.length > 0 && (
              <>
                <NoteRow icon={Package} label="Package">
                  <select
                    id="new-project-package"
                    value={packageId}
                    onChange={(e) => choosePackage(e.target.value)}
                    aria-label="Package"
                    className={`${noteSelect} ${packageId ? '' : 'text-gray-600'}`}
                  >
                    <option value="">No package, just the job</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {formatCurrency(packageTotal(p))}
                      </option>
                    ))}
                  </select>
                </NoteRow>
                <p className="pl-[8rem] -mt-0.5 pb-1 text-xs text-gray-500">
                  {chosenPackage
                    ? `${chosenPackage.description} ${chosenPackage.lines.length} estimate lines · ${chosenPackage.tasks.length} tasks · ${chosenPackage.days} day${chosenPackage.days === 1 ? '' : 's'}.`
                    : `${packages.length} ready-made package${packages.length === 1 ? '' : 's'} with the estimate and schedule filled in.`}
                </p>
              </>
            )}
            <NoteRow icon={User} label="Client">
              <select
                id="new-project-client"
                value={draft.client_id}
                onChange={(e) => chooseClient(e.target.value)}
                aria-label="Client"
                className={`${noteSelect} ${draft.client_id ? '' : 'text-gray-600'}`}
              >
                <option value="">No client yet</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name ? `${c.company_name} (${c.name})` : c.name}
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
          <span className="text-gray-500">
            {chosenPackage || (template?.kind === 'saved' && template.itemCount > 0)
              ? 'Creates the project, its draft estimate and its tasks.'
              : 'Add estimates, tasks and crew from the project.'}
          </span>
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
