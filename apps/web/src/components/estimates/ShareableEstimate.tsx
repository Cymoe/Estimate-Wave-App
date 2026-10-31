import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LegalLinks } from '../../pages/Legal';
import { CheckCircle, Mail, Phone, MapPin, FileText, ChevronDown } from 'lucide-react';
import { publicEstimatesAPI } from '../../lib/api';
import { formatCurrency } from '../../utils/format';
import { OTHER_CATEGORY, categoryTotals, type ContractData } from '../../services/contract';
import { LangProvider, LangToggle } from '../../i18n';
import { formatDay, useLang } from '../../i18n/lang';
import { SHARE, refusalText } from '../../i18n/share';
import { AgreementTerms } from '../contracts/AgreementTerms';
import { SignedRecord, type RecordDocument } from '../contracts/SignedRecord';
import { SignaturePad } from '../contracts/SignaturePad';
import { LightPage } from '../common/LightPage';

/** What the client sees, from the estimate's link (no login). */
interface ClientEstimate {
  estimate_number: string;
  title?: string;
  description?: string;
  status: string;
  issue_date: string;
  expiry_date?: string;
  subtotal: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount: number;
  notes?: string;
  terms?: string;
  client_signature?: string;
  signed_at?: string;
  approved_at?: string;
  client?: { name: string; language?: 'en' | 'es' };
  business?: { name?: string; email?: string; phone?: string; address?: string };
  design?: { url: string; name: string; contentType?: string };
  agreement?: {
    propertyAddress?: string;
    workDescription?: string;
    startDate?: string;
    completionDate?: string;
    paymentTerms: string;
    warrantyPeriod: string;
    extraTerms?: string;
  };
  locked_at?: string;
  /** What's signed besides the estimate: the agreement and any attachments. */
  documents: RecordDocument[];
  acknowledged_at?: string;
  /** Once signed: what the client has been asked to pay, and how. */
  payments?: ClientPayments;
  items: Array<{ id: string; description: string; quantity: number; unit_price: number; total_price: number; category?: string }>;
}

interface ClientPayments {
  invoices: Array<{ number: string; kind: string; description: string; total: number; paid: number; due: number; dueDate?: string; paidDate?: string }>;
  contract: number;
  invoiced: number;
  paid: number;
  due: number;
  payLink?: string;
  instructions?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromView(view: any): ClientEstimate {
  return {
    estimate_number: view.estimateNumber,
    title: view.title,
    description: view.description,
    status: view.status,
    issue_date: view.issueDate,
    expiry_date: view.expiryDate,
    subtotal: view.subtotal,
    tax_rate: view.taxRate,
    tax_amount: view.taxAmount,
    total_amount: view.totalAmount,
    notes: view.notes,
    terms: view.terms,
    client_signature: view.clientSignature,
    signed_at: view.signedAt,
    approved_at: view.approvedAt,
    client: view.client,
    business: view.business,
    design: view.design,
    agreement: view.agreement,
    locked_at: view.lockedAt,
    documents: view.documents ?? [],
    acknowledged_at: view.acknowledgedAt,
    payments: view.payments,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (view.items ?? []).map((item: any, i: number) => ({
      id: String(i),
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      category: item.category,
    })),
  };
}

/** What's due after signing: each invoice, what's been paid, and how to pay the company. */
function PaymentsDue({ payments, t }: { payments: ClientPayments; t: Strings }) {
  const settled = payments.due <= 0;
  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" aria-label="Payment" data-testid="client-payments">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{settled ? t.paidInFull : t.paymentDue}</h3>
        {!settled && <span className="text-xl font-bold text-gray-900">{formatCurrency(payments.due)}</span>}
      </div>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded">
        {payments.invoices.map((invoice) => (
          <li key={invoice.number} className="px-3 py-2.5 text-sm flex items-center justify-between gap-3">
            <span>
              <span className="block text-gray-900">{invoice.description}</span>
              <span className="block text-xs text-gray-500">
                {invoice.number}
                {invoice.due <= 0 ? ` · ${t.paid}` : invoice.paid > 0 ? ` · ${t.paidAmount(formatCurrency(invoice.paid))}` : ''}
              </span>
            </span>
            <span className={`font-medium ${invoice.due <= 0 ? 'text-green-700' : 'text-gray-900'}`}>{formatCurrency(invoice.due <= 0 ? invoice.total : invoice.due)}</span>
          </li>
        ))}
      </ul>
      {!settled && payments.payLink && (
        <a
          href={payments.payLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center w-full sm:w-auto px-6 py-3 rounded-lg bg-[#336699] hover:bg-[#2a5580] text-white font-medium"
        >
          {t.pay(formatCurrency(payments.due))}
        </a>
      )}
      {!settled && payments.instructions && <p className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">{payments.instructions}</p>}
      <p className="mt-3 text-xs text-gray-500">
        {t.paidOf(formatCurrency(payments.paid), formatCurrency(payments.contract))}
      </p>
    </section>
  );
}

/** The agreement the client signs, in the shape the contract wording reads. */
function agreementFor(estimate: ClientEstimate): ContractData {
  const terms = estimate.agreement;
  return {
    propertyAddress: terms?.propertyAddress ?? '',
    clientName: estimate.client?.name ?? '',
    clientAddress: '',
    contractorName: estimate.business?.name ?? '',
    contractorAddress: estimate.business?.address ?? '',
    contractorEmail: estimate.business?.email ?? '',
    contractorPhone: estimate.business?.phone ?? '',
    workDescription: terms?.workDescription ?? estimate.description ?? '',
    totalAmount: estimate.total_amount,
    lineItems: estimate.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: 'ea',
      unitPrice: item.unit_price,
      total: item.total_price,
      category: item.category,
    })),
    startDate: terms?.startDate ?? '',
    completionDate: terms?.completionDate ?? '',
    paymentTerms: terms?.paymentTerms ?? '',
    warrantyPeriod: terms?.warrantyPeriod ?? '',
    extraTerms: terms?.extraTerms,
    lockedAt: estimate.locked_at,
    agreedDesign: estimate.design && { url: estimate.design.url, name: estimate.design.name, type: estimate.design.contentType },
  };
}

