import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { outreachAPI, type OutreachDefinition, type OutreachPreviewRow } from '../../lib/api';
import { defaultTitle, shortMoney } from '../../../convex/lib/outreach';
import { mailingLine } from './format';
import { GROUPS, forCounty, type Preset } from './presets';
import { countyOf, useCounty } from './county';
import { CountySwitch } from './CountySwitch';

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
  /** Save the built list; the page closes the sheet and opens the list once it exists (its first owners in, the rest arriving live). */
  onSave: (definition: OutreachDefinition, title: string) => Promise<void>;
  /** Opened from a card on the empty page: go straight to that list's count and preview. */
  start?: { preset: Preset } | null;
}> = ({ open, organizationId, onClose, onSave, start }) => {
  const [ask, setAsk] = useState('');
  /** Which county the lists are of: the company's working county, the same one the empty page's cards use. */
  const [county, setCounty] = useCounty(organizationId);
  const here = countyOf(county);
  /** A list built from a city's own records, in a county where they aren't connected yet. */
  const unavailable = (p: Preset) => Boolean(p.needsRecords) && !here.records;
  const [preset, setPreset] = useState<string | null>(null);
  /** The one row of ready-made lists that's open; the sheet opens to just the three headings. */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState<'build' | 'save' | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [cannot, setCannot] = useState<{ explanation: string; suggestion?: { definition: OutreachDefinition; title: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The choices or one list. A list picked (here or from a card on the page) takes the sheet at once, with
   * its name and empty rows filling in as the count arrives, instead of the choices flashing first.
   */
  const [view, setView] = useState<'choose' | 'result' | null>(null);
  const showResult = (view ?? (start ? 'result' : 'choose')) === 'result';
  /** What's being built, named while it counts. */
  const [pending, setPending] = useState('');
  /** Bumped by each new ask and by going back, so a count that arrives late for a list let go is dropped. */
  const asking = useRef(0);

  useEffect(() => {
    if (open) return;
    setAsk('');
    setPreset(null);
    setOpenGroup(null);
    setBuilt(null);
    setCannot(null);
    setError(null);
    setBusy(null);
    setView(null);
    setPending('');
  }, [open]);

  /** A ready-made list: the filter runs as written, straight to the count and preview. */
  const pick = async (p: Preset) => {
    const mine = ++asking.current;
    const definition = forCounty(p, county);
    setPreset(p.label);
    setPending(p.label);
    setView('result');
    setAsk('');
    setBusy('build');
    setError(null);
    setCannot(null);
    setBuilt(null);
    try {
      const got = await outreachAPI.preview(organizationId, definition);
      if (mine !== asking.current) return;
      setBuilt({ definition, title: defaultTitle(definition), explanation: p.explanation, count: got.count, total: got.total, truncated: got.truncated, limited: got.limited, rows: got.rows });
    } catch (err) {
      if (mine !== asking.current) return;
      setError(err instanceof Error ? err.message : "The list couldn't be built");
      setView('choose');
    } finally {
      if (mine === asking.current) setBusy(null);
    }
  };

  const build = async () => {
    if (!ask.trim()) return;
    const mine = ++asking.current;
    setPreset(null);
    setPending(ask.trim());
    setView('result');
    setBusy('build');
    setError(null);
    setCannot(null);
    setBuilt(null);
    try {
      const got = await outreachAPI.interpret(organizationId, ask.trim());
      if (mine !== asking.current) return;
      if (got.ok) setBuilt({ definition: got.definition, title: got.title, explanation: got.explanation, note: got.note, count: got.count, total: got.total, truncated: got.truncated, limited: got.limited, rows: got.preview });
      else {
        setCannot({ explanation: got.explanation, suggestion: got.suggestion });
        setView('choose');
      }
    } catch (err) {
      if (mine !== asking.current) return;
      setError(err instanceof Error ? err.message : "The list couldn't be built");
      setView('choose');
    } finally {
      if (mine === asking.current) setBusy(null);
    }
  };

  useEffect(() => {
    if (!open || !start) return;
    setOpenGroup(GROUPS.find((g) => g.presets.includes(start.preset))?.heading ?? null);
    void pick(start.preset);
    // Runs once per opening: pick and build only read state they set themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, start]);

  /** The list just counted, in another county: counted again there, its name following if it was the one made for it. */
  const moveTo = async (name: string) => {
    setCounty(name);
    if (!built) return;
    const was = built;
    const mine = ++asking.current;
    const definition = { ...was.definition, county: name };
    const title = was.title === defaultTitle(was.definition) ? defaultTitle(definition) : was.title;
    setPending(title);
    setBuilt(null);
    setBusy('build');
    setError(null);
    try {
      const got = await outreachAPI.preview(organizationId, definition);
      if (mine !== asking.current) return;
      setBuilt({ ...was, definition, title, count: got.count, total: got.total, truncated: got.truncated, limited: got.limited, rows: got.rows });
    } catch (err) {
      if (mine !== asking.current) return;
      setError(err instanceof Error ? err.message : "The list couldn't be built");
      setBuilt(was);
    } finally {
      if (mine === asking.current) setBusy(null);
    }
  };

  /** The nearest list the assistant could make instead of what was asked. */
  const buildClosest = async () => {
    if (!cannot?.suggestion) return;
    const { definition, title } = cannot.suggestion;
    const mine = ++asking.current;
    setPending(title);
    setView('result');
    setBusy('build');
    setError(null);
    try {
      const got = await outreachAPI.preview(organizationId, definition);
      if (mine !== asking.current) return;
      setBuilt({ definition, title, explanation: cannot.explanation, count: got.count, total: got.total, truncated: got.truncated, limited: got.limited, rows: got.rows });
      setCannot(null);
    } catch (err) {
      if (mine !== asking.current) return;
      setError(err instanceof Error ? err.message : "The list couldn't be built");
      setView('choose');
    } finally {
      if (mine === asking.current) setBusy(null);
    }
  };

  const save = async () => {
    if (!built) return;
    setBusy('save');
    setError(null);
    try {
      await onSave(built.definition, built.title.trim() || defaultTitle(built.definition));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list couldn't be saved");
      setBusy(null);
    }
  };

  // Which county, in so many words, before Save: tap it to count the same list in another.
  const inCounty = built && (
    <span className="text-base font-normal text-gray-400" data-testid="built-county">
      in <CountySwitch county={built.definition.county} onChange={(name) => void moveTo(name)} size="inline" short disabled={busy !== null} />
    </span>
  );

  return (
    <SlideOutDrawer isOpen={open} onClose={onClose} title="Ask for a list" width="lg">
      <div className="p-6 space-y-5 min-h-full flex flex-col">
        {/* Once a list is built it has the sheet to itself: the count, a first look and Save, no scrolling past the choices. */}
        {!showResult && (
          <>
        {/* Which county the lists are of: the company's working county, shared with the empty page. */}
        <div>
          <CountySwitch county={county} onChange={setCounty} />
        </div>
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
                          disabled={busy !== null || unavailable(p)}
                          aria-pressed={preset === p.label}
                          title={unavailable(p) ? `Not in ${here.label} yet: it needs the city's own records` : undefined}
                          className={`px-3 py-2 text-sm border disabled:opacity-50 ${preset === p.label ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333333] text-gray-300 hover:bg-[#2A2A2A]'}`}
                        >
                          {p.label}
                          {unavailable(p) && <span className="ml-1.5 text-xs text-gray-500">· not here yet</span>}
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
            <p className="text-xs text-gray-500">
              From the {here.label.replace(/, TX.*$/, '')} roll{here.records ? " and the city's permits and code cases" : ''}.
            </p>
            <button type="button" onClick={() => void build()} disabled={!ask.trim() || busy !== null} className={primary}>
              {busy === 'build' ? 'Building…' : 'Build'}
            </button>
          </div>
        </div>
          </>
        )}

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

        {showResult && (
          <div className="space-y-4 flex-1 flex flex-col" data-testid="built">
            <button
              type="button"
              onClick={() => {
                // Back to the choices as they first were, every row closed and none picked: the list just looked at is let go,
                // and its count, if still on the way, is dropped.
                asking.current++;
                setBuilt(null);
                setPreset(null);
                setOpenGroup(null);
                setBusy(null);
                setView('choose');
              }}
              disabled={busy === 'save'}
              className="inline-flex items-center gap-1 text-sm text-[#7fb0e0] hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" /> Pick a different list
            </button>
            {!built ? (
              // Counting: the list's name and empty rows, so the sheet doesn't jump when the owners arrive.
              <div className="space-y-4" aria-busy="true" data-testid="building">
                <div className="border border-[#333333] bg-[#1A1A1A] p-4 space-y-2">
                  <p className="text-lg font-semibold text-white">{pending}</p>
                  <p className="text-sm text-gray-400">Counting owners…</p>
                </div>
                <ul className="border border-[#333333] divide-y divide-[#333333]">
                  {Array.from({ length: 6 }, (_, i) => (
                    <li key={i} className="px-3 py-3 space-y-2 animate-pulse">
                      <div className="h-3.5 w-1/2 bg-[#2A2A2A]" />
                      <div className="h-2.5 w-3/4 bg-[#222222]" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
            <div className="border border-[#333333] bg-[#1A1A1A] p-4 space-y-1 animate-appear">
              <p className="text-lg font-semibold text-white">
                {built.total !== undefined && built.total > built.count ? (
                  <>
                    {built.total.toLocaleString('en-US')}
                    {built.truncated ? '+' : ''} owners {inCounty}
                    <span className="block text-sm font-normal text-gray-400">The first {built.count.toLocaleString('en-US')} load now, the rest from the saved list.</span>
                  </>
                ) : (
                  <>
                    {built.count} {built.count === 1 ? 'owner' : 'owners'} {inCounty}
                  </>
                )}
              </p>
              <p className="text-sm text-gray-300">{built.explanation}</p>
              {built.note && <p className="text-sm text-gray-400">{built.note}</p>}
              {built.truncated && <p className="text-sm text-amber-300">That's at least how many: the roll was read as far as one ask reaches. Narrow it down (a value, a street or a zip) to count them all.</p>}
            </div>
            {built.rows.length > 0 && (
              // The first look scrolls on its own, so the count above and Save below stay put.
              <ul className="border border-[#333333] divide-y divide-[#333333] max-h-[45vh] overflow-y-auto overscroll-contain" aria-label="Preview">
                {built.rows.map((r, i) => (
                  // The owners come in one after another, as the list fills.
                  <li key={r.key} className="px-3 py-2.5 text-sm animate-appear" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
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
                {built.count > built.rows.length && (
                  <li className="px-3 py-2 text-xs text-gray-500">
                    The first {built.rows.length} of {built.count.toLocaleString('en-US')}: save the list to see them all
                  </li>
                )}
              </ul>
            )}
            {/* The name and Save sit at the very bottom of the sheet, and stay in view however long the first look is. */}
            <div className="sticky bottom-0 !mt-auto -mx-6 -mb-6 px-6 py-4 bg-[#121212] border-t border-[#333333] flex items-end gap-3">
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
              </>
            )}
          </div>
        )}
      </div>
    </SlideOutDrawer>
  );
};
