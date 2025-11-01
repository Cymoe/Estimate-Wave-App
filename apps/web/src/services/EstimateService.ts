import { supabase } from '../lib/supabase';
import { EmailService } from './EmailService';
import { ActivityLogService } from './ActivityLogService';

export interface EstimateItem {
  id?: string;
  estimate_id?: string;
  work_pack_item_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  original_unit_price?: number;
  total_price: number;
  cost_code?: string;
  cost_code_name?: string;
  display_order?: number;
}

export interface Estimate {
  id?: string;
  user_id?: string;
  organization_id?: string;
  client_id?: string;
  project_id?: string;
  estimate_number?: string;
  title?: string;
  description?: string;
  status: 'draft' | 'sent' | 'opened' | 'accepted' | 'rejected' | 'expired';
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
  converted_to_invoice_id?: string;
  first_opened_at?: string;
  sent_at?: string;
  last_sent_at?: string;
  send_count?: number;
  email_opened_at?: string;
  created_at?: string;
  updated_at?: string;
  items?: EstimateItem[];
  client?: {
    name: string;
    email: string;
    company_name?: string;
    address?: string;
    phone?: string;
  };
  project?: {
    id: string;
    name: string;
    category?: string;
    description?: string;
  };
  user?: {
    id: string;
    email?: string;
    company_name?: string;
    phone?: string;
  };
  // Metadata for package selection (stored in a JSON field or separate table)
  package_level?: string;
  package_id?: string;
}

