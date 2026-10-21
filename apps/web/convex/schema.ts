import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/** A lead's job size and kind (see lib/auction.ts for what they mean). */
export const jobSize = v.union(v.literal("small"), v.literal("medium"), v.literal("large"));
export const jobKind = v.union(v.literal("new"), v.literal("remodel"), v.literal("repair"));

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
  // The client opened the estimate's link.
  v.literal("opened"),
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

// Pipeline stages, in order. "quoted" is shown as "Estimate Sent".
export const leadStatus = v.union(
  v.literal("new"),
  v.literal("no_answer"),
  v.literal("contacted"),
  v.literal("scheduled"),
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
  // The price book's floor and ceiling when the item was added. The unit
  // price is never below the red line.
  redLinePrice: v.optional(v.number()),
  capPrice: v.optional(v.number()),
  costCode: v.optional(v.string()),
  // The price book cost code's name (e.g. "Interior Painting"), for category totals.
  category: v.optional(v.string()),
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

// The parts of the contract the user writes. Everything else on the
// contract (client, items, totals) comes from the estimate.
export const contractTerms = v.object({
  startDate: v.optional(v.string()),
  completionDate: v.optional(v.string()),
  paymentTerms: v.optional(v.string()),
  warrantyPeriod: v.optional(v.string()),
  workDescription: v.optional(v.string()),
  propertyAddress: v.optional(v.string()),
});

// A design file (image or PDF) attached to the estimate, shown on the
// contract under "Agreed Design".
export const estimateDesign = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  contentType: v.optional(v.string()),
  url: v.string(),
});

// The contract as agreed, kept when the estimate is accepted so later
// estimate changes don't alter it (they become a change order instead).
export const contractSnapshot = v.object({
  client: v.optional(
    v.object({
      name: v.string(),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
    }),
  ),
  items: v.array(documentItem),
  subtotal: v.number(),
  taxAmount: v.number(),
  totalAmount: v.number(),
  terms: v.optional(contractTerms),
  design: v.optional(estimateDesign),
});

export const estimateFields = {
  ...documentFields,
  estimateNumber: v.string(),
  status: estimateStatus,
  expiryDate: v.optional(v.string()),
  clientSignature: v.optional(v.string()),
  signedAt: v.optional(v.string()),
  contractTerms: v.optional(contractTerms),
  contractLockedAt: v.optional(v.string()),
  contractSnapshot: v.optional(contractSnapshot),
  design: v.optional(estimateDesign),
  // The secret in the estimate's client link (/share/estimate/:token).
  shareToken: v.optional(v.string()),
  firstOpenedAt: v.optional(v.string()),
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
  // Town the job is in. Filled from the form, the address or a map lookup, or set by hand.
  city: v.optional(v.string()),
  // Trade slug (industries.slug).
  jobType: v.optional(v.string()),
  source: v.optional(v.string()),
  estimatedValue: v.optional(v.number()),
  followUpDate: v.optional(v.string()),
  // When the estimate visit is booked (ISO date and time).
  appointmentAt: v.optional(v.string()),
  notes: v.optional(v.string()),
  status: leadStatus,
  lostReason: v.optional(v.string()),
};

export const marketplaceLeadStatus = v.union(
  v.literal("available"),
  v.literal("bidding"),
  // Nobody bought it in a week: in the Older leads pool, for companies on
  // the monthly plan to claim.
  v.literal("older"),
  // A month old; out of every list.
  v.literal("archived"),
  v.literal("assigned"),
  v.literal("credited"),
);

export const planStatus = v.union(
  v.literal("trial"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("cancelled"),
);

/** A company's monthly plan, paid from its lead balance. */
export const planFields = v.object({
  status: planStatus,
  monthlyCents: v.number(),
  claimsIncluded: v.number(),
  extraClaimCents: v.number(),
  // The current paid (or trial) period.
  periodStart: v.string(),
  // When the next fee is due; on a trial, when it ends.
  nextChargeAt: v.string(),
  claimsThisPeriod: v.number(),
});

export const walletTransactionType = v.union(
  v.literal("top_up"),
  v.literal("bonus"),
  v.literal("lead_charge"),
  v.literal("credit"),
  v.literal("adjustment"),
  // The monthly plan fee.
  v.literal("plan"),
);

export const expenseStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("paid"),
  v.literal("rejected"),
);

