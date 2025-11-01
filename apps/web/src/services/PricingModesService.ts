import { supabase } from '../lib/supabase';
import { ActivityLogService } from './ActivityLogService';
import { jobQueue } from './jobQueue';

export interface PricingMode {
  id: string;
  organization_id?: string;
  name: string;
  icon: string;
  description?: string;
  adjustments: {
    all?: number;
    labor?: number;
    materials?: number;
    services?: number;
    installation?: number;
    equipment?: number;
    subcontractor?: number;
  };
  is_preset: boolean;
  is_active: boolean;
  usage_count: number;
  successful_estimates: number;
  total_estimates: number;
  win_rate?: number;
  created_at: string;
  updated_at: string;
}

export interface PricingModeApplication {
  mode_id: string;
  line_item_ids?: string[];
  apply_to_all: boolean;
  preview?: boolean;
}

export interface PriceChange {
  line_item_id: string;
  name: string;
  category: string;
  old_price: number;
  new_price: number;
  multiplier: number;
  change_amount: number;
  change_percentage: number;
}

export interface ApplyModeResult {
  totalAttempted: number;
  successCount: number;
  failedCount: number;
  failedItems?: Array<{
    line_item_id: string;
    name: string;
    error: string;
  }>;
}

export class PricingModesService {
  /**
   * Get all available pricing modes for an organization
   */
  static async list(organizationId: string): Promise<PricingMode[]> {
    const { data, error } = await supabase
      .from('pricing_modes')
      .select('*')
      .or(`organization_id.eq.${organizationId},is_preset.eq.true`)
      .eq('is_active', true)
      .order('is_preset', { ascending: false })
      .order('usage_count', { ascending: false });

    if (error) {
      // Error fetching pricing modes
      throw error;
    }

    // Calculate win rates
    return (data || []).map(mode => ({
      ...mode,
      win_rate: mode.total_estimates > 0 
        ? Math.round((mode.successful_estimates / mode.total_estimates) * 100)
        : undefined
    }));
  }

  /**
   * Get preset pricing modes only
   */
  static async getPresets(): Promise<PricingMode[]> {
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      
      const response = await fetch(`${baseUrl}/api/pricing-modes/presets`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching preset pricing modes:', error);
      return [];
    }
  }

  /**
   * Create a custom pricing mode
   */
  static async create(
    organizationId: string,
    mode: Omit<PricingMode, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'successful_estimates' | 'total_estimates'>
  ): Promise<PricingMode> {
    const { data, error } = await supabase
      .from('pricing_modes')
      .insert({
        ...mode,
        organization_id: organizationId,
        is_preset: false
      })
      .select()
      .single();

    if (error) {
      // Error creating pricing mode
      throw error;
    }

    await ActivityLogService.log({
      organizationId,
      entityType: 'pricing_mode',
      entityId: data.id,
      action: 'create',
      description: `Created pricing mode "${data.name}"`
    });

    return data;
  }

