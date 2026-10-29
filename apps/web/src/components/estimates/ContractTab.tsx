import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, Plus, Trash2 } from 'lucide-react';
import { SignoffControls } from './SignoffControls';
import { contractDocsAPI, estimatesAPI, type ContractDocument, type EstimateDocuments, type SlotKind } from '../../lib/api';
import type { Estimate } from '../../services/EstimateService';
import { changesSinceSigned, ContractData } from '../../services/contract';
import { uploadContractDoc } from '../../services/ContractDocsService';
import { formatCurrency } from '../../utils/format';

type ChangeOrder = ReturnType<typeof changesSinceSigned>;
const KEY = { agreement: 'agreement', affidavit: 'affidavit', change_order: 'changeOrder' } as const;
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const rowButton =
  'flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left [@media(hover:hover)]:hover:bg-[#1E1E1E] active:bg-[#1E1E1E] transition-colors';
const menuItem = 'w-full text-left px-4 py-2.5 text-sm text-gray-200 [@media(hover:hover)]:hover:bg-[#252525] disabled:opacity-50';

/** "Your PDF" (the company's or this job's own) or "Tolliver" (the built-in one). */
function SourceTag({ doc }: { doc?: ContractDocument }) {
  const upload = doc?.source === 'upload';
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
        upload ? 'border-[#336699]/60 bg-[#336699]/15 text-[#cfe2f5]' : 'border-[#333] text-gray-400'
      }`}
      data-testid="source-tag"
    >
      {upload ? 'Your PDF' : 'Tolliver'}
    </span>
  );
}

/** Where an uploaded document comes from, for its row. */
const fromWhere = (doc: ContractDocument) => (doc.origin === 'job' ? 'this job only' : doc.origin === 'signed' ? 'as signed' : "the company's");

function AffidavitPreview({ contract, estimate }: { contract: ContractData; estimate: Estimate }) {
  return (
        <div className="p-4">
          <div className="bg-white text-black p-6 rounded-lg">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold">AFFIDAVIT OF COMPLETION</h1>
              <p className="text-sm text-gray-600 mt-2">LIEN RELEASE CERTIFICATE</p>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold mb-2">PROJECT COMPLETION</h3>
                <p>
                  I, <strong>{contract.contractorName || 'Your business'}</strong>, hereby certify that all work 
                  described in Contract {estimate.estimate_number} has been completed in accordance 
                  with the agreed specifications and to the satisfaction of the client.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">LIEN RELEASE</h3>
                <p>
                  This affidavit serves as a release of any and all liens, claims, or encumbrances 
                  against the property located at {contract.propertyAddress || 'the property address'} 
                  arising from the work performed under this contract.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">FINAL PAYMENT</h3>
                <p>
                  All payments due under the contract have been received, and no additional 
                  amounts are owed for the work performed.
                </p>
              </div>

              <div className="pt-4 border-t border-gray-300">
                <div className="flex justify-between">
                  <span>Total Contract Amount</span>
                  <span>{formatCurrency(contract.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gray-100 rounded-lg text-center">
              <p className="text-sm text-gray-600">
                This affidavit will be available for download upon project completion and final payment.
              </p>
            </div>
          </div>
        </div>
  );
}

function ChangeOrderPreview({ contract, estimate, changeOrder }: { contract: ContractData; estimate: Estimate; changeOrder: ChangeOrder }) {
  return (
        <div className="p-4">
          <div className="bg-white text-black p-6 rounded-lg">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold">CHANGE ORDER AGREEMENT</h1>
              <p className="text-sm text-gray-600 mt-2">SCOPE MODIFICATION CONTRACT</p>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold mb-2">CHANGE ORDER DETAILS</h3>
                <p>
                  {changeOrder
                    ? `This change order modifies the Service Contract Agreement ${estimate.estimate_number} signed ${new Date(estimate.contract_locked_at!).toLocaleDateString()}.`
                    : 'Change orders start once the estimate is accepted. Until then, the contract follows the estimate, so just edit the estimate.'}
                </p>
              </div>

              {changeOrder && (
                <>
                  <div>
                    <h3 className="font-semibold mb-2">MODIFICATIONS</h3>
                    {changeOrder.changes.length === 0 ? (
                      <p className="text-gray-600 italic">No changes since signing.</p>
                    ) : (
                      <div className="divide-y divide-gray-200 border border-gray-300">
                        {changeOrder.changes.map((change, i) => (
                          <div key={i} className="flex justify-between gap-4 px-3 py-2">
                            <span>
                              {change.before === undefined ? 'Added: ' : change.after === undefined ? 'Removed: ' : ''}
                              {change.description}
                            </span>
                            <span className="whitespace-nowrap">
                              {change.before !== undefined && change.after !== undefined
                                ? `${formatCurrency(change.before)} → ${formatCurrency(change.after)}`
                                : formatCurrency(change.after ?? -(change.before ?? 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">COST IMPACT</h3>
                    <div className="flex justify-between">
                      <span>Original Contract Amount</span>
                      <span>{formatCurrency(contract.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Change Order Amount</span>
                      <span>{formatCurrency(changeOrder.difference)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-gray-300 pt-2">
                      <span>New Total Contract Amount</span>
                      <span>{formatCurrency(estimate.total_amount)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 p-4 bg-gray-100 rounded-lg text-center">
              <p className="text-sm text-gray-600">
                Change orders will appear here when modifications are made to the original contract scope.
              </p>
            </div>
          </div>
        </div>
  );
}

/**
 * The estimate's contract documents: the agreement (signed with the
 * estimate), the affidavit of completion and the change order, each
 * Tolliver's built-in one or the company's own PDF, with a per-job swap,
 * and the attachments sent with the estimate.
 */
export function ContractTab({
  estimate,
  contract,
  changeOrder,
  organizationId,
}: {
  estimate: Estimate;
  contract: ContractData;
  changeOrder: ChangeOrder;
  organizationId?: string;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<'affidavit' | 'change-order' | null>(null);
  const [docs, setDocs] = useState<EstimateDocuments | null>(null);
  const [menu, setMenu] = useState<SlotKind | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickingFor = useRef<SlotKind | 'attachment'>('agreement');
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
    setMenu(null);
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
  const pick = (kind: SlotKind | 'attachment') => {
    pickingFor.current = kind;
    picker.current?.click();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !organizationId) return;
    const kind = pickingFor.current;
    await act(`upload-${kind}`, () => uploadContractDoc(organizationId, kind, file, id), `${file.name} is added to this job.`);
  };

  const signedOn = locked ? new Date(estimate.contract_locked_at!).toLocaleDateString() : '';
  const agreement = docs?.agreement;
  const affidavit = docs?.affidavit;
  const changeOrderDoc = docs?.changeOrder;
  const usingTolliverOnly =
    docs !== null &&
    [agreement, affidavit, changeOrderDoc].every((d) => d?.origin === 'tolliver') &&
    docs.companyAttachments.length === 0 &&
    docs.attachments.length === 0;

  /** The row's "Change" menu: the company's, Tolliver's, or a PDF just for this job. */
  const changeMenu = (kind: SlotKind, doc?: ContractDocument) => {
    if (menu !== kind || !docs) return null;
    const company = docs.companyDefaults[KEY[kind]];
    return (
      <div className="border-t border-[#333] bg-[#141414] py-1" role="menu" aria-label="Change document">
        {doc?.origin === 'job' && (
          <button type="button" role="menuitem" className={menuItem} disabled={busy !== null}
            onClick={() => act(`company-${kind}`, () => estimatesAPI.setContractDoc(id, kind, null))}>
            Use the company&rsquo;s {company ? `(${company})` : "(Tolliver's)"}
          </button>
        )}
        {doc?.source !== 'tolliver' && (
          <button type="button" role="menuitem" className={menuItem} disabled={busy !== null}
            onClick={() => act(`tolliver-${kind}`, () => estimatesAPI.setContractDoc(id, kind, 'tolliver'))}>
            Use Tolliver&rsquo;s for this job
          </button>
        )}
        <button type="button" role="menuitem" className={menuItem} disabled={busy !== null || !organizationId} onClick={() => pick(kind)}>
          Upload a PDF for this job
        </button>
        <button type="button" role="menuitem" className={menuItem} onClick={() => navigate('/settings/organization?tab=contracts')}>
          Manage company contracts
        </button>
      </div>
    );
  };

  /** The Change button beside a row (gone once signed). */
  const changeButton = (kind: SlotKind, title: string) =>
    !locked && docs ? (
      <button
        type="button"
        onClick={() => setMenu(menu === kind ? null : kind)}
        aria-expanded={menu === kind}
        aria-label={`Change ${title}`}
        className="px-3 self-stretch text-xs text-gray-300 border-l border-[#333] [@media(hover:hover)]:hover:bg-[#1E1E1E]"
      >
        {busy?.endsWith(kind) ? '…' : 'Change'}
      </button>
    ) : null;

  /** An uploaded document's row opens the PDF (once signed, the copy with its signature page). */
  const pdfRow = (doc: ContractDocument, title: string, subtitle: string) => (
    <a href={doc.signedUrl ?? doc.url} target="_blank" rel="noopener noreferrer" className={rowButton}>
      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="block text-xs text-gray-400 truncate">{subtitle}</span>
      </span>
      <SourceTag doc={doc} />
      <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
    </a>
  );

  const jobAttachments = (docs?.attachments ?? []).filter((d) => d.origin === 'job');
  const showAttachments = docs !== null && (locked ? docs.attachments.length > 0 : true);

  return (
    <div className="space-y-3">
      <input ref={picker} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} data-testid="job-contract-file" />
      <div className="bg-[#1a1a1a] border border-[#333] divide-y divide-[#333]">
        {/* The agreement: Tolliver's opens the full page (edit, Print/PDF); an uploaded one opens the PDF */}
        <div>
          <div className="flex items-stretch">
            {agreement?.source === 'upload' && agreement.url ? (
              pdfRow(
                agreement,
                'Service Contract Agreement',
                locked ? `Signed ${signedOn} · ${agreement.fileName ?? agreement.name}` : `${agreement.fileName} · ${fromWhere(agreement)} · signed with the estimate`,
              )
            ) : (
              <button type="button" onClick={() => navigate(`/estimates/${id}/contract`)} className={rowButton}>
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white">Service Contract Agreement</span>
                  <span className="block text-xs text-gray-400">
                    {locked ? `Signed ${signedOn}` : 'Signed together with the estimate · follows it until then'}
                  </span>
                </span>
                {docs && <SourceTag doc={agreement} />}
                <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
              </button>
            )}
            {changeButton('agreement', 'agreement')}
          </div>
          {changeMenu('agreement', agreement)}
        </div>

        {/* Affidavit of Completion (lien release): Tolliver's previews inline */}
        <div>
          <div className="flex items-stretch">
            {affidavit?.source === 'upload' && affidavit.url ? (
              pdfRow(affidavit, 'Affidavit of Completion', `${affidavit.fileName} · ${fromWhere(affidavit)} · lien release at completion`)
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(expanded === 'affidavit' ? null : 'affidavit')}
                aria-expanded={expanded === 'affidavit'}
                className={rowButton}
              >
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white">Affidavit of Completion</span>
                  <span className="block text-xs text-gray-400">Lien release at completion</span>
                </span>
                {docs && <SourceTag doc={affidavit} />}
                <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${expanded === 'affidavit' ? 'rotate-180' : ''}`} />
              </button>
            )}
            {changeButton('affidavit', 'affidavit')}
          </div>
          {changeMenu('affidavit', affidavit)}
          {expanded === 'affidavit' && affidavit?.source !== 'upload' && <AffidavitPreview contract={contract} estimate={estimate} />}
          {locked && <SignoffControls estimateId={id} kind="affidavit" clientName={estimate.client?.name} clientLanguage={estimate.client?.language} />}
        </div>

        {/* Change order: Tolliver's previews inline */}
        <div>
          <div className="flex items-stretch">
            {changeOrderDoc?.source === 'upload' && changeOrderDoc.url ? (
              pdfRow(changeOrderDoc, 'Change Order', `${changeOrderDoc.fileName} · ${fromWhere(changeOrderDoc)}`)
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(expanded === 'change-order' ? null : 'change-order')}
                aria-expanded={expanded === 'change-order'}
                className={rowButton}
              >
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white">Change Order</span>
                  <span className="block text-xs text-gray-400">
                    {changeOrder && changeOrder.changes.length > 0
                      ? `${changeOrder.changes.length} change${changeOrder.changes.length === 1 ? '' : 's'} since signing`
                      : 'Changes to the original scope'}
                  </span>
                </span>
                {docs && <SourceTag doc={changeOrderDoc} />}
                <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${expanded === 'change-order' ? 'rotate-180' : ''}`} />
              </button>
            )}
            {changeButton('change_order', 'change order')}
          </div>
          {changeMenu('change_order', changeOrderDoc)}
          {expanded === 'change-order' && changeOrderDoc?.source !== 'upload' && (
            <ChangeOrderPreview contract={contract} estimate={estimate} changeOrder={changeOrder} />
          )}
          {locked && (
            <SignoffControls
              estimateId={id}
              kind="change_order"
              clientName={estimate.client?.name}
              clientLanguage={estimate.client?.language}
              disabledReason={changeOrder && changeOrder.changes.length > 0 ? undefined : 'Change the line items first; the changes since signing go on the change order'}
            />
          )}
        </div>

        {/* Once signed: who signed what, with each uploaded file's fingerprint */}
        {locked && (
          <div>
            <button type="button" onClick={() => navigate(`/estimates/${id}/contract?record=1`)} className={`w-full ${rowButton}`}>
              <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white">Signed record</span>
                <span className="block text-xs text-gray-400">Who signed, when, and the exact files signed</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
            </button>
          </div>
        )}
      </div>

      {showAttachments && docs && (
        <section className="bg-[#1a1a1a] border border-[#333]" aria-label="Also sent with this estimate">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#333]">
            <span>
              <span className="block text-sm font-medium text-white">Also sent with this estimate</span>
              <span className="block text-xs text-gray-400">{locked ? 'Signed with it' : 'Signed with it, along with the agreement'}</span>
            </span>
            {!locked && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded border border-[#333] text-sm text-gray-200 [@media(hover:hover)]:hover:bg-[#252525] disabled:opacity-50"
                disabled={busy !== null || !organizationId}
                onClick={() => pick('attachment')}
              >
                <Plus className="w-4 h-4" />
                {busy === 'upload-attachment' ? 'Uploading…' : 'Add a PDF to this job'}
              </button>
            )}
          </div>
          <ul className="divide-y divide-[#333]" data-testid="estimate-attachments">
            {locked
              ? docs.attachments.map((d) => (
                  <li key={d.docId ?? d.name} className="px-4 py-2.5 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <a href={d.signedUrl ?? d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm text-white">
                      {d.name}
                    </a>
                  </li>
                ))
              : (
                <>
                  {docs.companyAttachments.map((a) => (
                    <li key={a.docId} className="px-4 py-2.5 flex items-center gap-3">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm text-white">{a.name}</span>
                      <span className="text-xs text-gray-500">company</span>
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

      {usingTolliverOnly && !locked && (
        <p className="text-xs text-gray-500">
          Using Tolliver&rsquo;s documents. Have your own?{' '}
          <button type="button" className="underline underline-offset-2 text-gray-300" onClick={() => navigate('/settings/organization?tab=contracts')}>
            Add them in Settings → Contracts
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
