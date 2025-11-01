import { supabase } from '../lib/supabase';
import { ActivityLogService } from './ActivityLogService';

// Service Types
export interface Service {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  category: 'installation' | 'repair' | 'maintenance' | 'inspection' | 'consultation' | 'preparation' | 'finishing';
  icon?: string;
  industry_id?: string;
  industry_name?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  // Computed fields
  option_count?: number;
  min_price?: number;
  max_price?: number;
  avg_price?: number;
  total_materials_count?: number;
  options?: ServiceOption[];
}

export interface ServiceOption {
  id: string;
  service_id: string;
  organization_id?: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  estimated_hours?: number;
  materials_list?: string[];
  skill_level?: 'basic' | 'intermediate' | 'advanced' | 'expert';
  material_quality?: 'economy' | 'standard' | 'premium' | 'luxury';
  warranty_months?: number;
  is_active: boolean;
  is_popular: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  attributes?: Record<string, any>; // JSONB field for industry-specific attributes
  // Calculated fields
  base_price?: number; // Sum of line item prices
  discounted_price?: number; // Price after bundle discount
  // Related data
  service?: Service;
  service_option_items?: Array<{
    id: string;
    quantity: number;
    calculation_type?: 'multiply' | 'fixed' | 'per_unit';
    is_optional: boolean;
    display_order: number;
    line_item: {
      id: string;
      name: string;
      description?: string;
      price: number;
      unit: string;
      category?: string;
    };
  }>;
}

export interface ServicePackage {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  level: 'essentials' | 'complete' | 'deluxe';
  base_price?: number;
  industry_id?: string;
  industry_name?: string;
  project_duration_days?: number;
  ideal_for?: string[];
  includes_warranty: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  package_discount_percentage?: number; // Additional discount at package level
  // Computed fields from view
  item_count?: number;
  required_item_count?: number;
  total_item_count?: number;
  optional_item_count?: number;
  upgrade_item_count?: number;
  calculated_price?: number;
  package_price?: number;
  optional_items_value?: number;
  upgrade_items_value?: number;
  total_potential_value?: number;
  items?: ServicePackageItem[];
}

export interface ServicePackageItem {
  id: string;
  package_id: string;
  service_option_id: string;
  quantity: number;
  is_optional: boolean;
  is_upgrade: boolean;
  display_order: number;
  notes?: string;
  // Related data
  service_option?: ServiceOption;
}

