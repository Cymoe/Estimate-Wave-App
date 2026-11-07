import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown, Download, LayoutList, Lock, Search, Table2, Trash2 } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { outreachAPI, type OutreachContact, type OutreachContacts, type OutreachField, type OutreachListSummary, type OutreachRowStatus, type OutreachSource } from '../lib/api';
import { AskListSheet } from '../components/outreach/AskListSheet';
import { ContactCards, ContactsTable, ContactSheet, type OwnerSort } from '../components/outreach/ContactsTable';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { LookupProgress } from '../components/outreach/LookupProgress';
import { csvName, download, outreachCsv } from '../components/outreach/outreachCsv';
import { useConfirm } from '../components/common/ConfirmDialog';
import { fundErrorText, openFundingPage } from '../components/market/WalletBar';
import { useAuth } from '../contexts/AuthContext';
import { isStaff } from '../lib/roles';
import { DEFAULT_ROWS, WHO_LABEL, listOrder } from '../../convex/lib/outreach';
import { callOk, mailOnly, openToLook, sourceName } from '../components/outreach/format';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const iconButton = 'w-11 h-11 inline-flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2A2A2A] border border-[#333333]';
const VIEW_KEY = 'outreach.view';
const SORT_KEY = 'outreach.sort';
const BATCH_KEY = 'outreach.batch';
const chip = (on: boolean) => `inline-flex items-center gap-1 px-3 h-9 shrink-0 text-sm border whitespace-nowrap ${on ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333333] text-gray-300 hover:bg-[#2A2A2A]'}`;
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const STATUS_FILTERS: Array<{ value: OutreachRowStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'sent', label: 'Sent' },
  { value: 'done', label: 'Done' },
  { value: 'skip', label: 'Skipped' },
];
/** The quick filters over the table: what a row has, or what it needs from you. */
type Show = 'all' | 'new' | 'signal' | 'ready' | 'email' | 'mail' | 'needs';
const SHOWS: Array<{ value: Show; label: string; has: (r: OutreachContact) => boolean }> = [
  { value: 'all', label: 'All', has: () => true },
  /** A signal first seen this week: the lists are watched, and this is what changed. Shown only when there is one. */
  { value: 'new', label: 'New this week', has: (r) => r.signals.some((x) => x.fresh) },
  /** A code violation, a demolition order or a stalled permit on the property: the warmest calls on any list. */
  { value: 'signal', label: 'Has a signal', has: (r) => r.signals.length > 0 },
  { value: 'ready', label: 'Ready to call', has: (r) => r.phones.some(callOk) },
  { value: 'email', label: 'Has email', has: (r) => r.emails.length > 0 },
  /** Looked up and nobody to call: these go out by mail (Export gives the addresses). Shown only when there are some. */
  { value: 'mail', label: 'Mail only', has: mailOnly },
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
    <span data-testid="owners-line">
      {state === null
        ? "The roll hasn't been grouped into owners yet, so every list is empty."
        : state.error
          ? `The owners rebuild on ${day(state.syncedAt)} failed: ${state.error}`
          : `Owners grouped ${day(state.syncedAt)} from ${state.parcels.toLocaleString()} parcels.`}{' '}
      <button type="button" onClick={rebuild} disabled={busy} className="text-[#7fb0e0] hover:text-white disabled:opacity-50">
        {busy ? 'Rebuilding…' : 'Rebuild owners'}
      </button>
      {note && <span className="block text-gray-400">{note}</span>}
    </span>
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
    <div className="contents" data-testid="sources-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[#7fb0e0] hover:text-white">
        {open ? 'Hide data sources' : 'Data sources'}
      </button>
      {open && sources && (
        <ol className="basis-full mt-1 bg-[#121212] border border-[#333333] divide-y divide-[#333333]">
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
      {open && sources === null && <span className="basis-full">The sources couldn't be read.</span>}
    </div>
  );
};

/**
 * One line of filters that never wraps: when they don't fit, the row slides
 * sideways and its right edge fades, and only then.
 */
/**
 * Search as just its icon until it's wanted: a tap opens it into a box,
 * and an empty box folds back to the icon when you leave it. Escape
 * clears it. A box with words in it stays open.
 */
const SearchBox: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const open = focused || value.length > 0;
  return (
    <div className={`relative ${open ? 'flex-1 md:flex-none' : ''}`}>
      <Search className={`w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${open ? 'text-gray-500' : 'hidden'}`} aria-hidden />
      <input
        ref={box}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            e.currentTarget.blur();
          }
        }}
        placeholder={open ? 'Search owner, person or street' : ''}
        aria-label="Search"
        tabIndex={open ? 0 : -1}
        className={`h-9 appearance-none rounded-none border border-[#333333] bg-[#1A1A1A] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] transition-[width] duration-200 ${
          open ? 'w-full md:w-64 pl-8 pr-3' : 'w-9 p-0 opacity-0'
        }`}
      />
      {/* Closed, it's a button like the view switch beside it; a tap focuses the box at once, so the keyboard comes up with it. */}
      {!open && (
        <button
          type="button"
          onClick={() => box.current?.focus()}
          aria-label="Open search"
          title="Search owner, person or street"
          className={`${chip(false)} absolute inset-0 w-9 justify-center px-0`}
        >
          <Search className="w-[18px] h-[18px]" />
        </button>
      )}
    </div>
  );
};

const ChipRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = row.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    measure();
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    Array.from(el.children).forEach((c) => watch.observe(c));
    return () => watch.disconnect();
  });
  return (
    <div
      ref={row}
      onScroll={measure}
      className={`flex flex-1 min-w-0 items-stretch self-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${more ? '[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]' : ''}`}
    >
      {children}
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
  // The lookup last started on this device, for the progress bar; kept across a reload until dismissed.
  const [batch, setBatch] = useState<{ at: string } | null>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(BATCH_KEY) ?? 'null');
      return saved && typeof (saved as { at?: unknown }).at === 'string' ? (saved as { at: string }) : null;
    } catch {
      return null;
    }
  });
  const keepBatch = (next: { at: string } | null) => {
    setBatch(next);
    try {
      if (next) localStorage.setItem(BATCH_KEY, JSON.stringify(next));
      else localStorage.removeItem(BATCH_KEY);
    } catch {
      // Private browsing: the bar lasts for this visit.
    }
  };
  // Cards on a phone, the table on anything wider, unless they picked one; the pick is remembered on this device.
  const narrow = useMediaQuery('(max-width: 767px)');
  const [picked, setPicked] = useState<'cards' | 'table' | null>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'cards' || v === 'table' ? v : null;
    } catch {
      return null;
    }
  });
  const view = picked ?? (narrow ? 'cards' : 'table');
  // The Name header's sort: the list's own order, most parcels first, or A to Z; remembered on this device.
  const [sort, setSort] = useState<OwnerSort>(() => {
    try {
      const v = localStorage.getItem(SORT_KEY);
      return v === 'parcels' || v === 'name' ? v : 'list';
    } catch {
      return 'list';
    }
  });
  // A list already ordered by parcels skips "most parcels first", so every tap changes the order.
  const ownOrder = lists?.find((l) => l.id === listId);
  const parcelsFirst = ownOrder ? listOrder(ownOrder.definition).label === 'most properties first' : false;
  const sortNow: OwnerSort = sort === 'parcels' && parcelsFirst ? 'list' : sort;
  const listLabel = ownOrder ? listOrder(ownOrder.definition).label.replace(/^\w/, (c) => c.toUpperCase()).replace('properties', 'parcels') : 'Newest first';
  const nextSort = () => {
    const steps: OwnerSort[] = parcelsFirst ? ['list', 'name'] : ['list', 'parcels', 'name'];
    const next = steps[(steps.indexOf(sortNow) + 1) % steps.length];
    setSort(next);
    try {
      if (next === 'list') localStorage.removeItem(SORT_KEY);
      else localStorage.setItem(SORT_KEY, next);
    } catch {
      // Private browsing: the sort lasts for this visit.
    }
  };
  const pickView = (v: 'cards' | 'table') => {
    setPicked(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Private browsing: the pick lasts for this visit.
    }
  };
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<OutreachContact | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // The last rows seen for each list (and for All), so switching lists shows something at once while fresh rows arrive.
  const seen = useRef(new Map<string, OutreachContacts>());
  const viewKey = `${organizationId ?? ''}:${listId ?? 'all'}`;
  const currentKey = useRef(viewKey);
  currentKey.current = viewKey;
  const takeContacts = useCallback((key: string, c: OutreachContacts) => {
    seen.current.set(key, c);
    if (live.current && currentKey.current === key) {
      setData(c);
      setError(null);
    }
  }, []);
  const load = useCallback(async () => {
    if (!organizationId) return;
    const key = `${organizationId}:${listId ?? 'all'}`;
    try {
      const [l, c] = await Promise.all([outreachAPI.lists(organizationId), outreachAPI.contacts(organizationId, listId)]);
      if (!live.current) return;
      setLists(l);
      takeContacts(key, c);
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : "The contacts couldn't be loaded");
    }
  }, [organizationId, listId, takeContacts]);
  const [extending, setExtending] = useState(false);
  /** The next page of the open list, for one that reached its cap. */
  const extend = async () => {
    if (!organizationId || !listId) return;
    setExtending(true);
    try {
      await outreachAPI.extend(organizationId, listId);
      void load();
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : "The next page couldn't be loaded");
    } finally {
      if (live.current) setExtending(false);
    }
  };
  useEffect(() => {
    if (!organizationId) return;
    const key = `${organizationId}:${listId ?? 'all'}`;
    // At once: this list as last seen, or its owners sliced from All in the list's own order, until the server answers.
    const cached = seen.current.get(key);
    const all = seen.current.get(`${organizationId}:all`);
    const def = lists?.find((l) => l.id === listId)?.definition;
    if (cached) setData(cached);
    else if (listId && all && def) {
      const order = listOrder(def);
      setData({ ...all, rows: all.rows.filter((r) => r.listIds.includes(listId)).sort((a, b) => order.key(b) - order.key(a) || a.name.localeCompare(b.name)) });
    }
    void load();
    // Then live: the server sends every change the moment it happens (a lookup's progress, a status set elsewhere), with no re-asking.
    const stopContacts = outreachAPI.watchContacts?.(organizationId, listId, (c) => takeContacts(key, c));
    const stopLists = outreachAPI.watchLists?.(organizationId, (l) => live.current && setLists(l));
    return () => {
      stopContacts?.();
      stopLists?.();
    };
    // lists is read only for the first look at a new list; a change to it must not resubscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, listId, load, takeContacts]);
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
    const kept = (data?.rows ?? []).filter((r) => (status === 'all' || r.status === status) && has(r) && (!q || matches(r, q)));
    if (sortNow === 'parcels') return [...kept].sort((a, b) => b.properties - a.properties || b.totalValueCents - a.totalValueCents || a.name.localeCompare(b.name));
    if (sortNow === 'name') return [...kept].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
    return kept;
  }, [data, status, show, query, sortNow]);
  const counts = useMemo(() => Object.fromEntries(SHOWS.map((s) => [s.value, (data?.rows ?? []).filter(s.has).length])) as Record<Show, number>, [data]);
  // What a lookup would run: never asked, failed, or a "none found" a month old (the sources refresh monthly).
  const needsPhone = (r: OutreachContact) => openToLook(r.enrichment.phone);
  const hasLock = (r: OutreachContact) => needsPhone(r) || Boolean(r.company && openToLook(r.enrichment.person));
  const unlockCents = data?.unlockCents ?? 100;
  const balanceCents = data?.balanceCents ?? 0;
  const hitRate = data?.phoneHitRate;
  const researchCents = data?.researchCents ?? 25;
  const needsResearch = (r: OutreachContact) => r.enrichment.research?.status !== 'found' && r.enrichment.research?.status !== 'running';
  /** "up to $200; about $136 at your 68% hit rate so far" */
  const estimate = (phones: number) => {
    const most = phones * unlockCents;
    if (hitRate === undefined || phones === 0) return `up to ${dollars(most)}`;
    return `up to ${dollars(most)}, about ${dollars(Math.round(most * hitRate))} at your ${Math.round(hitRate * 100)}% hit rate so far`;
  };
  // The header's buttons act on the whole list (or every contact): everyone a lookup would run on, and everyone with no research yet.
  const listOpen = (data?.rows ?? []).filter(hasLock);
  const listPhones = listOpen.filter(needsPhone).length;
  const listResearch = (data?.rows ?? []).filter(needsResearch);
  const researchCost = listResearch.length * researchCents;
  const short = listPhones * unlockCents > balanceCents;

  const addFunds = () => organizationId && openFundingPage(organizationId).catch((err) => setError(fundErrorText(err)));

  /** Done, Skip, a note: shown at once, saved behind it, and put back if the save fails. */
  const setContactStatus = async (row: OutreachContact, next: OutreachRowStatus, text: string) => {
    if (!organizationId) return;
    const was = { status: row.status, note: row.note };
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, status: next, note: text || undefined } : r)) });
    setLists((l) => l && l.map((x) => (row.listIds.includes(x.id) ? { ...x, done: doneOn(x.id, row, next) } : x)));
    try {
      await outreachAPI.setStatus(organizationId, row.id, next, text || undefined);
    } catch (err) {
      setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, ...was } : r)) });
      setLists((l) => l && l.map((x) => (row.listIds.includes(x.id) ? { ...x, done: doneOn(x.id, { ...row, status: next }, row.status) } : x)));
      throw err;
    }
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
    // At once: the cells the server will start show as running, so the table answers the tap before the server does.
    const asked = fields ?? (['person', 'phone', 'email'] as OutreachField[]);
    const startedAt = new Date().toISOString();
    const before = data;
    setData((d) =>
      d && {
        ...d,
        rows: d.rows.map((r) => {
          if (!ids.includes(r.id)) return r;
          const cells = { ...r.enrichment };
          for (const f of asked) {
            const c = cells[f];
            if ((f === 'person' && !r.company) || c?.status === 'found' || c?.status === 'running') continue;
            cells[f] = { status: 'running', at: startedAt };
          }
          return { ...r, enrichment: cells };
        }),
      },
    );
    keepBatch({ at: startedAt });
    try {
      const r = await outreachAPI.enrich(organizationId, ids, fields, question);
      if (r.queued && r.at) keepBatch({ at: r.at < startedAt ? r.at : startedAt });
      void load();
    } catch (err) {
      // Refused (the balance, the plan): the cells go back to how they were.
      if (before) setData(before);
      keepBatch(null);
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

  /** A research answer for everyone on the list without one, after a word on the cost. */
  const researchAll = async () => {
    if (listResearch.length === 0) return;
    const ok = await confirm({
      title: `Research ${listResearch.length} ${listResearch.length === 1 ? 'owner' : 'owners'}?`,
      message: `${dollars(researchCents)} an answer, ${dollars(researchCost)} at most. Charged only when the web has something to say.`,
      confirmLabel: 'Research them',
    });
    if (!ok) return;
    await enrich(listResearch.map((r) => r.id), ['research']).catch(() => {});
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
      {/* A lookup running, or just finished: a banner across the top of the page, edge to edge. */}
      {data && <LookupProgress rows={data.rows} since={batch?.at} onDismiss={() => keepBatch(null)} className="-mx-4 md:-mx-6 -mt-4 md:-mt-6" />}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-white">Outreach</h1>
          {isStaff(user) && (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs text-gray-500">
              <OwnersLine />
              <SourcesPanel organizationId={organizationId} />
            </div>
          )}
        </div>
        {data && rows.length > 0 && (
          <div className="flex gap-2 shrink-0">
            {listOpen.length > 0 && (
              <button
                type="button"
                onClick={() => void enrichAll()}
                disabled={busy || short}
                className="inline-flex items-center gap-2 px-3 h-11 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
                title={estimate(listPhones)}
              >
                <Lock className="w-4 h-4" /> Look up {listOpen.length}
              </button>
            )}
            {listOpen.length > 0 && short && (
              <button type="button" onClick={addFunds} className="self-center text-sm text-[#7fb0e0] hover:text-white">
                Add funds
              </button>
            )}
            {listResearch.length > 0 && (
              <button
                type="button"
                onClick={() => void researchAll()}
                disabled={busy || researchCost > balanceCents}
                className="inline-flex items-center gap-2 px-3 h-11 text-sm font-medium text-white border border-[#336699] hover:bg-[#336699]/20 disabled:opacity-50"
                title={`${dollars(researchCents)} an answer, charged only when the web has something to say`}
              >
                Research {listResearch.length}
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
      {data && data.rows.length > 0 && list && (
        <p className="text-xs text-gray-500" data-testid="list-line">
          {WHO_LABEL[list.who]} · {listOrder(list.definition).label} · {list.done} done · asked {day(list.createdAt)}
          {list.total !== undefined && list.total > list.rowCount && (
            <span data-testid="list-total">
              {' '}
              · {list.rowCount.toLocaleString('en-US')} of {list.total.toLocaleString('en-US')}
              {list.truncated ? '+' : ''} loaded{' '}
              <button type="button" onClick={() => void extend()} disabled={extending} className="text-[#7fb0e0] hover:text-white disabled:text-gray-500">
                {extending ? 'Loading…' : `Load the next ${Math.min(list.total - list.rowCount, list.definition.limit ?? DEFAULT_ROWS).toLocaleString('en-US')}`}
              </button>
            </span>
          )}
          {list.truncated && (list.total === undefined || list.total <= list.rowCount) && <span className="text-amber-300"> · The top of a longer list; ask for a narrower one to reach the rest.</span>}
        </p>
      )}
      {data && data.rows.length > 0 && (
        <div
          className={`flex flex-col-reverse md:flex-row md:items-center md:gap-2 border-b border-[#333333] ${view === 'cards' ? 'sticky top-[69px] md:top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-black' : ''}`}
          role="group"
          aria-label="Filters"
          data-testid="filter-bar"
        >
          {/* The quick filters as tabs, underlined in blue like the project and estimate drawers; when they don't fit, they slide sideways instead of wrapping. */}
          <ChipRow>
            {SHOWS.map((s) =>
              (s.value === 'needs' || s.value === 'new' || s.value === 'mail') && counts[s.value] === 0 ? null : (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setShow(s.value)}
                  aria-pressed={show === s.value}
                  className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    show === s.value ? 'text-white border-[#336699] bg-[#336699]/10' : `border-transparent hover:text-white hover:bg-[#2a2a2a] ${s.value === 'needs' ? 'text-amber-300' : 'text-gray-400'}`
                  }`}
                >
                  {s.label} {s.value !== 'all' && <span className={s.value === 'needs' && show !== 'needs' ? 'text-amber-300/70' : 'text-gray-500'}>{counts[s.value]}</span>}
                </button>
              ),
            )}
          </ChipRow>
          {/* Search, status and the view switch stay put on the right; on a phone they get their own line above the tabs. */}
          <div className="flex w-full md:w-auto shrink-0 items-center gap-2 py-1.5">
            <SearchBox value={query} onChange={setQuery} />
            <label className="relative block">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OutreachRowStatus | 'all')}
                aria-label="Status"
                className="appearance-none h-9 rounded-none bg-[#1A1A1A] border border-[#333333] pl-3 pr-8 text-sm text-gray-300 focus:outline-none focus:border-[#336699]"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden />
            </label>
            <button
              type="button"
              onClick={() => pickView(view === 'cards' ? 'table' : 'cards')}
              aria-label={view === 'cards' ? 'Show as a table' : 'Show as cards'}
              title={view === 'cards' ? 'Show as a table' : 'Show as cards'}
              className={`${chip(false)} gap-2`}
            >
              {view === 'cards' ? <Table2 className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
            </button>
          </div>
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
      ) : view === 'cards' ? (
        <ContactCards
          rows={rows}
          onOpen={setOpen}
          onStatus={(row, next) => setContactStatus(row, next, row.note ?? '')}
          onRetry={(row, field) => void enrich([row.id], [field]).catch(() => {})}
        />
      ) : (
        <ContactsTable
          rows={rows}
          coverage={data.coverage}
          sort={sortNow}
          sortLabel={listLabel}
          onSort={nextSort}
          onOpen={setOpen}
          onRetry={(row, field) => void enrich([row.id], [field]).catch(() => {})}
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
