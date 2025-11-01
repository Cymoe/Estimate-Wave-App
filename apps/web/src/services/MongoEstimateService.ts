/**
 * MongoDB-based Estimate Service
 * Replaces Supabase EstimateService with MongoDB API calls
 */

import { estimatesAPI } from '@/lib/api';
import type { Estimate as MongoEstimate } from '@/hooks/useEstimates';

// Convert MongoDB estimate to legacy format
function convertFromMongo(mongoEst: MongoEstimate): any {
  return {
    id: mongoEst._id,
    user_id: mongoEst.userId,
    organization_id: mongoEst.organizationId,
    client_id: mongoEst.clientId,
    project_id: mongoEst.projectId,
    estimate_number: mongoEst.estimateNumber,
    title: mongoEst.title,
    description: mongoEst.description,
    status: mongoEst.status,
    issue_date: mongoEst.issueDate,
    expiry_date: mongoEst.expiryDate,
    subtotal: mongoEst.subtotal,
    tax_rate: mongoEst.taxRate,
    tax_amount: mongoEst.taxAmount,
    total_amount: mongoEst.totalAmount,
    notes: mongoEst.notes,
    terms: mongoEst.terms,
    client_signature: mongoEst.clientSignature,
    signed_at: mongoEst.signedAt,
    items: mongoEst.items?.map(item => ({
      id: item._id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      cost_code: item.costCode,
      display_order: item.displayOrder,
    })),
    created_at: mongoEst.createdAt,
    updated_at: mongoEst.updatedAt,
  };
}

// Convert legacy format to MongoDB
function convertToMongo(estimate: any): Partial<MongoEstimate> {
  return {
    userId: estimate.user_id,
    organizationId: estimate.organization_id,
    clientId: estimate.client_id,
    projectId: estimate.project_id,
    estimateNumber: estimate.estimate_number,
    title: estimate.title,
    description: estimate.description,
    status: estimate.status,
    issueDate: estimate.issue_date,
    expiryDate: estimate.expiry_date,
    subtotal: estimate.subtotal,
    taxRate: estimate.tax_rate || 0,
    taxAmount: estimate.tax_amount || 0,
    totalAmount: estimate.total_amount,
    notes: estimate.notes,
    terms: estimate.terms,
    items: estimate.items?.map((item: any, index: number) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.total_price,
      costCode: item.cost_code,
      displayOrder: item.display_order ?? index,
    })),
  };
}

export class MongoEstimateService {
  /**
   * Create a new estimate (compatible with EstimateService.create)
   */
  static async create(estimate: any): Promise<any> {
    try {
      // Convert to MongoDB format
      const mongoData = convertToMongo(estimate);
      
      // Generate estimate number if not provided
      if (!mongoData.estimateNumber) {
        const year = new Date().getFullYear();
        const timestamp = Date.now().toString().slice(-6);
        mongoData.estimateNumber = `EST-${year}-${timestamp}`;
      }
      
      // Create via MongoDB API
      const created = await estimatesAPI.create(mongoData);
      
      // Convert back to legacy format for compatibility
      return convertFromMongo(created);
    } catch (error) {
      console.error('MongoDB Estimate creation error:', error);
      throw error;
    }
  }

  /**
   * Get estimate by ID
   */
  static async getById(id: string): Promise<any> {
    const estimate = await estimatesAPI.getById(id);
    return convertFromMongo(estimate);
  }

  /**
   * List estimates for an organization
   */
  static async list(organizationId: string): Promise<any[]> {
    const estimates = await estimatesAPI.list(organizationId);
    return estimates.map(convertFromMongo);
  }

  /**
   * Update an estimate
   */
  static async update(id: string, updates: any): Promise<any> {
    const mongoUpdates = convertToMongo(updates);
    const updated = await estimatesAPI.update(id, mongoUpdates);
    return convertFromMongo(updated);
  }

  /**
   * Delete an estimate
   */
  static async delete(id: string): Promise<void> {
    await estimatesAPI.delete(id);
  }

  /**
   * Sign an estimate
   */
  static async addSignature(id: string, signature: string): Promise<any> {
    const signed = await estimatesAPI.sign(id, signature);
    return convertFromMongo(signed);
  }
}

