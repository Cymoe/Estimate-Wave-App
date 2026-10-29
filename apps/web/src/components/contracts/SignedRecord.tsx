import { SHARE } from '../../i18n/share';
import { formatMoment, type Lang } from '../../i18n/lang';

export interface RecordDocument {
  kind: string;
  source: 'tolliver' | 'upload';
  name: string;
  fileName?: string;
  size?: number;
  sha256?: string;
  url?: string;
  /** The file with a signature page added at the end, once it's made. */
  signedUrl?: string;
}

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
  lang = 'en',
}: {
  estimateNumber: string;
  signerName?: string;
  signature?: string;
  signedAt?: string;
  acknowledgedAt?: string;
  documents: RecordDocument[];
  lang?: Lang;
}) {
  const t = SHARE[lang].record;
  // Tolliver's built-in documents are named in the reader's language; an uploaded PDF keeps its own name.
  const nameOf = (d: RecordDocument) => (d.source === 'tolliver' && t.kinds[d.kind] ? t.kinds[d.kind] : d.name);
  return (
    <section className="bg-white text-gray-900 rounded-lg border border-gray-200 p-6 print:border-0" aria-label="Signed record" data-testid="signed-record">
      <h3 className="text-lg font-semibold">{t.title}</h3>
      <p className="text-sm text-gray-600 mt-1">{t.intro(estimateNumber)}</p>

      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {signerName && (
          <>
            <dt className="text-gray-500">{t.signedBy}</dt>
            <dd>{signerName}</dd>
          </>
        )}
        <dt className="text-gray-500">{t.signed}</dt>
        <dd>{formatMoment(signedAt, lang) || t.notYet}</dd>
        {acknowledgedAt && (
          <>
            <dt className="text-gray-500">{t.readAgreed}</dt>
            <dd>{formatMoment(acknowledgedAt, lang)}</dd>
          </>
        )}
      </dl>
      {signature && <img src={signature} alt={t.signature} className="mt-3 max-h-24 border border-gray-200 rounded p-2 bg-gray-50" />}

      <h4 className="mt-5 text-sm font-semibold">{t.documents}</h4>
      <ul className="mt-2 divide-y divide-gray-200 border border-gray-200 rounded" data-testid="record-documents">
        {documents.map((d, i) => (
          <li key={i} className="px-3 py-2.5 text-sm">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="font-medium">{nameOf(d)}</span>
                <span className="text-gray-500"> · {t.kinds[d.kind] ?? d.kind}</span>
              </span>
              <span className="flex gap-3 print:hidden">
                {d.signedUrl && (
                  <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2">
                    {t.downloadSigned}
                  </a>
                )}
                {d.url && (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2">
                    {d.signedUrl ? t.original : t.openSigned}
                  </a>
                )}
              </span>
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">{d.source === 'upload' ? [d.fileName, kb(d.size)].filter(Boolean).join(' · ') : t.builtIn}</span>
            {d.sha256 && <span className="block text-[11px] text-gray-500 font-mono break-all mt-0.5">SHA-256 {d.sha256}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
