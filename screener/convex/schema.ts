import { defineSchema, defineTable } from "convex/server";
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

export default defineSchema({
  clients: defineTable({
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
  }).index("by_name", ["name"]),

  applicants: defineTable({
    name: v.string(),
    // E.164, e.g. "+14325550100".
    phone: v.string(),
    clientId: v.id("clients"),
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
  })
    .index("by_phone", ["phone"])
    .index("by_client", ["clientId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_booking", ["calBookingUid"])
    .index("by_source_ad", ["sourceAdId", "score"]),

  messages: defineTable({
    applicantId: v.id("applicants"),
    direction: v.union(v.literal("in"), v.literal("out")),
    body: v.string(),
    at: v.string(),
    twilioSid: v.optional(v.string()),
    // Logged, not sent through Twilio (SMS_MODE=simulate).
    simulated: v.optional(v.boolean()),
  }).index("by_applicant", ["applicantId", "at"]),

  // A number that texted STOP: nothing goes to it again, for any client, until it texts START.
  optOuts: defineTable({
    phone: v.string(),
    at: v.string(),
  }).index("by_phone", ["phone"]),
});
