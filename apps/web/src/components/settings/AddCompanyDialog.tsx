import React, { useEffect, useState } from 'react';
import { applicationsAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, Field, input, primary, secondary } from '../ops/ui';

type Options = { trades: Array<{ slug: string; name: string }>; counties: string[]; westTexas: string[] };

/**
 * "Add another company": an owner who runs a second business applies for it
 * from inside the app. It goes to FieldQuote's Applications like any other,
 * with their name and email filled in. Once approved, it shows up in their
 * company list; no second account.
 */
export const AddCompanyDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ companyName: '', contactName: user?.name ?? '', email: user?.email ?? '', phone: '', county: '', notes: '' });
  const [trades, setTrades] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'sent' | 'duplicate' | null>(null);

  useEffect(() => {
    applicationsAPI
      .options()
      .then(setOptions)
      .catch(() => setOptions({ trades: [], counties: [], westTexas: [] }));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleTrade = (slug: string) => setTrades((t) => (t.includes(slug) ? t.filter((x) => x !== slug) : [...t, slug]));
  const west = new Set(options?.westTexas ?? []);
  const rest = (options?.counties ?? []).filter((c) => !west.has(c));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trades.length === 0) {
      setError('Pick at least one trade');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await applicationsAPI.submit({ ...form, trades, notes: form.notes || undefined });
      setDone(result.duplicate ? 'duplicate' : 'sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Dialog title="Add another company" onClose={onClose}>
        <p className="text-sm text-gray-300 mb-4" role="status">
          {done === 'sent'
            ? `Sent. FieldQuote reviews every new company before it can buy leads. Once ${form.companyName} is approved, it shows up in your company list, with its own balance and bids.`
            : 'You already have a company waiting for review. FieldQuote will be in touch about it soon.'}
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={primary}>
            Done
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Add another company" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="text-sm text-gray-400 mb-4">
          Run more than one business? Each gets its own balance, bids and leads. FieldQuote reviews it first, the same as your first company.
        </p>
        <Field label="Company name">
          <input required value={form.companyName} onChange={set('companyName')} className={input} placeholder="e.g. Basin Paint Co." />
        </Field>
        <div className="mb-3">
          <span className="block text-xs text-gray-400 mb-1">Trades it buys leads for</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Trades">
            {(options?.trades ?? []).map((t) => (
              <button
                key={t.slug}
                type="button"
                aria-pressed={trades.includes(t.slug)}
                onClick={() => toggleTrade(t.slug)}
                className={`min-h-[44px] px-3 rounded border text-sm ${trades.includes(t.slug) ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333] text-gray-300'}`}
              >
                {t.name}
              </button>
            ))}
            {options && options.trades.length === 0 && <span className="text-sm text-gray-500">Trades couldn't load. Close and try again.</span>}
          </div>
        </div>
        <Field label="County it works in">
          <select required value={form.county} onChange={set('county')} className={input} aria-label="County">
            <option value="" disabled>
              Pick a county
            </option>
            {options && options.westTexas.length > 0 && (
              <optgroup label="West Texas">
                {options.westTexas.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            )}
            {rest.length > 0 && (
              <optgroup label="Rest of Texas">
                {rest.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="Your name">
          <input required value={form.contactName} onChange={set('contactName')} className={input} />
        </Field>
        <Field label="Email" hint="Use the one you sign in with, so the new company lands in your account.">
          <input required type="email" value={form.email} onChange={set('email')} className={input} />
        </Field>
        <Field label="Phone for this company">
          <input required type="tel" value={form.phone} onChange={set('phone')} className={input} placeholder="(432) 555-0100" />
        </Field>
        <Field label="Anything we should know? (optional)">
          <textarea value={form.notes} onChange={set('notes')} rows={2} className={input} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-300 mb-3">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondary}>
            Cancel
          </button>
          <button type="submit" disabled={sending} className={primary}>
            {sending ? 'Sending…' : 'Send for review'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
