import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { callsAPI } from '../../lib/api';
import { numbersIn } from '../../../convex/lib/calls';
import { input, secondary } from './ui';

type ListStatus = {
  list: 'national' | 'texas';
  label: string;
  count: number;
  uploadedAt?: string;
  fileName?: string;
  dueAt?: string;
  current: boolean;
};

type TallyRow = { callerId: string; name: string; email: string; calls: number; answered: number; leads: number; confirmed: number; sold: number };

const CHUNK = 5000;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');

/** Where each list comes from: staff download it and upload the file here. */
const WHERE: Record<ListStatus['list'], string> = {
  national: 'Download area code 432 from telemarketing.donotcall.gov (free for up to five area codes), at least every 31 days.',
  texas: "Buy the Texas no-call list from the Public Utility Commission each quarter.",
};

/**
 * The Calls tab: the Do Not Call lists callers are checked against (no
 * number is dialable until both are current), numbers to never call, and
 * how each caller's week went.
 */
export function CallsCard() {
  const [lists, setLists] = useState<ListStatus[] | null>(null);
  const [tally, setTally] = useState<TallyRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const files = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([callsAPI.dncStatus(), callsAPI.tally(7)]);
      setLists(l);
      setTally(t);
    } catch (err) {
      setNote(`The calls couldn't be loaded: ${errorText(err)}`);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const upload = async (list: ListStatus, file: File) => {
    setBusy(list.list);
    setNote(null);
    try {
      const numbers = numbersIn(await file.text());
      if (numbers.length === 0) throw new Error(`No 10-digit numbers were found in ${file.name}`);
      const batchId = await callsAPI.startDncImport(list.list, file.name);
      for (let i = 0; i < numbers.length; i += CHUNK) {
        setNote(`Uploading the ${list.label}: ${Math.min(i + CHUNK, numbers.length).toLocaleString()} of ${numbers.length.toLocaleString()}…`);
        await callsAPI.importDncChunk(batchId, numbers.slice(i, i + CHUNK));
      }
      await callsAPI.finishDncImport(batchId);
      setNote(`The ${list.label} is in: ${numbers.length.toLocaleString()} numbers.`);
      await load();
    } catch (err) {
      setNote(`The ${list.label} wasn't uploaded: ${errorText(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const block = async (e: React.FormEvent) => {
    e.preventDefault();
    setNote(null);
    try {
      await callsAPI.addDoNotCall(phone, 'Added in Ops');
      setNote(`${phone.trim()} won't be called again.`);
      setPhone('');
    } catch (err) {
      setNote(errorText(err));
    }
  };

  return (
    <div className="space-y-6">
      <section className="border border-[#2A2A2A] rounded p-4" aria-label="Do Not Call lists" data-testid="dnc-card">
        <h3 className="text-sm font-medium text-white">Do Not Call lists</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Callers can't dial anyone until both lists are current. A number on either list, or one that asked us not to call, is never dialable.
        </p>
        {lists === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <ul className="divide-y divide-[#2A2A2A]">
            {lists.map((l) => (
              <li key={l.list} className="py-3 flex flex-wrap items-center justify-between gap-3" data-testid={`dnc-${l.list}`}>
                <span className="min-w-0">
                  <span className="block text-sm text-white">{l.label}</span>
                  <span className={`block text-xs mt-0.5 ${l.current ? 'text-gray-500' : 'text-red-300'}`}>
                    {l.uploadedAt
                      ? `${l.count.toLocaleString()} numbers · uploaded ${day(l.uploadedAt)} · ${l.current ? `due again by ${day(l.dueAt!)}` : `out of date since ${day(l.dueAt!)}: calling is stopped`}`
                      : 'Not uploaded: calling is stopped.'}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">{WHERE[l.list]}</span>
                </span>
                <input
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  className="hidden"
                  aria-label={`Upload the ${l.label}`}
                  ref={(el) => {
                    files.current[l.list] = el;
                  }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) upload(l, file);
                  }}
                />
                <button type="button" className={secondary} disabled={busy !== null} onClick={() => files.current[l.list]?.click()}>
                  <Upload className="w-4 h-4" />
                  {busy === l.list ? 'Uploading…' : 'Upload'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={block} className="flex gap-2 mt-3">
          <input
            type="tel"
            aria-label="Number to never call"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Never call this number"
            className={`${input} flex-1 min-w-0`}
          />
          <button type="submit" className={secondary} disabled={!phone.trim()}>
            Add
          </button>
        </form>
        {note && (
          <p className="text-xs text-gray-300 mt-3" role="status">
            {note}
          </p>
        )}
      </section>

      <section className="border border-[#2A2A2A] rounded p-4" aria-label="Callers this week">
        <h3 className="text-sm font-medium text-white">Callers, last 7 days</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">Answered is anyone who picked up. A lead counts as confirmed once someone else checks it in Intake.</p>
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
    </div>
  );
}
