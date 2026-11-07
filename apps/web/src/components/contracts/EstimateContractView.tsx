import React, { useState, useEffect } from 'react';
import { formatDate } from '../../utils/format';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Edit, Save, Download } from 'lucide-react';
import { EstimateService, Estimate } from '../../services/EstimateService';
import { Business, ContractData, ContractTerms, contractFor, missingBusinessDetails } from '../../services/contract';
import { estimatesAPI, organizationsAPI, type EstimateDocuments } from '../../lib/api';
import { AgreementTerms, ContractSignatures } from './AgreementTerms';
import { SignedRecord } from './SignedRecord';
import { approvalLine } from '../estimates/estimateActions';
import { notify } from '../common/appDialogs';
interface EstimateContractViewProps {
  /** Shown as a sheet over the estimate: which estimate, and how to close it. Without these it's the /estimates/:id/contract page. */
  estimateId?: string;
  onClose?: () => void;
  /** Closing: the sheet fades out (it faded in when it opened). */
  leaving?: boolean;
  /** The signed record instead of the agreement (the page's ?record=1). */
  record?: boolean;
  /** The estimate after its terms are saved here, so the estimate underneath stays current. */
  onSaved?: (estimate: Estimate) => void;
}

export const EstimateContractView: React.FC<EstimateContractViewProps> = ({ estimateId, onClose, record, onSaved, leaving = false }) => {
  const params = useParams<{ id: string }>();
  const id = estimateId ?? params.id;
  const navigate = useNavigate();
  const location = useLocation();
  // Back to the estimate by stepping back, so closing the estimate afterwards
  // doesn't return here. Opened directly, replace this page with the estimate.
  // As a sheet it just closes, leaving the estimate (and its tab) as it was.
  const backToEstimate = () => {
    if (onClose) onClose();
    else if (location.key !== 'default') navigate(-1);
    else navigate(`/estimates/${id}`, { replace: true, state: { closeTo: '/work' } });
  };
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);
  // The terms being edited; the rest of the contract comes from the estimate.
  const [draftTerms, setDraftTerms] = useState<ContractTerms | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // ?record=1 shows the signed record instead: who signed and the exact files.
  const showRecord = record ?? new URLSearchParams(location.search).get('record') === '1';
  const [documents, setDocuments] = useState<EstimateDocuments | null>(null);
  const isEditing = draftTerms !== null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const result = await EstimateService.getById(id);
        if (!cancelled) setEstimate(result);
      } catch (error) {
        console.error('Error fetching estimate:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The business details fill in when they arrive; the contract doesn't wait for them.
  // This page is outside DashboardLayout, so the organization comes from the estimate.
  const organizationId = estimate?.organization_id;
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    organizationsAPI
      .getById(organizationId)
      .then((org: Business | null) => {
        if (cancelled) return;
        setBusiness(org);
        setBusinessLoaded(true);
      })
      .catch(() => !cancelled && setBusinessLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!showRecord || !id) return;
    estimatesAPI.documents(id).then(setDocuments).catch(() => setDocuments(null));
  }, [showRecord, id]);

  // As a sheet, Esc closes it (the estimate drawer underneath leaves Esc to it), unless terms are being edited.
  useEffect(() => {
    if (!onClose || isEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isEditing]);

  /** The page as is; as a sheet, over everything and the only thing printed. */
  const frame = (page: React.ReactElement) =>
    onClose
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={showRecord ? 'Signed record' : 'Agreement'}
            className={`agreement-sheet fixed inset-0 z-[10010] overflow-y-auto overscroll-contain bg-black print:static print:overflow-visible ${
              leaving ? 'opacity-0 transition-opacity' : 'motion-safe:animate-fade-in-plain'
            }`}
          >
            <style>{'@media print { body > :not(.agreement-sheet) { display: none !important; } }'}</style>
            {page}
          </div>,
          document.body,
        )
      : page;

  const contract: ContractData | null = estimate ? contractFor(estimate, business) : null;
  // While editing, show the terms being typed.
  const contractData: ContractData | null = contract && draftTerms ? { ...contract, ...draftTerms } : contract;
  const locked = Boolean(contract?.lockedAt);
  const missing = businessLoaded ? missingBusinessDetails(business) : [];

  const startEditing = () => {
    if (!contract) return;
    setDraftTerms({
      startDate: contract.startDate,
      completionDate: contract.completionDate,
      paymentTerms: contract.paymentTerms,
      warrantyPeriod: contract.warrantyPeriod,
      workDescription: contract.workDescription,
      propertyAddress: contract.propertyAddress,
    });
  };

  const handleSave = async () => {
    if (!estimate?.id || !draftTerms) return;
    try {
      setSaving(true);
      const saved = await EstimateService.update(estimate.id, { contract_terms: draftTerms });
      setEstimate(saved);
      setDraftTerms(null);
      if (saved) onSaved?.(saved);
    } catch (error) {
      console.error('Error saving contract:', error);
      notify(error instanceof Error ? error.message : "Couldn't save the agreement. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: keyof ContractTerms, value: string) => {
    if (draftTerms) setDraftTerms({ ...draftTerms, [field]: value });
  };

  if (loading) {
    return frame(
      <div className="min-h-screen bg-[#000000] text-white">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#336699] mx-auto mb-4"></div>
            <p className="text-gray-400 text-sm">Loading the agreement…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!estimate || !contractData) {
    return frame(
      <div className="min-h-screen bg-[#000000] text-white">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Contract not found</h3>
          <button
            onClick={backToEstimate}
            className="text-[#5b8fc7] hover:text-white transition-colors"
          >
            Back to Estimate
          </button>
        </div>
      </div>
    );
  }

  if (showRecord) {
    const snapshot = estimate.contract_snapshot as { client?: { name?: string } } | undefined;
    return frame(
      <div className="min-h-screen bg-[#000000] text-white">
        <div className="bg-[#1a1a1a] border-b border-[#333333] px-6 py-4 flex items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-4">
            <button onClick={backToEstimate} className="p-2 hover:bg-[#333333] rounded transition-colors" aria-label="Back">
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <h1 className="text-xl font-semibold text-white">Signed record - {estimate.estimate_number}</h1>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors"
          >
            <Download className="w-4 h-4" />
            Print/PDF
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-8">
          {documents === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <SignedRecord
              estimateNumber={estimate.estimate_number ?? ''}
              signerName={snapshot?.client?.name}
              signature={estimate.client_signature}
              signedAt={estimate.client_signature ? (estimate.signed_at ?? estimate.contract_locked_at) : estimate.signed_at}
              approvedAt={estimate.client_signature ? undefined : estimate.approved_at}
              approvedBy={estimate.approved_by_name}
              acknowledgedAt={documents.acknowledgedAt}
              documents={[documents.agreement, ...documents.attachments]}
            />
          )}
        </div>
      </div>
    );
  }

  return frame(
    <div className="min-h-screen bg-[#000000] text-white">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-[#333333] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={backToEstimate}
              className="p-2 hover:bg-[#333333] rounded transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Contract - {estimate.estimate_number}</h1>
              <p className="text-sm text-gray-400">
                {locked
                  ? `${approvalLine(estimate) ?? `Signed ${formatDate(contractData.lockedAt!)}`} · changes go on a change order`
                  : `Contract for ${contractData.clientName || 'no client yet'} · follows the estimate`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!isEditing ? (
              <>
                {!locked && <button
                  onClick={startEditing}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] border border-[#404040] text-white rounded-lg hover:bg-[#333333] transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit terms
                </button>}
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Print/PDF
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setDraftTerms(null)}
                  className="px-4 py-2 bg-[#2a2a2a] border border-[#404040] text-white rounded-lg hover:bg-[#333333] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2a5580] transition-colors font-medium disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Contract Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {missing.length > 0 && (
          <div className="mb-4 p-3 border border-yellow-500/40 bg-yellow-500/10 text-sm text-yellow-200 print:hidden">
            Add your {missing.join(', ')} to your organization so they appear on your contracts.
          </div>
        )}
        <div className="bg-white text-black p-8 rounded-lg shadow-lg print:shadow-none print:rounded-none">
          {/* Contract Header */}
          <div className="text-center mb-8">
            {business?.logoUrl && (
              <img src={business.logoUrl} alt={business.name ?? ''} className="max-h-16 max-w-[220px] object-contain mx-auto mb-4" data-testid="company-logo" />
            )}
            <h1 className="text-2xl font-bold mb-2">SERVICES CONTRACT AGREEMENT</h1>
          </div>

          <AgreementTerms
            contract={contractData}
            onFieldChange={isEditing ? handleFieldChange : undefined}
            signature={
              <ContractSignatures
                contractorName={contractData.contractorName}
                signature={estimate.client_signature}
                signedAt={estimate.signed_at}
                approval={approvalLine(estimate)}
              />
            }
          />
        </div>
      </div>
    </div>
  );
};

export default EstimateContractView;