export class ServiceCatalogService {
  /**
   * Get all service templates (service_options where is_template = true) for an organization
   */
  static async listTemplates(organizationId: string): Promise<any[]> {
    // First get the organization's selected industries
    const { data: orgIndustries, error: indError } = await supabase
      .from('organization_industries')
      .select('industry_id')
      .eq('organization_id', organizationId);
    
    if (indError) {
      // Error fetching organization industries
      throw indError;
    }
    
    const industryIds = orgIndustries?.map(oi => oi.industry_id) || [];
    
    // Get all service options that are templates for these industries
    // Include both shared (organization_id IS NULL) and org-specific options
    const { data, error } = await supabase
      .from('service_options')
      .select(`
        *,
        service:services!inner(
          id,
          name,
          industry_id,
          industry:industries(id, name)
        ),
        service_option_items(
          id,
          quantity,
          calculation_type,
          coverage_amount,
          coverage_unit,
          line_item:line_items(
            id,
            name,
            price,
            unit,
            cost_code_id,
            cost_code:cost_codes(
              code,
              name,
              category
            )
          )
        )
      `)
      .eq('is_template', true)
      .in('service.industry_id', industryIds)
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .order('name');

    if (error) {
      // Error fetching templates
      throw error;
    }

    // Deduplicate templates - prioritize organization-specific over shared templates
    const templatesMap = new Map<string, any>();
    
    (data || []).forEach(template => {
      // Create a unique key based on service_id and normalized name
      const key = `${template.service_id}-${template.name.toLowerCase().trim()}`;
      const existing = templatesMap.get(key);
      
      // If no existing template, or this is an org-specific template (overwrites shared)
      if (!existing || template.organization_id !== null) {
        templatesMap.set(key, template);
      }
    });
    
    return Array.from(templatesMap.values()).map(template => {
      // Don't spread the entire template to avoid including joined fields
      const cleanTemplate = {
        id: template.id,
        name: template.name,
        description: template.description,
        service_id: template.service_id,
        organization_id: template.organization_id,
        price: template.price,
        unit: template.unit,
        is_template: template.is_template,
        attributes: template.attributes,
        material_quality: template.material_quality,
        warranty_months: template.warranty_months,
        estimated_hours: template.estimated_hours,
        skill_level: template.skill_level,
        created_at: template.created_at,
        updated_at: template.updated_at,
        // Add computed fields
        service_name: template.service?.name,
        industry_name: template.service?.industry?.name,
        industry_id: template.service?.industry_id,
        line_item_count: template.service_option_items?.length || 0,
        // Include the joined data separately
        service: template.service,
        service_option_items: template.service_option_items
      };
      return cleanTemplate;
    });
  }
  /**
   * List all services for an organization
   */
  static async listServices(organizationId: string): Promise<Service[]> {
    // Debug -'ServiceCatalogService.listServices called with org:', organizationId);
    
    // First, let's check what industries are selected for this org
    const { data: orgIndustries, error: indError } = await supabase
      .from('organization_industries')
      .select('industry_id, industries(name)')
      .eq('organization_id', organizationId);
    
    if (!indError && orgIndustries) {
      // Debug - Organization has these industries selected
    }
    
    const { data, error } = await supabase
      .rpc('get_organization_services', { 
        p_organization_id: organizationId 
      });

    if (error) {
      // Error fetching services
      throw error;
    }
    
    // Map the service_industry_id back to industry_id for the interface
    const services = (data || []).map((service: any) => ({
      ...service,
      industry_id: service.service_industry_id || service.industry_id
    }));
    
    // Debug -'ServiceCatalogService returned:', services.length, 'services');
    
    // Log which industries have services
    const industriesWithServices = new Set(services.map((s: Service) => s.industry_name));
    // Debug -'Industries with services:', Array.from(industriesWithServices).join(', '));
    
    return services;
  }

  /**
   * Get a single service with all its options
   */
  static async getServiceWithOptions(serviceId: string): Promise<Service & { options: ServiceOption[] }> {
    // Get service details
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select(`
        *,
        industry:industries(id, name)
      `)
      .eq('id', serviceId)
      .single();

    if (serviceError) throw serviceError;

    // Get service options with line items using RPC function
    const { data: options, error: optionsError } = await supabase
      .rpc('get_service_options_with_line_items', {
        p_service_id: serviceId
      });

    if (optionsError) throw optionsError;

    // The RPC function returns the data already in the correct format
    const transformedOptions = (options || []).map((option: any) => ({
      ...option,
      service_option_items: option.service_option_items || []
    }));

    return {
      ...service,
      industry_name: service.industry?.name,
      options: transformedOptions
    };
  }

  /**
   * List service options for a specific service
   */
  static async listServiceOptions(serviceId: string, organizationId: string): Promise<ServiceOption[]> {
    const { data, error } = await supabase
      .from('service_options')
      .select(`
        *,
        service_option_items_with_category!service_option_items_with_category_service_option_id_fkey (
          id,
          quantity,
          calculation_type,
          coverage_amount,
          coverage_unit,
          is_optional,
          display_order,
          line_item_id,
          line_item_name,
          line_item_description,
          line_item_price,
          line_item_unit,
          line_item_category
        )
      `)
      .eq('service_id', serviceId)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .eq('is_active', true)
      .order('display_order');

    if (error) throw error;

    // Deduplicate options - prioritize organization-specific over templates
    const optionsMap = new Map<string, any>();
    
    (data || []).forEach(option => {
      const key = option.name.toLowerCase().trim();
      const existing = optionsMap.get(key);
      
      // If no existing option, or this is an org-specific option (overwrites template)
      if (!existing || option.organization_id !== null) {
        optionsMap.set(key, option);
      }
    });

    // Transform the deduplicated data to match our interface
    return Array.from(optionsMap.values()).map(option => ({
      ...option,
      service_option_items: option.service_option_items_with_category?.map((item: {
        id: string;
        quantity: number;
        calculation_type: string;
        coverage_amount: number | null;
        coverage_unit: string | null;
        is_optional: boolean;
        display_order: number;
        line_item_id: string;
        line_item_name: string;
        line_item_description: string;
        line_item_price: number;
        line_item_unit: string;
        line_item_category: string;
      }) => ({
        id: item.id,
        quantity: item.quantity,
        calculation_type: item.calculation_type,
        coverage_amount: item.coverage_amount,
        coverage_unit: item.coverage_unit,
        is_optional: item.is_optional,
        display_order: item.display_order,
        line_item: {
          id: item.line_item_id,
          name: item.line_item_name,
          description: item.line_item_description,
          price: item.line_item_price,
          unit: item.line_item_unit,
          category: item.line_item_category
        }
      }))
    }));
  }

