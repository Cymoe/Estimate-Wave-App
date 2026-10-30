import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Webb Leads data model.
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
  // Phones homeowners from call lists (calls.ts) and takes leads into intake;
  // sees nothing else of Ops and has no company of their own.
  v.literal("caller"),
  v.literal("super_admin"),
);

/** Where an intake lead came from and where it is in the queue. */
// "outbound": a Webb Leads caller took it on a call from a call list (calls.ts).
export const intakeSource = v.union(v.literal("meta"), v.literal("call"), v.literal("manual"), v.literal("api"), v.literal("outbound"));
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

// The language a person reads: their estimate link, emails and texts come in it.
export const languageField = v.optional(v.union(v.literal("en"), v.literal("es")));

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
  language: languageField,
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

// A contract document a company uploaded (a PDF), or Webb Leads' built-in one.
export const contractDocKind = v.union(
  v.literal("agreement"),
  v.literal("affidavit"),
  v.literal("change_order"),
  v.literal("attachment"),
);

// One document as it went out for signing, kept on the signed contract.
export const signedDocument = v.object({
  kind: contractDocKind,
  source: v.union(v.literal("tolliver"), v.literal("upload")),
  name: v.string(),
  docId: v.optional(v.id("contractDocs")),
  fileName: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  sha256: v.optional(v.string()),
  size: v.optional(v.number()),
  // A copy with a signature page added, made just after signing (convex/stamping.ts).
  signedCopyId: v.optional(v.id("_storage")),
});

