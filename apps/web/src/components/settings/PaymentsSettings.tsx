import React, { useEffect, useState } from 'react';
import { organizationsAPI, type PaymentSettings } from '../../lib/api';

const field =
  'w-full bg-[#0A0A0A] border border-[#333] px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#336699] disabled:opacity-60';
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t save');

/**
 * How clients pay the company: the deposit asked when an estimate is
 * signed, and the pay link and instructions they see on their estimate.
 * Payments are recorded by hand for now; card payments through Tolliver
 * come later.
 */
export const PaymentsSettings: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [deposit, setDeposit] = useState('');
  const [payLink, setPayLink] = useState('');
  const [instructions, setInstructions] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([organizationsAPI.getById(organizationId), organizationsAPI.myRole(organizationId).catch(() => 'member' as const)])
      .then(([org, role]) => {
        if (!live) return;
        const payments = (org as { payments?: PaymentSettings } | null)?.payments;
        setDeposit(payments ? String(payments.depositPercent) : '0');
        setPayLink(payments?.payLink ?? '');
        setInstructions(payments?.instructions ?? '');
        setCanEdit(role === 'owner' || role === 'admin');
        setLoaded(true);
      })
      .catch((err) => live && setNote({ text: errorText(err), good: false }));
    return () => {
      live = false;
    };
  }, [organizationId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      await organizationsAPI.setPayments(organizationId, {
        depositPercent: Number(deposit || 0),
        payLink: payLink.trim() || undefined,
        instructions: instructions.trim() || undefined,
      });
      setNote({ text: 'Saved.', good: true });
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-sm text-gray-500">{note?.text ?? 'Loading…'}</p>;

  return (
    <form onSubmit={save} className="space-y-5" aria-label="Payments">
      <p className="text-sm text-gray-400">
        When a client signs an estimate, Tolliver asks for your deposit and shows them how to pay. You record payments as they come in
        (check, cash, Zelle…) on the estimate&rsquo;s Payments tab.
      </p>
      {!canEdit && <p className="text-sm text-amber-200/90">Ask an owner or admin of the company to change these.</p>}

      <label className="block">
        <span className="block text-sm font-medium text-white">Deposit when an estimate is signed</span>
        <span className="block text-xs text-gray-400 mb-1.5">A percent of the signed total. 0 for none; you can still ask for one on any job.</span>
        <span className="flex items-center gap-2 w-40">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            disabled={!canEdit}
            aria-label="Deposit percent"
            className={field}
          />
          <span className="text-sm text-gray-400">%</span>
        </span>
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-white">Pay link</span>
        <span className="block text-xs text-gray-400 mb-1.5">Your own link for paying by card (Square, Stripe, PayPal…). Clients see a Pay button.</span>
        <input
          type="url"
          value={payLink}
          onChange={(e) => setPayLink(e.target.value)}
          disabled={!canEdit}
          placeholder="https://"
          aria-label="Pay link"
          className={field}
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-white">How to pay</span>
        <span className="block text-xs text-gray-400 mb-1.5">Shown to clients with what&rsquo;s due, for example &ldquo;Checks to Peak Roofing LLC&rdquo; or your Zelle.</span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={!canEdit}
          rows={3}
          maxLength={1000}
          aria-label="How to pay"
          className={`${field} resize-none`}
        />
      </label>

      <div className="flex items-center gap-3">
        {canEdit && (
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {note && (
          <span role="status" className={`text-sm ${note.good ? 'text-green-400' : 'text-red-400'}`}>
            {note.text}
          </span>
        )}
      </div>
    </form>
  );
};
