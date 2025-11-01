import mongoose, { Schema, Document } from 'mongoose';

export interface ILineItem extends Document {
  _id: string;
  user_id: string;
  organization_id?: string; // NULL for shared industry items, org ID for custom
  name: string;
  description?: string;
  
  // Cap/RedLine Pricing System 🎯
  base_price: number; // Standard/default price - middle of range
  red_line_price?: number; // MINIMUM price - never go below
  cap_price?: number; // MAXIMUM price - never exceed
  pricing_factors?: Record<string, any>; // Factors: region, complexity, etc.
  
  // Metadata
  unit: string;
  cost_code_id: string; // Reference to cost code
  service_category?: string;
  
  // Organization overrides
  has_override?: boolean;
  markup_percentage?: number;
  margin_percentage?: number;
  price_position?: number; // 0-1, position between red line and cap
  applied_mode_id?: string;
  
  // Package/Bundle support
  is_package?: boolean;
  is_bundle?: boolean;
  package_items?: any[];
  bundle_items?: any[];
  bundle_discount_percentage?: number;
  
  // Additional fields
  vendor_id?: string;
  sku?: string;
  materials_list?: string[];
  estimated_hours?: number;
  skill_level?: string;
  warranty_months?: number;
  display_order?: number;
  attributes?: Record<string, any>;
  
  // Status
  is_active: boolean;
  is_custom?: boolean;
  favorite?: boolean;
  status?: string;
  is_taxable?: boolean;
  
  // Migration tracking
  source_service_option_id?: string;
  source_service_package_id?: string;
  
  created_at: Date;
  updated_at: Date;
}

const LineItemSchema = new Schema<ILineItem>({
  user_id: { type: String, required: true, index: true },
  organization_id: { type: String, index: true }, // Can be null for shared items
  name: { type: String, required: true },
  description: { type: String },
  
  // Pricing - RedCap's core feature! 🎯
  base_price: { type: Number, required: true },
  red_line_price: { type: Number }, // Minimum
  cap_price: { type: Number }, // Maximum
  pricing_factors: { type: Schema.Types.Mixed, default: {} },
  
  // Core fields
  unit: { type: String, required: true },
  cost_code_id: { type: String, required: true, index: true },
  service_category: { type: String, index: true },
  
  // Pricing overrides
  has_override: { type: Boolean, default: false },
  markup_percentage: { type: Number },
  margin_percentage: { type: Number },
  price_position: { type: Number }, // 0 = red line, 1 = cap
  applied_mode_id: { type: String },
  
  // Packages/Bundles
  is_package: { type: Boolean, default: false },
  is_bundle: { type: Boolean, default: false },
  package_items: [Schema.Types.Mixed],
  bundle_items: [Schema.Types.Mixed],
  bundle_discount_percentage: { type: Number },
  
  // Additional metadata
  vendor_id: { type: String },
  sku: { type: String },
  materials_list: [String],
  estimated_hours: { type: Number },
  skill_level: { type: String },
  warranty_months: { type: Number },
  display_order: { type: Number },
  attributes: { type: Schema.Types.Mixed, default: {} },
  
  // Status flags
  is_active: { type: Boolean, default: true },
  is_custom: { type: Boolean, default: false },
  favorite: { type: Boolean, default: false },
  status: { type: String },
  is_taxable: { type: Boolean, default: true },
  
  // Migration fields
  source_service_option_id: { type: String },
  source_service_package_id: { type: String },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance
LineItemSchema.index({ organization_id: 1, is_active: 1 });
LineItemSchema.index({ cost_code_id: 1, is_active: 1 });
LineItemSchema.index({ service_category: 1, is_active: 1 });
LineItemSchema.index({ name: 'text', description: 'text' }); // Text search

// Virtual for calculated price based on position
LineItemSchema.virtual('calculated_price').get(function() {
  if (this.price_position && this.red_line_price && this.cap_price) {
    return this.red_line_price + (this.cap_price - this.red_line_price) * this.price_position;
  }
  return this.base_price;
});

export const LineItem = mongoose.model<ILineItem>('LineItem', LineItemSchema);