// This job's choice per document: a PDF, Webb Leads', or (absent) the company's.
const contractDocChoice = v.union(v.id("contractDocs"), v.literal("tolliver"));
export const estimateContractDocs = v.object({
  agreement: v.optional(contractDocChoice),
  affidavit: v.optional(contractDocChoice),
  changeOrder: v.optional(contractDocChoice),
  // Company attachments turned off for this job.
  hiddenAttachments: v.optional(v.array(v.id("contractDocs"))),
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
  // The documents signed with it (the agreement and attachments), and when
  // the client confirmed reading the uploaded ones.
  documents: v.optional(v.array(signedDocument)),
  acknowledgedAt: v.optional(v.string()),
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
  contractDocs: v.optional(estimateContractDocs),
  // The secret in the estimate's client link (/share/estimate/:token).
  shareToken: v.optional(v.string()),
  firstOpenedAt: v.optional(v.string()),
  // When it was first sent, and the reminders emailed to the client since
  // (followUps.ts). remindersOff stops them for this estimate.
  sentAt: v.optional(v.string()),
  remindersSent: v.optional(v.number()),
  lastReminderAt: v.optional(v.string()),
  // When Webb Leads last emailed the estimate to the client (convex/estimateEmail.ts).
  lastEmailedAt: v.optional(v.string()),
  remindersOff: v.optional(v.boolean()),
};

// A payment the company recorded on an invoice: check, cash, Zelle, a card
// taken elsewhere. Card payments through Webb Leads come later (Stripe Connect).
export const invoicePayment = v.object({
  _id: v.string(),
  amount: v.number(),
  method: v.string(),
  // yyyy-mm-dd
  paidAt: v.string(),
  note: v.optional(v.string()),
  recordedBy: v.optional(v.id("users")),
  recordedAt: v.string(),
});

export const invoiceFields = {
  ...documentFields,
  estimateId: v.optional(v.id("estimates")),
  invoiceNumber: v.string(),
  status: invoiceStatus,
  dueDate: v.optional(v.string()),
  paidDate: v.optional(v.string()),
  amountPaid: v.number(),
  // What it's for: the deposit asked at signing, the rest of the job, or another amount.
  kind: v.optional(v.union(v.literal("deposit"), v.literal("balance"), v.literal("other"))),
  payments: v.optional(v.array(invoicePayment)),
};

// How a company gets paid: the deposit asked when an estimate is signed,
// and where the client pays (the company's own pay link and instructions).
export const paymentSettings = v.object({
  depositPercent: v.number(),
  payLink: v.optional(v.string()),
  instructions: v.optional(v.string()),
});

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
  language: languageField,
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

/**
 * An ad's script: the shot list Claude wrote to the footage (each shot's
 * asset, its voice line, its on-screen line, and once voiced, when the line
 * starts and ends), with the whole voice-over and the lines in shot order.
 */
export const adShot = v.object({
  assetId: v.id("adAssets"),
  voice: v.string(),
  onScreen: v.string(),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
});
export const adScript = v.object({
  voice: v.string(),
  onScreen: v.array(v.string()),
  headline: v.string(),
  primaryText: v.string(),
  shots: v.optional(v.array(adShot)),
});

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
    // How clients pay the company (organizations.setPayments).
    payments: v.optional(paymentSettings),
    // Reminder emails to clients who haven't signed (organizations.setFollowUps).
    // Absent means on, after 3 days.
    followUps: v.optional(v.object({ enabled: v.boolean(), afterDays: v.number() })),
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
    language: languageField,
    status: marketplaceLeadStatus,
    // Legacy: set while a lead sat in a timed bidding round.
    round: v.optional(v.object({ opensAt: v.string(), closesAt: v.string() })),
    priceCents: v.optional(v.number()),
    assignedOrganizationId: v.optional(v.id("organizations")),
    assignedAt: v.optional(v.string()),
    acknowledgedAt: v.optional(v.string()),
    /** When staff were emailed that nobody had tapped "Got it" (once per lead). */
    escalatedAt: v.optional(v.string()),
    /** Staff called the company and it has the lead: no more red, no more chase. */
    handledAt: v.optional(v.string()),
    handledBy: v.optional(v.id("users")),
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
    // What the work is, in the applicant's words.
    detail: v.optional(v.string()),
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
    // From the city's permit portal (lib/energov.ts), filled in after import:
    // what the job is worth, its size, and the companies on it. Only contacts
    // with a company name are kept, so a homeowner pulling their own permit
    // is never stored.
    valuationCents: v.optional(v.number()),
    squareFeet: v.optional(v.number()),
    contacts: v.optional(
      v.array(
        v.object({
          role: v.string(),
          company: v.string(),
          person: v.optional(v.string()),
          phone: v.optional(v.string()),
          email: v.optional(v.string()),
        }),
      ),
    ),
    // The contractor's company, else the applicant's.
    builder: v.optional(v.string()),
    // When the portal was read for this permit (set too once it has failed 3 times).
    detailsAt: v.optional(v.string()),
    detailsTries: v.optional(v.number()),
    detailsError: v.optional(v.string()),
  })
    .index("by_permit_number", ["permitNumber"])
    .index("by_county_and_applied", ["county", "appliedAt"])
    .index("by_source_and_details", ["source", "detailsAt"]),

  // Who owns each Midland home: the appraisal roll from the city's public
  // ArcGIS (lib/parcels.ts), refreshed weekly. Public record, but only
  // Webb Leads staff and callers see it, never member companies. No phones.
  parcels: defineTable({
    county: v.string(),
    // The appraisal district's property id ("R000029279"); the key we upsert on.
    cadId: v.string(),
    pin: v.optional(v.string()),
    useCode: v.string(),
    siteAddress: v.string(),
    // lib/parcels.ts addressKey: the same house on a permit has the same key.
    addressKey: v.string(),
    // lib/parcels.ts looseKey: no directions or suffix, for code cases' short addresses.
    // Optional until the roll is next read.
    looseKey: v.optional(v.string()),
    // lib/parcels.ts streetKey ("COUNTRY CLUB DR"), for call lists by street.
    street: v.optional(v.string()),
    owner: v.string(),
    owner2: v.optional(v.string()),
    mailing: v.object({
      address: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip: v.optional(v.string()),
    }),
    ownerOccupied: v.boolean(),
    companyOwned: v.boolean(),
    marketValueCents: v.optional(v.number()),
    buildingValueCents: v.optional(v.number()),
    // "2021-10-11": roughly when the owner bought it.
    deedDate: v.optional(v.string()),
    importedAt: v.string(),
  })
    .index("by_cad_id", ["cadId"])
    .index("by_county_and_address_key", ["county", "addressKey"])
    .index("by_county_and_loose_key", ["county", "looseKey"])
    .index("by_county_and_street", ["county", "street"])
    .index("by_county_and_deed", ["county", "deedDate"]),

  // Numbers a Webb Leads caller must not dial (calls.ts): the national and
  // Texas lists as uploaded in Ops (only the current upload of each counts),
  // and everyone who asked us not to call again, kept for good.
  doNotCall: defineTable({
    phone: v.string(),
    list: v.union(v.literal("national"), v.literal("texas"), v.literal("asked")),
    // The upload it came in (dncLists); not set on "asked".
    batchId: v.optional(v.id("dncLists")),
    addedAt: v.string(),
    addedBy: v.optional(v.id("users")),
    note: v.optional(v.string()),
  })
    .index("by_phone", ["phone"])
    .index("by_batch", ["batchId"]),

  // Each upload of a Do Not Call list. The newest finished one is current.
  dncLists: defineTable({
    list: v.union(v.literal("national"), v.literal("texas")),
    count: v.number(),
    startedAt: v.string(),
    // Set once every chunk is in; only then does it replace the last one.
    uploadedAt: v.optional(v.string()),
    uploadedBy: v.id("users"),
    current: v.boolean(),
    fileName: v.optional(v.string()),
  }).index("by_list_and_current", ["list", "current"]),

  // Every call a Webb Leads caller made from a call list, and how it went.
  outboundCalls: defineTable({
    parcelId: v.optional(v.id("parcels")),
    address: v.string(),
    owner: v.optional(v.string()),
    phone: v.string(),
    callerId: v.id("users"),
    outcome: v.union(
      v.literal("no_answer"),
      v.literal("voicemail"),
      v.literal("wrong_number"),
      v.literal("not_interested"),
      v.literal("callback"),
      v.literal("do_not_call"),
      v.literal("lead_taken"),
    ),
    note: v.optional(v.string()),
    callbackAt: v.optional(v.string()),
    trade: v.optional(v.string()),
    intakeLeadId: v.optional(v.id("intakeLeads")),
    at: v.string(),
  })
    .index("by_parcel", ["parcelId", "at"])
    .index("by_phone", ["phone", "at"])
    .index("by_caller_and_at", ["callerId", "at"])
    .index("by_at", ["at"]),

  // Homes posted for Midland's monthly courthouse foreclosure auction (first
  // Tuesday; lib/foreclosures.ts), typed in by staff from the county clerk's
  // public search, then what happened at the sale and who bought. The roll's
  // owner of a posted home is never called; the buyer of a sold one can be.
  foreclosures: defineTable({
    county: v.string(),
    saleDate: v.string(),
    kind: v.union(v.literal("mortgage"), v.literal("tax")),
    address: v.string(),
    addressKey: v.string(),
    parcelId: v.optional(v.id("parcels")),
    // The clerk's document number for the notice.
    instrument: v.optional(v.string()),
    status: v.union(v.literal("posted"), v.literal("sold"), v.literal("back_to_lender"), v.literal("cancelled")),
    buyer: v.optional(
      v.object({
        name: v.string(),
        company: v.boolean(),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
      }),
    ),
    salePriceCents: v.optional(v.number()),
    note: v.optional(v.string()),
    addedBy: v.id("users"),
    addedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_county_and_sale", ["county", "saleDate"])
    .index("by_parcel", ["parcelId"]),

  // Public records that say a home's owner may want to sell (lib/signals.ts):
  // code violations, dilapidated buildings, demolition orders and stalled
  // permits, read from the city's ArcGIS. Matched to a home on the roll when
  // the address matches one home.
  signals: defineTable({
    county: v.string(),
    parcelId: v.optional(v.id("parcels")),
    address: v.string(),
    kind: v.union(v.literal("code_violation"), v.literal("dilapidated"), v.literal("demolition"), v.literal("stalled_permit")),
    // The violation, or the permit's status.
    detail: v.string(),
    status: v.optional(v.string()),
    // A code case groups several inspections.
    caseNumber: v.optional(v.string()),
    date: v.string(),
    // Unique per source record ("code:<inspection id>", "permit:<number>").
    sourceId: v.string(),
    importedAt: v.string(),
  })
    .index("by_source_id", ["sourceId"])
    .index("by_parcel", ["parcelId", "date"])
    .index("by_kind_and_date", ["kind", "date"]),

  // Owners with 5 or more Midland homes on the roll ("tired landlords").
  landlords: defineTable({
    county: v.string(),
    owner: v.string(),
    homes: v.number(),
  }).index("by_county_and_owner", ["county", "owner"]),

  // A home's motivated-seller lists and stack score (lib/signals.ts), one row
  // per home on at least one list, kept current as signals and the roll change.
  distress: defineTable({
    county: v.string(),
    parcelId: v.id("parcels"),
    score: v.number(),
    lists: v.array(v.string()),
    codeCases: v.number(),
    seriousCases: v.number(),
    lastSignalAt: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index("by_parcel", ["parcelId"])
    .index("by_county_and_score", ["county", "score"]),

  // One row per home and list, so a list can be read by score on its own.
  distressLists: defineTable({
    county: v.string(),
    parcelId: v.id("parcels"),
    list: v.string(),
    score: v.number(),
  })
    .index("by_parcel", ["parcelId"])
    .index("by_list_and_score", ["county", "list", "score"]),

  // How many homes are on each list, refreshed after each sync.
  sellerCounts: defineTable({
    county: v.string(),
    counts: v.record(v.string(), v.number()),
    stacked: v.number(),
    total: v.number(),
    updatedAt: v.string(),
  }).index("by_county", ["county"]),

  // How each permit feed's last sync went.
  permitSources: defineTable({
    source: v.string(),
    syncedAt: v.string(),
    lastAppliedAt: v.optional(v.string()),
    fetched: v.number(),
    added: v.number(),
    updated: v.number(),
    error: v.optional(v.string()),
    // Which PERMIT_FIELDS the stored permits were read with (lib/permits.ts).
    fieldsVersion: v.optional(v.number()),
    // How the last run reading builders from the city's permit portal went.
    details: v.optional(
      v.object({
        at: v.string(),
        looked: v.number(),
        filled: v.number(),
        failed: v.number(),
        error: v.optional(v.string()),
      }),
    ),
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
    language: languageField,
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
    // What they become on sign-up; staff when not set.
    role: v.optional(v.union(v.literal("staff"), v.literal("caller"))),
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

  // A kind of job the company does, saved from a real project: the estimate
  // lines, the tasks (as days from the start) and how long it takes. Starting
  // a project from one fills all of that in (convex/projectTemplates.ts).
  projectTemplates: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    // Typical length in days, start to end.
    days: v.optional(v.number()),
    items: v.array(documentItem),
    tasks: v.array(
      v.object({
        title: v.string(),
        notes: v.optional(v.string()),
        // Days after the project's start the task begins, and how many it runs.
        startOffset: v.optional(v.number()),
        days: v.optional(v.number()),
      }),
    ),
    usageCount: v.number(),
    ...timestamps,
  }).index("by_organization", ["organizationId"]),

  // A change order or the affidavit of completion, sent to the client for
  // their signature after the estimate was signed (convex/signoffs.ts).
  signoffs: defineTable({
    organizationId: v.id("organizations"),
    estimateId: v.id("estimates"),
    kind: v.union(v.literal("change_order"), v.literal("affidavit")),
    number: v.string(),
    // The secret in its link (/share/signoff/:token).
    token: v.string(),
    status: v.union(v.literal("sent"), v.literal("signed"), v.literal("cancelled")),
    // Change order: what changed since the contract was signed, and the new scope as sent.
    changes: v.optional(v.array(v.object({ description: v.string(), before: v.optional(v.number()), after: v.optional(v.number()) }))),
    items: v.optional(v.array(documentItem)),
    previousTotal: v.optional(v.number()),
    subtotal: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    newTotal: v.optional(v.number()),
    // Affidavit: when the work was finished.
    completionDate: v.optional(v.string()),
    // The document signed: the company's PDF (with its fingerprint) or Webb Leads'.
    document: signedDocument,
    signerName: v.optional(v.string()),
    signature: v.optional(v.string()),
    signedAt: v.optional(v.string()),
    acknowledgedAt: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_token", ["token"])
    .index("by_estimate", ["estimateId"]),

  // Job photos: before and after, progress, what the client showed. On an
  // estimate or a project (a project also shows its estimates' photos).
  jobPhotos: defineTable({
    organizationId: v.id("organizations"),
    estimateId: v.optional(v.id("estimates")),
    projectId: v.optional(v.id("projects")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    caption: v.optional(v.string()),
    uploadedBy: v.id("users"),
    createdAt: v.string(),
  })
    .index("by_estimate", ["estimateId"])
    .index("by_project", ["projectId"]),

  // The people a company sends to its jobs: its own crew and the subs it
  // uses. They don't sign in; they're who a task is assigned to (convex/crew.ts).
  crew: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    // What they do: "Framer", "Electrician (sub)".
    trade: v.optional(v.string()),
    language: languageField,
    // Taken off the list; kept so past tasks still show who did them.
    archivedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_organization", ["organizationId"]),

  // The work on a project, with its days and who's on it (convex/tasks.ts).
  projectTasks: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    title: v.string(),
    notes: v.optional(v.string()),
    // Days, YYYY-MM-DD; a one-day task has only a start.
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    crewIds: v.array(v.id("crew")),
    doneAt: v.optional(v.string()),
    order: v.number(),
    createdBy: v.id("users"),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_organization_and_start", ["organizationId", "startDate"]),

  // Contract PDFs a company uploaded: its library (no estimateId) or one
  // job's own. Signed files are kept for good; see convex/contractDocs.ts.
  contractDocs: defineTable({
    organizationId: v.id("organizations"),
    kind: contractDocKind,
    name: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    size: v.number(),
    sha256: v.string(),
    estimateId: v.optional(v.id("estimates")),
    // The company's default for its kind; for attachments, sent with every estimate.
    active: v.boolean(),
    archivedAt: v.optional(v.string()),
    signedAt: v.optional(v.string()),
    uploadedBy: v.id("users"),
    uploadedAt: v.string(),
  })
    .index("by_organization_and_kind", ["organizationId", "kind"])
    .index("by_estimate", ["estimateId"]),

  estimates: defineTable({
    ...estimateFields,
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    ...timestamps,
  })
    .index("by_organization_and_issue_date", ["organizationId", "issueDate"])
    .index("by_client", ["clientId"])
    .index("by_share_token", ["shareToken"])
    .index("by_status", ["status"]),

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
    .index("by_client", ["clientId"])
    .index("by_estimate", ["estimateId"]),

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
    // Carried over from the Lead Market: when Webb Leads confirmed the lead
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

  // Companies that applied, from the landing page or (signed in) an owner adding another. The owner approves one
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
    // Sent from inside the app by someone who already has a company ("Add another company").
    appliedBy: v.optional(v.id("users")),
  })
    .index("by_status", ["status"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"]),

  // Assistants (Claude, ChatGPT) that may sign in to the connector. A client
  // either registered itself (dcr) or is known by the URL of its metadata
  // document (cimd), which is fetched and kept here.
  oauthClients: defineTable({
    clientId: v.string(),
    kind: v.union(v.literal("dcr"), v.literal("cimd")),
    name: v.optional(v.string()),
    redirectUris: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_clientId", ["clientId"]),

  // One-use codes handed back after the person approves, swapped for tokens within 10 minutes.
  oauthCodes: defineTable({
    codeHash: v.string(),
    clientId: v.string(),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    scopes: v.array(v.string()),
    resource: v.optional(v.string()),
    dailyCapCents: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_codeHash", ["codeHash"]),

  // A connected assistant: who it acts for, in which company, what it may do,
  // and its current tokens (hashes only). Disconnecting stamps revokedAt.
  aiConnections: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    clientId: v.string(),
    app: v.union(v.literal("claude"), v.literal("chatgpt"), v.literal("other")),
    clientName: v.optional(v.string()),
    scopes: v.array(v.string()),
    dailyCapCents: v.number(),
    spendDay: v.optional(v.string()),
    spentTodayCents: v.optional(v.number()),
    accessHash: v.string(),
    accessExpiresAt: v.number(),
    refreshHash: v.string(),
    refreshExpiresAt: v.number(),
    createdAt: v.string(),
    lastUsedAt: v.optional(v.number()),
    // Where "what's new" last left off.
    lastCheckedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_access", ["accessHash"])
    .index("by_refresh", ["refreshHash"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"]),

  // Ads on autopilot (ads.ts, lib/ads.ts): the photos and clips the ads are
  // cut from, the hooks they open with, each Monday's batch of creatives,
  // what Meta reports on them, and the account they go to. Staff-only.
  adAssets: defineTable({
    storageId: v.id("_storage"),
    kind: v.union(v.literal("photo"), v.literal("video")),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    durationSec: v.optional(v.number()),
    // Scope (interior, exterior, cabinets, crew, process), before/after, trade slug.
    tags: v.array(v.string()),
    // Links a before and an after of the same spot.
    pairKey: v.optional(v.string()),
    // Where it was shot and whose permission we have.
    note: v.optional(v.string()),
    // A JPEG still made in the browser at upload: what Claude looks at, the
    // render source for HEIC photos, and the poster for video ads.
    posterStorageId: v.optional(v.id("_storage")),
    // What Claude saw in it, and the tags it would give it.
    description: v.optional(v.string()),
    suggestedTags: v.optional(v.array(v.string())),
    // How many ads it has been cut into, so the library rotates.
    uses: v.optional(v.number()),
    lastUsedAt: v.optional(v.string()),
    uploadedBy: v.id("users"),
    createdAt: v.string(),
  })
    .index("by_kind", ["kind"])
    .index("by_pair", ["pairKey"]),

  adHooks: defineTable({
    family: v.union(
      v.literal("owner_story"),
      v.literal("before_after"),
      v.literal("proof"),
      v.literal("education"),
      v.literal("objection"),
      v.literal("seasonal"),
    ),
    scope: v.string(),
    trade: v.string(),
    textEn: v.string(),
    active: v.boolean(),
    lastUsedAt: v.optional(v.string()),
    uses: v.number(),
    wins: v.number(),
    losses: v.number(),
    createdAt: v.string(),
  }).index("by_active", ["active"]),

  adBatches: defineTable({
    weekOf: v.string(),
    status: v.union(v.literal("drafting"), v.literal("rendering"), v.literal("ready"), v.literal("done"), v.literal("failed")),
    error: v.optional(v.string()),
    summary: v.optional(v.string()),
    // Hooks passed over this week, and why ("the footage shows exteriors only").
    skipped: v.optional(v.array(v.string())),
    startedBy: v.optional(v.id("users")),
    createdAt: v.string(),
  }).index("by_week", ["weekOf"]),

  adCreatives: defineTable({
    batchId: v.id("adBatches"),
    hookId: v.id("adHooks"),
    ratio: v.union(v.literal("9x16"), v.literal("4x5")),
    // Also the ad's name in Meta, so a lead's adName joins back here.
    name: v.string(),
    script: adScript,
    // Shot order; the same assets as script.shots.
    assetIds: v.array(v.id("adAssets")),
    audioStorageId: v.optional(v.id("_storage")),
    // How long ElevenLabs' read runs; the edit is cut to it.
    audioDurationSec: v.optional(v.number()),
    videoStorageId: v.optional(v.id("_storage")),
    renderId: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("voiced"),
      v.literal("rendering"),
      v.literal("rendered"),
      v.literal("paused"),
      v.literal("live"),
      v.literal("retired"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    meta: v.optional(v.object({ videoId: v.optional(v.string()), creativeId: v.optional(v.string()), adId: v.optional(v.string()), adsetId: v.optional(v.string()) })),
    createdAt: v.string(),
    activatedAt: v.optional(v.string()),
    retiredAt: v.optional(v.string()),
    // The last 7 days as Meta reports them (pullInsights), and the first week's CTR to judge fatigue against.
    week: v.optional(v.object({ at: v.string(), spendCents: v.number(), impressions: v.number(), clicks: v.number(), frequency: v.number(), ctr: v.number(), leadsMeta: v.number() })),
    baselineCtr: v.optional(v.number()),
  })
    .index("by_batch", ["batchId"])
    .index("by_name", ["name"])
    .index("by_status", ["status"]),

  adStats: defineTable({
    creativeId: v.id("adCreatives"),
    day: v.string(),
    spendCents: v.number(),
    impressions: v.number(),
    reach: v.number(),
    clicks: v.number(),
    frequency: v.number(),
    ctr: v.number(),
    leadsMeta: v.number(),
  }).index("by_creative_day", ["creativeId", "day"]),

  // The swipe file: competitor ads from Meta's Ad Library, as the VA's
  // research recorded them, to browse for ideas and to show the writer the
  // tone and shape of ads that run in a category (never their claims).
  adSwipes: defineTable({
    company: v.string(),
    paintingType: v.string(),
    // cabinets / interior / exterior; none for general painting.
    scope: v.optional(v.string()),
    hook: v.string(),
    offer: v.string(),
    creative: v.string(),
    area: v.string(),
    cta: v.string(),
    adaptation: v.string(),
    startedAt: v.optional(v.string()),
    status: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    destination: v.optional(v.string()),
    metaAdId: v.optional(v.string()),
    adCopy: v.optional(v.string()),
    transcript: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    starred: v.boolean(),
    source: v.string(),
    importedAt: v.string(),
    // From the Ad Library scrape (ads.researchRun).
    pageId: v.optional(v.string()),
    pageLikes: v.optional(v.number()),
    daysRunning: v.optional(v.number()),
    active: v.optional(v.boolean()),
    variants: v.optional(v.number()),
    platforms: v.optional(v.array(v.string())),
    title: v.optional(v.string()),
    landing: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    mediaType: v.optional(v.string()),
    // Claude's read of the ad (ads.tagSwipe).
    family: v.optional(v.string()),
    claims: v.optional(v.array(v.string())),
    opening: v.optional(v.string()),
    footage: v.optional(v.array(v.string())),
    quality: v.optional(v.number()),
    local: v.optional(v.boolean()),
    tagError: v.optional(v.string()),
    taggedAt: v.optional(v.string()),
  })
    .index("by_meta_ad", ["metaAdId"])
    .index("by_scope", ["scope"])
    .index("by_page", ["pageId"]),

  // What the long-running ads in a scope have in common, distilled by Claude
  // (ads.rebuildPlaybooks) and shown to the Monday writer. A human edit holds
  // until someone asks for a rewrite.
  adPlaybooks: defineTable({
    scope: v.string(),
    text: v.string(),
    footagePrefs: v.array(v.string()),
    angleFamilies: v.array(v.string()),
    localCompetitors: v.array(v.object({ company: v.string(), angle: v.string(), daysRunning: v.number() })),
    missingFootage: v.array(v.string()),
    basis: v.object({ ads: v.number(), local: v.number(), oldestDays: v.number() }),
    writtenAt: v.string(),
    editedAt: v.optional(v.string()),
  }).index("by_scope", ["scope"]),

  // One row per niche search (the button or the monthly run).
  adResearchRuns: defineTable({
    startedAt: v.string(),
    finishedAt: v.optional(v.string()),
    keywords: v.array(v.string()),
    scanned: v.number(),
    kept: v.number(),
    added: v.number(),
    junk: v.number(),
    unreadable: v.number(),
    error: v.optional(v.string()),
    startedBy: v.optional(v.id("users")),
  }),

  adSettings: defineTable({
    adAccountId: v.optional(v.string()),
    pageId: v.optional(v.string()),
    leadFormId: v.optional(v.string()),
    adsetId: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    voiceId: v.optional(v.string()),
    weeklyEnabled: v.boolean(),
    // Niche research: Ad Library keywords, the owner's markets, the longevity bar, the monthly switch.
    researchKeywords: v.optional(v.array(v.string())),
    researchMarkets: v.optional(v.array(v.string())),
    researchMinDays: v.optional(v.number()),
    researchMonthly: v.optional(v.boolean()),
    hooksPerWeek: v.number(),
    liveTarget: v.number(),
    updatedAt: v.string(),
  }),
});
