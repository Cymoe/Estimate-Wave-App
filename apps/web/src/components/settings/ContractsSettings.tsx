import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Upload, Plus, Trash2 } from 'lucide-react';
import { contractDocsAPI, organizationsAPI, type AgreementWording, type ContractDocKind, type LibraryDoc, type SlotKind } from '../../lib/api';
import { uploadContractDoc } from '../../services/ContractDocsService';
import { DEFAULT_PAYMENT_TERMS, DEFAULT_WARRANTY } from '../../services/contract';

const SLOTS: Array<{ kind: SlotKind; title: string; when: string }> = [
  { kind: 'agreement', title: 'Agreement', when: 'The client signs it with the estimate' },
  { kind: 'change_order', title: 'Changes to the work', when: 'Signed when the work changes after the estimate is signed' },
  { kind: 'affidavit', title: 'Job complete sign-off', when: 'Signed when the job is done and paid' },
];

const secondary =
  'inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded border border-[#333] text-sm text-gray-200 [@media(hover:hover)]:hover:bg-[#252525] disabled:opacity-50';
const field =
  'w-full bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]';
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * What the company's clients sign. Each document is the built-in one, filled
 * in from the estimate, until the company uploads its own PDF. The built-in
 * agreement also takes the company's wording: payment terms, warranty and
 * any clauses of its own. PDFs under "Sent with every estimate" go out and
 * are signed with each estimate.
 */
