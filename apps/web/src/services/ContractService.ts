import { supabase } from '../lib/supabase';

export interface ContractData {
  propertyAddress: string;
  clientName: string;
  clientAddress: string;
  contractorName: string;
  contractorAddress: string;
  contractorEmail: string;
  authorizedRepresentative: string;
  workDescription: string;
  totalAmount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
  }>;
  startDate: string;
  completionDate: string;
  paymentTerms: string;
  warrantyPeriod: string;
  agreedDesignImageUrl?: string;
  agreedDesignImageName?: string;
}

export class ContractService {
  /**
   * Generate contract content from contract data
   */
  static generateContractContent(contractData: ContractData): string {
    const serviceCategories = [
      'Demolition', 'Electrical', 'Plumbing', 'Sprinkler', 'Concrete', 'Paver',
      'Rock/Stone', 'Fencing', 'Mansory', 'Trees/Plants/Shrubs', 'Pergola', 'Gazebo',
      'Shed', 'Sod', 'Artificial Turf', 'Outdoor Kitchen'
    ];

    const pricingTable = serviceCategories.map(service => {
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
      return `${service} $${serviceTotal > 0 ? serviceTotal.toFixed(2) : ''}`;
    }).join('\n') + '\nDiscounts $\nTotal $' + contractData.totalAmount.toFixed(2);

    return `SERVICES CONTRACT AGREEMENT

PARTIES:
This services contract agreement (Hereinafter referred to as the "Agreement") is entered into ${new Date(contractData.startDate).toLocaleDateString()} (The effective date), by and between ${contractData.contractorName} (Hereinafter referred to as the "Constructor") and ${contractData.clientName} (Hereinafter referred to as the "Client") (Collectively referred to as the "Parties"). 

Agreed Design:
${contractData.agreedDesignImageUrl ? `[Design Image: ${contractData.agreedDesignImageName || 'Project Design'}]` : '[Design to be uploaded]'}

CONSTRUCTION PROPERTY:
The property the work is to be performed is located at the following address:
${contractData.propertyAddress}

SCOPE OF WORK:
The Constructor agrees to perform the construction described checked below: Only Selected (X) work Items apply.

${serviceCategories.map(service => {
  const isSelected = contractData.lineItems.some(item => 
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
  return `${isSelected ? service + 'X' : service}`;
}).join(' ')}

*Some of the following stages progress steps might not be applicable to your project.

1. Stage 1 - Per Job Attached Scope design:
Demolition: Demo and Prep all areas where work will be performed. Disposal of all debris from demolition.
Sprinkler: Trench all areas where Sprinkler work will be performed.
Framing/Forms: Framing and building of all forms on project designated areas.
Electrical/Plumbing: Run all Rough in electrical, Plumbing, and Sprinkler piping/valves for project designated areas.
All required material and tooling for stage 1 will be purchased by ${contractData.contractorName}.

2. Stage 2 - Per Job Attached Scope design:
Earthwork: Leveling of all areas where work will be performed.
Concrete: Assure concrete forms are ready for pouring, and add rebar/steel mesh if applicable.
Tree/Pants: Install all Trees, Plants, Shrubs according to plan design.
Stone/Rock: Spray Weed/grass killer, weed barrier fabric, rock/stones installation according to plan design.
All required material and tooling for Stage 2 will be purchased by ${contractData.contractorName}.

3. Stage 3 - Per Job Attached Scope design:
Concrete pouring: Pour all concrete to all areas of project scope.
Gazebo/Pergola: Build/Install Gazebo, Pergola, Shed According to plan design.
Masonry: Build fire pits, flower beds, retaining walls, posts wraps per plan design if applicable.
Fencing: Installation of Fencing per plan design.
Electrical/Plumbing: Install all Electrical and Plumbing Top out.
Sod: Install all sod to project designated areas.
Artificial Turf: Installation of artificial turf on all designated areas.
Final Punch: Clean the site and verify all work aligns with the approved scope and design.
All required material and tooling for stage 3 will be purchased by ${contractData.contractorName}.

Estimated Project Start date: ${new Date(contractData.startDate).toLocaleDateString()}
Project Duration: ${contractData.warrantyPeriod || '6 working days'}*

Payment Terms
Job estimate Scope Total
${pricingTable}

"If customer chooses GoodLeap financing, project funding will be due at project completion, if chooses self funded pay structure is listed below"

Initial deposit of 50% due at signing date
Stage 1
Draw of 50% due at signing date
Total: $${(contractData.totalAmount * 0.5).toFixed(2)}

Stage 2: 40% Second draw at Stage 2 completion.
Total: $${(contractData.totalAmount * 0.4).toFixed(2)}

Stage 3: Final 10% payment at Stage 3 completion
Total: $${(contractData.totalAmount * 0.1).toFixed(2)}

Initial deposit Payment must be submitted by QuickBooks Secured payment link. Payments must be submitted on time of stage completion or late fee* of 10% will be added to each payment.

Payment Default:
*Mechanic's Lien: If payment is past due past more than 30 days after project completion a Lien will be filed against the property.

*Project Duration Clause: The estimated project duration is based on standard construction timelines; however, actual completion dates may vary due to factors beyond our control. These factors include, but are not limited to, adverse weather conditions, delays in material availability, unforeseen site conditions, changes requested by the client, and scheduling or performance issues with subcontractors or suppliers. ${contractData.contractorName} will make reasonable efforts to mitigate delays and keep the client informed of any significant changes to the project timeline. Any such delays shall not constitute a breach of contract, nor shall they result in penalties or liability for additional costs unless otherwise agreed in writing.

* ${contractData.contractorName} offers 2 year workmanship warranty attached at the end of this contract and signed at project completion.
*Vendor 16 year warranty for turf materials shared separately from this contract.

*Change Order Policy
Any changes to the original scope of work, once this Agreement has been signed, must be requested in writing through a Change Order Form. Each approved change order is subject to the following terms:
1. Change Order Fee: A service fee of 10% of the original contract value (or $500 minimum, whichever is greater) will be charged per change order request. This fee covers administrative time, scheduling adjustments, material procurement, and potential rework of existing plans.
2. Additional Costs: Any materials, labor, or subcontractor costs directly associated with the requested change will be added to (or deducted from) the contract total and must be approved by the Client before work begins.
3. Timeline Impact: Changes may affect the original project timeline. ${contractData.contractorName} will provide an updated estimated completion date with each approved change.
4. Intent: This policy is in place to encourage clarity and certainty in the design and planning phase, and to prevent costly and disruptive mid-project changes. We believe in doing things right the first time — for your benefit and ours.

Client signature: _________________________ Date: _____________

${contractData.contractorName} Date: ${new Date().toLocaleDateString()}
${contractData.authorizedRepresentative}
Authorized Representative

Notice of Cancellation
You may cancel this transaction, without any penalty or obligation, within three business days from the above date. If you cancel, any property traded in, any payments made by you under the contract of sale, and any negotiable instrument executed by you will be returned within ten (10) days following receipt by the seller of your cancellation notice, and any security interest arising out of the transaction will be cancelled.

If you cancel, you must make available to the seller at your residence, in substantially as good condition as when received, any goods delivered to you under this contract or sale, or you may, if you wish, comply with the instructions of the seller regarding the return shipment of the goods at the seller's expense and risk. If you do make the goods available to the seller and the seller does not pick them up within twenty (20) days of the date of your notice of cancellation, you may retain or dispose of the goods without any further obligation. If you fail to make the goods available to the seller, or if you agree to return the goods to the seller and fail to do so, then you remain liable for performance of all obligations under the contract.

To cancel this transaction, customer should email ${contractData.contractorEmail}

TEXAS PROPERTY CODE
"KNOW YOUR RIGHTS AND RESPONSIBILITIES UNDER THE LAW. You are about to enter into a transaction to build a new home or remodel existing residential property. Texas law requires your contractor to provide you with this brief overview of some of your rights, responsibilities, and risks in this transaction."

CONVEYANCE TO CONTRACTOR NOT REQUIRED. Your contractor may not require you to convey your real property to your contractor as a condition to the agreement for the construction of improvements on your property.

KNOW YOUR CONTRACTOR. Before you enter into your agreement for the construction of improvements to your real property, make sure that you have investigated your contractor. Obtain and verify references from other people who have used the contractor for the type and size of construction project on your property.

GET IT IN WRITING. Make sure that you have a written agreement with your contractor that includes: (1) a description of the work the contractor is to perform; (2) the required or estimated time for completion of the work; (3) the cost of the work or how the cost will be determined; and (4) the procedure and method of payment, including provisions for statutory reservation of funds and conditions for final payment.

PROTECT YOURSELF. Neither a certificate of insurance nor a certificate of registration with the state provides a guarantee that your contractor will complete the contract or perform the work properly. It is important to ask specific questions about the contractor's level of insurance coverage and the contractor's credit and business history.

KNOW WHEN TO PAY. Do not make payment in advance for work that has not been performed or for materials that have not been delivered. Pay only for that portion of the work that has been satisfactorily completed or for materials delivered for use in the construction of improvements to your property.

BEWARE OF THE BARGAIN. You should be suspicious of any bid that is significantly below other bids. An unusually low bid may mean that the contractor lacks insurance, may not be able to perform the quality of work described in your agreement, or may be counting on charging additional costs that were not included in the original bid.

UNDERSTAND YOUR RIGHT TO CANCEL. You may have the right to cancel your construction agreement within three days after signing it if the agreement was signed at a place other than the contractor's normal place of business or if you were directly solicited at your residence or by telephone, including a telemarketing call.

KEEP COMPLETE RECORDS. Keep a complete record of your dealings with your contractor, including copies of any invoices, canceled checks, or other evidence of payment. Under certain circumstances, the law will allow you to recover the amount of your down payment if the contractor does not complete the contract or perform the work properly.

KNOW THE LIMIT. The contractor's bid may not include all charges, such as fees required by local governments or the cost of permits, plans, or inspections. Make sure you understand what is and what is not included in your agreement.

GET A LIEN RELEASE. Before making final payment, get a release of lien signed by the contractor and by each person who sold materials used in or performed work on your improvements. Get information about lien release requirements from your attorney, title company, or local building officials.

ARBITRATION. Some construction agreements contain a clause requiring arbitration of any dispute relating to the agreement. Before you sign an agreement containing an arbitration clause, understand that you may be giving up your right to sue the contractor in court or to have a jury hear your case if a dispute arises. Talk to your attorney about the benefits and risks of arbitration.

READ BEFORE YOU SIGN. Do not sign any document before you have read and understood it. NEVER SIGN A DOCUMENT THAT INCLUDES AN UNTRUE STATEMENT. Take your time in reviewing documents. If you borrow money from a lender to pay for the improvements, you are entitled to have the loan closing documents furnished to you for review at least one business day before the closing. Do not waive this requirement unless a bona fide emergency or another good cause exists, and make sure you understand the documents before you sign them. If you fail to comply with the terms of the documents, you could lose your property. You are entitled to have your own attorney review any documents. If you have any question about the meaning of a document, consult an attorney.

GET A LIST OF SUBCONTRACTORS AND SUPPLIERS. Before construction commences, your contractor is required to provide you with a list of the subcontractors and suppliers the contractor intends to use on your project. Your contractor is required to supply updated information on any subcontractors and suppliers added after the list is provided. Your contractor is not required to supply this information if you sign a written waiver of your rights to receive this information.

MONITOR THE WORK. Lenders and governmental authorities may inspect the work in progress from time to time for their own purposes. These inspections are not intended as quality control inspections. Quality control is a matter for you and your contractor. To ensure that your home is being constructed in accordance with your wishes and specifications, you should inspect the work yourself or have your own independent inspector review the work in progress.

MONITOR PAYMENTS. If you use a lender, your lender is required to provide you with a periodic statement showing the money disbursed by the lender from the proceeds of your loan. Each time your contractor requests payment from you or your lender for work performed, your contractor is also required to furnish you with a disbursement statement that lists the name and address of each subcontractor or supplier that the contractor intends to pay from the requested funds. Review these statements and make sure that the money is being properly disbursed.

CLAIMS BY SUBCONTRACTORS AND SUPPLIERS. Under Texas law, if a subcontractor or supplier who furnishes labor or materials for the construction of improvements on your property is not paid, you may become liable and your property may be subject to a lien for the unpaid amount, even if you have not contracted directly with the subcontractor or supplier. To avoid liability, you should take the following actions:
(1) If you receive a written notice from a subcontractor or supplier, you should withhold payment from your contractor for the amount of the claim stated in the notice until the dispute between your contractor and the subcontractor or supplier is resolved. If your lender is disbursing money directly to your contractor, you should immediately provide a copy of the notice to your lender and instruct the lender to withhold payment in the amount of the claim stated in the notice. If you continue to pay the contractor after receiving the written notice without withholding the amount of the claim, you may be liable and your property may be subject to a lien for the amount you failed to withhold.
(2) During construction and for 30 days after final completion, termination, or abandonment of the contract by the contractor, you should reserve or cause your lender to reserve 10 percent of the amount of payments made for the work performed by your contractor. If you choose not to reserve the 10 percent for at least 30 days after final completion, termination, or abandonment of the contract by the contractor and if a valid claim is timely made by a claimant and your contractor fails to pay the claim, you may be personally liable and your property may be subject to a lien up to the amount that you failed to reserve.

If a claim is not paid within a certain time period, the claimant is required to file a mechanic's lien affidavit in the real property records in the county where the property is located. A mechanic's lien affidavit is not a lien on your property, but the filing of the affidavit could result in a court imposing a lien on your property if the claimant is successful in litigation to enforce the lien claim.

SOME CLAIMS MAY NOT BE VALID. When you receive a written notice of a claim or when a mechanic's lien affidavit is filed on your property, you should know your legal rights and responsibilities regarding the claim. Not all claims are valid. A notice of a claim by a subcontractor or supplier is required to be sent, and the mechanic's lien affidavit is required to be filed, within strict time periods. The notice and the affidavit must contain certain information. All claimants may not fully comply with the legal requirements to collect on a claim. If you have paid the contractor in full before receiving a notice of a claim and have withheld the 10 percent of the contract price or value of work, you may not be liable for that claim. Accordingly, you should consult your attorney when you receive a written notice of a claim to determine the true extent of your liability or potential liability for that claim.

OBTAIN A LIEN RELEASE AND A BILLS-PAID AFFIDAVIT. When you receive a notice of claim, do not release withheld funds without obtaining a signed and notarized release of lien and claim from the claimant. You can also reduce the risk of having a claim filed by a subcontractor or supplier by requiring as a condition of each payment made by you or your lender that your contractor furnish you with an affidavit stating that all bills have been paid. Under Texas law, on final completion of the work and before final payment, the contractor is required to furnish you with an affidavit stating that all bills have been paid. If the contractor discloses any unpaid bill in the affidavit, you should withhold payment in the amount of the unpaid bill until you receive a waiver of lien or release from that subcontractor or supplier.

OBTAIN TITLE INSURANCE PROTECTION. You may be able to obtain a title insurance policy to insure that the title to your property and the existing improvements on your property are free from liens claimed by subcontractors and suppliers. If your policy is issued before the improvements are completed and covers the value of the improvements to be completed, you should obtain, on the completion of the improvements and as a condition of your final payment, a 'completion of improvements' policy endorsement. This endorsement will protect your property from liens claimed by subcontractors and suppliers that may arise from the date the original title policy is issued to the date of the endorsement.

THIS NOTICE IS REQUIRED BY TEXAS LAW TO BE PROVIDED TO YOU. THIS NOTICE IS FOR INFORMATION ONLY AND IS NOT PART OF YOUR CONSTRUCTION AGREEMENT.

Two-Year Workmanship Warranty Agreement
This agreement is made between ${contractData.contractorName} ("Contractor") and ${contractData.clientName} ("Client") concerning the hardscape services provided by the Contractor. This warranty is intended to provide assurance of the quality and durability of the work performed by the Contractor.

1. Warranty Coverage
${contractData.contractorName} warrants that the workmanship related to the hardscape project, including artificial turf installation, concrete pouring, and the installation of stones and rocks, will be free from defects for a period of two (2) years from the date of substantial completion of the project. This warranty covers only the workmanship of the installation performed by the Contractor.

2. Covered Workmanship
This warranty applies to the following work performed by ${contractData.contractorName}:
• Installation of artificial turf, including proper grading, base preparation, and secure installation.
• Concrete pouring for patios, walkways, driveways, or other hardscape features.
• Installation of stones, rocks, and other decorative or functional landscaping elements.

3. Warranty Exclusions
This warranty does not cover:
• Materials used in the project (these may be covered by manufacturer warranties, if applicable).
• Damage caused by natural events, including but not limited to storms, floods, earthquakes, freezing, or excessive water runoff.
• Damage caused by improper use, neglect, or failure to maintain the installed hardscape or turf.
• Alterations or modifications made by anyone other than ${contractData.contractorName} after project completion.
• Wear and tear on artificial turf, including but not limited to discoloration, flattening, or fraying due to excessive use or environmental factors.

4. Client Responsibilities
To ensure the validity of this warranty, the Client agrees to:
• Maintain the hardscape and artificial turf installation as recommended by ${contractData.contractorName}.
• Notify the Contractor promptly of any defects or issues that may arise.
• Allow reasonable access for any repairs covered under this warranty.

5. Claim Procedure
If a defect arises within the two-year warranty period:
• The Client must notify ${contractData.contractorName} in writing, providing details of the issue.
• ${contractData.contractorName} will inspect the issue within a reasonable time and determine if it is covered by this warranty.
• If covered, ${contractData.contractorName} will repair the defect at no cost to the Client. Repairs will be performed within a reasonable timeframe.

6. Limitations of Liability
${contractData.contractorName}'s liability under this warranty is limited to the repair or replacement of defective workmanship. The Contractor will not be liable for any incidental, indirect, or consequential damages arising from the workmanship.

7. Transferability
This warranty is extended only to the original Client and is not transferable to subsequent owners or parties.

8. Governing Law
This warranty agreement shall be governed by and construed in accordance with the laws of the state of Texas.

Effective Date: ${new Date(contractData.startDate).toLocaleDateString()}
Expiration Date: ${new Date(new Date(contractData.startDate).getTime() + 2 * 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}

Client Name: ${contractData.clientName}
${contractData.contractorName}
Authorized Representative: ${contractData.authorizedRepresentative}`;
  }

