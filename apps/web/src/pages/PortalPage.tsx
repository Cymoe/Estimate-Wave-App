import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, ExternalLink, FileText, Mail, Phone } from 'lucide-react';
import { LegalLinks } from './Legal';
import { portalAPI, type PortalAsk, type PortalView } from '../lib/api';
import { formatCurrency } from '../utils/format';
import { LightPage } from '../components/common/LightPage';
import { LangProvider, LangToggle } from '../i18n';
import { formatDay, useLang } from '../i18n/lang';
import { PORTAL } from '../i18n/portal';
import { refusalText } from '../i18n/share';
import type { Lang } from '../../convex/lib/i18n';

type Strings = (typeof PORTAL)['en'];
type SelectionAsk = Extract<PortalAsk, { kind: 'selection' }>;

const card = 'bg-white rounded-lg shadow-sm border border-gray-200';
const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-600';

/** How far a pick comes to over or under what's included, in words. */
function versus(difference: number, t: Strings['picks']) {
  if (Math.abs(difference) < 0.005) return t.even;
  return difference > 0 ? t.over(formatCurrency(difference)) : t.under(formatCurrency(-difference));
}

/** Something the company asked the client to pick: what's included, and a link to what they chose. */
function PickCard({ token, ask, lang, onPicked }: { token: string; ask: SelectionAsk; lang: Lang; onPicked: () => Promise<void> }) {
  const t = PORTAL[lang].picks;
  const pick = ask.pick;
  const perUnit = ask.quantity !== 1;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(pick?.url ?? '');
  const [name, setName] = useState(pick?.name ?? '');
  const [price, setPrice] = useState(pick?.unitPrice !== undefined ? String(pick.unitPrice) : '');
  const [note, setNote] = useState(pick?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = price.trim() === '' ? undefined : Number(price.replace(/[$,]/g, ''));
    setBusy(true);
    setMessage(null);
    try {
      await portalAPI.pick(token, ask.estimateId, ask.itemId, {
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
    <li className="p-4" data-testid="ask-selection">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium text-gray-900">{t.pickYour(ask.description)}</span>
        <span className="text-sm text-gray-700">
          {t.included(formatCurrency(ask.allowanceTotal))}
          {perUnit && <span className="text-gray-500"> · {t.each(ask.quantity, formatCurrency(ask.allowanceUnitPrice))}</span>}
        </span>
      </div>
      {ask.pickBy && <p className="text-sm text-amber-700 mt-0.5">{t.pickBy(formatDay(ask.pickBy, lang))}</p>}

      {pick && !open && (
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm" data-testid="ask-pick">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-gray-900">{pick.name || t.link}</span>
            {pick.url && (
              <a
                href={pick.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                {t.openLink} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          {pick.unitPrice !== undefined && (
            <p className="text-gray-700 mt-0.5">
              {perUnit ? t.each(ask.quantity, formatCurrency(pick.unitPrice)) : formatCurrency(pick.unitPrice)}
              <span className="text-gray-500"> · {versus((pick.unitPrice - ask.allowanceUnitPrice) * ask.quantity, t)}</span>
            </p>
          )}
          {pick.note && <p className="text-gray-500 mt-0.5">{pick.note}</p>}
          <p className="mt-1 text-xs text-gray-500">{t.waiting}</p>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          {pick ? t.change : t.pickYours}
        </button>
      )}

      {open && (
        <form onSubmit={send} className="mt-3 space-y-3" data-testid="pick-form">
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

/** Something to sign, as a link to the page where it's signed. */
function SignCard({ ask, t }: { ask: Exclude<PortalAsk, SelectionAsk>; t: Strings }) {
  const title = ask.kind === 'estimate' ? t.signEstimate : ask.kind === 'change_order' ? t.signChanges : t.signComplete;
  const detail =
    ask.kind === 'estimate'
      ? `${ask.title ?? ask.number} · ${formatCurrency(ask.total)}`
      : ask.kind === 'change_order' && ask.difference !== undefined && Math.abs(ask.difference) >= 0.005
        ? `${ask.title ? `${ask.title} · ` : ''}${t.changeBy(formatCurrency(Math.abs(ask.difference)), ask.difference > 0)}`
        : (ask.title ?? ask.number);
  return (
    <li data-testid={`ask-${ask.kind}`}>
      <a href={ask.path} className="flex items-center gap-3 p-4 hover:bg-gray-50">
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-gray-900">{title}</span>
          <span className="block text-sm text-gray-500 truncate">{detail}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
          {t.open} <ChevronRight className="w-4 h-4" />
        </span>
      </a>
    </li>
  );
}

/**
 * The client portal: one private link with everything for a client's work
 * with the company. What needs them comes first (only what the company sent
 * or asked for), then each job's signed documents.
 */
function PortalContent() {
  const { token = '' } = useParams();
  const { lang, adopt } = useLang();
  const t = PORTAL[lang];
  const [view, setView] = useState<PortalView | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const next = await portalAPI.get(token);
      setView(next);
      if (next?.client.language) adopt(next.client.language);
    } catch {
      setView(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  if (view === undefined) return <LightPage className="bg-gray-50 flex items-center justify-center text-gray-500">{t.loading}</LightPage>;
  if (view === null)
    return (
      <LightPage className="bg-gray-50 flex flex-col items-center justify-center gap-6 px-6 text-center text-gray-700">
        <p>{t.invalid}</p>
        <LangToggle className="text-xs text-gray-400" />
      </LightPage>
    );

  const company = view.company;
  const first = view.client.name.trim().split(/\s+/)[0];
  return (
    <LightPage className="bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <header>
          {company?.logoUrl && (
            <img src={company.logoUrl} alt={company.name} className="max-h-14 max-w-[200px] object-contain mb-3" data-testid="company-logo" />
          )}
          <h1 className="text-2xl font-semibold">{t.hello(first)}</h1>
          <p className="text-sm text-gray-600 mt-1">{t.intro(company?.name ?? t.theCompany)}</p>
          {(company?.phone || company?.email) && (
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              {company.phone && (
                <a href={`tel:${company.phone}`} className="inline-flex items-center gap-1.5 text-blue-600 hover:underline">
                  <Phone className="w-4 h-4" /> {t.call} {company.phone}
                </a>
              )}
              {company.email && (
                <a href={`mailto:${company.email}`} className="inline-flex items-center gap-1.5 text-blue-600 hover:underline">
                  <Mail className="w-4 h-4" /> {t.email}
                </a>
              )}
            </div>
          )}
        </header>

        <section aria-label={t.needsYou} data-testid="asks">
          <h2 className="text-lg font-semibold mb-2">{t.needsYou}</h2>
          {view.asks.length === 0 ? (
            <p className={`${card} p-4 text-sm text-gray-600`}>{t.nothing}</p>
          ) : (
            <ul className={`${card} divide-y divide-gray-200 overflow-hidden`}>
              {view.asks.map((ask) =>
                ask.kind === 'selection' ? (
                  <PickCard key={`${ask.estimateId}:${ask.itemId}`} token={token} ask={ask} lang={lang} onPicked={load} />
                ) : (
                  <SignCard key={ask.path} ask={ask} t={t} />
                ),
              )}
            </ul>
          )}
        </section>

        {view.jobs.length > 0 && (
          <section aria-label={t.yourJobs} data-testid="jobs">
            <h2 className="text-lg font-semibold mb-2">{t.yourJobs}</h2>
            <div className="space-y-4">
              {view.jobs.map((job) => {
                let changeOrders = 0;
                return (
                  <div key={job.key} className={`${card} p-4`} data-testid="job">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h3 className="font-semibold text-gray-900">{job.name}</h3>
                      <span className="text-sm text-gray-600">{t.agreed(formatCurrency(job.total))}</span>
                    </div>
                    <ul className="mt-3 divide-y divide-gray-100 text-sm">
                      {job.documents.map((doc) => {
                        const label =
                          doc.kind === 'estimate'
                            ? t.documents.estimate(doc.number)
                            : doc.kind === 'change_order'
                              ? t.documents.change_order(++changeOrders)
                              : t.documents.affidavit;
                        return (
                          <li key={`${doc.kind}:${doc.number}`} className="flex items-center gap-3 py-2">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-gray-900">{label}</span>
                              {doc.signedAt && <span className="block text-xs text-gray-500">{t.signedOn(formatDay(doc.signedAt, lang))}</span>}
                            </span>
                            {doc.path && (
                              <a href={doc.path} className="text-blue-600 hover:underline">
                                {t.view}
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {job.selections.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
                        <p className="text-gray-500 mb-1">{t.chosen}</p>
                        <ul className="space-y-1">
                          {job.selections.map((s) => (
                            <li key={s.description} className="flex flex-wrap items-center gap-x-2">
                              <span className="text-gray-700">{s.description}:</span>
                              <span className="text-gray-900">{s.name ?? ''}</span>
                              {s.url && (
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  {t.picks.openLink} <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer className="flex flex-col items-center gap-3 pt-4">
          <LangToggle className="text-xs text-gray-400" />
          <LegalLinks className="text-xs text-gray-400" />
        </footer>
      </div>
    </LightPage>
  );
}

/** The portal in the client's language; flipping it is remembered on their record. */
export function PortalPage() {
  const { token = '' } = useParams();
  return (
    <LangProvider onChange={(lang) => token && portalAPI.setLanguage(token, lang).catch(() => {})}>
      <PortalContent />
    </LangProvider>
  );
}
