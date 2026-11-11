import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, FileText, Lock, Mail, MapPin, MessageSquare, MinusCircle, Phone, RotateCw, User, ArrowRight, ArrowUpDown } from 'lucide-react';
import { AddressLink } from '../common/AddressLink';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { fullAddress } from '../../lib/mapsLinks';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { tidyCase } from '../../../convex/lib/addressCase';
import { emailAPI, outreachAPI, type OwnerProperties, type OutreachCell, type OutreachContact, type OutreachContacts, type OutreachCoverage, type OutreachField, type OutreachPhone, type OutreachRowStatus, type OutreachSignal, type OutreachTry, type OutreachWho, type OwnerEmails } from '../../lib/api';
import { shortMoney, WHO_LABEL, cityOf, knownCounty } from '../../../convex/lib/outreach';
import { isCommercialUse, isMultifamilyUse } from '../../../convex/lib/parcels';
import { askingText, callOk, deedSearch, emailStateText, dueAgain, isSimulated, LEAD_STAGE, mailingLine, oneLineAddress, nobodyToReach, phoneKind, phoneText, sourceList, sourceName, STATUS_LABEL, tryAgainFrom, QUEUED_AFTER_MS } from './format';
import { operatorBasis, operatorEmails, operatorHolding, operatorPhones, operatorWaiting, ownerItems, type Operator, type Operators } from './operators';

/** The column's short name for the kind of owner. */
const KIND: Record<OutreachWho, string> = {
  investor: 'Investor',
  builder: 'Builder',
  manager: 'Manager',
  commercial: 'Commercial',
  portfolio: 'Portfolio',
  multifamily: 'Apartments',
  wealthy: 'Wealthy',
  recent_buyer: 'Buyer',
  absentee: 'Absentee',
  long_owned: 'Long-time',
  violation: 'Violation',
  stalled: 'Stalled',
  contractor: 'Contractor',
  designer: 'Architect',
  occupant: 'Tenant',
  realtor: 'Realtor',
  custom: 'Custom',
};
const SIGNAL_LABEL: Record<OutreachSignal['kind'], string> = { code_violation: 'Code violation', dilapidated: 'Dilapidated', demolition: 'Demolition order', stalled_permit: 'Stalled permit' };

const statusTone = (s: OutreachRowStatus) =>
  s === 'lead' || s === 'interested' || s === 'client' || s === 'done' ? 'text-[#7fb0e0] border-[#336699]/60' : s === 'skip' || s === 'not_interested' ? 'text-gray-500 border-[#333333]' : 'text-amber-300 border-amber-400/40';

/** A word or two in a fine box under the name: what would otherwise take a column to say. */
const badge = 'inline-block px-1.5 border text-[11px] leading-[18px] whitespace-nowrap no-underline';

/**
 * Where an owner stands, as a badge under the name. New says nothing (nearly
 * every owner is New, so a column of it told nobody anything): a badge here
 * means something happened.
 */
const StatusBadge: React.FC<{ row: OutreachContact }> = ({ row }) =>
  row.status === 'new' ? null : (
    <span className={`${badge} ${statusTone(row.status)}`} data-testid="status-badge">
      {STATUS_LABEL[row.status] ?? row.status}
      {row.leadId && row.leadStage ? ` · ${LEAD_STAGE[row.leadStage] ?? row.leadStage}` : ''}
    </span>
  );

/** An owner's badge under the name, or nothing when it's New. (Research has its column: an answer is for reading, not for a tag.) */
const Badges: React.FC<{ row: OutreachContact }> = ({ row }) =>
  row.status === 'new' ? null : (
    <span className="mt-0.5 flex flex-wrap gap-1" data-testid="badges">
      <StatusBadge row={row} />
    </span>
  );

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const kindsText = (kinds: OutreachWho[]) => kinds.map((k) => KIND[k]).join(', ');
/** "DALLAS, TX 75201" under the street. */
const cityLine = (m: OutreachContact['mailing']) => [tidyCase(m.city), [m.state, m.zip?.slice(0, 5)].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/** "12 / 200 · 2 sources" under a column's name. */
const Coverage: React.FC<{ c: OutreachCoverage; of?: string }> = ({ c, of }) => (
  <span className="block normal-case tracking-normal text-[11px] text-gray-500 tabular-nums">
    {c.found} / {c.total}
    {of ? ` ${of}` : ''}
    {c.sources > 0 ? ` · ${c.sources} ${c.sources === 1 ? 'source' : 'sources'}` : ''}
  </span>
);

/** A phone's small print: its type, personal or work, whether the checker confirmed it, and the Do Not Call and litigator flags. */
export const PhoneBadges: React.FC<{ p: OutreachPhone }> = ({ p }) => {
  const kind = phoneKind(p);
  return (
    <span className="text-[11px] text-gray-500">
      {kind}
      {p.verified ? (kind ? ' · ' : '') + 'verified' : ''}
      {p.dnc ? <span className="text-red-400">{kind || p.verified ? ' · ' : ''}DNC</span> : null}
      {p.litigator ? <span className="text-red-400">{kind || p.verified || p.dnc ? ' · ' : ''}litigator</span> : null}
    </span>
  );
};

/** A lookup at work: the source it's asking now, under it the last thing found. */
export const Live: React.FC<{ cell: OutreachCell }> = ({ cell }) => {
  // Not picked up yet: once it has waited long enough to look stuck, it says it's waiting its turn, without waiting for other news.
  const [, wake] = useState(0);
  useEffect(() => {
    if (cell.asking || !cell.at) return;
    const left = QUEUED_AFTER_MS - (Date.now() - Date.parse(cell.at));
    if (left <= 0) return;
    const t = setTimeout(() => wake((n) => n + 1), left + 50);
    return () => clearTimeout(t);
  }, [cell.asking, cell.at]);
  const last = [...(cell.tries ?? [])].reverse().find((t) => t.outcome === 'hit');
  const asked = (cell.tries ?? []).filter((t) => t.outcome !== 'skipped').length;
  return (
    <span className="inline-flex flex-col" data-testid="live">
      <span className="inline-flex items-center gap-1.5 text-[#7fb0e0]">
        <span className="live-dot" aria-hidden /> {askingText(cell.asking, cell.at)}…
      </span>
      {last?.note ? (
        <span className="block max-w-[11rem] truncate text-[11px] text-gray-400">{last.note}</span>
      ) : asked > 0 ? (
        <span className="block text-[11px] text-gray-500">
          {asked} {asked === 1 ? 'source' : 'sources'} checked
        </span>
      ) : null}
    </span>
  );
};

/** The cells that just got their answer, for a moment: "id:field" while they glow. */
function useJustFilled(rows: OutreachContact[]): Set<string> {
  const before = useRef(new Map<string, OutreachCell['status']>());
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const landed: string[] = [];
    for (const r of rows) {
      for (const f of ['person', 'phone', 'email', 'research'] as OutreachField[]) {
        const key = `${r.id}:${f}`;
        const now = r.enrichment[f]?.status;
        if (before.current.get(key) === 'running' && now === 'found') landed.push(key);
        if (now) before.current.set(key, now);
      }
    }
    if (landed.length === 0) return;
    setLit((s) => new Set([...s, ...landed]));
    window.setTimeout(() => setLit((s) => new Set([...s].filter((k) => !landed.includes(k)))), 1600);
  }, [rows]);
  return lit;
}

/**
 * Looked up, nothing there. With real sources this is the common answer, not
 * the odd one, so it is the quietest thing in the table: a dash, where a
 * column of "None found" would shout over the numbers that were found. A
 * padlock still marks what hasn't been looked up, and a failure keeps its words.
 */
const Nothing: React.FC<{ title?: string }> = ({ title = 'None found' }) => (
  <span role="img" aria-label="None found" className="text-gray-600" title={title} data-testid="nothing">
    —
  </span>
);

