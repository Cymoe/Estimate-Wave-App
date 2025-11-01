/**
 * MongoDB Line Item Service - Replaces Supabase LineItemService
 * Provides Price Book functionality with Cap/RedLine pricing
 */

import { lineItemsAPI } from '../lib/api';
import { LineItem } from '../types';

export class MongoLineItemService {
  /**
   * List all line items available to an organization
   * Includes organization-specific AND shared industry items
   */
  static async list(organizationId: string, filters?: {
    costCodeId?: string;
    category?: string;
    search?: string;
    isActive?: boolean;
  }): Promise<LineItem[]> {
    try {
      const lineItems = await lineItemsAPI.list(organizationId, {
        ...filters,
        includeShared: true, // Include industry-standard shared items
      });
      
      // Transform MongoDB _id to id for frontend compatibility
      return lineItems.map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
    } catch (error) {
      console.error('Error fetching line items:', error);
      throw error;
    }
  }

  /**
   * Get a single line item by ID
   */
  static async getById(id: string): Promise<LineItem | null> {
    try {
      const lineItem = await lineItemsAPI.getById(id);
      return {
        ...lineItem,
        id: lineItem._id || lineItem.id,
      };
    } catch (error) {
      console.error('Error fetching line item:', error);
      return null;
    }
  }

  /**
   * Create a new line item
   */
  static async create(lineItem: Omit<LineItem, 'id' | 'created_at' | 'updated_at'>): Promise<LineItem> {
    try {
      const created = await lineItemsAPI.create(lineItem);
      return {
        ...created,
        id: created._id || created.id,
      };
    } catch (error) {
      console.error('Error creating line item:', error);
      throw error;
    }
  }

  /**
   * Update an existing line item
   */
  static async update(id: string, updates: Partial<LineItem>): Promise<LineItem> {
    try {
      const updated = await lineItemsAPI.update(id, updates);
      return {
        ...updated,
        id: updated._id || updated.id,
      };
    } catch (error) {
      console.error('Error updating line item:', error);
      throw error;
    }
  }

  /**
   * Delete a line item (soft delete - sets is_active = false)
   */
  static async delete(id: string): Promise<void> {
    try {
      await lineItemsAPI.delete(id);
    } catch (error) {
      console.error('Error deleting line item:', error);
      throw error;
    }
  }

  /**
   * Bulk create line items (for data import)
   */
  static async bulkCreate(items: any[]): Promise<{ count: number; items: LineItem[] }> {
    try {
      const result = await lineItemsAPI.bulkCreate(items);
      return {
        count: result.count,
        items: result.items.map((item: any) => ({
          ...item,
          id: item._id || item.id,
        })),
      };
    } catch (error) {
      console.error('Error bulk creating line items:', error);
      throw error;
    }
  }

  /**
   * Calculate price based on position between red line and cap
   */
  static calculatePrice(lineItem: LineItem, position: number = 0.5): number {
    const { red_line_price, cap_price, base_price } = lineItem;
    
    if (red_line_price && cap_price) {
      // Position 0 = red line, 0.5 = middle, 1 = cap
      return red_line_price + (cap_price - red_line_price) * position;
    }
    
    return base_price || 0;
  }

  /**
   * Get price position (0-1) relative to red line and cap
   */
  static getPricePosition(lineItem: LineItem, currentPrice: number): number {
    const { red_line_price, cap_price } = lineItem;
    
    if (!red_line_price || !cap_price) return 0.5;
    
    const range = cap_price - red_line_price;
    if (range === 0) return 0.5;
    
    const position = (currentPrice - red_line_price) / range;
    return Math.max(0, Math.min(1, position)); // Clamp to 0-1
  }

  /**
   * Check if a price is within bounds (red line to cap)
   */
  static isPriceInBounds(lineItem: LineItem, price: number): boolean {
    const { red_line_price, cap_price } = lineItem;
    
    if (!red_line_price || !cap_price) return true;
    
    return price >= red_line_price && price <= cap_price;
  }

  /**
   * Get pricing recommendations based on factors
   */
  static getRecommendedPrice(lineItem: LineItem, factors?: {
    complexity?: 'low' | 'medium' | 'high';
    urgency?: 'low' | 'medium' | 'high';
    relationship?: 'new' | 'existing' | 'loyal';
  }): { price: number; position: number; reasoning: string } {
    const { red_line_price, cap_price, base_price } = lineItem;
    
    if (!red_line_price || !cap_price) {
      return { price: base_price || 0, position: 0.5, reasoning: 'No pricing range set' };
    }
    
    let position = 0.5; // Start at middle
    let reasoning: string[] = [];
    
    // Adjust based on complexity
    if (factors?.complexity === 'high') {
      position += 0.2;
      reasoning.push('High complexity (+20%)');
    } else if (factors?.complexity === 'low') {
      position -= 0.1;
      reasoning.push('Low complexity (-10%)');
    }
    
    // Adjust based on urgency
    if (factors?.urgency === 'high') {
      position += 0.15;
      reasoning.push('High urgency (+15%)');
    }
    
    // Adjust based on relationship
    if (factors?.relationship === 'new') {
      position -= 0.1;
      reasoning.push('New client discount (-10%)');
    } else if (factors?.relationship === 'loyal') {
      position -= 0.05;
      reasoning.push('Loyal client discount (-5%)');
    }
    
    // Clamp position to 0-1
    position = Math.max(0, Math.min(1, position));
    
    const price = this.calculatePrice(lineItem, position);
    
    return {
      price: Math.round(price * 100) / 100,
      position,
      reasoning: reasoning.join(', ') || 'Standard pricing',
    };
  }
}

