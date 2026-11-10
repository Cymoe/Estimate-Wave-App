import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Check, ChevronDown, Download, LayoutList, Lock, MoreHorizontal, Search, SlidersHorizontal, Table2, Trash2, Undo2, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { outreachAPI, type OutreachContact, type OutreachContacts, type OutreachField, type OutreachListSummary, type OutreachRowStatus, type OutreachSource } from '../lib/api';
import { AskListSheet } from '../components/outreach/AskListSheet';
import { ListStarter } from '../components/outreach/ListStarter';
import type { Preset } from '../components/outreach/presets';
import { ListPicker } from '../components/outreach/ListPicker';
import { rememberList } from '../components/outreach/listsStore';
import { ListsOverview } from '../components/outreach/ListsOverview';
import { ContactCards, ContactsTable, ContactSheet, type OwnerSort } from '../components/outreach/ContactsTable';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { LookupProgress } from '../components/outreach/LookupProgress';
import { csvName, download, outreachCsv } from '../components/outreach/outreachCsv';
import { useConfirm } from '../components/common/ConfirmDialog';
import { fundErrorText, openFundingPage } from '../components/market/WalletBar';
import { useAuth } from '../contexts/AuthContext';
import { isStaff } from '../lib/roles';
import { DEFAULT_ROWS, WHO_LABEL, listOrder } from '../../convex/lib/outreach';
import { callOk, isSimulated, mailOnly, openToLook, sourceName, STATUS_LABEL } from '../components/outreach/format';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const iconButton = 'w-10 h-10 md:w-11 md:h-11 shrink-0 inline-flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2A2A2A] border border-[#333333]';
/** A bulk action over the list: one row that slides sideways on a phone, so each stays on one line. */
const action = 'inline-flex items-center gap-2 px-3 h-10 md:h-11 shrink-0 whitespace-nowrap text-sm font-medium text-white disabled:opacity-50';
const VIEW_KEY = 'outreach.view';
const SORT_KEY = 'outreach.sort';
const BATCH_KEY = 'outreach.batch';
const SEND_SEEN_KEY = 'outreach.sendSeen';
const chip = (on: boolean) => `inline-flex items-center gap-1 px-3 h-9 shrink-0 max-w-full text-sm border whitespace-nowrap ${on ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333333] text-gray-300 hover:bg-[#2A2A2A]'}`;
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
/** The status picker: New, In Leads, Skipped; earlier statuses only while some row still has one. */
const STATUS_FILTERS: OutreachRowStatus[] = ['new', 'lead', 'skip'];
const OLD_STATUSES: OutreachRowStatus[] = ['no_answer', 'callback', 'interested', 'not_interested', 'client', 'sent', 'done'];
/** The quick filters over the table: what a row has, or what it needs from you. */
type Show = 'all' | 'new' | 'signal' | 'ready' | 'personal' | 'work' | 'email' | 'mail' | 'needs';
const SHOWS: Array<{ value: Show; label: string; has: (r: OutreachContact) => boolean }> = [
  { value: 'all', label: 'All', has: () => true },
  /** A signal first seen this week: the lists are watched, and this is what changed. Shown only when there is one. */
  { value: 'new', label: 'New this week', has: (r) => r.signals.some((x) => x.fresh) },
  /** A code violation, a demolition order or a stalled permit on the property: the warmest calls on any list. */
  { value: 'signal', label: 'Has a signal', has: (r) => r.signals.length > 0 },
  { value: 'ready', label: 'Ready to call', has: (r) => r.phones.some(callOk) },
  /** A number that is the person's own, or the business's, among the ones worth calling. Shown only when there are some. */
  { value: 'personal', label: 'Personal number', has: (r) => r.phones.some((p) => callOk(p) && p.line === 'personal') },
  { value: 'work', label: 'Work number', has: (r) => r.phones.some((p) => callOk(p) && p.line === 'work') },
  { value: 'email', label: 'Has email', has: (r) => r.emails.length > 0 },
  /** Looked up and nobody to call: these go out by mail (Export gives the addresses). Shown only when there are some. */
  { value: 'mail', label: 'Mail only', has: mailOnly },
  { value: 'needs', label: 'Needs you', has: (r) => Object.values(r.enrichment).some((c) => c.status === 'failed') },
];
/** Owner, company, person or either street, any case. */
const matches = (r: OutreachContact, q: string) => {
  const hay = [r.name, r.company, r.person?.name, r.mailing.address, r.property?.address].filter(Boolean).join('\n').toLowerCase();
  return hay.includes(q);
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
const SearchBox: React.FC<{ value: string; onChange: (value: string) => void; onOpenChange?: (open: boolean) => void }> = ({ value, onChange, onOpenChange }) => {
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const open = focused || value.length > 0;
  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);
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

/** A short menu under its button, for a phone: closes on a pick or a tap anywhere else. */
const PopMenu: React.FC<{ label: string; icon: React.ReactNode; dot?: boolean; size?: string; children: (close: () => void) => React.ReactNode }> = ({ label, icon, dot, size, children }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
    };
  }, [open]);
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open} title={label} className={`${size ? `${size} shrink-0 inline-flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2A2A2A] border border-[#333333]` : iconButton} relative ${open ? 'text-white bg-[#2A2A2A]' : ''}`}>
        {icon}
        {dot && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#7fb0e0]" aria-hidden />}
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-full mt-1 z-40 min-w-[14rem] py-1 bg-[#1A1A1A] border border-[#333333] shadow-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
const menuItem = 'flex w-full items-center gap-3 px-4 min-h-[44px] text-left text-sm text-gray-200 hover:bg-[#2A2A2A] disabled:opacity-50';

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
  // The filters stay at the top in both views; the table's column header sticks just under them.
  const filterBar = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  const hasBar = Boolean(data && data.rows.length > 0);
  useEffect(() => {
    const el = filterBar.current;
    if (!el) return;
    const measure = () => setBarHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [hasBar]);
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<OutreachContact | null>(null);
  /** On a phone the staff lines (owners build, data sources) are folded until asked for. */
  const [staffOpen, setStaffOpen] = useState(false);
  // On a phone an open search box takes the list picker's place.
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /** The ready-made list the empty page's card opened the sheet with. */
  const [start, setStart] = useState<{ preset: Preset } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  /** Manage lists: every list as a card, to pin, rename or archive. */
  const managing = searchParams.get('lists') === '1';
  const openManage = () => setSearchParams({ lists: '1' });
  const pickList = (id: string | null) => navigate(id ? `/outreach/${id}` : '/outreach');
  // Whichever way a list was opened (the picker, a link, Back), it's the most recent one.
  useEffect(() => {
    if (listId) rememberList(listId);
  }, [listId]);
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
  /** Pin, rename or archive a list, then show it. */
  const organize = useCallback(
    async (id: string, change: { title?: string; pinned?: boolean; archived?: boolean }) => {
      if (!organizationId) return;
      await outreachAPI.organizeList(organizationId, id, change);
      if (live.current) setLists(await outreachAPI.lists(organizationId));
    },
    [organizationId],
  );
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

  // A lead's "See owner" opens /outreach?owner=<id>: that owner's sheet, once the contacts are in.
  useEffect(() => {
    const id = searchParams.get('owner');
    if (!id || !data) return;
    const row = data.rows.find((r) => r.id === id);
    if (row) setOpen(row);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, data]);

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
  // Someone already a client or a lead isn't looked up in bulk: their number is already in the app. One can still be looked up from its sheet.
  const listOpen = (data?.rows ?? []).filter((r) => hasLock(r) && !r.known);
  const listKnown = (data?.rows ?? []).filter((r) => hasLock(r) && r.known).length;
  const listPhones = listOpen.filter(needsPhone).length;
  const listResearch = (data?.rows ?? []).filter(needsResearch);
  const researchCost = listResearch.length * researchCents;
  const short = listPhones * unlockCents > balanceCents;

  const addFunds = () => organizationId && openFundingPage(organizationId).catch((err) => setError(fundErrorText(err)));

  /** Skip, or a note: shown at once, saved behind it, and put back if the save fails. */
  const setContactStatus = async (row: OutreachContact, next: OutreachRowStatus, text: string) => {
    if (!organizationId) return;
    const was = { status: row.status, note: row.note };
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, status: next, note: text.trim() || undefined } : r)) });
    setLists((l) => l && l.map((x) => (row.listIds.includes(x.id) ? { ...x, done: doneOn(x.id, row, next) } : x)));
    try {
      await outreachAPI.setStatus(organizationId, row.id, next, text.trim());
    } catch (err) {
      setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, ...was } : r)) });
      setLists((l) => l && l.map((x) => (row.listIds.includes(x.id) ? { ...x, done: doneOn(x.id, { ...row, status: next }, row.status) } : x)));
      throw err;
    }
  };
  /** The list's done count after this row's status change. */
  const doneOn = (id: string, row: OutreachContact, next: OutreachRowStatus) => {
    const worked = (s: OutreachRowStatus) => !['new', 'sent', 'no_answer', 'callback'].includes(s);
    const current = lists?.find((l) => l.id === id)?.done ?? 0;
    return Math.max(0, current + (worked(next) ? 1 : 0) - (worked(row.status) ? 1 : 0));
  };

  /** Off to Leads, where the calls, follow-ups and the estimate already live; once there, this opens the lead. */
  const toLeads = async (row: OutreachContact) => {
    if (!organizationId) return;
    if (row.leadId) return navigate(`/leads?lead=${row.leadId}`);
    setError(null);
    try {
      const leadId = await outreachAPI.sendToLeads(organizationId, row.id);
      setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, status: 'lead', leadId } : r)) });
      setLists((l) => l && l.map((x) => (row.listIds.includes(x.id) ? { ...x, done: doneOn(x.id, row, 'lead') } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send them to Leads");
    }
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
      message: `${listPhones} ${listPhones === 1 ? 'phone' : 'phones'} to find: ${estimate(listPhones)}. Charged only for phones found; the person behind each company and emails are free.${
        listKnown ? ` ${listKnown} you already have as ${listKnown === 1 ? 'a client or lead is' : 'clients or leads are'} left out.` : ''
      }`,
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

  /** The owners showing (this list, filter and search) not yet in Leads or skipped; 500 at a time. */
  // Only owners you can reach go in bulk: a number that's OK to call, an email, or a client or lead you already have. The rest wait for a lookup.
  const reachable = (r: OutreachContact) => r.phones.some(callOk) || r.emails.length > 0 || Boolean(r.known);
  const waiting = rows.filter((r) => !r.leadId && r.status !== 'skip');
  const toSend = waiting.filter(reachable).slice(0, 500);
  const unreachable = waiting.length - waiting.filter(reachable).length;
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  // The latest send of many, offered for Undo for a day, until dismissed on this device.
  const lastSend = data?.lastSend ?? null;
  const [seenSend, setSeenSend] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SEND_SEEN_KEY);
    } catch {
      return null;
    }
  });
  const dismissSend = () => {
    setSentNote(null);
    setUndoNote(null);
    if (!lastSend) return;
    setSeenSend(lastSend.at);
    try {
      localStorage.setItem(SEND_SEEN_KEY, lastSend.at);
    } catch {
      // Private browsing: dismissed for this visit.
    }
  };
  /** Takes back the latest send, after a word on what stays. */
  const undoLastSend = async () => {
    if (!organizationId || !lastSend) return;
    const ok = await confirm({
      title: `Take back the ${lastSend.leads} ${lastSend.leads === 1 ? 'lead' : 'leads'} from this send?`,
      message: 'They come out of Leads and their owners are New here again. Any you have already moved past New or quoted stay in Leads.',
      confirmLabel: 'Take them back',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await outreachAPI.undoSend(organizationId, lastSend.at);
      setSentNote(null);
      setUndoNote(`Took back ${r.removed} ${r.removed === 1 ? 'lead' : 'leads'}${r.kept ? `; kept ${r.kept} you've already started on` : ''}.`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't undo that send");
    } finally {
      setBusy(false);
    }
  };
  /** Everyone showing to Leads at once, after a word on what happens. */
  const sendAll = async () => {
    if (!organizationId || toSend.length === 0) return;
    const n = toSend.length;
    const ok = await confirm({
      title: `Send ${n} ${n === 1 ? 'owner' : 'owners'} to Leads?`,
      message: `The owners showing with a number or email go to Leads as New, where you call and follow up. Companies run by the same people become one lead.${
        unreachable ? ` ${unreachable} with no number or email yet stay here; look them up first, or send one from its card.` : ''
      }`,
      confirmLabel: 'Send to Leads',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await outreachAPI.sendManyToLeads(organizationId, toSend.map((x) => x.id));
      setUndoNote(null);
      setSentNote(`${r.leads} new ${r.leads === 1 ? 'lead' : 'leads'} in Leads${r.joined ? `; ${r.joined} joined a related company's lead` : ''}.`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send them to Leads");
    } finally {
      setBusy(false);
    }
  };

  // Delete is only for a list nobody has worked (a mistake); a worked one is archived, which keeps everything.
  const removeList = async () => {
    if (!organizationId || !list) return;
    if (!(await confirm({ title: `Delete “${list.title}”?`, message: "Nobody has worked this list yet, so nothing of yours is lost. You can make it again any time.", confirmLabel: 'Delete' }))) return;
    try {
      await outreachAPI.remove(organizationId, list.id);
      navigate('/outreach');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the list");
    }
  };
  const archiveList = async () => {
    if (!list) return;
    await organize(list.id, { archived: !list.archived });
    if (!list.archived) navigate('/outreach');
  };

  if (!organizationId) return <p className="p-6 text-gray-400">Pick a company first.</p>;

  if (managing)
    return (
      <div className="p-4 md:p-6 space-y-4" data-testid="outreach-page">
        <h1 className="text-2xl font-semibold text-white">Lists</h1>
        {lists ? (
          <ListsOverview lists={lists} onOpen={(id) => pickList(id)} onOrganize={organize} onBack={() => setSearchParams({})} />
        ) : (
          <p className="text-sm text-gray-400">Loading…</p>
        )}
        {confirmDialog}
      </div>
    );

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="outreach-page">
      {/* A lookup running, or just finished: a banner across the top of the page, edge to edge. */}
      {data && <LookupProgress rows={data.rows} since={batch?.at} onDismiss={() => keepBatch(null)} className="-mx-4 md:-mx-6 -mt-4 md:-mt-6" />}
      {/* On a phone the top bar already says Outreach, and the staff lines fold behind one word; the actions become one row that slides sideways. */}
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="hidden md:block text-2xl font-semibold text-white">Outreach</h1>
          {isStaff(user) && (
            <div className="md:mt-1 text-xs text-gray-500">
              <button type="button" onClick={() => setStaffOpen((v) => !v)} aria-expanded={staffOpen} className="md:hidden inline-flex items-center gap-1 min-h-[32px] text-gray-500 hover:text-white">
                Staff <ChevronDown className={`w-3.5 h-3.5 transition-transform ${staffOpen ? 'rotate-180' : ''}`} />
              </button>
              <div className={`${staffOpen ? 'flex' : 'hidden'} md:flex flex-wrap items-baseline gap-x-3`}>
                <SourcesPanel organizationId={organizationId} />
              </div>
            </div>
          )}
        </div>
        {/* On a phone: the one thing to do next, and the rest under More. */}
        {data && rows.length > 0 && narrow && (
          <div className="flex items-center gap-2" data-testid="actions">
            {listOpen.length > 0 ? (
              <button type="button" onClick={() => void enrichAll()} disabled={busy || short} className={`${action} flex-1 justify-center bg-[#336699] hover:bg-[#2a5580]`} title={estimate(listPhones)}>
                <Lock className="w-4 h-4" /> Look up {listOpen.length}
              </button>
            ) : toSend.length > 0 ? (
              <button type="button" onClick={() => void sendAll()} disabled={busy} className={`${action} flex-1 justify-center border border-[#336699] hover:bg-[#336699]/20`} data-testid="send-all">
                Send {toSend.length} to Leads
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {listOpen.length > 0 && short && (
              <button type="button" onClick={addFunds} className="shrink-0 min-h-[40px] text-sm text-[#7fb0e0] hover:text-white">
                Add funds
              </button>
            )}
            <PopMenu label="More" icon={<MoreHorizontal className="w-5 h-5" />}>
              {(close) => (
                <>
                  {listResearch.length > 0 && (
                    <button type="button" role="menuitem" className={menuItem} disabled={busy || researchCost > balanceCents} onClick={() => (close(), void researchAll())}>
                      Research {listResearch.length}
                      <span className="ml-auto text-xs text-gray-500">{dollars(researchCents)} an answer</span>
                    </button>
                  )}
                  {listOpen.length > 0 && toSend.length > 0 && (
                    <button type="button" role="menuitem" className={menuItem} disabled={busy} onClick={() => (close(), void sendAll())} data-testid="send-all">
                      Send {toSend.length} to Leads
                    </button>
                  )}
                  <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), pickView(view === 'cards' ? 'table' : 'cards'))}>
                    {view === 'cards' ? <Table2 className="w-4 h-4 text-gray-500" /> : <LayoutList className="w-4 h-4 text-gray-500" />} {view === 'cards' ? 'Show as a table' : 'Show as cards'}
                  </button>
                  <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), download(csvName(list?.title ?? 'contacts'), outreachCsv(rows)))}>
                    <Download className="w-4 h-4 text-gray-500" /> Export CSV
                  </button>
                  {list && (
                    <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), void archiveList())}>
                      {list.archived ? <ArchiveRestore className="w-4 h-4 text-gray-500" /> : <Archive className="w-4 h-4 text-gray-500" />} {list.archived ? 'Restore list' : 'Archive list'}
                    </button>
                  )}
                  {list?.deletable && (
                    <button type="button" role="menuitem" className={`${menuItem} text-red-300`} onClick={() => (close(), void removeList())}>
                      <Trash2 className="w-4 h-4" /> Delete list
                    </button>
                  )}
                </>
              )}
            </PopMenu>
          </div>
        )}
        {data && rows.length > 0 && !narrow && (
          <div className="flex gap-2 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible" data-testid="actions">
            {listOpen.length > 0 && (
              <button
                type="button"
                onClick={() => void enrichAll()}
                disabled={busy || short}
                className={`${action} bg-[#336699] hover:bg-[#2a5580]`}
                title={estimate(listPhones)}
              >
                <Lock className="w-4 h-4" /> Look up {listOpen.length}
              </button>
            )}
            {listOpen.length > 0 && short && (
              <button type="button" onClick={addFunds} className="self-center shrink-0 text-sm text-[#7fb0e0] hover:text-white">
                Add funds
              </button>
            )}
            {listResearch.length > 0 && (
              <button
                type="button"
                onClick={() => void researchAll()}
                disabled={busy || researchCost > balanceCents}
                className={`${action} border border-[#336699] hover:bg-[#336699]/20`}
                title={`${dollars(researchCents)} an answer, charged only when the web has something to say`}
              >
                Research {listResearch.length}
              </button>
            )}
            {toSend.length > 0 && (
              <button type="button" onClick={() => void sendAll()} disabled={busy} className={`${action} border border-[#333333] hover:bg-[#2A2A2A]`} data-testid="send-all">
                Send {toSend.length} to Leads
              </button>
            )}
            <button type="button" onClick={() => download(csvName(list?.title ?? 'contacts'), outreachCsv(rows))} aria-label="Export CSV" title="Export CSV" className={iconButton}>
              <Download className="w-4 h-4" />
            </button>
            {list && (
              <button
                type="button"
                onClick={() => void archiveList()}
                aria-label={list.archived ? 'Restore list' : 'Archive list'}
                title={list.archived ? 'Restore list' : 'Archive list: tucks it away, keeps everything'}
                className={iconButton}
              >
                {list.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              </button>
            )}
            {list?.deletable && (
              <button type="button" onClick={removeList} aria-label="Delete list" title="Delete list (nobody has worked it yet)" className={iconButton}>
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
      {(undoNote || sentNote || (lastSend && lastSend.at !== seenSend)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#121212] border border-[#333333] px-3 py-2 text-sm text-gray-300" data-testid="sent-note">
          <span className="flex-1 min-w-[12rem]">
            {undoNote ??
              sentNote ??
              `${lastSend!.leads} leads sent to Leads at ${new Date(lastSend!.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}
          </span>
          {!undoNote && lastSend && (
            <button
              type="button"
              onClick={() => void undoLastSend()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 min-h-[40px] text-sm font-medium text-white border border-[#336699] hover:bg-[#336699]/20 disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" /> Undo send
            </button>
          )}
          {!undoNote && (
            <button type="button" onClick={() => navigate('/leads')} className="min-h-[40px] text-[#7fb0e0] hover:text-white">
              Open Leads
            </button>
          )}
          <button type="button" onClick={dismissSend} aria-label="Dismiss" title="Dismiss" className="w-10 h-10 inline-flex items-center justify-center text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* The lists: one picker (search, pinned, recent, grouped by kind, archived) instead of a chip per list. On a phone with owners showing, it lives in the sticky bar below. */}
      {lists && lists.length > 0 && !(narrow && data && data.rows.length > 0) && (
        <ListPicker lists={lists} currentId={listId} narrow={narrow} onPick={pickList} onPin={(id, pinned) => void organize(id, { pinned })} onManage={openManage} />
      )}
      {data && data.rows.length > 0 && list && (
        <p className="text-xs text-gray-500" data-testid="list-line">
          {/* On a phone just what's done and what's left to load; who and the order are in the list's title and the ask. */}
          <span className="hidden md:inline">
            {WHO_LABEL[list.who]} · {listOrder(list.definition).label} ·{' '}
          </span>
          {list.done} done
          {list.results && list.results.sent > 0 && (
            <span data-testid="list-results">
              {' '}
              · {list.results.sent} sent · {list.results.estimates} {list.results.estimates === 1 ? 'estimate' : 'estimates'} · {list.results.sold} sold
            </span>
          )}
          <span className="hidden md:inline"> · asked {day(list.createdAt)}</span>
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
          ref={filterBar}
          className="flex flex-col-reverse md:flex-row md:items-center md:gap-2 border-b border-[#333333] sticky top-[69px] md:top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-black"
          role="group"
          aria-label="Filters"
          data-testid="filter-bar"
        >
          {/* The quick filters as tabs, underlined in blue like the project and estimate drawers; when they don't fit, they slide sideways instead of wrapping. */}
          <ChipRow>
            {SHOWS.map((s) =>
              (s.value === 'needs' || s.value === 'new' || s.value === 'mail' || s.value === 'personal' || s.value === 'work') && counts[s.value] === 0 ? null : (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setShow(s.value)}
                  aria-pressed={show === s.value}
                  className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    show === s.value ? 'text-white border-[#336699] bg-[#336699]/10' : `border-transparent hover:text-white hover:bg-[#2a2a2a] ${s.value === 'needs' ? 'text-amber-300' : 'text-gray-400'}`
                  }`}
                >
                  {s.label} {s.value !== 'all' && <span className={s.value === 'needs' && show !== s.value && counts[s.value] > 0 ? 'text-amber-300/70' : 'text-gray-500'}>{counts[s.value]}</span>}
                </button>
              ),
            )}
          </ChipRow>
          {/* Search, status and the view switch stay put on the right. On a phone the line above the tabs is the list, search and a filter menu. */}
          {narrow ? (
            <div className="flex w-full items-center gap-2 py-1.5">
              {lists && lists.length > 0 && !searching && (
                <ListPicker lists={lists} currentId={listId} narrow onPick={pickList} onPin={(id, pinned) => void organize(id, { pinned })} onManage={openManage} compact />
              )}
              <SearchBox value={query} onChange={setQuery} onOpenChange={setSearching} />
              <PopMenu label="Filter by status" icon={<SlidersHorizontal className="w-4 h-4" />} dot={status !== 'all'} size="w-9 h-9">
                {(close) =>
                  (['all', ...STATUS_FILTERS, ...OLD_STATUSES.filter((x) => status === x || data.rows.some((r) => r.status === x))] as Array<OutreachRowStatus | 'all'>).map((x) => (
                    <button key={x} type="button" role="menuitemradio" aria-checked={status === x} className={menuItem} onClick={() => (close(), setStatus(x))}>
                      {x === 'all' ? 'All statuses' : STATUS_LABEL[x]}
                      {status === x && <Check className="ml-auto w-4 h-4 text-[#7fb0e0]" />}
                    </button>
                  ))
                }
              </PopMenu>
            </div>
          ) : (
          <div className="flex w-full md:w-auto shrink-0 items-center gap-2 py-1.5">
            <SearchBox value={query} onChange={setQuery} />
            <label className="relative block">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OutreachRowStatus | 'all')}
                aria-label="Status"
                className="appearance-none h-9 rounded-none bg-[#1A1A1A] border border-[#333333] pl-3 pr-8 text-sm text-gray-300 focus:outline-none focus:border-[#336699]"
              >
                <option value="all">All statuses</option>
                {[...STATUS_FILTERS, ...OLD_STATUSES.filter((x) => status === x || data.rows.some((r) => r.status === x))].map((x) => (
                  <option key={x} value={x}>
                    {STATUS_LABEL[x]}
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
          )}
        </div>
      )}
      {view === 'cards' && rows.some(isSimulated) && (
        <p className="text-xs text-gray-500" data-testid="sample-note">
          Sample results: no phone source is connected yet.
        </p>
      )}
      {lists && lists.length === 0 && data && data.rows.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-[#333333] bg-[#121212] px-4 py-3 text-sm text-gray-300" data-testid="no-lists-hint">
          <span>
            No lists right now. These {data.rows.length.toLocaleString('en-US')} {data.rows.length === 1 ? 'owner' : 'owners'} stayed from lists you deleted, because you worked them: a status, a note, a paid lookup, or a lead.
          </span>
          <button type="button" onClick={() => setAsking(true)} className="text-[#7fb0e0] hover:text-white">
            Make a list
          </button>
        </p>
      )}
      {data === null || lists === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : lists.length === 0 && data.rows.length === 0 ? (
        <ListStarter
          onPick={(preset) => {
            setStart({ preset });
            setAsking(true);
          }}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">{data.rows.length === 0 ? 'Nobody matched. Ask for a wider list.' : 'Nobody matches those filters.'}</p>
      ) : view === 'cards' ? (
        <ContactCards
          rows={rows}
          onOpen={setOpen}
          onStatus={(row, next) => setContactStatus(row, next, row.note ?? '')}
          onRetry={(row, field) => void enrich([row.id], [field]).catch(() => {})}
          onLead={(row) => void toLeads(row)}
        />
      ) : (
        <ContactsTable
          rows={rows}
          coverage={data.coverage}
          sort={sortNow}
          sortLabel={listLabel}
          below={barHeight}
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
        onLead={(row) => void toLeads(row)}
      />
      <AskListSheet
        open={asking}
        start={start}
        organizationId={organizationId}
        onClose={() => {
          setAsking(false);
          setStart(null);
        }}
        onSaved={(id) => {
          setStart(null);
          navigate(`/outreach/${id}`);
        }}
      />
      {confirmDialog}
    </div>
  );
};

export default OutreachPage;
