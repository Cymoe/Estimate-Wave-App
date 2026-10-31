import React from 'react';
import { OTHER_CATEGORY, categoryTotals, type ContractData, type ContractTerms } from '../../services/contract';
import { formatCurrency } from '../../utils/format';
import { AGREEMENT } from '../../i18n/agreement';
import type { Lang } from '../../i18n/lang';

interface AgreementTermsProps {
  contract: ContractData;
  /** When set, the terms the user writes become inputs. */
  onFieldChange?: (field: keyof ContractTerms, value: string) => void;
  /** The signature block, placed after the policies and before the notices. */
  signature?: React.ReactNode;
  /** The reader's language. The contractor's own page is English. */
  lang?: Lang;
}

const formatDate = (date: string, lang: Lang, toBeAgreed: string) =>
  date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US') : toBeAgreed;

/**
 * What the scope lists: each named category once, and lines with no category
 * by their own description, so a one-off job never reads as just "Other".
 */
function scopeLines(items: ContractData['lineItems']): string[] {
  return categoryTotals(items).flatMap(({ category }) =>
    category === OTHER_CATEGORY ? items.filter((item) => !item.category?.trim()).map((item) => item.description) : [category],
  );
}

const input = 'p-1 border border-gray-300 rounded text-sm';

/**
 * The agreement's wording. Shown in the app's contract page and on the
 * client's Estimate & Agreement page, so both say the same thing. In
 * Spanish it is a courtesy translation and says so: the English governs.
 */
