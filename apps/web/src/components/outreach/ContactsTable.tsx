import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, FileText, Lock, Mail, MapPin, MessageSquare, MinusCircle, Phone, Search, User } from 'lucide-react';
import { AddressLink } from '../common/AddressLink';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { fullAddress } from '../../lib/mapsLinks';
import type { OutreachCell, OutreachContact, OutreachContacts, OutreachCoverage, OutreachField, OutreachPhone, OutreachRowStatus, OutreachSignal, OutreachTry, OutreachWho } from '../../lib/api';
import { shortMoney, WHO_LABEL } from '../../../convex/lib/outreach';
import { askingText, callOk, deedSearchUrl, phoneText, sourceList, sourceName } from './format';
import type { ColumnKey } from './columns';

const STATUS_LABEL: Record<OutreachRowStatus, string> = { new: 'New', sent: 'Sent', done: 'Done', skip: 'Skipped' };
const STATUSES: OutreachRowStatus[] = ['new', 'sent', 'done', 'skip'];
/** The column's short name for the kind of owner. */
const KIND: Record<OutreachWho, string> = {
  investor: 'Investor',
  builder: 'Builder',
  manager: 'Manager',
  commercial: 'Commercial',
  multifamily: 'Apartments',
  wealthy: 'Wealthy',
  recent_buyer: 'Buyer',
  absentee: 'Absentee',
  custom: 'Custom',
};
const SIGNAL_LABEL: Record<OutreachSignal['kind'], string> = { code_violation: 'Code violation', dilapidated: 'Dilapidated', demolition: 'Demolition order', stalled_permit: 'Stalled permit' };
const PHONE_TYPE: Record<OutreachPhone['type'], string> = { mobile: 'mobile', landline: 'landline', voip: 'VoIP', unknown: '' };

