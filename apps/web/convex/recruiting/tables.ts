// The recruiting side (National Sales Registry): Jordan the SMS screener and
// the recruiting ad agent. Its own tables, spread into schema.ts, kept apart
// from Estimate Wave's by the recruit prefix.
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const score = v.union(v.literal("A"), v.literal("B"), v.literal("C"));

export const applicantStatus = v.union(
  v.literal("new"), // saved, first text not out yet
  v.literal("texted"), // first text out, no answer yet
  v.literal("screening"), // talking
  v.literal("qualified"), // passed, not booked yet
  v.literal("booked"), // interview on the calendar
  v.literal("interviewed"), // showed up
  v.literal("no_show"), // missed it; rebook text sent
  v.literal("ghosted"), // never answered the follow-ups
  v.literal("rejected"), // didn't qualify
  v.literal("opted_out"), // texted STOP
  v.literal("flagged"), // handed to Myles; the agent stays quiet
);

export const recruitTables = {
  recruitClients: defineTable({
    name: v.string(),
    role: v.string(),
    city: v.string(),
    // The pay plan as the client wrote it; the agent quotes from it.
    compSheet: v.string(),
    // The booking page reps can open themselves (also sent on a no-show).
    calEventLink: v.string(),
    // Cal.com's id for the event type, for booking through the API.
    calEventTypeId: v.optional(v.number()),
    // IANA, e.g. "America/Chicago": reminders and quiet hours run on it.
    timezone: v.string(),
    // Where the weekly report goes.
    reportEmail: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.string(),
    // What the ad agent writes from (ad-brief.md, "Inputs per client").
    territory: v.optional(v.string()),
    repStories: v.optional(v.array(v.string())),
    perks: v.optional(v.string()),
    wants: v.optional(v.string()),
    // On: a new batch of ads is written every Monday.
    adsEnabled: v.optional(v.boolean()),
    // Short name in source ad ids ("acme" → "acme-m7"), and the last number handed out.
    slug: v.optional(v.string()),
    adSeq: v.optional(v.number()),
  }).index("by_name", ["name"]),

  recruitApplicants: defineTable({
    name: v.string(),
    // E.164, e.g. "+14325550100".
    phone: v.string(),
    clientId: v.id("recruitClients"),
    // The ad they came from, so the report can say which ads bring A's.
    sourceAdId: v.string(),
    // What they told the agent, question → answer.
    answers: v.record(v.string(), v.string()),
    score: v.optional(score),
    status: applicantStatus,
    notes: v.optional(v.string()),
    createdAt: v.string(),
    lastInboundAt: v.optional(v.string()),
    lastOutboundAt: v.optional(v.string()),
    // Silence follow-ups sent since their last reply (0, 1 or 2), and whether one is scheduled but not sent yet.
    followUps: v.number(),
    followUpPending: v.optional(v.boolean()),
    // While a reply is being written, later texts wait for it instead of starting another.
    replying: v.optional(v.boolean()),
    interviewAt: v.optional(v.string()),
    bookedAt: v.optional(v.string()),
    calBookingUid: v.optional(v.string()),
    // The scheduled reminder and no-show checks, so a rebooking can cancel them.
    jobIds: v.optional(v.array(v.id("_scheduled_functions"))),
    remindersSent: v.optional(v.array(v.string())),
    // A test applicant from Ops → Recruiting's "Try it": nothing is texted or booked for real, and they're left out of the numbers.
    test: v.optional(v.boolean()),
  })
    .index("by_phone", ["phone"])
    .index("by_client", ["clientId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_booking", ["calBookingUid"])
    .index("by_source_ad", ["sourceAdId", "score"]),

  recruitMessages: defineTable({
    applicantId: v.id("recruitApplicants"),
    direction: v.union(v.literal("in"), v.literal("out")),
    body: v.string(),
    at: v.string(),
    twilioSid: v.optional(v.string()),
    // Logged, not sent through Twilio: a test applicant's, or RECRUIT_SMS_MODE=simulate.
    simulated: v.optional(v.boolean()),
  }).index("by_applicant", ["applicantId", "at"]),

  // One run of the ad agent for a client: the pieces it wrote are in `ads`.
  recruitAdBatches: defineTable({
    clientId: v.id("recruitClients"),
    status: v.union(v.literal("writing"), v.literal("ready"), v.literal("failed")),
    createdAt: v.string(),
    learningNotes: v.optional(v.string()),
    // Ads the agent (or the volume-but-no-A's rule) says to retire; a person decides.
    retire: v.optional(v.array(v.object({ sourceAdId: v.string(), reason: v.string() }))),
    // How the batch splits: riffs on winners vs new angles.
    variations: v.optional(v.number()),
    fresh: v.optional(v.number()),
    // Anything off about the batch as a whole (too few pieces, etc.).
    problems: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  }).index("by_client", ["clientId", "createdAt"]),

  // A piece of ad copy: a hook, a Meta primary text, a video script or an Indeed post.
  recruitAds: defineTable({
    clientId: v.id("recruitClients"),
    batchId: v.id("recruitAdBatches"),
    kind: v.union(v.literal("hook"), v.literal("meta_primary"), v.literal("video_script"), v.literal("indeed")),
    angle: v.string(),
    title: v.optional(v.string()),
    body: v.string(),
    // The source ad id of the winner this riffs on; none for a new angle.
    variationOf: v.optional(v.string()),
    // What the checks caught: a pay number not in the comp sheet, a word about a protected trait, a missing "earnings vary".
    warnings: v.array(v.string()),
    // draft → approved (gets a source ad id) or rejected, or expired when the next batch lands undecided; approved → retired.
    status: v.union(v.literal("draft"), v.literal("approved"), v.literal("rejected"), v.literal("expired"), v.literal("retired")),
    sourceAdId: v.optional(v.string()),
    // Total spent on it so far, from the media buyer, for A's per dollar.
    spendCents: v.optional(v.number()),
    createdAt: v.string(),
    decidedAt: v.optional(v.string()),
  })
    .index("by_client_status", ["clientId", "status"])
    .index("by_batch", ["batchId"])
    .index("by_source_ad", ["sourceAdId"]),

  // A number that texted STOP: nothing goes to it again, for any client, until it texts START.
  recruitOptOuts: defineTable({
    phone: v.string(),
    at: v.string(),
  }).index("by_phone", ["phone"]),
};
