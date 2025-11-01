import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Edit, Save, Download, Send } from 'lucide-react';
import { EstimateService, Estimate } from '../../services/EstimateService';
import { ContractService, ContractData } from '../../services/ContractService';
import { formatCurrency } from '../../utils/format';
import { OrganizationContext } from '../layouts/DashboardLayout';

export const EstimateContractView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    const fetchEstimateAndContract = async () => {
      try {
        setLoading(true);
        const result = await EstimateService.getById(id);
        setEstimate(result);
        
        if (result) {
          // Check if a contract already exists for this estimate
          let existingContract = null;
          if (result.project_id) {
            try {
              const projectContracts = await ContractService.getProjectContracts(result.project_id);
              existingContract = projectContracts.find(contract => 
                contract.name.includes(result.estimate_number)
              );
              if (existingContract) {
                setContractId(existingContract.id);
              }
            } catch (error) {
              // No existing contract found, which is fine
              console.log('No existing contract found, will auto-generate');
            }
          }

          // Convert estimate to contract data (always generate fresh data)
          const contract: ContractData = {
            propertyAddress: result.client?.address || '',
            clientName: result.client?.name || '',
            clientAddress: result.client?.address || '',
            contractorName: 'Campos Family Properties, LLC',
            contractorAddress: 'Your Company Address', // TODO: Get from organization settings
            contractorEmail: 'camposfamilypropertiesllc@gmail.com', // TODO: Get from organization settings
            authorizedRepresentative: 'Marcel Campos', // TODO: Get from organization settings
            workDescription: result.description || 'Service work based on estimate',
            totalAmount: result.total_amount,
            lineItems: result.items?.map(item => ({
              description: item.description || 'Service',
              quantity: item.quantity || 1,
              unit: item.unit || 'ea',
              unitPrice: item.unit_price,
              total: item.total_price
            })) || [],
            startDate: new Date().toISOString().split('T')[0], // Default to today
            completionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default 30 days from now
            paymentTerms: '50% deposit upon signing, 50% upon completion',
            warrantyPeriod: '1 year'
          };

          // Check for existing design image in project documents
          if (result.project_id) {
            try {
              const { data: designDocs } = await supabase
                .from('project_documents')
                .select('*')
                .eq('project_id', result.project_id)
                .eq('type', 'agreed_design')
                .order('created_at', { ascending: false })
                .limit(1);

              if (designDocs && designDocs.length > 0) {
                const designDoc = designDocs[0];
                contract.agreedDesignImageUrl = designDoc.content;
                contract.agreedDesignImageName = designDoc.name?.replace('Agreed Design - ', '') || 'Project Design';
              }
            } catch (error) {
              console.log('No design document found:', error);
            }
          }

          setContractData(contract);

          // Auto-generate and save contract if it doesn't exist yet
          if (!existingContract && selectedOrg?.id) {
            try {
              setAutoGenerating(true);
              const contractResult = await ContractService.saveContract(result.id, contract, selectedOrg.id);
              setContractId(contractResult.contractId);
              console.log('Contract auto-generated successfully');
            } catch (error) {
              console.error('Error auto-generating contract:', error);
              // Don't fail the whole load - user can still view the contract preview
            } finally {
              setAutoGenerating(false);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching estimate:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEstimateAndContract();
  }, [id, selectedOrg?.id]);

  const handleSave = async () => {
    if (!contractData || !estimate?.id || !selectedOrg?.id) return;
    
    try {
      setSaving(true);
      
      if (contractId) {
        // Update existing contract
        await ContractService.updateContract(contractId, contractData);
      } else {
        // Create new contract
        const result = await ContractService.saveContract(estimate.id, contractData, selectedOrg.id);
        setContractId(result.contractId);
      }
      
      alert('Contract saved successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: keyof ContractData, value: any) => {
    if (!contractData) return;
    setContractData({ ...contractData, [field]: value });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] text-white">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#fbbf24] mx-auto mb-4"></div>
            {autoGenerating ? (
              <p className="text-gray-400 text-sm">Setting up your contract...</p>
            ) : (
              <p className="text-gray-400 text-sm">Loading contract...</p>
            )}
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
            onClick={() => navigate(`/estimates/${id}`)}
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
              onClick={() => navigate(`/estimates/${id}`)}
              className="p-2 hover:bg-[#333333] rounded transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Contract - {estimate.estimate_number}</h1>
              <p className="text-sm text-gray-400">
                {contractId ? 'Contract ready for' : 'Contract for'} {contractData.clientName}
                {autoGenerating && <span className="ml-2 text-[#fbbf24]">• Setting up...</span>}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] border border-[#404040] text-white rounded-lg hover:bg-[#333333] transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
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
                  onClick={() => setIsEditing(false)}
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
        <div className="bg-white text-black p-8 rounded-lg shadow-lg print:shadow-none print:rounded-none">
          {/* Contract Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">SERVICES CONTRACT AGREEMENT</h1>
          </div>

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
                new Date(contractData.startDate).toLocaleDateString()
              )} (The effective date), by and between{' '}
              {isEditing ? (
                <input
                  type="text"
                  value={contractData.contractorName}
                  onChange={(e) => handleFieldChange('contractorName', e.target.value)}
                  className="mx-1 p-1 border border-gray-300 rounded text-xs"
                  placeholder="Contractor Name"
                />
              ) : (
                <strong>{contractData.contractorName}</strong>
              )} (Hereinafter referred to as the "Constructor") and{' '}
              {isEditing ? (
                <input
                  type="text"
                  value={contractData.clientName}
                  onChange={(e) => handleFieldChange('clientName', e.target.value)}
                  className="mx-1 p-1 border border-gray-300 rounded text-xs"
                  placeholder="Client Name"
                />
              ) : (
                <strong>{contractData.clientName}</strong>
              )} (Hereinafter referred to as the "Client") (Collectively referred to as the "Parties").
            </p>
          </div>

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
            <p className="text-sm mb-4">
              The Constructor agrees to perform the construction described checked below:
              <br />
              <strong>Only Selected (X) work Items apply.</strong>
            </p>
            
            {/* Service Categories Grid */}
            <div className="grid grid-cols-3 gap-2 text-sm mb-6">
              {[
                'Demolition', 'Electrical', 'Plumbing', 'Sprinkler', 'Concrete', 'Rock/Stone',
                'Fencing', 'Masonry', 'Tree/Plants', 'Pergola', 'Gazebo', 'Sheds',
                'Sod', 'Art. Turf', 'Outdoor Kitchen'
              ].map((service, index) => {
                const isSelected = contractData.lineItems.some(item => 
                  item.description.toLowerCase().includes(service.toLowerCase())
                );
                return (
                  <div key={index} className="flex items-center">
                    <span className="mr-2">{isSelected ? '☑' : '☐'}</span>
                    <span>{service}</span>
                  </div>
                );
              })}
            </div>

            {/* Stages */}
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
                  new Date(contractData.startDate).toLocaleDateString()
                )}
              </div>
              <div>
                <strong>Project Duration:</strong>{' '}
                {isEditing ? (
                  <input
                    type="text"
                    value={contractData.warrantyPeriod}
                    onChange={(e) => handleFieldChange('warrantyPeriod', e.target.value)}
                    className="ml-1 p-1 border border-gray-300 rounded text-xs w-32"
                    placeholder="6 working days"
                  />
                ) : (
                  contractData.warrantyPeriod || '6 working days'
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
                  {/* Service Categories with auto-population from estimate */}
                  {[
                    'Demolition', 'Electrical', 'Plumbing', 'Sprinkler', 'Concrete', 'Paver',
                    'Rock/Stone', 'Fencing', 'Masonry', 'Trees/Plants/Shrubs', 'Pergola', 'Gazebo',
                    'Shed', 'Sod', 'Artificial Turf', 'Outdoor Kitchen'
                  ].map((service, index) => {
                    const matchingItems = contractData.lineItems.filter(item => 
                      item.description.toLowerCase().includes(service.toLowerCase()) ||
                      (service === 'Trees/Plants/Shrubs' && (
                        item.description.toLowerCase().includes('tree') ||
                        item.description.toLowerCase().includes('plant') ||
                        item.description.toLowerCase().includes('shrub')
                      )) ||
                      (service === 'Rock/Stone' && (
                        item.description.toLowerCase().includes('rock') ||
                        item.description.toLowerCase().includes('stone')
                      )) ||
                      (service === 'Artificial Turf' && (
                        item.description.toLowerCase().includes('artificial') ||
                        item.description.toLowerCase().includes('turf')
                      ))
                    );
                    const serviceTotal = matchingItems.reduce((sum, item) => sum + item.total, 0);
                    
                    return (
                      <tr key={index}>
                        <td className="border border-gray-300 px-3 py-2 w-1/2">{service}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {serviceTotal > 0 ? formatCurrency(serviceTotal) : '$'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="border border-gray-300 px-3 py-2">Discounts</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">$</td>
                  </tr>
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
              <p><strong>*{contractData.contractorName} offers 2 year workmanship warranty attached at the end of this contract and signed at project completion.</strong></p>
              <p><strong>*Vendor 16 year warranty for turf materials shared separately from this contract.</strong></p>
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

          {/* Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-gray-300">
            <div>
              <h3 className="font-medium mb-4">Client signature:</h3>
              <div className="border-b border-gray-400 mb-2 h-12"></div>
              <div className="border-b border-gray-400 mb-2 h-8 mt-4"></div>
              <p className="text-sm">Date:</p>
            </div>
            
            <div>
              <h3 className="font-medium mb-4">{contractData.contractorName}</h3>
              <div className="border-b border-gray-400 mb-2 h-12"></div>
              <p className="text-sm">Marcel Campos</p>
              <p className="text-sm">Authorized Representative</p>
              <div className="border-b border-gray-400 mb-2 h-8 mt-4"></div>
              <p className="text-sm">Date: {new Date().toLocaleDateString()}</p>
            </div>
          </div>

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
              To cancel this transaction, customer should email camposfamilypropertiesllc@gmail.com
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
        </div>
      </div>
    </div>
  );
};

export default EstimateContractView;