import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Check } from 'lucide-react';
import { assistantsAPI, type AssistantRequest } from '../lib/api';
import { input, primary, secondary } from '../components/ops/ui';
import { goTo } from '../lib/goTo';

/**
 * /connect: Claude or ChatGPT asks to use Tolliver. The person picks the
 * company it works in and whether it may spend from the balance (with a
 * daily limit), then goes back to the assistant with the approval.
 */
export default function ConnectAssistant() {
  const [params] = useSearchParams();
  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const [request, setRequest] = useState<AssistantRequest | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [spending, setSpending] = useState(false);
  const [cap, setCap] = useState('500');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !redirectUri) {
      setRequest({ ok: false });
      return;
    }
    assistantsAPI
      .request(clientId, redirectUri)
      .then((r) => {
        setRequest(r);
        if (r.ok && r.companies.length) setOrganizationId(r.companies[0].id);
      })
      .catch(() => setRequest({ ok: false }));
  }, [clientId, redirectUri]);

  const company = useMemo(() => (request?.ok ? request.companies.find((c) => c.id === organizationId) : undefined), [request, organizationId]);
  // Spending is only offered for a company the person may spend for.
  useEffect(() => {
    if (company && !company.canSpend) setSpending(false);
  }, [company]);

  if (!request) {
    return <Shell><p className="text-sm text-gray-400">Loading…</p></Shell>;
  }
  if (!request.ok) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-white mb-2">This connection link isn't valid</h1>
        <p className="text-sm text-gray-400">Go back to Claude or ChatGPT and start connecting Tolliver again.</p>
      </Shell>
    );
  }

  const deny = () => {
    const url = new URL(redirectUri);
    url.searchParams.set('error', 'access_denied');
    if (params.get('state')) url.searchParams.set('state', params.get('state')!);
    url.searchParams.set('iss', request.issuer);
    goTo(url.toString());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dailyCap = spending ? Number(cap) : undefined;
    if (spending && !(dailyCap! > 0)) {
      setError('Enter a daily limit above $0');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const back = await assistantsAPI.approve({
        clientId,
        redirectUri,
        codeChallenge: params.get('code_challenge') ?? '',
        state: params.get('state') ?? undefined,
        resource: params.get('resource') ?? undefined,
        organizationId,
        spending,
        dailyCap,
      });
      goTo(back);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through");
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit}>
        <h1 className="text-lg font-semibold text-white">{request.appName} wants to use Tolliver</h1>
        <p className="text-xs text-gray-500 mb-5">{request.domain}</p>
        {request.companies.length === 0 ? (
          <p className="text-sm text-gray-400 mb-5">You're not in a company yet, so there's nothing to connect.</p>
        ) : (
          <>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="connect-company">
              Company
            </label>
            <select id="connect-company" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className={`${input} mb-4`}>
              {request.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-300 mb-2">It will be able to:</p>
            <ul className="text-sm text-gray-300 space-y-1 mb-4">
              {['See your leads and update them', 'Log calls, texts and notes', 'Draft estimates, projects and job costs from your price book', 'Check your balance, bids and the Marketplace'].map((line) => (
                <li key={line} className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
            {company?.canSpend ? (
              <div className="rounded border border-[#333] p-3 mb-4">
                <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
                  <input type="checkbox" checked={spending} onChange={(e) => setSpending(e.target.checked)} className="mt-1 w-4 h-4" />
                  <span className="text-sm text-gray-200">
                    Let it buy leads, claim from the Vault and set bids
                    <span className="block text-xs text-gray-500">It asks you before each one, and pays from {company.name}'s balance.</span>
                  </span>
                </label>
                {spending && (
                  <div className="mt-3">
                    <label className="block text-xs text-gray-400 mb-1" htmlFor="connect-cap">
                      Most it can spend in a day ($)
                    </label>
                    <input id="connect-cap" type="number" min="1" step="1" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} className={input} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500 mb-4">Buying and bidding stay off: only the company's owner or admins can turn them on.</p>
            )}
            <p className="text-xs text-gray-500 mb-4">You can change this or disconnect any time in Company settings → Assistants.</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300 mb-3">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={deny} className={secondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !organizationId} className={primary}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-start sm:items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-[#121212] border border-[#2A2A2A] rounded-lg p-6">
        <div className="flex items-center gap-2 text-gray-400 text-xs mb-4">
          <Bot className="w-4 h-4" /> Connect an assistant
        </div>
        {children}
      </div>
    </div>
  );
}
