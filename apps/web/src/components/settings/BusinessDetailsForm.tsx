import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { organizationsAPI } from '../../lib/api';
import { uploadFile } from '../../services/uploads';
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
  // The logo clients see on estimates, agreements and sign-offs; it saves as soon as it's picked.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoPicker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    organizationsAPI
      .getById(organizationId)
      .then((org: Business | null) => {
        if (cancelled || !org) return;
        setValues(Object.fromEntries(Object.keys(EMPTY).map((key) => [key, org[key as Field] ?? ''])) as Record<Field, string>);
        setLogoUrl(org.logoUrl ?? null);
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

  const changeLogo = async (file: File | null) => {
    setLogoError(null);
    if (file && !file.type.startsWith('image/')) {
      setLogoError('Pick an image (PNG or JPG).');
      return;
    }
    if (file && file.size > 2 * 1024 * 1024) {
      setLogoError('That image is over 2MB. Pick a smaller one.');
      return;
    }
    setLogoBusy(true);
    try {
      const storageId = file ? await uploadFile(await organizationsAPI.logoUploadUrl(organizationId), file) : null;
      setLogoUrl(await organizationsAPI.setLogo(organizationId, storageId, file?.name));
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "The logo couldn't be saved.");
    } finally {
      setLogoBusy(false);
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
      <div data-testid="logo-setting">
        <span className="block text-sm font-medium text-gray-300 mb-1">Logo</span>
        <div className="flex items-center gap-3">
          <div className="w-28 h-16 flex items-center justify-center bg-white rounded-lg border border-[#333333] overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Your logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400">No logo</span>
            )}
          </div>
          <input
            ref={logoPicker}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="logo-file"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = '';
              if (file) changeLogo(file);
            }}
          />
          <button
            type="button"
            onClick={() => logoPicker.current?.click()}
            disabled={loading || logoBusy}
            className="h-9 px-3 text-sm border border-[#333333] text-gray-200 rounded-lg hover:bg-[#252525] disabled:opacity-50"
          >
            {logoBusy ? 'Saving...' : logoUrl ? 'Change' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={() => changeLogo(null)}
              disabled={logoBusy}
              className="h-9 px-3 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">Shown at the top of your estimates, agreements and sign-offs. An image up to 2MB.</p>
        {logoError && <p className="text-sm text-red-400 mt-1">{logoError}</p>}
      </div>
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
