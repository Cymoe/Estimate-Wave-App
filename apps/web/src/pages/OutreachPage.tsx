import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Lock, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { outreachAPI, type OutreachContact, type OutreachContacts, type OutreachField, type OutreachListSummary, type OutreachRowStatus, type OutreachSource } from '../lib/api';
import { AskListSheet } from '../components/outreach/AskListSheet';
import { ContactsTable, ContactSheet } from '../components/outreach/ContactsTable';
import { StepStrip } from '../components/outreach/StepStrip';
import { COLUMNS, readHiddenColumns, writeHiddenColumns, type ColumnKey } from '../components/outreach/columns';
import { csvName, download, outreachCsv } from '../components/outreach/outreachCsv';
import { useConfirm } from '../components/common/ConfirmDialog';
import { fundErrorText, openFundingPage } from '../components/market/WalletBar';
import { useAuth } from '../contexts/AuthContext';
import { isStaff } from '../lib/roles';
import { WHO_LABEL } from '../../convex/lib/outreach';
import { sourceName } from '../components/outreach/format';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const iconButton = 'w-11 h-11 inline-flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2A2A2A] border border-[#333333]';
const chip = (on: boolean) => `px-3 min-h-[36px] text-sm border whitespace-nowrap ${on ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333333] text-gray-300 hover:bg-[#2A2A2A]'}`;
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
/** How often the table re-reads while a lookup is running. */
const POLL_MS = 3000;
const STATUS_FILTERS: Array<{ value: OutreachRowStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'sent', label: 'Sent' },
  { value: 'done', label: 'Done' },
  { value: 'skip', label: 'Skipped' },
];
/** The quick filters over the table: what a row has, or what it needs from you. */
type Show = 'all' | 'ready' | 'email' | 'needs';
const SHOWS: Array<{ value: Show; label: string; has: (r: OutreachContact) => boolean }> = [
  { value: 'all', label: 'All', has: () => true },
  { value: 'ready', label: 'Ready to call', has: (r) => r.phones.some((p) => !p.dnc) },
  { value: 'email', label: 'Has email', has: (r) => r.emails.length > 0 },
  { value: 'needs', label: 'Needs you', has: (r) => Object.values(r.enrichment).some((c) => c.status === 'failed') },
];
/** Owner, company, person or either street, any case. */
const matches = (r: OutreachContact, q: string) => {
  const hay = [r.name, r.company, r.person?.name, r.mailing.address, r.property.address].filter(Boolean).join('\n').toLowerCase();
  return hay.includes(q);
};

type OwnersState = Awaited<ReturnType<typeof outreachAPI.status>>;

/** Staff only: when the roll was last grouped into owners, and a way to do it again. */
const OwnersLine: React.FC = () => {
  const [state, setState] = useState<OwnersState | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    outreachAPI
      .status()
      .then(setState)
      .catch(() => setState(undefined));
  }, [busy]);
  const rebuild = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await outreachAPI.rebuild();
      setNote(r.error ? `Rebuild failed: ${r.error}` : `Grouped ${r.fetched.toLocaleString()} parcels into owners (${(r.added + r.updated).toLocaleString()} written).`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "The rebuild couldn't run");
    } finally {
      setBusy(false);
    }
  };
  if (state === undefined) return null;
  return (
    <p className="text-xs text-gray-500" data-testid="owners-line">
      {state === null
        ? "The roll hasn't been grouped into owners yet, so every list is empty."
        : state.error
          ? `The owners rebuild on ${day(state.syncedAt)} failed: ${state.error}`
          : `Owners grouped ${day(state.syncedAt)} from ${state.parcels.toLocaleString()} parcels.`}{' '}
      <button type="button" onClick={rebuild} disabled={busy} className="text-[#7fb0e0] hover:text-white disabled:opacity-50">
        {busy ? 'Rebuilding…' : 'Rebuild owners'}
      </button>
      {note && <span className="block text-gray-400">{note}</span>}
    </p>
  );
};

