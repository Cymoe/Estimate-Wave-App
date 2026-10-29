import React from 'react';
import { categoryTotals, type ContractData, type ContractTerms } from '../../services/contract';
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
 * The agreement's wording. Shown in the app's contract page and on the
 * client's Estimate & Agreement page, so both say the same thing. In
 * Spanish it is a courtesy translation and says so: the English governs.
 */
export const AgreementTerms: React.FC<AgreementTermsProps> = ({ contract: contractData, onFieldChange, signature, lang = 'en' }) => {
  const A = AGREEMENT[lang];
  const isEditing = Boolean(onFieldChange);
  const handleFieldChange = (field: keyof ContractTerms, value: string) => onFieldChange?.(field, value);
  const categories = categoryTotals(contractData.lineItems);
  const contractor = contractData.contractorName;
  const dateInput = (field: 'startDate' | 'completionDate', className: string) => (
    <input type="date" value={contractData[field]} onChange={(e) => handleFieldChange(field, e.target.value)} className={className} />
  );
  const stage = (title: string, lines: string[][], purchased: string) => (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {lines.map(([label, text]) => (
        <p key={label}>
          <strong>{label}</strong> {text}
        </p>
      ))}
      <p>
        <em>{purchased}</em>
      </p>
    </div>
  );
  return (
    <>
      {A.governs && (
        <p className="mb-6 text-xs text-gray-600 border border-gray-300 rounded px-3 py-2" lang="es">
          {A.governs}
        </p>
      )}
      {/* Parties Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">{A.parties}</h2>
        <p className="text-sm mb-4">
          {A.partiesLead} {isEditing ? dateInput('startDate', 'mx-1 p-1 border border-gray-300 rounded text-xs') : formatDate(contractData.startDate, lang, A.toBeAgreed)}{' '}
          {A.partiesMiddle} <strong>{contractor || A.yourBusiness}</strong> {A.constructor} <strong>{contractData.clientName || A.theClient}</strong> {A.client}
        </p>
      </div>

      {/* Agreed Design */}
      {contractData.agreedDesign && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">{A.agreedDesign}</h2>
          {contractData.agreedDesign.type === 'application/pdf' || contractData.agreedDesign.name.toLowerCase().endsWith('.pdf') ? (
            <p className="text-sm">
              {A.designAttached}{' '}
              <a href={contractData.agreedDesign.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                {contractData.agreedDesign.name}
              </a>
            </p>
          ) : (
            <img src={contractData.agreedDesign.url} alt={contractData.agreedDesign.name} className="w-full max-h-[480px] object-contain border border-gray-300" />
          )}
        </div>
      )}

      {/* Construction Property */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">{A.property}</h2>
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
      </div>

      {/* Scope of Work */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">{A.scope}</h2>
        <p className="text-sm mb-2">{A.scopeText}</p>
        {categories.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-6 list-disc list-inside" data-testid="scope-categories">
            {categories.map(({ category }) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic mb-6">{A.scopeEmpty}</p>
        )}

        {/* Stages */}
        <div className="space-y-4 text-sm">
          <p>
            <em>{A.stagesNote}</em>
          </p>
          {stage(A.stage1, A.stage1Lines, A.stagePurchased(1, contractor))}
          {stage(A.stage2, A.stage2Lines, A.stagePurchased(2, contractor))}
          {stage(A.stage3, A.stage3Lines, A.stagePurchased(3, contractor))}
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <strong>{A.startDate}</strong>{' '}
            {isEditing ? dateInput('startDate', 'ml-1 p-1 border border-gray-300 rounded text-xs') : formatDate(contractData.startDate, lang, A.toBeAgreed)}
          </div>
          <div>
            <strong>{A.completionDate}</strong>{' '}
            {isEditing ? dateInput('completionDate', 'ml-1 p-1 border border-gray-300 rounded text-xs') : formatDate(contractData.completionDate, lang, A.toBeAgreed)}
          </div>
        </div>
      </div>

      {/* Pricing Table */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">{A.paymentTerms}</h2>
        <h3 className="font-medium mb-3">{A.scopeTotal}</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <tbody>
              {/* The estimate summed by category */}
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
      </div>

      {/* Financing and Payment Structure */}
      <div className="mb-6 text-sm">
        <p className="mb-4">{A.financing}</p>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>{A.deposit}</div>
            <div>{A.stage1Draw}</div>
          </div>
          <div className="font-medium">
            {A.totalLabel} {formatCurrency(contractData.totalAmount * 0.5)}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>{A.stage2Draw}</div>
            <div>
              {A.totalLabel} {formatCurrency(contractData.totalAmount * 0.4)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>{A.stage3Draw}</div>
            <div>
              {A.totalLabel} {formatCurrency(contractData.totalAmount * 0.1)}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Terms and Policies */}
      <div className="mb-6 text-sm space-y-3">
        <p>{A.quickbooks}</p>
        <p>{A.lateFee}</p>

        <div>
          <h3 className="font-semibold">{A.paymentDefault}</h3>
          <p>
            <strong>{A.lien}</strong> {A.lienText}
          </p>
        </div>

        <div>
          <h3 className="font-semibold">{A.duration}</h3>
          <p>{A.durationText(contractor)}</p>
        </div>

        <div>
          <p>
            <strong>{A.warranty(contractor)}</strong>
          </p>
          <p>
            <strong>{A.turfWarranty}</strong>
          </p>
        </div>

        <div>
          <h3 className="font-semibold">{A.changeOrders}</h3>
          <p>{A.changeOrdersText}</p>
          <ol className="list-decimal list-inside ml-4 space-y-1">
            <li>
              <strong>{A.changeOrderFee}</strong> {A.changeOrderFeeText}
            </li>
            <li>
              <strong>{A.additionalCosts}</strong> {A.additionalCostsText}
            </li>
            <li>
              <strong>{A.timelineImpact}</strong> {A.timelineImpactText(contractor)}
            </li>
            <li>
              <strong>{A.intent}</strong> {A.intentText}
            </li>
          </ol>
        </div>
      </div>

      {signature}

      {/* Notice of Cancellation */}
      <div className="mt-8 p-4 border-2 border-gray-400 text-xs">
        <h3 className="font-bold text-center mb-3">{A.cancellation}</h3>
        <p className="mb-2">{A.cancellation1}</p>
        <p className="mb-2">{A.cancellation2}</p>
        <p className="mb-2">{A.cancellation3(contractData.contractorEmail || contractData.contractorPhone || contractor || A.theContractor)}</p>
      </div>

      {/* Texas Property Code Notice */}
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
}

/** Signature block: the client signs once, on the estimate link, and it shows here. */
export const ContractSignatures: React.FC<ContractSignaturesProps> = ({ contractorName, signature, signedAt }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-gray-300">
    <div>
      <h3 className="font-medium mb-4">Client signature:</h3>
      {signature ? (
        <>
          <img src={signature} alt="Client signature" className="h-16 object-contain mb-2 border-b border-gray-400" />
          <p className="text-sm">Date: {signedAt ? new Date(signedAt).toLocaleDateString() : ''}</p>
        </>
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
