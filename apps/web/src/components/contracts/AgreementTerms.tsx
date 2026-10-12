import React from 'react';
import { categoryTotals, type ContractData, type ContractTerms } from '../../services/contract';
import { formatCurrency } from '../../utils/format';
import { CONTRACT_TEMPLATES, LEGACY_CONTRACT_TEMPLATE, resolveContractTemplate } from '../../../convex/lib/contractTemplates';

interface AgreementTermsProps {
  contract: ContractData;
  /** When set, the terms the user writes become inputs. */
  onFieldChange?: (field: keyof ContractTerms, value: string) => void;
  /** The signature block, placed after the policies and before the notices. */
  signature?: React.ReactNode;
}

const formatDate = (date: string) => (date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString() : 'To be agreed');

/**
 * The agreement's wording. Shown in the app's contract page and on the
 * client's Estimate & Agreement page, so both say the same thing.
 */
export const AgreementTerms: React.FC<AgreementTermsProps> = ({ contract: contractData, onFieldChange, signature }) => {
  const isEditing = Boolean(onFieldChange);
  const handleFieldChange = (field: keyof ContractTerms, value: string) => onFieldChange?.(field, value);
  const categories = categoryTotals(contractData.lineItems);
  const templateId = resolveContractTemplate(contractData.contractTemplate, contractData.lineItems, Boolean(contractData.lockedAt));
  const tradeTemplate = CONTRACT_TEMPLATES.find(template => template.id === templateId);
  const legacy = templateId === LEGACY_CONTRACT_TEMPLATE;
  return (
    <>
          {!legacy && (
            <div className="mb-6 print:mb-4">
              {isEditing ? (
                <label className="block text-sm font-medium">
                  Contract trade
                  <select
                    value={templateId}
                    onChange={event => handleFieldChange('contractTemplate', event.target.value)}
                    className="mt-2 block w-full p-2 border border-gray-300 rounded bg-white text-gray-900"
                  >
                    {CONTRACT_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.label}</option>)}
                  </select>
                  <span className="mt-2 block text-xs font-normal text-gray-600">Choose the trade for this agreement. For a job covering several trades, use General / multiple trades.</span>
                </label>
              ) : (
                <p className="text-sm text-gray-600">Contract trade: {tradeTemplate?.label}</p>
              )}
            </div>
          )}
          {/* Parties Section */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">PARTIES</h2>
            <p className="text-sm mb-4">
              This services contract agreement (Hereinafter referred to as the "Agreement") is entered into{' '}
              {isEditing ? (
                <input
                  type="date"
                  value={contractData.startDate}
                  onChange={(e) => handleFieldChange('startDate', e.target.value)}
                  className="mx-1 p-1 border border-gray-300 rounded text-xs"
                />
              ) : (
                formatDate(contractData.startDate)
              )} (The effective date), by and between{' '}
              <strong>{contractData.contractorName || 'Your business'}</strong> (Hereinafter referred to as the "Constructor") and{' '}
              <strong>{contractData.clientName || 'the client'}</strong> (Hereinafter referred to as the "Client") (Collectively referred to as the "Parties").
            </p>
          </div>

          {/* Agreed Design */}
          {contractData.agreedDesign && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">AGREED DESIGN</h2>
              {contractData.agreedDesign.type === 'application/pdf' || contractData.agreedDesign.name.toLowerCase().endsWith('.pdf') ? (
                <p className="text-sm">
                  The agreed design is attached:{' '}
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
              )}
            </div>
          )}

          {/* Construction Property */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">CONSTRUCTION PROPERTY</h2>
            <p className="text-sm mb-2">
              The property the work is to be performed is located at the following address:
            </p>
            {isEditing ? (
              <textarea
                value={contractData.propertyAddress}
                onChange={(e) => handleFieldChange('propertyAddress', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-sm"
                rows={2}
                placeholder="Property Address"
              />
            ) : (
              <p className="font-medium">{contractData.propertyAddress}</p>
            )}
          </div>

          {/* Scope of Work */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">SCOPE OF WORK</h2>
            <p className="text-sm mb-2">The Constructor agrees to perform the following work, as itemised in the estimate:</p>
            {categories.length > 0 ? (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-6 list-disc list-inside" data-testid="scope-categories">
                {categories.map(({ category }) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm italic mb-6">No work has been added to the estimate yet.</p>
            )}

            {/* Stages */}
            {legacy ? (
            <div className="space-y-4 text-sm">
              <p><em>*Some of the following stages progress steps might not be applicable to your project.</em></p>
              
              <div>
                <h3 className="font-semibold">1. Stage 1 - Per Job Attached Scope design:</h3>
                <p><strong>Demolition:</strong> Demo and Prep all areas where work will be performed. Disposal of all debris from demolition.</p>
                <p><strong>Sprinkler:</strong> Trench all areas where Sprinkler work will be performed.</p>
                <p><strong>Framing/Forms:</strong> Framing and building of all forms on project designated areas.</p>
                <p><strong>Electrical/Plumbing:</strong> Run all Rough in electrical, Plumbing, and Sprinkler piping/valves for project designated areas.</p>
                <p><em>All required material and tooling for stage 1 will be purchased by {contractData.contractorName}.</em></p>
              </div>

              <div>
                <h3 className="font-semibold">2. Stage 2 - Per Job Attached Scope design:</h3>
                <p><strong>Earthwork:</strong> Leveling of all areas where work will be performed.</p>
                <p><strong>Concrete:</strong> Assure concrete forms are ready for pouring, and add rebar/steel mesh if applicable.</p>
                <p><strong>Tree/Plants:</strong> Install all Trees, Plants, Shrubs according to plan design.</p>
                <p><strong>Stone/Rock:</strong> Spray Weed/grass killer, weed barrier fabric, rock/stones installation according to plan design.</p>
                <p><em>All required material and tooling for Stage 2 will be purchased by {contractData.contractorName}.</em></p>
              </div>

              <div>
                <h3 className="font-semibold">3. Stage 3 - Per Job Attached Scope design:</h3>
                <p><strong>Concrete pouring:</strong> Pour all concrete to all areas of project scope.</p>
                <p><strong>Gazebo/Pergola:</strong> Build/Install Gazebo, Pergola, Shed According to plan design.</p>
                <p><strong>Masonry:</strong> Build fire pits, flower beds, retaining walls, posts wraps per plan design if applicable.</p>
                <p><strong>Fencing:</strong> Installation of Fencing per plan design.</p>
                <p><strong>Electrical/Plumbing:</strong> Install all Electrical and Plumbing Top out.</p>
                <p><strong>Sod:</strong> Install all sod to project designated areas.</p>
                <p><strong>Artificial Turf:</strong> Installation of artificial turf on all designated areas.</p>
                <p><strong>Final Punch:</strong> Clean the site and verify all work aligns with the approved scope and design.</p>
                <p><em>All required material and tooling for stage 3 will be purchased by {contractData.contractorName}.</em></p>
              </div>
            </div>
            ) : (
              <div className="space-y-4 text-sm" data-testid="trade-stages">
                <p><em>These stages apply only to work included in the estimate and approved scope.</em></p>
                {tradeTemplate?.stages.map((stage, index) => (
                  <div key={stage.title}>
                    <h3 className="font-semibold">{index + 1}. {stage.title}</h3>
                    {stage.steps.map(step => <p key={step.label}><strong>{step.label}:</strong> {step.text}</p>)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Estimated Project Start date:</strong>{' '}
                {isEditing ? (
                  <input
                    type="date"
                    value={contractData.startDate}
                    onChange={(e) => handleFieldChange('startDate', e.target.value)}
                    className="ml-1 p-1 border border-gray-300 rounded text-xs"
                  />
                ) : (
                  formatDate(contractData.startDate)
                )}
              </div>
              <div>
                <strong>Estimated completion date:</strong>{' '}
                {isEditing ? (
                  <input
                    type="date"
                    value={contractData.completionDate}
                    onChange={(e) => handleFieldChange('completionDate', e.target.value)}
                    className="ml-1 p-1 border border-gray-300 rounded text-xs"
                  />
                ) : (
                  formatDate(contractData.completionDate)
                )}
              </div>
            </div>
          </div>

          {/* Pricing Table */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Payment Terms</h2>
            <h3 className="font-medium mb-3">Job estimate Scope Total</h3>
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
                    <td className="border border-gray-300 px-3 py-2">Total</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(contractData.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Financing and Payment Structure */}
          <div className="mb-6 text-sm">
            <p className="mb-4">
              "If customer chooses Good Leap financing, project funding will be due at project completion, 
              if chooses self funded pay structure is listed below"
            </p>
            
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>Initial deposit of 50% due at signing date</div>
                <div>Stage 1 Draw of 50% due at signing date</div>
              </div>
              <div className="font-medium">Total: {formatCurrency(contractData.totalAmount * 0.5)}</div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>Stage 2: 40% Second draw at Stage 2 completion.</div>
                <div>Total: {formatCurrency(contractData.totalAmount * 0.4)}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>Stage 3: Final 10% payment at Stage 3 completion</div>
                <div>Total: {formatCurrency(contractData.totalAmount * 0.1)}</div>
              </div>
            </div>
          </div>

          {/* Payment Terms and Policies */}
          <div className="mb-6 text-sm space-y-3">
            <p>Initial deposit Payment must be submitted by QuickBooks Secured payment link.</p>
            <p>Payments must be submitted on time of stage completion or late fee* of 10% will be added to each payment.</p>
            
            <div>
              <h3 className="font-semibold">Payment Default:</h3>
              <p><strong>*Mechanic's Lien:</strong> If payment is past due past more than 30 days after project completion a Lien will be filed against the property.</p>
            </div>

            <div>
              <h3 className="font-semibold">*Project Duration Clause</h3>
              <p>The estimated project duration is based on standard construction timelines; however, actual completion dates may vary due to factors beyond our control. These factors include, but are not limited to, adverse weather conditions, delays in material availability, unforeseen site conditions, changes requested by the client, and scheduling or performance issues with subcontractors or suppliers. {contractData.contractorName} will make reasonable efforts to mitigate delays and keep the client informed of any significant changes to the project timeline. Any such delays shall not constitute a breach of contract, nor shall they result in penalties or liability for additional costs unless otherwise agreed in writing.</p>
            </div>

            <div>
              {legacy ? (
                <>
              <p><strong>*{contractData.contractorName} offers 2 year workmanship warranty attached at the end of this contract and signed at project completion.</strong></p>
              <p><strong>*Vendor 16 year warranty for turf materials shared separately from this contract.</strong></p>
                </>
              ) : (
                <>
                  <p><strong>Workmanship warranty: {contractData.warrantyPeriod || 'As agreed in writing'}.</strong></p>
                  <p>Material and product warranties apply only to the products included in the estimate, subject to their manufacturers' terms.</p>
                </>
              )}
            </div>

            <div>
              <h3 className="font-semibold">*Change Order Policy</h3>
              <p>Any changes to the original scope of work, once this Agreement has been signed, must be requested in writing through a Change Order Form. Each approved change order is subject to the following terms:</p>
              <ol className="list-decimal list-inside ml-4 space-y-1">
                <li><strong>Change Order Fee:</strong> A service fee of 10% of the original contract value (or $500 minimum, whichever is greater) will be charged per change order request. This fee covers administrative time, scheduling adjustments, material procurement, and potential rework of existing plans.</li>
                <li><strong>Additional Costs:</strong> Any materials, labor, or subcontractor costs directly associated with the requested change will be added to (or deducted from) the contract total and must be approved by the Client before work begins.</li>
                <li><strong>Timeline Impact:</strong> Changes may affect the original project timeline. {contractData.contractorName} will provide an updated estimated completion date with each approved change.</li>
                <li><strong>Intent:</strong> This policy is in place to encourage clarity and certainty in the design and planning phase, and to prevent costly and disruptive mid-project changes. We believe in doing things right the first time—for your benefit and ours.</li>
              </ol>
            </div>
          </div>

          {signature}

          {/* Notice of Cancellation */}
          <div className="mt-8 p-4 border-2 border-gray-400 text-xs">
            <h3 className="font-bold text-center mb-3">Notice of Cancellation</h3>
            <p className="mb-2">
              You may cancel this transaction, without any penalty or obligation, within three business days from the above date. 
              If you cancel, any property traded in, any payments made by you under the contract of sale, and any negotiable 
              instrument executed by you will be returned within ten (10) days following receipt by the seller of your 
              cancellation notice, and any security interest arising out of the transaction will be cancelled.
            </p>
            <p className="mb-2">
              If you cancel, you must make available to the seller at your residence, in substantially as good condition as 
              when received, any goods delivered to you under this contract or sale, or you may, if you wish, comply with 
              the instructions of the seller regarding the return shipment of the goods at the seller's expense and risk.
            </p>
            <p className="mb-2">
              To cancel this transaction, customer should contact {contractData.contractorEmail || contractData.contractorPhone || contractData.contractorName || 'the contractor'}
            </p>
          </div>

          {/* Texas Property Code Notice */}
          <div className="mt-6 p-4 border border-gray-300 text-xs">
            <h3 className="font-bold text-center mb-3">TEXAS PROPERTY CODE</h3>
            <p className="font-bold mb-2">"KNOW YOUR RIGHTS AND RESPONSIBILITIES UNDER THE LAW.</p>
            <p className="mb-2">
              You are about to enter into a transaction to build a new home or remodel existing residential property. 
              Texas law requires your contractor to provide you with this brief overview of some of your rights, 
              responsibilities, and risks in this transaction."
            </p>
            <div className="space-y-2">
              <p><strong>CONVEYANCE TO CONTRACTOR NOT REQUIRED.</strong> Your contractor may not require you to convey your real property to your contractor as a condition to the agreement for the construction of improvements on your property.</p>
              <p><strong>KNOW YOUR CONTRACTOR.</strong> Before you enter into your agreement for the construction of improvements to your real property, make sure that you have investigated your contractor. Obtain and verify references from other people who have used the contractor for the type and size of construction project on your property.</p>
              <p><strong>GET IT IN WRITING.</strong> Make sure that you have a written agreement with your contractor that includes: (1) a description of the work the contractor is to perform; (2) the required or estimated time for completion of the work; (3) the cost of the work or how the cost will be determined; and (4) the procedure and method of payment, including provisions for statutory reservation of funds and conditions for final payment.</p>
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
        <p className="text-sm text-gray-600 italic">
          Awaiting client signature — the client signs when they accept the estimate link.
        </p>
      )}
    </div>

    <div>
      <h3 className="font-medium mb-4">{contractorName || 'Your business'}</h3>
      <div className="border-b border-gray-400 mb-2 h-12"></div>
      <p className="text-sm">Authorized Representative</p>
    </div>
  </div>
);
