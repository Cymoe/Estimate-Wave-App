import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, FileText, FolderOpen, Mail, MapPin, Navigation, Phone, PhoneCall, Trash2 } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { ClientService, type Client } from '../../services/ClientService';
import { ProjectService, type Project } from '../../services/ProjectService';
import { EstimateService, type Estimate } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';
import { NoteRow, SaveStatus, noteInput, noteTextarea, noteTitle, useNoteFields } from '../common/StructuredNote';
import { projectStatusInfo } from '../projects/projectStatus';

type Draft = {
  name: string;
  company_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
};

const draftOf = (client: Client | null): Draft => ({
  name: client?.name ?? '',
  company_name: client?.company_name ?? '',
  phone: client?.phone ?? '',
  email: client?.email ?? '',
  address: client?.address ?? '',
  city: client?.city ?? '',
  state: client?.state ?? '',
  zip: client?.zip ?? '',
  notes: client?.notes ?? '',
});

const ESTIMATE_PILL: Record<string, string> = {
  draft: 'bg-gray-500/15 text-gray-300',
  sent: 'bg-blue-500/15 text-blue-300',
  opened: 'bg-purple-500/15 text-purple-300',
  accepted: 'bg-green-500/15 text-green-300',
  rejected: 'bg-red-500/15 text-red-300',
  expired: 'bg-yellow-500/15 text-yellow-300',
};

/** A client's page (or /clients/new to add one). */
export const ClientDetails: React.FC = () => {
  const { clientId } = useParams();
  const isNew = !clientId || clientId === 'new';
  const [client, setClient] = useState<Client | null | undefined>(isNew ? null : undefined);

  useEffect(() => {
    if (isNew) {
      setClient(null);
      return;
    }
    let cancelled = false;
    setClient(undefined);
    ClientService.getById(clientId!).then((found) => !cancelled && setClient(found ?? null));
    return () => {
      cancelled = true;
    };
  }, [clientId, isNew]);

  if (client === undefined) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!isNew && client === null) {
    return <div className="p-8 text-gray-400">This client doesn't exist any more.</div>;
  }
  return <ClientNote key={client?.id ?? 'new'} client={client} />;
};