export class EstimateService {
  /**
   * List all estimates for an organization
   */
  static async list(organizationId: string): Promise<Estimate[]> {
    const { data, error } = await supabase
      .from('estimates')
      .select(`
        *,
        client:clients(
          name,
          email,
          company_name,
          address,
          phone
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get a single estimate by ID with items
   */
  static async getById(id: string): Promise<Estimate> {
    const { data, error } = await supabase
      .from('estimates')
      .select(`
        *,
        client:clients(
          name,
          email,
          company_name,
          address,
          phone
        ),
        project:projects(
          id,
          name,
          category,
          description
        ),
        items:estimate_items(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    // If we have items with cost codes, fetch the cost code names
    if (data.items && data.items.length > 0) {
      // Get unique cost code IDs
      const costCodeIds = [...new Set(data.items
        .map((item: any) => item.cost_code)
        .filter(Boolean))];
      
      if (costCodeIds.length > 0) {
        const { data: costCodes, error: costCodeError } = await supabase
          .from('cost_codes')
          .select('id, name')
          .in('id', costCodeIds);
        
        if (costCodeError) {
          console.error('Error fetching cost codes:', costCodeError);
          console.error('Cost code IDs that failed:', costCodeIds);
          // Don't throw, just use IDs as fallback
        }
        
        if (costCodes && costCodes.length > 0) {
          // Create a map of ID to name
          const costCodeMap = costCodes.reduce((acc, cc) => {
            acc[cc.id] = cc.name;
            return acc;
          }, {} as Record<string, string>);
          
          // Map cost code names to items
          data.items = data.items.map((item: any) => ({
            ...item,
            cost_code_name: item.cost_code ? (costCodeMap[item.cost_code] || 'Uncategorized') : 'Uncategorized'
          }));
        } else {
          // If no cost codes found, mark all as uncategorized
          data.items = data.items.map((item: any) => ({
            ...item,
            cost_code_name: 'Uncategorized'
          }));
        }
      } else {
        // No cost codes to fetch
        data.items = data.items.map((item: any) => ({
          ...item,
          cost_code_name: 'Uncategorized'
        }));
      }
    }

    return data;
  }

  /**
   * Create a new estimate
   */
  static async create(estimate: Omit<Estimate, 'id' | 'created_at' | 'updated_at' | 'estimate_number'> & { 
    organization_id: string;
    items?: EstimateItem[] 
  }): Promise<Estimate> {
    const { items, ...estimateData } = estimate;

    // Generate estimate number (fallback if RPC doesn't exist)
    let estimateNumber: string;
    try {
      const { data, error: numberError } = await supabase
        .rpc('generate_estimate_number', { org_id: estimate.organization_id });

      if (numberError) {
        console.warn('RPC function not available, using fallback estimate numbering');
        // Fallback: generate estimate number manually
        const year = new Date().getFullYear();
        const timestamp = Date.now().toString().slice(-6);
        estimateNumber = `EST-${year}-${timestamp}`;
      } else {
        estimateNumber = data;
      }
    } catch (error) {
      console.warn('RPC function not available, using fallback estimate numbering');
      // Fallback: generate estimate number manually
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-6);
      estimateNumber = `EST-${year}-${timestamp}`;
    }

    // Create the estimate
    const { data: newEstimate, error: estimateError } = await supabase
      .from('estimates')
      .insert({
        ...estimateData,
        estimate_number: estimateNumber
      })
      .select()
      .single();

    if (estimateError) {
      throw estimateError;
    }

    // Add items if provided
    if (items && items.length > 0) {
      const itemsData = items.map((item, index) => ({
        ...item,
        estimate_id: newEstimate.id,
        display_order: item.display_order ?? index
      }));

      const { error: itemsError } = await supabase
        .from('estimate_items')
        .insert(itemsData);

      if (itemsError) {
        throw itemsError;
      }
    }

    // Log the activity
    if (newEstimate.organization_id) {
      try {
        const fullEstimate = await this.getById(newEstimate.id);
        await ActivityLogService.log({
          organizationId: newEstimate.organization_id,
          entityType: 'estimate',
          entityId: newEstimate.id,
          action: 'created',
          description: `created estimate ${newEstimate.estimate_number || newEstimate.title || 'New Estimate'}`,
          metadata: {
            estimate_number: newEstimate.estimate_number,
            client_id: newEstimate.client_id,
            total_amount: newEstimate.total_amount,
            status: newEstimate.status,
            item_count: items?.length || 0,
            client_name: fullEstimate.client?.name
          }
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }

    // Return the complete estimate
    return this.getById(newEstimate.id);
  }

  /**
   * Update an existing estimate
   */
  static async update(id: string, estimate: Partial<Estimate> & { items?: EstimateItem[] }): Promise<Estimate> {
    const { items, ...estimateData } = estimate;

    // Update the estimate
    const { error: estimateError } = await supabase
      .from('estimates')
      .update(estimateData)
      .eq('id', id);

    if (estimateError) {
      throw estimateError;
    }

    // Update items if provided
    if (items !== undefined) {
      // Delete existing items
      const { error: deleteError } = await supabase
        .from('estimate_items')
        .delete()
        .eq('estimate_id', id);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new items
      if (items.length > 0) {
        const itemsData = items.map((item, index) => ({
          ...item,
          estimate_id: id,
          display_order: item.display_order ?? index
        }));

        const { error: itemsError } = await supabase
          .from('estimate_items')
          .insert(itemsData);

        if (itemsError) {
          throw itemsError;
        }
      }
    }

    // Log the activity
    try {
      const updatedEstimate = await this.getById(id);
      if (updatedEstimate.organization_id) {
        await ActivityLogService.log({
          organizationId: updatedEstimate.organization_id,
          entityType: 'estimate',
          entityId: id,
          action: 'updated',
          description: `updated estimate ${updatedEstimate.estimate_number || updatedEstimate.title || 'Estimate'}`,
          metadata: {
            estimate_number: updatedEstimate.estimate_number,
            updated_fields: Object.keys(estimateData),
            items_updated: items !== undefined,
            item_count: items?.length
          }
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Return the updated estimate
    return this.getById(id);
  }

  /**
   * Delete an estimate
   */
  static async delete(id: string): Promise<void> {
    // Get the estimate before deletion for logging
    const estimate = await this.getById(id);

    const { error } = await supabase
      .from('estimates')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    // Log the activity
    if (estimate.organization_id) {
      try {
        await ActivityLogService.log({
          organizationId: estimate.organization_id,
          entityType: 'estimate',
          entityId: id,
          action: 'deleted',
          description: `deleted estimate ${estimate.estimate_number || estimate.title || 'Estimate'}`,
          metadata: {
            estimate_number: estimate.estimate_number,
            client_name: estimate.client?.name,
            total_amount: estimate.total_amount,
            status: estimate.status
          }
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }
  }

  /**
   * Add signature to estimate
   */
  static async addSignature(id: string, signature: string): Promise<Estimate> {
    // First get the estimate to get organization_id
    const estimate = await this.getById(id);
    if (!estimate) {
      throw new Error('Estimate not found');
    }

    // Update estimate with signature
    const { error } = await supabase
      .from('estimates')
      .update({
        client_signature: signature,
        signed_at: new Date().toISOString(),
        status: 'accepted'
      })
      .eq('id', id);

    if (error) {
      throw error;
    }

    // Log the activity
    if (estimate.organization_id) {
      try {
        await ActivityLogService.log({
          organizationId: estimate.organization_id,
          entityType: 'estimate',
          entityId: id,
          action: 'signed',
          description: `signed estimate ${estimate.estimate_number || estimate.title || 'Estimate'}`,
          metadata: {
            estimate_number: estimate.estimate_number,
            client_name: estimate.client?.name,
            signed_at: new Date().toISOString()
          }
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }

    // Check if organization has auto-invoice enabled
    const { data: orgSettings } = await supabase
      .from('organizations')
      .select('auto_create_invoice_on_estimate_accept, auto_invoice_deposit_percentage')
      .eq('id', estimate.organization_id)
      .single();

    if (orgSettings?.auto_create_invoice_on_estimate_accept && !estimate.converted_to_invoice_id) {
      try {
        // Create invoice automatically
        const depositPercentage = orgSettings.auto_invoice_deposit_percentage || 0;
        await this.convertToInvoice(id, depositPercentage > 0 ? depositPercentage : undefined);
      } catch (invoiceError) {
        console.error('Failed to auto-create invoice:', invoiceError);
        // Don't throw - estimate was signed successfully
      }
    }

    return this.getById(id);
  }

  /**
   * Convert estimate to invoice (with optional deposit percentage)
   */
  static async convertToInvoice(estimateId: string, depositPercentage?: number): Promise<string> {
    // Get the estimate with items
    const estimate = await this.getById(estimateId);

    if (!estimate) {
      throw new Error('Estimate not found');
    }

    if (estimate.status !== 'accepted') {
      throw new Error('Estimate must be accepted before converting to invoice');
    }

    // Calculate amounts based on deposit percentage
    const isDeposit = depositPercentage && depositPercentage > 0 && depositPercentage < 100;
    const multiplier = isDeposit ? (depositPercentage / 100) : 1;
    
    const invoiceSubtotal = estimate.subtotal * multiplier;
    const invoiceTaxAmount = (estimate.tax_amount || 0) * multiplier;
    const invoiceTotal = invoiceSubtotal + invoiceTaxAmount;
    
    // Prepare notes with deposit information if applicable
    let invoiceNotes = estimate.notes || '';
    if (isDeposit) {
      const depositNote = `\n\nThis is a ${depositPercentage}% deposit invoice for estimate ${estimate.estimate_number}.`;
      invoiceNotes = invoiceNotes ? invoiceNotes + depositNote : depositNote;
    }

    // Generate invoice number
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const invoiceNumber = `INV-${year}-${timestamp}`;

    // Create invoice data with source estimate tracking
    const invoiceData = {
      user_id: estimate.user_id,
      organization_id: estimate.organization_id,
      client_id: estimate.client_id,
      project_id: estimate.project_id,
      source_estimate_id: estimateId, // Track the source estimate
      invoice_number: invoiceNumber,
      status: 'draft' as const,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      amount: invoiceTotal, // Use total_amount to match database schema
      subtotal: invoiceSubtotal,
      tax_rate: estimate.tax_rate || 0,
      tax_amount: invoiceTaxAmount,
      notes: invoiceNotes,
      terms: estimate.terms
    };

    // Create the invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

    // Create invoice items from estimate items
    if (estimate.items && estimate.items.length > 0) {
      const invoiceItemsData = isDeposit 
        ? [{
            invoice_id: invoice.id,
            description: `${depositPercentage}% Deposit for: ${estimate.title || estimate.estimate_number}`,
            quantity: 1,
            unit_price: invoiceSubtotal,
            total_price: invoiceSubtotal
          }]
        : estimate.items.map(item => ({
            invoice_id: invoice.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price
          }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItemsData);

      if (itemsError) {
        throw itemsError;
      }
    }

    // Update the estimate to track the converted invoice
    const { error: updateError } = await supabase
      .from('estimates')
      .update({ converted_to_invoice_id: invoice.id })
      .eq('id', estimateId);

    if (updateError) {
      console.error('Failed to update estimate with invoice ID:', updateError);
      // Don't throw - invoice was created successfully
    }

    // Log the activity
    if (estimate.organization_id) {
      try {
        await ActivityLogService.log({
          organizationId: estimate.organization_id,
          entityType: 'estimate',
          entityId: estimateId,
          action: 'converted',
          description: `converted estimate ${estimate.estimate_number || 'Estimate'} to invoice`,
          metadata: {
            estimate_number: estimate.estimate_number,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            is_deposit: isDeposit,
            deposit_percentage: depositPercentage,
            invoice_amount: invoiceTotal,
            client_name: estimate.client?.name
          }
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }

    return invoice.id;
  }

  /**
   * Get estimates by client
   */
  static async getByClient(clientId: string): Promise<Estimate[]> {
    const { data, error } = await supabase
      .from('estimates')
      .select(`
        *,
        client:clients(
          name,
          email,
          company_name
        )
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get estimates by project
   */
  static async getByProject(projectId: string): Promise<Estimate[]> {
    const { data, error } = await supabase
      .from('estimates')
      .select(`
        *,
        client:clients(
          name,
          email,
          company_name
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }



  /**
   * Update estimate status
   */
  static async updateStatus(id: string, status: Estimate['status']): Promise<void> {
    // Get the estimate before update for logging
    const estimate = await this.getById(id);
    const oldStatus = estimate.status;

    const { error } = await supabase
      .from('estimates')
      .update({ status })
      .eq('id', id);

    if (error) {
      throw error;
    }

    // Log the activity
    if (estimate.organization_id && oldStatus !== status) {
      try {
        await ActivityLogService.log({
          organizationId: estimate.organization_id,
          entityType: 'estimate',
          entityId: id,
          action: 'status_changed',
          description: `Changed estimate status from ${oldStatus} to ${status}`,
          metadata: {
            estimate_number: estimate.estimate_number,
            old_status: oldStatus,
            new_status: status,
            client_name: estimate.client?.name
          }
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }
  }

  /**
   * Get estimates by status
   */
  static async getByStatus(organizationId: string, status: Estimate['status']): Promise<Estimate[]> {
    const { data, error } = await supabase
      .from('estimates')
      .select(`
        *,
        client:clients(
          name,
          email,
          company_name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Create estimate from service package
   */
  static async createFromServicePackage(data: {
    organization_id: string;
    user_id: string;
    client_id: string;
    project_id?: string;
    title: string;
    description?: string;
    service_package_id: string;
    service_package_items: any[];
  }): Promise<Estimate> {
    // Calculate totals from service package items
    const subtotal = data.service_package_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax_rate = 0; // Default, can be configured
    const tax_amount = subtotal * (tax_rate / 100);
    const total_amount = subtotal + tax_amount;

    // Create estimate
    const estimate = await this.create({
      organization_id: data.organization_id,
      user_id: data.user_id,
      client_id: data.client_id,
      project_id: data.project_id,
      title: data.title,
      description: data.description,
      status: 'draft',
      issue_date: new Date().toISOString().split('T')[0],
      expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days
      subtotal,
      tax_rate,
      tax_amount,
      total_amount,
      items: data.service_package_items.map((item, index) => ({
        service_option_id: item.service_option_id,
        description: item.service_option?.name || item.description,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
        display_order: index
      }))
    });

    return estimate;
  }

  /**
   * Send estimate via email
   */
  static async sendEstimate(
    estimateId: string, 
    recipientEmail: string,
    options?: {
      message?: string;
      ccEmails?: string[];
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the estimate with client details
      const estimate = await this.getById(estimateId);
      if (!estimate) {
        throw new Error('Estimate not found');
      }

      if (!estimate.client) {
        throw new Error('Estimate has no client assigned');
      }

      // Get user details for the from address
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        estimate.user = {
          id: userData.user.id,
          email: userData.user.email,
          // Get additional user/company details if stored in profile
        };
      }

      // Send the email
      const result = await EmailService.sendEstimate(
        estimate,
        estimate.client,
        recipientEmail,
        options
      );

      if (result.success) {
        // Update estimate status and tracking fields
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('estimates')
          .update({
            status: 'sent',
            sent_at: estimate.sent_at || now, // Only set first time
            last_sent_at: now,
            send_count: (estimate.send_count || 0) + 1
          })
          .eq('id', estimateId);

        if (updateError) {
          console.error('Failed to update estimate status:', updateError);
        }

        // Log the activity
        if (estimate.organization_id) {
          try {
            await ActivityLogService.log({
              organizationId: estimate.organization_id,
              entityType: 'estimate',
              entityId: estimateId,
              action: 'sent',
              description: `sent estimate ${estimate.estimate_number || 'Estimate'}`,
              metadata: {
                estimate_number: estimate.estimate_number,
                recipient_email: recipientEmail,
                cc_emails: options?.ccEmails,
                send_count: (estimate.send_count || 0) + 1,
                client_name: estimate.client?.name
              }
            });
          } catch (logError) {
            console.error('Failed to log activity:', logError);
          }
        }

        // Log the email in email_logs table
        const { error: logError } = await supabase
          .from('email_logs')
          .insert({
            entity_type: 'estimate',
            entity_id: estimateId,
            user_id: estimate.user_id,
            organization_id: estimate.organization_id,
            recipient_email: recipientEmail,
            cc_emails: options?.ccEmails,
            subject: `Estimate ${estimate.estimate_number}`,
            status: 'sent',
            sent_at: now,
            metadata: {
              custom_message: options?.message
            }
          });

        if (logError) {
          console.error('Failed to log email:', logError);
        }
      }

      return result;
    } catch (error) {
      console.error('Error sending estimate:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send estimate'
      };
    }
  }
}