// Money spent on a job (or on the business, without a project).
export const expenseFields = {
  projectId: v.optional(v.id("projects")),
  description: v.string(),
  amount: v.number(),
  // Materials, Labor, Equipment, Service, Permits, Subcontractor, Disposal or Other.
  category: v.string(),
  vendor: v.optional(v.string()),
  // yyyy-mm-dd
  date: v.string(),
  status: expenseStatus,
  costCodeId: v.optional(v.id("costCodes")),
  receiptUrl: v.optional(v.string()),
  notes: v.optional(v.string()),
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

  organizations: defineTable({
    ...organizationFields,
    // Lead Market. Set by the server only: not in organizationFields, so
    // organizations.update can't touch them.
    walletBalanceCents: v.optional(v.number()),
    // The company's trades (slugs): what it works in and buys leads for.
    // The one list bids, the Marketplace, the Vault and the Price Book read;
    // the company sets it (industries.setForOrganization).
    leadTrades: v.optional(v.array(v.string())),
    // The monthly plan (Estimates, Price Book, Projects, Older leads).
    plan: v.optional(planFields),
    // Demo company added from the Lead Market; removable in one click.
    isSample: v.optional(v.boolean()),
    ...timestamps,
  }).index("by_slug", ["slug"]),

  // Lead Market inbox: leads the platform owns until they're sold to one company.
  marketplaceLeads: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    county: v.optional(v.string()),
    jobType: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
    // How big the job is and what kind; the size scales the price and
    // decides which standing bids compete for it.
    size: v.optional(jobSize),
    kind: v.optional(jobKind),
    status: marketplaceLeadStatus,
    // Legacy: set while a lead sat in a timed bidding round.
    round: v.optional(v.object({ opensAt: v.string(), closesAt: v.string() })),
    priceCents: v.optional(v.number()),
    assignedOrganizationId: v.optional(v.id("organizations")),
    assignedAt: v.optional(v.string()),
    orgLeadId: v.optional(v.id("leads")),
    isSample: v.optional(v.boolean()),
    // A person confirmed the lead with the homeowner (server-set by
    // marketplace.verifyLead): when, what they said, and who called.
    verified: v.optional(
      v.object({
        at: v.string(),
        note: v.optional(v.string()),
        by: v.id("users"),
      }),
    ),
    // The price schedule it was listed with (see lib/auction.ts). Leads
    // from before schedules existed have none and use their trade's prices.
    auction: v.optional(
      v.object({
        startCents: v.number(),
        floorCents: v.number(),
        dropCents: v.number(),
        dropEveryMs: v.number(),
        listedAt: v.string(),
      }),
    ),
    createdBy: v.id("users"),
    ...timestamps,
  })
    .index("by_status", ["status"])
    .index("by_organization", ["assignedOrganizationId"]),

  // A company's standing offer on a lead: it buys automatically once the
  // price drops to `maxCents`, unless someone buys first.
  leadBids: defineTable({
    marketplaceLeadId: v.id("marketplaceLeads"),
    organizationId: v.id("organizations"),
    /**
     * A buy order in the Marketplace (absent or "order"), a standing bid
     * matched to a lead the moment it was listed ("award"), or, legacy, a
     * bid in a timed round ("round").
     */
    kind: v.optional(
      v.union(v.literal("order"), v.literal("award"), v.literal("round")),
    ),
    maxCents: v.number(),
    raisedAt: v.optional(v.string()),
    status: v.union(
      v.literal("open"),
      v.literal("filled"),
      v.literal("lost"),
      v.literal("cancelled"),
    ),
    /** Why it was lost, in plain words. */
    outcome: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.string(),
    resolvedAt: v.optional(v.string()),
  })
    .index("by_lead", ["marketplaceLeadId"])
    .index("by_organization_and_status", ["organizationId", "status"]),

  // "Landscaping leads in Midland County: I'll pay $250." Entered for the
  // company automatically whenever such a lead opens a bidding round.
  standingBids: defineTable({
    organizationId: v.id("organizations"),
    county: v.string(),
    jobType: v.string(),
    amountCents: v.number(),
    /** Only for jobs of this size; a bid with none covers every size. */
    size: v.optional(jobSize),
    createdBy: v.id("users"),
    createdAt: v.string(),
    updatedAt: v.string(),
    /** Added by "Add demo bids"; "Remove demo data" takes it out. */
    isSample: v.optional(v.boolean()),
    /** Left over from a pause feature that was removed; ignored, kept so old rows still validate. */
    paused: v.optional(v.boolean()),
    /** Led its county and trade when standing was last worked out (lib/standing.ts). */
    wasLeading: v.optional(v.boolean()),
    /** When another company's bid took the lead from it; cleared when it leads again. */
    outbidAt: v.optional(v.string()),
    /** When the company last saw its bids, so an outbid is only news once. */
    outbidSeenAt: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_county_and_type", ["county", "jobType"]),

  // Building permits pulled from a city's public permit feed (lib/permits.ts),
  // mapped to the trades that do that work. Public record: address and work,
  // no contact details.
  permits: defineTable({
    source: v.string(),
    permitNumber: v.string(),
    name: v.string(),
    workClass: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    address: v.optional(v.string()),
    county: v.string(),
    city: v.string(),
    appliedAt: v.string(),
    issuedAt: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    residential: v.optional(v.boolean()),
    trades: v.array(v.string()),
    url: v.optional(v.string()),
    importedAt: v.string(),
  })
    .index("by_permit_number", ["permitNumber"])
    .index("by_county_and_applied", ["county", "appliedAt"]),

  // How each permit feed's last sync went.
  permitSources: defineTable({
    source: v.string(),
    syncedAt: v.string(),
    lastAppliedAt: v.optional(v.string()),
    fetched: v.number(),
    added: v.number(),
    updated: v.number(),
    error: v.optional(v.string()),
  }).index("by_source", ["source"]),

  // Legacy: the round length from when leads sat in timed bidding rounds.
  // Kept so an existing row still deploys; nothing reads it.
  marketSettings: defineTable({
    roundMinutes: v.number(),
    updatedAt: v.string(),
  }),

  // Every change to a company's balance, never edited. walletBalanceCents
  // on the organization is the running total, updated in the same mutation.
  walletTransactions: defineTable({
    organizationId: v.id("organizations"),
    type: walletTransactionType,
    amountCents: v.number(),
    balanceAfterCents: v.number(),
    marketplaceLeadId: v.optional(v.id("marketplaceLeads")),
    method: v.optional(v.string()),
    note: v.optional(v.string()),
    /** Demo funds; reversed when demo data is removed. */
    isSample: v.optional(v.boolean()),
    createdBy: v.id("users"),
    createdAt: v.string(),
  }).index("by_organization", ["organizationId"]),

  // What a lead costs, by trade (jobType "default" covers the rest).
  // What a trade's leads cost: `priceCents` is the start price; the rest
  // of the drop schedule is optional (see lib/auction.ts for defaults).
  leadPrices: defineTable({
    jobType: v.string(),
    priceCents: v.number(),
    floorCents: v.optional(v.number()),
    dropCents: v.optional(v.number()),
    dropEveryMinutes: v.optional(v.number()),
    // On the "default" row only: how much a lead's price scales by job size.
    sizeMultipliers: v.optional(
      v.object({ small: v.number(), medium: v.number(), large: v.number() }),
    ),
    updatedAt: v.string(),
  }).index("by_job_type", ["jobType"]),

  // A link a company pays through to load its lead balance. Paying only
  // records the request; the balance loads when a platform admin confirms it.
  // No card details are ever stored.
  fundingRequests: defineTable({
    organizationId: v.id("organizations"),
    token: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("cancelled"),
    ),
    amountCents: v.optional(v.number()),
    bonusCents: v.optional(v.number()),
    method: v.optional(v.union(v.literal("card"), v.literal("apple_pay"))),
    payerName: v.optional(v.string()),
    payerEmail: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.string(),
    submittedAt: v.optional(v.string()),
    confirmedAt: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"]),

  // A company set up for someone who hasn't signed up yet; they join it on signup.
  companyInvites: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    createdAt: v.string(),
    acceptedAt: v.optional(v.string()),
  }).index("by_email", ["email"]),

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
    .index("by_client", ["clientId"])
    .index("by_share_token", ["shareToken"]),

  // Invoicing was removed from the app (no payments are taken here). The table
  // stays defined so any rows saved earlier don't block a deploy; nothing reads
  // or writes it any more.
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
    // Example data added from the empty Leads page; removable in one click.
    isSample: v.optional(v.boolean()),
    // When the city was last worked out automatically, so it isn't looked up again.
    cityCheckedAt: v.optional(v.string()),
    // When the company last called, texted or noted the lead, and how many
    // calls and texts so far (server-set by leads.logContact).
    lastContactAt: v.optional(v.string()),
    contacts: v.optional(v.number()),
    texts: v.optional(v.number()),
    // County, as the Lead Market knew it when it sold the lead (server-set).
    // Leads without one get it from their town when listed.
    county: v.optional(v.string()),
    // Carried over from the Lead Market: when FieldQuote confirmed the lead
    // with the homeowner, and what they said.
    verified: v.optional(
      v.object({ at: v.string(), note: v.optional(v.string()) }),
    ),
    // The job size and kind the Lead Market listed it with.
    size: v.optional(jobSize),
    kind: v.optional(jobKind),
    // Bought from the Lead Market (server-set, not in leadFields).
    marketplaceLeadId: v.optional(v.id("marketplaceLeads")),
    pricePaidCents: v.optional(v.number()),
    assignedAt: v.optional(v.string()),
    // How it reached this company: a standing bid won it, a buy order
    // filled, they bought it in the Marketplace, or an admin sent it.
    wonVia: v.optional(
      v.union(
        v.literal("bid"),
        v.literal("order"),
        v.literal("buy"),
        v.literal("sent"),
        v.literal("claim"),
      ),
    ),
    creditRequest: v.optional(
      v.object({
        reason: v.string(),
        note: v.optional(v.string()),
        requestedAt: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("approved"),
          v.literal("denied"),
        ),
        reviewedAt: v.optional(v.string()),
      }),
    ),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  }).index("by_organization", ["organizationId"]),

  expenses: defineTable({
    ...expenseFields,
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  })
    .index("by_organization", ["organizationId"])
    .index("by_project", ["projectId"]),

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

  // Old home of a company's Price Book trade picks; folded into
  // organizations.leadTrades by industries.mergeChosenTrades and no longer
  // read. Kept so rows still validate until the merge has run.
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
    .index("by_organization_and_resource_type", [
      "organizationId",
      "resourceType",
    ]),
});