export const ContractsSettings: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wording, setWording] = useState<AgreementWording>({});
  const [savedWording, setSavedWording] = useState<AgreementWording>({});
  const picker = useRef<HTMLInputElement>(null);
  const pickingFor = useRef<ContractDocKind>('agreement');

  const load = useCallback(async () => {
    try {
      setDocs(await contractDocsAPI.list(organizationId));
    } catch (err) {
      setNote(`Your contracts couldn't be loaded: ${errorText(err)}`);
    }
  }, [organizationId]);
  useEffect(() => {
    load();
    organizationsAPI
      .myRole(organizationId)
      .then((role) => setCanEdit(role === 'owner' || role === 'admin'))
      .catch(() => setCanEdit(false));
    organizationsAPI
      .getById(organizationId)
      .then((org: { agreement?: AgreementWording } | null) => {
        const current = org?.agreement ?? {};
        setWording(current);
        setSavedWording(current);
      })
      .catch(() => {});
  }, [organizationId, load]);

  const act = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setNote(null);
    try {
      await work();
      await load();
      if (done) setNote(done);
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const pick = (kind: ContractDocKind) => {
    pickingFor.current = kind;
    picker.current?.click();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const kind = pickingFor.current;
    await act(`upload-${kind}`, () => uploadContractDoc(organizationId, kind, file), `${file.name} is uploaded.`);
  };
  const wordingChanged = (['paymentTerms', 'warranty', 'extraTerms'] as const).some((k) => (wording[k] ?? '') !== (savedWording[k] ?? ''));
  const saveWording = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('wording');
    setNote(null);
    try {
      const saved = await organizationsAPI.setAgreement(organizationId, wording);
      setWording(saved);
      setSavedWording(saved);
      setNote('Agreement wording saved. New estimates use it; signed ones keep what they signed.');
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  if (docs === null) return <p className="text-sm text-gray-500">{note ?? 'Loading…'}</p>;
  const inUse = (kind: SlotKind) => docs.find((d) => d.kind === kind && d.active && !d.archived);
  const attachments = docs.filter((d) => d.kind === 'attachment' && d.active && !d.archived);
  const builtInAgreement = !inUse('agreement');

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Every estimate goes out with an agreement the client signs. Use the built-in one, filled in from each estimate, or upload your own PDF: the
        client opens it, confirms they&rsquo;ve read it, and signs it with the estimate. The same goes for the two things a client signs later in a
        job.
      </p>
      {!canEdit && <p className="text-sm text-amber-200/90">Ask an owner or admin of the company to change these.</p>}
      <input ref={picker} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} data-testid="contract-file" />

      <div className="border border-[#333] rounded divide-y divide-[#333]">
        {SLOTS.map(({ kind, title, when }) => {
          const doc = inUse(kind);
          return (
            <section key={kind} className="p-4 flex flex-wrap items-center gap-3" aria-label={title} data-testid={`slot-${kind}`}>
              <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span className="flex-1 min-w-[12rem]">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{title}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded border ${
                      doc ? 'border-[#336699]/60 bg-[#336699]/15 text-[#cfe2f5]' : 'border-[#333] text-gray-400'
                    }`}
                  >
                    {doc ? 'Your PDF' : 'Built-in'}
                  </span>
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">{doc ? `${doc.fileName} · uploaded ${day(doc.uploadedAt)}` : when}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {doc?.url && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className={secondary}>
                    Open
                  </a>
                )}
                {canEdit && (
                  <button type="button" className={secondary} disabled={busy !== null} onClick={() => pick(kind)}>
                    <Upload className="w-4 h-4" />
                    {busy === `upload-${kind}` ? 'Uploading…' : doc ? 'Replace' : 'Upload your PDF'}
                  </button>
                )}
                {canEdit && doc && (
                  <button
                    type="button"
                    className={secondary}
                    disabled={busy !== null}
                    onClick={() =>
                      act(`builtin-${kind}`, () => contractDocsAPI.useBuiltIn(organizationId, kind), `Back to the built-in ${title.toLowerCase()}.`)
                    }
                  >
                    Use the built-in instead
                  </button>
                )}
              </span>
            </section>
          );
        })}
      </div>

      <form onSubmit={saveWording} aria-label="Agreement wording" className="space-y-3">
        <div>
          <span className="block text-sm font-medium text-white">Agreement wording</span>
          <span className="block text-xs text-gray-400">
            {builtInAgreement
              ? 'What the built-in agreement says for your company. An estimate can still change its own payment terms and warranty.'
              : 'Used by the built-in agreement, which your uploaded PDF replaces. Kept in case you switch back.'}
          </span>
        </div>
        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">Payment terms</span>
          <textarea
            value={wording.paymentTerms ?? ''}
            onChange={(e) => setWording({ ...wording, paymentTerms: e.target.value })}
            placeholder={DEFAULT_PAYMENT_TERMS}
            rows={2}
            disabled={!canEdit}
            className={field}
            aria-label="Payment terms"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">Workmanship warranty</span>
          <input
            value={wording.warranty ?? ''}
            onChange={(e) => setWording({ ...wording, warranty: e.target.value })}
            placeholder={DEFAULT_WARRANTY}
            disabled={!canEdit}
            className={field}
            aria-label="Workmanship warranty"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">Additional terms</span>
          <textarea
            value={wording.extraTerms ?? ''}
            onChange={(e) => setWording({ ...wording, extraTerms: e.target.value })}
            placeholder="Anything else the client agrees to: access to the property, permits, who cleans up. Leave blank for none."
            rows={4}
            disabled={!canEdit}
            className={field}
            aria-label="Additional terms"
          />
        </label>
        {canEdit && (
          <button
            type="submit"
            disabled={busy !== null || !wordingChanged}
            className="px-4 py-2 rounded bg-[#336699] text-white text-sm font-medium disabled:opacity-50"
          >
            {busy === 'wording' ? 'Saving…' : 'Save wording'}
          </button>
        )}
      </form>

      <section aria-label="Sent with every estimate">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span>
            <span className="block text-sm font-medium text-white">Sent with every estimate</span>
            <span className="block text-xs text-gray-400">
              PDFs the client reads and signs along with the agreement: a warranty sheet, an HOA form.
            </span>
          </span>
          {canEdit && (
            <button type="button" className={secondary} disabled={busy !== null} onClick={() => pick('attachment')}>
              <Plus className="w-4 h-4" />
              {busy === 'upload-attachment' ? 'Uploading…' : 'Add a PDF'}
            </button>
          )}
        </div>
        {attachments.length === 0 ? (
          <p className="text-sm text-gray-500">None yet.</p>
        ) : (
          <ul className="border border-[#333] rounded divide-y divide-[#333]" data-testid="attachments">
            {attachments.map((d) => (
              <li key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 text-sm text-white truncate underline-offset-2 [@media(hover:hover)]:hover:underline"
                >
                  {d.name}
                </a>
                {canEdit && (
                  <button
                    type="button"
                    className="p-2 text-gray-400 [@media(hover:hover)]:hover:text-red-300"
                    aria-label={`Remove ${d.name}`}
                    disabled={busy !== null}
                    onClick={() =>
                      act(
                        `remove-${d.id}`,
                        () => contractDocsAPI.remove(d.id),
                        d.signed ? `${d.name} is removed; jobs that signed it keep it.` : `${d.name} is removed.`,
                      )
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {note && (
        <p className="text-xs text-gray-300" role="status">
          {note}
        </p>
      )}
    </div>
  );
};
