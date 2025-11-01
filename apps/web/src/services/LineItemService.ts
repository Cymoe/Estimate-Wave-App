import { supabase } from '../lib/supabase';
import { ActivityLogService } from './ActivityLogService';
import { LineItem } from '../types';

export class LineItemService {
  /**
   * List all line items available to an organization based on their industries
   * Line items are tied to cost codes, which are tied to industries
   */
  static async list(organizationId: string): Promise<LineItem[]> {
    // Use the optimized database function
    const { data, error } = await supabase
      .rpc('get_organization_line_items_filtered', { 
        p_organization_id: organizationId 
      });

    if (error) {
      console.error('Error fetching line items:', error);
      throw error;
    }

    // Transform the data to match our LineItem interface
    const lineItems: LineItem[] = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      cost_code_id: row.cost_code_id,
      cost_code: row.cost_code, // Include the full cost_code object with category from database function
      price: row.price || row.base_price, // Use base_price if price not yet migrated
      base_price: row.base_price || row.price,
      red_line_price: row.red_line_price,
      cap_price: row.cap_price,
      pricing_factors: row.pricing_factors,
      unit: row.unit,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      organization_id: row.organization_id,
      user_id: row.user_id || '', // Add user_id field
      service_category: row.service_category, // Add service_category field
      is_package: row.is_package,
      package_items: row.package_items,
      materials_list: row.materials_list, // Add materials_list field
      // Add these for UI display
      has_override: row.has_override,
      markup_percentage: row.markup_percentage,
      margin_percentage: row.margin_percentage,
      price_position: row.price_position
    }));

    return lineItems;
  }

  /**
   * Get a single line item by ID
   */
  static async getById(id: string): Promise<LineItem | null> {
    const { data, error } = await supabase
      .from('line_items')
      .select(`
        *,
        cost_code:cost_codes(name, code)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching line item:', error);
      throw error;
    }

    return data;
  }

  /**
   * Create a new line item (admin only)
   */
  static async create(lineItem: Omit<LineItem, 'id' | 'created_at' | 'updated_at'>): Promise<LineItem> {
    const { data, error } = await supabase
      .from('line_items')
      .insert([lineItem])
      .select(`
        *,
        cost_code:cost_codes(name, code)
      `)
      .single();

    if (error) {
      console.error('Error creating line item:', error);
      throw error;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: 'system', // Since line items are now system-wide
      entityType: 'line_item',
      entityId: data.id,
      action: 'create',
      description: `Created line item "${data.name}"`
    });

    return data;
  }

  /**
   * Update an existing line item (only if owned by the organization)
   */
  static async update(id: string, updates: Partial<LineItem>, organizationId?: string): Promise<LineItem> {
    // First, check if the line item exists and get its organization_id
    const { data: existingItem, error: fetchError } = await supabase
      .from('line_items')
      .select('organization_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching line item:', fetchError);
      throw new Error('Line item not found');
    }

    // Check ownership - only allow updates if:
    // 1. The line item belongs to the user's organization
    // 2. The user is trying to update their own custom line item
    if (!existingItem.organization_id) {
      throw new Error('Cannot edit shared industry-standard line items. Use "Customize Pricing" instead.');
    }

    if (organizationId && existingItem.organization_id !== organizationId) {
      throw new Error('You can only edit line items owned by your organization');
    }

    const { data, error } = await supabase
      .from('line_items')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        cost_code:cost_codes(name, code)
      `)
      .single();

    if (error) {
      console.error('Error updating line item:', error);
      throw error;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: existingItem.organization_id || 'system',
      entityType: 'line_item',
      entityId: id,
      action: 'update',
      description: `Updated line item "${data.name}"`
    });

    return data;
  }

  /**
   * Delete a line item (only if owned by the organization)
   */
  static async delete(id: string, organizationId?: string): Promise<void> {
    // Get the line item first for validation and logging
    const lineItem = await this.getById(id);
    
    if (!lineItem) {
      throw new Error('Line item not found');
    }

    // Check ownership - only allow deletion if:
    // 1. The line item belongs to the user's organization
    if (!lineItem.organization_id) {
      throw new Error('Cannot delete shared industry-standard line items');
    }

    if (organizationId && lineItem.organization_id !== organizationId) {
      throw new Error('You can only delete line items owned by your organization');
    }
    
    const { error } = await supabase
      .from('line_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting line item:', error);
      throw error;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: lineItem.organization_id || 'system',
      entityType: 'line_item',
      entityId: id,
      action: 'delete',
      description: `Deleted line item "${lineItem?.name}"`
    });
  }

  /**
   * Get line items by cost code
   */
  static async getByCostCode(costCodeId: string): Promise<LineItem[]> {
    const { data, error } = await supabase
      .from('line_items')
      .select(`
        *,
        cost_code:cost_codes(name, code)
      `)
      .eq('cost_code_id', costCodeId)
      .order('name');

    if (error) {
      console.error('Error fetching line items by cost code:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get line items with project-specific pricing context
   * If the project has a pricing mode, it will be applied to the line items
   */
  static async listForProject(organizationId: string, projectId?: string): Promise<LineItem[]> {
    // First, get the project's pricing mode if a project is specified
    let projectPricingMode = null;
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('pricing_mode_id, lock_pricing')
        .eq('id', projectId)
        .single();
      
      if (project?.pricing_mode_id) {
        // Get the pricing mode details
        const { data: pricingMode } = await supabase
          .from('pricing_modes')
          .select('*')
          .eq('id', project.pricing_mode_id)
          .single();
        
        projectPricingMode = pricingMode;
      }
    }

    // Get line items with organization overrides
    const lineItems = await this.list(organizationId);

    // If project has a specific pricing mode, apply it
    if (projectPricingMode) {
      // Get cost codes to determine categories
      const costCodeIds = [...new Set(lineItems.map(item => item.cost_code_id).filter(Boolean))];
      const { data: costCodes } = await supabase
        .from('cost_codes')
        .select('id, code')
        .in('id', costCodeIds);
      
      const costCodeMap = new Map(costCodes?.map(cc => [cc.id, cc.code]) || []);

      // Apply project pricing mode adjustments
      return lineItems.map(item => {
        const costCodeValue = item.cost_code_id ? costCodeMap.get(item.cost_code_id) : undefined;
        const category = this.getCategoryFromCostCode(costCodeValue);
        const multiplier = projectPricingMode.adjustments[category] || projectPricingMode.adjustments.all || 1;
        
        // Apply multiplier to base price (not current price) to get project price
        const basePrice = item.base_price || item.price;
        const projectPrice = basePrice * multiplier;
        
        return {
          ...item,
          price: projectPrice,
          // Add metadata about pricing source
          pricing_source: 'project',
          applied_mode_id: projectPricingMode.id,
          applied_mode_name: projectPricingMode.name
        };
      });
    }

    // No project pricing, return items with organization pricing
    return lineItems.map(item => ({
      ...item,
      pricing_source: 'organization'
    }));
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
   * Calculate price based on position within range
   * @param redLine - Minimum price
   * @param base - Base/default price
   * @param cap - Maximum price
   * @param position - Position in range (0.0 = redLine, 0.5 = base, 1.0 = cap)
   */
  static calculatePriceFromPosition(
    redLine: number | undefined,
    base: number,
    cap: number | undefined,
    position: number = 0.5
  ): number {
    // If no range defined, return base price
    if (!redLine || !cap) return base;
    
    // Ensure position is within bounds
    position = Math.max(0, Math.min(1, position));
    
    // Linear interpolation
    if (position <= 0.5) {
      // Between red line and base
      return redLine + (base - redLine) * (position * 2);
    } else {
      // Between base and cap
      return base + (cap - base) * ((position - 0.5) * 2);
    }
  }

  /**
   * Calculate position from price within range
   * @param redLine - Minimum price
   * @param base - Base/default price
   * @param cap - Maximum price
   * @param price - Current price
   */
  static calculatePositionFromPrice(
    redLine: number | undefined,
    base: number,
    cap: number | undefined,
    price: number
  ): number {
    // If no range defined, return 0.5 (base position)
    if (!redLine || !cap) return 0.5;
    
    // Determine position based on price
    if (price <= redLine) return 0;
    if (price >= cap) return 1;
    
    if (price <= base) {
      // Between red line and base
      return (price - redLine) / (base - redLine) * 0.5;
    } else {
      // Between base and cap
      return 0.5 + (price - base) / (cap - base) * 0.5;
    }
  }

  /**
   * Bulk create line items (admin only)
   */
  static async bulkCreate(lineItems: Omit<LineItem, 'id' | 'created_at' | 'updated_at'>[]): Promise<LineItem[]> {
    const { data, error } = await supabase
      .from('line_items')
      .insert(lineItems)
      .select(`
        *,
        cost_code:cost_codes(name, code)
      `);

    if (error) {
      console.error('Error bulk creating line items:', error);
      throw error;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: 'system',
      entityType: 'line_item',
      entityId: 'bulk',
      action: 'create',
      description: `Bulk created ${lineItems.length} line items`
    });

    return data || [];
  }

  /**
   * Create or update a price override for a shared line item
   */
  static async setOverridePrice(lineItemId: string, organizationId: string, customPrice: number): Promise<void> {
    const { error } = await supabase
      .from('line_item_overrides')
      .upsert({
        line_item_id: lineItemId,
        organization_id: organizationId,
        custom_price: customPrice,
        markup_percentage: null, // Clear markup when setting custom price
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'organization_id,line_item_id'
      });

    if (error) {
      console.error('Error setting override price:', error);
      throw error;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: organizationId,
      entityType: 'line_item_override',
      entityId: lineItemId,
      action: 'update',
      description: `Set custom price to ${customPrice}`
    });
  }

  /**
   * Set markup percentage for a line item
   */
  static async setMarkupPercentage(lineItemId: string, organizationId: string, markupPercentage: number): Promise<void> {
    const { error } = await supabase
      .from('line_item_overrides')
      .upsert({
        line_item_id: lineItemId,
        organization_id: organizationId,
        markup_percentage: markupPercentage,
        custom_price: null, // Clear custom price when setting markup
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'organization_id,line_item_id'
      });

    if (error) {
      console.error('Error setting markup percentage:', error);
      throw error;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: organizationId,
      entityType: 'line_item_override',
      entityId: lineItemId,
      action: 'update',
      description: `Set markup to ${markupPercentage}%`
    });
  }

  /**
   * Remove a price override, reverting to industry standard
   */
  static async removeOverridePrice(lineItemId: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('line_item_overrides')
      .delete()
      .eq('line_item_id', lineItemId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error removing override price:', error);
      throw error;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: organizationId,
      entityType: 'line_item_override',
      entityId: lineItemId,
      action: 'delete',
      description: 'Reverted to industry standard pricing'
    });
  }

  /**
   * Get all price overrides for an organization
   */
  static async getOrganizationOverrides(organizationId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('line_item_overrides')
      .select(`
        *,
        line_item:line_items(name, price, unit)
      `)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error fetching organization overrides:', error);
      throw error;
    }

    return data || [];
  }
}