  /**
   * Preview pricing changes before applying
   */
  static async previewApplication(
    organizationId: string,
    modeId: string,
    lineItemIds?: string[]
  ): Promise<PriceChange[]> {
    // Get the pricing mode
    const { data: mode, error: modeError } = await supabase
      .from('pricing_modes')
      .select('*')
      .eq('id', modeId)
      .single();

    if (modeError || !mode) {
      throw new Error('Pricing mode not found');
    }

    // For Reset to Baseline, we need a different approach
    if (mode.name === 'Reset to Baseline') {
      // Starting preview for organization
      
      // First get all overrides for this organization
      const { data: overrides, error: overridesError } = await supabase
        .from('line_item_overrides')
        .select('line_item_id, custom_price')
        .eq('organization_id', organizationId);

      if (overridesError) {
        // Error fetching overrides
        throw overridesError;
      }

      // Found overrides

      if (!overrides || overrides.length === 0) {
        return []; // No overrides to reset
      }

      // Filter by selected line items if provided
      let relevantOverrides = overrides;
      if (lineItemIds && lineItemIds.length > 0) {
        // Filtering to selected items
        relevantOverrides = overrides.filter(o => lineItemIds.includes(o.line_item_id));
        // Relevant overrides after filtering
      } else {
        // No specific items selected - will reset ALL overrides
      }

      if (relevantOverrides.length === 0) {
        // No relevant overrides to reset
        return []; // No relevant overrides to reset
      }

      // Get the base line items for these overrides in batches
      const overrideLineItemIds = relevantOverrides.map(o => o.line_item_id);
      let lineItems: any[] = [];
      
      // Batch the queries to avoid large IN clauses
      const batchSize = 100;
      for (let i = 0; i < overrideLineItemIds.length; i += batchSize) {
        const batch = overrideLineItemIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('line_items')
          .select('id, name, price, cost_code_id')
          .in('id', batch);
        
        if (error) {
          // [Reset to Baseline] Error fetching line items batch
          throw error;
        }
        
        lineItems = lineItems.concat(data || []);
      }

      // Fetched line items

      // Get cost codes in batches
      const costCodeIds = [...new Set(lineItems?.map(item => item.cost_code_id).filter(Boolean) || [])];
      let costCodes: any[] = [];
      
      if (costCodeIds.length > 0) {
        for (let i = 0; i < costCodeIds.length; i += batchSize) {
          const batch = costCodeIds.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('cost_codes')
            .select('id, code')
            .in('id', batch);
          
          if (error) {
            // [Reset to Baseline] Error fetching cost codes
          }
          
          costCodes = costCodes.concat(data || []);
        }
      }

      const costCodeMap = new Map(costCodes?.map(cc => [cc.id, cc.code]) || []);
      const overrideMap = new Map(relevantOverrides.map(o => [o.line_item_id, o.custom_price]));

      // Build price changes
      const changes: PriceChange[] = [];
      for (const item of lineItems || []) {
        const costCodeValue = costCodeMap.get(item.cost_code_id);
        const category = this.getCategoryFromCostCode(costCodeValue);
        const currentPrice = overrideMap.get(item.id) || item.price;
        
        changes.push({
          line_item_id: item.id,
          name: item.name,
          category,
          old_price: currentPrice,
          new_price: item.price, // Reset to base price
          multiplier: 1,
          change_amount: item.price - currentPrice,
          change_percentage: ((item.price - currentPrice) / currentPrice) * 100
        });
      }

      return changes;
    }

    // For other pricing modes, get line items normally
    let lineItems: any[] = [];
    
    if (lineItemIds && lineItemIds.length > 0) {
      // For specific line items, batch the queries
      const batchSize = 100;
      for (let i = 0; i < lineItemIds.length; i += batchSize) {
        const batch = lineItemIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('line_items')
          .select('id, name, price, organization_id, cost_code_id')
          .in('id', batch);
        
        if (error) {
          // Error fetching line items batch
          throw error;
        }
        
        lineItems = lineItems.concat(data || []);
      }
    } else {
      // For "all items", use organization filter
      const { data, error } = await supabase
        .from('line_items')
        .select('id, name, price, organization_id, cost_code_id')
        .or(`organization_id.eq.${organizationId},organization_id.is.null`);
      
      if (error) {
        // Error fetching all line items
        throw error;
      }
      
      lineItems = data || [];
    }

    // Calculate price changes
    const changes: PriceChange[] = [];
    
    // Get cost codes for items
    const costCodeIds = [...new Set(lineItems?.map(item => item.cost_code_id).filter(Boolean) || [])];
    let costCodeMap = new Map<string, string>();
    
    // Batch fetch cost codes to avoid large IN clauses
    if (costCodeIds.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < costCodeIds.length; i += batchSize) {
        const batch = costCodeIds.slice(i, i + batchSize);
        const { data: costCodes } = await supabase
          .from('cost_codes')
          .select('id, code')
          .in('id', batch);
        
        costCodes?.forEach(cc => costCodeMap.set(cc.id, cc.code));
      }
    }
    
    // For non-baseline modes, we need to get current prices efficiently
    let currentPriceMap = new Map<string, number>();
    if (mode.name !== 'Reset to Baseline') {
      // Get all current prices including overrides in one efficient query
      const { data: currentPrices } = await supabase
        .rpc('get_organization_line_items', { p_organization_id: organizationId });
      
      currentPrices?.forEach((item: any) => {
        currentPriceMap.set(item.id, item.price);
      });
    }
    
