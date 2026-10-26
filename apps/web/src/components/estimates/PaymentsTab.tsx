import React, { useCallback, useEffect, useState } from 'react';
import { invoicesAPI, type EstimatePayments, type InvoiceView } from '../../lib/api';
import { formatCurrency } from '../../utils/format';

const secondary = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-200 bg-[#1E1E1E] border border-[#333] hover:bg-[#2a2a2a] disabled:opacity-50';
const primary = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50';
const field = 'bg-[#0A0A0A] border border-[#333] px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699]';
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const day = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const STATUS: Record<InvoiceView['status'], [string, string]> = {
  draft: ['Draft', 'bg-gray-500/20 text-gray-300'],
  sent: ['Due', 'bg-yellow-500/15 text-yellow-300'],
  overdue: ['Overdue', 'bg-red-500/20 text-red-300'],
  paid: ['Paid', 'bg-green-500/20 text-green-300'],
  cancelled: ['Cancelled', 'bg-[#262626] text-gray-500'],
};

/** Recording money that came in on one invoice. */
const RecordPayment: React.FC<{ invoice: InvoiceView; methods: string[]; onDone: (message: string) => void; onCancel: () => void }> = ({
  invoice,
  methods,
  onDone,
  onCancel,
}) => {
  const [amount, setAmount] = useState(String(invoice.due));
  const [method, setMethod] = useState(methods[0] ?? 'Check');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invoicesAPI.recordPayment(invoice.id, { amount: Number(amount), method, paidAt, note: note.trim() || undefined });
      onDone(`${formatCurrency(Number(amount))} recorded on ${invoice.label.toLowerCase()}.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-3 pt-3 border-t border-[#262626] flex flex-wrap items-end gap-2" aria-label={`Record a payment on ${invoice.number}`}>
      <label className="text-xs text-gray-400">
        Amount
        <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" className={`${field} block w-28 mt-1`} />
      </label>
      <label className="text-xs text-gray-400">
        Paid by
        <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid by" className={`${field} block mt-1`}>
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-400">
        On
        <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} aria-label="Paid on" className={`${field} block mt-1`} />
      </label>
      <label className="text-xs text-gray-400 flex-1 min-w-[8rem]">
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Check #1043" aria-label="Note" className={`${field} block w-full mt-1`} />
      </label>
      <button type="submit" disabled={busy} className={primary}>
        {busy ? 'Saving…' : 'Record'}
      </button>
      <button type="button" onClick={onCancel} className={secondary}>
        Cancel
      </button>
      {error && <p className="basis-full text-sm text-red-400">{error}</p>}
    </form>
  );
};

/**
 * Getting paid for this estimate: once signed, the deposit and the rest
 * are invoiced here, and payments are recorded as they come in. The
 * client sees what's due on their estimate link.
 */
export const PaymentsTab: React.FC<{ estimateId: string }> = ({ estimateId }) => {
  const [data, setData] = useState<EstimatePayments | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [depositPercent, setDepositPercent] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await invoicesAPI.forEstimate(estimateId);
      setData(next);
      setDepositPercent((current) => current || String(next.depositPercent || 30));
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    }
  }, [estimateId]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNote(null);
    try {
      await work();
      await load();
      setNote({ text: done, good: true });
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  if (data === null) return <p className="p-4 text-sm text-gray-500">{note?.text ?? 'Loading…'}</p>;
  const { summary, invoices } = data;
  const hasDeposit = invoices.some((i) => i.kind === 'deposit' && i.status !== 'cancelled');

  if (!data.signed) {
    return (
      <div className="p-4">
        <div className="bg-[#1a1a1a] border border-[#333] p-6 text-center text-sm text-gray-400" data-testid="payments-unsigned">
          Payments start once the client signs.
          {data.depositPercent > 0 && <> Your {data.depositPercent}% deposit is asked for then.</>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-[#1a1a1a] border border-[#333] grid grid-cols-4 divide-x divide-[#333]" data-testid="payments-summary">
        {(
          [
            ['Contract', summary.contract, 'text-white'],
            ['Invoiced', summary.invoiced, 'text-white'],
            ['Paid', summary.paid, summary.paid > 0 ? 'text-green-400' : 'text-white'],
            ['Due', summary.due, summary.due > 0 ? 'text-yellow-300' : 'text-white'],
          ] as const
        ).map(([label, value, tone]) => (
          <div key={label} className="p-4 min-w-0">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
            <div className={`text-lg font-semibold truncate ${tone}`}>{formatCurrency(value)}</div>
          </div>
        ))}
      </div>

      <section className="bg-[#1a1a1a] border border-[#333]" aria-label="Invoices">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Invoices</h3>
          <div className="flex flex-wrap items-center gap-2">
            {!hasDeposit && summary.toInvoice > 0 && (
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="100"
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(e.target.value)}
                  aria-label="Deposit percent"
                  className={`${field} w-16`}
                />
                <span className="text-sm text-gray-400">%</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => invoicesAPI.requestDeposit(estimateId, { percent: Number(depositPercent) }), 'Deposit asked for.')}
                  className={secondary}
                >
                  Ask for a deposit
                </button>
              </span>
            )}
            {summary.toInvoice > 0 && (
              <button type="button" disabled={busy} onClick={() => act(() => invoicesAPI.invoiceBalance(estimateId), 'Balance invoiced.')} className={primary}>
                Invoice the rest ({formatCurrency(summary.toInvoice)})
              </button>
            )}
          </div>
        </div>
        {invoices.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-500">Nothing invoiced yet.</p>
        ) : (
          <ul className="divide-y divide-[#262626] border-t border-[#262626]">
            {invoices.map((invoice) => {
              const [statusLabel, statusTone] = STATUS[invoice.status];
              const open = invoice.status !== 'cancelled' && invoice.status !== 'paid';
              return (
                <li key={invoice.id} className={`px-4 py-3 ${invoice.status === 'cancelled' ? 'opacity-60' : ''}`} data-testid="invoice-row">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 min-w-[10rem]">
                      <span className="block text-sm text-white">
                        {invoice.label} · {invoice.number}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {invoice.description}
                        {invoice.paidDate ? ` · paid ${day(invoice.paidDate)}` : invoice.dueDate ? ` · due ${day(invoice.dueDate)}` : ''}
                      </span>
                    </span>
                    <span className={`px-2 py-0.5 text-xs uppercase font-medium ${statusTone}`}>{statusLabel}</span>
                    <span className="text-right font-mono tabular-nums text-sm">
                      <span className="block text-white">{formatCurrency(invoice.total)}</span>
                      {invoice.paid > 0 && invoice.due > 0 && <span className="block text-xs text-gray-500">{formatCurrency(invoice.due)} due</span>}
                    </span>
                    {open && recording !== invoice.id && (
                      <span className="flex gap-2">
                        <button type="button" onClick={() => setRecording(invoice.id)} className={primary}>
                          Record payment
                        </button>
                        {invoice.paid === 0 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => window.confirm(`Cancel ${invoice.number}?`) && act(() => invoicesAPI.cancel(invoice.id), `${invoice.number} cancelled.`)}
                            className={secondary}
                          >
                            Cancel
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  {invoice.payments.length > 0 && (
                    <ul className="mt-2 space-y-1" aria-label={`Payments on ${invoice.number}`}>
                      {invoice.payments.map((p) => (
                        <li key={p._id} className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="font-mono text-gray-200">{formatCurrency(p.amount)}</span>
                          <span>
                            {p.method} · {day(p.paidAt)}
                            {p.note ? ` · ${p.note}` : ''}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              window.confirm('Take this payment off?') && act(() => invoicesAPI.removePayment(invoice.id, p._id), 'Payment taken off.')
                            }
                            className="underline underline-offset-2 hover:text-white"
                          >
                            Undo
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {recording === invoice.id && (
                    <RecordPayment
                      invoice={invoice}
                      methods={data.methods}
                      onCancel={() => setRecording(null)}
                      onDone={async (message) => {
                        setRecording(null);
                        await load();
                        setNote({ text: message, good: true });
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-gray-500">
        The client sees what&rsquo;s due on their estimate link, with your pay link and instructions from Settings → Payments.
      </p>
      {note && (
        <p role="status" className={`text-sm ${note.good ? 'text-gray-300' : 'text-red-400'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
};
