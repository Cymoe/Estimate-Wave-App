import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { publicEstimatesAPI, type Allowance } from '../../lib/api';
import { formatCurrency } from '../../utils/format';
import type { Lang } from '../../../convex/lib/i18n';
import { formatDay } from '../../i18n/lang';
import { SHARE, refusalText } from '../../i18n/share';

/** How far a pick comes to over or under its allowance, in words. */
function differenceText(difference: number | undefined, t: (typeof SHARE)['en']['picks']): string | null {
  if (difference === undefined) return null;
  if (Math.abs(difference) < 0.005) return t.even;
  return difference > 0 ? t.over(formatCurrency(difference)) : t.under(formatCurrency(-difference));
}

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-600';

/** One allowance: what's included, the client's pick, and the form to send or change it. */
function AllowanceRow({
  token,
  allowance,
  lang,
  canPick,
  onPicked,
}: {
  token: string;
  allowance: Allowance;
  lang: Lang;
  canPick: boolean;
  onPicked: () => Promise<void>;
}) {
  const t = SHARE[lang].picks;
  const pick = allowance.pick;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(pick?.url ?? '');
  const [name, setName] = useState(pick?.name ?? '');
  const [price, setPrice] = useState(pick?.unitPrice !== undefined ? String(pick.unitPrice) : '');
  const [note, setNote] = useState(pick?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const perUnit = allowance.quantity !== 1;
  const approved = pick?.status === 'approved';
  const difference = differenceText(pick?.difference, t);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = price.trim() === '' ? undefined : Number(price.replace(/[$,]/g, ''));
    setBusy(true);
    setMessage(null);
    try {
      await publicEstimatesAPI.pick(token, allowance.itemId, {
        url,
        name: name.trim() || undefined,
        unitPrice: typed !== undefined && Number.isFinite(typed) ? typed : undefined,
        note: note.trim() || undefined,
      });
      await onPicked();
      setOpen(false);
      setMessage(t.sent);
    } catch (err) {
      setMessage(refusalText(err, lang, t.failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-4" data-testid="allowance">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium text-gray-900">{allowance.description}</span>
        <span className="text-sm text-gray-700">
          {t.included(formatCurrency(allowance.allowanceTotal))}
          {perUnit && <span className="text-gray-500"> · {t.each(allowance.quantity, formatCurrency(allowance.allowanceUnitPrice))}</span>}
        </span>
      </div>
      {allowance.pickBy && !approved && <p className="text-sm text-amber-700 mt-0.5">{t.pickBy(formatDay(allowance.pickBy, lang))}</p>}

      {pick && !open && (
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm" data-testid="allowance-pick">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-gray-900">{pick.name || t.link}</span>
            <a
              href={pick.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline print:hidden"
            >
              {t.open} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          {(approved ? pick.approvedUnitPrice : pick.unitPrice) !== undefined && (
            <p className="text-gray-700 mt-0.5">
              {perUnit
                ? t.each(allowance.quantity, formatCurrency((approved ? pick.approvedUnitPrice : pick.unitPrice) ?? 0))
                : formatCurrency((approved ? pick.approvedUnitPrice : pick.unitPrice) ?? 0)}
              {difference && <span className={(pick.difference ?? 0) > 0 ? 'text-amber-700' : 'text-green-700'}> · {difference}</span>}
            </p>
          )}
          {pick.note && <p className="text-gray-500 mt-0.5">{pick.note}</p>}
          <p className={`mt-1 text-xs ${approved ? 'text-green-700' : 'text-gray-500'}`}>{approved ? t.approved : t.waiting}</p>
        </div>
      )}

      {canPick && !approved && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 print:hidden"
        >
          {pick ? t.change : t.pickYours}
        </button>
      )}

      {open && (
        <form onSubmit={send} className="mt-3 space-y-3 print:hidden" data-testid="allowance-form">
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.link}</span>
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className={field}
            />
            <span className="block text-xs text-gray-500 mt-1">{t.linkHint}</span>
          </label>
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.name}</span>
            <input
              type="text"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className={field}
            />
          </label>
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.price(perUnit)}</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="$"
              className={`${field} max-w-[10rem]`}
            />
          </label>
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.note}</span>
            <input type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? t.sending : t.send}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-sm text-gray-600 hover:text-gray-900">
              {t.cancel}
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="text-sm text-gray-600 mt-2" role="status">
          {message}
        </p>
      )}
    </li>
  );
}

/**
 * The client's selections on their estimate link: each allowance (tile, a
 * faucet) with what's included, and a place to send a link to what they chose.
 */
export const AllowancePicks: React.FC<{ token: string; allowances: Allowance[]; lang: Lang; canPick: boolean; onPicked: () => Promise<void> }> = ({
  token,
  allowances,
  lang,
  canPick,
  onPicked,
}) => {
  if (allowances.length === 0) return null;
  const t = SHARE[lang].picks;
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 print:shadow-none" data-testid="allowance-picks">
      <h3 className="text-lg font-semibold text-gray-900">{t.title}</h3>
      <p className="text-sm text-gray-600 mt-1">{t.intro}</p>
      <ul className="divide-y divide-gray-200">
        {allowances.map((allowance) => (
          <AllowanceRow key={allowance.itemId} token={token} allowance={allowance} lang={lang} canPick={canPick} onPicked={onPicked} />
        ))}
      </ul>
    </div>
  );
};
