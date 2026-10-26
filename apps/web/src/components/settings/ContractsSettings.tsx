import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Upload, Plus, Trash2 } from 'lucide-react';
import { contractDocsAPI, organizationsAPI, type ContractDocKind, type LibraryDoc, type SlotKind } from '../../lib/api';
import { uploadContractDoc } from '../../services/ContractDocsService';

const SLOTS: Array<{ kind: SlotKind; title: string; when: string }> = [
  { kind: 'agreement', title: 'Agreement', when: 'Signed together with the estimate' },
  { kind: 'affidavit', title: 'Affidavit of Completion', when: 'Lien release at completion' },
  { kind: 'change_order', title: 'Change Order', when: 'Changes to the original scope' },
];

const secondary =
  'inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded border border-[#333] text-sm text-gray-200 [@media(hover:hover)]:hover:bg-[#252525] disabled:opacity-50';
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * The company's own contracts. Each document is Tolliver's built-in one until
 * the company uploads its PDF; attachments here go out with every estimate.
 * One estimate can still use something else (its Contract tab).
 */
export const ContractsSettings: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
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

  if (docs === null) return <p className="text-sm text-gray-500">{note ?? 'Loading…'}</p>;
  const inUse = (kind: SlotKind) => docs.find((d) => d.kind === kind && d.active && !d.archived);
  const attachments = docs.filter((d) => d.kind === 'attachment' && d.active && !d.archived);
  const earlier = docs.filter((d) => d.archived || (d.kind !== 'attachment' && !d.active));

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Use your own contracts instead of Tolliver&rsquo;s. Upload a PDF once and every estimate uses it; one estimate can still swap in a
        different PDF from its Contract tab. The client opens your PDF, confirms they&rsquo;ve read it, and signs it with the estimate.
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
                    {doc ? 'Your PDF' : 'Tolliver'}
                  </span>
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  {doc ? `${doc.fileName} · uploaded ${day(doc.uploadedAt)}` : `Tolliver's built-in, filled in from each estimate · ${when.toLowerCase()}`}
                </span>
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
                    onClick={() => act(`tolliver-${kind}`, () => contractDocsAPI.useTolliver(organizationId, kind), `Back to Tolliver's ${title.toLowerCase()}.`)}
                  >
                    Use Tolliver&rsquo;s instead
                  </button>
                )}
              </span>
            </section>
          );
        })}
      </div>

      <section aria-label="Always included">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span>
            <span className="block text-sm font-medium text-white">Always included</span>
            <span className="block text-xs text-gray-400">PDFs sent with every estimate and signed with it: a warranty sheet, an HOA form.</span>
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
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-white truncate underline-offset-2 [@media(hover:hover)]:hover:underline">
                  {d.name}
                </a>
                {canEdit && (
                  <button
                    type="button"
                    className="p-2 text-gray-400 [@media(hover:hover)]:hover:text-red-300"
                    aria-label={`Remove ${d.name}`}
                    disabled={busy !== null}
                    onClick={() =>
                      act(`remove-${d.id}`, () => contractDocsAPI.remove(d.id), d.signed ? `${d.name} is removed; jobs that signed it keep it.` : `${d.name} is removed.`)
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

      {earlier.length > 0 && (
        <section aria-label="Earlier versions">
          <button type="button" className="text-xs text-gray-400 underline underline-offset-2" onClick={() => setShowEarlier((s) => !s)}>
            {showEarlier ? 'Hide' : 'Show'} earlier versions ({earlier.length})
          </button>
          {showEarlier && (
            <ul className="mt-2 space-y-1.5" data-testid="earlier">
              {earlier.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-gray-200 underline underline-offset-2">
                    {d.fileName}
                  </a>
                  <span>
                    {SLOTS.find((s) => s.kind === d.kind)?.title ?? 'Attachment'} · uploaded {day(d.uploadedAt)}
                    {d.signed ? ' · signed on jobs' : ''}
                  </span>
                  {canEdit && d.kind !== 'attachment' && (
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      disabled={busy !== null}
                      onClick={() => act(`use-${d.id}`, () => contractDocsAPI.setActive(d.id), `${d.name} is in use again.`)}
                    >
                      Use this one
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {note && (
        <p className="text-xs text-gray-300" role="status">
          {note}
        </p>
      )}
    </div>
  );
};
