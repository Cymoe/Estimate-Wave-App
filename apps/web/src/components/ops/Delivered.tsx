import React, { useState } from 'react';
import { AlertCircle, Check, Mail, MessageSquare, RefreshCw } from 'lucide-react';
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
  priceCents: number;
  assignedAt: string;
  acknowledgedAt?: string;
  minutesOpen: number;
  afterHours: boolean;
  overdue: boolean;
  deliveries: Delivery[];
}

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
        <p className="text-sm text-gray-400">Nothing awarded yet. Each lead a company wins shows up here with what we sent them.</p>
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
      <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Delivered">
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
                  to {row.companyName} · {money(row.priceCents)} · {ago(row.assignedAt)}
                  {row.afterHours ? ' · after hours' : ''}
                </span>
              </span>
              <span className={`text-xs whitespace-nowrap ${row.acknowledgedAt ? 'text-emerald-300' : row.overdue ? 'text-red-300' : 'text-gray-400'}`}>
                {row.acknowledgedAt ? `Got it in ${row.minutesOpen} min` : `No “Got it” yet · ${row.minutesOpen} min`}
              </span>
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
