import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { industriesAPI, leadsAPI, lineItemsAPI } from '../../lib/api';
import { ClientService, type Client } from '../../services/ClientService';
import { ProjectService, type Project } from '../../services/ProjectService';
import { EstimateService } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';
import { priceRange } from '../../utils/priceRange';
import { NewClientModal } from '../clients/NewClientModal';
import { projectTypesFor } from './projectTypes';

interface Industry {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

type ProjectType = { name: string; description: string };

/** A price-book package (one line item that bundles a whole job). */
interface Package {
  id: string;
  name: string;
  description?: string;
  unit?: string;
  redLine: number;
  cap: number;
  costCode?: string;
  days?: number;
}

type Step = 'industry' | 'type' | 'package' | 'details';
type Kind = 'lead' | 'quote' | 'project';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const plusDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const daysBetween = (start: string, end: string) => {
  if (!start || !end) return null;
  const [a, b] = [start, end].map((iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  });
  return Math.round((b - a) / 86_400_000);
};

const fieldClass =
  'w-full h-12 px-4 bg-[#111] border border-[#2a2a2a] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#3a3a3a] focus:bg-[#151515] transition-all text-base md:text-sm';
const labelClass = 'text-xs uppercase tracking-wider text-gray-500 font-medium';
const cardClass = (selected: boolean) =>
  `relative flex flex-col items-start p-6 rounded-lg border text-left transition-all duration-200 ${
    selected ? 'bg-[#0f1729] border-[#fbbf24]' : 'bg-transparent border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#111]'
  }`;

const Selected: React.FC = () => (
  <div className="absolute top-4 right-4 w-6 h-6 bg-[#fbbf24] rounded-full flex items-center justify-center">
    <Check className="w-4 h-4 text-black" />
  </div>
);

/**
 * New project, step by step: trade, project type, an optional price-book
 * package, then the details. It can start a lead, a quote (project plus a
 * draft estimate) or a sold project.
 */
export const CreateProjectWizard: React.FC<{
  onClose: () => void;
  /** A project was created (so a list can show it straight away). */
  onProjectCreated?: (project: Project) => void;
}> = ({ onClose, onProjectCreated }) => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const orgId: string | undefined = selectedOrg?.id;

