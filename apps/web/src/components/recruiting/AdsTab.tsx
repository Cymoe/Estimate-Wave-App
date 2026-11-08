import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { recruitingAPI, type RecruitAdPerformance, type RecruitAds } from '../../lib/api';
import { input, primary, secondary } from '../ops/ui';
import { copy, errorText, KIND_LABEL } from './labels';

const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`);

/** How the approved ads are doing, with the spend box for each. */
function Performance({ rows, onSpend }: { rows: RecruitAdPerformance[]; onSpend: (id: string, dollars: number) => void }) {
  const [spend, setSpend] = useState<Record<string, string>>({});
  if (rows.length === 0) return <p className="text-sm text-gray-500">No ads approved or running yet.</p>;
  return (
    <div className="overflow-x-auto border border-[#2A2A2A] rounded">
      <table className="w-full text-sm" data-testid="ad-performance">
        <thead className="text-xs text-gray-500 text-left">
          <tr>
            {['Source ad id', 'Angle', 'Applicants', "A's", 'A rate', 'Booked', 'Show rate', 'Spend', "A's / $100"].map((h) => (
              <th key={h} className="px-3 py-2 font-normal whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2A2A2A]">
          {rows.map((r) => (
            <tr key={r.sourceAdId} className={r.status === 'retired' ? 'text-gray-500' : 'text-gray-200'}>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.sourceAdId}
                {r.status === 'retired' ? ' (retired)' : ''}
              </td>
              <td className="px-3 py-2">{r.angle ?? '–'}</td>
              <td className="px-3 py-2">{r.applicants}</td>
              <td className="px-3 py-2">{r.A}</td>
              <td className="px-3 py-2">{pct(r.aRate)}</td>
              <td className="px-3 py-2">{r.booked}</td>
              <td className="px-3 py-2">{pct(r.showRate)}</td>
              <td className="px-3 py-2">
                {r.status === 'approved' ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = Number(spend[r.sourceAdId]);
                      if (Number.isFinite(v) && v >= 0) onSpend(r.sourceAdId, v);
                    }}
                  >
                    $
                    <input
                      className="w-20 bg-[#1A1A1A] border border-[#333] rounded px-1 py-0.5 text-sm"
                      inputMode="decimal"
                      aria-label={`Spend on ${r.sourceAdId}`}
                      value={spend[r.sourceAdId] ?? (r.spendCents ? String(r.spendCents / 100) : '')}
                      onChange={(e) => setSpend((s) => ({ ...s, [r.sourceAdId]: e.target.value }))}
                    />
                  </form>
                ) : r.spendCents ? (
                  `$${Math.round(r.spendCents / 100)}`
                ) : (
                  '–'
                )}
              </td>
              <td className="px-3 py-2">{r.aPer100 === null ? '–' : r.aPer100.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdsTab() {
  const [data, setData] = useState<RecruitAds | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => recruitingAPI.watchAds(setData, (e) => setError(e.message)), []);

  const act = async (f: () => Promise<unknown>, done?: (r: unknown) => string) => {
    setError(null);
    try {
      const r = await f();
      if (done) setNote(done(r));
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (!data) return <p className="text-sm text-gray-400">{error ?? 'Loading…'}</p>;
  if (data.clients.length === 0) return <p className="text-sm text-gray-400">Add a client first (Clients tab), with its comp sheet and rep stories.</p>;

  const handOff = data.approved.map((a) => `${a.sourceAdId} · ${a.client} · ${KIND_LABEL[a.kind]?.replace(/s$/, '') ?? a.kind} · ${a.angle}\n${a.title ? `${a.title}\n` : ''}${a.body}`).join('\n\n---\n\n');
  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-400">Nothing runs until it&apos;s approved here. Approving gives the ad its source ad id: put it on the live ad so applicants trace back to it.</p>
      {note && (
        <p className="text-sm text-emerald-300" role="status">
          {note}
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data.clients.map((c) => {
        const clean = c.drafts.filter((d) => d.warnings.length === 0).length;
        return (
          <section key={c.client.id} className="space-y-3" data-testid="ads-client">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2A2A] pb-2">
              <h3 className="text-base font-semibold text-white">{c.client.name}</h3>
              {c.writing ? (
                <span className="text-sm text-[#7fb0e0]">Writing a batch…</span>
              ) : (
                <button type="button" className={secondary} onClick={() => void act(() => recruitingAPI.writeBatch(c.client.id), () => 'Writing a new batch: it shows here in a minute or two.')}>
                  Write a new batch now
                </button>
              )}
            </div>
            {c.failed && <p className="text-sm text-red-400">The last batch failed: {c.failed}</p>}
            {c.latest && (
              <div className="border-l-2 border-[#336699] pl-3 text-sm text-gray-300">
                <p className="text-gray-400">
                  Latest batch, {new Date(c.latest.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: {c.latest.variations} riffs on winners, {c.latest.fresh} new angles.
                </p>
                {c.latest.problems.length > 0 && <p className="text-amber-300">{c.latest.problems.join('; ')}</p>}
                {c.latest.learningNotes && <p className="whitespace-pre-wrap mt-1">{c.latest.learningNotes}</p>}
              </div>
            )}
            {c.drafts.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-300">{c.drafts.length} to review</span>
                  {clean > 0 && (
                    <button type="button" className={primary} onClick={() => void act(() => recruitingAPI.approveClean(c.client.id), (r) => `Approved ${(r as string[]).length}: ${(r as string[]).join(', ')}`)}>
                      Approve the {clean} without warnings
                    </button>
                  )}
                </div>
                {Object.keys(KIND_LABEL).map((kind) => {
                  const drafts = c.drafts.filter((d) => d.kind === kind);
                  if (drafts.length === 0) return null;
                  return (
                    <div key={kind}>
                      <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                        {KIND_LABEL[kind]} · {drafts.length}
                      </h4>
                      <ul className="space-y-2">
                        {drafts.map((d) => (
                          <li key={d.id} className={`border rounded p-3 bg-[#121212] ${d.warnings.length ? 'border-amber-500/50' : 'border-[#2A2A2A]'}`} data-testid="ad-draft">
                            <p className="text-xs text-gray-500">
                              <span className="px-1.5 py-0.5 rounded bg-[#336699]/20 text-[#cfe2f5]">{d.angle}</span> {d.variationOf ? `riff on ${d.variationOf}` : 'new angle'}
                            </p>
                            {d.title && <p className="text-sm font-medium text-white mt-2">{d.title}</p>}
                            <p className="text-sm text-gray-200 whitespace-pre-wrap mt-1">{d.body}</p>
                            {d.warnings.length > 0 && (
                              <ul className="mt-2 text-xs text-amber-300 list-disc pl-4">
                                {d.warnings.map((w) => (
                                  <li key={w}>{w}</li>
                                ))}
                              </ul>
                            )}
                            <div className="flex gap-2 mt-3">
                              <button type="button" className={primary} onClick={() => void act(() => recruitingAPI.decideAd(d.id, 'approve'), (id) => `Approved: its source ad id is ${String(id)}.`)}>
                                Approve
                              </button>
                              <button type="button" className={secondary} onClick={() => void act(() => recruitingAPI.decideAd(d.id, 'reject'))}>
                                Reject
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </>
            ) : (
              <p className="text-sm text-gray-500">Nothing waiting for review.</p>
            )}
            {c.retire.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Suggested to retire</h4>
                <ul className="space-y-2">
                  {c.retire.map((r) => (
                    <li key={r.sourceAdId} className="flex flex-wrap items-center justify-between gap-2 border border-[#2A2A2A] rounded p-3 text-sm">
                      <span className="text-gray-200">
                        <b>{r.sourceAdId}</b>: {r.reason}
                      </span>
                      <button type="button" className={secondary} onClick={() => void act(() => recruitingAPI.retireAd(r.sourceAdId), () => `Retired ${r.sourceAdId}. Tell the media buyer to turn it off.`)}>
                        Retire it
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <h4 className="text-xs uppercase tracking-wide text-gray-500">How the ads are doing</h4>
            <Performance rows={c.performance} onSpend={(id, dollars) => void act(() => recruitingAPI.setSpend(id, dollars), () => `Spend on ${id} saved.`)} />
          </section>
        );
      })}
      {data.approved.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Approved ({data.approved.length})</h3>
            <button type="button" className={secondary} onClick={() => void copy(handOff).then((ok) => setNote(ok ? 'Copied every approved ad, with its source ad id, for the video team and the media buyer.' : "Couldn't copy."))}>
              <Copy className="w-4 h-4" /> Copy all for the hand-off
            </button>
          </div>
          <textarea readOnly className={`${input} min-h-[120px] text-xs`} value={handOff} aria-label="Approved ads" />
        </section>
      )}
    </div>
  );
}
