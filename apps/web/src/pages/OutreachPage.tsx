import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, Download, LayoutList, Mail, MoreHorizontal, Search, Send, SlidersHorizontal, Table2, Trash2, Undo2, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { outreachAPI, type OutreachChanges, type OutreachContact, type OutreachContacts, type OutreachDefinition, type OutreachField, type OutreachListSummary, type OutreachProgress, type OutreachRowStatus, type OutreachSource } from '../lib/api';
import { countyOf, setReadyCounties } from '../components/outreach/county';
import { AskListSheet } from '../components/outreach/AskListSheet';
import { ListStarter } from '../components/outreach/ListStarter';
import type { Preset } from '../components/outreach/presets';
import { ListPicker } from '../components/outreach/ListPicker';
import { inMoney, rememberList, UNLISTED } from '../components/outreach/listsStore';
import { mergeChanged, type ViewOf } from '../components/outreach/liveMerge';
import { ListsOverview } from '../components/outreach/ListsOverview';
import { EmailSheet } from '../components/outreach/EmailSheet';
import { GMAIL_RESULT } from '../lib/gmailConnect';
import { ContactCards, ContactsTable, ContactSheet, type OwnerSort } from '../components/outreach/ContactsTable';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { LookupProgress } from '../components/outreach/LookupProgress';
import { csvName, download, outreachCsv } from '../components/outreach/outreachCsv';
import { useConfirm } from '../components/common/ConfirmDialog';
import { fundErrorText, openFundingPage } from '../components/market/WalletBar';
import { useAuth } from '../contexts/AuthContext';
import { isStaff } from '../lib/roles';
import { DEFAULT_ROWS, FREE_LOOKUPS, MAX_ROWS, cityOf, listOrder } from '../../convex/lib/outreach';
import { callOk, isSimulated, mailOnly, openToLook, sourceName, STATUS_LABEL } from '../components/outreach/format';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const iconButton = 'w-10 h-10 md:w-11 md:h-11 shrink-0 inline-flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2A2A2A] border border-[#333333]';
/** A bulk action over the list: one row that slides sideways on a phone, so each stays on one line. */
const action = 'inline-flex items-center gap-2 px-3 h-10 md:h-11 shrink-0 whitespace-nowrap text-sm font-medium text-white disabled:opacity-50';
const VIEW_KEY = 'outreach.view';
const SORT_KEY = 'outreach.sort';
const COUNTY_FILTER_KEY = 'outreach.countyFilter';
const BATCH_KEY = 'outreach.batch';
const SEND_SEEN_KEY = 'outreach.sendSeen';
const chip = (on: boolean) => `inline-flex items-center gap-1 px-3 h-9 shrink-0 max-w-full text-sm border whitespace-nowrap ${on ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333333] text-gray-300 hover:bg-[#2A2A2A]'}`;
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
/** The status picker: New, In Leads, Skipped; earlier statuses only while some row still has one. */
const STATUS_FILTERS: OutreachRowStatus[] = ['new', 'lead', 'skip'];
const OLD_STATUSES: OutreachRowStatus[] = ['no_answer', 'callback', 'interested', 'not_interested', 'client', 'sent', 'done'];
/** The quick filters over the table: what a row has, or what it needs from you. */
type Show = 'all' | 'new' | 'signal' | 'ready' | 'personal' | 'work' | 'email' | 'replied' | 'mail' | 'needs';
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
  /** Answered an outreach email (they're in Leads too). Shown only when there are some. */
  { value: 'replied', label: 'Replied', has: (r) => r.email?.state === 'replied' },
  /** Looked up and nobody to call: these go out by mail (Export gives the addresses). Shown only when there are some. */
  { value: 'mail', label: 'Mail only', has: mailOnly },
  { value: 'needs', label: 'Needs you', has: (r) => Object.values(r.enrichment).some((c) => c.status === 'failed') },
];
/** Owner, company, person or either street, any case. */
const matches = (r: OutreachContact, q: string) => {
  const hay = [r.name, r.company, r.person?.name, r.mailing.address, r.property?.address].filter(Boolean).join('\n').toLowerCase();
  return hay.includes(q);
};

/** What keeps an owner when its only list is deleted: something of yours on it (as the server's worthKeeping). */
/** Running lookups' narration (which source is being asked, the turns so far), merged into their running cells. */
type Narration = Map<string, OutreachProgress>;
function withProgress(c: OutreachContacts, narration: Narration): OutreachContacts {
  if (!narration.size) return c;
  return {
    ...c,
    rows: c.rows.map((r) => {
      let cells = r.enrichment;
      for (const f of Object.keys(cells) as OutreachField[]) {
        const p = narration.get(`${r.id}:${f}`);
        if (p && cells[f]?.status === 'running') cells = { ...cells, [f]: { ...cells[f], asking: p.asking, tries: p.tries } };
      }
      return cells === r.enrichment ? r : { ...r, enrichment: cells };
    }),
  };
}

/** A lookup someone asked for that hasn't landed yet: the owner stays whatever is deleted, so its answer isn't thrown away. */
const lookingUp = (r: OutreachContact) => Object.values(r.enrichment).some((c) => c?.status === 'running' && c.requestedBy !== undefined);
/** Stays whatever is deleted: a lead, a client, or one still being looked up. */
const alwaysStays = (r: OutreachContact) => Boolean(r.leadId) || r.status === 'client' || lookingUp(r);
/** Whether an owner holds work of the company's own, as the server decides it; sim: simulated lookups count (no phone source yet). */
const workedOn = (r: OutreachContact, sim = false) =>
  alwaysStays(r) ||
  r.status !== 'new' ||
  Boolean(r.note?.trim()) ||
  (Boolean(r.research) && (sim || !r.enrichment.research?.simulated)) ||
  Object.values(r.enrichment).some((c) => c.status === 'found' && (sim || !c.simulated) && (c.requestedBy !== undefined || (c.chargedCents ?? 0) > 0));

/** Lists deleted on this page, each with whether its worked owners went too. */
type Gone = Map<string, boolean>;
/**
 * Owners as they are once the deleted lists are gone, the way the server will have them: untagged from those lists,
 * and those left on none dropped unless worked (or, when the worked went too, a lead or a client). A read that left
 * the server before a delete landed is shown this way, so the deleted list's owners never flash back in.
 */