    // Process each line item
    for (const item of lineItems || []) {
      const costCodeValue = costCodeMap.get(item.cost_code_id);
      const category = this.getCategoryFromCostCode(costCodeValue);
      const multiplier = mode.adjustments[category] || mode.adjustments.all || 1;
      
      // Get current price efficiently
      const currentPrice = currentPriceMap.get(item.id) || item.price;
      
      // Calculate new price based on base price
      const basePrice = item.price;
      const newPrice = basePrice * multiplier;
      
      // Skip if no change
      if (Math.abs(newPrice - currentPrice) < 0.01) {
        continue;
      }
      
      changes.push({
        line_item_id: item.id,
        name: item.name,
        category,
        old_price: currentPrice,
        new_price: newPrice,
        multiplier,
        change_amount: newPrice - currentPrice,
        change_percentage: ((newPrice - currentPrice) / currentPrice) * 100
      });
    }

    return changes;
  }

  /**
   * Apply a pricing mode to line items with error handling
   */
  static async applyModeWithErrorHandling(
    organizationId: string,
    modeId: string,
    lineItemIds?: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<ApplyModeResult> {
    const result: ApplyModeResult = {
      totalAttempted: 0,
      successCount: 0,
      failedCount: 0,
      failedItems: []
    };

    try {
      // Get the mode details to check if it's "Reset to Baseline"
      const { data: mode } = await supabase
        .from('pricing_modes')
        .select('name')
        .eq('id', modeId)
        .single();
      
      // If it's "Reset to Baseline", delete overrides
      if (mode?.name === 'Reset to Baseline') {
        // First, count how many overrides we'll delete
        let countQuery = supabase
          .from('line_item_overrides')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId);
        
        if (lineItemIds && lineItemIds.length > 0 && lineItemIds.length < 500) {
          countQuery = countQuery.in('line_item_id', lineItemIds);
        }
        
        const { count } = await countQuery;
        result.totalAttempted = count || 0;
        
        if (!count || count === 0) {
          return result; // No overrides to reset
        }
        
        // Delete in batches for better error handling
        const batchSize = 50;
        const itemsToDelete = lineItemIds || [];
        
        for (let i = 0; i < itemsToDelete.length; i += batchSize) {
          const batch = itemsToDelete.slice(i, i + batchSize);
          
          const { error } = await supabase
            .from('line_item_overrides')
            .delete()
            .eq('organization_id', organizationId)
            .in('line_item_id', batch);
          
          if (error) {
            result.failedCount += batch.length;
            batch.forEach(id => {
              result.failedItems?.push({
                line_item_id: id,
                name: `Item ${id}`,
                error: error.message
              });
            });
          } else {
            result.successCount += batch.length;
          }
          
          onProgress?.(i + batch.length, itemsToDelete.length);
        }
        
        return result;
      }
      
      // Get preview first for normal pricing modes
      const changes = await this.previewApplication(organizationId, modeId, lineItemIds);
      result.totalAttempted = changes.length;

      // Apply changes in batches with error handling
      const batchSize = 50;

      for (let i = 0; i < changes.length; i += batchSize) {
        const batch = changes.slice(i, i + batchSize);
        
        // Create override records
        const overrides = batch.map(change => ({
          organization_id: organizationId,
          line_item_id: change.line_item_id,
          custom_price: change.new_price,
          applied_mode_id: modeId,
          mode_multiplier: change.multiplier,
          updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
          .from('line_item_overrides')
          .upsert(overrides, {
            onConflict: 'organization_id,line_item_id'
          });

        if (error) {
          // Error applying pricing mode batch
          result.failedCount += batch.length;
          
          // Track which specific items failed
          batch.forEach(change => {
            result.failedItems?.push({
              line_item_id: change.line_item_id,
              name: change.name,
              error: error.message
            });
          });
        } else {
          result.successCount += batch.length;
        }
        
        onProgress?.(i + batch.length, changes.length);
      }
      
      // Only update usage count if at least some items succeeded
      if (result.successCount > 0) {
        const { data: modeData } = await supabase
          .from('pricing_modes')
          .select('usage_count')
          .eq('id', modeId)
          .single();
        
        await supabase
          .from('pricing_modes')
          .update({ 
            usage_count: (modeData?.usage_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', modeId);

        // Log activity
        await ActivityLogService.log({
          organizationId,
          entityType: 'pricing_mode',
          entityId: modeId,
          action: 'apply',
          description: `Applied pricing mode to ${result.successCount} items${result.failedCount > 0 ? ` (${result.failedCount} failed)` : ''}`
        });
      }
      
      return result;
    } catch (error) {
      // Unexpected error in applyModeWithErrorHandling
      result.failedCount = result.totalAttempted - result.successCount;
      return result;
    }
  }

  /**
   * Apply a pricing mode to line items (legacy method)
   */
  static async applyMode(
    organizationId: string,
    modeId: string,
    lineItemIds?: string[]
  ): Promise<number> {
    // Get the mode details to check if it's "Reset to Baseline"
    const { data: mode } = await supabase
      .from('pricing_modes')
      .select('name')
      .eq('id', modeId)
      .single();
    
    // If it's "Reset to Baseline", delete overrides instead of applying new ones
    if (mode?.name === 'Reset to Baseline') {
      // First, count how many overrides we'll delete
      let countQuery = supabase
        .from('line_item_overrides')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      
      if (lineItemIds && lineItemIds.length > 0 && lineItemIds.length < 500) {
        countQuery = countQuery.in('line_item_id', lineItemIds);
      }
      
      const { count } = await countQuery;
      
      if (!count || count === 0) {
        return 0; // No overrides to reset
      }
      
      // Now delete the overrides
      let deleteQuery = supabase
        .from('line_item_overrides')
        .delete()
        .eq('organization_id', organizationId);
      
      if (lineItemIds && lineItemIds.length > 0 && lineItemIds.length < 500) {
        deleteQuery = deleteQuery.in('line_item_id', lineItemIds);
      }
      
      const { error } = await deleteQuery;
      
      if (error) {
        // Error resetting to baseline
        throw error;
      }
      
      // Return the actual count of items that were reset
      return count;
    }
    
    // Get preview first for normal pricing modes
    const changes = await this.previewApplication(organizationId, modeId, lineItemIds);

    // Apply changes in batches
    const batchSize = 50;
    let appliedCount = 0;

    for (let i = 0; i < changes.length; i += batchSize) {
      const batch = changes.slice(i, i + batchSize);
      
      // Create override records
      const overrides = batch.map(change => ({
        organization_id: organizationId,
        line_item_id: change.line_item_id,
        custom_price: change.new_price,
        applied_mode_id: modeId,
        mode_multiplier: change.multiplier,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('line_item_overrides')
        .upsert(overrides, {
          onConflict: 'organization_id,line_item_id'
        });

      if (error) {
        // Error applying pricing mode batch
        // Batch application failed - see error above
        throw error;
      }

      appliedCount += batch.length;
    }
    
    // Successfully applied price changes

    // Update mode usage count - fetch current count and increment
    const { data: modeData } = await supabase
      .from('pricing_modes')
      .select('usage_count')
      .eq('id', modeId)
      .single();
    
    await supabase
      .from('pricing_modes')
      .update({ 
        usage_count: (modeData?.usage_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', modeId);

    // Log activity
    await ActivityLogService.log({
      organizationId,
      entityType: 'pricing_mode',
      entityId: modeId,
      action: 'apply',
      description: `Applied pricing mode to ${appliedCount} items`
    });

    return appliedCount;
  }

  /**
   * Record estimate outcome for a pricing mode
   */
  static async recordEstimateOutcome(
    _estimateId: string,
    modeId: string,
    wasSuccessful: boolean
  ): Promise<void> {
    // Fetch current values
    const { data: mode } = await supabase
      .from('pricing_modes')
      .select('total_estimates, successful_estimates')
      .eq('id', modeId)
      .single();
    
    const { error } = await supabase
      .from('pricing_modes')
      .update({
        total_estimates: (mode?.total_estimates || 0) + 1,
        successful_estimates: wasSuccessful 
          ? (mode?.successful_estimates || 0) + 1
          : (mode?.successful_estimates || 0),
        updated_at: new Date().toISOString()
      })
      .eq('id', modeId);

    if (error) {
      // Error recording estimate outcome
      throw error;
    }
  }

  /**
   * Delete a custom pricing mode
   */
  static async delete(organizationId: string, modeId: string): Promise<void> {
    const { error } = await supabase
      .from('pricing_modes')
      .delete()
      .eq('id', modeId)
      .eq('organization_id', organizationId)
      .eq('is_preset', false);

    if (error) {
      // Error deleting pricing mode
      throw error;
    }

    await ActivityLogService.log({
      organizationId,
      entityType: 'pricing_mode',
      entityId: modeId,
      action: 'delete',
      description: 'Deleted custom pricing mode'
    });
  }

  /**
   * Helper to determine category from cost code
   */
  private static getCategoryFromCostCode(code?: string): string {
    if (!code) return 'all';
    
    const codeNumber = parseInt(code.replace(/[^0-9]/g, ''));
    if (isNaN(codeNumber)) return 'all';
    
    if (codeNumber >= 100 && codeNumber <= 199) return 'labor';
    if (codeNumber >= 500 && codeNumber <= 599) return 'materials';
    if (codeNumber >= 200 && codeNumber <= 299) return 'installation';
    if ((codeNumber >= 300 && codeNumber <= 399) || (codeNumber >= 600 && codeNumber <= 699)) return 'services';
    if (codeNumber >= 400 && codeNumber <= 499) return 'equipment';
    if (codeNumber >= 700 && codeNumber <= 799) return 'subcontractor';
    
    return 'all';
  }
  
  /**
   * Get count of line items for an organization
   */
  private static async getLineItemCount(organizationId: string): Promise<number> {
    const { count } = await supabase
      .from('line_items')
      .select('*', { count: 'exact', head: true })
      .or(`organization_id.eq.${organizationId},organization_id.is.null`);
    
    return count || 0;
  }

  /**
   * Create a pricing job for background processing
   */
  static async createPricingJob(
    organizationId: string,
    modeId: string,
    modeName: string,
    lineItemIds?: string[],
    previousPrices?: Array<{ lineItemId: string; price: number }>
  ): Promise<string> {
    // Get total item count
    const totalItems = lineItemIds?.length || await this.getLineItemCount(organizationId);
    
    const jobId = await jobQueue.createJob({
      organization_id: organizationId,
      operation_type: 'apply_pricing_mode',
      total_items: totalItems,
      job_data: {
        mode_id: modeId,
        mode_name: modeName,
        line_item_ids: lineItemIds,
        previous_prices: previousPrices,
        apply_to_all: !lineItemIds || lineItemIds.length === 0
      }
    });

    // Try to trigger the Edge Function first
    const { data, error } = await supabase.functions.invoke('process-pricing-job', {
      body: { jobId }
    });

    // For now, always use inline processing since Edge Function isn't deployed
    // TODO: Remove this when Edge Function is deployed
    const useInlineProcessing = true;

    if (error || useInlineProcessing) {
      if (error) {
        // Error invoking pricing job function
      } else {
        // Using inline processing (Edge Function not deployed)
      }
      
      // Mark as processing only if we're going to process inline
      await jobQueue.markAsProcessing(jobId);
      // Fallback to inline processing if Edge Function fails
      // Starting inline processing for job
      this.processJobInBackground(jobId, organizationId, modeId, lineItemIds);
    } else {
      // Edge function will handle marking as processing
      // Edge function invoked successfully
    }

    return jobId;
  }

  /**
   * Process a pricing job inline (fallback when Edge Function is not available)
   * The Edge Function code is ready in supabase/functions/process-pricing-job/
   * Deploy with: supabase functions deploy process-pricing-job
   */
  private static async processJobInBackground(
    jobId: string,
    organizationId: string,
    modeId: string,
    lineItemIds?: string[]
  ): Promise<void> {
    // Process in next tick to avoid blocking
    setTimeout(async () => {
      try {
        // Starting inline job processing
        
        // Check if job is still active before processing
        const currentJob = await jobQueue.getJob(jobId);
        if (!currentJob || currentJob.status !== 'processing') {
          // Job is no longer active, skipping processing
          return;
        }
        
        const result = await this.applyModeWithErrorHandling(
          organizationId,
          modeId,
          lineItemIds,
          async (current, total) => {
            // Check if job is still active
            const job = await jobQueue.getJob(jobId);
            if (!job || job.status !== 'processing') {
              // Job cancelled or completed elsewhere
              throw new Error('Job cancelled');
            }
            
            // Update job progress
            // Job progress update
            try {
              await jobQueue.updateProgress(jobId, { current, total });
            } catch (error) {
              // Failed to update progress for job
              throw error;
            }
          }
        );

        // Job completed
        
        // Mark job as completed
        await jobQueue.markAsCompleted(jobId, {
          success_count: result.successCount,
          failed_count: result.failedCount,
          failed_items: result.failedItems
        });
      } catch (error) {
        // Error processing pricing job
        
        // Don't try to update if job was cancelled
        if (error instanceof Error && error.message === 'Job cancelled') {
          return;
        }
        
        await jobQueue.markAsFailed(
          jobId, 
          error instanceof Error ? error.message : 'Unknown error occurred'
        );
      }
    }, 100);
  }

  /**
   * Get the status of a pricing job
   */
  static async getJobStatus(jobId: string) {
    return jobQueue.getJob(jobId);
  }

  /**
   * Get active jobs for an organization
   */
  static async getActiveJobs(organizationId: string) {
    const jobs = await jobQueue.getActiveJobsForOrganization(organizationId);
    
    // Clean up stale jobs
    const now = Date.now();
    for (const job of jobs) {
      const jobAge = now - new Date(job.created_at).getTime();
      // If job is older than 10 minutes with no progress, mark it as failed
      if (jobAge > 10 * 60 * 1000 && job.processed_items === 0) {
        // Cleaning up stale job
        await jobQueue.markAsFailed(job.id, 'Job timed out - no progress after 10 minutes');
      }
    }
    
    // Return only non-stale jobs
    return jobs.filter(job => {
      const jobAge = now - new Date(job.created_at).getTime();
      return !(jobAge > 10 * 60 * 1000 && job.processed_items === 0);
    });
  }
  
  /**
   * Resume a stuck job
   */
  static async resumeJob(jobId: string, organizationId: string): Promise<void> {
    const job = await jobQueue.getJob(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return;
    }
    
    // Check if it's an undo job
    if (job.operation_type === 'undo_pricing') {
      const { previous_prices } = job.job_data;
      if (!previous_prices) {
        // No previous_prices in undo job data
        await jobQueue.markAsFailed(jobId, 'Missing previous_prices in job data');
        return;
      }
      
      // Resume undo job processing
      this.processUndoJob(jobId, organizationId, previous_prices);
    } else {
      const { mode_id, line_item_ids } = job.job_data;
      if (!mode_id) {
        // No mode_id in job data
        await jobQueue.markAsFailed(jobId, 'Missing mode_id in job data');
        return;
      }
      
      // Process regular pricing job
      this.processJobInBackground(jobId, organizationId, mode_id, line_item_ids);
    }
  }

  /**
   * Subscribe to job updates
   */
  static subscribeToJob(jobId: string, onUpdate: (job: any) => void): () => void {
    const queue = jobQueue as any; // Type assertion for now
    if (queue.subscribeToJobUpdates) {
      return queue.subscribeToJobUpdates(jobId, onUpdate);
    }
    return () => {}; // No-op cleanup
  }
  
  /**
   * Update job progress
   */
  static async updateJobProgress(jobId: string, current: number, total: number): Promise<void> {
    await jobQueue.updateProgress(jobId, { current, total });
  }
  
  /**
   * Mark job as completed
   */
  static async completeJob(jobId: string, result: ApplyModeResult): Promise<void> {
    await jobQueue.markAsCompleted(jobId, {
      success_count: result.successCount,
      failed_count: result.failedCount,
      failed_items: result.failedItems
    });
  }
  
  /**
   * Mark job as failed
   */
  static async failJob(jobId: string, error: string): Promise<void> {
    await jobQueue.markAsFailed(jobId, error);
  }

  /**
   * Create an undo job for reverting pricing changes
   */
  static async createUndoJob(
    organizationId: string,
    previousPrices: Array<{ lineItemId: string; price: number }>
  ): Promise<string> {
    const jobId = await jobQueue.createJob({
      organization_id: organizationId,
      operation_type: 'undo_pricing',
      total_items: previousPrices.length,
      job_data: {
        previous_prices: previousPrices
      }
    });

    // Process inline since Edge Function isn't deployed
    await jobQueue.markAsProcessing(jobId);
    this.processUndoJob(jobId, organizationId, previousPrices);

    return jobId;
  }

  /**
   * Process an undo job
   */
  private static async processUndoJob(
    jobId: string,
    organizationId: string,
    previousPrices: Array<{ lineItemId: string; price: number }>
  ): Promise<void> {
    setTimeout(async () => {
      try {
        // Processing undo job
        
        // Check if job is still active
        const currentJob = await jobQueue.getJob(jobId);
        if (!currentJob || currentJob.status !== 'processing') {
          // Undo job is no longer active
          return;
        }

        let successCount = 0;
        let failedCount = 0;
        const failedItems: Array<{ line_item_id: string; name: string; error: string }> = [];

        // Get base prices to determine which need overrides vs deletion
        const lineItemIds = previousPrices.map(p => p.lineItemId);
        const batchSize = 100;
        let originalItems: any[] = [];
        
        for (let i = 0; i < lineItemIds.length; i += batchSize) {
          const batch = lineItemIds.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('line_items')
            .select('id, name, price')
            .in('id', batch);
          
          if (error) {
            // Error fetching line items
          } else {
            originalItems = originalItems.concat(data || []);
          }
        }
        
        const originalMap = new Map(originalItems.map(item => [item.id, { name: item.name, price: item.price }]));
        
        // Separate items
        const itemsToRestore: typeof previousPrices = [];
        const itemsToDelete: string[] = [];
        
        previousPrices.forEach(prev => {
          const original = originalMap.get(prev.lineItemId);
          if (original && Math.abs(original.price - prev.price) < 0.01) {
            itemsToDelete.push(prev.lineItemId);
          } else {
            itemsToRestore.push(prev);
          }
        });
        
        // Delete overrides for items that should use base price
        if (itemsToDelete.length > 0) {
          for (let i = 0; i < itemsToDelete.length; i += batchSize) {
            const batch = itemsToDelete.slice(i, i + batchSize);
            const { error } = await supabase
              .from('line_item_overrides')
              .delete()
              .eq('organization_id', organizationId)
              .in('line_item_id', batch);
            
            if (!error) {
              successCount += batch.length;
            } else {
              failedCount += batch.length;
              batch.forEach(id => {
                const item = originalMap.get(id);
                failedItems.push({
                  line_item_id: id,
                  name: item?.name || `Item ${id}`,
                  error: error.message
                });
              });
            }
            
            // Update progress
            const processedSoFar = i + batch.length;
            await jobQueue.updateProgress(jobId, { 
              current: processedSoFar, 
              total: previousPrices.length 
            });
          }
        }
        
        // Restore overrides
        for (let i = 0; i < itemsToRestore.length; i += 50) {
          const batch = itemsToRestore.slice(i, i + 50);
          
          const overrides = batch.map(item => ({
            organization_id: organizationId,
            line_item_id: item.lineItemId,
            custom_price: item.price,
            updated_at: new Date().toISOString()
          }));
          
          const { error } = await supabase
            .from('line_item_overrides')
            .upsert(overrides, {
              onConflict: 'organization_id,line_item_id'
            });
          
          if (error) {
            // Error restoring prices
            failedCount += batch.length;
            batch.forEach(item => {
              const original = originalMap.get(item.lineItemId);
              failedItems.push({
                line_item_id: item.lineItemId,
                name: original?.name || `Item ${item.lineItemId}`,
                error: error.message
              });
            });
          } else {
            successCount += batch.length;
          }
          
          // Update progress
          const processedSoFar = itemsToDelete.length + i + batch.length;
          await jobQueue.updateProgress(jobId, { 
            current: processedSoFar, 
            total: previousPrices.length 
          });
        }
        
        // Undo job completed
        
        // Mark as completed
        await jobQueue.markAsCompleted(jobId, {
          success_count: successCount,
          failed_count: failedCount,
          failed_items: failedItems
        });
        
      } catch (error) {
        // Error processing undo job
        
        if (error instanceof Error && error.message === 'Job cancelled') {
          return;
        }
        
        await jobQueue.markAsFailed(
          jobId, 
          error instanceof Error ? error.message : 'Unknown error occurred'
        );
      }
    }, 100);
  }

}