  const [step, setStep] = useState<Step>('industry');
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [ownTrades, setOwnTrades] = useState(true);
  const [packages, setPackages] = useState<(Package & { trade?: string })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [industry, setIndustry] = useState<Industry | null>(null);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [pack, setPack] = useState<Package | 'custom' | null>(null);
  const [kind, setKind] = useState<Kind>('project');
  const [form, setForm] = useState({ name: '', client_id: '', start_date: todayIso(), end_date: '', budget: '', description: '' });
  const [showNewClient, setShowNewClient] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const [mine, all, items, clientList] = await Promise.all([
          industriesAPI.forOrganization(orgId).catch(() => []),
          industriesAPI.list().catch(() => []),
          lineItemsAPI.list(orgId).catch(() => []),
          ClientService.list(orgId).catch(() => []),
        ]);
        if (cancelled) return;
        // Without chosen trades, offer every trade rather than a dead end.
        setOwnTrades(mine.length > 0);
        setIndustries(mine.length > 0 ? mine : all);
        setPackages(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items
            .filter((item: any) => item.is_package && item.is_active !== false)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => {
              const range = priceRange(item);
              return {
                id: item._id ?? item.id,
                name: item.name,
                description: item.description,
                unit: item.unit,
                redLine: range.redLine,
                cap: range.cap,
                costCode: item.cost_code?.code,
                trade: item.cost_code?.industry_id,
                days: item.estimated_hours ? Math.max(1, Math.ceil(item.estimated_hours / 8)) : undefined,
              };
            }),
        );
        setClients(clientList);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const types = industry ? projectTypesFor(industry) : [];
  const tradePackages = useMemo(() => packages.filter((p) => p.trade === industry?.slug), [packages, industry]);
  const steps: Step[] = [
    'industry',
    ...(types.length > 1 ? (['type'] as Step[]) : []),
    ...(tradePackages.length > 0 ? (['package'] as Step[]) : []),
    'details',
  ];
  const stepNumber = steps.indexOf(step) + 1;
  const stepName = { industry: 'Industry', type: 'Project Type', package: 'Package', details: 'Details' }[step];
  const next = (from: Step) => setStep(steps[steps.indexOf(from) + 1] ?? 'details');

  const chooseIndustry = (chosen: Industry) => {
    setIndustry(chosen);
    setPack(null);
    const chosenTypes = projectTypesFor(chosen);
    setProjectType(chosenTypes.length === 1 ? chosenTypes[0] : null);
    const hasPackages = packages.some((p) => p.trade === chosen.slug);
    setStep(chosenTypes.length > 1 ? 'type' : hasPackages ? 'package' : 'details');
  };

  const choosePackage = (chosen: Package | 'custom') => {
    setPack(chosen);
    if (chosen !== 'custom') {
      setForm((f) => ({
        ...f,
        budget: String(chosen.cap),
        end_date: chosen.days ? plusDays(f.start_date, chosen.days) : f.end_date,
      }));
    }
    setStep('details');
  };

  const back = () => {
    const at = steps.indexOf(step);
    if (at <= 0) onClose();
    else setStep(steps[at - 1]);
  };

  const client = clients.find((c) => c.id === form.client_id);
  const chosenPackage = pack && pack !== 'custom' ? pack : null;
  const duration = daysBetween(form.start_date, form.end_date);

  const create = async () => {
    if (!orgId) return;
    setError(null);
    if (kind === 'quote' && !form.client_id) {
      setError('Pick a client — an estimate needs one.');
      return;
    }
    const name =
      form.name.trim() ||
      [projectType?.name ?? industry?.name, client?.name].filter(Boolean).join(' – ') ||
      'Untitled Project';
    const budget = form.budget.trim() === '' ? undefined : Number(form.budget.replace(/[$,]/g, ''));
    setCreating(true);
    try {
      if (kind === 'lead') {
        // Leads live in the leads pipeline.
        await leadsAPI.create(orgId, {
          name: client?.name || name,
          phone: client?.phone || null,
          email: client?.email || null,
          address: client?.address || null,
          city: client?.city || null,
          jobType: industry?.slug ?? null,
          estimatedValue: Number.isFinite(budget) ? budget : null,
          notes: [name !== client?.name ? name : '', form.description.trim()].filter(Boolean).join('\n') || null,
          status: 'new',
        });
        navigate('/leads', { replace: true });
        return;
      }

      const project = await ProjectService.create({
        organization_id: orgId,
        name,
        description: form.description,
        client_id: form.client_id,
        status: 'planned',
        start_date: form.start_date,
        end_date: form.end_date,
        budget: (Number.isFinite(budget) ? budget : '') as number,
        category: projectType?.name ?? industry?.name ?? '',
      });
      onProjectCreated?.(project);

      if (kind === 'quote') {
        const estimate = await EstimateService.create({
          organization_id: orgId,
          client_id: form.client_id,
          project_id: project.id,
          title: `${name} - Estimate`,
          description: form.description,
          status: 'draft',
          issue_date: todayIso(),
          expiry_date: plusDays(todayIso(), 30),
          subtotal: 0,
          tax_rate: 0,
          tax_amount: 0,
          total_amount: 0,
          items: chosenPackage
            ? [
                {
                  product_id: chosenPackage.id,
                  description: chosenPackage.name,
                  quantity: 1,
                  unit_price: chosenPackage.cap,
                  total_price: chosenPackage.cap,
                  red_line_price: chosenPackage.redLine,
                  cap_price: chosenPackage.cap,
                  cost_code: chosenPackage.costCode,
                  display_order: 0,
                },
              ]
            : [],
        } as Parameters<typeof EstimateService.create>[0]);
        navigate(`/estimates/${estimate.id}`, { replace: true });
        return;
      }

      navigate(`/projects/${project.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project');
    } finally {
      setCreating(false);
    }
  };

  const renderStep = () => {
    if (loading) return <p className="text-gray-500">Loading…</p>;

    if (step === 'industry') {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">Select an industry</h3>
            <p className="text-sm text-gray-500">
              Choose the industry for your project
              {!ownTrades && (
                <>
                  {' · '}
                  <button type="button" onClick={() => navigate('/settings/industries')} className="text-[#fbbf24] hover:underline">
                    choose your trades
                  </button>{' '}
                  to see only yours
                </>
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {industries.map((option) => {
              const count = projectTypesFor(option).length;
              const selected = industry?.slug === option.slug;
              return (
                <button key={option.slug} type="button" onClick={() => chooseIndustry(option)} className={cardClass(selected)}>
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 border ${selected ? 'border-[#fbbf24]' : 'border-[#2a2a2a]'}`}
                    style={{ borderColor: selected ? option.color : undefined }}
                  >
                    <span className="text-2xl">{option.icon}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">{option.name}</h3>
                  {option.description && <p className="text-sm text-gray-500">{option.description}</p>}
                  <p className="text-xs text-gray-600 mt-2">
                    {count} project type{count === 1 ? '' : 's'}
                  </p>
                  {selected && <Selected />}
                </button>
              );
            })}
          </div>
          {industries.length === 0 && <p className="text-center py-12 text-gray-500">No trades are set up yet.</p>}
        </div>
      );
    }

    if (step === 'type') {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">Select project type</h3>
            <p className="text-sm text-gray-500">Choose a project type in {industry?.name}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {types.map((type) => (
              <button
                key={type.name}
                type="button"
                onClick={() => {
                  setProjectType(type);
                  next('type');
                }}
                className={cardClass(projectType?.name === type.name)}
              >
                <h3 className="text-lg font-semibold text-white mb-1">{type.name}</h3>
                <p className="text-sm text-gray-500">{type.description}</p>
                {projectType?.name === type.name && <Selected />}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (step === 'package') {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">Select a package</h3>
            <p className="text-sm text-gray-500">Start from a package in your price book, or from scratch</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tradePackages.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choosePackage(option)}
                className={`p-4 border rounded-lg text-left transition-all ${
                  chosenPackage?.id === option.id
                    ? 'bg-[#0f1729] border-[#fbbf24] text-white'
                    : 'bg-transparent border-[#2a2a2a] text-white hover:border-[#3a3a3a] hover:bg-[#111]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{option.name}</span>
                  <span className="text-sm tabular-nums text-gray-300">{formatCurrency(option.cap)}</span>
                </div>
                {option.description && <div className="text-xs text-gray-500 mt-1">{option.description}</div>}
                {option.days && <div className="text-xs text-gray-600 mt-2">about {option.days} day{option.days === 1 ? '' : 's'}</div>}
              </button>
            ))}
          </div>
          <div className="border-t border-[#333333] pt-6">
            <button
              type="button"
              onClick={() => choosePackage('custom')}
              className="w-full p-6 border border-[#2a2a2a] rounded-lg text-center hover:bg-[#111] hover:border-[#3a3a3a] transition-all"
            >
              <h4 className="text-lg font-semibold text-white mb-2">Start from Scratch</h4>
              <p className="text-sm text-gray-500">Create a custom project without a package</p>
            </button>
          </div>
        </div>
      );
    }

    const kinds: { value: Kind; label: string; hint: string; note: string; color: string }[] = [
      { value: 'lead', label: '💡 Lead', hint: 'Initial inquiry', note: '📝 Adds it to your leads pipeline', color: '#F9D71C' },
      {
        value: 'quote',
        label: '📋 Quote',
        hint: 'Generate estimate',
        note: chosenPackage ? '✨ Creates the project + an estimate with the package' : '✨ Creates the project + a draft estimate',
        color: '#336699',
      },
      { value: 'project', label: '🏗️ Project', hint: 'Sold & planned', note: '🚀 Creates the project, ready to start', color: '#388E3C' },
    ];

    return (
      <div className="space-y-8">
        <h3 className="text-2xl font-bold text-white tracking-tight uppercase">Project Details</h3>

        <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
          <label className={`${labelClass} mb-3 block`}>Project Type</label>
          <div className="grid grid-cols-3 gap-3">
            {kinds.map((option) => {
              const on = kind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={`p-3 rounded-lg border transition-all text-left ${on ? '' : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'}`}
                  style={on ? { borderColor: option.color, color: option.color, backgroundColor: `${option.color}1A` } : undefined}
                >
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs mt-1 opacity-75">{option.hint}</div>
                  {on && (
                    <div className="text-xs mt-2 p-2 rounded border" style={{ borderColor: `${option.color}33`, backgroundColor: `${option.color}0D` }}>
                      {option.note}
                      {option.value === 'quote' && !form.client_id && <div className="text-orange-400 mt-1">⚠️ Client required for estimates</div>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="wizard-name">Project Name</label>
            <input
              id="wizard-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={fieldClass}
              placeholder={`e.g., ${client?.name ? `${client.name.split(' ').slice(-1)[0]} ` : 'Johnson '}${projectType?.name ?? 'Kitchen Remodel'}`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="wizard-client">Client</label>
            <div className="relative">
              <select
                id="wizard-client"
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                className={`${fieldClass} appearance-none pr-20`}
              >
                <option value="">Select a client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name ? `${c.company_name} (${c.name})` : c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-500 border border-[#2a2a2a] rounded hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] transition-all"
              >
                + New
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="wizard-start">Start Date</label>
            <input
              id="wizard-start"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              className={`${fieldClass} appearance-none`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="wizard-end">{chosenPackage ? 'Estimated End Date' : 'Target End Date'}</label>
            <input
              id="wizard-end"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              className={`${fieldClass} appearance-none`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="wizard-budget">Budget</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="wizard-budget"
                inputMode="decimal"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                className={`${fieldClass} pl-8`}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass}>Duration</label>
            <input
              value={duration !== null && duration >= 0 ? `${duration} day${duration === 1 ? '' : 's'}` : ''}
              readOnly
              tabIndex={-1}
              className="w-full h-12 px-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-gray-500 cursor-not-allowed text-sm"
            />
          </div>

          <div className="md:col-span-2 flex flex-col gap-2">
            <label className={labelClass} htmlFor="wizard-description">Project Description</label>
            <textarea
              id="wizard-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full min-h-[120px] p-4 bg-[#111] border border-[#2a2a2a] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#3a3a3a] focus:bg-[#151515] transition-all resize-none text-base md:text-sm"
              placeholder="Describe the project scope and requirements..."
            />
          </div>
        </div>

        <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
          <h4 className={`${labelClass} mb-4`}>Project Summary</h4>
          <div className="divide-y divide-[#1a1a1a]">
            {[
              ['Industry', industry?.name],
              ['Project Type', projectType?.name],
              ['Package', chosenPackage ? chosenPackage.name : 'Start from scratch'],
              ...(chosenPackage ? [['Package Price', `${formatCurrency(chosenPackage.redLine)} – ${formatCurrency(chosenPackage.cap)}`]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-2">
                <span className="text-sm text-gray-400">{label}</span>
                <span className="text-sm font-semibold text-white">{value || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9998]" onClick={onClose}>
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-0 md:p-4">
        <div
          role="dialog"
          aria-label="Create New Project"
          className="bg-[#0a0a0a] border border-[#1a1a1a] md:rounded-2xl w-full max-w-4xl h-[100dvh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 md:px-8 py-5 md:py-6 border-b border-[#1a1a1a] flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white tracking-tight">Create New Project</h2>
              <p className="text-sm text-gray-500 mt-1">
                Step {stepNumber} of {steps.length} — {stepName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-transparent border border-[#2a2a2a] text-gray-500 hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] transition-all flex items-center justify-center text-lg"
            >
              ×
            </button>
          </div>

          <div className="h-1 bg-[#1a1a1a] relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full bg-[#fbbf24] transition-all duration-300" style={{ width: `${(stepNumber / steps.length) * 100}%` }} />
          </div>

          <div className="flex-1 px-6 md:px-8 py-8 md:py-12 overflow-y-auto">{renderStep()}</div>

          <div className="px-6 md:px-8 py-5 md:py-6 border-t border-[#1a1a1a] flex items-center justify-between">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              Step {stepNumber} of {steps.length}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={back}
                className="px-5 py-2.5 bg-transparent border border-[#2a2a2a] text-gray-400 hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] rounded-lg text-sm font-medium transition-all"
              >
                {step === 'industry' ? 'Cancel' : 'Back'}
              </button>
              {step === 'details' ? (
                <button
                  type="button"
                  onClick={create}
                  disabled={creating || (kind === 'quote' && !form.client_id)}
                  className="px-5 py-2.5 bg-[#fbbf24] text-black rounded-lg text-sm font-semibold hover:bg-[#f59e0b] transition-all disabled:bg-[#2a2a2a] disabled:text-gray-600 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black" />
                      Creating...
                    </>
                  ) : kind === 'lead' ? (
                    'Add Lead'
                  ) : kind === 'quote' ? (
                    'Create Project & Estimate'
                  ) : (
                    'Create Project'
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => next(step)}
                  disabled={(step === 'industry' && !industry) || (step === 'type' && !projectType) || (step === 'package' && !pack)}
                  className="px-5 py-2.5 bg-[#fbbf24] text-black rounded-lg text-sm font-semibold hover:bg-[#f59e0b] transition-all disabled:bg-[#2a2a2a] disabled:text-gray-600 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Continue <span>→</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showNewClient && orgId && (
        <div className="relative z-[10000]" onClick={(e) => e.stopPropagation()}>
          <NewClientModal
            onClose={() => setShowNewClient(false)}
            onSave={async (data) => {
              try {
                const created = await ClientService.create({ ...(data as Client), organization_id: orgId });
                setClients((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
                setForm((f) => ({ ...f, client_id: created.id ?? '' }));
                setShowNewClient(false);
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Could not add the client');
              }
            }}
          />
        </div>
      )}
    </div>
  );
};
