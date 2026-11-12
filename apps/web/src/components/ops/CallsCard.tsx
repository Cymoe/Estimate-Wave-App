import React, { useEffect, useState } from 'react';
import { callsAPI } from '../../lib/api';

type TallyRow = { callerId: string; name: string; email: string; calls: number; answered: number; leads: number; confirmed: number; sold: number };

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');

/** How each caller's last 7 days went, under the calling screen on the Ops Calls tab. */
export function CallsCard() {
  const [tally, setTally] = useState<TallyRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    callsAPI
      .tally(7)
      .then(setTally)
      .catch((err) => setNote(`The caller tally couldn't be loaded: ${errorText(err)}`));
  }, []);

  return (
    <section className="border border-[#2A2A2A] rounded p-4" aria-label="Callers this week">
      <h3 className="text-sm font-medium text-white">Callers, last 7 days</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">Answered is anyone who picked up. A lead counts as confirmed once someone else checks it in Intake.</p>
      {note && <p className="text-xs text-gray-300 mb-2">{note}</p>}
      {tally === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : tally.length === 0 ? (
        <p className="text-sm text-gray-500">No calls yet. Invite a caller from the Team card on the Companies tab.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Caller tally">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 pr-3 font-normal">Caller</th>
                <th className="py-1 pr-3 font-normal text-right">Calls</th>
                <th className="py-1 pr-3 font-normal text-right">Answered</th>
                <th className="py-1 pr-3 font-normal text-right">Leads</th>
                <th className="py-1 pr-3 font-normal text-right">Confirmed</th>
                <th className="py-1 font-normal text-right">Sold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]">
              {tally.map((r) => (
                <tr key={r.callerId}>
                  <td className="py-2 pr-3 text-white">{r.name}</td>
                  <td className="py-2 pr-3 text-right">{r.calls}</td>
                  <td className="py-2 pr-3 text-right">{r.answered}</td>
                  <td className="py-2 pr-3 text-right">{r.leads}</td>
                  <td className="py-2 pr-3 text-right">{r.confirmed}</td>
                  <td className="py-2 text-right">{r.sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
