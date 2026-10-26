export interface RecordDocument {
  kind: string;
  source: 'tolliver' | 'upload';
  name: string;
  fileName?: string;
  size?: number;
  sha256?: string;
  url?: string;
}

const KIND: Record<string, string> = {
  agreement: 'Agreement',
  affidavit: 'Affidavit of Completion',
  change_order: 'Change Order',
  attachment: 'Attachment',
};

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }) : '';
const kb = (bytes?: number) => (bytes ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB` : '');

/**
 * What was signed, kept as a record: who signed and when, when they
 * confirmed reading the uploaded documents, and each document signed with
 * the estimate (an uploaded PDF with its size and SHA-256 fingerprint, so
 * the exact file can be shown to be the one signed).
 */
export function SignedRecord({
  estimateNumber,
  signerName,
  signature,
  signedAt,
  acknowledgedAt,
  documents,
}: {
  estimateNumber: string;
  signerName?: string;
  signature?: string;
  signedAt?: string;
  acknowledgedAt?: string;
  documents: RecordDocument[];
}) {
  return (
    <section className="bg-white text-gray-900 rounded-lg border border-gray-200 p-6 print:border-0" aria-label="Signed record" data-testid="signed-record">
      <h3 className="text-lg font-semibold">Signed record</h3>
      <p className="text-sm text-gray-600 mt-1">Estimate {estimateNumber}, the agreement and the documents signed with it.</p>

      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {signerName && (
          <>
            <dt className="text-gray-500">Signed by</dt>
            <dd>{signerName}</dd>
          </>
        )}
        <dt className="text-gray-500">Signed</dt>
        <dd>{when(signedAt) || 'Not yet'}</dd>
        {acknowledgedAt && (
          <>
            <dt className="text-gray-500">Read and agreed to</dt>
            <dd>{when(acknowledgedAt)}</dd>
          </>
        )}
      </dl>
      {signature && <img src={signature} alt="Signature" className="mt-3 max-h-24 border border-gray-200 rounded p-2 bg-gray-50" />}

      <h4 className="mt-5 text-sm font-semibold">Documents signed</h4>
      <ul className="mt-2 divide-y divide-gray-200 border border-gray-200 rounded" data-testid="record-documents">
        {documents.map((d, i) => (
          <li key={i} className="px-3 py-2.5 text-sm">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="font-medium">{d.name}</span>
                <span className="text-gray-500"> · {KIND[d.kind] ?? d.kind}</span>
              </span>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 print:hidden">
                  Open the signed file
                </a>
              )}
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">
              {d.source === 'upload'
                ? [d.fileName, kb(d.size)].filter(Boolean).join(' · ')
                : "Tolliver's built-in agreement, filled in from the estimate (shown above)"}
            </span>
            {d.sha256 && (
              <span className="block text-[11px] text-gray-500 font-mono break-all mt-0.5">SHA-256 {d.sha256}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