  /**
   * Create a new service
   */
  static async createService(service: Omit<Service, 'id' | 'created_at' | 'updated_at'>): Promise<Service> {
    const { data, error } = await supabase
      .from('services')
      .insert({
        ...service,
        created_by: (await supabase.auth.getUser()).data.user?.id
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await ActivityLogService.log({
      organizationId: service.organization_id!,
      entityType: 'service',
      entityId: data.id,
      action: 'created',
      description: `created service "${data.name}"`,
      metadata: {
        category: data.category,
        industry_id: data.industry_id
      }
    });

    return data;
  }

  /**
   * Create a new service option
   */
  static async createServiceOption(option: Omit<ServiceOption, 'id' | 'created_at' | 'updated_at'>): Promise<ServiceOption> {
    const { data, error } = await supabase
      .from('service_options')
      .insert(option)
      .select()
      .single();

    if (error) throw error;

    // Get service name for logging
    const { data: service } = await supabase
      .from('services')
      .select('name')
      .eq('id', option.service_id)
      .single();

    // Log activity
    await ActivityLogService.log({
      organizationId: option.organization_id!,
      entityType: 'service_option',
      entityId: data.id,
      action: 'created',
      description: `created option "${data.name}" for service "${service?.name}"`,
      metadata: {
        service_id: option.service_id,
        price: data.price,
        material_quality: data.material_quality
      }
    });

    return data;
  }

  /**
   * Update a service option
   */
  static async updateServiceOption(
    id: string, 
    updates: Partial<ServiceOption>
  ): Promise<ServiceOption> {
    const { data: current } = await supabase
      .from('service_options')
      .select('*')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('service_options')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Build change metadata
    const changes: Record<string, any> = {};
    if (updates.name && updates.name !== current?.name) {
      changes.old_name = current?.name;
      changes.new_name = updates.name;
    }
    if (updates.price !== undefined && updates.price !== current?.price) {
      changes.old_price = current?.price;
      changes.new_price = updates.price;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: data.organization_id!,
      entityType: 'service_option',
      entityId: id,
      action: 'updated',
      description: `updated service option "${data.name}"`,
      metadata: changes
    });

    return data;
  }

  /**
   * List all service packages for an organization
   */
  static async listPackages(organizationId: string): Promise<ServicePackage[]> {
    // First get the organization's selected industries
    const { data: orgIndustries, error: indError } = await supabase
      .from('organization_industries')
      .select('industry_id')
      .eq('organization_id', organizationId);
    
    if (indError) {
      // Error fetching organization industries
      throw indError;
    }
    
    const industryIds = orgIndustries?.map(oi => oi.industry_id) || [];
    
    // Build the query for packages
    let query = supabase
      .from('service_packages')
      .select(`
        *,
        industry:industries(id, name),
        service_package_templates(
          id,
          quantity,
          is_optional,
          template:service_options(
            id,
            name,
            price,
            unit
          )
        )
      `);
    
    // If organization has selected industries, filter by them
    if (industryIds.length > 0) {
      query = query.or(`organization_id.eq.${organizationId},and(organization_id.is.null,industry_id.in.(${industryIds.map(id => `"${id}"`).join(',')}))`);
    } else {
      // If no industries selected, only show org-specific packages
      query = query.eq('organization_id', organizationId);
    }
    
    // Complete the query
    const { data: packages, error } = await query
      .order('level', { ascending: true })
      .order('display_order');

    if (error) throw error;

    // Calculate prices and category counts for each package
    return (packages || []).map(pkg => {
      let requiredPrice = 0;
      let optionalPrice = 0;
      let requiredCount = 0;
      let optionalCount = 0;
      let laborCount = 0;
      let materialCount = 0;
      let equipmentCount = 0;
      let serviceCount = 0;
      
      if (pkg.service_package_templates) {
        pkg.service_package_templates.forEach((item: {
          id: string;
          quantity: number;
          is_optional: boolean;
          template: {
            id: string;
            name: string;
            price: number;
            unit: string;
          } | null;
        }) => {
          if (item.template) {
            const templatePrice = (item.template.price * (item.quantity || 1));
            
            if (item.is_optional) {
              optionalPrice += templatePrice;
              optionalCount++;
            } else {
              requiredPrice += templatePrice;
              requiredCount++;
            }
          }
        });
      }
      
      const potentialValue = requiredPrice + optionalPrice;
      
      return {
        ...pkg,
        industry_name: pkg.industry?.name,
        calculated_price: requiredPrice, // Base price (required only)
        potential_price: potentialValue, // With all options
        required_count: requiredCount,
        optional_count: optionalCount,
        item_count: requiredCount + optionalCount,
        completion_percentage: requiredCount > 0 ? Math.round((requiredPrice / potentialValue) * 100) : 0,
        labor_count: laborCount,
        material_count: materialCount,
        equipment_count: equipmentCount,
        service_count: serviceCount
      };
    });
  }

  /**
   * Get a single package with all items
   */
  static async getPackageWithItems(packageId: string): Promise<any> {
    // Get package details
    const { data: pkg, error: pkgError } = await supabase
      .from('service_packages')
      .select(`
        *,
        industry:industries(id, name)
      `)
      .eq('id', packageId)
      .single();

    if (pkgError) throw pkgError;

    // Get package templates with service options first
    const { data: templates, error: templatesError } = await supabase
      .from('service_package_templates')
      .select(`
        *,
        template:service_options(*)
      `)
      .eq('package_id', packageId)
      .order('is_optional')
      .order('display_order');

    if (templatesError) throw templatesError;

    // Now for each template, fetch the line items separately
    const templatesWithItems = await Promise.all(
      (templates || []).map(async (template) => {
        if (!template.template) return template;

        // Fetch service option items with line items for this template
        const { data: items, error: itemsError } = await supabase
          .from('service_option_items')
          .select(`
            *,
            line_item:line_items(
              *,
              cost_code:cost_codes(
                code,
                name,
                category
              )
            )
          `)
          .eq('service_option_id', template.template.id);

        if (!itemsError && items) {
          template.template.service_option_items = items;
        }

        return template;
      })
    );

    return {
      ...pkg,
      industry_name: pkg.industry?.name,
      templates: templatesWithItems
    };
  }

  /**
   * Create a new service package
   */
  static async createPackage(
    pkg: Omit<ServicePackage, 'id' | 'created_at' | 'updated_at'> & {
      items?: Array<{
        service_option_id: string;
        quantity: number;
        is_optional?: boolean;
        is_upgrade?: boolean;
        notes?: string;
      }>;
    }
  ): Promise<ServicePackage> {
    const { items, ...packageData } = pkg;

    // Create the package
    const { data: newPackage, error: pkgError } = await supabase
      .from('service_packages')
      .insert({
        ...packageData,
        created_by: (await supabase.auth.getUser()).data.user?.id
      })
      .select()
      .single();

    if (pkgError) throw pkgError;

    // Add items if provided
    if (items && items.length > 0) {
      const packageItems = items.map((item, index) => ({
        ...item,
        package_id: newPackage.id,
        display_order: index
      }));

      const { error: itemsError } = await supabase
        .from('service_package_items')
        .insert(packageItems);

      if (itemsError) throw itemsError;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: pkg.organization_id!,
      entityType: 'service_package',
      entityId: newPackage.id,
      action: 'created',
      description: `created ${newPackage.level} package "${newPackage.name}"`,
      metadata: {
        level: newPackage.level,
        item_count: items?.length || 0,
        base_price: newPackage.base_price
      }
    });

    return newPackage;
  }

