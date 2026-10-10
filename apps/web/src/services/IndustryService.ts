import { industriesAPI } from '../lib/api';

export interface Industry {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  display_order: number;
  is_active: boolean;
}

/** Trades, and which ones an organization works in (Convex). */
export class IndustryService {
  /**
   * Get all industries
   */
  static async listAll(): Promise<Industry[]> {
    return industriesAPI.list();
  }

  /**
   * Get organization's selected industries
   */
  static async getOrganizationIndustries(organizationId: string): Promise<Industry[]> {
    return industriesAPI.forOrganization(organizationId);
  }

  /**
   * Get organization's selected industry IDs
   */
  static async getOrganizationIndustryIds(organizationId: string): Promise<string[]> {
    const industries = await industriesAPI.forOrganization(organizationId);
    return industries.map((industry: Industry) => industry.id);
  }

  /**
   * Add industry to organization
   */
  static async addToOrganization(organizationId: string, industryId: string): Promise<void> {
    const ids = await this.getOrganizationIndustryIds(organizationId);
    if (!ids.includes(industryId)) {
      await industriesAPI.setForOrganization(organizationId, [...ids, industryId]);
    }
  }

  /**
   * Remove industry from organization
   */
  static async removeFromOrganization(organizationId: string, industryId: string): Promise<void> {
    const ids = await this.getOrganizationIndustryIds(organizationId);
    await industriesAPI.setForOrganization(organizationId, ids.filter((id) => id !== industryId));
  }

  /**
   * Set organization industries (replaces all existing)
   */
  static async setOrganizationIndustries(organizationId: string, industryIds: string[]): Promise<void> {
    await industriesAPI.setForOrganization(organizationId, industryIds);
  }

  /**
   * Get organization's subscription plan and industry limit. There are no
   * paid plans yet, so every organization can choose any number of trades.
   */
  static async getOrganizationPlan(organizationId: string): Promise<{
    planName: string;
    industryLimit: number | null;
    currentCount: number;
    canAddMore: boolean;
  }> {
    const currentCount = await this.getOrganizationIndustryCount(organizationId);
    return { planName: 'Free', industryLimit: null, currentCount, canAddMore: true };
  }

  /**
   * Get organization's industry limit (number or null for unlimited)
   */
  static async getOrganizationIndustryLimit(organizationId: string): Promise<number | null> {
    return (await this.getOrganizationPlan(organizationId)).industryLimit;
  }

  /**
   * Count organization's industries
   */
  static async getOrganizationIndustryCount(organizationId: string): Promise<number> {
    return (await this.getOrganizationIndustryIds(organizationId)).length;
  }

  /**
   * Check if organization can add more industries
   */
  static async canAddMoreIndustries(organizationId: string): Promise<boolean> {
    return (await this.getOrganizationPlan(organizationId)).canAddMore;
  }
}
