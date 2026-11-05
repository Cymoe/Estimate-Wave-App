import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { AddressLink } from '../common/AddressLink';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { fullAddress } from '../../lib/mapsLinks';
import type { OutreachRow, OutreachRowStatus } from '../../lib/api';
import { shortMoney } from '../../../convex/lib/outreach';
import { mailingLine } from './format';

const STATUS_LABEL: Record<OutreachRowStatus, string> = { new: 'New', sent: 'Sent', done: 'Done', skip: 'Skipped' };
const STATUSES: OutreachRowStatus[] = ['new', 'sent', 'done', 'skip'];

const statusTone = (s: OutreachRowStatus) => (s === 'done' ? 'text-[#7fb0e0]' : s === 'skip' ? 'text-gray-600' : s === 'sent' ? 'text-amber-300' : 'text-gray-500');

/** The people on a list, one row each; tap for the addresses and to mark it worked. */
export const OutreachRows: React.FC<{ rows: OutreachRow[]; onOpen: (row: OutreachRow) => void }> = ({ rows, onOpen }) => (
  <ul className="bg-[#121212] border border-[#333333] divide-y divide-[#333333]" aria-label="People on the list">
    {rows.map((r) => (
      <li key={r.id}>
        <button type="button" onClick={() => onOpen(r)} className="w-full text-left px-4 py-3 hover:bg-[#1A1A1A]" data-testid="outreach-row">
          <div className="flex items-baseline justify-between gap-3">
            <span className={`text-[15px] truncate ${r.status === 'skip' ? 'text-gray-500 line-through' : 'text-white'}`}>{r.name}</span>
            <span className={`text-xs shrink-0 ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span>
          </div>
          <div className="text-sm text-gray-400 truncate">{mailingLine(r.mailing)}</div>
          <div className="text-xs text-gray-500 truncate">
            {r.property.address}
            {r.property.valueCents ? ` · ${shortMoney(r.property.valueCents)}` : ''}
            {r.properties > 1 ? ` · ${r.properties} properties` : ''}
            {' · '}
            {r.why}
          </div>
        </button>
      </li>
    ))}
  </ul>
);

/** One person on the list: both addresses in Apple Maps, the status, a note. */
export const RowSheet: React.FC<{
  row: OutreachRow | null;
  onClose: () => void;
  onStatus: (row: OutreachRow, status: OutreachRowStatus, note: string) => Promise<void>;
}> = ({ row, onClose, onStatus }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setNote(row?.note ?? '');
    setError(null);
  }, [row]);
  if (!row) return null;
  const set = async (status: OutreachRowStatus) => {
    setBusy(true);
    setError(null);
    try {
      await onStatus(row, status, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  };
  const property = fullAddress(row.property.address, 'Midland', 'TX');
  const mailing = fullAddress(row.mailing.address, row.mailing.city, row.mailing.state, row.mailing.zip?.slice(0, 5));
  const link = 'inline-flex items-center gap-2 text-[15px] text-[#7fb0e0] min-h-[44px]';
  return (
    <SlideOutDrawer isOpen onClose={onClose} title={row.name} width="md">
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-300">{row.why}</p>
        <div className="divide-y divide-[#333333] border-y border-[#333333]">
          <div className="py-3">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Mail to</div>
            {mailing ? (
              <AddressLink address={mailing} className={link}>
                <MapPin className="w-4 h-4 shrink-0" /> {mailing}
              </AddressLink>
            ) : (
              <p className="text-sm text-gray-500">No mailing address on the roll.</p>
            )}
          </div>
          <div className="py-3">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Property</div>
            <AddressLink address={property} className={link}>
              <MapPin className="w-4 h-4 shrink-0" /> {row.property.address}
            </AddressLink>
            <div className="text-sm text-gray-400">
              {row.property.valueCents ? `Worth ${shortMoney(row.property.valueCents)}` : ''}
              {row.properties > 1 ? `${row.property.valueCents ? ' · ' : ''}${row.properties} properties, ${shortMoney(row.totalValueCents)} in all` : ''}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider" htmlFor="outreach-note">
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
