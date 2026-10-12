import React, { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { organizationsAPI } from '../../lib/api';
import { missingBusinessDetails, type Business } from '../../services/contract';

type Field = 'name' | 'email' | 'phone' | 'address' | 'city' | 'state' | 'zip';

const EMPTY: Record<Field, string> = { name: '', email: '', phone: '', address: '', city: '', state: '', zip: '' };

interface BusinessDetailsFormProps {
  organizationId: string;
  /** Called with the saved organization, so the app can show the new name. */
  onSaved?: (organization: Business) => void;
}

/** The business details printed on every estimate and agreement the client receives. */
export const BusinessDetailsForm: React.FC<BusinessDetailsFormProps> = ({ organizationId, onSaved }) => {
  const [values, setValues] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    organizationsAPI
      .getById(organizationId)
      .then((org: Business | null) => {
        if (cancelled || !org) return;
        setValues(Object.fromEntries(Object.keys(EMPTY).map((key) => [key, org[key as Field] ?? ''])) as Record<Field, string>);
      })
      .catch(() => !cancelled && setError("Your business details couldn't be loaded."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: e.target.value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setError('Business name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
      const organization = await organizationsAPI.update(organizationId, trimmed);
      setSaved(true);
      onSaved?.(organization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your business details couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  const missing = loading ? [] : missingBusinessDetails(values);
  const input = (field: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="block text-sm font-medium text-gray-300 mb-1">{label}</span>
      <input
        value={values[field]}
        onChange={set(field)}
        disabled={loading}
        className="w-full h-10 px-3 bg-[#252525] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] disabled:opacity-50"
        {...props}
      />
    </label>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-400">
        These appear on every estimate and service agreement your clients receive, including the cancellation notice.
      </p>
      {missing.length > 0 && (
        <p className="p-3 border border-yellow-500/40 bg-yellow-500/10 rounded-lg text-sm text-yellow-200">
          Add your {missing.join(', ')} before sending estimates.
        </p>
      )}
      {input('name', 'Business name', { required: true, autoComplete: 'organization' })}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {input('email', 'Email', { type: 'email', autoComplete: 'email' })}
        {input('phone', 'Phone', { type: 'tel', autoComplete: 'tel' })}
      </div>
      {input('address', 'Street address', { autoComplete: 'street-address' })}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4">
        {input('city', 'City', { autoComplete: 'address-level2' })}
        {input('state', 'State', { autoComplete: 'address-level1' })}
        {input('zip', 'ZIP', { autoComplete: 'postal-code', inputMode: 'numeric' })}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || saving}
          className="h-10 px-4 bg-[#F59E0B] text-black text-sm font-medium rounded-lg hover:bg-[#D97706] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle className="w-4 h-4" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
};
