import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Mail, Phone } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { applicationsAPI, reportAPI } from '../lib/api';
import { money } from '../components/market/wallet';
import { PermitsNearYou } from '../components/market/PermitsNearYou';
import { versus, type TolliverReport } from '../components/report/reportTypes';
import { saleLabel } from '../../convex/lib/foreclosures';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const card = 'rounded-lg border border-[#2A2A2A] bg-[#121212] p-4 md:p-5';
const select =
  'bg-[#1A1A1A] border border-[#333] rounded px-3 min-h-[44px] text-white text-base md:text-sm focus:outline-none focus:border-[#336699]';

/** Phone and email links for a company, when the city lists them. */
function Reach({ phone, email }: { phone?: string; email?: string }) {
  if (!phone && !email) return null;
  return (
    <span className="inline-flex flex-wrap gap-3 ml-0 md:ml-2">
      {phone && (
        <a href={telHref(phone)} className="inline-flex items-center gap-1 text-[#7fb0e0] text-sm min-h-[32px]">
          <Phone className="w-3.5 h-3.5" /> {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-[#7fb0e0] text-sm min-h-[32px]">
          <Mail className="w-3.5 h-3.5" /> Email
        </a>
      )}
    </span>
  );
}

/** What a Pro section would hold, for companies without the plan. */
function Locked({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-400 flex items-start gap-2" data-testid="report-locked">
      <Lock className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" />
      <span>
        {children}{' '}
        <Link to="/vault" className="text-[#7fb0e0] underline underline-offset-2">
          Get Pro
        </Link>
      </span>
    </p>
  );
}

/**
 * The Tolliver Report: a county's last 7 days in building permits, who's
 * building, lead demand and what sold. The same report Claude and ChatGPT
 * read; without the Pro plan the names and addresses are held back.
 */
const ReportPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id || undefined;
  const [county, setCounty] = useState<string | undefined>(undefined);
  const [trade, setTrade] = useState<string | undefined>(undefined);
  const [counties, setCounties] = useState<string[]>([]);
  const [report, setReport] = useState<TolliverReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applicationsAPI
      .options()
      .then((o) => setCounties(o.westTexas))
      .catch(() => setCounties([]));
  }, []);
  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    setError(null);
    reportAPI
      .get(organizationId, { county, trade })
      .then((r: TolliverReport) => live && setReport(r))
      .catch((err) => live && setError(err instanceof Error ? err.message : "The report couldn't be loaded"));
    return () => {
      live = false;
    };
  }, [organizationId, county, trade]);

  if (!organizationId) return <p className="p-6 text-gray-400">Pick a company first.</p>;
  const r = report;
  const countyChoices = [...new Set([...(r ? [r.county] : []), ...counties])];
  const tradeChoices = r ? r.permits.byTrade.filter((t) => t.count > 0 || t.prior > 0) : [];

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-4" data-testid="report-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-emerald-400">The Tolliver Report</p>
          <h1 className="text-2xl font-semibold text-white">
            {r ? `${r.county} County${r.trade ? ` · ${r.trade.name}` : ''}` : 'Loading…'}
          </h1>
          {r && (
            <p className="text-sm text-gray-500">
              The last 7 days: {day(r.week.from)} – {day(r.week.to)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="County" className={select} value={r?.county ?? ''} onChange={(e) => setCounty(e.target.value || undefined)}>
            {countyChoices.map((c) => (
              <option key={c} value={c}>
                {c} County
              </option>
            ))}
          </select>
          <select aria-label="Trade" className={select} value={trade ?? ''} onChange={(e) => setTrade(e.target.value || undefined)}>
            <option value="">All trades</option>
            {(r?.trade && !tradeChoices.some((t) => t.slug === r.trade!.slug) ? [{ slug: r.trade.slug, name: r.trade.name }] : [])
              .concat(tradeChoices.map((t) => ({ slug: t.slug, name: t.name })))
              .map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
      </header>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {r && (
        <>
          {!r.pro && (
            <div className={`${card} border-amber-400/30`} data-testid="report-pro-teaser">
              <p className="text-sm text-gray-200">
                You're seeing the free report. Pro adds who's building and how to reach them, the address of every permit in your trades, the
                streets where homes are going up, and your own week.{' '}
                <Link to="/vault" className="text-[#7fb0e0] underline underline-offset-2">
                  Start Pro in the Vault
                </Link>
              </p>
            </div>
          )}

          <section className={card} aria-label="Permits">
            <h2 className="text-base font-semibold text-white mb-3">Permits</h2>
            {!r.permits.feed ? (
              <p className="text-sm text-gray-400">
                No public permit feed for {r.county} County yet. Tolliver reads Midland's today and is adding more counties.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-3xl font-semibold text-white">{r.permits.total}</p>
                    <p className="text-xs text-gray-500">filed, {versus(r.permits.total, r.permits.prior)}</p>
                  </div>
                  {!r.trade && (
                    <div>
                      <p className="text-3xl font-semibold text-white">{r.permits.newHomes}</p>
                      <p className="text-xs text-gray-500">new homes ({r.permits.newHomesPrior} the week before)</p>
                    </div>
                  )}
                  <div>
                    <p className="text-3xl font-semibold text-white">{r.permits.inMyTrades}</p>
                    <p className="text-xs text-gray-500">in {r.trade ? r.trade.name : 'your trades'}</p>
                  </div>
                </div>
                {!r.trade && tradeChoices.length > 0 && (
                  <p className="flex flex-wrap gap-2 mb-4" aria-label="By trade">
                    {tradeChoices.slice(0, 10).map((t) => (
                      <span key={t.slug} className={`px-2.5 py-1 rounded-full text-xs border ${t.mine ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333] text-gray-400'}`}>
                        {t.name} {t.count}
                      </span>
                    ))}
                  </p>
                )}
                <h3 className="text-sm font-medium text-gray-200 mb-1">Where homes are going up (last 30 days)</h3>
                {r.pro ? (
                  r.permits.hotStreets?.length ? (
                    <p className="text-sm text-gray-300 mb-4">{r.permits.hotStreets.map((s) => `${s.street} (${s.newHomes})`).join(' · ')}</p>
                  ) : (
                    <p className="text-sm text-gray-500 mb-4">No street with several new homes this month.</p>
                  )
                ) : (
                  <div className="mb-4">
                    <Locked>{r.permits.hotStreetCount} street(s) with several new homes going up.</Locked>
                  </div>
                )}
                {r.permits.syncedAt && <p className="text-xs text-gray-500 mt-3">City of Midland permit records, updated {day(r.permits.syncedAt)}.</p>}
              </>
            )}
          </section>

          {r.permits.feed && (
            <section className={card} aria-label="All permits">
              <h2 className="text-base font-semibold text-white mb-3">All permits</h2>
              {r.pro ? (
                <PermitsNearYou organizationId={organizationId} />
              ) : (
                <Locked>Every permit with its address, builder and value, filterable by trade and 7, 30 or 90 days.</Locked>
              )}
            </section>
          )}

          {r.permits.feed && (
            <section className={card} aria-label="Who's building">
              <h2 className="text-base font-semibold text-white mb-3">Who's building (last 30 days)</h2>
              {!r.pro ? (
                <Locked>{r.permits.builderCount} builders and contractors pulled permits; Pro names them, with their phone and email.</Locked>
              ) : !r.permits.builders?.length && !r.permits.tradeContractors?.length ? (
                <p className="text-sm text-gray-500">Builders show here as Tolliver reads them from the city's permit portal, within a day of a permit being filed.</p>
              ) : (
                <>
                  {r.permits.builders && r.permits.builders.length > 0 && (
                    <ul className="space-y-2 mb-4" data-testid="report-builders">
                      {r.permits.builders.map((b) => (
                        <li key={b.name} className="text-sm">
                          <span className="text-white font-medium">{b.name}</span>
                          <span className="text-gray-400">
                            {' '}
                            · {b.newHomes} new home{b.newHomes === 1 ? '' : 's'}
                            {b.valuationCents ? ` · ${money(b.valuationCents)} in permits` : ''}
                          </span>
                          <Reach phone={b.phone} email={b.email} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.permits.tradeContractors?.map((t) => (
                    <div key={t.trade} className="mb-3">
                      <h3 className="text-sm font-medium text-gray-200">Pulling {t.trade} permits</h3>
                      <ul className="space-y-1 mt-1">
                        {t.contractors.map((c) => (
                          <li key={c.name} className="text-sm">
                            <span className="text-white">{c.name}</span>
                            <span className="text-gray-400"> · {c.permits} permit{c.permits === 1 ? '' : 's'}</span>
                            <Reach phone={c.phone} email={c.email} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </section>
          )}

          {r.auction && (
            <section className={card} aria-label="Courthouse auction">
              <h2 className="text-base font-semibold text-white mb-1">Courthouse auction</h2>
              <p className="text-xs text-gray-500 mb-3">Midland's foreclosure sale, the first Tuesday of each month. Homes bought there need rehab work.</p>
              <p className="text-sm text-gray-300" data-testid="auction-next">
                {saleLabel(r.auction.next.date)}:{' '}
                {r.auction.next.posted ? `${r.auction.next.posted} home${r.auction.next.posted === 1 ? '' : 's'} posted` : 'no homes posted yet'}
                {r.auction.last?.posted
                  ? ` · ${saleLabel(r.auction.last.date)}: ${[
                      `${r.auction.last.sold} sold`,
                      `${r.auction.last.backToLender} back to the lender`,
                      r.auction.last.cancelled ? `${r.auction.last.cancelled} cancelled` : '',
                    ]
                      .filter(Boolean)
                      .join(', ')}`
                  : ''}
              </p>
              {!r.pro ? (
                r.auction.boughtCount > 0 && (
                  <div className="mt-3">
                    <Locked>
                      {r.auction.boughtCount} home{r.auction.boughtCount === 1 ? ' was' : 's were'} bought at auction in the last 4 months; Pro lists them with who bought.
                    </Locked>
                  </div>
                )
              ) : r.auction.bought && r.auction.bought.length > 0 ? (
                <ul className="space-y-2 mt-3" data-testid="auction-bought">
                  {r.auction.bought.map((b) => (
                    <li key={`${b.saleDate}-${b.address}`} className="text-sm">
                      <span className="text-white">{b.address}</span>
                      <span className="text-gray-400">
                        {' '}
                        · {saleLabel(b.saleDate)}
                        {b.priceCents ? ` · ${money(b.priceCents)}` : ''} · {b.buyer}
                      </span>
                      <Reach phone={b.phone} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 mt-3">No homes bought at auction in the last 4 months yet.</p>
              )}
            </section>
          )}

          <section className={card} aria-label="Demand">
            <h2 className="text-base font-semibold text-white mb-3">Demand</h2>
            {!r.demand.length ? (
              <p className="text-sm text-gray-400">No bids or leads in {r.county} County yet.</p>
            ) : (
              <ul className="divide-y divide-[#2A2A2A]">
                {r.demand.map((d) => (
                  <li key={d.slug} className="py-2 text-sm">
                    <span className="text-white">{d.name}</span>
                    {d.mine && <span className="text-xs text-[#7fb0e0]"> (yours)</span>}
                    <span className="block text-gray-400">
                      {[
                        d.winningBidCents
                          ? `Leads win at ${money(d.winningBidCents)} (${d.fundedBidders} funded bid${d.fundedBidders === 1 ? '' : 's'})`
                          : d.buyers
                            ? 'No funded bid yet: the next lead goes to the Marketplace'
                            : 'No company buys this trade yet',
                        d.inMarketplace ? `${d.inMarketplace} for sale` : '',
                        d.inVault ? `${d.inVault} in the Vault` : '',
                        d.sold30 ? `${d.sold30} sold in 30 days${d.avgSoldCents ? `, avg ${money(d.avgSoldCents)}` : ''}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card} aria-label="What sold">
            <h2 className="text-base font-semibold text-white mb-3">What sold this week</h2>
            {!r.sold.count ? (
              <p className="text-sm text-gray-400">No leads sold this week{r.sold.prior ? ` (${r.sold.prior} the week before)` : ''}.</p>
            ) : (
              <>
                <p className="text-sm text-gray-300 mb-2">
                  {r.sold.count} lead(s) sold, {versus(r.sold.count, r.sold.prior)}.
                  {r.sold.medianHoursToSell !== null
                    ? ` Half sold within ${r.sold.medianHoursToSell < 1 ? 'the hour' : `${Math.round(r.sold.medianHoursToSell)} hours`} of listing.`
                    : ''}
                </p>
                <ul className="space-y-1">
                  {r.sold.byTrade.map((t) => (
                    <li key={t.name} className="text-sm text-gray-400">
                      <span className="text-white">{t.name}</span>: {t.count}, avg {money(t.avgCents)}, top {money(t.topCents)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className={card} aria-label="Your week">
            <h2 className="text-base font-semibold text-white mb-3">Your week</h2>
            {!r.mine ? (
              <Locked>Your bids, your new leads and the permits in your trades, side by side with the market.</Locked>
            ) : (
              <>
                <p className="text-sm text-gray-300">
                  {r.mine.permitsInMyTrades} permit(s) in your trades · {r.mine.newLeads} new lead(s) from Tolliver
                </p>
                {r.mine.bids.length ? (
                  <ul className="mt-2 space-y-1">
                    {r.mine.bids.map((b) => (
                      <li key={b.name} className="text-sm text-gray-400">
                        Your {b.name} bid, {money(b.amountCents)}:{' '}
                        <span className={b.winning ? 'text-emerald-300' : 'text-amber-300'}>
                          {b.paused ? 'paused, the balance is below it' : b.winning ? 'winning' : 'not winning: another company bids more'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">
                    No standing bids in {r.county} County.{' '}
                    <Link to="/bids" className="text-[#7fb0e0] underline underline-offset-2">
                      Set one
                    </Link>
                  </p>
                )}
              </>
            )}
          </section>

          <p className="text-xs text-gray-500">Ask Claude or ChatGPT for this report any time once your company is connected (Company settings → Assistants).</p>
        </>
      )}
    </div>
  );
};

export default ReportPage;