/** A cell that hasn't a value: the lock, the wait, the miss, or the failure with its reason and a retry. */
const Empty: React.FC<{ cell: OutreachCell; onRetry?: () => void }> = ({ cell, onRetry }) => {
  switch (cell.status) {
    case 'running':
      return <Live cell={cell} />;
    case 'found':
      return <Nothing />;
    case 'none': {
      // The sources refresh monthly: once a month has gone by, the owner can be tried again, free unless something turns up.
      const from = tryAgainFrom(cell);
      return (
        <span className="flex items-center gap-2 min-w-0">
          <Nothing title={from && !dueAgain(cell) ? `None found. Can be tried again from ${from.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : undefined} />
          {onRetry && dueAgain(cell) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="shrink-0 px-2 min-h-[28px] text-xs text-[#7fb0e0] border border-[#336699] hover:bg-[#336699]/20 whitespace-nowrap"
            >
              Try again
            </button>
          )}
        </span>
      );
    }
    case 'failed':
      return (
        <span className="flex items-start gap-2 min-w-0">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-amber-300 whitespace-nowrap">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Lookup failed</span>
            </span>
            {cell.error && (
              <span className="block truncate text-[11px] text-gray-500" title={cell.error}>
                {cell.error}
              </span>
            )}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="shrink-0 px-2 min-h-[28px] text-xs text-amber-300 border border-amber-400/60 hover:bg-amber-400/10 whitespace-nowrap"
            >
              Retry
            </button>
          )}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-gray-600">
          <Lock className="w-3 h-3" /> —
        </span>
      );
  }
};

const thBase = 'font-medium px-3 py-2 whitespace-nowrap align-top overflow-hidden';
const th = thBase;
/** The name's header stays put as the rest of the header slides with the rows. */
const head = 'sticky bg-[#121212]';
const td = 'px-3 py-2 whitespace-nowrap align-top overflow-hidden text-ellipsis';
/**
 * The table's columns after the name, in order: who to reach and how, what research found, where to write, then the
 * roll's. Research is always there, straight after Email: it is something asked and paid for like a phone, so where
 * its answers land (and who has none yet) shows without scrolling to the far end or hovering a tag, which a tablet
 * can't do. Status is not a column: nearly every owner is New, so it's a badge under the name when it's anything else.
 * Name through Research is 70.5rem (1,128px), inside an iPad's 1,180 on its side; the mailing address starts there.
 */
const COLUMN_KEYS = ['person', 'phone', 'email', 'research', 'mailing', 'property', 'value', 'type', 'signals'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
/**
 * Each column's width, in rem, fixed so the table never shifts as answers
 * arrive (a lookup's narration, a phone landing): what doesn't fit is cut
 * with an ellipsis instead of widening its column.
 */
const WIDTH: Record<'name' | ColumnKey, number> = {
  name: 16,
  person: 12,
  phone: 12.5,
  email: 14,
  mailing: 14,
  property: 13,
  value: 6,
  type: 9,
  signals: 14,
  research: 16,
};
/**
 * A tablet held upright (1,024px across, 976 inside the page's margins): the first columns a little narrower, so Name
 * through Research is 61rem (976px) and fits without a swipe; the mailing address starts there. Names and emails are
 * cut with dots a little sooner for it. On its side, and on anything wider, the full widths above.
 */
export const UPRIGHT = '(max-width: 1099px)';
const UPRIGHT_WIDTH: typeof WIDTH = { ...WIDTH, name: 13, person: 10.5, email: 11.5, research: 13.5 };
/** How many owners are drawn at first, and how many more each time the end comes into view. */
export const DRAW_STEP = 200;

/**
 * A long list drawn a page at a time, so thousands of owners don't all go on
 * screen at once (slow on a tablet): more as the bottom nears, or from the
 * Show more button where the browser can't tell.
 */
function useDrawn<T>(rows: T[]) {
  const [count, setCount] = useState(DRAW_STEP);
  const end = useRef<HTMLDivElement>(null);
  const more = rows.length > count;
  useEffect(() => {
    const el = end.current;
    if (!more || !el || typeof IntersectionObserver === 'undefined') return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((n) => n + DRAW_STEP);
    }, { rootMargin: '600px 0px' });
    seen.observe(el);
    return () => seen.disconnect();
  }, [more, count]);
  const left = rows.length - count;
  const tail = more ? (
    <div ref={end} className="py-3 text-center">
      <button type="button" onClick={() => setCount((n) => n + DRAW_STEP)} className="text-sm text-[#7fb0e0] hover:text-white" data-testid="draw-more">
        Show {Math.min(left, DRAW_STEP).toLocaleString('en-US')} more of {left.toLocaleString('en-US')}
      </button>
    </div>
  ) : null;
  return { drawn: more ? rows.slice(0, count) : rows, tail };
}

/** "8 properties · $4.2M", or one property's value: what an owner holds, in a few words. */
const holding = (r: OutreachContact) => (r.properties > 1 ? `${r.properties} properties · ${shortMoney(r.totalValueCents)}` : r.property?.valueCents ? shortMoney(r.property.valueCents) : '');

/** The name stays put while the other columns scroll under it. */
const pinned = 'sticky bg-[#121212] group-hover:bg-[#1A1A1A]';
/** A person's line, over the companies they run: a shade apart from an owner's row, so it reads as the heading it is. */
const operatorRow = 'bg-[#151b23] hover:bg-[#1a222c]';
const pinnedOperator = 'sticky bg-[#151b23] group-hover:bg-[#1a222c]';
/** A small button whose touch area reaches past its words, so a finger finds it without the row growing taller. */
const reach = "relative after:absolute after:-inset-x-2 after:-inset-y-2 after:content-['']";

/** Which people's lines are open, and a way to flip one. openAll: every one (a search is on, so what it found isn't folded away). */
function useOpened(openAll: boolean) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const isOpen = (key: string) => openAll || opened.has(key);
  const toggle = (key: string) =>
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return { isOpen, toggle };
}

/** Where a person's entities stand, in a badge: all skipped, or how many are in Leads. */
const OperatorBadge: React.FC<{ op: Operator }> = ({ op }) => {
  const total = op.members.length;
  const inLeads = op.members.filter((m) => m.leadId).length;
  if (inLeads > 0)
    return (
      <span className={`${badge} ${statusTone('lead')}`} data-testid="status-badge">
        {inLeads === total ? 'In Leads' : `${inLeads} of ${total} in Leads`}
      </span>
    );
  if (op.members.every((m) => m.status === 'skip'))
    return (
      <span className={`${badge} ${statusTone('skip')}`} data-testid="status-badge">
        Skipped
      </span>
    );
  return null;
};

/** What a person's line offers once it's open: all their entities to Leads (or the lead they became), and skip them all. */
const OperatorActions: React.FC<{ op: Operator; onLeadAll?: (op: Operator) => void; onSkipAll?: (op: Operator) => void; className?: string }> = ({ op, onLeadAll, onSkipAll, className = '' }) => {
  const waiting = operatorWaiting(op).length;
  const inLeads = op.members.some((m) => m.leadId);
  const skipped = op.members.every((m) => m.status === 'skip' || m.leadId) && op.members.some((m) => m.status === 'skip');
  const stop = (act: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    act();
  };
  const small = 'px-2 min-h-[28px] text-xs whitespace-nowrap';
  return (
    <span className={`flex flex-wrap gap-2 ${className}`} data-testid="operator-actions">
      {onLeadAll && (waiting > 0 || inLeads) && (
        <button type="button" onClick={stop(() => onLeadAll(op))} className={`${small} text-white bg-[#336699] hover:bg-[#2a5580]`} data-testid="operator-lead">
          {waiting > 0 ? `Send ${waiting === op.members.length ? 'all' : waiting} to Leads` : 'Open in Leads'}
        </button>
      )}
      {onSkipAll && op.members.some((m) => !m.leadId) && (
        <button type="button" onClick={stop(() => onSkipAll(op))} aria-pressed={skipped} className={`${small} text-gray-300 border border-[#333333] hover:bg-[#2A2A2A]`} data-testid="operator-skip">
          {skipped ? 'Skipped · undo' : 'Skip all'}
        </button>
      )}
    </span>
  );
};

/**
 * The CRM: one row per owner, and where one person runs several of them, one
 * line for the person with their companies under it. What a row has comes
 * first (the person behind a company, phone, email), then where to write and
 * the roll's columns and the property's signals; the name stays pinned as the
 * rest scroll, the header stays on top as the rows scroll, and the right edge
 * fades while more columns wait. Tap a row for the sheet, a person's line to open it.
 */
/** How the owners are ordered: the list's own order, most parcels first, or A to Z. */
export type OwnerSort = 'list' | 'parcels' | 'name';
const SORT_LABEL: Record<OwnerSort, string> = { list: 'List order', parcels: 'Most parcels first', name: 'A–Z' };

export const ContactsTable: React.FC<{
  rows: OutreachContact[];
  coverage: OutreachContacts['coverage'];
  onOpen: (row: OutreachContact) => void;
  /** Run a failed field again, from the cell's Retry. */
  onRetry: (row: OutreachContact, field: OutreachField) => void;
  /** The order now, shown under Name; a tap on Name moves to the next. */
  sort?: OwnerSort;
  onSort?: () => void;
  /** What "list order" is for this list, e.g. "Most parcels first". */
  sortLabel?: string;
  /** Height of the filter bar stuck above, so the column header sticks just under it. */
  below?: number;
  /** The city an owner's property is in, when the page mixes counties. */
  placeOf?: (row: OutreachContact) => string | undefined;
  /** The person behind each owner: owners run by the same people are one line that opens to its entities. */
  operators?: Operators;
  /** Every person's line open. */
  openAll?: boolean;
  /** From a person's line: all their entities to Leads, or skipped. */
  onLeadAll?: (op: Operator) => void;
  onSkipAll?: (op: Operator) => void;
  /** "Simulated" on each row that is. The page turns it off when every result is (it says so once, above the table). */
  markSimulated?: boolean;
}> = ({ rows, coverage, onOpen, onRetry, sort = 'list', onSort, sortLabel, below = 0, placeOf, operators, openAll = false, onLeadAll, onSkipAll, markSimulated = true }) => {
  const lit = useJustFilled(rows);
  const { isOpen, toggle } = useOpened(openAll);
  const { drawn, tail } = useDrawn(ownerItems(rows, operators, isOpen));
  /** Owners whose other numbers are showing under the first. */
  const [morePhones, setMorePhones] = useState<Set<string>>(() => new Set());
  const glow = (id: string, f: OutreachField) => (lit.has(`${id}:${f}`) ? ' cell-filled' : '');
  const columns: ColumnKey[] = [...COLUMN_KEYS];
  const widths = useMediaQuery(UPRIGHT) ? UPRIGHT_WIDTH : WIDTH;
  const tableWidth = widths.name + columns.reduce((sum, k) => sum + widths[k], 0);
  const [atEnd, setAtEnd] = useState(false);
  // No fade when every column fits, or once the last one is in view.
  // The header follows the rows sideways.
  const headBox = useRef<HTMLDivElement>(null);
  const scrolled = (el: HTMLDivElement) => {
    setAtEnd(el.scrollWidth <= el.clientWidth || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    if (headBox.current) headBox.current.scrollLeft = el.scrollLeft;
  };
  const tableStyle = { width: `${tableWidth}rem`, minWidth: '100%' };
  const cols = (
    <colgroup>
      <col style={{ width: `${widths.name}rem` }} />
      {columns.map((k) => (
        <col key={k} style={{ width: `${widths[k]}rem` }} />
      ))}
    </colgroup>
  );
  const dash = <span className="text-gray-700">—</span>;

  /** One owner: on its own, or (nested) one of a person's entities, set in under their line. */
  const ownerRow = (r: OutreachContact, nested: boolean) => {
    const phone = r.phones[0];
    const email = r.emails[0];
    const more = morePhones.has(r.id);
    // Looked up and nobody to call or write to: the row goes quiet, and the mailing address is what it has.
    const quiet = nobodyToReach(r);
    return (
      <tr key={r.id} onClick={() => onOpen(r)} className="group cursor-pointer hover:bg-[#1A1A1A]" data-testid="contact-row" data-nested={nested || undefined} data-quiet={quiet || undefined}>
        <td className={`${pinned} left-0 z-10 ${td} border-r border-[#333333] max-w-[16rem] truncate ${nested ? 'pl-8 shadow-[inset_2px_0_0_rgba(51,102,153,0.7)]' : ''} ${r.status === 'skip' ? 'text-gray-500' : quiet ? 'text-gray-400' : 'text-white'}`}>
          <span className={r.status === 'skip' ? 'line-through' : undefined}>{r.name}</span>
          {/* What the owner holds, as on the cards: the list is ordered by it, so it shows by the name. */}
          {holding(r) && (
            <span className="block text-[11px] text-gray-500 tabular-nums" data-testid="holding">
              {holding(r)}
            </span>
          )}
          {r.related?.length ? (
            <span className="block text-[11px] text-gray-500" title={`Related: ${r.related.map((x) => x.name).join(', ')}`} data-testid="related">
              +{r.related.length} related
            </span>
          ) : null}
          <Known row={r} />
          {emailStateText(r.email) && (
            <span className={`block text-[11px] ${r.email?.state === 'replied' ? 'text-emerald-300' : 'text-gray-500'}`} data-testid="email-state">
              {emailStateText(r.email)}
            </span>
          )}
          <Badges row={r} />
          {markSimulated && isSimulated(r) && (
            <span className="block text-[11px] text-gray-500" title="No phone source is connected yet, so this lookup was simulated: made-up results, nothing charged." data-testid="simulated">
              Simulated
            </span>
          )}
        </td>
        <td className={`${td} max-w-[14rem] truncate${glow(r.id, 'person')}`}>
          {r.person ? (
            <>
              <span className="text-white">{r.person.name}</span>
              {r.person.title || r.person.confirmedBy?.length ? (
                <span className="block text-[11px] text-gray-500">
                  {r.person.title}
                  {r.person.confirmedBy?.length ? <span className="text-[#7fb0e0]">{r.person.title ? ' · ' : ''}{r.person.confirmedBy.length + 1} sources agree</span> : null}
                </span>
              ) : null}
            </>
          ) : r.company ? (
            <Empty cell={r.enrichment.person} onRetry={() => onRetry(r, 'person')} />
          ) : (
            dash
          )}
        </td>
        <td className={`${td}${glow(r.id, 'phone')}`}>
          {phone ? (
            <>
              <span className={phone.dnc ? 'text-gray-300' : 'text-white'}>{phoneText(phone.number)}</span>
              {r.phones.length > 1 && (
                // The owner's other numbers, counted beside the first (where the count is never cut off) and shown here in the row on a tap, without opening the sheet.
                <button
                  type="button"
                  aria-expanded={more}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMorePhones((was) => {
                      const next = new Set(was);
                      if (!next.delete(r.id)) next.add(r.id);
                      return next;
                    });
                  }}
                  className={`${reach} ml-2 text-[11px] text-[#7fb0e0] hover:text-white`}
                  data-testid="more-phones"
                >
                  {more ? 'show less' : `+${r.phones.length - 1} more`}
                </button>
              )}
              <span className="block">
                <PhoneBadges p={phone} />
              </span>
              {more &&
                r.phones.slice(1).map((p) => (
                  <span key={p.number} className="block mt-1" data-testid="other-phone">
                    <span className={callOk(p) ? 'text-gray-200' : 'text-gray-400'}>{phoneText(p.number)}</span>
                    <span className="block">
                      <PhoneBadges p={p} />
                    </span>
                  </span>
                ))}
            </>
          ) : (
            <Empty cell={r.enrichment.phone} onRetry={() => onRetry(r, 'phone')} />
          )}
        </td>
        <td className={`${td} max-w-[14rem] truncate${glow(r.id, 'email')}`}>
          {email ? (
            <>
              <span className="text-white">{email.email}</span>
              {email.verified ? <span className="block text-[11px] text-gray-500">verified</span> : null}
            </>
          ) : (
            <Empty cell={r.enrichment.email} onRetry={() => onRetry(r, 'email')} />
          )}
        </td>
        {/* What research found, two lines of it (the whole answer and its sources are in the owner's sheet, a tap away); a lock when nobody has asked. */}
        <td className={`${td}${glow(r.id, 'research')}`} data-testid="research-cell">
          {r.research ? (
            <span className="line-clamp-2 whitespace-normal text-gray-200">{r.research.answer}</span>
          ) : (
            <Empty cell={r.enrichment.research ?? { status: 'locked' }} onRetry={() => onRetry(r, 'research')} />
          )}
        </td>
        {/* With nobody to call or write to, the mailing address is how this owner is reached: it stays bright as the rest of the row goes quiet. */}
        <td className={`${td} max-w-[16rem] truncate ${quiet ? 'text-gray-100' : 'text-gray-300'}`}>
          {tidyCase(r.mailing.address) ?? ''}
          {cityLine(r.mailing) ? <span className="block text-[11px] text-gray-500">{cityLine(r.mailing)}</span> : null}
        </td>
        <td className={`${td} max-w-[14rem] truncate text-gray-300`}>
          {r.property ? tidyCase(r.property.address) : <span className="text-gray-600">{r.company ?? '—'}</span>}
          {r.properties > 1 ? <span className="text-gray-500"> +{r.properties - 1} more</span> : null}
          {placeOf?.(r) ? <span className="block text-[11px] text-gray-500" data-testid="place">{placeOf(r)}</span> : null}
        </td>
        <td className={`${td} text-right tabular-nums text-gray-300`} title={r.properties > 1 ? `${r.properties} properties in all` : undefined}>
          {r.properties > 1 ? shortMoney(r.totalValueCents) : r.property?.valueCents ? shortMoney(r.property.valueCents) : ''}
        </td>
        <td className={`${td} text-gray-400`}>{kindsText(r.kinds)}</td>
        <td className={`${td} text-amber-300`}>
          {r.signals.length === 0
            ? dash
            : r.signals.map((s, i) => (
                <span key={s.kind}>
                  {i > 0 ? ' · ' : ''}
                  {s.fresh ? <span className="mr-1 px-1 text-[10px] font-medium uppercase tracking-wide text-[#121212] bg-amber-300">New</span> : null}
                  {SIGNAL_LABEL[s.kind]} {monthYear(s.date)}
                </span>
              ))}
        </td>
      </tr>
    );
  };

  /** A person, over the companies they run: who they are and what they hold in all, the best number among their entities, and a tap to open them. */
  const personRow = (op: Operator, shown: OutreachContact[], open: boolean) => {
    const phones = operatorPhones(op);
    const emails = operatorEmails(op);
    const looking = (f: 'phone' | 'email') => op.members.find((m) => m.enrichment[f].status === 'running');
    const mailings = [...new Map(op.members.filter((m) => m.mailing.address).map((m) => [mailingLine(m.mailing), m.mailing] as const)).values()];
    const titles = [...new Set(op.members.map((m) => m.person?.title).filter(Boolean))];
    const signals = op.members.reduce((n, m) => n + m.signals.length, 0);
    const answers = op.members.filter((m) => m.research).length;
    return (
      <tr key={`operator:${op.key}`} onClick={() => toggle(op.key)} className={`group cursor-pointer ${operatorRow}`} data-testid="operator-row">
        <td className={`${pinnedOperator} left-0 z-10 ${td} border-r border-[#333333] max-w-[16rem]`}>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              toggle(op.key);
            }}
            className="flex w-full min-w-0 items-start gap-1.5 text-left"
            data-testid="operator-toggle"
          >
            <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-medium text-white" data-testid="operator-name">
                {op.label}
              </span>
              {/* What this person controls across their companies: the line a row per LLC can't say. */}
              <span className="block truncate text-[11px] text-[#7fb0e0] tabular-nums" data-testid="operator-holding">
                {operatorHolding(op)}
              </span>
              {shown.length < op.members.length && (
                <span className="block text-[11px] text-gray-500" data-testid="operator-showing">
                  {shown.length} of {op.members.length} showing
                </span>
              )}
            </span>
          </button>
          <span className="mt-0.5 flex flex-wrap gap-1 pl-[22px] empty:hidden">
            <OperatorBadge op={op} />
          </span>
          {open && <OperatorActions op={op} onLeadAll={onLeadAll} onSkipAll={onSkipAll} className="mt-1.5 pl-[22px]" />}
        </td>
        <td className={`${td} max-w-[14rem] truncate text-gray-300`} data-testid="operator-basis">
          {operatorBasis(op)}
          {titles.length > 0 && <span className="block text-[11px] text-gray-500">{titles.join(', ')}</span>}
        </td>
        <td className={td}>
          {phones[0] ? (
            <>
              <span className={callOk(phones[0]) ? 'text-white' : 'text-gray-300'}>{phoneText(phones[0].number)}</span>
              {phones.length > 1 ? <span className="ml-2 text-[11px] text-gray-500">+{phones.length - 1} more</span> : null}
              <span className="block">
                <PhoneBadges p={phones[0]} />
              </span>
            </>
          ) : looking('phone') ? (
            <Live cell={looking('phone')!.enrichment.phone} />
          ) : (
            dash
          )}
        </td>
        <td className={`${td} max-w-[14rem] truncate`}>
          {emails[0] ? (
            <>
              <span className="text-white">{emails[0].email}</span>
              {emails.length > 1 ? <span className="block text-[11px] text-gray-500">+{emails.length - 1} more</span> : null}
            </>
          ) : looking('email') ? (
            <Live cell={looking('email')!.enrichment.email} />
          ) : (
            dash
          )}
        </td>
        <td className={`${td} text-gray-400`}>{answers > 0 ? `${answers} researched` : dash}</td>
        <td className={`${td} max-w-[16rem] truncate text-gray-300`}>
          {mailings.length === 1 ? (
            <>
              {tidyCase(mailings[0].address) ?? ''}
              {cityLine(mailings[0]) ? <span className="block text-[11px] text-gray-500">{cityLine(mailings[0])}</span> : null}
            </>
          ) : mailings.length > 1 ? (
            `${mailings.length} mailing addresses`
          ) : (
            dash
          )}
        </td>
        <td className={`${td} text-gray-300 tabular-nums`}>
          {op.properties.toLocaleString('en-US')} {op.properties === 1 ? 'property' : 'properties'}
        </td>
        <td className={`${td} text-right tabular-nums text-white`}>{op.totalValueCents > 0 ? shortMoney(op.totalValueCents) : ''}</td>
        <td className={`${td} text-gray-400`}>{kindsText([...new Set(op.members.flatMap((m) => m.kinds))])}</td>
        <td className={`${td} text-amber-300`}>{signals > 0 ? `${signals} ${signals === 1 ? 'signal' : 'signals'}` : dash}</td>
      </tr>
    );
  };

  // Up and down is the page's scroll and sideways is the table's, so a slanted swipe moves one way, not both.
  // The header is its own strip: it sticks under the top bar and the filters as the page scrolls and is moved sideways with the rows.
  return (
    <div className="relative bg-[#121212] border border-[#333333]" data-testid="contacts-table">
      <div
        ref={headBox}
        className="sticky top-[calc(69px_+_var(--below))] md:top-[var(--below)] z-20 overflow-hidden bg-[#121212] border-b border-[#333333]"
        style={{ '--below': `${below}px` } as React.CSSProperties}
      >
        <table className="text-sm table-fixed" style={tableStyle} aria-label="Contacts columns">
          {cols}
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className={`${head} left-0 z-30 ${thBase} border-r border-[#333333]`} aria-sort={sort === 'name' ? 'ascending' : 'none'}>
                {onSort ? (
                  <button type="button" onClick={onSort} className="group/sort flex items-center gap-1 text-left uppercase tracking-wide hover:text-white" title="Tap to change the order" data-testid="name-sort">
                    <span>
                      Name
                      <span className={`block normal-case tracking-normal text-[11px] ${sort === 'list' ? 'text-gray-500' : 'text-[#7fb0e0]'}`}>{sort === 'list' ? (sortLabel ?? SORT_LABEL.list) : SORT_LABEL[sort]}</span>
                    </span>
                    <ArrowUpDown className="w-3.5 h-3.5 shrink-0 self-start text-gray-500 group-hover/sort:text-white" aria-hidden />
                  </button>
                ) : (
                  'Name'
                )}
              </th>
              <th className={th}>
                Decision maker
                <Coverage c={coverage.person} of={coverage.person.total === 1 ? 'company' : 'companies'} />
              </th>
              <th className={th}>
                Phone
                <Coverage c={coverage.phone} />
              </th>
              <th className={th}>
                Email
                <Coverage c={coverage.email} />
              </th>
              <th className={th}>
                Research
                <Coverage c={coverage.research} />
              </th>
              <th className={th}>Mailing address</th>
              <th className={th}>Property</th>
              <th className={`${th} text-right`}>Value</th>
              <th className={th}>Type</th>
              <th className={th}>Signals</th>
            </tr>
          </thead>
        </table>
      </div>
      <div className="overflow-x-auto overscroll-x-contain" onScroll={(e) => scrolled(e.currentTarget)} ref={(el) => el && scrolled(el)}>
        <table className="text-sm table-fixed" style={tableStyle} aria-label="Contacts">
          {cols}
          <tbody className="divide-y divide-[#333333]">{drawn.map((item) => (item.kind === 'operator' ? personRow(item.op, item.shown, item.open) : ownerRow(item.row, Boolean(item.op))))}</tbody>
        </table>
      </div>
      {tail}
      {/* More columns wait to the right: a fade says so until the end is reached. */}
      {!atEnd && <div aria-hidden className="table-fade pointer-events-none absolute inset-y-px right-px w-8" data-testid="more-columns" />}
    </div>
  );
};

