import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Edit, Save, Download } from 'lucide-react';
import { EstimateService, Estimate } from '../../services/EstimateService';
import { Business, ContractData, ContractTerms, contractFor, missingBusinessDetails } from '../../services/contract';
import { organizationsAPI } from '../../lib/api';
import { AgreementTerms, ContractSignatures } from './AgreementTerms';
import { OrganizationContext } from '../layouts/DashboardLayout';

export const EstimateContractView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Back to the estimate by stepping back, so closing the estimate afterwards
  // doesn't return here. Opened directly, replace this page with the estimate.
  const backToEstimate = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(`/estimates/${id}`, { replace: true, state: { closeTo: '/work' } });
  };
  const { selectedOrg } = useContext(OrganizationContext);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);
  // The terms being edited; the rest of the contract comes from the estimate.
  const [draftTerms, setDraftTerms] = useState<ContractTerms | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  useEffect(() => {
    if (!selectedOrg?.id) return;
    let cancelled = false;
    organizationsAPI
      .getById(selectedOrg.id)
      .then((org: Business | null) => {
        if (cancelled) return;
        setBusiness(org);
        setBusinessLoaded(true);
      })
      .catch(() => !cancelled && setBusinessLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [selectedOrg?.id]);

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
      setEstimate(await EstimateService.update(estimate.id, { contract_terms: draftTerms }));
      setDraftTerms(null);
    } catch (error) {
      console.error('Error saving contract:', error);
      alert(error instanceof Error ? error.message : 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: keyof ContractTerms, value: string) => {
    if (draftTerms) setDraftTerms({ ...draftTerms, [field]: value });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] text-white">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#fbbf24] mx-auto mb-4"></div>
            <p className="text-gray-400 text-sm">Loading contract...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!estimate || !contractData) {
    return (
      <div className="min-h-screen bg-[#000000] text-white">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Contract not found</h3>
          <button
            onClick={backToEstimate}
            className="text-[#fbbf24] hover:text-white transition-colors"
          >
            Back to Estimate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-[#333333] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={backToEstimate}
              className="p-2 hover:bg-[#333333] rounded transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Contract - {estimate.estimate_number}</h1>
              <p className="text-sm text-gray-400">
                {locked
                  ? `Signed ${new Date(contractData.lockedAt!).toLocaleDateString()} · changes go on a change order`
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
                  className="flex items-center gap-2 px-4 py-2 bg-[#fbbf24] text-black rounded-lg hover:bg-[#f59e0b] transition-colors font-medium disabled:opacity-50"
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
              />
            }
          />
        </div>
      </div>
    </div>
  );
};

export default EstimateContractView;