  /**
   * Save contract to database - creates a project if needed
   */
  static async saveContract(
    estimateId: string,
    contractData: ContractData,
    organizationId: string
  ): Promise<{ contractId: string; projectId: string }> {
    try {
      // First, check if the estimate already has a project
      const { data: estimate } = await supabase
        .from('estimates')
        .select('project_id, client_id, title, estimate_number')
        .eq('id', estimateId)
        .single();

      let projectId = estimate?.project_id;

      // If no project exists, create one
      if (!projectId) {
        const { data: newProject, error: projectError } = await supabase
          .from('projects')
          .insert({
            name: `Contract Project - ${estimate?.title || estimate?.estimate_number}`,
            description: contractData.workDescription,
            client_id: estimate?.client_id,
            organization_id: organizationId,
            status: 'planning',
            start_date: contractData.startDate,
            estimated_completion_date: contractData.completionDate
          })
          .select('id')
          .single();

        if (projectError) throw projectError;
        projectId = newProject.id;

        // Update the estimate to link to the new project
        await supabase
          .from('estimates')
          .update({ project_id: projectId })
          .eq('id', estimateId);
      }

      // Generate contract content
      const contractContent = this.generateContractContent(contractData);

      // Save contract as a project document
      const { data: contract, error: contractError } = await supabase
        .from('project_documents')
        .insert({
          project_id: projectId,
          name: `Construction Contract - ${estimate?.estimate_number}`,
          type: 'contract_clause_set',
          content: contractContent,
          status: 'draft',
          display_order: 1
        })
        .select('id')
        .single();

      if (contractError) throw contractError;

      return {
        contractId: contract.id,
        projectId: projectId
      };
    } catch (error) {
      console.error('Error saving contract:', error);
      throw error;
    }
  }

  /**
   * Get contract by ID
   */
  static async getContractById(contractId: string) {
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('id', contractId)
        .eq('type', 'contract_clause_set')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching contract:', error);
      throw error;
    }
  }

  /**
   * Update contract content
   */
  static async updateContract(contractId: string, contractData: ContractData): Promise<void> {
    try {
      const contractContent = this.generateContractContent(contractData);

      const { error } = await supabase
        .from('project_documents')
        .update({
          content: contractContent,
          updated_at: new Date().toISOString()
        })
        .eq('id', contractId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating contract:', error);
      throw error;
    }
  }

  /**
   * Update contract status (draft, in_review, approved, signed, completed)
   */
  static async updateContractStatus(contractId: string, status: string): Promise<void> {
    try {
      const updateData: any = { status };
      
      // Add timestamp for signed status
      if (status === 'signed') {
        updateData.signed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('project_documents')
        .update(updateData)
        .eq('id', contractId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating contract status:', error);
      throw error;
    }
  }

  /**
   * Get contracts for a project
   */
  static async getProjectContracts(projectId: string) {
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId)
        .eq('type', 'contract_clause_set')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching project contracts:', error);
      throw error;
    }
  }
}