/** Staff only: the stack in order, whether each source is connected, and how it has done for this company. */
const SourcesPanel: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [sources, setSources] = useState<OutreachSource[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    outreachAPI
      .sources(organizationId)
      .then(setSources)
      .catch(() => setSources(null));
  }, [organizationId, open]);
  const FIELD: Record<OutreachField, string> = { person: 'decision maker', phone: 'phone', email: 'email', research: 'research' };
  return (
    <div className="text-xs text-gray-500" data-testid="sources-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[#7fb0e0] hover:text-white">
        {open ? 'Hide data sources' : 'Data sources'}
      </button>
      {open && sources && (
        <ol className="mt-2 bg-[#121212] border border-[#333333] divide-y divide-[#333333]">
          {sources.map((s, i) => (
            <li key={s.name} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-gray-300">
                {i + 1}. {sourceName(s.name)}
              </span>
              <span className={s.connected ? 'text-[#7fb0e0]' : 'text-amber-300'}>{s.connected ? 'Connected' : 'Not connected'}</span>
              {s.stats.map((st) => (
                <span key={st.field} className="tabular-nums">
                  {FIELD[st.field]}: {st.hits} / {st.attempts}
                  {st.attempts ? ` (${Math.round((st.hits / st.attempts) * 100)}%)` : ''}
                  {st.chargedCents ? ` · ${dollars(st.chargedCents)}` : ''}
                </span>
              ))}
              {s.stats.some((st) => st.problem) && (
                <span className="basis-full text-amber-300" data-testid="source-problem">
                  Needs attention: {s.stats.find((st) => st.problem)!.problem}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {open && sources === null && <span className="block mt-1">The sources couldn't be read.</span>}
    </div>
  );
};

/** The Columns button and its panel: a checkbox per column the table can do without. */
const ColumnsPicker: React.FC<{ hidden: Set<ColumnKey>; onChange: (hidden: Set<ColumnKey>) => void }> = ({ hidden, onChange }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const toggle = (k: ColumnKey) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(next);
  };
  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" className={`${chip(false)} inline-flex items-center gap-2`}>
        <SlidersHorizontal className="w-4 h-4" /> Columns
        {hidden.size > 0 && <span className="text-gray-500">{COLUMNS.length - hidden.size} of {COLUMNS.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-[#121212] border border-[#333333] py-1" role="group" aria-label="Columns">
          {COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-3 px-3 min-h-[36px] text-sm text-gray-300 hover:bg-[#2A2A2A] cursor-pointer">
              <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggle(c.key)} className="accent-[#336699]" />
              {c.label}
            </label>
          ))}
          {hidden.size > 0 && (
            <button type="button" onClick={() => onChange(new Set())} className="w-full text-left px-3 min-h-[36px] text-sm text-[#7fb0e0] hover:text-white border-t border-[#333333]">
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Outreach: the company's CRM of property owners, filled by lists asked for
 * in plain words. The + button's "Outreach list" opens the ask; each list
 * is a filter chip over the one table; ticked rows unlock phones and emails.
 */
const OutreachPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id || undefined;
  const { user } = useAuth();
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lists, setLists] = useState<OutreachListSummary[] | null>(null);
  const [data, setData] = useState<OutreachContacts | null>(null);
  const [status, setStatus] = useState<OutreachRowStatus | 'all'>('all');
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnKey>>(readHiddenColumns);
  const pickColumns = (next: Set<ColumnKey>) => {
    writeHiddenColumns(next);
    setHiddenColumns(next);
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<OutreachContact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [l, c] = await Promise.all([outreachAPI.lists(organizationId), outreachAPI.contacts(organizationId, listId)]);
      if (!live.current) return;
      setLists(l);
      setData(c);
      setError(null);
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : "The contacts couldn't be loaded");
    }
  }, [organizationId, listId]);
  useEffect(() => {
    void load();
  }, [load]);
  // While any lookup is running, re-read until it lands.
  const running = (c: OutreachContact) => Object.values(c.enrichment).some((cell) => cell.status === 'running');
  const pending = data?.rows.some(running) ?? false;
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [pending, load]);
  // The sheet shows the row as the table now has it.
  useEffect(() => {
    if (open && data) setOpen(data.rows.find((r) => r.id === open.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // The blue + button's "Outreach list" opens /outreach?new=1.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setAsking(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const list = lists?.find((l) => l.id === listId);
  const rows = useMemo(() => {
    const has = SHOWS.find((s) => s.value === show)?.has ?? (() => true);
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => (status === 'all' || r.status === status) && has(r) && (!q || matches(r, q)));
  }, [data, status, show, query]);
  const counts = useMemo(() => Object.fromEntries(SHOWS.map((s) => [s.value, (data?.rows ?? []).filter(s.has).length])) as Record<Show, number>, [data]);
  const chosen = rows.filter((r) => selected.has(r.id));
  const needsPhone = (r: OutreachContact) => r.enrichment.phone.status !== 'found' && r.enrichment.phone.status !== 'running';
  const hasLock = (r: OutreachContact) => needsPhone(r) || (r.company && r.enrichment.person.status !== 'found' && r.enrichment.person.status !== 'running');
  const unlockable = chosen.filter(hasLock);
  const unlockCents = data?.unlockCents ?? 100;
  const balanceCents = data?.balanceCents ?? 0;
  const cost = unlockable.filter(needsPhone).length * unlockCents;
  const hitRate = data?.phoneHitRate;
  const researchCents = data?.researchCents ?? 25;
  const needsResearch = (r: OutreachContact) => r.enrichment.research?.status !== 'found' && r.enrichment.research?.status !== 'running';
  const researchable = chosen.filter(needsResearch);
  const researchCost = researchable.length * researchCents;
  /** "up to $200; about $136 at your 68% hit rate so far" */
  const estimate = (phones: number) => {
    const most = phones * unlockCents;
    if (hitRate === undefined || phones === 0) return `up to ${dollars(most)}`;
    return `up to ${dollars(most)}, about ${dollars(Math.round(most * hitRate))} at your ${Math.round(hitRate * 100)}% hit rate so far`;
  };
  const listOpen = (data?.rows ?? []).filter(hasLock);
  const listPhones = listOpen.filter(needsPhone).length;

  const addFunds = () => organizationId && openFundingPage(organizationId).catch((err) => setError(fundErrorText(err)));

  const setContactStatus = async (row: OutreachContact, next: OutreachRowStatus, text: string) => {
    if (!organizationId) return;
    await outreachAPI.setStatus(organizationId, row.id, next, text || undefined);
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, status: next, note: text || undefined } : r)) });
    setLists((l) => l && l.map((x) => (row.listIds.includes(x.id) ? { ...x, done: doneOn(x.id, row, next) } : x)));
  };
  /** The list's done count after this row's status change. */
  const doneOn = (id: string, row: OutreachContact, next: OutreachRowStatus) => {
    const worked = (s: OutreachRowStatus) => s === 'done' || s === 'skip';
    const current = lists?.find((l) => l.id === id)?.done ?? 0;
    return Math.max(0, current + (worked(next) ? 1 : 0) - (worked(row.status) ? 1 : 0));
  };

  const enrich = async (ids: string[], fields?: OutreachField[], question?: string) => {
    if (!organizationId || ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await outreachAPI.enrich(organizationId, ids, fields, question);
      const what = fields?.length === 1 && fields[0] === 'research' ? 'charged only for answers found' : 'charged only for phones found';
      setNote(r.queued ? `Looking up ${r.queued} ${r.queued === 1 ? 'owner' : 'owners'}; ${dollars(r.costCents)} at most, ${what}.` : null);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the lookup");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  /** Everyone on the open list (or every contact) who still has a lock, after a word on the cost. */
  const enrichAll = async () => {
    if (listOpen.length === 0) return;
    const who = list ? `the ${listOpen.length} ${listOpen.length === 1 ? 'owner' : 'owners'} on “${list.title}”` : `all ${listOpen.length} ${listOpen.length === 1 ? 'contact' : 'contacts'}`;
    const ok = await confirm({
      title: `Look up ${who}?`,
      message: `${listPhones} ${listPhones === 1 ? 'phone' : 'phones'} to find: ${estimate(listPhones)}. Charged only for phones found; the person behind each company and emails are free.`,
      confirmLabel: 'Look them up',
    });
    if (!ok) return;
    await enrich(listOpen.map((r) => r.id)).catch(() => {});
  };

  const removeList = async () => {
    if (!organizationId || !list) return;
    if (!(await confirm({ title: `Delete “${list.title}”?`, message: 'Contacts on no other list go with it, except any you unlocked.', confirmLabel: 'Delete' }))) return;
    await outreachAPI.remove(organizationId, list.id);
    navigate('/outreach');
  };

  if (!organizationId) return <p className="p-6 text-gray-400">Pick a company first.</p>;

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="outreach-page">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-white">Outreach</h1>
          <p className="text-sm text-gray-400">Property owners from the Midland County roll. Names and mailing addresses; the person behind each company, then a phone and email for {dollars(unlockCents)}.</p>
          {isStaff(user) && <OwnersLine />}
          {isStaff(user) && <SourcesPanel organizationId={organizationId} />}
        </div>
        {data && rows.length > 0 && (
          <div className="flex gap-2 shrink-0">
            {listOpen.length > 0 && (
              <button
                type="button"
                onClick={() => void enrichAll()}
                disabled={busy || listPhones * unlockCents > balanceCents}
                className="inline-flex items-center gap-2 px-3 h-11 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
                title={estimate(listPhones)}
              >
                <Lock className="w-4 h-4" /> Look up {listOpen.length}
              </button>
            )}
            <button type="button" onClick={() => download(csvName(list?.title ?? 'contacts'), outreachCsv(rows))} aria-label="Export CSV" title="Export CSV" className={iconButton}>
              <Download className="w-4 h-4" />
            </button>
            {list && (
              <button type="button" onClick={removeList} aria-label="Delete list" title="Delete list" className={iconButton}>
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </header>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {lists && lists.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lists">
          <button type="button" onClick={() => navigate('/outreach')} aria-pressed={!listId} className={chip(!listId)}>
            All
          </button>
          {lists.map((l) => (
            <button key={l.id} type="button" onClick={() => navigate(`/outreach/${l.id}`)} aria-pressed={l.id === listId} className={chip(l.id === listId)} title={`${WHO_LABEL[l.who]} · ${day(l.createdAt)}`}>
              {l.title} <span className="text-gray-500">{l.rowCount}</span>
            </button>
          ))}
        </div>
      )}
      {data && data.rows.length > 0 && (
        <StepStrip
          rows={data.rows}
          unlockCents={unlockCents}
          listLine={
            list && (
              <>
                {WHO_LABEL[list.who]} · {list.done} done · asked {day(list.createdAt)}
                {list.truncated && <span className="text-amber-300"> · The top of a longer list; ask for a narrower one to reach the rest.</span>}
              </>
            )
          }
        />
      )}
      {note && <p className="text-sm text-gray-300">{note}</p>}
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-[#121212] border border-[#333333] px-4 py-2" data-testid="unlock-bar">
          <span className="text-sm text-gray-300">{chosen.length} selected</span>
          <button
            type="button"
            onClick={() => void enrich(unlockable.map((r) => r.id)).catch(() => {})}
            disabled={busy || unlockable.length === 0 || cost > balanceCents}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
          >
            <Lock className="w-4 h-4" /> Look up {unlockable.length}
          </button>
          <span className="text-xs text-gray-500">
            {unlockable.filter(needsPhone).length} {unlockable.filter(needsPhone).length === 1 ? 'phone' : 'phones'} to find, {estimate(unlockable.filter(needsPhone).length)}. Balance {dollars(balanceCents)}.{' '}
            {cost > balanceCents && (
              <button type="button" onClick={addFunds} className="text-[#7fb0e0] underline underline-offset-2">
                Add funds
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={() => void enrich(researchable.map((r) => r.id), ['research']).catch(() => {})}
            disabled={busy || researchable.length === 0 || researchCost > balanceCents}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] text-sm font-medium text-white border border-[#336699] hover:bg-[#336699]/20 disabled:opacity-50"
            title={`${dollars(researchCents)} an answer, charged only when the web has something to say`}
          >
            <Search className="w-4 h-4" /> Research {researchable.length} · {dollars(researchCost)}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm text-gray-400 hover:text-white">
            Clear
          </button>
        </div>
      )}
      {data && data.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          <label className="relative block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search owner, person or street"
              aria-label="Search"
              className="w-72 max-w-full bg-[#1A1A1A] border border-[#333333] pl-9 pr-3 min-h-[36px] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
            />
          </label>
          {SHOWS.map((s) =>
            s.value === 'needs' && counts.needs === 0 ? null : (
              <button
                key={s.value}
                type="button"
                onClick={() => setShow(s.value)}
                aria-pressed={show === s.value}
                className={s.value === 'needs' && show !== 'needs' ? `${chip(false)} border-amber-400/60 text-amber-300` : chip(show === s.value)}
              >
                {s.label} {s.value !== 'all' && <span className={s.value === 'needs' && show !== 'needs' ? 'text-amber-300/70' : 'text-gray-500'}>{counts[s.value]}</span>}
              </button>
            ),
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value as OutreachRowStatus | 'all')} aria-label="Status" className="ml-auto bg-[#1A1A1A] border border-[#333333] px-2 min-h-[36px] text-sm text-gray-300">
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <ColumnsPicker hidden={hiddenColumns} onChange={pickColumns} />
        </div>
      )}
      {data === null || lists === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="outreach-empty">
          No contacts yet. Tap + and say who you want to reach.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">{data.rows.length === 0 ? 'Nobody matched. Ask for a wider list.' : 'Nobody matches those filters.'}</p>
      ) : (
        <ContactsTable
          rows={rows}
          coverage={data.coverage}
          selected={selected}
          onSelect={(id, on) =>
            setSelected((s) => {
              const next = new Set(s);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          onSelectAll={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())}
          onOpen={setOpen}
          onRetry={(row, field) => void enrich([row.id], [field]).catch(() => {})}
          hidden={hiddenColumns}
        />
      )}
      <ContactSheet
        row={open}
        unlockCents={unlockCents}
        researchCents={researchCents}
        researchQuestion={data?.researchQuestion ?? ''}
        balanceCents={balanceCents}
        onClose={() => setOpen(null)}
        onStatus={setContactStatus}
        onEnrich={(row, fields, question) => enrich([row.id], fields, question)}
        onAddFunds={addFunds}
      />
      <AskListSheet open={asking} organizationId={organizationId} onClose={() => setAsking(false)} onSaved={(id) => navigate(`/outreach/${id}`)} />
      {confirmDialog}
    </div>
  );
};

export default OutreachPage;
