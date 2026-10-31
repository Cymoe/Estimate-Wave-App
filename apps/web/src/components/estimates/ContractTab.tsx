import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Plus, Trash2 } from 'lucide-react';
import { SignoffControls } from './SignoffControls';
import { contractDocsAPI, estimatesAPI, type ContractDocument, type EstimateDocuments } from '../../lib/api';
import type { Estimate } from '../../services/EstimateService';
import { changesSinceSigned } from '../../services/contract';
import { uploadContractDoc } from '../../services/ContractDocsService';
import { approvalLine } from './estimateActions';

type ChangeOrder = ReturnType<typeof changesSinceSigned>;
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const rowButton =
  'w-full min-w-0 flex items-center gap-3 px-4 py-3 text-left [@media(hover:hover)]:hover:bg-[#1E1E1E] active:bg-[#1E1E1E] transition-colors';
const secondary =
  'inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded border border-[#333] text-sm text-gray-200 [@media(hover:hover)]:hover:bg-[#252525] disabled:opacity-50';

/** "Your PDF" (the company's own) or "Built-in" (filled in from the estimate). */
function SourceTag({ doc }: { doc?: ContractDocument }) {
  const upload = doc?.source === 'upload';
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
        upload ? 'border-[#336699]/60 bg-[#336699]/15 text-[#cfe2f5]' : 'border-[#333] text-gray-400'
      }`}
      data-testid="source-tag"
    >
      {upload ? 'Your PDF' : 'Built-in'}
    </span>
  );
}

/** One document row: a title, a line under it, the source tag and an arrow. */
function Row({
  title,
  subtitle,
  doc,
  ...rest
}: { title: string; subtitle: string; doc?: ContractDocument } & ({ href: string } | { onClick: () => void })) {
  const inner = (
    <>
      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="block text-xs text-gray-400 truncate">{subtitle}</span>
      </span>
      {doc && <SourceTag doc={doc} />}
      <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
    </>
  );
  return 'href' in rest ? (
    <a href={rest.href} target="_blank" rel="noopener noreferrer" className={rowButton}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={rest.onClick} className={rowButton}>
      {inner}
    </button>
  );
}

/**
 * What the client signs with this estimate: the agreement (the built-in one
 * filled in from the estimate, or the company's own PDF) and any PDFs sent
 * along with it. Once signed, the two things a client can sign later: the
 * changes to the work, and the job-complete sign-off.
 */
export function ContractTab({
  estimate,
  changeOrder,
  organizationId,
  onApprove,
}: {
  estimate: Estimate;
  changeOrder: ChangeOrder;
  organizationId?: string;
  /** Approve it without the client's signature (set while it can still be approved). */
  onApprove?: () => void;
}) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<EstimateDocuments | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const id = estimate.id!;
  const locked = Boolean(estimate.contract_locked_at);

  const load = useCallback(async () => {
    try {
      setDocs((await estimatesAPI.documents(id)) ?? null);
    } catch {
      setDocs(null);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load, estimate.contract_locked_at]);

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
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !organizationId) return;
    await act('upload-attachment', () => uploadContractDoc(organizationId, 'attachment', file, id), `${file.name} is added to this job.`);
  };

  const signedOn = locked ? new Date(estimate.contract_locked_at!).toLocaleDateString() : '';
  // Approved for the client without their signature: say so instead of "Signed".
  const approved = approvalLine(estimate);
  const agreement = docs?.agreement;
  const affidavit = docs?.affidavit;
  const changeOrderDoc = docs?.changeOrder;
  const changes = changeOrder?.changes.length ?? 0;
  const jobAttachments = (docs?.attachments ?? []).filter((d) => d.origin === 'job');
  const showAttachments = docs !== null && (locked ? docs.attachments.length > 0 : true);
  /** The company's own PDF for a later sign-off, when it has one. */
  const ownPdf = (doc?: ContractDocument) => (doc?.source === 'upload' && doc.url ? doc : undefined);

  return (
    <div className="space-y-3">
      <input ref={picker} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} data-testid="job-contract-file" />
      <div className="bg-[#1a1a1a] border border-[#333] divide-y divide-[#333]">
        {agreement?.source === 'upload' && agreement.url ? (
          <Row
            title="Agreement"
            subtitle={
              locked
                ? `${approved ?? `Signed ${signedOn}`} · ${agreement.fileName ?? agreement.name}`
                : `${agreement.fileName} · the client signs it with the estimate`
            }
            doc={agreement}
            href={agreement.signedUrl ?? agreement.url}
          />
        ) : (
          <Row
            title="Agreement"
            subtitle={locked ? (approved ?? `Signed ${signedOn}`) : 'Filled in from this estimate · the client signs it with the estimate'}
            doc={docs ? agreement : undefined}
            onClick={() => navigate(`/estimates/${id}/contract`)}
          />
        )}
        {locked && (
          <Row
            title="Signed record"
            subtitle="Who signed, when, and the exact files signed"
            onClick={() => navigate(`/estimates/${id}/contract?record=1`)}
          />
        )}
      </div>

      {showAttachments && docs && (
        <section className="bg-[#1a1a1a] border border-[#333]" aria-label="Also sent with this estimate">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#333]">
            <span>
              <span className="block text-sm font-medium text-white">Also sent with this estimate</span>
              <span className="block text-xs text-gray-400">
                {locked ? 'Signed with it' : 'PDFs the client reads and signs along with the agreement'}
              </span>
            </span>
            {!locked && (
              <button type="button" className={secondary} disabled={busy !== null || !organizationId} onClick={() => picker.current?.click()}>
                <Plus className="w-4 h-4" />
                {busy === 'upload-attachment' ? 'Uploading…' : 'Add a PDF to this job'}
              </button>
            )}
          </div>
          <ul className="divide-y divide-[#333]" data-testid="estimate-attachments">
            {locked ? (
              docs.attachments.map((d) => (
                <li key={d.docId ?? d.name} className="px-4 py-2.5 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <a href={d.signedUrl ?? d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm text-white">
                    {d.name}
                  </a>
                </li>
              ))
            ) : (
              <>
                {docs.companyAttachments.map((a) => (
                  <li key={a.docId} className="px-4 py-2.5 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-sm text-white">{a.name}</span>
                    <span className="text-xs text-gray-500">every estimate</span>
                    <label className="flex items-center gap-2 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={a.included}
                        disabled={busy !== null}
                        aria-label={`Send ${a.name} with this estimate`}
                        onChange={(e) => act(`attach-${a.docId}`, () => estimatesAPI.setAttachment(id, a.docId, e.target.checked))}
                        className="accent-[#336699] w-4 h-4"
                      />
                      Send
                    </label>
                  </li>
                ))}
                {jobAttachments.map((d) => (
                  <li key={d.docId} className="px-4 py-2.5 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <a href={d.signedUrl ?? d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm text-white">
                      {d.name}
                    </a>
                    <span className="text-xs text-gray-500">this job</span>
                    <button
                      type="button"
                      className="p-2 text-gray-400 [@media(hover:hover)]:hover:text-red-300"
                      aria-label={`Remove ${d.name}`}
                      disabled={busy !== null}
                      onClick={() => act(`remove-${d.docId}`, () => contractDocsAPI.remove(d.docId!))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
                {docs.companyAttachments.length === 0 && jobAttachments.length === 0 && (
                  <li className="px-4 py-2.5 text-sm text-gray-500">Nothing else yet.</li>
                )}
              </>
            )}
          </ul>
        </section>
      )}

      {/* Once the estimate is signed, the two things a client can sign later */}
      {locked && docs && (
        <section className="bg-[#1a1a1a] border border-[#333] divide-y divide-[#333]" aria-label="After signing">
          <div>
            <div className="px-4 py-3">
              <span className="block text-sm font-medium text-white">Changes to sign</span>
              <span className="block text-xs text-gray-400">
                {changes > 0
                  ? `${changes} change${changes === 1 ? '' : 's'} to the line items since signing. Send them for the client to approve.`
                  : 'Nothing has changed since signing. Edit the line items, then send the changes here for the client to approve.'}
                {ownPdf(changeOrderDoc) && (
                  <>
                    {' '}
                    Your PDF:{' '}
                    <a
                      href={ownPdf(changeOrderDoc)!.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 text-gray-300"
                    >
                      {ownPdf(changeOrderDoc)!.fileName}
                    </a>
                  </>
                )}
              </span>
            </div>
            <SignoffControls
              estimateId={id}
              kind="change_order"
              clientName={estimate.client?.name}
              clientLanguage={estimate.client?.language}
              disabledReason={changes > 0 ? undefined : 'Nothing to send yet'}
            />
          </div>
          <div>
            <div className="px-4 py-3">
              <span className="block text-sm font-medium text-white">Job complete sign-off</span>
              <span className="block text-xs text-gray-400">
                When the work is done and paid, the client signs that the job is complete and nothing more is owed on it.
                {ownPdf(affidavit) && (
                  <>
                    {' '}
                    Your PDF:{' '}
                    <a href={ownPdf(affidavit)!.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-gray-300">
                      {ownPdf(affidavit)!.fileName}
                    </a>
                  </>
                )}
              </span>
            </div>
            <SignoffControls estimateId={id} kind="affidavit" clientName={estimate.client?.name} clientLanguage={estimate.client?.language} />
          </div>
        </section>
      )}

      {onApprove && !locked && (
        <div
          className="bg-[#1a1a1a] border border-[#333] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          data-testid="approve-without-signature"
        >
          <span className="text-xs text-gray-400">Client agreed in person or on the phone? Approve it here instead of waiting for a signature.</span>
          <button type="button" onClick={onApprove} className={secondary}>
            Approve without signature
          </button>
        </div>
      )}

      {docs && agreement?.source !== 'upload' && !locked && (
        <p className="text-xs text-gray-500">
          Using the built-in agreement. Have your own contract?{' '}
          <button
            type="button"
            className="underline underline-offset-2 text-gray-300"
            onClick={() => navigate('/settings/organization?tab=contracts')}
          >
            Upload it in Settings → Contracts
          </button>
          .
        </p>
      )}
      {note && (
        <p className="text-xs text-gray-300" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