function pruneGone(c: OutreachContacts, gone: Gone): OutreachContacts {
  if (gone.size === 0 || !c.rows.some((r) => r.listIds.some((id) => gone.has(id)))) return c;
  const rows: OutreachContact[] = [];
  for (const r of c.rows) {
    const hit = r.listIds.filter((id) => gone.has(id));
    if (hit.length === 0) {
      rows.push(r);
      continue;
    }
    const listIds = r.listIds.filter((id) => !gone.has(id));
    const stays = listIds.length > 0 || (hit.some((id) => gone.get(id)) ? alwaysStays(r) : workedOn(r, c.simulating));
    if (stays) rows.push({ ...r, listIds });
  }
  return { ...c, rows };
}

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
const SearchBox: React.FC<{ value: string; onChange: (value: string) => void; onOpenChange?: (open: boolean) => void; alwaysOpen?: boolean }> = ({ value, onChange, onOpenChange, alwaysOpen }) => {
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  // On a wide screen it's a box you can see; on a phone it folds to its icon until tapped.
  const open = alwaysOpen || focused || value.length > 0;
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
        className={`${alwaysOpen ? 'h-10' : 'h-9'} appearance-none rounded-none border border-[#333333] bg-[#1A1A1A] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] transition-[width] duration-200 ${
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
        <div role="menu" aria-label={label} className={`${menuPanel} right-0 min-w-[14rem]`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
/** A menu that floats: rounded, a fine edge, a deep shadow, a little see-through, opening with a quick fade. */
const menuPanel = 'absolute top-full mt-2 z-40 p-1.5 rounded-lg border border-white/10 bg-[#161616]/95 backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.6)] origin-top-right animate-pop';
const menuItem =
  'flex w-full items-center gap-3 px-3 min-h-[40px] md:min-h-[36px] rounded-md text-left text-sm text-gray-200 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent [&>svg]:text-gray-500 [&:hover>svg]:text-gray-300';
const menuDivider = 'my-1.5 h-px bg-white/10';

/** A filter that reads as words ("Status: All ▾"), sitting with the tabs rather than as a box beside them. */
const TextMenu: React.FC<{ label: string; text: React.ReactNode; active?: boolean; children: (close: () => void) => React.ReactNode }> = ({ label, text, active, children }) => {
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 h-10 px-3 text-sm font-medium hover:text-white hover:bg-[#2A2A2A] ${active ? 'text-white' : 'text-gray-400'}`}
      >
        {text}
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={label} className={`${menuPanel} right-0 min-w-[12rem]`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
/** What the main button does, in words: the person behind each owner, their phone and their email. */
/** "Find phones & emails (36)"; with a filter on, "(12 showing)": the button covers what the page shows. */
const findLabel = (n: number, showing = false) => `Find phones & emails (${n.toLocaleString('en-US')}${showing ? ' showing' : ''})`;
/** Past this many owners in one answer of the live feed, the page listens from the latest change on, so answers stay small. */
const FEED_STEP = 50;
/** At most this many more owners are loaded in one go before finding phones & emails for a whole list (four pages). */
const LOAD_REST_MAX = 2000;

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
/** In place of a bare "Loading…": the shape of what's coming (an owner's name and the line under it, row after row), quietly pulsing. */
const LoadingRows: React.FC<{ label: string; rows?: number }> = ({ label, rows = 6 }) => (
  <div role="status" aria-label={label} data-testid="loading-rows" className="border border-[#2A2A2A] divide-y divide-[#2A2A2A] motion-safe:animate-pulse">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="px-3 py-3.5 space-y-2">
        <div className="h-3.5 bg-[#2A2A2A]" style={{ width: `${[38, 30, 44, 34, 40, 28][i % 6]}%` }} />
        <div className="h-2.5 w-1/5 bg-[#222222]" />
      </div>
    ))}
    <span className="sr-only">{label}…</span>
  </div>
);

const OutreachPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id || undefined;
  const { user } = useAuth();
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lists, setLists] = useState<OutreachListSummary[] | null>(null);
  /** Lists deleted here: a read that left the server before the delete landed mustn't bring one back. */
  const gone = useRef<Gone>(new Map());
  const keep = (l: OutreachListSummary[]) => l.filter((x) => !gone.current.has(x.id));
  const [data, setData] = useState<OutreachContacts | null>(null);
  // Which counties' owners are in, for every county switch on the page.
  const readyCounties = data?.readyCounties?.join(',');
  useEffect(() => setReadyCounties(readyCounties ? readyCounties.split(',') : data?.readyCounties), [readyCounties, data?.readyCounties]);
  const [status, setStatus] = useState<OutreachRowStatus | 'all'>('all');
  // All owners, narrowed to one county (only offered once owners are in two or more); remembered on this device.
  const [countyPick, setCountyPick] = useState<string>(() => {
    try {
      return localStorage.getItem(COUNTY_FILTER_KEY) ?? 'all';
    } catch {
      return 'all';
    }
  });
  const pickCounty = (name: string) => {
    setCountyPick(name);
    try {
      if (name === 'all') localStorage.removeItem(COUNTY_FILTER_KEY);
      else localStorage.setItem(COUNTY_FILTER_KEY, name);
    } catch {
      // Private browsing: the pick lasts for this visit.
    }
  };
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
  // On a phone the two buttons share the row, so their words may wrap to a second line.
  const wrapOnPhone = narrow ? 'flex-1 min-w-0 !shrink justify-center !whitespace-normal text-center leading-tight py-2 !h-auto min-h-[44px]' : '';
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
  /**
   * Save a built list. The sheet stays open (its button says Saving…) until the new list's name and first owners are
   * read; then, in one render, the sheet closes and the list is on the page whole. A failure stays in the sheet.
   */
  const saveList = async (definition: OutreachDefinition, title: string) => {
    if (!organizationId) return;
    const made = await outreachAPI.create(organizationId, definition, title);
    rememberList(made.listId);
    // Should either read fail, the page reads them itself once the list is open.
    const [l, c] = await Promise.all([outreachAPI.lists(organizationId).catch(() => null), outreachAPI.contacts(organizationId, made.listId).catch(() => null)]);
    if (!live.current) return;
    const key = `${organizationId}:${made.listId}`;
    if (c) seen.current.set(key, c);
    // All of these land in the same render: the list, its owners, the route, and the sheet closing.
    currentKey.current = key;
    if (l) setLists(keep(l));
    if (c) setData(withProgress(c, narration.current));
    setOpen(null);
    setAsking(false);
    setStart(null);
    navigate(`/outreach/${made.listId}`);
  };
  /** The ready-made list the empty page's card opened the sheet with. */
  const [start, setStart] = useState<{ preset: Preset } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog, choose] = useConfirm();
  /** Manage lists: every list as a card, to pin or rename. */
  const managing = searchParams.get('lists') === '1';
  const openManage = () => setSearchParams({ lists: '1' });
  const pickList = (id: string | null) => navigate(id ? `/outreach/${id}` : '/outreach');
  // Whichever way a list was opened (the picker, a link, Back), it's the most recent one.
  useEffect(() => {
    if (listId && listId !== UNLISTED) rememberList(listId);
  }, [listId]);
  // Another list (or a new one just saved) opens at its top: the page doesn't keep the scroll of the one before, which
  // on a phone left a new list showing from its fifth owner with the buttons out of sight.
  const shownList = useRef(listId);
  useEffect(() => {
    if (shownList.current === listId) return;
    shownList.current = listId;
    for (let el = document.querySelector('[data-testid="outreach-page"]'); el; el = el.parentElement) if (el.scrollTop) el.scrollTop = 0;
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
  const narration = useRef<Narration>(new Map());
  // The lists as they are now, for the live feed's handler (set up once per view) to order a list's new owners by.
  const listsNow = useRef(lists);
  listsNow.current = lists;
  const takeContacts = useCallback((key: string, read: OutreachContacts) => {
    const c = pruneGone(read, gone.current);
    seen.current.set(key, c);
    if (live.current && currentKey.current === key) {
      setData(withProgress(c, narration.current));
      setError(null);
    }
  }, []);
  /**
   * The lists' numbers (done, sent, sold) are kept on each list and counted in the background when asked. The page asks
   * a few seconds after owners change rather than on every change (a lookup or a filling list changes owners many times
   * a second), and when it opens; the new numbers arrive on the lists themselves, which it listens to.
   */
  const listsSoon = useRef<number | null>(null);
  const refreshListsSoon = useCallback(() => {
    if (!organizationId || listsSoon.current !== null) return;
    listsSoon.current = window.setTimeout(() => {
      listsSoon.current = null;
      outreachAPI.tally?.(organizationId).catch(() => {});
      outreachAPI.lists(organizationId).then((l) => live.current && setLists(keep(l)), () => {});
    }, 4000);
  }, [organizationId]);
  useEffect(() => {
    if (!organizationId) return;
    outreachAPI.tally?.(organizationId).catch(() => {});
    return outreachAPI.watchLists?.(organizationId, (l) => live.current && setLists(keep(l)));
    // keep reads a ref: the lists are listened to once per company.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);
  useEffect(
    () => () => {
      if (listsSoon.current !== null) window.clearTimeout(listsSoon.current);
      listsSoon.current = null;
    },
    [],
  );
  const load = useCallback(async (): Promise<OutreachContacts | undefined> => {
    if (!organizationId) return;
    const key = `${organizationId}:${listId ?? 'all'}`;
    try {
      // A long view arrives a page at a time: with nothing to show yet, its first owners show while the rest are read.
      const early = seen.current.has(key) ? undefined : (c: OutreachContacts) => takeContacts(key, c);
      // The lists show as soon as they're read: a long view's first owners need them, and don't wait for its last page.
      const listsRead = outreachAPI.lists(organizationId).then((l) => {
        if (live.current) setLists(keep(l));
      });
      const [, c] = await Promise.all([listsRead, outreachAPI.contacts(organizationId, listId, early)]);
      if (!live.current) return;
      takeContacts(key, c);
      return c;
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : "The contacts couldn't be loaded");
    }
  }, [organizationId, listId, takeContacts]);
  /** Pin or rename a list, then show it. */
  const organize = useCallback(
    async (id: string, change: { title?: string; pinned?: boolean; archived?: boolean }) => {
      if (!organizationId) return;
      await outreachAPI.organizeList(organizationId, id, change);
      const l = await outreachAPI.lists(organizationId);
      if (live.current) setLists(keep(l));
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
    // The view is read once; after that the server sends only the owners that change (an answer landing, a status set
    // elsewhere), and they're put into the view the page has. Not the whole list again on every change.
    let ended = false;
    let stopChanges: (() => void) | undefined;
    const allKey = `${organizationId}:all`;
    const viewOf = (): ViewOf => {
      if (listId === UNLISTED) return { unlisted: true };
      const d = listId ? listsNow.current?.find((l) => l.id === listId)?.definition : undefined;
      return { listId, order: d ? listOrder(d) : undefined };
    };
    // A little before the moment given, so nothing between the read and the listening is missed (merging twice is harmless).
    const before = (at: string, ms: number) => new Date(Date.parse(at) - ms).toISOString();
    const reread = async () => {
      const c = await load();
      if (c?.asOf && !ended) listen(before(c.asOf, 10_000));
    };
    const onChanges = (p: OutreachChanges) => {
      if (ended) return;
      const base = seen.current.get(key);
      // Too much changed for one answer, or owners were removed (the feed only carries owners that still exist): read again.
      if (p.reload || (base && (p.removedAt ?? '') !== (base.removedAt ?? ''))) return void reread();
      if (!base) return;
      if (p.rows.length === 0 && p.balanceCents === base.balanceCents && (p.freeLookups ?? 0) === (base.freeLookups ?? 0)) return;
      takeContacts(key, mergeChanged({ ...base, balanceCents: p.balanceCents, freeLookups: p.freeLookups }, p.rows, viewOf()));
      // All owners, kept for the first look at the next list opened, follows too.
      const all = listId ? seen.current.get(allKey) : undefined;
      if (all) seen.current.set(allKey, mergeChanged(all, p.rows, {}));
      if (p.rows.length) refreshListsSoon();
      // A long run of changes: listen from the latest, so each answer stays small.
      if (p.rows.length > FEED_STEP) listen(before(p.upTo, 1_000));
    };
    function listen(since: string) {
      stopChanges?.();
      stopChanges = outreachAPI.watchChanges?.(organizationId!, since, onChanges, () => {
        // The backend is a version behind for a minute during a deploy and has no feed yet: the whole view, live, as before.
        stopChanges?.();
        stopChanges = outreachAPI.watchContacts?.(organizationId!, listId, (c) => !ended && takeContacts(key, c));
      });
    }
    void reread();
    // A lookup's narration comes on its own, small feed, so its many steps don't read every owner again.
    const stopProgress = outreachAPI.watchProgress?.(organizationId, (p) => {
      narration.current = new Map(p.map((x) => [`${x.contactId}:${x.field}`, x]));
      if (live.current) setData((d) => d && withProgress(d, narration.current));
    });
    return () => {
      ended = true;
      stopChanges?.();
      stopProgress?.();
    };
    // lists is read only for the first look at a new list; a change to it must not resubscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, listId, load, takeContacts, refreshListsSoon]);
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

  // Email these: the owners on the page now go to the drawer, which leaves out the ones that can't be emailed.
  const [emailIds, setEmailIds] = useState<string[] | null>(null);
  const [emailNote, setEmailNote] = useState<{ text: string; good: boolean } | null>(null);
  // Back from Google's Connect Gmail (?gmail=…&email=1): the result, and the drawer again.
  const backFromGmail = searchParams.get('gmail');
  const reopenEmail = searchParams.get('email') === '1';
  useEffect(() => {
    if (!backFromGmail && !reopenEmail) return;
    if (backFromGmail) setEmailNote(GMAIL_RESULT[backFromGmail] ?? null);
    setSearchParams({}, { replace: true });
    if (reopenEmail) setEmailIds([]);
  }, [backFromGmail, reopenEmail, setSearchParams]);

  const list = lists?.find((l) => l.id === listId);
  // A new list's owners arrive through the live feed as it fills; once it's full the view is read whole, for what the feed
  // doesn't carry (each owner's related owners, and whether they're already a client or a lead).
  const wasFilling = useRef(false);
  useEffect(() => {
    const filling = Boolean(list?.filling);
    if (wasFilling.current && !filling) void load();
    wasFilling.current = filling;
  }, [list?.filling, load]);
  /** The owners on no list, kept from deleted lists because they were worked: a view of their own, like a list's. */
  const onUnlisted = listId === UNLISTED;
  const unlistedCount = data?.unlisted ?? 0;
  // A list still filling in the background: read the lists again as its owners arrive, so the bar goes once the last page lands.
  const filling = Boolean(list?.filling);
  const arrived = data?.rows.length ?? 0;
  useEffect(() => {
    if (!filling || !organizationId) return;
    const t = setTimeout(() => {
      outreachAPI.lists(organizationId).then((l) => live.current && setLists(keep(l)), () => {});
    }, 800);
    return () => clearTimeout(t);
  }, [filling, arrived, organizationId]);
  // The county each owner is in: that of the lists it's on (an owner can be on lists in two). Owners on no list have none.
  const countyByList = useMemo(() => new Map((lists ?? []).map((l) => [l.id, l.definition.county] as const)), [lists]);
  const countiesOf = useCallback((r: OutreachContact) => [...new Set(r.listIds.map((id) => countyByList.get(id)).filter((c): c is string => Boolean(c)))], [countyByList]);
  // How many owners in each county, on All owners: the filter shows once there are two or more.
  const countyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (listId) return counts;
    for (const r of data?.rows ?? []) for (const c of countiesOf(r)) counts.set(c, (counts.get(c) ?? 0) + 1);
    return counts;
  }, [data, countiesOf, listId]);
  const mixed = countyCounts.size >= 2;
  const countyNow = mixed && countyCounts.has(countyPick) ? countyPick : 'all';
  // Where each owner is, under its property, when the owners on the page are from more than one county.
  const placeOf = useMemo(() => (mixed ? (r: OutreachContact) => countiesOf(r).map((c) => cityOf(c)).join(', ') || undefined : undefined), [mixed, countiesOf]);
  // The owners this list picked up on its own lately (it keeps itself up to date as the records change): told by when
  // each joined the list, or for one that arrived while the page was open, by when it was first pulled.
  const newSince = list?.fresh?.since;
  const isNewHere = useCallback((r: OutreachContact) => newSince !== undefined && (r.joinedAt ?? r.createdAt) >= newSince, [newSince]);
  const newHere = useMemo(() => (newSince ? (data?.rows ?? []).filter(isNewHere).length : 0), [data, newSince, isNewHere]);
  const [onlyNew, setOnlyNew] = useState(false);
  useEffect(() => setOnlyNew(false), [listId]);
  const justNew = onlyNew && newHere > 0;
  const rows = useMemo(() => {
    const has = SHOWS.find((s) => s.value === show)?.has ?? (() => true);
    const q = query.trim().toLowerCase();
    const kept = (data?.rows ?? []).filter((r) => (status === 'all' || r.status === status) && (countyNow === 'all' || countiesOf(r).includes(countyNow)) && has(r) && (!justNew || isNewHere(r)) && (!q || matches(r, q)));
    if (sortNow === 'parcels') return [...kept].sort((a, b) => b.properties - a.properties || b.totalValueCents - a.totalValueCents || a.name.localeCompare(b.name));
    if (sortNow === 'name') return [...kept].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
    return kept;
  }, [data, status, show, query, sortNow, countyNow, countiesOf, justNew, isNewHere]);
  /** The county filter's choices: every county, then each with its owners, most first. */
  const countyItems = (close: () => void) =>
    [['all', 'All counties', data?.rows.length ?? 0] as const, ...[...countyCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, countyOf(c).label.replace(/, TX/, ''), n] as const)].map(([value, label, n]) => (
      <button key={value} type="button" role="menuitemradio" aria-checked={countyNow === value} className={menuItem} onClick={() => (close(), pickCounty(value))} data-testid="county-filter-option">
        {label}
        <span className="text-gray-500">{n.toLocaleString('en-US')}</span>
        {countyNow === value && <Check className="ml-auto w-4 h-4 text-[#7fb0e0]" />}
      </button>
    ));
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
  // The header's buttons act on what the page is showing: the whole list (or every contact), or with a tab, a status, a
  // county, a search or "new since" on, just the owners that leaves. Of those, everyone a lookup would run on, and everyone
  // with no research yet. Someone already a client or a lead isn't looked up in bulk: their number is already in the app.
  // One can still be looked up from its sheet.
  const filterOn = show !== 'all' || status !== 'all' || countyNow !== 'all' || query.trim() !== '' || justNew;
  const scope = filterOn ? rows : (data?.rows ?? []);
  const listOpen = scope.filter((r) => hasLock(r) && !r.known);
  const listPhones = listOpen.filter(needsPhone).length;
  const listResearch = scope.filter(needsResearch);
  // Nobody on the page has been looked up or researched yet (every cell still locked).
  const untouched = (data?.rows ?? []).every((r) => (['phone', 'email', 'person', 'research'] as const).every((f) => (r.enrichment[f]?.status ?? 'locked') === 'locked'));
  const researchCost = listResearch.length * researchCents;
  // The company's first phones found are free: they come off what a lookup needs, and with no balance they can still be tried.
  const freeLeft = data?.freeLookups ?? 0;
  const paidPhones = (phones: number) => Math.max(0, phones - freeLeft);
  const short = paidPhones(listPhones) * unlockCents > balanceCents;
  const freeTry = short && freeLeft > 0 ? Math.min(freeLeft, listPhones) : 0;
  /** What finding these phones costs, in words: free while the free ones cover them. */
  const costOf = (phones: number) =>
    paidPhones(phones) === 0
      ? `free (${phones === 1 ? 'one' : phones} of your ${freeLeft} free ${freeLeft === 1 ? 'lookup' : 'lookups'})`
      : `${estimate(paidPhones(phones))}${freeLeft > 0 ? `, after your ${freeLeft} free ${freeLeft === 1 ? 'one' : 'ones'}` : ''}`;

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

  /**
   * The rest of the open list (up to LOAD_REST_MAX more owners), loaded a page at a time, then the list read again:
   * the owners it holds now, or null when it couldn't.
   */
  const loadRest = async (): Promise<OutreachContact[] | null> => {
    if (!organizationId || !listId || !list) return null;
    setExtending(true);
    setError(null);
    try {
      const stop = list.rowCount + LOAD_REST_MAX;
      let at = { rowCount: list.rowCount, total: list.total ?? 0 };
      while (at.rowCount < at.total && at.rowCount < stop) {
        const next = await outreachAPI.extend(organizationId, listId);
        // Nothing more came (the roll changed under it): stop rather than ask again.
        if (next.rowCount <= at.rowCount) break;
        at = next;
      }
      const [l, c] = await Promise.all([outreachAPI.lists(organizationId), outreachAPI.contacts(organizationId, listId)]);
      if (!live.current) return null;
      setLists(keep(l));
      takeContacts(`${organizationId}:${listId}`, c);
      return c.rows;
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : "The rest of the list couldn't be loaded");
      return null;
    } finally {
      if (live.current) setExtending(false);
    }
  };

  /**
   * Everyone on the open list (or every contact) who still has a lock, after a word on the cost. A list with owners not
   * loaded yet asks first whether to load them too, so "find phones" doesn't quietly cover only the first page.
   */
  const enrichAll = async () => {
    if (listOpen.length === 0) return;
    let rows = scope;
    // With a filter on, the ask is about the owners showing: no question about the ones not loaded yet.
    const more = list && !list.filling && !filterOn ? Math.max(0, (list.total ?? 0) - list.rowCount) : 0;
    if (list && more > 0) {
      const n = (x: number) => x.toLocaleString('en-US');
      const take = Math.min(more, LOAD_REST_MAX);
      const whole = take === more && !list.truncated;
      const answer = await choose({
        title: `${n(more)}${list.truncated ? '+' : ''} ${more === 1 ? 'owner' : 'owners'} on “${list.title}” ${more === 1 ? "isn't" : "aren't"} loaded yet`,
        message: `Finding phones & emails now covers the ${n(list.rowCount)} loaded. Load ${whole ? 'the rest' : `the next ${n(take)}`} first and it covers them too; loading is free.`,
        confirmLabel: whole ? `Load all ${n(list.rowCount + more)} first` : `Load ${n(take)} more first`,
        altLabel: `Just these ${n(list.rowCount)}`,
        tone: 'default',
      });
      if (!answer) return;
      if (answer === 'confirm') {
        const all = await loadRest();
        if (!all) return;
        rows = all;
      }
    }
    const open = rows.filter((r) => hasLock(r) && !r.known);
    if (open.length === 0) return;
    const known = rows.filter((r) => hasLock(r) && r.known).length;
    const phones = open.filter(needsPhone).length;
    const count = `${open.length.toLocaleString('en-US')} ${open.length === 1 ? 'owner' : 'owners'}`;
    const who = filterOn ? `the ${count} showing` : list ? `the ${count} on “${list.title}”` : `all ${open.length.toLocaleString('en-US')} ${open.length === 1 ? 'contact' : 'contacts'}`;
    // With a filter on: who is left out, so nobody thinks the whole list was covered.
    const total = data?.rows.length ?? 0;
    const narrowed = filterOn ? `Only the owners the page is showing now (${rows.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}${list ? ' on this list' : ''}). ` : '';
    const ok = await confirm({
      title: `Find phones & emails for ${who}?`,
      message: `${narrowed}${phones} ${phones === 1 ? 'phone' : 'phones'} to find: ${costOf(phones)}. Charged only for phones found; the person behind each company and emails are free.${
        known ? ` ${known} you already have as ${known === 1 ? 'a client or lead is' : 'clients or leads are'} left out.` : ''
      }`,
      confirmLabel: 'Find them',
      // Going ahead, not removing anything: the blue button, not the red one.
      tone: 'default',
    });
    if (!ok) return;
    // A page at a time, so no one request reads thousands of owners.
    const ids = open.map((r) => r.id);
    for (let i = 0; i < ids.length; i += MAX_ROWS) {
      try {
        await enrich(ids.slice(i, i + MAX_ROWS));
      } catch {
        // Refused (the balance): enrich says why; what's started stays started.
        void load();
        return;
      }
    }
  };

  /** No balance yet, but free lookups left: the first owners on the list who need a phone, as many as the free ones cover. */
  const tryFree = async () => {
    const first = listOpen.filter(needsPhone).slice(0, freeTry);
    if (first.length === 0) return;
    const ok = await confirm({
      title: `Find ${first.length === 1 ? 'a phone' : `${first.length} phones`} free?`,
      message: `Your first ${FREE_LOOKUPS} phone numbers are on us. The first ${first.length === 1 ? 'owner' : `${first.length} owners`} ${filterOn ? 'showing' : 'on this list'} ${first.length === 1 ? 'is' : 'are'} looked up now; a free one is used only when a phone is found. After those it's ${dollars(unlockCents)} a phone, only when found.`,
      confirmLabel: 'Find them',
      tone: 'default',
    });
    if (!ok) return;
    await enrich(first.map((r) => r.id)).catch(() => {});
  };

  /** A research answer for everyone on the list without one, after a word on the cost. */
  const researchAll = async () => {
    if (listResearch.length === 0) return;
    const ok = await confirm({
      title: `Research ${filterOn ? 'the ' : ''}${listResearch.length} ${listResearch.length === 1 ? 'owner' : 'owners'}${filterOn ? ' showing' : ''} with AI?`,
      message: `${filterOn ? `Only the owners the page is showing now (${rows.length.toLocaleString('en-US')} of ${(data?.rows.length ?? 0).toLocaleString('en-US')}${list ? ' on this list' : ''}). ` : ''}AI reads the web for what each owner does and any sign of plans to build, renovate, expand or sell. ${dollars(researchCents)} an answer, ${dollars(researchCost)} at most, charged only when it finds something to say.`,
      confirmLabel: 'Research them',
      // Going ahead, not removing anything: the blue button, not the red one.
      tone: 'default',
    });
    if (!ok) return;
    await enrich(listResearch.map((r) => r.id), ['research']).catch(() => {});
  };

  /** The owners showing (this list, filter and search) not yet in Leads or skipped; 500 at a time. */
  // Only owners you can reach go in bulk: a number that's OK to call, an email, or a client you already have. The rest wait for a lookup.
  const reachable = (r: OutreachContact) => r.phones.some(callOk) || r.emails.length > 0 || r.known?.kind === 'client';
  // One that matches a lead you already have is in Leads already: nothing to send (its card says so, and can still link it).
  const waiting = rows.filter((r) => !r.leadId && r.status !== 'skip' && r.known?.kind !== 'lead');
  const toSend = waiting.filter(reachable).slice(0, 500);
  // Who an email could go to now: an address of the person's, and not emailed or unsubscribed already.
  const emailable = rows.filter((r) => r.emails.some((e) => e.nameMatch !== false && e.verified !== false) && !['scheduled', 'emailed', 'replied', 'opted_out'].includes(r.email?.state ?? '')).length;
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
      // Going ahead, not removing anything: the blue button, not the red one.
      tone: 'default',
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

  // Any list can be deleted: owners you've worked (a status, a note, a lookup, a lead) stay under All owners; the rest go with it.
  const removeList = async (target: OutreachListSummary | undefined = list) => {
    if (!organizationId || !target) return;
    const list = target;
    // Nobody worked it: a plain yes or no. Worked owners only it holds: keep them (under Not on a list) or let them go too.
    let alsoWorked = false;
    if (list.deletable) {
      // Lookups run while no phone source is connected are simulated: say so, so "nobody worked it" doesn't read as wrong.
      const simulated = listId === list.id && Boolean(data?.rows.some(isSimulated));
      const message = simulated
        ? "Its lookups were simulated (no phone source is connected yet), so nothing real or paid is lost; they go with it. You can make it again any time."
        : 'Nobody has worked this list yet, so nothing of yours is lost. You can make it again any time.';
      if (!(await confirm({ title: `Delete “${list.title}”?`, message, confirmLabel: 'Delete' }))) return;
    } else {
      const n = list.worked ?? 0;
      const owners = n > 0 ? `${n.toLocaleString('en-US')} ${n === 1 ? 'owner' : 'owners'}` : 'Some owners';
      const answer = await choose({
        title: `Delete “${list.title}”?`,
        message: `${owners} on it ${n === 1 ? 'was' : 'were'} worked (a status, a note, a paid lookup or a lead) and ${n === 1 ? 'is' : 'are'} on no other list. Keep them under Not on a list, or let them go with it. Owners sent to Leads or made clients, and any still being looked up, always stay.`,
        confirmLabel: 'Delete, keep the worked owners',
        altLabel: 'Delete them too',
      });
      if (!answer) return;
      alsoWorked = answer === 'alt';
    }
    // Gone at once: All shows without it (its owners on no other list dropped, the rest untagged) before the server is asked,
    // so the page doesn't show this list emptying, then the old All, then the new one.
    const id = list.id;
    gone.current.set(id, alsoWorked);
    const allKey = `${organizationId}:all`;
    const all = seen.current.get(allKey);
    const remaining = (lists ?? []).filter((x) => x.id !== id);
    if (all) seen.current.set(allKey, pruneGone(all, gone.current));
    // Never read All: with no other list and nobody on none, All is just this list's owners that stay, so it's known now.
    else if (remaining.length === 0 && unlistedCount === 0 && data && listId === id) seen.current.set(allKey, pruneGone(data, gone.current));
    seen.current.delete(`${organizationId}:${id}`);
    setLists(remaining);
    if (!managing) {
      // Not known yet: the page waits for it rather than showing this list's owners as All in the meantime.
      if (!seen.current.has(allKey)) setData(null);
      navigate('/outreach');
    }
    try {
      await (alsoWorked ? outreachAPI.remove(organizationId, id, true) : outreachAPI.remove(organizationId, id));
      // Done on the server: the lists as they now are (the last one gone, the page shows the ready-made lists).
      const l = await outreachAPI.lists(organizationId);
      if (live.current) setLists(keep(l));
    } catch (err) {
      gone.current.delete(id);
      setError(err instanceof Error ? err.message : "Couldn't delete the list");
      void load();
    }
  };

  /** Let the owners on no list go, after asking: what they hold goes with them; leads' and clients' owners stay. */
  const clearUnlisted = async () => {
    if (!organizationId) return;
    const n = unlistedCount;
    const owners = `${n.toLocaleString('en-US')} ${n === 1 ? 'owner' : 'owners'}`;
    const ok = await confirm({
      title: `Remove the ${owners} not on a list?`,
      message: "Their notes, call outcomes and lookups go with them, paid ones too. Owners you sent to Leads or made clients, and any still being looked up, stay. A new list that includes one brings it back fresh.",
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { kept } = await outreachAPI.removeUnlisted(organizationId);
      if (!live.current) return;
      seen.current.delete(`${organizationId}:${UNLISTED}`);
      seen.current.delete(`${organizationId}:all`);
      if (onUnlisted && kept === 0) navigate('/outreach');
      else void load();
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : "Couldn't remove them");
    } finally {
      if (live.current) setBusy(false);
    }
  };

  if (!organizationId) return <p className="p-6 text-gray-400">Pick a company first.</p>;

  if (managing)
    return (
      <div className="p-4 md:p-6 space-y-4" data-testid="outreach-page">
        <h1 className="text-2xl font-semibold text-white">Lists</h1>
        <p className="text-sm text-gray-500" data-testid="lists-note">
          Lists keep themselves up to date: when the county's records change, owners who newly match are added. Nobody is taken off.
        </p>
        {lists ? (
          <ListsOverview lists={lists} onOpen={(id) => pickList(id)} onOrganize={organize} onDelete={(l) => void removeList(l)} onBack={() => setSearchParams({})} />
        ) : (
          <LoadingRows label="Loading your lists" rows={3} />
        )}
        {confirmDialog}
      </div>
    );

  return (
    // On a phone the page is a column whose filter bar (the list, search and tabs) comes first, before the buttons and the list's numbers.
    <div className="p-4 md:p-6 flex flex-col gap-4 md:block md:space-y-4" data-testid="outreach-page">
      {/* On a phone the top bar already says Outreach, and the staff lines fold behind one word; the actions become one row that slides sideways. */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="sr-only">Outreach</h1>
          {/* On a wide screen the open list's name is the page's title, a tap away from the others. */}
          {lists && lists.length > 0 && !narrow && <ListPicker lists={lists} currentId={listId} narrow={false} onPick={pickList} onPin={(id, pinned) => void organize(id, { pinned })} onManage={openManage} unlisted={unlistedCount} count={list ? undefined : data?.rows.length} />}
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
        {/* Two buttons, told apart at a glance: find phones and emails (solid blue), research with AI (violet). The rest under More. */}
        {/* There while the list or view has owners (a search or a filter that hides them all leaves them put), or is a list at all, so an empty one can still be deleted. */}
        {data && (data.rows.length > 0 || list) && (
          <div className={narrow ? 'flex items-stretch gap-2' : 'flex items-center gap-2 shrink-0'} data-testid="actions">
            {listOpen.length > 0 ? (
              // Short of money, the same button adds it: never a greyed-out button with the reason somewhere else.
              <button
                type="button"
                onClick={() => (freeTry ? void tryFree() : short ? addFunds() : void enrichAll())}
                disabled={busy || extending || Boolean(data.partial)}
                className={`${action} ${wrapOnPhone} bg-[#336699] hover:bg-[#2a5580]`}
                title={freeTry ? 'Your first phones found are free' : short ? `Your balance is ${dollars(balanceCents)}; finding these costs ${costOf(listPhones)}` : costOf(listPhones)}
                data-testid="find-all"
              >
                {/* On a phone the short-of-funds label is cut down, so the button is two lines at most, not three. */}
                {/* A long view still arriving, a page at a time: the button waits for all of it, so it covers every owner. */}
                {extending || data.partial
                  ? 'Loading owners…'
                  : freeTry
                    ? `Find ${freeTry} ${freeTry === 1 ? 'phone' : 'phones'} free`
                    : short
                    ? narrow
                      ? `Add funds to find phones (${listOpen.length.toLocaleString('en-US')}${filterOn ? ' showing' : ''})`
                      : `Add funds to ${findLabel(listOpen.length, filterOn).replace('Find', 'find')}`
                    : findLabel(listOpen.length, filterOn)}
              </button>
            ) : (
              toSend.length > 0 && (
                <button type="button" onClick={() => void sendAll()} disabled={busy} className={`${action} ${wrapOnPhone} bg-[#336699] hover:bg-[#2a5580]`} data-testid="send-all">
                  Send {toSend.length} to Leads
                </button>
              )
            )}
            {listResearch.length > 0 && (
              <button
                type="button"
                onClick={() => void researchAll()}
                disabled={busy || researchCost > balanceCents}
                className={`${action} ${wrapOnPhone} border border-violet-400/60 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20`}
                title={`AI reads the web for what each owner does and any plans to build or sell · ${dollars(researchCents)} an answer, charged only when it finds something`}
              >
                Research with AI ({listResearch.length.toLocaleString('en-US')}
                {filterOn ? ' showing' : ''})
              </button>
            )}
            <PopMenu label="More" icon={<MoreHorizontal className="w-5 h-5" />}>
              {(close) => (
                <>
                  {listOpen.length > 0 && toSend.length > 0 && (
                    <button type="button" role="menuitem" className={menuItem} disabled={busy} onClick={() => (close(), void sendAll())} data-testid="send-all">
                      <Send className="w-4 h-4" /> Send {toSend.length} to Leads
                    </button>
                  )}
                  {rows.length > 0 && (
                    <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), setEmailNote(null), setEmailIds(rows.map((r) => r.id)))} data-testid="email-these">
                      <Mail className="w-4 h-4" /> {emailable > 0 ? `Email ${emailable === rows.length ? 'these' : emailable} ${emailable === 1 ? 'owner' : 'owners'}` : 'Email these owners'}
                    </button>
                  )}
                  <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), pickView(view === 'cards' ? 'table' : 'cards'))}>
                    {view === 'cards' ? <Table2 className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />} {view === 'cards' ? 'Show as a table' : 'Show as cards'}
                  </button>
                  <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), download(csvName(list?.title ?? 'contacts'), outreachCsv(rows)))}>
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  {list && (
                    <>
                      <div className={menuDivider} role="separator" />
                      <button type="button" role="menuitem" className={`${menuItem} !text-red-300 hover:!bg-red-500/10 [&>svg]:!text-red-300`} onClick={() => (close(), void removeList())}>
                        <Trash2 className="w-4 h-4" /> Delete list
                      </button>
                    </>
                  )}
                  {onUnlisted && rows.length > 0 && (
                    <>
                      <div className={menuDivider} role="separator" />
                      <button type="button" role="menuitem" className={`${menuItem} !text-red-300 hover:!bg-red-500/10 [&>svg]:!text-red-300`} onClick={() => (close(), void clearUnlisted())}>
                        <Trash2 className="w-4 h-4" /> Remove these owners
                      </button>
                    </>
                  )}
                </>
              )}
            </PopMenu>
          </div>
        )}
      </header>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {emailNote && (
        <div className={`flex items-center gap-3 border px-3 py-2 text-sm ${emailNote.good ? 'border-[#333333] bg-[#121212] text-gray-300' : 'border-red-500/30 bg-red-500/10 text-red-200'}`} data-testid="email-note" role="status">
          <span className="flex-1">{emailNote.text}</span>
          <button type="button" onClick={() => setEmailNote(null)} aria-label="Dismiss" className="w-8 h-8 inline-flex items-center justify-center text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
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
      {/* The lists: one picker (search, pinned, recent, grouped by kind) instead of a chip per list. On a phone with owners showing, it lives in the sticky bar below. */}
      {lists && lists.length > 0 && narrow && !(data && data.rows.length > 0) && (
        <ListPicker lists={lists} currentId={listId} narrow onPick={pickList} onPin={(id, pinned) => void organize(id, { pinned })} onManage={openManage} unlisted={unlistedCount} count={list ? undefined : data?.rows.length} />
      )}
      {data && data.rows.length > 0 && list && (
        <p className="text-xs text-gray-500" data-testid="list-line">
          {/* What's done, what it's turned into and when it was made: who it is is in the title, the order under Name. */}
          {list.done} worked
          {list.results && list.results.sent > 0 && (
            <span data-testid="list-results">
              {' '}
              · {list.results.sent} sent · {list.results.estimates} {list.results.estimates === 1 ? 'estimate' : 'estimates'}
              {inMoney(list.results.estimateCents)} · <span className={list.results.soldCents ? 'text-emerald-300' : ''}>{list.results.sold} sold{inMoney(list.results.soldCents)}</span>
            </span>
          )}
          <span className="hidden md:inline"> · made {day(list.createdAt)}</span>
          {/* The list keeps itself up to date: who it picked up lately, a tap away. */}
          {list.fresh && newHere > 0 && (
            <>
              {' · '}
              <button type="button" onClick={() => setOnlyNew((v) => !v)} aria-pressed={justNew} className="text-[#7fb0e0] hover:text-white" data-testid="new-owners">
                {justNew ? `Showing the ${newHere.toLocaleString('en-US')} new since ${day(list.fresh.since)} · show all` : `${newHere.toLocaleString('en-US')} new since ${day(list.fresh.since)}`}
              </button>
            </>
          )}
          {list.total !== undefined && list.total > list.rowCount && !list.filling && (
            <span data-testid="list-total">
              {' '}
              · {list.rowCount.toLocaleString('en-US')} of {list.total.toLocaleString('en-US')}
              {list.truncated ? '+' : ''} loaded{' '}
              <button type="button" onClick={() => void extend()} disabled={extending} className="text-[#7fb0e0] hover:text-white disabled:text-gray-500">
                {extending ? 'Loading owners…' : `Load the next ${Math.min(list.total - list.rowCount, list.definition.limit ?? DEFAULT_ROWS).toLocaleString('en-US')}`}
              </button>
            </span>
          )}
          {list.truncated && (list.total === undefined || list.total <= list.rowCount) && <span className="text-amber-300"> · The top of a longer list; ask for a narrower one to reach the rest.</span>}
        </p>
      )}
      {/* A list nobody has looked anyone up on yet: what's already here, and what a phone costs, so the padlocks don't read as an empty list. */}
      {list && data && data.rows.length > 0 && untouched && (
        <p className="border border-[#333333] bg-[#161616] px-3 py-2 text-sm text-gray-300" data-testid="fresh-note">
          Every owner comes with their name, mailing address and property. Phone numbers are looked up when you ask: {dollars(unlockCents)} each, only when one is found
          {freeLeft === FREE_LOOKUPS ? `, and your first ${FREE_LOOKUPS} are free` : freeLeft > 0 ? `, and you have ${freeLeft} free ${freeLeft === 1 ? 'one' : 'ones'} left` : ''}. Emails and the person behind a company are free.
        </p>
      )}
      {data && data.rows.length > 0 && (
        <div
          ref={filterBar}
          className="max-md:order-first flex flex-col-reverse md:flex-row md:items-center md:gap-2 border-b border-[#333333] sticky top-[69px] md:top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-black"
          role="group"
          aria-label="Filters"
          data-testid="filter-bar"
        >
          {/* The quick filters as tabs, underlined in blue like the project and estimate drawers; when they don't fit, they slide sideways instead of wrapping. */}
          <ChipRow>
            {SHOWS.map((s) =>
              (s.value === 'needs' || s.value === 'new' || s.value === 'mail' || s.value === 'personal' || s.value === 'work' || s.value === 'replied') && counts[s.value] === 0 ? null : (
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
                <ListPicker lists={lists} currentId={listId} narrow onPick={pickList} onPin={(id, pinned) => void organize(id, { pinned })} onManage={openManage} unlisted={unlistedCount} count={list ? undefined : data?.rows.length} compact />
              )}
              <SearchBox value={query} onChange={setQuery} onOpenChange={setSearching} />
              <PopMenu label={mixed ? 'Filter' : 'Filter by status'} icon={<SlidersHorizontal className="w-4 h-4" />} dot={status !== 'all' || countyNow !== 'all'} size="w-9 h-9">
                {(close) => (
                  <>
                    {(['all', ...STATUS_FILTERS, ...OLD_STATUSES.filter((x) => status === x || data.rows.some((r) => r.status === x))] as Array<OutreachRowStatus | 'all'>).map((x) => (
                      <button key={x} type="button" role="menuitemradio" aria-checked={status === x} className={menuItem} onClick={() => (close(), setStatus(x))}>
                        {x === 'all' ? 'All statuses' : STATUS_LABEL[x]}
                        {status === x && <Check className="ml-auto w-4 h-4 text-[#7fb0e0]" />}
                      </button>
                    ))}
                    {mixed && (
                      <>
                        <div className="mx-2 my-1.5 border-t border-white/10" role="separator" />
                        {countyItems(close)}
                      </>
                    )}
                  </>
                )}
              </PopMenu>
            </div>
          ) : (
          <div className="flex w-full md:w-auto shrink-0 items-center gap-1 py-1.5">
            <TextMenu label="Status" text={<>Status: {status === 'all' ? 'All' : STATUS_LABEL[status]}</>} active={status !== 'all'}>
              {(close) =>
                (['all', ...STATUS_FILTERS, ...OLD_STATUSES.filter((x) => status === x || data.rows.some((r) => r.status === x))] as Array<OutreachRowStatus | 'all'>).map((x) => (
                  <button key={x} type="button" role="menuitemradio" aria-checked={status === x} className={menuItem} onClick={() => (close(), setStatus(x))}>
                    {x === 'all' ? 'All statuses' : STATUS_LABEL[x]}
                    {status === x && <Check className="ml-auto w-4 h-4 text-[#7fb0e0]" />}
                  </button>
                ))
              }
            </TextMenu>
            {mixed && (
              <TextMenu label="County" text={<>County: {countyNow === 'all' ? 'All' : countyNow}</>} active={countyNow !== 'all'}>
                {(close) => countyItems(close)}
              </TextMenu>
            )}
            <SearchBox value={query} onChange={setQuery} alwaysOpen />
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
          <button type="button" onClick={() => void clearUnlisted()} disabled={busy} className="text-gray-400 hover:text-white disabled:opacity-50">
            Remove them
          </button>
        </p>
      )}
      {onUnlisted && data && data.rows.length > 0 && (
        <p className="text-xs text-gray-500" data-testid="unlisted-line">
          Kept from lists you deleted, because you worked them. A new list that includes one takes it back, with all it holds.
        </p>
      )}
      {data === null || lists === null ? (
        <LoadingRows label="Loading owners" />
      ) : lists.length === 0 && data.rows.length === 0 ? (
        <ListStarter
          organizationId={organizationId}
          savedCounty={data.county}
          onPick={(preset) => {
            setStart({ preset });
            setAsking(true);
          }}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="nobody">
          {data.rows.length > 0 ? (
            <>
              Nobody matches {query.trim() ? `“${query.trim()}”` : 'those filters'}.{' '}
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setShow('all');
                  setStatus('all');
                }}
                className="text-[#7fb0e0] hover:text-white"
              >
                Show everyone
              </button>
            </>
          ) : list ? (
            <>
              Nobody on this list.{' '}
              <button type="button" onClick={() => setAsking(true)} className="text-[#7fb0e0] hover:text-white">
                Make another list
              </button>
            </>
          ) : (
            'Nobody here yet.'
          )}
        </p>
      ) : view === 'cards' ? (
        <ContactCards
          rows={rows}
          placeOf={placeOf}
          onOpen={setOpen}
          onStatus={(row, next) => setContactStatus(row, next, row.note ?? '')}
          onRetry={(row, field) => void enrich([row.id], [field]).catch(() => {})}
          onLead={(row) => void toLeads(row)}
        />
      ) : (
        <ContactsTable
          rows={rows}
          placeOf={placeOf}
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
        county={open ? (lists?.find((l) => open.listIds.includes(l.id))?.definition.county ?? data?.county) : undefined}
        unlockCents={unlockCents}
        researchCents={researchCents}
        researchQuestion={data?.researchQuestion ?? ''}
        balanceCents={balanceCents}
        onClose={() => setOpen(null)}
        onStatus={setContactStatus}
        onEnrich={(row, fields, question) => enrich([row.id], fields, question)}
        freeLookups={freeLeft}
        onAddFunds={addFunds}
        onLead={(row) => void toLeads(row)}
        organizationId={organizationId}
        onEmail={(row) => (setOpen(null), setEmailNote(null), setEmailIds([row.id]))}
      />
      {organizationId && (
        <EmailSheet
          open={emailIds !== null}
          organizationId={organizationId}
          // Back from connecting Gmail, the drawer opens on the owners the page shows.
          contactIds={emailIds && emailIds.length > 0 ? emailIds : rows.map((r) => r.id)}
          returnTo={`${listId ? `/outreach/${listId}` : '/outreach'}?email=1`}
          onClose={() => setEmailIds(null)}
          onScheduled={(text) => setEmailNote({ text, good: true })}
        />
      )}
      <AskListSheet
        open={asking}
        start={start}
        organizationId={organizationId}
        savedCounty={data?.county}
        onClose={() => {
          setAsking(false);
          setStart(null);
        }}
        onSave={saveList}
      />
      {confirmDialog}
      {/* What's running in the background (a lookup, a new list still filling) is a strip along the bottom edge of the
          page: in view wherever the list is scrolled to, and never on top of a row's buttons, as a pill floating over
          the rows was. It has its own room at the end of the page, so nothing above it moves when it comes or goes. */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 md:-mx-6 md:-mb-6 bg-[#10243a] pb-[env(safe-area-inset-bottom)] empty:hidden" data-testid="status-strip">
        {data && <LookupProgress rows={data.rows} since={batch?.at} onDismiss={() => keepBatch(null)} />}
        {list?.filling && (
          <div role="status" className="flex items-center gap-3 border-t border-[#336699]/50 px-4 md:px-6 py-2.5 text-sm text-white animate-appear" data-testid="list-filling">
            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-hidden />
            <span className="truncate">Adding owners to this list: {(data?.rows.length ?? 0).toLocaleString('en-US')} so far…</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OutreachPage;