const ClientNote: React.FC<{ client: Client | null }> = ({ client }) => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);

  const { draft, set, commit, state, setState, error, setError } = useNoteFields<Draft>(
    draftOf(client),
    client?.id ? async (patch) => void (await ClientService.update(client.id!, patch)) : null,
    ['name'],
  );

  useEffect(() => {
    if (!client?.id || !selectedOrg?.id) return;
    ProjectService.list(selectedOrg.id, { clientId: client.id }).then(setProjects).catch(() => setProjects([]));
    EstimateService.getByClient(client.id, selectedOrg.id).then(setEstimates).catch(() => setEstimates([]));
  }, [client?.id, selectedOrg?.id]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (client) {
      (document.activeElement as HTMLElement | null)?.blur(); // Enter saves the field
      return;
    }
    if (!draft.name.trim()) {
      setError('Add a name first');
      return;
    }
    if (!selectedOrg?.id) return;
    setState('saving');
    try {
      const created = await ClientService.create({ ...draft, organization_id: selectedOrg.id });
      navigate(`/clients/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the client');
      setState('idle');
    }
  };

  const remove = async () => {
    if (!client?.id || !window.confirm(`Delete “${client.name}”? Their projects and estimates stay.`)) return;
    try {
      await ClientService.delete(client.id);
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  const phoneHref = draft.phone.trim() ? `tel:${draft.phone.replace(/[^\d+]/g, '')}` : null;
  const place = [draft.address, draft.city, draft.state, draft.zip].filter((s) => s.trim()).join(', ');
  const mapHref = draft.address.trim() ? `https://maps.apple.com/?q=${encodeURIComponent(place)}` : null;
  const field = (name: keyof Draft, placeholder: string, type = 'text') => (
    <input
      type={type}
      value={draft[name]}
      onChange={set(name)}
      onBlur={() => commit(name)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={noteInput}
    />
  );

  return (
    <form onSubmit={create} className="max-w-2xl mx-auto px-5 md:px-7 py-5 pb-32">
      <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {client ? <SaveStatus state={state} /> : <span>New client</span>}
      </div>

      <input
        value={draft.name}
        onChange={set('name')}
        onBlur={() => commit('name')}
        placeholder="Client name"
        aria-label="Client name"
        autoFocus={!client}
        className={noteTitle}
      />

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 space-y-0.5">
        <NoteRow icon={Building2} label="Company">
          {field('company_name', 'Add company')}
        </NoteRow>
        <NoteRow icon={Phone} label="Phone">
          {field('phone', 'Add phone', 'tel')}
          {phoneHref && (
            <a href={phoneHref} className="p-1 text-gray-500 hover:text-white" aria-label="Call">
              <PhoneCall className="w-4 h-4" />
            </a>
          )}
        </NoteRow>
        <NoteRow icon={Mail} label="Email">
          {field('email', 'Add email', 'email')}
        </NoteRow>
        <NoteRow icon={MapPin} label="Address">
          {field('address', 'Add address')}
          {mapHref && (
            <a href={mapHref} target="_blank" rel="noreferrer" className="p-1 text-gray-500 hover:text-white" aria-label="Open in Maps">
              <Navigation className="w-4 h-4" />
            </a>
          )}
        </NoteRow>
        <NoteRow icon={MapPin} label="City / State">
          <div className="grid grid-cols-[1fr_4rem_5.5rem] gap-3 w-full">
            {field('city', 'City')}
            {field('state', 'State')}
            {field('zip', 'Zip')}
          </div>
        </NoteRow>
      </div>

      <div className="mt-5 pt-5 border-t border-[#222222]">
        <textarea
          value={draft.notes}
          onChange={set('notes')}
          onBlur={() => commit('notes')}
          placeholder="Notes about this client…"
          aria-label="Notes"
          className={noteTextarea}
        />
      </div>

      {client && (
        <>
          <Section icon={FolderOpen} title="Projects" items={projects} empty="No projects for this client yet.">
            {(projects ?? []).map((project) => {
              const status = projectStatusInfo(project.status);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="w-full grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-2 py-2 rounded-md hover:bg-[#1B1B1B] text-left text-sm"
                >
                  <span className="truncate text-gray-100">{project.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${status.pill}`}>{status.label}</span>
                  <span className="tabular-nums text-gray-100">{project.budget != null ? formatCurrency(project.budget) : '—'}</span>
                </button>
              );
            })}
          </Section>
          <Section icon={FileText} title="Estimates" items={estimates} empty="No estimates for this client yet.">
            {(estimates ?? []).map((estimate) => (
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
          </Section>
        </>
      )}

      <div className="mt-8 pt-4 border-t border-[#222222] flex items-center justify-between text-sm">
        {client ? (
          <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-red-400 hover:text-red-300">
            <Trash2 className="w-4 h-4" /> Delete client
          </button>
        ) : (
          <>
            <span />
            <button type="submit" disabled={state === 'saving'} className="px-4 py-2 rounded-md bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50">
              {state === 'saving' ? 'Adding…' : 'Add client'}
            </button>
          </>
        )}
      </div>
    </form>
  );
};

const Section: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: unknown[] | null;
  empty: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, items, empty, children }) => (
  <div className="mt-5 pt-5 border-t border-[#222222]">
    <h3 className="flex items-center gap-2 text-sm text-gray-500 mb-2">
      <Icon className="w-4 h-4 text-gray-600" /> {title}
    </h3>
    {items === null ? (
      <p className="text-sm text-gray-600">Loading…</p>
    ) : items.length === 0 ? (
      <p className="text-sm text-gray-600">{empty}</p>
    ) : (
      <div className="-mx-2">{children}</div>
    )}
  </div>
);
