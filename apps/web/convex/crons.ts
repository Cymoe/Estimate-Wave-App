import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Marketplace leads nobody bought in a week move to the Vault, and stay there
// until someone claims them.
crons.hourly("age leads", { minuteUTC: 7 }, internal.marketplace.ageLeads, {});

// Monthly plan fees come out of lead balances as they fall due.
crons.daily(
  "charge plans",
  { hourUTC: 9, minuteUTC: 12 },
  internal.marketplace.chargePlans,
  {},
);

// A sold lead with no "Got it" after 15 minutes during hours gets staff an email, once.
crons.interval("chase Got it", { minutes: 5 }, internal.delivery.escalateOverdue, {});

// Midland's permit feed, once a day (lib/permits.ts).
crons.daily(
  "sync Midland permits",
  { hourUTC: 6, minuteUTC: 10 },
  internal.permits.syncMidland,
  {},
);

// Builders and job value for new permits, from the city's permit portal (lib/energov.ts).
crons.interval("look up Midland permit builders", { hours: 1 }, internal.permits.lookUpMidlandDetails, {});

// Who runs the business at each Midland address, from the Comptroller's sales-tax permits (lib/outlets.ts), weekly, before the roll.
crons.weekly("sync Midland outlets", { dayOfWeek: "sunday", hourUTC: 6, minuteUTC: 50 }, internal.outlets.syncMidland, {});

// Who owns each Midland home, from the appraisal roll (lib/parcels.ts), weekly.
crons.weekly(
  "sync Midland owners",
  { dayOfWeek: "sunday", hourUTC: 7, minuteUTC: 20 },
  internal.parcels.syncMidland,
  {},
);

// Code violations, dilapidated buildings, demolition orders and stalled permits, restacked per home (lib/signals.ts).
crons.daily(
  "sync Midland distress signals",
  { hourUTC: 6, minuteUTC: 40 },
  internal.signals.syncMidland,
  {},
);

// The morning's permits and code cases onto the Outreach owners (outreachRefresh.ts), between the weekly rebuilds.
crons.daily("refresh Outreach records", { hourUTC: 7, minuteUTC: 0 }, internal.outreachRefresh.refresh, {});

// Reminder emails to clients who haven't signed their estimate (followUps.ts).
crons.hourly("remind clients about estimates", { minuteUTC: 23 }, internal.followUps.send, {});

// Ads on autopilot (ads.ts): Monday 6am Central drafts the week's ads; every morning pulls what Meta reports on the live ones.
crons.weekly("draft the week's ads", { dayOfWeek: "monday", hourUTC: 12, minuteUTC: 0 }, internal.ads.weeklyRun, {});
crons.daily("pull ad insights", { hourUTC: 9, minuteUTC: 35 }, internal.ads.pullInsights, {});
// The 1st of the month: search the painting niche in Meta's Ad Library (only when the switch in Ops → Ads → Settings is on).
crons.monthly("niche research", { day: 1, hourUTC: 10, minuteUTC: 0 }, internal.ads.researchRun, {});

// The office line (agent.ts): each company's morning brief at its time, and asks nobody answered expire.
crons.interval("office line briefs", { minutes: 15 }, internal.agent.morningBriefs, {});

export default crons;
