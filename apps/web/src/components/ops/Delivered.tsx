import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, Mail, MessageSquare, PhoneCall, RefreshCw } from 'lucide-react';
import { deliveryAPI } from '../../lib/api';
import { useDelivered } from '../../lib/live';
import { money } from '../market/wallet';
import { ErrorLine, ago, describeError, secondary } from './ui';

interface Delivery {
  id: string;
  channel: 'email' | 'sms' | 'homeowner_sms';
  to: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  at: string;
}

export interface DeliveredRow {
  id: string;
  orgLeadId: string;
  name: string;
  jobType?: string;
  county?: string;
  city?: string;
  companyName: string;
  /** The company's id, for the link to its panel on the Companies tab. */
  organizationId?: string;
  /** When staff called and the company said it has the lead. */
  handledAt?: string;
  /** Who to call when the row turns red. */
  companyPhone?: string;
  priceCents: number;
  /** How it went: a standing bid, a buy order, Buy now, a Vault claim, or sent by hand. */
  wonVia?: 'bid' | 'order' | 'buy' | 'claim' | 'sent';
  /** Credited back since, so the money came off again. */
  credited?: boolean;
  assignedAt: string;
  acknowledgedAt?: string;
  minutesOpen: number;
  afterHours: boolean;
  overdue: boolean;
  deliveries: Delivery[];
}

const HOW: Record<NonNullable<DeliveredRow['wonVia']>, string> = {
  bid: 'sold by bid',
  order: 'buy order',
  buy: 'bought',
  claim: 'claimed from the Vault',
  sent: 'sent by hand',
};

const CHANNEL: Record<Delivery['channel'], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  email: { label: 'Email', icon: Mail },
  sms: { label: 'Text', icon: MessageSquare },
  homeowner_sms: { label: 'Homeowner text', icon: MessageSquare },
};

/**
 * Every awarded lead and whether the company has it: what went out, and
 * who hasn't tapped "Got it" within 15 minutes during the day. Red rows
 * get a phone call from staff; "Send by hand" and credits live on the
 * Listed and Companies tabs. Live: a "Got it" or a new award shows on
 * its own.
 */
export const Delivered: React.FC<{ tradeName: (id?: string) => string }> = ({ tradeName }) => {
  const rows = useDelivered<DeliveredRow[]>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handled = async (row: DeliveredRow) => {
    setBusy(row.id);
    setError(null);
    try {
      await deliveryAPI.markHandled(row.id);
    } catch (err) {
      setError(`${row.name} couldn't be marked as handled: ${describeError(err, 'server error')}`);
    } finally {
      setBusy(null);
    }
  };

  const resend = async (row: DeliveredRow) => {
    setBusy(row.id);
    setError(null);
    try {
      await deliveryAPI.resend(row.orgLeadId);
    } catch (err) {
      setError(`The alerts for ${row.name} didn't go out again: ${describeError(err, 'server error')}`);
    } finally {
      setBusy(null);
    }
  };

  if (rows === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[#333] rounded p-8 text-center" data-testid="delivered">
        <Check className="w-8 h-8 mx-auto text-gray-500 mb-2" />
        <p className="text-sm text-gray-400">Nothing sold yet. Each lead a company gets shows up here with what we sent them.</p>
      </div>
    );
  }
  const overdue = rows.filter((r) => r.overdue).length;
  return (
    <div className="space-y-3" data-testid="delivered">
      <ErrorLine error={error} onDismiss={() => setError(null)} />
      <p className="text-xs text-gray-500">
        {overdue > 0 ? (
          <span className="text-red-300">{overdue} not acknowledged after 15 minutes: call the company.</span>
        ) : (
          'Companies tap “Got it” on the alert. A row turns red after 15 minutes without it, during the day.'
        )}
      </p>
      <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Sold">
        {rows.map((row) => (
          <li key={row.id} className={`px-4 py-3 ${row.overdue ? 'bg-red-500/10' : ''}`} data-overdue={row.overdue ? 'true' : undefined}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-[12rem]">
                <span className="flex items-center gap-2 text-sm text-white">
                  {row.overdue && <AlertCircle className="w-4 h-4 text-red-300" aria-label="Not acknowledged" />}
                  {row.name}
                  <span className="text-gray-500">· {tradeName(row.jobType)}</span>
                </span>
                <span className="block text-xs text-gray-500">
                  to{' '}
                  {row.organizationId ? (
                    <Link to={`/ops?tab=companies&company=${row.organizationId}`} className="underline underline-offset-2 hover:text-white">
                      {row.companyName}
                    </Link>
                  ) : (
                    row.companyName
                  )}{' '}
                  · <span className={row.credited ? 'line-through' : ''}>{money(row.priceCents)}</span>
                  {row.credited ? ' credited back' : ''}
                  {row.wonVia ? ` · ${HOW[row.wonVia]}` : ''} · {ago(row.assignedAt)}
                  {row.afterHours ? (row.acknowledgedAt || row.minutesOpen > 0 ? ' · sold after hours' : ' · after hours, clock starts at 8am') : ''}
                </span>
                {row.overdue && (
                  <span className="block text-xs mt-0.5 text-red-200">
                    {row.companyPhone ? (
                      <>
                        Call {row.companyName}:{' '}
                        <a href={`tel:${row.companyPhone.replace(/[^\d+]/g, '')}`} className="underline font-medium">
                          {row.companyPhone}
                        </a>
                      </>
                    ) : (
                      `${row.companyName} has no phone on file: open the company on the Companies tab.`
                    )}
                  </span>
                )}
              </span>
              <span className={`text-xs whitespace-nowrap ${row.acknowledgedAt || row.handledAt ? 'text-emerald-300' : row.overdue ? 'text-red-300' : 'text-gray-400'}`}>
                {row.acknowledgedAt
                  ? `Got it in ${row.minutesOpen} min`
                  : row.handledAt
                    ? 'Called · they have it'
                    : `No “Got it” yet · ${row.minutesOpen} min`}
              </span>
              {!row.acknowledgedAt && !row.handledAt && (
                <button type="button" disabled={busy === row.id} onClick={() => handled(row)} className={secondary} title="You called and they have the lead: stop the red and the chase">
                  <PhoneCall className="w-3.5 h-3.5" /> Called, they have it
                </button>
              )}
              <button type="button" disabled={busy === row.id} onClick={() => resend(row)} className={secondary} title="Send the email and text again">
                <RefreshCw className="w-3.5 h-3.5" /> Resend alerts
              </button>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {row.deliveries.length === 0 && <li className="text-xs text-gray-500">No alerts recorded (sent before alerts existed).</li>}
              {row.deliveries.map((d) => {
                const Icon = CHANNEL[d.channel].icon;
                return (
                  <li
                    key={d.id}
                    className={`inline-flex items-center gap-1 text-xs ${d.status === 'sent' ? 'text-gray-300' : d.status === 'failed' ? 'text-red-300' : 'text-gray-500'}`}
                    title={d.error ?? d.to}
                  >
                    <Icon className="w-3 h-3" />
                    {CHANNEL[d.channel].label} {d.status}
                    {d.status !== 'sent' && d.error ? `: ${d.error}` : d.to ? ` to ${d.to}` : ''}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
};