  /**
   * Add a service option to a package
   */
  static async addOptionToPackage(
    packageId: string,
    optionId: string,
    quantity: number = 1,
    options: {
      is_optional?: boolean;
      is_upgrade?: boolean;
      notes?: string;
    } = {}
  ): Promise<void> {
    // Get next display order
    const { data: existing } = await supabase
      .from('service_package_items')
      .select('display_order')
      .eq('package_id', packageId)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0 
      ? (existing[0].display_order + 1) 
      : 0;

    // Add the item
    const { error } = await supabase
      .from('service_package_items')
      .insert({
        package_id: packageId,
        service_option_id: optionId,
        quantity,
        display_order: nextOrder,
        ...options
      });

    if (error) throw error;

    // Get names for logging
    const [{ data: pkg }, { data: option }] = await Promise.all([
      supabase.from('service_packages').select('name, organization_id').eq('id', packageId).single(),
      supabase.from('service_options').select('name').eq('id', optionId).single()
    ]);

    // Log activity
    await ActivityLogService.log({
      organizationId: pkg?.organization_id!,
      entityType: 'service_package',
      entityId: packageId,
      action: 'updated',
      description: `added option "${option?.name}" to package "${pkg?.name}"`,
      metadata: {
        option_id: optionId,
        quantity,
        is_optional: options.is_optional,
        is_upgrade: options.is_upgrade
      }
    });
  }