/** One of the company's documents: its name and a link to open the PDF. */
function DocumentCard({ doc, t }: { doc: RecordDocument; t: Strings }) {
  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50"
      data-testid="document-card"
    >
      <FileText className="w-6 h-6 text-gray-500 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-gray-900 truncate">{doc.name}</span>
        <span className="block text-xs text-gray-500">{t.pdfOpen}</span>
      </span>
      <span className="text-sm text-blue-600 font-medium">{t.open}</span>
    </a>
  );
}

const OPEN_STATUSES = ['draft', 'sent', 'opened'];
type Strings = (typeof SHARE)['en'];

const ShareableEstimatePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { lang, adopt } = useLang();
  const t = SHARE[lang];
  const [estimate, setEstimate] = useState<ClientEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  // The client confirms reading the company's own documents before signing.
  const [agreed, setAgreed] = useState(false);

  const loadEstimate = async () => {
    if (!token) return;
    try {
      const view = await publicEstimatesAPI.get(token);
      setEstimate(view ? fromView(view) : null);
      if (view?.client?.language) adopt(view.client.language);
    } catch (error) {
      console.error('Error loading estimate:', error);
      setEstimate(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadEstimate();
    // Lets the contractor see the estimate was opened.
    publicEstimatesAPI.markOpened(token).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const uploads = (estimate?.documents ?? []).filter((d) => d.source === 'upload');
  const needsTick = uploads.length > 0;
  const uploadedAgreement = uploads.find((d) => d.kind === 'agreement');
  const attachments = uploads.filter((d) => d.kind === 'attachment');

  const handleAccept = async () => {
    if (!token || !signature || (needsTick && !agreed)) return;
    setSigning(true);
    setActionError(null);
    try {
      await publicEstimatesAPI.accept(token, signature, needsTick || undefined);
      await loadEstimate();
    } catch (error) {
      console.error('Error accepting estimate:', error);
      setActionError(refusalText(error, lang, t.acceptFailed));
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <LightPage className="bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
      </LightPage>
    );
  }

  if (!estimate) {
    return (
      <LightPage className="bg-white flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t.notFoundTitle}</h3>
          <p className="text-gray-600">{t.notFoundBody}</p>
          <LangToggle className="text-xs text-gray-400 mt-6" />
        </div>
      </LightPage>
    );
  }

  const isExpired = estimate.expiry_date && new Date(estimate.expiry_date) < new Date();
  const canSign = OPEN_STATUSES.includes(estimate.status) && !isExpired;
  const statusLabel =
    estimate.status === 'rejected'
      ? t.statusDeclined
      : OPEN_STATUSES.includes(estimate.status)
        ? t.statusAwaiting
        : estimate.status === 'accepted'
          ? t.statusAccepted
          : estimate.status === 'expired'
            ? t.statusExpired
            : estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1);

  return (
    <LightPage className="bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {estimate.title || t.titleFallback}
              </h1>
              <p className="text-lg text-gray-600">{t.subtitle(estimate.estimate_number)}</p>
            </div>
            
            <div className="text-right">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                estimate.status === 'accepted' 
                  ? 'bg-green-100 text-green-800'
                  : estimate.status === 'rejected'
                  ? 'bg-red-100 text-red-800'
                  : estimate.status === 'expired'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {statusLabel}
              </div>
              {isExpired && (
                <p className="text-sm text-red-600 mt-1">{t.expired}</p>
              )}
            </div>
          </div>

          {/* From (the business) and For (the client) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{t.from}</h3>
              <div className="space-y-2">
                <div className="text-gray-900 font-medium">{estimate.business?.name || t.yourContractor}</div>
                {estimate.business?.email && (
                  <a href={`mailto:${estimate.business.email}`} className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{estimate.business.email}</span>
                  </a>
                )}
                {estimate.business?.phone && (
                  <a href={`tel:${estimate.business.phone}`} className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{estimate.business.phone}</span>
                  </a>
                )}
                {estimate.business?.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span>{estimate.business.address}</span>
                  </div>
                )}
                {estimate.client && (
                  <p className="pt-2 text-gray-600">
                    {t.preparedFor} <span className="text-gray-900 font-medium">{estimate.client.name}</span>
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{t.details}</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t.issueDate}</span>
                  <span className="text-gray-900">{formatDay(estimate.issue_date, lang)}</span>
                </div>
                {estimate.expiry_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.validUntil}</span>
                    <span className="text-gray-900">{formatDay(estimate.expiry_date, lang)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">{t.totalAmount}</span>
                  <span className="text-xl font-bold text-gray-900">{formatCurrency(estimate.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {estimate.description && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{t.description}</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{estimate.description}</p>
          </div>
        )}

        {/* Summary by category: what the client reads first */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6" data-testid="category-summary">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{t.summary}</h3>
          <table className="w-full text-gray-900">
            <tbody>
              {categoryTotals(estimate.items.map((item) => ({ category: item.category, total: item.total_price }))).map(
                ({ category, total }) => (
                  <tr key={category} className="border-b border-gray-200">
                    <td className="py-3 pr-4">{category === OTHER_CATEGORY ? t.other : category}</td>
                    <td className="py-3 text-right whitespace-nowrap">{formatCurrency(total)}</td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              {(estimate.tax_rate ?? 0) > 0 && (
                <>
                  <tr>
                    <td className="pt-3 text-gray-600">{t.subtotal}</td>
                    <td className="pt-3 text-right text-gray-600">{formatCurrency(estimate.subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="pt-1 text-gray-600">{t.tax(estimate.tax_rate ?? 0)}</td>
                    <td className="pt-1 text-right text-gray-600">{formatCurrency(estimate.tax_amount || 0)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td className="pt-3 text-lg font-bold">{t.total}</td>
                <td className="pt-3 text-right text-xl font-bold text-blue-600">{formatCurrency(estimate.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Line items: the detail behind the summary, opened on request */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            aria-expanded={showDetails}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <h3 className="text-lg font-semibold text-gray-900">{t.lineItems(estimate.items.length)}</h3>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>

          {showDetails && <div className="overflow-x-auto border-t border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.colDescription}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.colQty}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.colUnitPrice}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.colTotal}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {estimate.items?.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{item.description}</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(item.total_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                    {t.subtotal}:
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(estimate.subtotal)}
                  </td>
                </tr>
                {(estimate.tax_rate ?? 0) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                      {t.tax(estimate.tax_rate ?? 0)}:
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(estimate.tax_amount || 0)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right text-lg font-bold text-gray-900">
                    {t.total}:
                  </td>
                  <td className="px-6 py-4 text-right text-xl font-bold text-blue-600">
                    {formatCurrency(estimate.total_amount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>}
        </div>

        {/* The agreement, signed together with the estimate: the company's own PDF, or Webb Leads' (with the agreed design) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 text-gray-900" data-testid="agreement">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.agreement}</h3>
          {uploadedAgreement ? (
            <>
              <DocumentCard doc={uploadedAgreement} t={t} />
              <p className="text-sm text-gray-600 mt-3">
                {estimate.design
                  ? t.partOfAgreementWithDesign
                  : t.partOfAgreement}
              </p>
              {estimate.design && (
                <p className="text-sm mt-2">
                  {t.agreedDesign}{' '}
                  <a href={estimate.design.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2">
                    {estimate.design.name}
                  </a>
                </p>
              )}
            </>
          ) : (
            <AgreementTerms contract={agreementFor(estimate)} lang={lang} />
          )}
          {attachments.length > 0 && (
            <div className="mt-5" data-testid="attachments">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">{t.alsoPart}</h4>
              <div className="space-y-2">
                {attachments.map((d, i) => (
                  <DocumentCard key={i} doc={d} t={t} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Terms and Notes */}
        {(estimate.notes || estimate.terms) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            {estimate.notes && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.notes}</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{estimate.notes}</p>
              </div>
            )}
            
            {estimate.terms && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.terms}</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{estimate.terms}</p>
              </div>
            )}
          </div>
        )}

        {/* What's due, once signed */}
        {estimate.status === 'accepted' && estimate.payments && <PaymentsDue payments={estimate.payments} t={t} />}

        {/* Signature Section */}
        {estimate.status === 'accepted' && estimate.client_signature ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              <CheckCircle className="w-5 h-5 text-green-500 inline mr-2" />
              {t.acceptedSigned}
            </h3>
            <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 mb-4">
              <img 
                src={estimate.client_signature} 
                alt={t.clientSignature} 
                className="max-h-32 mx-auto"
              />
            </div>
            <p className="text-sm text-gray-600">
              {t.signedOn(formatDay(estimate.signed_at, lang))}
            </p>
            {needsTick && (
              <div className="mt-6">
                <SignedRecord
                  estimateNumber={estimate.estimate_number}
                  signerName={estimate.client?.name}
                  signature={estimate.client_signature}
                  signedAt={estimate.signed_at}
                  acknowledgedAt={estimate.acknowledged_at}
                  documents={estimate.documents}
                  lang={lang}
                />
              </div>
            )}
          </div>
        ) : estimate.status === 'accepted' ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" data-testid="accepted-without-signature">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              <CheckCircle className="w-5 h-5 text-green-500 inline mr-2" />
              {t.accepted}
            </h3>
            <p className="text-sm text-gray-600">{t.approvedOn(estimate.business?.name || t.yourContractor, formatDay(estimate.approved_at ?? estimate.locked_at, lang))}</p>
          </div>
        ) : canSign ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.acceptSign}</h3>
            
            <div className="mb-6">
              <SignaturePad onChange={setSignature} label={t.yourSignature} clearLabel={t.clear} />
              <p className="text-xs text-gray-500 mt-2">{t.bySigning}</p>
            </div>

            {needsTick && (
              <label className="flex items-start gap-3 mb-4 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-5 h-5 accent-green-600"
                  aria-label={t.readAgreeLabel}
                />
                <span>
                  {t.readAgree(uploads.map((d) => d.name).join(', '))}
                </span>
              </label>
            )}
            {actionError && <p className="text-sm text-red-600 mb-3">{actionError}</p>}
            <button
              onClick={handleAccept}
              disabled={!signature || signing || (needsTick && !agreed)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle className="w-5 h-5" />
              {signing ? t.signing : t.acceptSign}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <p className="text-gray-600">
              {estimate.status === 'rejected' 
                ? t.declined
                : isExpired
                ? t.expiredMessage
                : t.unavailable
              }
            </p>
          </div>
        )}
        <LangToggle className="text-xs text-gray-400 mt-8" />
        <LegalLinks className="text-xs text-gray-400 mt-2" />
      </div>
    </LightPage>
  );
};

/** The page in the homeowner's language; flipping it is remembered on their record. */
export const ShareableEstimate: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  return (
    <LangProvider onChange={(lang) => token && publicEstimatesAPI.setLanguage(token, lang).catch(() => {})}>
      <ShareableEstimatePage />
    </LangProvider>
  );
};