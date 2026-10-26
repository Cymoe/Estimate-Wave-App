import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, FileText } from 'lucide-react';
import { signoffsAPI } from '../lib/api';
import { formatCurrency } from '../utils/format';
import { SignaturePad } from '../components/contracts/SignaturePad';

interface SignoffView {
  kind: 'change_order' | 'affidavit';
  name: string;
  number: string;
  status: 'sent' | 'signed' | 'cancelled';
  estimateNumber: string;
  title?: string;
  propertyAddress?: string;
  clientName?: string;
  company?: { name: string; phone?: string; email?: string };
  changes?: Array<{ description: string; before?: number; after?: number }>;
  previousTotal?: number;
  newTotal?: number;
  difference?: number;
  contractTotal: number;
  paid?: number;
  completionDate?: string;
  document: { name: string; source: 'tolliver' | 'upload'; fileName?: string; url?: string; sha256?: string; signedUrl?: string };
  signerName?: string;
  signature?: string;
  signedAt?: string;
}

const day = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

/**
 * Where a client signs a change order or the affidavit of completion,
 * from the link the company sent: what it is, the company's PDF if it uses
 * its own, their name and signature, and the record once signed.
 */
export function SignoffPage() {
  const { token = '' } = useParams();
  const [view, setView] = useState<SignoffView | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [signature, setSignature] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = (await signoffsAPI.get(token)) as SignoffView | null;
      setView(next);
      if (next?.clientName) setName((current) => current || next.clientName!);
    } catch {
      setView(null);
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  if (view === undefined) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading…</div>;
  if (view === null)
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-700">This link isn&rsquo;t valid. Ask the company for a new one.</div>;

  const upload = view.document.source === 'upload';
  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      await signoffsAPI.sign(token, name, signature, upload ? agreed : undefined);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It couldn't be signed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <header>
          <p className="text-sm text-gray-500">{view.company?.name}</p>
          <h1 className="text-2xl font-semibold">{view.name}</h1>
          <p className="text-sm text-gray-500">
            {view.number} · for estimate {view.estimateNumber}
            {view.title ? ` · ${view.title}` : ''}
          </p>
        </header>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" aria-label={view.name} data-testid="signoff-body">
          {view.kind === 'change_order' ? (
            <>
              <p className="text-sm text-gray-700 mb-3">
                These changes to the work you agreed to{view.propertyAddress ? ` at ${view.propertyAddress}` : ''} become part of your contract once you sign.
              </p>
              <ul className="divide-y divide-gray-200 border border-gray-200 rounded text-sm">
                {(view.changes ?? []).map((c, i) => (
                  <li key={i} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <span>
                      {c.description}
                      <span className="text-gray-500">{c.before === undefined ? ' · added' : c.after === undefined ? ' · removed' : ''}</span>
                    </span>
                    <span className="text-right">
                      {c.before !== undefined && c.after !== undefined ? (
                        <>
                          <span className="text-gray-400 line-through mr-2">{formatCurrency(c.before)}</span>
                          {formatCurrency(c.after)}
                        </>
                      ) : (
                        formatCurrency(c.after ?? -(c.before ?? 0))
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                <dt className="text-gray-500">Contract before</dt>
                <dd className="text-right">{formatCurrency(view.previousTotal ?? 0)}</dd>
                <dt className="text-gray-500">Change</dt>
                <dd className="text-right">{(view.difference ?? 0) >= 0 ? '+' : ''}{formatCurrency(view.difference ?? 0)}</dd>
                <dt className="font-semibold">New contract total</dt>
                <dd className="text-right font-semibold">{formatCurrency(view.newTotal ?? 0)}</dd>
              </dl>
            </>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">
              I confirm that the work under estimate {view.estimateNumber}
              {view.propertyAddress ? ` at ${view.propertyAddress}` : ''} was completed by {view.company?.name ?? 'the contractor'} on {day(view.completionDate)}, for a
              contract total of {formatCurrency(view.contractTotal)}
              {view.paid !== undefined ? `, of which ${formatCurrency(view.paid)} has been paid` : ''}. This affidavit releases any liens, claims or
              encumbrances against the property for this work, as the contract provides.
            </p>
          )}

          {upload && (
            <a
              href={view.document.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-3 rounded border border-gray-200 px-3 py-2.5 text-sm hover:bg-gray-50"
            >
              <FileText className="w-5 h-5 text-gray-400" />
              <span className="flex-1">
                <span className="block font-medium">{view.document.name}</span>
                <span className="block text-xs text-gray-500">{view.company?.name}&rsquo;s document · PDF</span>
              </span>
              <span className="text-[#336699]">Open</span>
            </a>
          )}
        </section>

        {view.status === 'signed' ? (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" data-testid="signoff-record">
            <h2 className="text-lg font-semibold mb-2">
              <CheckCircle className="w-5 h-5 text-green-500 inline mr-2" />
              Signed
            </h2>
            <p className="text-sm text-gray-700">
              Signed by {view.signerName} on {view.signedAt ? new Date(view.signedAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }) : ''}.
            </p>
            {view.signature && <img src={view.signature} alt="Signature" className="mt-3 max-h-24 border border-gray-200 rounded p-2 bg-gray-50" />}
            {view.document.signedUrl && (
              <a href={view.document.signedUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-blue-600 underline underline-offset-2">
                Download with signature
              </a>
            )}
            {view.document.sha256 && <p className="mt-3 text-[11px] text-gray-500 font-mono break-all">{view.document.fileName} · SHA-256 {view.document.sha256}</p>}
          </section>
        ) : view.status === 'cancelled' ? (
          <p className="text-sm text-gray-600">{view.company?.name ?? 'The company'} withdrew this. Ask them for the latest link.</p>
        ) : (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4" aria-label="Sign">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>
            <SignaturePad onChange={setSignature} />
            {upload && (
              <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4" />
                I&rsquo;ve read and agree to {view.document.name}.
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={sign}
              disabled={busy || !signature || !name.trim() || (upload && !agreed)}
              className="w-full sm:w-auto px-6 py-3 rounded-lg bg-[#336699] hover:bg-[#2a5580] text-white font-medium disabled:opacity-50"
            >
              {busy ? 'Signing…' : `Sign ${view.name.toLowerCase()}`}
            </button>
          </section>
        )}
        {view.company && (
          <p className="text-xs text-gray-500 text-center">
            Questions? {view.company.name}
            {view.company.phone ? ` · ${view.company.phone}` : ''}
            {view.company.email ? ` · ${view.company.email}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