  /**
   * Compare service options
   */
  static async compareOptions(optionIds: string[]): Promise<ServiceOption[]> {
    const { data, error } = await supabase
      .from('service_options')
      .select(`
        *,
        service:services(name, category)
      `)
      .in('id', optionIds);

    if (error) throw error;

    return data || [];
  }

  /**
   * Get popular service options
   */
  static async getPopularOptions(organizationId: string, limit: number = 10): Promise<ServiceOption[]> {
    const { data, error } = await supabase
      .from('service_options')
      .select(`
        *,
        service:services(name, category)
      `)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .eq('is_popular', true)
      .eq('is_active', true)
      .limit(limit);

    if (error) throw error;

    return data || [];
  }

  /**
   * Search services and options
   */
  static async search(organizationId: string, query: string): Promise<{
    services: Service[];
    options: ServiceOption[];
    packages: ServicePackage[];
  }> {
    const searchTerm = `%${query}%`;

    const [services, options, packages] = await Promise.all([
      // Search services
      supabase
        .from('services')
        .select('*')
        .or(`organization_id.eq.${organizationId},organization_id.is.null`)
        .ilike('name', searchTerm),
      
      // Search options
      supabase
        .from('service_options')
        .select(`
          *,
          service:services(name, category)
        `)
        .or(`organization_id.eq.${organizationId},organization_id.is.null`)
        .ilike('name', searchTerm),
      
      // Search packages
      supabase
        .from('service_packages')
        .select('*')
        .or(`organization_id.eq.${organizationId},organization_id.is.null`)
        .ilike('name', searchTerm)
    ]);

    return {
      services: services.data || [],
      options: options.data || [],
      packages: packages.data || []
    };
  }