export const AgreementTerms: React.FC<AgreementTermsProps> = ({ contract: contractData, onFieldChange, signature, lang = 'en' }) => {
  const A = AGREEMENT[lang];
  const isEditing = Boolean(onFieldChange);
  const handleFieldChange = (field: keyof ContractTerms, value: string) => onFieldChange?.(field, value);
  const categories = categoryTotals(contractData.lineItems);
  const scope = scopeLines(contractData.lineItems);
  const contractor = contractData.contractorName || A.yourBusiness;
  const dateInput = (field: 'startDate' | 'completionDate', className: string) => (
    <input type="date" value={contractData[field]} onChange={(e) => handleFieldChange(field, e.target.value)} className={className} />
  );
  const section = (title: string, children: React.ReactNode) => (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
  return (
    <>
      {A.governs && (
        <p className="mb-6 text-xs text-gray-600 border border-gray-300 rounded px-3 py-2" lang="es">
          {A.governs}
        </p>
      )}
      {section(
        A.parties,
        <p className="text-sm">
          {A.partiesLead}{' '}
          {isEditing
            ? dateInput('startDate', 'mx-1 p-1 border border-gray-300 rounded text-xs')
            : formatDate(contractData.startDate, lang, A.toBeAgreed)}{' '}
          {A.partiesMiddle} <strong>{contractor}</strong> {A.constructor} <strong>{contractData.clientName || A.theClient}</strong> {A.client}
        </p>,
      )}

      {contractData.agreedDesign &&
        section(
          A.agreedDesign,
          contractData.agreedDesign.type === 'application/pdf' || contractData.agreedDesign.name.toLowerCase().endsWith('.pdf') ? (
            <p className="text-sm">
              {A.designAttached}{' '}
              <a href={contractData.agreedDesign.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                {contractData.agreedDesign.name}
              </a>
            </p>
          ) : (
            <img
              src={contractData.agreedDesign.url}
              alt={contractData.agreedDesign.name}
              className="w-full max-h-[480px] object-contain border border-gray-300"
            />
          ),
        )}

      {section(
        A.property,
        <>
          <p className="text-sm mb-2">{A.propertyText}</p>
          {isEditing ? (
            <textarea
              value={contractData.propertyAddress}
              onChange={(e) => handleFieldChange('propertyAddress', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded text-sm"
              rows={2}
              placeholder={A.propertyPlaceholder}
            />
          ) : (
            <p className="font-medium">{contractData.propertyAddress}</p>
          )}
        </>,
      )}

      {section(
        A.scope,
        <div className="text-sm space-y-3">
          <p>{A.scopeText}</p>
          {contractData.workDescription && <p className="font-medium">{contractData.workDescription}</p>}
          {scope.length > 0 ? (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 list-disc list-inside" data-testid="scope-categories">
              {scope.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="italic">{A.scopeEmpty}</p>
          )}
          <p>{A.materials(contractor)}</p>
        </div>,
      )}

      <div className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <strong>{A.startDate}</strong>{' '}
            {isEditing
              ? dateInput('startDate', 'ml-1 p-1 border border-gray-300 rounded text-xs')
              : formatDate(contractData.startDate, lang, A.toBeAgreed)}
          </div>
          <div>
            <strong>{A.completionDate}</strong>{' '}
            {isEditing
              ? dateInput('completionDate', 'ml-1 p-1 border border-gray-300 rounded text-xs')
              : formatDate(contractData.completionDate, lang, A.toBeAgreed)}
          </div>
        </div>
      </div>

      {section(
        A.price,
        <>
          <p className="text-sm mb-3">{A.priceText}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <tbody>
                {categories.map(({ category, total }) => (
                  <tr key={category}>
                    <td className="border border-gray-300 px-3 py-2 w-1/2">{category}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(total)}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="border border-gray-300 px-3 py-2">{A.total}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(contractData.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>,
      )}

      {section(
        A.paymentTerms,
        <div className="text-sm space-y-3">
          {isEditing ? (
            <textarea
              value={contractData.paymentTerms}
              onChange={(e) => handleFieldChange('paymentTerms', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded text-sm"
              rows={2}
              placeholder={A.paymentTermsPlaceholder}
              aria-label={A.paymentTerms}
            />
          ) : (
            <p className="font-medium whitespace-pre-line">{contractData.paymentTerms}</p>
          )}
          <p>
            <strong>{A.latePayments}</strong> {A.latePaymentsText}
          </p>
          <p>
            <strong>{A.duration}</strong> {A.durationText(contractor)}
          </p>
        </div>,
      )}

      {section(
        A.warranty,
        <div className="text-sm">
          {isEditing && (
            <input
              value={contractData.warrantyPeriod}
              onChange={(e) => handleFieldChange('warrantyPeriod', e.target.value)}
              className={`${input} mb-2`}
              placeholder={A.warrantyPlaceholder}
              aria-label={A.warranty}
            />
          )}
          <p>{A.warrantyText(contractor, contractData.warrantyPeriod || A.toBeAgreed.toLowerCase())}</p>
        </div>,
      )}

      {section(A.changeOrders, <p className="text-sm">{A.changeOrdersText}</p>)}

      {contractData.extraTerms && section(A.extraTerms, <p className="text-sm whitespace-pre-line">{contractData.extraTerms}</p>)}

      {signature}

      <div className="mt-8 p-4 border-2 border-gray-400 text-xs">
        <h3 className="font-bold text-center mb-3">{A.cancellation}</h3>
        <p className="mb-2">{A.cancellation1}</p>
        <p className="mb-2">{A.cancellation2}</p>
        <p className="mb-2">
          {A.cancellation3(contractData.contractorEmail || contractData.contractorPhone || contractData.contractorName || A.theContractor)}
        </p>
      </div>

      <div className="mt-6 p-4 border border-gray-300 text-xs">
        <h3 className="font-bold text-center mb-3">{A.texasCode}</h3>
        <p className="font-bold mb-2">{A.texasKnow}</p>
        <p className="mb-2">{A.texasIntro}</p>
        <div className="space-y-2">
          <p>
            <strong>{A.texasConveyance}</strong> {A.texasConveyanceText}
          </p>
          <p>
            <strong>{A.texasKnowContractor}</strong> {A.texasKnowContractorText}
          </p>
          <p>
            <strong>{A.texasWriting}</strong> {A.texasWritingText}
          </p>
        </div>
      </div>
    </>
  );
};

interface ContractSignaturesProps {
  contractorName: string;
  /** The client's signature image, captured when they accepted through the estimate link. */
  signature?: string;
  signedAt?: string;
  /** Approved for the client without their signature: "Approved Oct 31 by Myles Webb · no client signature". */
  approval?: string | null;
}

/** Signature block: the client signs once, on the estimate link, and it shows here. */
export const ContractSignatures: React.FC<ContractSignaturesProps> = ({ contractorName, signature, signedAt, approval }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-gray-300">
    <div>
      <h3 className="font-medium mb-4">Client signature:</h3>
      {signature ? (
        <>
          <img src={signature} alt="Client signature" className="h-16 object-contain mb-2 border-b border-gray-400" />
          <p className="text-sm">Date: {signedAt ? new Date(signedAt).toLocaleDateString() : ''}</p>
        </>
      ) : approval ? (
        <p className="text-sm text-gray-700">{approval}</p>
      ) : (
        <p className="text-sm text-gray-600 italic">Awaiting client signature — the client signs when they accept the estimate link.</p>
      )}
    </div>

    <div>
      <h3 className="font-medium mb-4">{contractorName || 'Your business'}</h3>
      <div className="border-b border-gray-400 mb-2 h-12"></div>
      <p className="text-sm">Authorized Representative</p>
    </div>
  </div>
);
