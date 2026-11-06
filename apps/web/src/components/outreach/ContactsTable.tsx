import React, { useEffect, useState } from 'react';
import { Lock, MapPin } from 'lucide-react';
import { AddressLink } from '../common/AddressLink';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { fullAddress } from '../../lib/mapsLinks';
import type { OutreachContact, OutreachRowStatus, OutreachWho } from '../../lib/api';
import { shortMoney, WHO_LABEL } from '../../../convex/lib/outreach';
import { phoneText } from './format';

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

const statusTone = (s: OutreachRowStatus) => (s === 'done' ? 'text-[#7fb0e0]' : s === 'skip' ? 'text-gray-600' : s === 'sent' ? 'text-amber-300' : 'text-gray-500');
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const kindsText = (kinds: OutreachWho[]) => kinds.map((k) => KIND[k]).join(', ');

/** What the Phone and Email cells say before, during and after an unlock. */
function contactCell(c: OutreachContact, which: 'phone' | 'email'): { text: string; tone: string } {
  const found = which === 'phone' ? c.phones[0] && phoneText(c.phones[0].number) : c.emails[0]?.email;
  if (found) return { text: found, tone: 'text-white' };
  switch (c.unlock?.status) {
    case 'pending':
      return { text: 'Looking…', tone: 'text-gray-500' };
    case 'found':
    case 'none':
      return { text: 'None found', tone: 'text-gray-600' };
    case 'failed':
      return { text: 'Try again', tone: 'text-amber-300' };
    default:
      return { text: 'Locked', tone: 'text-gray-600' };
  }
}

const th = 'font-medium px-3 py-2 whitespace-nowrap';
const td = 'px-3 py-2 whitespace-nowrap';

/** The CRM: one row per owner, with the columns a mail merge or a call sheet needs. Tap a row for the sheet; tick rows to unlock them. */
export const ContactsTable: React.FC<{
  rows: OutreachContact[];
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  onOpen: (row: OutreachContact) => void;
}> = ({ rows, selected, onSelect, onSelectAll, onOpen }) => {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className="bg-[#121212] border border-[#333333] overflow-x-auto">
      <table className="w-full min-w-[72rem] text-sm" aria-label="Contacts">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-[#333333]">
            <th className="px-3 py-2 w-10">
              <input type="checkbox" checked={all} onChange={(e) => onSelectAll(e.target.checked)} aria-label="Select all" className="accent-[#336699]" />
            </th>
            <th className={th}>Name</th>
            <th className={th}>Mailing address</th>
            <th className={th}>City</th>
            <th className={th}>State</th>
            <th className={th}>Zip</th>
            <th className={th}>Property</th>
            <th className={`${th} text-right`}>Value</th>
            <th className={th}>Type</th>
            <th className={th}>Phone</th>
            <th className={th}>Email</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#333333]">
          {rows.map((r) => {
            const phone = contactCell(r, 'phone');
            const email = contactCell(r, 'email');
            return (
              <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer hover:bg-[#1A1A1A]" data-testid="contact-row">
                <td className={td} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => onSelect(r.id, e.target.checked)}
                    aria-label={`Select ${r.name}`}
                    className="accent-[#336699]"
                  />
                </td>
                <td className={`${td} max-w-[16rem] truncate ${r.status === 'skip' ? 'text-gray-500 line-through' : 'text-white'}`}>{r.name}</td>
                <td className={`${td} max-w-[14rem] truncate text-gray-300`}>{r.mailing.address ?? ''}</td>
                <td className={`${td} text-gray-300`}>{r.mailing.city ?? ''}</td>
                <td className={`${td} text-gray-300`}>{r.mailing.state ?? ''}</td>
                <td className={`${td} text-gray-300`}>{r.mailing.zip?.slice(0, 5) ?? ''}</td>
                <td className={`${td} max-w-[14rem] truncate text-gray-300`}>
                  {r.property.address}
                  {r.properties > 1 ? <span className="text-gray-500"> +{r.properties - 1}</span> : null}
                </td>
                <td className={`${td} text-right tabular-nums text-gray-300`}>{r.property.valueCents ? shortMoney(r.property.valueCents) : ''}</td>
                <td className={`${td} text-gray-400`}>{kindsText(r.kinds)}</td>
                <td className={`${td} ${phone.tone}`}>{phone.text}</td>
                <td className={`${td} max-w-[14rem] truncate ${email.tone}`}>{email.text}</td>
                <td className={`${td} ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** One owner: both addresses in Apple Maps, the phones and emails (or the unlock), the status, a note. */
export const ContactSheet: React.FC<{
  row: OutreachContact | null;
  unlockCents: number;
  balanceCents: number;
  onClose: () => void;
  onStatus: (row: OutreachContact, status: OutreachRowStatus, note: string) => Promise<void>;
  onUnlock: (row: OutreachContact) => Promise<void>;
  onAddFunds: () => void;
}> = ({ row, unlockCents, balanceCents, onClose, onStatus, onUnlock, onAddFunds }) => {
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
  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUnlock(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start that");
    } finally {
      setBusy(false);
    }
  };
  const property = fullAddress(row.property.address, 'Midland', 'TX');
  const mailing = fullAddress(row.mailing.address, row.mailing.city, row.mailing.state, row.mailing.zip?.slice(0, 5));
  const link = 'inline-flex items-center gap-2 text-[15px] text-[#7fb0e0] min-h-[44px]';
  const label = 'text-xs font-medium text-gray-400 uppercase tracking-wider';
  const unlocked = row.phones.length > 0 || row.emails.length > 0;
  const canPay = balanceCents >= unlockCents;
  return (
    <SlideOutDrawer isOpen onClose={onClose} title={row.name} width="md">
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-300">
          {row.why}
          {row.kinds.length ? <span className="text-gray-500"> · {row.kinds.map((k) => WHO_LABEL[k]).join(', ')}</span> : null}
        </p>
        <div className="divide-y divide-[#333333] border-y border-[#333333]">
          <div className="py-3" data-testid="contact-details">
            <div className={label}>Phone & email</div>
            {unlocked ? (
              <ul className="space-y-1">
                {row.phones.map((p) => (
                  <li key={p.number}>
                    <a href={`tel:${p.number}`} className={link}>
                      {phoneText(p.number)}
                      <span className="text-sm text-gray-500">
                        {p.type ?? ''}
                        {p.dnc ? ' · do not call' : ''}
                      </span>
                    </a>
                  </li>
                ))}
                {row.emails.map((e) => (
                  <li key={e.email}>
                    <a href={`mailto:${e.email}`} className={link}>
                      {e.email}
                    </a>
                  </li>
                ))}
                {row.phones.length === 0 && <li className="text-sm text-gray-500">No phone found; the email was free.</li>}
              </ul>
            ) : row.unlock?.status === 'pending' ? (
              <p className="text-sm text-gray-400">Looking up the phone and email… this takes a few seconds.</p>
            ) : row.unlock?.status === 'none' ? (
              <p className="text-sm text-gray-500">No phone or email found for this owner. Nothing was charged.</p>
            ) : (
              <div className="space-y-2">
                {row.unlock?.status === 'failed' && <p className="text-sm text-amber-300">{row.unlock.error ?? "The lookup didn't go through."} Nothing was charged.</p>}
                <button
                  type="button"
                  onClick={unlock}
                  disabled={busy || !canPay}
                  className="inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
                >
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