/**
 * The list for calling from a phone: one card per owner, stacked, and one
 * card for a person who runs several, with their companies inside it. The
 * decision maker, the best number, a signal if the property has one, and one
 * row of actions: Call, Text and Email as icons, and To Leads. Skip sits small
 * in the corner. Tap the card for the full sheet.
 */
/** "Already a client", "Already in Leads as Kai Moana": someone the company has, so a send joins them rather than making a second. */
const knownText = (k: NonNullable<OutreachContact['known']>, owner: string) => `${k.kind === 'client' ? 'Already a client' : 'Already in Leads'}${k.name.toLowerCase() === owner.toLowerCase() ? '' : `: ${k.name}`}`;
const Known: React.FC<{ row: OutreachContact; className?: string }> = ({ row, className = '' }) =>
  row.known && !row.leadId ? (
    <span className={`block text-[11px] text-[#7fb0e0] ${className}`} data-testid="known">
      {knownText(row.known, row.name)}
    </span>
  ) : null;

export const ContactCards: React.FC<{
  rows: OutreachContact[];
  onOpen: (row: OutreachContact) => void;
  onStatus: (row: OutreachContact, status: OutreachRowStatus) => Promise<void>;
  onRetry: (row: OutreachContact, field: OutreachField) => void;
  /** Send them to Leads, or open the lead they became. */
  onLead: (row: OutreachContact) => void;
  /** The city an owner's property is in, when the page mixes counties. */
  placeOf?: (row: OutreachContact) => string | undefined;
  /** The person behind each owner: owners run by the same people share one card that opens to its entities. */
  operators?: Operators;
  openAll?: boolean;
  onLeadAll?: (op: Operator) => void;
  onSkipAll?: (op: Operator) => void;
}> = ({ rows, onOpen, onStatus, onRetry, onLead, placeOf, operators, openAll = false, onLeadAll, onSkipAll }) => {
  const [saving, setSaving] = useState<string | null>(null);
  const lit = useJustFilled(rows);
  const { isOpen, toggle } = useOpened(openAll);
  const { drawn, tail } = useDrawn(ownerItems(rows, operators, isOpen));
  const skip = async (row: OutreachContact) => {
    setSaving(row.id);
    try {
      // Skip again puts them back.
      await onStatus(row, row.status === 'skip' ? 'new' : 'skip');
    } catch {
      // The sheet shows errors; a card just stays as it was.
    } finally {
      setSaving(null);
    }
  };
  const big = 'flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] text-sm font-medium';
  const square = 'w-11 h-11 shrink-0 inline-flex items-center justify-center border border-[#333333] text-gray-200 hover:bg-[#2A2A2A]';

  const ownerCard = (r: OutreachContact) => {
    const call = r.phones.find(callOk);
    const text = r.phones.find((p) => callOk(p) && p.type === 'mobile');
    const email = r.emails.find((e) => e.nameMatch !== false) ?? r.emails[0];
    const signal = r.signals[0];
    // Looked up, nobody to call or write to: one quiet line and where the mail goes, instead of a line per miss.
    const quiet = nobodyToReach(r);
    const mail = mailingLine(r.mailing);
    return (
      <li key={r.id} className={`relative bg-[#121212] border border-[#333333]${['person', 'phone', 'email'].some((f) => lit.has(`${r.id}:${f}`)) ? ' cell-filled' : ''}`} data-testid="contact-card" data-quiet={quiet || undefined}>
        {!r.leadId && (
          <button
            type="button"
            onClick={() => void skip(r)}
            disabled={saving === r.id}
            aria-pressed={r.status === 'skip'}
            className={`absolute top-1 right-1 z-10 px-3 min-h-[40px] text-xs disabled:opacity-50 ${r.status === 'skip' ? 'text-gray-300' : 'text-gray-500 hover:text-white'}`}
          >
            {r.status === 'skip' ? 'Skipped' : 'Skip'}
          </button>
        )}
        <button type="button" onClick={() => onOpen(r)} className="block w-full text-left pl-4 pr-20 pt-3 pb-2">
          <span className={`block text-[15px] font-medium ${r.status === 'skip' ? 'text-gray-500 line-through' : quiet ? 'text-gray-300' : 'text-white'}`}>{r.name}</span>
          <span className="block text-xs text-gray-500">
            {holding(r) || (tidyCase(r.property?.address) ?? r.company ?? '')}
            {placeOf?.(r) ? ` · ${placeOf(r)}` : ''}
            {r.related?.length ? ` · +${r.related.length} related` : ''}
          </span>
          {emailStateText(r.email) && <span className={`block text-xs ${r.email?.state === 'replied' ? 'text-emerald-300' : 'text-gray-500'}`} data-testid="email-state">{emailStateText(r.email)}</span>}
          <Known row={r} className="mt-0.5 text-xs" />
          {signal && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> {signal.fresh ? <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-[#121212] bg-amber-300">New</span> : null} {SIGNAL_LABEL[signal.kind]} {monthYear(signal.date)}
            </span>
          )}
          {quiet ? (
            <span className="block mt-2 text-sm text-gray-500" data-testid="nobody-to-reach">
              {r.person ? (
                <span className="block text-gray-300">
                  {r.person.name}
                  {r.person.title ? <span className="text-gray-500"> · {r.person.title}</span> : null}
                </span>
              ) : null}
              {r.phones.length > 0 ? 'No number that can be called, no email' : 'No number or email found'}
              {mail ? (
                <span className="block text-gray-300">
                  <span className="text-gray-500">Mail to</span> {mail}
                </span>
              ) : null}
            </span>
          ) : (
            <>
              {r.company && (
                <span className="block mt-2 text-sm">
                  {r.person ? (
                    <>
                      <span className="text-gray-200">{r.person.name}</span>
                      {r.person.title ? <span className="text-gray-500"> · {r.person.title}</span> : null}
                    </>
                  ) : r.enrichment.person.status === 'running' ? (
                    <Live cell={r.enrichment.person} />
                  ) : (
                    <span className="text-gray-500">Decision maker: {r.enrichment.person.status === 'none' ? 'none found' : 'not looked up'}</span>
                  )}
                </span>
              )}
              <span className="block mt-1 text-sm">
                {r.phones[0] ? (
                  // One line always: the number and "+1 more" keep their width, and what's said about the line gives way (cut with dots) on a narrow phone.
                  <span className="flex items-baseline gap-1.5" data-testid="card-phone">
                    <span className={`shrink-0 whitespace-nowrap ${callOk(r.phones[0]) ? 'text-white' : 'text-gray-400'}`}>{phoneText((call ?? r.phones[0]).number)}</span>
                    <span className="min-w-0 truncate">
                      <PhoneBadges p={call ?? r.phones[0]} />
                    </span>
                    {r.phones.length > 1 ? <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-500">· +{r.phones.length - 1} more</span> : null}
                  </span>
                ) : r.enrichment.phone.status === 'failed' ? null : r.enrichment.phone.status === 'running' ? (
                  <Live cell={r.enrichment.phone} />
                ) : (
                  <span className="text-gray-500">Phone: {r.enrichment.phone.status === 'none' ? 'none found' : 'not looked up'}</span>
                )}
              </span>
            </>
          )}
        </button>
        {!r.phones[0] && r.enrichment.phone.status === 'failed' && (
          <div className="px-4 pb-2 text-sm">
            <Empty cell={r.enrichment.phone} onRetry={() => onRetry(r, 'phone')} />
          </div>
        )}
        <div className="flex gap-2 px-4 pb-3" data-testid="card-actions">
          {call && (
            <a href={`tel:${call.number}`} className={`${big} bg-[#336699] hover:bg-[#2a5580] text-white`} data-testid="card-call">
              <Phone className="w-4 h-4" /> Call
            </a>
          )}
          {text && (
            <a href={`sms:${text.number}`} aria-label="Text" title="Text" className={square}>
              <MessageSquare className="w-4 h-4" />
            </a>
          )}
          {email && (
            <a href={`mailto:${email.email}`} aria-label="Email" title="Email" className={square}>
              <Mail className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onLead(r)}
            disabled={saving === r.id}
            className={`${call ? 'shrink-0 px-3' : 'flex-1'} inline-flex items-center justify-center gap-1.5 min-h-[44px] text-sm border disabled:opacity-50 ${
              r.leadId ? 'text-[#7fb0e0] border-[#336699]/50 bg-[#336699]/15' : 'text-gray-200 border-[#333333] hover:bg-[#2A2A2A]'
            }`}
            data-testid="to-leads"
          >
            {r.leadId ? (r.leadStage ? (LEAD_STAGE[r.leadStage] ?? 'In Leads') : 'In Leads') : 'To Leads'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </li>
    );
  };

  /** A person who runs several of the owners: one card, one call. Their companies are inside it, a tap away. */
  const personCard = (op: Operator, shown: OutreachContact[], open: boolean) => {
    const phones = operatorPhones(op);
    const call = phones.find(callOk);
    const text = phones.find((p) => callOk(p) && p.type === 'mobile');
    const email = operatorEmails(op)[0];
    const waiting = operatorWaiting(op).length;
    const inLeads = op.members.some((m) => m.leadId);
    const skipped = op.members.every((m) => m.status === 'skip' || m.leadId) && op.members.some((m) => m.status === 'skip');
    return (
      <li key={`operator:${op.key}`} className="relative bg-[#151b23] border border-[#336699]/50" data-testid="operator-card">
        {onSkipAll && op.members.some((m) => !m.leadId) && (
          <button type="button" onClick={() => onSkipAll(op)} aria-pressed={skipped} className={`absolute top-1 right-1 z-10 px-3 min-h-[40px] text-xs ${skipped ? 'text-gray-300' : 'text-gray-500 hover:text-white'}`} data-testid="operator-skip">
            {skipped ? 'Skipped' : 'Skip all'}
          </button>
        )}
        <button type="button" aria-expanded={open} onClick={() => toggle(op.key)} className="block w-full text-left pl-4 pr-20 pt-3 pb-2" data-testid="operator-toggle">
          <span className="flex items-center gap-1.5 text-[15px] font-medium text-white">
            <ChevronRight className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
            <span className="truncate" data-testid="operator-name">
              {op.label}
            </span>
          </span>
          <span className="block text-xs text-[#7fb0e0] tabular-nums" data-testid="operator-holding">
            {operatorHolding(op)}
          </span>
          <span className="block text-xs text-gray-500">
            {operatorBasis(op)}
            {shown.length < op.members.length ? ` · ${shown.length} of ${op.members.length} showing` : ''}
          </span>
          <span className="mt-1 flex flex-wrap gap-1 empty:hidden">
            <OperatorBadge op={op} />
          </span>
          <span className="block mt-1 text-sm">
            {phones[0] ? (
              <>
                <span className={call ? 'text-white' : 'text-gray-400'}>{phoneText((call ?? phones[0]).number)}</span> <PhoneBadges p={call ?? phones[0]} />
                {phones.length > 1 ? <span className="text-[11px] text-gray-500"> · +{phones.length - 1} more</span> : null}
              </>
            ) : (
              <span className="text-gray-500">No number for any of them yet</span>
            )}
          </span>
        </button>
        <div className="flex gap-2 px-4 pb-3" data-testid="card-actions">
          {call && (
            <a href={`tel:${call.number}`} className={`${big} bg-[#336699] hover:bg-[#2a5580] text-white`} data-testid="card-call">
              <Phone className="w-4 h-4" /> Call
            </a>
          )}
          {text && (
            <a href={`sms:${text.number}`} aria-label="Text" title="Text" className={square}>
              <MessageSquare className="w-4 h-4" />
            </a>
          )}
          {email && (
            <a href={`mailto:${email.email}`} aria-label="Email" title="Email" className={square}>
              <Mail className="w-4 h-4" />
            </a>
          )}
          {onLeadAll && (waiting > 0 || inLeads) && (
            <button
              type="button"
              onClick={() => onLeadAll(op)}
              className={`${call ? 'shrink-0 px-3' : 'flex-1'} inline-flex items-center justify-center gap-1.5 min-h-[44px] text-sm border ${
                waiting === 0 ? 'text-[#7fb0e0] border-[#336699]/50 bg-[#336699]/15' : 'text-gray-200 border-[#333333] hover:bg-[#2A2A2A]'
              }`}
              data-testid="operator-lead"
            >
              {waiting > 0 ? 'To Leads' : 'In Leads'} <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
        {open && (
          <ul className="space-y-2 border-t border-[#336699]/40 p-2" data-testid="operator-entities">
            {shown.map(ownerCard)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <ul className="space-y-2" data-testid="contact-cards">
        {/* A person's entities are drawn inside their card, so the list itself holds only people and owners on their own. */}
        {drawn.map((item) => (item.kind === 'operator' ? personCard(item.op, item.shown, item.open) : item.op ? null : ownerCard(item.row)))}
      </ul>
      {tail}
    </>
  );
};

const dollarsOrFree = (cents?: number) => (cents ? dollars(cents) : 'free');
/** Any of the owner's results came from the simulated chain (no phone source connected yet). */
/** The ledger's name for a source. */
const LEDGER_NAME: Record<string, string> = { claude: 'The web, read by Claude' };
const ledgerName = (s: string) => LEDGER_NAME[s] ?? sourceName(s);
const TRY_ICON: Record<OutreachTry['outcome'], React.ReactNode> = {
  hit: <CheckCircle2 className="w-4 h-4 text-[#7fb0e0]" />,
  miss: <MinusCircle className="w-4 h-4 text-gray-500" />,
  error: <AlertTriangle className="w-4 h-4 text-amber-300" />,
  skipped: <Circle className="w-4 h-4 text-gray-700" />,
};
const STEP_TITLE: Record<OutreachField, string> = { person: 'Person behind the company', phone: 'Phone', email: 'Email', research: 'Research' };

/** What a step came to, for the badge at its right. */
const stepBadge = (c: OutreachCell) =>
  c.status === 'found' ? `Found · ${c.simulated ? 'simulated' : dollarsOrFree(c.chargedCents)}` : c.status === 'none' ? 'None · free' : c.status === 'failed' ? 'Failed · free' : c.status === 'running' ? 'Looking…' : 'Not looked up';

/**
 * How we found it: each step that has run, with every source's turn in
 * order, what it said, and what the owner cost in all. The numbers follow
 * from one.
 */
const HowFound: React.FC<{ row: OutreachContact }> = ({ row }) => {
  const steps: Array<{ field: OutreachField; cell: OutreachCell }> = [
    ...(row.company ? [{ field: 'person' as const, cell: row.enrichment.person }] : []),
    { field: 'phone' as const, cell: row.enrichment.phone },
    { field: 'email' as const, cell: row.enrichment.email },
    ...(row.enrichment.research && row.enrichment.research.status !== 'locked' ? [{ field: 'research' as const, cell: row.enrichment.research }] : []),
  ].filter((s) => s.cell.status !== 'locked');
  if (steps.length === 0) return null;
  const cost = steps.reduce((sum, s) => sum + (s.cell.chargedCents ?? 0), 0);
  const label = 'text-xs font-medium text-gray-400 uppercase tracking-wider';
  return (
    <div className="py-3" data-testid="how-found">
      <div className={label}>How we found it</div>
      <p className="text-xs text-gray-500">
        Each step tries its sources in order and stops at the first match. This owner cost {dollars(cost)}.
      </p>
      {steps.some((s) => s.cell.simulated) && (
        <p className="mt-1 text-xs text-amber-300" data-testid="simulated-note">
          Simulated: no phone source is connected yet, so every source took its turn with made-up answers. Nothing was charged.
        </p>
      )}
      <ol className="mt-2 space-y-3">
        {steps.map((s, i) => (
          <li key={s.field}>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center border border-[#333333] text-[11px] text-gray-400 tabular-nums">{i + 1}</span>
              <span className="text-white">{STEP_TITLE[s.field]}</span>
              <span className={`ml-auto text-xs ${s.cell.status === 'found' ? 'text-[#7fb0e0]' : s.cell.status === 'failed' ? 'text-amber-300' : 'text-gray-500'}`}>{stepBadge(s.cell)}</span>
            </div>
            {s.cell.tries && s.cell.tries.length > 0 ? (
              <ul className="mt-1 ml-2 border-l border-[#333333] pl-4 space-y-1.5">
                {s.cell.tries.map((t, j) => (
                  <li key={`${t.source}-${j}`} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0">{TRY_ICON[t.outcome]}</span>
                    <span className="min-w-0">
                      <span className={t.outcome === 'skipped' ? 'text-gray-500' : 'text-gray-200'}>{ledgerName(t.source)}</span>
                      {t.note && <span className="block text-xs text-gray-500 break-words">{t.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : s.cell.status === 'running' ? (
              <p className="mt-1 ml-2 border-l border-[#333333] pl-4 text-xs text-gray-500">Asking the sources now…</p>
            ) : s.cell.status === 'failed' ? (
              <p className="mt-1 ml-2 border-l border-[#333333] pl-4 text-xs text-amber-300">{s.cell.error ?? "The lookup didn't go through."}</p>
            ) : s.cell.source ? (
              <p className="mt-1 ml-2 border-l border-[#333333] pl-4 text-xs text-gray-500">From {ledgerName(s.cell.source)}, before the ledger was kept.</p>
            ) : (
              <p className="mt-1 ml-2 border-l border-[#333333] pl-4 text-xs text-gray-500">No source had it.</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};

/** One owner: the person behind the company, the phones ranked with their flags, the emails, both addresses in Apple Maps, the status, a note. */
/**
 * Another try at a "none found": the sources refresh monthly, so the sheet
 * says when one is due, and offers it now anyway for this one owner.
 */
const TryAgain: React.FC<{ cell: OutreachCell; onClick: () => void; disabled: boolean; note: string; className: string }> = ({ cell, onClick, disabled, note, className }) => {
  const from = tryAgainFrom(cell);
  const day = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <div className="space-y-1">
      <button type="button" onClick={onClick} disabled={disabled} className={className} data-testid="try-again">
        <RotateCw className="w-4 h-4" /> Try again · {note}
      </button>
      {from && !dueAgain(cell) && <p className="text-xs text-gray-500">The sources refresh monthly, so a new try is most likely to turn something up after {day(from)}.</p>}
    </div>
  );
};

export const ContactSheet: React.FC<{
  row: OutreachContact | null;
  unlockCents: number;
  researchCents: number;
  researchQuestion: string;
  balanceCents: number;
  /** Phones the company can still find free; while there are any, a lookup needs no balance. */
  freeLookups?: number;
  onClose: () => void;
  onStatus: (row: OutreachContact, status: OutreachRowStatus, note: string) => Promise<void>;
  onEnrich: (row: OutreachContact, fields: OutreachField[], question?: string) => Promise<void>;
  onAddFunds: () => void;
  onLead: (row: OutreachContact) => void;
  /** The county the owner's property is in (its list's), for the address's city and the county's deed records. */
  county?: string;
  /** For the owner's emails from Outreach, and "Email" drafting one. */
  organizationId?: string;
  onEmail?: (row: OutreachContact) => void;
  /** The person this owner is one of several entities of, with the others. */
  operator?: Operator;
  /** Something real ties them (not a simulated result), so a send to Leads makes one lead of them. */
  oneLead?: boolean;
  /** Opens another of the person's entities. */
  onOpenOwner?: (row: OutreachContact) => void;
}> = ({ row, unlockCents, researchCents, researchQuestion, balanceCents, freeLookups = 0, onClose, onStatus, onEnrich, onAddFunds, onLead, county, organizationId, onEmail, operator, oneLead = false, onOpenOwner }) => {
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState(researchQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The note was just saved: a quiet word under it says so. */
  const [saved, setSaved] = useState(false);
  // The note and owner as they are now, for closing: the drawer's Escape handler holds on to the first close it was given.
  const now = useRef({ note, row });
  now.current = { note, row };
  useEffect(() => {
    setSaved(false);
    setNote(row?.note ?? '');
    setQuestion(row?.research?.question ?? researchQuestion);
    setError(null);
  }, [row, researchQuestion]);
  if (!row) return null;
  const run = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };
  const set = (status: OutreachRowStatus) => run(() => onStatus(row, status, note), "Couldn't save that");
  const noteChanged = note !== (row.note ?? '');
  const saveNote = () =>
    run(async () => {
      await onStatus(row, row.status, note);
      setSaved(true);
    }, "Couldn't save the note");
  // However the sheet is closed (X, Escape, a tap outside, which on an iPad doesn't take the focus off the note), a changed note is kept.
  const close = () => {
    const { note: typed, row: owner } = now.current;
    if (owner && typed !== (owner.note ?? '')) void onStatus(owner, owner.status, typed).catch(() => {});
    onClose();
  };
  const enrich = (fields: OutreachField[], asked?: string) => run(() => onEnrich(row, fields, asked), "Couldn't start that");
  const property = row.property ? fullAddress(tidyCase(row.property.address), cityOf(county), 'TX') : undefined;
  const deeds = deedSearch(row.name, knownCounty(county));
  const mailing = row.mailing.address ? fullAddress(tidyCase(row.mailing.address), tidyCase(row.mailing.city), row.mailing.state, row.mailing.zip?.slice(0, 5)) : undefined;
  const realtor = row.kinds.includes('realtor');
  const link = 'inline-flex items-center gap-2 text-[15px] text-[#7fb0e0] min-h-[44px]';
  const label = 'text-xs font-medium text-gray-400 uppercase tracking-wider';
  const primary = 'inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50';
  const quiet = 'inline-flex items-center gap-2 px-3 min-h-[40px] text-sm text-gray-300 border border-[#333333] hover:bg-[#2A2A2A] disabled:opacity-50';
  const { phone, email, person } = row.enrichment;
  const research = row.enrichment.research ?? { status: 'locked' as const };
  const contactOpen = phone.status !== 'found' && phone.status !== 'running' && email.status !== 'running';
  const free = freeLookups > 0;
  const canPay = free || balanceCents >= unlockCents;
  const canResearch = balanceCents >= researchCents;
  const when = (c: OutreachCell) => (c.at ? ` ${new Date(c.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '');
  // The buttons: the best number not on the Do Not Call list; a text only to a mobile.
  const callable = row.phones.find(callOk);
  const textable = row.phones.find((p) => callOk(p) && p.type === 'mobile');
  // The Email button goes to an address the contact check didn't say belongs to someone else.
  const email0 = row.emails.find((e) => e.nameMatch !== false) ?? row.emails[0];
  return (
    <SlideOutDrawer isOpen onClose={close} title={row.name} width="md">
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-300">
          {row.why}
          {row.kinds.length ? <span className="text-gray-500"> · {row.kinds.map((k) => WHO_LABEL[k]).join(', ')}</span> : null}
        </p>
        {operator ? (
          <div className="border-l-2 border-[#336699] pl-3 text-sm" data-testid="operator-sheet">
            <div className="text-white">
              {operator.label}
              <span className="text-gray-400 text-[13px]" data-testid="operator-holding">
                {operatorHolding(operator)
                  .split(' · ')
                  .map((part) => (
                    <span key={part} className="whitespace-nowrap">
                      {' '}
                      · {part}
                    </span>
                  ))}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {operatorBasis(operator)}. {oneLead ? 'One person to call: sent to Leads, these become one lead.' : 'Tied by a simulated lookup, so each still goes to Leads on its own.'}
            </div>
            <ul className="pt-1">
              {operator.members
                .filter((m) => m.id !== row.id)
                .map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => onOpenOwner?.(m)} className="min-h-[36px] text-left text-[#7fb0e0] hover:text-white" data-testid="operator-sibling">
                      {m.name}
                      <span className="text-gray-500 text-xs whitespace-nowrap">
                        {' '}
                        · {m.properties} {m.properties === 1 ? 'property' : 'properties'}
                        {m.leadId ? ' · in Leads' : m.status === 'skip' ? ' · skipped' : ''}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : row.related?.length ? (
          <p className="text-sm text-gray-400" data-testid="related-sheet">
            Related: {row.related.map((x) => x.name).join(', ')}
            <span className="block text-xs text-gray-500">Likely one operator. Once one is looked up, the others copy the same person's phone and email free.</span>
          </p>
        ) : null}
        <div className="divide-y divide-[#333333] border-y border-[#333333]">
          {row.company && (
            <div className="py-3" data-testid="decision-maker">
              <div className={label}>Decision maker</div>
              {row.person ? (
                <div className="flex items-start gap-2 pt-1">
                  <User className="w-4 h-4 mt-1 text-gray-500 shrink-0" />
                  <div>
                    <div className="text-[15px] text-white">
                      {row.person.name}
                      {row.person.title ? <span className="text-gray-400"> · {row.person.title}</span> : null}
                    </div>
                    {row.person.address && <div className="text-sm text-gray-400">{oneLineAddress(row.person.address)}</div>}
                    <div className="text-xs text-gray-500">
                      From {sourceName(row.person.source)}
                      {row.person.confirmedBy?.length ? <span className="text-[#7fb0e0]"> · also named by {sourceList(row.person.confirmedBy)}</span> : null}
                      {when(person)}
                    </div>
                  </div>
                </div>
              ) : person.status === 'running' ? (
                <p className="text-sm text-gray-400">Looking up the company's officers…</p>
              ) : person.status === 'none' ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">The state lists no officer for this company.</p>
                  <TryAgain cell={person} onClick={() => enrich(['person'])} disabled={busy} note="Free" className={quiet} />
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {person.status === 'failed' && <p className="text-sm text-amber-300">{person.error ?? "The lookup didn't go through."}</p>}
                  <button type="button" onClick={() => enrich(['person'])} disabled={busy} className={quiet}>
                    <User className="w-4 h-4" /> Find the person behind the company · free
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="py-3" data-testid="contact-details">
            <div className={label}>Phone & email</div>
            {row.phones.length > 0 || row.emails.length > 0 ? (
              <ul className="space-y-1">
                {row.phones.map((p) => (
                  <li key={p.number} className="flex items-baseline gap-2" data-testid="sheet-phone">
                    {/* The number is never broken over two lines: what's said about it wraps beside it instead. */}
                    {callOk(p) ? (
                      <a href={`tel:${p.number}`} className={`${link} whitespace-nowrap shrink-0`}>
                        {phoneText(p.number)}
                      </a>
                    ) : (
                      <span className="text-[15px] text-gray-300 min-h-[44px] inline-flex items-center whitespace-nowrap shrink-0">{phoneText(p.number)}</span>
                    )}
                    <span className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                      <PhoneBadges p={p} />
                      {p.name && <span className="text-xs text-gray-500">line in the name of {p.name}</span>}
                      {p.dnc && <span className="text-xs text-red-400">on the Do Not Call list</span>}
                      {p.litigator && <span className="text-xs text-red-400">known TCPA litigator</span>}
                    </span>
                  </li>
                ))}
                {row.emails.map((e) => (
                  <li key={e.email} data-testid="sheet-email">
                    {/* A long address breaks onto a second line rather than running off the sheet. */}
                    <a href={`mailto:${e.email}`} className={`${link} max-w-full break-all`}>
                      {e.email}
                    </a>
                    {e.verified && <span className="text-[11px] text-gray-500"> verified</span>}
                    {e.nameMatch === true && <span className="text-[11px] text-gray-500"> · in the owner's name</span>}
                    {e.nameMatch === false && <span className="text-[11px] text-amber-300"> · not in the owner's name</span>}
                  </li>
                ))}
                {row.phones.length === 0 && <li className="text-sm text-gray-500">No phone found; the email was free.</li>}
                <li className="text-xs text-gray-500">
                  From {sourceName(phone.source ?? email.source ?? '')}
                  {when(phone.status === 'found' ? phone : email)}
                  {phone.chargedCents ? ` · ${dollars(phone.chargedCents)}` : ''}
                </li>
                {(callable || textable || email0) && (
                  <li className="flex gap-2 pt-2" data-testid="reach">
                    {callable && (
                      <a href={`tel:${callable.number}`} className={`${primary} flex-1 justify-center`}>
                        <Phone className="w-4 h-4" /> Call
                      </a>
                    )}
                    {textable && (
                      <a href={`sms:${textable.number}`} className={`${quiet} flex-1 justify-center min-h-[44px]`}>
                        <MessageSquare className="w-4 h-4" /> Text
                      </a>
                    )}
                    {email0 &&
                      (onEmail && !row.email ? (
                        // An email from Outreach: the AI drafts it, you approve, it goes from your Gmail.
                        <button type="button" onClick={() => onEmail(row)} className={`${quiet} flex-1 justify-center min-h-[44px]`} data-testid="email-owner">
                          <Mail className="w-4 h-4" /> Email
                        </button>
                      ) : (
                        <a href={`mailto:${email0.email}`} className={`${quiet} flex-1 justify-center min-h-[44px]`}>
                          <Mail className="w-4 h-4" /> Email
                        </a>
                      ))}
                  </li>
                )}
              </ul>
            ) : phone.status === 'running' || email.status === 'running' ? (
              <p className="text-sm text-gray-400">Looking up the phone and email… this takes a few seconds.</p>
            ) : phone.status === 'none' ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">No phone or email found for this owner. Nothing was charged. The mailing address below still reaches them.</p>
                <TryAgain cell={phone} onClick={() => enrich(['phone', 'email'])} disabled={busy || !canPay} note={free ? 'free' : `${dollars(unlockCents)} only if a phone is found`} className={quiet} />
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {phone.status === 'failed' && <p className="text-sm text-amber-300">{phone.error ?? "The lookup didn't go through."} Nothing was charged.</p>}
                {/* Short of money, the same button adds it, as the page's own does. */}
                <button
                  type="button"
                  onClick={() => (canPay ? enrich(row.company ? ['person', 'phone', 'email'] : ['phone', 'email']) : onAddFunds())}
                  disabled={busy || !contactOpen}
                  className={primary}
                >
                  <Lock className="w-4 h-4" /> {canPay ? 'Unlock phone & email' : 'Add funds to unlock'} · {free ? 'free' : dollars(unlockCents)}
                </button>
                <p className="text-xs text-gray-500" data-testid="unlock-terms">
                  {free
                    ? freeLookups === 1
                      ? `Your last free lookup, used only if a phone is found. After it, ${dollars(unlockCents)} a phone.`
                      : `One of your ${freeLookups} free lookups, used only if a phone is found. After those, ${dollars(unlockCents)} a phone.`
                    : `Charged only when a phone is found. Balance ${dollars(balanceCents)}.`}
                </p>
              </div>
            )}
          </div>
          {organizationId && row.email && <OwnerEmailsSection organizationId={organizationId} contactId={row.id} label={label} />}
          <div className="py-3" data-testid="research">
            <div className={label}>Research</div>
            {row.research ? (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-gray-500">{row.research.question}</p>
                <p className="text-[15px] text-gray-200">{row.research.answer}</p>
                {row.research.sources.length > 0 && (
                  <ul className="text-sm">
                    {row.research.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-[#7fb0e0] hover:text-white">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500">
                  Read {new Date(row.research.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {research.chargedCents ? ` · ${dollars(research.chargedCents)}` : ''}
                </p>
              </div>
            ) : research.status === 'running' ? (
              <p className="text-sm text-gray-400">Reading the web about this owner… this takes up to a minute.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {research.status === 'none' && <p className="text-sm text-gray-500">The web had nothing specific on this owner. Nothing was charged.</p>}
                {research.status === 'failed' && <p className="text-sm text-amber-300">{research.error ?? "The research didn't go through."} Nothing was charged.</p>}
                <GrowingTextarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={2}
                  aria-label="Research question"
                  className="w-full bg-[#1A1A1A] border border-[#333333] px-3 py-2 text-white text-base md:text-sm resize-none focus:outline-none focus:border-[#336699]"
                />
                <button type="button" onClick={() => (canResearch ? enrich(['research'], question) : onAddFunds())} disabled={busy} className={primary}>
                  {canResearch ? 'Research' : 'Add funds to research'} · {dollars(researchCents)}
                </button>
                <p className="text-xs text-gray-500">Charged only when the web has something to say. Balance {dollars(balanceCents)}.</p>
              </div>
            )}
          </div>
          <HowFound row={row} />
          {row.signals.length > 0 && (
            <div className="py-3">
              <div className={label}>Signals</div>
              <ul className="text-sm text-amber-300">
                {row.signals.map((s) => (
                  <li key={s.kind}>
                    {SIGNAL_LABEL[s.kind]} · {monthYear(s.date)}
                    <span className="text-gray-400"> · {s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="py-3">
            <div className={label}>Mail to</div>
            {mailing ? (
              <AddressLink address={mailing} className={link}>
                <MapPin className="w-4 h-4 shrink-0" /> {mailing}
              </AddressLink>
            ) : (
              <p className="text-sm text-gray-500">{realtor ? 'The state withholds addresses for license holders; reach them through the brokerage or the lookups.' : 'No mailing address on the roll.'}</p>
            )}
          </div>
          {row.property && property ? (
            <div className="py-3">
              <div className={label}>Property</div>
              <AddressLink address={property} className={link}>
                <MapPin className="w-4 h-4 shrink-0" /> {tidyCase(row.property.address)}
              </AddressLink>
              <div className="text-sm text-gray-400">
                {row.property.valueCents ? `Worth ${shortMoney(row.property.valueCents)}` : ''}
                {row.properties > 1 ? `${row.property.valueCents ? ' · ' : ''}${row.properties} properties, ${shortMoney(row.totalValueCents)} in all` : ''}
              </div>
              {organizationId && row.properties > 1 && <OwnerPropertiesList key={row.id} organizationId={organizationId} contactId={row.id} count={row.properties} />}
              {deeds && (
                <a href={deeds.url} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-2 text-sm text-[#7fb0e0] hover:text-white min-h-[44px]" data-testid="deeds">
                  <FileText className="w-4 h-4 shrink-0" /> Deeds at the county clerk
                  {!deeds.named && <span className="text-gray-500">{' '}· search {row.name}</span>}
                </a>
              )}
            </div>
          ) : (
            <div className="py-3">
              <div className={label}>Property</div>
              <p className="text-sm text-gray-500">Owns nothing on the roll{row.company ? `; works with ${row.company}` : ''}.</p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className={`block ${label}`} htmlFor="outreach-note">
            Note
          </label>
          <GrowingTextarea
            id="outreach-note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            onBlur={() => noteChanged && void saveNote()}
            rows={2}
            placeholder="Spoke to the office manager…"
            className="w-full bg-[#1A1A1A] border border-[#333333] px-3 py-2 text-white text-base md:text-sm resize-none focus:outline-none focus:border-[#336699]"
          />
          {saved && !noteChanged && (
            <p className="text-xs text-gray-500" data-testid="note-saved">
              Saved
            </p>
          )}
        </div>
        {/* What to do with the owner stays in reach at the bottom of the sheet, however far down it's scrolled. */}
        <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 space-y-2 bg-[#121212] border-t border-[#333333]" data-testid="sheet-actions">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onLead(row)} disabled={busy} className={primary} data-testid="to-leads">
              {row.leadId ? 'Open in Leads' : 'Send to Leads'} <ArrowRight className="w-4 h-4" />
            </button>
            {!row.leadId && (
              <button type="button" onClick={() => set(row.status === 'skip' ? 'new' : 'skip')} disabled={busy} aria-pressed={row.status === 'skip'} className={quiet}>
                {row.status === 'skip' ? 'Skipped · undo' : 'Skip'}
              </button>
            )}
          </div>
          {row.known && !row.leadId && (
            <p className="text-sm text-[#7fb0e0]" data-testid="known">
              {knownText(row.known, row.name)}.{' '}
              <span className="text-gray-400">{row.known.kind === 'client' ? 'Sending makes the lead under that client, not a new one.' : 'Sending adds this owner to that lead instead of making another.'}</span>
            </p>
          )}
          <p className="text-xs text-gray-500">{row.leadId ? `${row.leadStage ? `In Leads: ${LEAD_STAGE[row.leadStage] ?? row.leadStage}. ` : ''}Calls, follow-ups and the estimate are in Leads.` : 'Calls, follow-ups and the estimate happen in Leads. The number, email, property and note go with them.'}</p>
        </div>
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </SlideOutDrawer>
  );
};

/**
 * A text box as tall as what's in it: the whole question or note shows, however long, instead of scrolling inside two
 * lines. Measured again when the text or the width changes (an iPad turned on its side).
 */
const GrowingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...rest }) => {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      el.style.height = 'auto';
      // Not laid out (or a test's fake page): the rows decide.
      if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [rest.value]);
  return <textarea ref={box} {...rest} className={`${className} overflow-hidden`} />;
};

/** What a property is, in a word, from the appraisal district's use code. */
const useWord = (code: string) => (isCommercialUse(code) ? 'Commercial' : isMultifamilyUse(code) ? 'Apartments' : 'Home');

/**
 * Everything an owner holds, in their sheet: their row carries only the most valuable property, so the rest are read
 * from the roll when asked for. Each address opens in Maps.
 */
const OwnerPropertiesList: React.FC<{ organizationId: string; contactId: string; count: number }> = ({ organizationId, contactId, count }) => {
  const [list, setList] = useState<OwnerProperties | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A line of its own (not inline): the deeds link under it would otherwise run on from it.
  const button = 'flex w-fit items-center gap-2 text-sm text-[#7fb0e0] hover:text-white min-h-[44px] disabled:opacity-60';
  const show = async () => {
    setShown(true);
    // Read once per opening of the sheet; an unfinished or failed read is asked again.
    if (busy || (list?.filed && !failed)) return;
    setBusy(true);
    setFailed(false);
    try {
      setList(await outreachAPI.properties(organizationId, contactId));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  if (!shown) {
    return (
      <button type="button" onClick={() => void show()} className={button} data-testid="all-properties">
        <ChevronRight className="w-4 h-4 shrink-0" /> Show all {count} properties
      </button>
    );
  }
  const left = list ? list.total - list.rows.length : 0;
  return (
    <div data-testid="property-list">
      <button type="button" onClick={() => setShown(false)} className={button}>
        <ChevronRight className="w-4 h-4 shrink-0 rotate-90" /> Hide the list
      </button>
      {busy && !list && <p className="text-sm text-gray-500 pb-2">Reading the county roll…</p>}
      {failed && (
        <p className="text-sm text-gray-400 pb-2">
          Couldn’t read the list.{' '}
          <button type="button" onClick={() => void show()} className="text-[#7fb0e0] underline">
            Try again
          </button>
        </p>
      )}
      {list && !list.filed && <p className="text-sm text-gray-400 pb-2">The full list is still being put together. Try again in a few minutes.</p>}
      {list && list.rows.length > 0 && (
        <ul className="divide-y divide-white/5 border-y border-white/5">
          {list.rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 min-h-[44px] py-1.5">
              <div className="min-w-0 flex-1">
                <AddressLink address={fullAddress(p.address, list.city, 'TX')} className="text-[15px] text-[#7fb0e0]">
                  {p.address}
                </AddressLink>
                <div className="text-xs text-gray-500 truncate">
                  {useWord(p.useCode)}
                  {p.owner ? ` · ${p.owner}` : ''}
                </div>
              </div>
              <div className="text-sm text-gray-300 tabular-nums shrink-0">{p.valueCents ? shortMoney(p.valueCents) : ''}</div>
            </li>
          ))}
        </ul>
      )}
      {list && list.filed && left > 0 && (
        <p className="text-xs text-gray-500 pt-2">
          {list.more ? `The ${list.rows.length} most valuable are listed; ${left} more aren\u2019t shown.` : `${left} more ${left === 1 ? 'isn\u2019t' : 'aren\u2019t'} on the roll we read (land, or sold since).`}
        </p>
      )}
    </div>
  );
};

/** An owner's emails from Outreach, in their sheet: each one sent or waiting, and their reply. */
const OwnerEmailsSection: React.FC<{ organizationId: string; contactId: string; label: string }> = ({ organizationId, contactId, label }) => {
  const [mine, setMine] = useState<OwnerEmails | null>(null);
  useEffect(() => emailAPI.watchOwner(organizationId, contactId, setMine, () => {}), [organizationId, contactId]);
  if (!mine || (mine.emails.length === 0 && !mine.replyText)) return null;
  const day = (iso?: string, ms?: number) => new Date(iso ?? ms ?? 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const what = (e: OwnerEmails['emails'][number]) =>
    e.status === 'sent'
      ? `${e.sample ? 'Sample, not really sent' : 'Sent'} ${day(e.sentAt)}`
      : e.status === 'scheduled'
        ? `Goes ${day(undefined, e.sendAt)}`
        : e.status === 'waiting'
          ? 'Waits for the first email'
          : e.status === 'paused'
            ? 'Held: Gmail isn\u2019t connected'
            : e.status === 'failed'
              ? `Didn\u2019t send: ${e.error ?? 'Gmail refused it'}`
              : e.status;
  return (
    <div className="py-3" data-testid="owner-emails">
      <div className={label}>Emails</div>
      {mine.replyText && (
        <div className="mt-1 mb-2 border-l-2 border-emerald-400/60 pl-3">
          <p className="text-xs text-emerald-300">Replied {day(mine.repliedAt)}</p>
          <p className="text-[15px] text-gray-200 whitespace-pre-line">{mine.replyText}</p>
        </div>
      )}
      <ul className="space-y-1.5 pt-1">
        {mine.emails.map((e) => (
          <li key={e.id} className="text-sm">
            <span className="text-gray-200">{e.step === 0 ? e.subject : `Follow-up ${e.step}`}</span>
            <span className="block text-xs text-gray-500">{what(e)}</span>
          </li>
        ))}
      </ul>
      {mine.state === 'opted_out' && <p className="text-xs text-gray-500 pt-1">Unsubscribed: they won’t be emailed again.</p>}
    </div>
  );
};
