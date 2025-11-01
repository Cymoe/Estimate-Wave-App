export interface Client {
  id: string;
  company_name: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  created_at?: string;
  discount_percentage?: number; // Default discount percentage for this client (0-100)
}

// Line Items (standard items tied to cost codes)
export interface LineItem {
  id: string;
  user_id: string;
  organization_id?: string; // NULL for shared industry-standard items, organization ID for custom items
  name: string;
  description?: string;
  price: number; // Legacy field - will be base_price after migration
  base_price?: number; // Standard/default price - middle of range
  red_line_price?: number; // Minimum price threshold - never go below
  cap_price?: number; // Maximum price ceiling - never exceed
  pricing_factors?: Record<string, any>; // Factors affecting price: region, complexity, etc.
  unit: string;
  cost_code_id: string; // Required - line items must be tied to a cost code
  vendor_id?: string;
  favorite?: boolean;
  status?: string;
  is_active?: boolean;
  is_custom?: boolean; // Indicates if this is a custom price override
  service_category?: string; // Service category for grouping (e.g., "Door Installation", "Finish Carpentry")
  is_package?: boolean; // Legacy - use is_bundle instead
  package_items?: any; // Legacy - use bundle_items instead
  is_bundle?: boolean; // Whether this is a bundle of multiple items
  bundle_items?: any; // JSONB field for bundle contents
  bundle_discount_percentage?: number; // Discount percentage for bundles
  source_service_option_id?: string; // ID of original service option (for migration)
  source_service_package_id?: string; // ID of original service package (for migration)
  display_order?: number; // Order for display in lists
  warranty_months?: number;
  skill_level?: string;
  estimated_hours?: number;
  materials_list?: string[];
  attributes?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  cost_code?: {
    id?: string;
    name: string;
    code: string;
    category?: string;
  };
  // Price override fields
  has_override?: boolean; // True if this org has an override price
  markup_percentage?: number; // Markup percentage for this line item
  margin_percentage?: number; // Calculated margin percentage for display
  applied_mode_id?: string; // ID of the pricing mode that was applied
  applied_mode_name?: string; // Name of the pricing mode that was applied
  pricing_source?: 'organization' | 'project'; // Indicates where the pricing came from
  price_position?: number; // Position within price range (0.0 = red_line, 1.0 = cap)
}

// Product Assemblies (bundles made of line items - formerly bundled products)
export interface ProductAssembly {
  id: string;
  user_id: string;
  organization_id?: string;
  name: string;
  description?: string;
  base_price: number;
  unit: string;
  industry_id?: string;
  category?: string;
  vendor_id?: string;
  category_id?: string;
  favorite?: boolean;
  status?: string;
  parent_product_id?: string;
  variant_name?: string;
  created_at?: string;
  updated_at?: string;
  line_items?: AssemblyLineItem[];
}

// Junction table for assembly components
export interface AssemblyLineItem {
  id: string;
  assembly_id: string;
  line_item_id: string;
  quantity: number;
  unit?: string;
  price_override?: number;
  display_order?: number;
  is_optional?: boolean;
  created_at?: string;
  updated_at?: string;
  line_item?: LineItem;
}

// Pricing Strategy for dynamic price positioning
export interface PricingStrategy {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  price_position: number; // 0.0 = red_line, 0.5 = base, 1.0 = cap
  factors?: Record<string, any>; // Adjustment factors: urgency, season, customer_type, etc.
  is_active: boolean;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Legacy Product interface (for backward compatibility during migration)
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  created_at?: string;
}

export interface InvoiceItem {
  product_id?: string; // Legacy - for backward compatibility
  line_item_id?: string; // References line_items table
  assembly_id?: string; // References product_assemblies table
  quantity: number;
  price: number;
  description: string;
}

// Industry classification for organizing business data
export interface Industry {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  display_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: string;
  number: string;
  client_id: string;
  date: string;
  due_date: string;
  items: InvoiceItem[];
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  created_at?: string;
}