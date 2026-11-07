import React, { useCallback, useEffect, useState } from 'react';
import { foreclosuresAPI } from '../../lib/api';
import { saleLabel } from '../../../convex/lib/foreclosures';
import { input, primary, secondary } from './ui';

type Status = 'posted' | 'sold' | 'back_to_lender' | 'cancelled';

interface Home {
  id: string;
  address: string;
  kind: 'mortgage' | 'tax';
  status: Status;
  buyer?: { name: string; company: boolean; phone?: string };
  salePriceCents?: number;
  matched: boolean;
  ownerOnRoll?: string;
  marketValueCents?: number;
}

interface Sale {
  saleDate: string;
  saleDates: string[];
  homes: Home[];
}

const STATUS_LABEL: Record<Status, string> = {
  posted: 'Posted',
  sold: 'Sold',
  back_to_lender: 'Back to the lender',
  cancelled: 'Cancelled',
};

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');
const dollars = (cents?: number) => (cents ? `$${Math.round(cents / 100).toLocaleString()}` : '');

/** One home on the sale: what happened, and who bought it once the deed is recorded. */
function HomeRow({ home, onSaved, onError }: { home: Home; onSaved: () => void; onError: (message: string) => void }) {
  const [status, setStatus] = useState<Status>(home.status);
  const [buyer, setBuyer] = useState(home.buyer?.name ?? '');
  const [company, setCompany] = useState(home.buyer?.company ?? true);
  const [phone, setPhone] = useState(home.buyer?.phone ?? '');
  const [price, setPrice] = useState(home.salePriceCents ? String(Math.round(home.salePriceCents / 100)) : '');
  const [busy, setBusy] = useState(false);

  const save = async (next: Status = status) => {
    setBusy(true);
    try {
      await foreclosuresAPI.update({
        id: home.id,
        status: next,
        ...(next === 'sold' && buyer.trim() ? { buyer: { name: buyer, company, phone: phone || undefined } } : {}),
        ...(next === 'sold' && price.trim() ? { salePriceCents: Math.round(Number(price.replace(/[$,]/g, '')) * 100) } : {}),
      });
      onSaved();
    } catch (err) {
      onError(`${home.address} wasn't saved: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3 space-y-2" data-testid="auction-home">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm text-white">{home.address}</span>
          <span className="block text-xs text-gray-500">
            {home.kind === 'tax' ? 'Tax sale' : 'Mortgage'}
            {home.matched ? ` · on the roll as ${home.ownerOnRoll}${home.marketValueCents ? `, worth ${dollars(home.marketValueCents)}` : ''}` : ' · not found on the appraisal roll'}
          </span>
        </span>
        <select
          aria-label={`What happened to ${home.address}`}
          value={status}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value as Status;
            setStatus(next);
            if (next !== 'sold') save(next);
          }}
          className="bg-[#181818] border border-[#333] rounded px-2 py-1.5 text-sm text-white"
        >
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {status === 'sold' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
          <input aria-label="Buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Buyer" className={input} />
          <input aria-label="Buyer phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Buyer phone" className={input} />
          <input aria-label="Sale price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price ($)" className={input} />
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-300">
              <input type="checkbox" checked={company} onChange={(e) => setCompany(e.target.checked)} />
              Company
            </label>
            <button type="button" className={secondary} disabled={busy} onClick={() => save('sold')}>
              Save
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

/**
 * Midland's monthly courthouse foreclosure auction, kept by hand: paste the
 * homes posted for a sale, then mark what happened and who bought. Feeds
 * the Webb Report's auction line and the callers' "Auction buyers"
 * list. The owners of posted homes are never called.
 */
export function AuctionCard() {
  const [sale, setSale] = useState<Sale | null>(null);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [kind, setKind] = useState<'mortgage' | 'tax'>('mortgage');
  const [pasted, setPasted] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (saleDate?: string) => {
    try {
      setSale(await foreclosuresAPI.sale(saleDate));
    } catch (err) {
      setNote(`The auction list couldn't be loaded: ${errorText(err)}`);
    }
  }, []);
  useEffect(() => {
    load(date);
  }, [load, date]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sale) return;
    setBusy(true);
    setNote(null);
    try {
      const r: { added: number; skipped: number; unmatched: string[] } = await foreclosuresAPI.addMany(sale.saleDate, kind, pasted);
      setNote(
        [
          `Added ${r.added} for ${saleLabel(sale.saleDate)}`,
          r.skipped ? `${r.skipped} already on it` : '',
          r.unmatched.length ? `not on the appraisal roll: ${r.unmatched.join('; ')}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
      setPasted('');
      await load(sale.saleDate);
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const counts = sale?.homes.reduce<Record<Status, number>>((c, h) => ({ ...c, [h.status]: (c[h.status] ?? 0) + 1 }), { posted: 0, sold: 0, back_to_lender: 0, cancelled: 0 });

  return (
    <section className="border border-[#2A2A2A] rounded p-4" aria-label="Courthouse auction" data-testid="auction-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span>
          <h3 className="text-sm font-medium text-white">Courthouse auction</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
            Midland's foreclosure sales, the first Tuesday of each month. Find the posted homes at midland.tx.publicsearch.us, Foreclosures, by sale date;
            who bought shows once the trustee's deed is recorded. Owners of posted homes are never called; buyers go on the callers' Auction buyers list.
          </p>
        </span>
        {sale && (
          <select
            aria-label="Sale date"
            value={sale.saleDate}
            onChange={(e) => setDate(e.target.value)}
            className="bg-[#181818] border border-[#333] rounded px-2 py-1.5 text-sm text-white"
          >
            {sale.saleDates.map((d, i) => (
              <option key={d} value={d}>
                {saleLabel(d)}
                {i === 0 ? ' (next)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <form onSubmit={add} className="mt-3 space-y-2">
        <textarea
          aria-label="Posted addresses"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={3}
          placeholder="One address a line"
          className={input}
        />
        <div className="flex gap-2">
          <select aria-label="Kind of sale" value={kind} onChange={(e) => setKind(e.target.value as 'mortgage' | 'tax')} className="bg-[#181818] border border-[#333] rounded px-2 py-1.5 text-sm text-white">
            <option value="mortgage">Mortgage</option>
            <option value="tax">Tax sale</option>
          </select>
          <button type="submit" className={primary} disabled={busy || !pasted.trim() || !sale}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
      {note && (
        <p className="text-xs text-gray-300 mt-2" role="status">
          {note}
        </p>
      )}

      {sale === null ? (
        <p className="text-sm text-gray-500 mt-3">Loading…</p>
      ) : sale.homes.length === 0 ? (
        <p className="text-sm text-gray-500 mt-3">Nothing added for {saleLabel(sale.saleDate)} yet.</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mt-3" data-testid="auction-counts">
            {saleLabel(sale.saleDate)}: {sale.homes.length} posted
            {counts && counts.sold ? ` · ${counts.sold} sold` : ''}
            {counts && counts.back_to_lender ? ` · ${counts.back_to_lender} back to the lender` : ''}
            {counts && counts.cancelled ? ` · ${counts.cancelled} cancelled` : ''}
          </p>
          <ul className="divide-y divide-[#2A2A2A]">
            {sale.homes.map((h) => (
              <HomeRow key={`${h.id}-${h.status}`} home={h} onSaved={() => load(sale.saleDate)} onError={setNote} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
