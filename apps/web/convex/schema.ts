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
  // Runs the Lead Market day to day (intake, confirming, sending): no company of their own.
  v.literal("staff"),
  v.literal("super_admin"),
);

/** Where an intake lead came from and where it is in the queue. */
export const intakeSource = v.union(v.literal("meta"), v.literal("call"), v.literal("manual"), v.literal("api"));
export const intakeStatus = v.union(v.literal("new"), v.literal("working"), v.literal("confirmed"), v.literal("closed"));
export const intakeDisposition = v.union(
  v.literal("duplicate"),
  v.literal("not_reached"),
  v.literal("out_of_area"),
  v.literal("renter"),
  v.literal("wrong_trade"),
  v.literal("not_interested"),
  v.literal("bad_number"),
  v.literal("other"),
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
    // Where lead alerts are texted (E.164). Set in Company settings → Notifications.
    mobile: v.optional(v.string()),
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
    status: marketplaceLeadStatus,
    // Legacy: set while a lead sat in a timed bidding round.
    round: v.optional(v.object({ opensAt: v.string(), closesAt: v.string() })),
    priceCents: v.optional(v.number()),
    assignedOrganizationId: v.optional(v.id("organizations")),
    assignedAt: v.optional(v.string()),
    acknowledgedAt: v.optional(v.string()),
    /** When staff were emailed that nobody had tapped "Got it" (once per lead). */
    escalatedAt: v.optional(v.string()),
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
    /** When the amount last changed: a tie at one amount goes to whoever got there first. */
    amountSetAt: v.optional(v.string()),
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
    updatedAt: v.string(),
  }).index("by_job_type", ["jobType"]),

  // A link a company pays through to load its lead balance. The payment
  // itself happens on Stripe Checkout; Stripe's webhook loads the balance.
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
    method: v.optional(v.string()),
    payerName: v.optional(v.string()),
    payerEmail: v.optional(v.string()),
    // The Stripe Checkout session the payer was sent to, and what it paid with.
    stripeSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    paidAt: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.string(),
    submittedAt: v.optional(v.string()),
    confirmedAt: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_stripe_session", ["stripeSessionId"]),

  // One row per payment that landed on a balance, keyed by the Stripe
  // session (or a play-money marker). The webhook credits a session once,
  // for the amount Stripe says was paid, however many sessions a link saw.
  fundingPayments: defineTable({
    requestId: v.id("fundingRequests"),
    organizationId: v.id("organizations"),
    sessionId: v.string(),
    paymentIntentId: v.optional(v.string()),
    amountCents: v.number(),
    bonusCents: v.number(),
    method: v.string(),
    createdAt: v.string(),
  })
    .index("by_session", ["sessionId"])
    .index("by_request", ["requestId"]),

  // A company set up for someone who hasn't signed up yet; they join it on signup.
  companyInvites: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    createdAt: v.string(),
    acceptedAt: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // A lead on its way in: from a Facebook form, a call or a staff entry.
  // Nothing is listed (and sold) until staff confirm it with the homeowner.
  intakeLeads: defineTable({
    source: intakeSource,
    status: intakeStatus,
    disposition: v.optional(intakeDisposition),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    // Ten digits, for finding the same homeowner twice.
    phoneNormalized: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    zip: v.optional(v.string()),
    // The county the homeowner gave, normalized; and the one the ad targeted.
    county: v.optional(v.string()),
    countyFromCampaign: v.optional(v.string()),
    jobType: v.optional(v.string()),
    scope: v.optional(v.string()),
    timeline: v.optional(v.string()),
    isOwner: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    // Meta's leadgen id (or any outside id) so the same lead isn't taken twice.
    externalId: v.optional(v.string()),
    campaignName: v.optional(v.string()),
    adsetName: v.optional(v.string()),
    adName: v.optional(v.string()),
    formId: v.optional(v.string()),
    // What the homeowner agreed to on the form, kept as proof.
    consent: v.optional(
      v.object({ text: v.optional(v.string()), value: v.optional(v.string()), at: v.optional(v.string()) }),
    ),
    raw: v.optional(v.any()),
    duplicateOf: v.optional(v.id("intakeLeads")),
    attempts: v.array(
      v.object({ at: v.string(), by: v.id("users"), outcome: v.string(), note: v.optional(v.string()) }),
    ),
    confirmedLeadId: v.optional(v.id("marketplaceLeads")),
    // Demo rows from "Add demo leads"; "Remove demo data" clears them.
    isSample: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_phone", ["phoneNormalized"])
    .index("by_external_id", ["externalId"])
    .index("by_confirmed_lead", ["confirmedLeadId"]),

  // Every hit on the intake webhook, accepted or not, so "the form fired and
  // nothing showed up" has an answer. Kept to the last few hundred rows.
  intakeLog: defineTable({
    receivedAt: v.string(),
    source: v.optional(v.string()),
    outcome: v.union(v.literal("accepted"), v.literal("repeat"), v.literal("rejected")),
    reason: v.optional(v.string()),
    externalId: v.optional(v.string()),
    intakeLeadId: v.optional(v.id("intakeLeads")),
    /** What was parsed (name, phone, county, trade) or, when it couldn't be, the start of the body. */
    summary: v.optional(v.string()),
  }).index("by_received", ["receivedAt"]),

  // Where the paying demand is: one row per county and trade, rebuilt every
  // few minutes from standing bids, balances and recent leads. VAs read it
  // to decide where to run ads.
  // No longer written: the demand board reads live. Drop once the rows are gone.
  demandSnapshots: defineTable({
    county: v.string(),
    jobType: v.string(),
    bidders: v.number(),
    fundedBidders: v.number(),
    topFundedCents: v.optional(v.number()),
    secondFundedCents: v.optional(v.number()),
    // How many leads the funded bidders' balances can absorb at their bids.
    depthLeads: v.number(),
    listed7: v.number(),
    listed30: v.number(),
    soldAtAward30: v.number(),
    inMarketplace: v.number(),
    inVault: v.number(),
    updatedAt: v.string(),
  }).index("by_slot", ["county", "jobType"]),

  // Planning numbers for the demand board: what a lead in a trade costs us
  // to generate (ads), set by the owner from the first campaigns' results.
  demandSettings: defineTable({
    jobType: v.string(),
    planCplCents: v.number(),
    updatedAt: v.string(),
  }).index("by_job_type", ["jobType"]),

  // Every alert sent (or not) when a lead was awarded: the record staff
  // read when a contractor says they never heard about it.
  deliveries: defineTable({
    orgLeadId: v.id("leads"),
    marketplaceLeadId: v.id("marketplaceLeads"),
    organizationId: v.id("organizations"),
    channel: v.union(v.literal("email"), v.literal("sms"), v.literal("homeowner_sms")),
    to: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    error: v.optional(v.string()),
    providerId: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_lead", ["marketplaceLeadId"]),

  // People invited to run the Lead Market. Signing up with this email makes
  // them staff instead of giving them a company.
  staffInvites: defineTable({
    email: v.string(),
    invitedBy: v.id("users"),
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
    // Bought from the Lead Market (server-set, not in leadFields).
    marketplaceLeadId: v.optional(v.id("marketplaceLeads")),
    pricePaidCents: v.optional(v.number()),
    assignedAt: v.optional(v.string()),
    // When someone at the company tapped "Got it" on the alert.
    acknowledgedAt: v.optional(v.string()),
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

  // Companies that applied from the landing page. The owner approves one
  // into a company (with an invite for the applicant) or declines it.
  companyApplications: defineTable({
    companyName: v.string(),
    contactName: v.string(),
    email: v.string(),
    phone: v.string(),
    trades: v.array(v.string()),
    county: v.string(),
    jobsPerMonth: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("approved"), v.literal("declined")),
    createdAt: v.string(),
    decidedAt: v.optional(v.string()),
    decidedBy: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
  })
    .index("by_status", ["status"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"]),
});
