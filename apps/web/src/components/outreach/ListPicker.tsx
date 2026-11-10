import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, Pin, PinOff, Search, X } from 'lucide-react';
import type { OutreachListSummary } from '../../lib/api';
import { WHO_LABEL } from '../../../convex/lib/outreach';
import { listProgress, recentLists, rememberList, UNLISTED } from './listsStore';

/**
 * The lists, one tap away: the open list's name as a button; it opens a panel
 * with a search, the pinned lists, the ones opened lately, the rest grouped by
 * who they're of. On a phone it's
 * a sheet from the bottom.
 */
export function ListPicker({
  lists,
  currentId,
  narrow,
  onPick,
  onPin,
  onManage,
  compact = false,
  unlisted = 0,
}: {
  lists: OutreachListSummary[];
  currentId?: string;
  narrow: boolean;
  onPick: (id: string | null) => void;
  onPin: (id: string, pinned: boolean) => void;
  onManage: () => void;
  compact?: boolean;
  /** Owners on no list (kept from deleted lists): a row of their own under All owners while there are any. */
  unlisted?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const current = lists.find((l) => l.id === currentId);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => {
    if (!open) {
      setQ('');
    }
  }, [open]);

  const sections = useMemo(() => {
    const live = lists;
    const needle = q.trim().toLowerCase();
    if (needle) {
      const hit = (l: OutreachListSummary) => `${l.title} ${WHO_LABEL[l.who]} ${l.definition.county}`.toLowerCase().includes(needle);
      return { search: live.filter(hit), pinned: [], recent: [], groups: [] as Array<[string, OutreachListSummary[]]> };
    }
    const pinned = live.filter((l) => l.pinned);
    const byId = new Map(live.map((l) => [l.id, l] as const));
    // With only a handful of lists they all fit already; Recent is for when there are many. The open list isn't repeated.
    const recent =
      live.length > 5
        ? recentLists()
            .map((id) => byId.get(id))
            .filter((l): l is OutreachListSummary => Boolean(l) && !l!.pinned && l!.id !== currentId)
            .slice(0, 3)
        : [];
    const groups = new Map<string, OutreachListSummary[]>();
    for (const l of live) {
      if (l.pinned) continue;
      const g = WHO_LABEL[l.who] ?? 'Other';
      groups.set(g, [...(groups.get(g) ?? []), l]);
    }
    return { search: null, pinned, recent, groups: [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
  }, [lists, q, currentId]);

  const pick = (id: string | null) => {
    if (id && id !== UNLISTED) rememberList(id);
    setOpen(false);
    onPick(id);
  };

  const Row = ({ l }: { l: OutreachListSummary }) => (
    <li className={`flex items-center gap-2 ${l.id === currentId ? 'bg-[#336699]/15' : ''}`}>
      <button type="button" onClick={() => pick(l.id)} className="flex-1 min-w-0 text-left px-4 py-2.5 hover:bg-[#2A2A2A]" data-testid="list-option">
        <span className="block text-sm text-white truncate">
          {l.title}
        </span>
        <span className="block text-xs text-gray-500 truncate">{listProgress(l)}</span>
      </button>
      {(
        <button
          type="button"
          onClick={() => onPin(l.id, !l.pinned)}
          aria-label={l.pinned ? `Unpin ${l.title}` : `Pin ${l.title}`}
          title={l.pinned ? 'Unpin' : 'Pin to the top'}
          className={`mr-2 w-9 h-9 shrink-0 inline-flex items-center justify-center hover:bg-[#2A2A2A] ${l.pinned ? 'text-[#7fb0e0]' : 'text-gray-600 hover:text-gray-300'}`}
        >
          {l.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </button>
      )}
    </li>
  );
  const Section = ({ title, rows }: { title: string; rows: OutreachListSummary[] }) =>
    rows.length === 0 ? null : (
      <section>
        <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-500">{title}</h3>
        <ul>
          {rows.map((l) => (
            <Row key={l.id} l={l} />
          ))}
        </ul>
      </section>
    );

  const liveCount = lists.length;
  const panel = (
    <div
      role="dialog"
      aria-label="Lists"
      className={
        narrow
          ? 'fixed inset-x-0 bottom-0 z-50 max-h-[80vh] flex flex-col bg-[#1A1A1A] border-t border-[#333333] shadow-2xl'
          : 'absolute left-0 top-full mt-1 z-50 w-[30rem] max-w-[90vw] max-h-[70vh] flex flex-col bg-[#1A1A1A] border border-[#333333] shadow-2xl'
      }
    >
      <div className="flex items-center gap-2 p-3 border-b border-[#333333]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden />
          <input
            autoFocus={!narrow}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a list"
            aria-label="Find a list"
            className="w-full h-9 rounded-none border border-[#333333] bg-black pl-8 pr-3 text-base md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
          />
        </div>
        {narrow && (
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      <div className="overflow-y-auto pb-2">
        {!q && (
          <ul>
            <li className={!currentId ? 'bg-[#336699]/15' : ''}>
              <button type="button" onClick={() => pick(null)} className="w-full text-left px-4 py-2.5 hover:bg-[#2A2A2A]">
                <span className="block text-sm text-white">All owners</span>
                <span className="block text-xs text-gray-500">
                  Everyone on {liveCount} {liveCount === 1 ? 'list' : 'lists'}
                </span>
              </button>
            </li>
            {(unlisted > 0 || currentId === UNLISTED) && (
              <li className={currentId === UNLISTED ? 'bg-[#336699]/15' : ''}>
                <button type="button" onClick={() => pick(UNLISTED)} className="w-full text-left px-4 py-2.5 hover:bg-[#2A2A2A]" data-testid="unlisted-option">
                  <span className="block text-sm text-white">Not on a list</span>
                  <span className="block text-xs text-gray-500">
                    {unlisted.toLocaleString('en-US')} {unlisted === 1 ? 'owner' : 'owners'} kept from deleted lists
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}
        {sections.search ? (
          sections.search.length ? (
            <ul>
              {sections.search.map((l) => (
                <Row key={l.id} l={l} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-gray-500">No list matches “{q}”.</p>
          )
        ) : (
          <>
            <Section title="Pinned" rows={sections.pinned} />
            <Section title="Recent" rows={sections.recent} />
            {sections.groups.map(([title, rows]) => (
              <Section key={title} title={title} rows={rows} />
            ))}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onManage();
        }}
        className="flex items-center gap-2 px-4 min-h-[44px] border-t border-[#333333] text-sm text-[#7fb0e0] hover:text-white hover:bg-[#2A2A2A]"
      >
        <LayoutGrid className="w-4 h-4" /> Manage lists
      </button>
    </div>
  );

  return (
    <div ref={box} className={`relative ${compact ? 'flex-1 min-w-0' : 'max-w-full'}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="List"
        data-testid="list-picker"
        className={
          compact
            ? 'flex items-center gap-2 max-w-full w-full h-9 px-3 text-base border border-[#333333] bg-[#1A1A1A] text-white hover:bg-[#2A2A2A]'
            : // Not a box: the list's name, as the page's title, with a small arrow to switch.
              'flex items-center gap-1.5 max-w-full h-10 -ml-2 px-2 text-lg font-semibold text-white hover:bg-[#1A1A1A]'
        }
      >
        <span className="truncate">{current ? current.title : currentId === UNLISTED ? 'Not on a list' : 'All owners'}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${compact ? 'ml-auto' : ''} ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open &&
        (narrow ? (
          // A tap on the dimmed backdrop closes the sheet.
          <div className="fixed inset-0 z-40 bg-black/60" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            {panel}
          </div>
        ) : (
          panel
        ))}
    </div>
  );
}
