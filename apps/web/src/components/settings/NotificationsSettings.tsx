import React, { useEffect, useState } from 'react';
import { CheckCircle, Mail, Smartphone } from 'lucide-react';
import { organizationsAPI, usersAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

const input =
  'w-full bg-[#1A1A1A] border border-[#333] rounded px-3 py-2 text-white text-base md:text-sm placeholder-gray-500 focus:outline-none focus:border-[#336699]';
const button =
  'inline-flex items-center gap-2 px-4 py-2 rounded bg-[#336699] text-white text-sm font-medium disabled:opacity-50';

/**
 * Where a new lead is sent the moment FieldQuote awards it: the company's
 * email, and the signed-in person's own mobile for a text with the link.
 */
export const NotificationsSettings: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [saved, setSaved] = useState<'email' | 'mobile' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    organizationsAPI
      .getById(organizationId)
      .then((org: { email?: string }) => setEmail(org?.email ?? ''))
      .catch(() => {});
  }, [organizationId]);
  const userMobile = (user as { mobile?: string } | null)?.mobile;
  // Stored as +14325550177; shown the way people write it.
  const pretty = (stored?: string | null) => {
    const d = (stored ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : stored ?? '';
  };
  useEffect(() => {
    setMobile(pretty(userMobile));
  }, [userMobile]);
  // "Saved" shows for a moment, then goes.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await organizationsAPI.update(organizationId, { email: email.trim() });
      setSaved('email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save');
    } finally {
      setBusy(false);
    }
  };
  const saveMobile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const stored = await usersAPI.setMobile(mobile);
      setMobile(pretty(stored));
      setSaved('mobile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="notifications-settings">
      <p className="text-sm text-gray-400">
        When FieldQuote awards you a lead, the full lead goes to your company email right away and a text with the link goes to each
        owner or admin who has a mobile here. Open the link and tap “Got it” so our team knows you have it.
      </p>
      <form onSubmit={saveEmail}>
        <label className="block text-xs text-gray-400 mb-1">
          <span className="inline-flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> Company email for leads
          </span>
        </label>
        <div className="flex gap-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@yourcompany.com" className={input} aria-label="Company email" />
          <button type="submit" disabled={busy} className={button}>
            Save
          </button>
        </div>
        {saved === 'email' && (
          <p className="text-xs text-emerald-300 mt-1 inline-flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </p>
        )}
      </form>
      <form onSubmit={saveMobile}>
        <label className="block text-xs text-gray-400 mb-1">
          <span className="inline-flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5" /> Your mobile for lead texts
          </span>
        </label>
        <div className="flex gap-2">
          <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="(432) 555-0100" className={input} aria-label="Your mobile" />
          <button type="submit" disabled={busy} className={button}>
            Save
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">US numbers only. Leave it blank to stop the texts; email keeps coming.</p>
        {saved === 'mobile' && (
          <p className="text-xs text-emerald-300 mt-1 inline-flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </p>
        )}
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
};