  /**
   * Customize a service option by creating an org-specific copy
   */
  static async customizeOption(
    optionId: string,
    organizationId: string,
    customizations: {
      swappedItems?: Record<string, string>; // Map of original item ID to replacement item ID
      removedItems?: string[]; // IDs of items to remove
      addedItems?: Array<{ line_item_id: string; quantity: number; calculation_type: string }>; // New items to add
      priceOverride?: number;
      name?: string;
    }
  ): Promise<ServiceOption> {
    // First, get the original option with all its items
    const { data: originalOption, error: fetchError } = await supabase
      .from('service_options')
      .select(`
        *,
        service_option_items (
          id,
          line_item_id,
          quantity,
          calculation_type,
          coverage_amount,
          coverage_unit,
          display_order
        )
      `)
      .eq('id', optionId)
      .single();

    if (fetchError || !originalOption) {
      throw new Error('Service option not found');
    }

    // Check if a customized version already exists
    // Using the unique constraint fields: name, service_id, organization_id
    let existingCustomQuery = supabase
      .from('service_options')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('name', customizations.name || originalOption.name);
    
    // Handle null service_id properly
    if (originalOption.service_id) {
      existingCustomQuery = existingCustomQuery.eq('service_id', originalOption.service_id);
    } else {
      existingCustomQuery = existingCustomQuery.is('service_id', null);
    }
    
    const { data: existingCustom } = await existingCustomQuery.single();

    if (existingCustom) {
      // Update existing customization
      const { data: updated, error: updateError } = await supabase
        .from('service_options')
        .update({
          attributes: {
            ...(originalOption.attributes || {}),
            parent_option_id: optionId,
            custom_items: customizations.swappedItems || {},
            customized_at: new Date().toISOString()
          },
          price: customizations.priceOverride || originalOption.price,
          name: customizations.name || originalOption.name,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCustom.id)
        .select()
        .single();

      if (updateError) throw updateError;
      
      // Delete existing items for this customization
      const { error: deleteError } = await supabase
        .from('service_option_items')
        .delete()
        .eq('service_option_id', existingCustom.id);
        
      if (deleteError) throw deleteError;
      
      // Re-create items with customizations
      if (originalOption.service_option_items && originalOption.service_option_items.length > 0) {
        const removedSet = new Set(customizations.removedItems || []);
        const customItems = originalOption.service_option_items
          .filter(item => !removedSet.has(item.id))
          .map(item => ({
            service_option_id: existingCustom.id,
            line_item_id: customizations.swappedItems?.[item.id] || item.line_item_id,
            quantity: item.quantity,
            calculation_type: item.calculation_type,
            coverage_amount: item.coverage_amount,
            coverage_unit: item.coverage_unit,
            display_order: item.display_order
          }));

        // Add new items
        if (customizations.addedItems && customizations.addedItems.length > 0) {
          const newItems = customizations.addedItems.map((item, index) => ({
            service_option_id: existingCustom.id,
            line_item_id: item.line_item_id,
            quantity: item.quantity,
            calculation_type: item.calculation_type,
            coverage_amount: null,
            coverage_unit: null,
            display_order: customItems.length + index + 1
          }));
          customItems.push(...newItems);
        }

        if (customItems.length > 0) {
          const { error: itemsError } = await supabase
            .from('service_option_items')
            .insert(customItems);

          if (itemsError) throw itemsError;
        }
      }
      
      return updated;
    }

    // Create new customized version
    // Extract service_option_items from originalOption before spreading
    const { service_option_items, ...optionWithoutItems } = originalOption;
    
    const { data: customOption, error: createError } = await supabase
      .from('service_options')
      .insert({
        ...optionWithoutItems,
        id: undefined, // Let DB generate new ID
        organization_id: organizationId,
        attributes: {
          ...originalOption.attributes,
          parent_option_id: optionId,
          custom_items: customizations.swappedItems || {},
          customized_at: new Date().toISOString()
        },
        price: customizations.priceOverride || originalOption.price,
        name: customizations.name || originalOption.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) throw createError;

    // Copy service option items with any swaps and handle removals
    if (originalOption.service_option_items && originalOption.service_option_items.length > 0) {
      // Filter out removed items and apply swaps
      const removedSet = new Set(customizations.removedItems || []);
      const customItems = originalOption.service_option_items
        .filter(item => !removedSet.has(item.id))
        .map(item => ({
          service_option_id: customOption.id,
          line_item_id: customizations.swappedItems?.[item.id] || item.line_item_id,
          quantity: item.quantity,
          calculation_type: item.calculation_type,
          coverage_amount: item.coverage_amount,
          coverage_unit: item.coverage_unit,
          display_order: item.display_order
        }));

      // Add new items
      if (customizations.addedItems && customizations.addedItems.length > 0) {
        const newItems = customizations.addedItems.map((item, index) => ({
          service_option_id: customOption.id,
          line_item_id: item.line_item_id,
          quantity: item.quantity,
          calculation_type: item.calculation_type,
          coverage_amount: null,
          coverage_unit: null,
          display_order: customItems.length + index + 1
        }));
        customItems.push(...newItems);
      }

      if (customItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('service_option_items')
          .insert(customItems);

        if (itemsError) throw itemsError;
      }
    }

    // Log the customization
    await ActivityLogService.log({
      action: 'updated',
      entityType: 'service_option',
      entityId: customOption.id,
      description: `Customized ${customOption.name}`,
      metadata: {
        original_option_id: optionId,
        customizations
      },
      organizationId
    });

    return customOption;
  }
}