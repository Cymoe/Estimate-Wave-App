import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { outreachAPI, type OutreachDefinition, type OutreachPreviewRow } from '../../lib/api';
import { defaultTitle, shortMoney } from '../../../convex/lib/outreach';
import { mailingLine } from './format';
import { GROUPS, type Preset } from './presets';

const field = 'w-full bg-[#1A1A1A] border border-[#333333] px-3 text-white text-base md:text-sm focus:outline-none focus:border-[#336699]';
const primary = 'px-4 py-2 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50';
const quiet = 'px-3 py-2 text-sm text-gray-300 border border-[#333333] hover:bg-[#2A2A2A]';

type Built = {
  definition: OutreachDefinition;
  title: string;
  explanation: string;
  /** Staff only: why the words, not the assistant, picked this list. */
  note?: string;
  count: number;
  /** How many owners the ask reaches; the list holds `count` of them at once. */
  total?: number;
  truncated: boolean;
  limited: boolean;
  rows: OutreachPreviewRow[];
};

/**
 * Ask for a list in plain words: the assistant turns the ask into a filter
 * over the county roll, shows how many and a first look, and Save keeps it.
 */
export const AskListSheet: React.FC<{
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onSaved: (listId: string) => void;
  /** Opened from a card on the empty page: go straight to that list's count and preview. */
  start?: { preset: Preset } | null;
}> = ({ open, organizationId, onClose, onSaved, start }) => {
  const [ask, setAsk] = useState('');
  const [preset, setPreset] = useState<string | null>(null);
  /** The one row of ready-made lists that's open; the sheet opens to just the three headings. */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState<'build' | 'save' | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [cannot, setCannot] = useState<{ explanation: string; suggestion?: { definition: OutreachDefinition; title: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setAsk('');
    setPreset(null);
    setOpenGroup(null);
    setBuilt(null);
    setCannot(null);
    setError(null);
    setBusy(null);
  }, [open]);

  /** A ready-made list: the filter runs as written, straight to the count and preview. */
  const pick = async (p: Preset) => {
    setPreset(p.label);
    setAsk('');
    setBusy('build');
    setError(null);
    setCannot(null);
    setBuilt(null);
    try {
      const got = await outreachAPI.preview(organizationId, p.definition);
      setBuilt({ definition: p.definition, title: defaultTitle(p.definition), explanation: p.explanation, count: got.count, total: got.total, truncated: got.truncated, limited: got.limited, rows: got.rows });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list couldn't be built");
    } finally {
      setBusy(null);
    }
  };

  const build = async () => {
    if (!ask.trim()) return;
    setPreset(null);
    setBusy('build');
    setError(null);
    setCannot(null);
    setBuilt(null);
    try {
      const got = await outreachAPI.interpret(organizationId, ask.trim());
      if (got.ok) setBuilt({ definition: got.definition, title: got.title, explanation: got.explanation, note: got.note, count: got.count, total: got.total, truncated: got.truncated, limited: got.limited, rows: got.preview });
      else setCannot({ explanation: got.explanation, suggestion: got.suggestion });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list couldn't be built");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!open || !start) return;
    setOpenGroup(GROUPS.find((g) => g.presets.includes(start.preset))?.heading ?? null);
    void pick(start.preset);
    // Runs once per opening: pick and build only read state they set themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, start]);

  /** The nearest list the assistant could make instead of what was asked. */
  const buildClosest = async () => {
    if (!cannot?.suggestion) return;
    const { definition, title } = cannot.suggestion;
    setBusy('build');
    setError(null);
    try {
      const got = await outreachAPI.preview(organizationId, definition);
      setBuilt({ definition, title, explanation: cannot.explanation, count: got.count, total: got.total, truncated: got.truncated, limited: got.limited, rows: got.rows });
      setCannot(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list couldn't be built");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!built) return;
    setBusy('save');
    setError(null);
    try {
      const made = await outreachAPI.create(organizationId, built.definition, built.title);
      onSaved(made.listId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list couldn't be saved");
      setBusy(null);
    }
  };

  return (
    <SlideOutDrawer isOpen={open} onClose={onClose} title="Ask for a list" width="lg">
      <div className="p-6 space-y-5">
        {/* Once a list is built it has the sheet to itself: the count, a first look and Save, no scrolling past the choices. */}
        {!built && (
          <>
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Who do you want to reach?</p>
          <div className="border border-[#333333] divide-y divide-[#333333]" role="group" aria-label="Ready-made lists">
            {GROUPS.map((g) => {
              const isOpen = openGroup === g.heading;
              const chosen = g.presets.find((p) => p.label === preset);
              const id = `outreach-group-${g.heading.toLowerCase().replace(/\W+/g, '-')}`;
              return (
                <div key={g.heading}>
                  <button
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : g.heading)}
                    aria-expanded={isOpen}
                    aria-controls={id}
                    className="w-full min-h-[48px] flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#2A2A2A]"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">{g.heading}</span>
                      {/* Closed, the row still says what's picked inside it, or how many lists it holds. */}
                      <span className="block text-xs text-gray-400 truncate">{chosen && !isOpen ? chosen.label : `${g.presets.length} lists`}</span>
                    </span>
                    <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {isOpen && (
                    <div id={id} className="flex flex-wrap gap-2 px-3 pb-3" role="group" aria-label={g.heading}>
                      {g.presets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => void pick(p)}
                          disabled={busy !== null}
                          aria-pressed={preset === p.label}
                          className={`px-3 py-2 text-sm border disabled:opacity-50 ${preset === p.label ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333333] text-gray-300 hover:bg-[#2A2A2A]'}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider" htmlFor="outreach-ask">
            Or say it in your own words
          </label>
          <textarea
            id="outreach-ask"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void build();
              }
            }}
            placeholder="Roofing contractors with 3 or more permits"
            rows={2}
            className={`${field} py-2 resize-none`}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">From the Midland County roll and the city's permits and code cases.</p>
            <button type="button" onClick={() => void build()} disabled={!ask.trim() || busy !== null} className={primary}>
              {busy === 'build' ? 'Building…' : 'Build'}
            </button>
          </div>
        </div>
          </>
        )}
        {busy === 'build' && !ask.trim() && <p className="text-sm text-gray-400">Counting owners…</p>}

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {cannot && (
          <div className="border border-[#333333] bg-[#1A1A1A] p-4 space-y-3" data-testid="cannot">
            <p className="text-sm text-gray-200">{cannot.explanation}</p>
            {cannot.suggestion && (
              <button type="button" onClick={buildClosest} disabled={busy !== null} className={quiet}>
                Build the closest instead: {cannot.suggestion.title}
              </button>
            )}
          </div>
        )}

        {built && (
          <div className="space-y-4" data-testid="built">
            <button type="button" onClick={() => setBuilt(null)} className="inline-flex items-center gap-1 text-sm text-[#7fb0e0] hover:text-white">
              <ChevronLeft className="w-4 h-4" /> Pick a different list
            </button>
            <div className="border border-[#333333] bg-[#1A1A1A] p-4 space-y-1">
              <p className="text-lg font-semibold text-white">
                {built.total !== undefined && built.total > built.count ? (
                  <>
                    {built.total.toLocaleString('en-US')}
                    {built.truncated ? '+' : ''} owners
                    <span className="text-sm font-normal text-gray-400"> · the first {built.count.toLocaleString('en-US')} load now, the rest from the saved list</span>
                  </>
                ) : (
                  <>
                    {built.count} {built.count === 1 ? 'owner' : 'owners'}
                  </>
                )}
              </p>
              <p className="text-sm text-gray-300">{built.explanation}</p>
              {built.note && <p className="text-sm text-gray-400">{built.note}</p>}
              {built.truncated && <p className="text-sm text-amber-300">That's at least how many: the roll was read as far as one ask reaches. Narrow it down (a value, a street or a zip) to count them all.</p>}
            </div>
            {built.rows.length > 0 && (
              <ul className="border border-[#333333] divide-y divide-[#333333]" aria-label="Preview">
                {built.rows.slice(0, 5).map((r) => (
                  <li key={r.key} className="px-3 py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-white truncate">{r.name}</span>
                      {/* The owner's holdings, not one building: what the list is sorted on. */}
                      <span className="text-gray-400 tabular-nums shrink-0">
                        {r.property || r.properties > 0 ? (
                          <>
                            {r.properties > 1 ? `${r.properties.toLocaleString('en-US')} properties · ` : ''}
                            {shortMoney(r.properties > 1 ? r.totalValueCents : r.property?.valueCents ?? r.totalValueCents)}
                          </>
                        ) : (
                          <span className="truncate">{r.company ?? ''}</span>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{r.property || r.properties > 0 ? mailingLine(r.mailing) : r.why}</div>
                  </li>
                ))}
                {built.count > 5 && <li className="px-3 py-2 text-xs text-gray-500">and {built.count - 5} more</li>}
              </ul>
            )}
            {/* The name and Save stay in view at the bottom of the sheet, however long the first look is. */}
            <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-[#121212] border-t border-[#333333] flex items-end gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider" htmlFor="outreach-title">
                  List title
                </label>
                <input id="outreach-title" value={built.title} onChange={(e) => setBuilt({ ...built, title: e.target.value })} className={`${field} min-h-[44px]`} maxLength={50} />
              </div>
              <button type="button" onClick={save} disabled={busy !== null || built.count === 0} className={`${primary} min-h-[44px] shrink-0`}>
                {busy === 'save' ? 'Saving…' : 'Save list'}
              </button>
            </div>
          </div>
        )}
      </div>
    </SlideOutDrawer>
  );
};