const statusTone = (s: OutreachRowStatus) => (s === 'done' ? 'text-[#7fb0e0]' : s === 'skip' ? 'text-gray-600' : s === 'sent' ? 'text-amber-300' : 'text-gray-500');
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const kindsText = (kinds: OutreachWho[]) => kinds.map((k) => KIND[k]).join(', ');
/** "DALLAS, TX 75201" under the street. */
const cityLine = (m: OutreachContact['mailing']) => [m.city, [m.state, m.zip?.slice(0, 5)].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/** "12 / 200 · 2 sources" under a column's name. */
const Coverage: React.FC<{ c: OutreachCoverage; of?: string }> = ({ c, of }) => (
  <span className="block normal-case tracking-normal text-[11px] text-gray-500 tabular-nums">
    {c.found} / {c.total}
    {of ? ` ${of}` : ''}
    {c.sources > 0 ? ` · ${c.sources} ${c.sources === 1 ? 'source' : 'sources'}` : ''}
  </span>
);

/** A phone's small print: its type, whether the checker confirmed it, and the Do Not Call and litigator flags. */
export const PhoneBadges: React.FC<{ p: OutreachPhone }> = ({ p }) => (
  <span className="text-[11px] text-gray-500">
    {PHONE_TYPE[p.type]}
    {p.verified ? (PHONE_TYPE[p.type] ? ' · ' : '') + 'verified' : ''}
    {p.dnc ? <span className="text-red-400">{PHONE_TYPE[p.type] || p.verified ? ' · ' : ''}DNC</span> : null}
    {p.litigator ? <span className="text-red-400">{PHONE_TYPE[p.type] || p.verified || p.dnc ? ' · ' : ''}litigator</span> : null}
  </span>
);

/** A lookup at work: the source it's asking now, under it the last thing found. */
export const Live: React.FC<{ cell: OutreachCell }> = ({ cell }) => {
  const last = [...(cell.tries ?? [])].reverse().find((t) => t.outcome === 'hit');
  const asked = (cell.tries ?? []).filter((t) => t.outcome !== 'skipped').length;
  return (
    <span className="inline-flex flex-col" data-testid="live">
      <span className="inline-flex items-center gap-1.5 text-[#7fb0e0]">
        <span className="live-dot" aria-hidden /> {askingText(cell.asking)}…
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

/** A cell that hasn't a value: the lock, the wait, the miss, or the failure with its reason and a retry. */
const Empty: React.FC<{ cell: OutreachCell; onRetry?: () => void }> = ({ cell, onRetry }) => {
  switch (cell.status) {
    case 'running':
      return <Live cell={cell} />;
    case 'found':
    case 'none':
      return <span className="text-gray-600">None found</span>;
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

const th = 'font-medium px-3 py-2 whitespace-nowrap align-top overflow-hidden';
const td = 'px-3 py-2 whitespace-nowrap align-top overflow-hidden text-ellipsis';
/**
 * Each column's width, in rem, fixed so the table never shifts as answers
 * arrive (a lookup's narration, a phone landing): what doesn't fit is cut
 * with an ellipsis instead of widening its column.
 */
const WIDTH: Record<'select' | 'name' | ColumnKey, number> = {
  select: 2.5,
  name: 16,
  person: 13,
  phone: 12.5,
  email: 15,
  research: 18,
  status: 6,
  mailing: 15,
  property: 13,
  value: 6,
  type: 9,
  signals: 14,
};
/** The checkbox and the name stay put while the roll columns scroll under them. */
const pinned = 'sticky bg-[#121212] group-hover:bg-[#1A1A1A]';

/**
 * The CRM: one row per owner. What the row has comes first (the person
 * behind a company, phone, email, status), then the roll's columns and
 * the property's signals; the name stays pinned as the rest scroll, and the right edge
 * fades while more columns wait. Tap a row for the sheet; tick rows to
 * enrich them.
 */
export const ContactsTable: React.FC<{
  rows: OutreachContact[];
  coverage: OutreachContacts['coverage'];
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  onOpen: (row: OutreachContact) => void;
  /** Run a failed field again, from the cell's Retry. */
  onRetry: (row: OutreachContact, field: OutreachField) => void;
  /** Columns the Columns picker has hidden. */
  hidden?: Set<ColumnKey>;
}> = ({ rows, coverage, selected, onSelect, onSelectAll, onOpen, onRetry, hidden }) => {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const lit = useJustFilled(rows);
  const glow = (id: string, f: OutreachField) => (lit.has(`${id}:${f}`) ? ' cell-filled' : '');
  const show = (k: ColumnKey) => !hidden?.has(k);
  const shownKeys = (['person', 'phone', 'email', 'research', 'status', 'mailing', 'property', 'value', 'type', 'signals'] as ColumnKey[]).filter(show);
  const widthOf = (keys: ColumnKey[]) => WIDTH.select + WIDTH.name + keys.reduce((sum, k) => sum + WIDTH[k], 0);
  const [atEnd, setAtEnd] = useState(false);
  // No fade when every column fits, or once the last one is in view.
  const scrolled = (el: HTMLDivElement) => setAtEnd(el.scrollWidth <= el.clientWidth || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  return (
    <div className="relative" data-testid="contacts-table">
      <div className="bg-[#121212] border border-[#333333] overflow-x-auto" onScroll={(e) => scrolled(e.currentTarget)} ref={(el) => el && scrolled(el)}>
        <table className="text-sm table-fixed" style={{ width: `${widthOf(shownKeys)}rem`, minWidth: '100%' }} aria-label="Contacts">
          <colgroup>
            <col style={{ width: `${WIDTH.select}rem` }} />
            <col style={{ width: `${WIDTH.name}rem` }} />
            {shownKeys.map((k) => (
              <col key={k} style={{ width: `${WIDTH[k]}rem` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-[#333333]">
              <th className={`${pinned} left-0 z-10 px-3 py-2 w-10 align-top`}>
                <input type="checkbox" checked={all} onChange={(e) => onSelectAll(e.target.checked)} aria-label="Select all" className="accent-[#336699]" />
              </th>
              <th className={`${pinned} left-10 z-10 ${th} border-r border-[#333333]`}>Name</th>
              {show('person') && (
                <th className={th}>
                  Decision maker
                  <Coverage c={coverage.person} of={coverage.person.total === 1 ? 'company' : 'companies'} />
                </th>
              )}
              {show('phone') && (
                <th className={th}>
                  Phone
                  <Coverage c={coverage.phone} />
                </th>
              )}
              {show('email') && (
                <th className={th}>
                  Email
                  <Coverage c={coverage.email} />
                </th>
              )}
              {show('research') && (
                <th className={th}>
                  Research
                  <Coverage c={coverage.research} />
                </th>
              )}
              {show('status') && <th className={th}>Status</th>}
              {show('mailing') && <th className={th}>Mailing address</th>}
              {show('property') && <th className={th}>Property</th>}
              {show('value') && <th className={`${th} text-right`}>Value</th>}
              {show('type') && <th className={th}>Type</th>}
              {show('signals') && <th className={th}>Signals</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#333333]">
            {rows.map((r) => {
              const phone = r.phones[0];
              const email = r.emails[0];
              return (
                <tr key={r.id} onClick={() => onOpen(r)} className="group cursor-pointer hover:bg-[#1A1A1A]" data-testid="contact-row">
                  <td className={`${pinned} left-0 z-10 ${td}`} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => onSelect(r.id, e.target.checked)} aria-label={`Select ${r.name}`} className="accent-[#336699]" />
                  </td>
                  <td className={`${pinned} left-10 z-10 ${td} border-r border-[#333333] max-w-[16rem] truncate ${r.status === 'skip' ? 'text-gray-500 line-through' : 'text-white'}`}>
                    {r.name}
                    {r.related?.length ? (
                      <span className="block text-[11px] text-gray-500 no-underline" title={`Related: ${r.related.map((x) => x.name).join(', ')}`} data-testid="related">
                        +{r.related.length} related
                      </span>
                    ) : null}
                  </td>
                  {show('person') && (
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
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                  )}
                  {show('phone') && (
                    <td className={`${td}${glow(r.id, 'phone')}`}>
                      {phone ? (
                        <>
                          <span className={phone.dnc ? 'text-gray-300' : 'text-white'}>{phoneText(phone.number)}</span>
                          <span className="block">
                            <PhoneBadges p={phone} />
                            {r.phones.length > 1 ? <span className="text-[11px] text-gray-500"> · +{r.phones.length - 1}</span> : null}
                          </span>
                        </>
                      ) : (
                        <Empty cell={r.enrichment.phone} onRetry={() => onRetry(r, 'phone')} />
                      )}
                    </td>
                  )}
                  {show('email') && (
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
                  )}
                  {show('research') && (
                    <td className={`${td} max-w-[22rem] truncate${glow(r.id, 'research')}`} title={r.research?.answer}>
                      {r.research ? <span className="text-gray-200">{r.research.answer}</span> : <Empty cell={r.enrichment.research ?? { status: 'locked' }} onRetry={() => onRetry(r, 'research')} />}
                    </td>
                  )}
                  {show('status') && (
                    <td className={`${td} ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</td>
                  )}
                  {show('mailing') && (
                    <td className={`${td} max-w-[16rem] truncate text-gray-300`}>
                      {r.mailing.address ?? ''}
                      {cityLine(r.mailing) ? <span className="block text-[11px] text-gray-500">{cityLine(r.mailing)}</span> : null}
                    </td>
                  )}
                  {show('property') && (
                    <td className={`${td} max-w-[14rem] truncate text-gray-300`}>
                      {r.property.address}
                      {r.properties > 1 ? <span className="text-gray-500"> +{r.properties - 1}</span> : null}
                    </td>
                  )}
                  {show('value') && (
                    <td className={`${td} text-right tabular-nums text-gray-300`} title={r.properties > 1 ? `${r.properties} properties in all` : undefined}>
                      {r.properties > 1 ? shortMoney(r.totalValueCents) : r.property.valueCents ? shortMoney(r.property.valueCents) : ''}
                    </td>
                  )}
                  {show('type') && (
                    <td className={`${td} text-gray-400`}>{kindsText(r.kinds)}</td>
                  )}
                  {show('signals') && (
                    <td className={`${td} text-amber-300`}>
                      {r.signals.length === 0 ? (
                        <span className="text-gray-700">—</span>
                      ) : (
                        r.signals.map((s, i) => (
                          <span key={s.kind}>
                            {i > 0 ? ' · ' : ''}
                            {s.fresh ? <span className="mr-1 px-1 text-[10px] font-medium uppercase tracking-wide text-[#121212] bg-amber-300">New</span> : null}
                            {SIGNAL_LABEL[s.kind]} {monthYear(s.date)}
                          </span>
                        ))
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* More columns wait to the right: a fade says so until the end is reached. */}
      {!atEnd && <div aria-hidden className="table-fade pointer-events-none absolute inset-y-px right-px w-8" data-testid="more-columns" />}
    </div>
  );
};

/**
 * The list for calling from a phone: one card per owner, stacked. The
 * decision maker, the best number with Call and Text, a signal if the
 * property has one, and Done or Skip. Tap the card for the full sheet.
 */
export const ContactCards: React.FC<{
  rows: OutreachContact[];
  onOpen: (row: OutreachContact) => void;
  onStatus: (row: OutreachContact, status: OutreachRowStatus) => Promise<void>;
  onRetry: (row: OutreachContact, field: OutreachField) => void;
}> = ({ rows, onOpen, onStatus, onRetry }) => {
  const [saving, setSaving] = useState<string | null>(null);
  const lit = useJustFilled(rows);
  const mark = async (row: OutreachContact, next: OutreachRowStatus) => {
    setSaving(row.id);
    try {
      // Tapping the status it already has puts it back to New.
      await onStatus(row, row.status === next ? 'new' : next);
    } catch {
      // The sheet shows errors; a card just stays as it was.
    } finally {
      setSaving(null);
    }
  };
  const big = 'flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] text-sm font-medium';
  return (
    <ul className="space-y-2" data-testid="contact-cards">
      {rows.map((r) => {
        const call = r.phones.find(callOk);
        const text = r.phones.find((p) => callOk(p) && p.type === 'mobile');
        const email = r.emails.find((e) => e.nameMatch !== false) ?? r.emails[0];
        const signal = r.signals[0];
        return (
          <li key={r.id} className={`bg-[#121212] border border-[#333333]${['person', 'phone', 'email'].some((f) => lit.has(`${r.id}:${f}`)) ? ' cell-filled' : ''}`} data-testid="contact-card">
            <button type="button" onClick={() => onOpen(r)} className="block w-full text-left px-4 pt-3 pb-2">
              <span className={`block text-[15px] font-medium ${r.status === 'skip' ? 'text-gray-500 line-through' : 'text-white'}`}>{r.name}</span>
              <span className="block text-xs text-gray-500">
                {r.properties > 1 ? `${r.properties} properties · ${shortMoney(r.totalValueCents)}` : r.property.valueCents ? shortMoney(r.property.valueCents) : r.property.address}
                {r.related?.length ? ` · +${r.related.length} related` : ''}
              </span>
              {signal && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" /> {signal.fresh ? <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-[#121212] bg-amber-300">New</span> : null} {SIGNAL_LABEL[signal.kind]} {monthYear(signal.date)}
                </span>
              )}
              {r.company && (
                <span className="block mt-2 text-sm">
                  {r.person ? (
                    <>
                      <span className="text-gray-200">{r.person.name}</span>
                      {r.person.title ? <span className="text-gray-500"> · {r.person.title}</span> : null}
                    </>
                  ) : (
                    r.enrichment.person.status === 'running' ? (
                      <Live cell={r.enrichment.person} />
                    ) : (
                      <span className="text-gray-500">Decision maker: {r.enrichment.person.status === 'none' ? 'none found' : 'not looked up'}</span>
                    )
                  )}
                </span>
              )}
              <span className="block mt-1 text-sm">
                {r.phones[0] ? (
                  <>
                    <span className={callOk(r.phones[0]) ? 'text-white' : 'text-gray-400'}>{phoneText((call ?? r.phones[0]).number)}</span> <PhoneBadges p={call ?? r.phones[0]} />
                  </>
                ) : r.enrichment.phone.status === 'failed' ? null : r.enrichment.phone.status === 'running' ? (
                  <Live cell={r.enrichment.phone} />
                ) : (
                  <span className="text-gray-500">Phone: {r.enrichment.phone.status === 'none' ? 'none found' : 'not looked up'}</span>
                )}
              </span>
            </button>
            {!r.phones[0] && r.enrichment.phone.status === 'failed' && (
              <div className="px-4 pb-2 text-sm">
                <Empty cell={r.enrichment.phone} onRetry={() => onRetry(r, 'phone')} />
              </div>
            )}
            {(call || text || email) && (
              <div className="flex gap-2 px-4 pb-2" data-testid="card-reach">
                {call && (
                  <a href={`tel:${call.number}`} className={`${big} bg-[#336699] hover:bg-[#2a5580] text-white`}>
                    <Phone className="w-4 h-4" /> Call
                  </a>
                )}
                {text && (
                  <a href={`sms:${text.number}`} className={`${big} border border-[#333333] text-gray-200 hover:bg-[#2A2A2A]`}>
                    <MessageSquare className="w-4 h-4" /> Text
                  </a>
                )}
                {email && !text && (
                  <a href={`mailto:${email.email}`} className={`${big} border border-[#333333] text-gray-200 hover:bg-[#2A2A2A]`}>
                    <Mail className="w-4 h-4" /> Email
                  </a>
                )}
              </div>
            )}
            <div className="flex border-t border-[#333333]">
              {(['done', 'skip'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void mark(r, s)}
                  disabled={saving === r.id}
                  aria-pressed={r.status === s}
                  className={`flex-1 min-h-[44px] text-sm disabled:opacity-50 ${s === 'skip' ? 'border-l border-[#333333]' : ''} ${r.status === s ? (s === 'done' ? 'text-[#7fb0e0] bg-[#336699]/15' : 'text-gray-300 bg-[#1A1A1A]') : 'text-gray-500 hover:bg-[#1A1A1A]'}`}
                >
                  {r.status === s ? (s === 'done' ? 'Done ✓' : 'Skipped') : s === 'done' ? 'Mark done' : 'Skip'}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

const dollarsOrFree = (cents?: number) => (cents ? dollars(cents) : 'free');
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
  c.status === 'found' ? `Found · ${dollarsOrFree(c.chargedCents)}` : c.status === 'none' ? 'None · free' : c.status === 'failed' ? 'Failed · free' : c.status === 'running' ? 'Looking…' : 'Not looked up';

/**
 * How we found it: each step that has run, with every source's turn in
 * order, what it said, and what the owner cost in all. The numbers follow
 * the strip's: owners are step 1.
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
      <ol className="mt-2 space-y-3">
        {steps.map((s, i) => (
          <li key={s.field}>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center border border-[#333333] text-[11px] text-gray-400 tabular-nums">{i + 2}</span>
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
export const ContactSheet: React.FC<{
  row: OutreachContact | null;
  unlockCents: number;
  researchCents: number;
  researchQuestion: string;
  balanceCents: number;
  onClose: () => void;
  onStatus: (row: OutreachContact, status: OutreachRowStatus, note: string) => Promise<void>;
  onEnrich: (row: OutreachContact, fields: OutreachField[], question?: string) => Promise<void>;
  onAddFunds: () => void;
}> = ({ row, unlockCents, researchCents, researchQuestion, balanceCents, onClose, onStatus, onEnrich, onAddFunds }) => {
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState(researchQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
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
  const enrich = (fields: OutreachField[], asked?: string) => run(() => onEnrich(row, fields, asked), "Couldn't start that");
  const property = fullAddress(row.property.address, 'Midland', 'TX');
  const mailing = fullAddress(row.mailing.address, row.mailing.city, row.mailing.state, row.mailing.zip?.slice(0, 5));
  const link = 'inline-flex items-center gap-2 text-[15px] text-[#7fb0e0] min-h-[44px]';
  const label = 'text-xs font-medium text-gray-400 uppercase tracking-wider';
  const primary = 'inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50';
  const quiet = 'inline-flex items-center gap-2 px-3 min-h-[40px] text-sm text-gray-300 border border-[#333333] hover:bg-[#2A2A2A] disabled:opacity-50';
  const { phone, email, person } = row.enrichment;
  const research = row.enrichment.research ?? { status: 'locked' as const };
  const contactOpen = phone.status !== 'found' && phone.status !== 'running' && email.status !== 'running';
  const canPay = balanceCents >= unlockCents;
  const canResearch = balanceCents >= researchCents;
  const when = (c: OutreachCell) => (c.at ? ` ${new Date(c.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '');
  // The buttons: the best number not on the Do Not Call list; a text only to a mobile.
  const callable = row.phones.find(callOk);
  const textable = row.phones.find((p) => callOk(p) && p.type === 'mobile');
  // The Email button goes to an address the contact check didn't say belongs to someone else.
  const email0 = row.emails.find((e) => e.nameMatch !== false) ?? row.emails[0];
  return (
    <SlideOutDrawer isOpen onClose={onClose} title={row.name} width="md">
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-300">
          {row.why}
          {row.kinds.length ? <span className="text-gray-500"> · {row.kinds.map((k) => WHO_LABEL[k]).join(', ')}</span> : null}
        </p>
        {row.related?.length ? (
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
                    {row.person.address && <div className="text-sm text-gray-400">{row.person.address}</div>}
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
                <p className="text-sm text-gray-500">The state lists no officer for this company.</p>
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
                  <li key={p.number} className="flex items-baseline gap-2">
                    {callOk(p) ? (
                      <a href={`tel:${p.number}`} className={link}>
                        {phoneText(p.number)}
                      </a>
                    ) : (
                      <span className="text-[15px] text-gray-300 min-h-[44px] inline-flex items-center">{phoneText(p.number)}</span>
                    )}
                    <PhoneBadges p={p} />
                    {p.name && <span className="text-xs text-gray-500">line in the name of {p.name}</span>}
                    {p.dnc && <span className="text-xs text-red-400">on the Do Not Call list</span>}
                    {p.litigator && <span className="text-xs text-red-400">known TCPA litigator</span>}
                  </li>
                ))}
                {row.emails.map((e) => (
                  <li key={e.email}>
                    <a href={`mailto:${e.email}`} className={link}>
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
                    {email0 && (
                      <a href={`mailto:${email0.email}`} className={`${quiet} flex-1 justify-center min-h-[44px]`}>
                        <Mail className="w-4 h-4" /> Email
                      </a>
                    )}
                  </li>
                )}
              </ul>
            ) : phone.status === 'running' || email.status === 'running' ? (
              <p className="text-sm text-gray-400">Looking up the phone and email… this takes a few seconds.</p>
            ) : phone.status === 'none' ? (
              <p className="text-sm text-gray-500">No phone or email found for this owner. Nothing was charged.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {phone.status === 'failed' && <p className="text-sm text-amber-300">{phone.error ?? "The lookup didn't go through."} Nothing was charged.</p>}
                <button type="button" onClick={() => enrich(row.company ? ['person', 'phone', 'email'] : ['phone', 'email'])} disabled={busy || !canPay || !contactOpen} className={primary}>
                  <Lock className="w-4 h-4" /> Unlock phone & email · {dollars(unlockCents)}
                </button>
                <p className="text-xs text-gray-500">
                  Charged only when a phone is found. Balance {dollars(balanceCents)}.{' '}
                  {!canPay && (
                    <button type="button" onClick={onAddFunds} className="text-[#7fb0e0] underline underline-offset-2">
                      Add funds
                    </button>
                  )}
                </p>
              </div>
            )}
          </div>
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
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={2}
                  aria-label="Research question"
                  className="w-full bg-[#1A1A1A] border border-[#333333] px-3 py-2 text-white text-base md:text-sm resize-none focus:outline-none focus:border-[#336699]"
                />
                <button type="button" onClick={() => enrich(['research'], question)} disabled={busy || !canResearch} className={primary}>
                  <Search className="w-4 h-4" /> Research · {dollars(researchCents)}
                </button>
                <p className="text-xs text-gray-500">
                  Charged only when the web has something to say. Balance {dollars(balanceCents)}.{' '}
                  {!canResearch && (
                    <button type="button" onClick={onAddFunds} className="text-[#7fb0e0] underline underline-offset-2">
                      Add funds
                    </button>
                  )}
                </p>
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
              <p className="text-sm text-gray-500">No mailing address on the roll.</p>
            )}
          </div>
          <div className="py-3">
            <div className={label}>Property</div>
            <AddressLink address={property} className={link}>
              <MapPin className="w-4 h-4 shrink-0" /> {row.property.address}
            </AddressLink>
            <div className="text-sm text-gray-400">
              {row.property.valueCents ? `Worth ${shortMoney(row.property.valueCents)}` : ''}
              {row.properties > 1 ? `${row.property.valueCents ? ' · ' : ''}${row.properties} properties, ${shortMoney(row.totalValueCents)} in all` : ''}
            </div>
            <a href={deedSearchUrl(row.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[#7fb0e0] hover:text-white min-h-[44px]" data-testid="deeds">
              <FileText className="w-4 h-4 shrink-0" /> Deeds at the county clerk
            </a>
          </div>
        </div>
        <div className="space-y-2">
          <label className={`block ${label}`} htmlFor="outreach-note">
            Note
          </label>
          <textarea
            id="outreach-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (row.note ?? '') && void set(row.status)}
            rows={2}
            placeholder="Spoke to the office manager…"
            className="w-full bg-[#1A1A1A] border border-[#333333] px-3 py-2 text-white text-base md:text-sm resize-none focus:outline-none focus:border-[#336699]"
          />
        </div>
        <div className="grid grid-cols-4 border border-[#333333] divide-x divide-[#333333]" role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set(s)}
              disabled={busy}
              aria-pressed={row.status === s}
              className={`min-h-[44px] text-sm ${row.status === s ? 'bg-[#336699] text-white' : 'text-gray-300 hover:bg-[#2A2A2A]'}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
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
