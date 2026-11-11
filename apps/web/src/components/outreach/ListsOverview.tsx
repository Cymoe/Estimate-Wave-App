import { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import type { OutreachListSummary } from '../../lib/api';
import { inMoney, ownerTotal } from './listsStore';
import { WHO_LABEL } from '../../../convex/lib/outreach';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const small = 'inline-flex items-center gap-1.5 px-3 h-9 text-sm border border-[#333333] text-gray-300 hover:text-white hover:bg-[#2A2A2A] disabled:opacity-50';

/**
 * Every list as a card: how far it's worked, what it has turned into, and
 * the tidying (pin, rename, delete). Pinned first, then the newest.
 */
export function ListsOverview({
  lists,
  onOpen,
  onOrganize,
  onDelete,
  onBack,
}: {
  lists: OutreachListSummary[];
  onOpen: (id: string) => void;
  onOrganize: (id: string, change: { title?: string; pinned?: boolean }) => Promise<void>;
  onDelete: (list: OutreachListSummary) => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lists
      .filter((l) => !needle || `${l.title} ${WHO_LABEL[l.who]} ${l.definition.county}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt.localeCompare(a.createdAt));
  }, [lists, q]);
  const act = async (id: string, change: { title?: string; pinned?: boolean }) => {
    setError(null);
    try {
      await onOrganize(id, change);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
      return false;
    }
  };

  return (
    <div className="space-y-4" data-testid="lists-overview">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className={small}>
          <ArrowLeft className="w-4 h-4" /> Back to owners
        </button>
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a list"
            aria-label="Find a list"
            className="w-full h-9 rounded-none border border-[#333333] bg-[#1A1A1A] pl-8 pr-3 text-base md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {shown.length === 0 && <p className="text-sm text-gray-400">{q ? `No list matches “${q}”.` : 'No lists yet: ask for one with the + button.'}</p>}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((l) => {
          const pct = l.rowCount ? Math.round((l.done / l.rowCount) * 100) : 0;
          return (
            <li key={l.id} className="border border-[#333333] bg-[#121212] p-4 flex flex-col gap-3" data-testid="list-card">
              {renaming === l.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(l.id, { title: name }).then((ok) => ok && setRenaming(null));
                  }}
                >
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="List name" maxLength={120} className="flex-1 h-9 rounded-none border border-[#336699] bg-black px-2 text-base md:text-sm text-white focus:outline-none" />
                  <button type="submit" className={small}>
                    Save
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => onOpen(l.id)} className="text-left">
                  <span className="flex items-start gap-2">
                    <span className="text-base font-semibold text-white">{l.title}</span>
                    {l.pinned && <Pin className="w-4 h-4 shrink-0 mt-1 text-[#7fb0e0]" aria-label="Pinned" />}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {[WHO_LABEL[l.who], l.definition.county, `made ${day(l.createdAt)}`].filter(Boolean).join(' · ')}
                  </span>
                </button>
              )}
              <div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>
                    {l.done} of {l.rowCount.toLocaleString('en-US')} worked
                    {(l.total ?? 0) > l.rowCount && <span className="text-gray-500"> · {ownerTotal(l)} in all</span>}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 bg-[#2A2A2A]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.title} worked`}>
                  <div className="h-full bg-[#336699]" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <p className="text-sm text-gray-300">
                {l.results && l.results.sent > 0 ? (
                  <>
                    {l.results.sent} sent to Leads · {l.results.estimates} {l.results.estimates === 1 ? 'estimate' : 'estimates'}
                    {inMoney(l.results.estimateCents)} ·{' '}
                    <span className={l.results.sold ? 'text-emerald-300' : ''}>
                      {l.results.sold} sold{inMoney(l.results.soldCents)}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-500">Nothing sent to Leads yet</span>
                )}
              </p>
              {/* What the list cost to look up, beside what it sold: the two numbers that say whether it paid. */}
              {(l.spentCents ?? 0) > 0 && (
                <p className="text-xs text-gray-500" data-testid="list-cost">
                  {l.results?.soldCents ? `${dollars(l.results.soldCents)} sold for ${dollars(l.spentCents ?? 0)} in lookups` : `${dollars(l.spentCents ?? 0)} spent on lookups`}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-auto">
                <button type="button" onClick={() => onOpen(l.id)} className={`${small} border-[#336699] text-white`}>
                  Open
                </button>
                {(
                  // The pin alone, no word: with it the four buttons fit one row on a phone and on a tablet's two columns.
                  <button
                    type="button"
                    onClick={() => void act(l.id, { pinned: !l.pinned })}
                    className={`${small} w-9 justify-center !px-0`}
                    aria-label={l.pinned ? `Unpin ${l.title}` : `Pin ${l.title}`}
                    title={l.pinned ? 'Unpin: take it off the top of the list picker' : 'Pin: keep it at the top of the list picker'}
                  >
                    {l.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(l.id);
                    setName(l.title);
                  }}
                  className={small}
                  aria-label={`Rename ${l.title}`}
                >
                  <Pencil className="w-4 h-4" /> Rename
                </button>
                <button type="button" onClick={() => onDelete(l)} className={`${small} text-red-300`} aria-label={`Delete ${l.title}`}>
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
