import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * FieldQuote data model.
 *
 * Field names deliberately match the old MongoDB/Express API (camelCase for
 * estimates/invoices/clients/projects, snake_case for the price book) so the
 * existing React screens keep working unchanged on top of src/lib/api.ts.
 * Dates the old API returned as ISO strings are stored as ISO strings.
 */

export const userRole = v.union(
  v.literal("user"),
  v.literal("admin"),
  v.literal("super_admin"),
);

export const memberRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

export const estimateStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("expired"),
);

export const invoiceStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("paid"),
  v.literal("overdue"),
  v.literal("cancelled"),
);

export const projectStatus = v.union(
  v.literal("planning"),
  v.literal("in_progress"),
  v.literal("on_hold"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const leadStatus = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("quoted"),
  v.literal("won"),
  v.literal("lost"),
);

export const documentItem = v.object({
  _id: v.string(),
  workPackItemId: v.optional(v.string()),
  productId: v.optional(v.string()),
  description: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
  totalPrice: v.number(),
  costCode: v.optional(v.string()),
  displayOrder: v.number(),
});

// Writable fields per table. Mutations accept loose objects from the
// existing UI and keep only these keys (the old API silently dropped
// unknown keys too), then the schema validates the types.
export const organizationFields = {
  name: v.string(),
  slug: v.string(),
  industryId: v.optional(v.string()),
  description: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  website: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  country: v.optional(v.string()),
  settings: v.optional(v.any()),
  isActive: v.boolean(),
};

export const clientFields = {
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  companyName: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const projectFields = {
  clientId: v.optional(v.id("clients")),
  name: v.string(),
  description: v.optional(v.string()),
  status: projectStatus,
  budget: v.optional(v.number()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  category: v.optional(v.string()),
};

const documentFields = {
  clientId: v.optional(v.id("clients")),
  projectId: v.optional(v.id("projects")),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  issueDate: v.string(),
  subtotal: v.number(),
  taxRate: v.number(),
  taxAmount: v.number(),
  totalAmount: v.number(),
  notes: v.optional(v.string()),
  terms: v.optional(v.string()),
  items: v.array(documentItem),
};

export const estimateFields = {
  ...documentFields,
  estimateNumber: v.string(),
  status: estimateStatus,
  expiryDate: v.optional(v.string()),
  clientSignature: v.optional(v.string()),
  signedAt: v.optional(v.string()),
};

export const invoiceFields = {
  ...documentFields,
  estimateId: v.optional(v.id("estimates")),
  invoiceNumber: v.string(),
  status: invoiceStatus,
  dueDate: v.optional(v.string()),
  paidDate: v.optional(v.string()),
  amountPaid: v.number(),
};

export const lineItemFields = {
  name: v.string(),
  description: v.optional(v.string()),
  base_price: v.number(),
  red_line_price: v.optional(v.number()),
  cap_price: v.optional(v.number()),
  pricing_factors: v.optional(v.any()),
  unit: v.string(),
  cost_code_id: v.id("costCodes"),
  service_category: v.optional(v.string()),
  has_override: v.optional(v.boolean()),
  markup_percentage: v.optional(v.number()),
  margin_percentage: v.optional(v.number()),
  price_position: v.optional(v.number()),
  applied_mode_id: v.optional(v.string()),
  is_package: v.optional(v.boolean()),
  is_bundle: v.optional(v.boolean()),
  package_items: v.optional(v.array(v.any())),
  bundle_items: v.optional(v.array(v.any())),
  bundle_discount_percentage: v.optional(v.number()),
  vendor_id: v.optional(v.string()),
  sku: v.optional(v.string()),
  materials_list: v.optional(v.array(v.string())),
  estimated_hours: v.optional(v.number()),
  skill_level: v.optional(v.string()),
  warranty_months: v.optional(v.number()),
  display_order: v.optional(v.number()),
  attributes: v.optional(v.any()),
  is_active: v.boolean(),
  is_custom: v.optional(v.boolean()),
  favorite: v.optional(v.boolean()),
  status: v.optional(v.string()),
  is_taxable: v.optional(v.boolean()),
  source_service_option_id: v.optional(v.string()),
  source_service_package_id: v.optional(v.string()),
};

export const costCodeFields = {
  code: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  unit: v.optional(v.string()),
  industry_id: v.optional(v.string()),
  parent_id: v.optional(v.string()),
  is_active: v.boolean(),
  display_order: v.optional(v.number()),
};

export const leadFields = {
  name: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  // Trade slug (industries.slug).
  jobType: v.optional(v.string()),
  source: v.optional(v.string()),
  estimatedValue: v.optional(v.number()),
  followUpDate: v.optional(v.string()),
  notes: v.optional(v.string()),
  status: leadStatus,
  lostReason: v.optional(v.string()),
};

export const pricingAdjustments = v.object({
  all: v.optional(v.number()),
  labor: v.optional(v.number()),
  materials: v.optional(v.number()),
  services: v.optional(v.number()),
  installation: v.optional(v.number()),
  equipment: v.optional(v.number()),
  subcontractor: v.optional(v.number()),
});

export const pricingModeFields = {
  name: v.string(),
  icon: v.optional(v.string()),
  description: v.optional(v.string()),
  adjustments: pricingAdjustments,
  is_active: v.boolean(),
};

const timestamps = {
  createdAt: v.string(),
  updatedAt: v.string(),
};

const snakeTimestamps = {
  created_at: v.string(),
  updated_at: v.string(),
};

export default defineSchema({
  ...authTables,

  // Convex Auth's users table, plus an app-wide role.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(userRole),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  organizations: defineTable({ ...organizationFields, ...timestamps })
    .index("by_slug", ["slug"]),

  // Which users belong to which organizations (one user can be in several).
  memberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: memberRole,
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_user", ["organizationId", "userId"]),

  clients: defineTable({
    ...clientFields,
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  }).index("by_organization", ["organizationId"]),

  projects: defineTable({
    ...projectFields,
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  })
    .index("by_organization", ["organizationId"])
    .index("by_client", ["clientId"]),

  estimates: defineTable({
    ...estimateFields,
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  })
    .index("by_organization_and_issue_date", ["organizationId", "issueDate"])
    .index("by_client", ["clientId"]),

  invoices: defineTable({
    ...invoiceFields,
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  })
    .index("by_organization_and_issue_date", ["organizationId", "issueDate"])
    .index("by_client", ["clientId"]),

  // Price book. organization_id is absent for shared industry items.
  lineItems: defineTable({
    ...lineItemFields,
    organization_id: v.optional(v.id("organizations")),
    // Who created it; absent for seeded shared catalog items.
    user_id: v.optional(v.id("users")),
    // "starter" for rows loaded by seed:catalog (replaceable by a real export).
    catalog_source: v.optional(v.string()),
    ...snakeTimestamps,
  })
    .index("by_organization", ["organization_id"])
    .index("by_cost_code", ["cost_code_id"]),

  // Cost codes. organization_id is absent for shared industry codes.
  costCodes: defineTable({
    ...costCodeFields,
    organization_id: v.optional(v.id("organizations")),
    catalog_source: v.optional(v.string()),
    ...snakeTimestamps,
  })
    .index("by_organization", ["organization_id"])
    .index("by_industry", ["industry_id"]),

  // People who asked for a quote, from first call to won or lost.
  leads: defineTable({
    ...leadFields,
    clientId: v.optional(v.id("clients")),
    estimateId: v.optional(v.id("estimates")),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  }).index("by_organization", ["organizationId"]),

  // Trades. Cost codes refer to them by slug (costCodes.industry_id).
  industries: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    display_order: v.number(),
    is_active: v.boolean(),
    catalog_source: v.optional(v.string()),
    ...snakeTimestamps,
  }).index("by_slug", ["slug"]),

  // Trades a company works in (by industry slug).
  organizationIndustries: defineTable({
    organizationId: v.id("organizations"),
    industrySlug: v.string(),
    createdAt: v.string(),
  }).index("by_organization", ["organizationId"]),

  // Pricing modes. Presets have is_preset true and no organization_id.
  pricingModes: defineTable({
    ...pricingModeFields,
    is_preset: v.boolean(),
    usage_count: v.number(),
    successful_estimates: v.number(),
    total_estimates: v.number(),
    organization_id: v.optional(v.id("organizations")),
    ...snakeTimestamps,
  })
    .index("by_preset", ["is_preset"])
    .index("by_organization", ["organization_id"]),

  activityLogs: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.any()),
    metadata: v.optional(v.any()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_resource_type", ["organizationId", "resourceType"]),
});
