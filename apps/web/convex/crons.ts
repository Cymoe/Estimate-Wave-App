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

// Who sells Midland's homes: TREC's active agents and brokers (lib/realtors.ts), weekly, before the roll.
crons.weekly("sync Midland realtors", { dayOfWeek: "sunday", hourUTC: 6, minuteUTC: 55 }, internal.realtors.syncMidland, {});

// Who owns each Midland home, from the appraisal roll (lib/parcels.ts), weekly.
crons.weekly(
  "sync Midland owners",
  { dayOfWeek: "sunday", hourUTC: 7, minuteUTC: 20 },
  internal.parcels.syncMidland,
  {},
);

// Odessa's and Lubbock's agents and brokers, then their owners (each roll read rebuilds its county's Outreach owners), weekly.
crons.weekly("sync Ector realtors", { dayOfWeek: "sunday", hourUTC: 7, minuteUTC: 35 }, internal.realtors.syncCounty, { county: "Ector" });
crons.weekly("sync Lubbock realtors", { dayOfWeek: "sunday", hourUTC: 7, minuteUTC: 37 }, internal.realtors.syncCounty, { county: "Lubbock" });
crons.weekly("sync Ector owners", { dayOfWeek: "sunday", hourUTC: 7, minuteUTC: 40 }, internal.parcels.syncCounty, { county: "Ector" });
crons.weekly("sync Lubbock owners", { dayOfWeek: "sunday", hourUTC: 8, minuteUTC: 10 }, internal.parcels.syncCounty, { county: "Lubbock" });

// Code violations, dilapidated buildings, demolition orders and stalled permits, restacked per home (lib/signals.ts).
crons.daily(
  "sync Midland distress signals",
  { hourUTC: 6, minuteUTC: 40 },
  internal.signals.syncMidland,
  {},
);

// The morning's permits and code cases onto the Outreach owners (outreachRefresh.ts), between the weekly rebuilds.
crons.daily("refresh Outreach records", { hourUTC: 7, minuteUTC: 0 }, internal.outreachRefresh.refresh, {});
// Then the companies' saved lists: each one whose records changed picks up the owners who newly match it (outreach.refreshList).
// After the morning's pass above and Sunday's rebuilds; a rebuild that lands later is caught the next morning.
crons.daily("refresh Outreach lists", { hourUTC: 9, minuteUTC: 15 }, internal.outreach.refreshLists, {});

// Outreach emails whose time has come, from each company's own Gmail (emailOutreach.ts).
crons.interval("send outreach emails", { minutes: 5 }, internal.emailOutreach.sendDue, {});

// The lookup queue starts itself (after a request, when a lookup ends); this
// is the safety net should that chain ever break. One small read when empty.
crons.interval("outreach lookup queue", { minutes: 5 }, internal.outreach.pump, {});

// Reminder emails to clients who haven't signed their estimate (followUps.ts).
crons.hourly("remind clients about estimates", { minuteUTC: 23 }, internal.followUps.send, {});

// Ads on autopilot (ads.ts): Monday 6am Central drafts the week's ads; every morning pulls what Meta reports on the live ones.
crons.weekly("draft the week's ads", { dayOfWeek: "monday", hourUTC: 12, minuteUTC: 0 }, internal.ads.weeklyRun, {});
crons.daily("pull ad insights", { hourUTC: 9, minuteUTC: 35 }, internal.ads.pullInsights, {});
// The 1st of the month: search the painting niche in Meta's Ad Library (only when the switch in Ops → Ads → Settings is on).
crons.monthly("niche research", { day: 1, hourUTC: 10, minuteUTC: 0 }, internal.ads.researchRun, {});

// The office line (agent.ts): each company's morning brief at its time, and asks nobody answered expire.
crons.interval("office line briefs", { minutes: 15 }, internal.agent.morningBriefs, {});

// Recruiting (recruiting/): Jordan's follow-ups after silence, then ghosted; Monday's client reports, then the recruiting ad batches.
crons.hourly("recruiting: follow up on silence", { minuteUTC: 41 }, internal.recruiting.followups.sweep, {});
crons.weekly("recruiting: client report", { dayOfWeek: "monday", hourUTC: 13, minuteUTC: 13 }, internal.recruiting.reports.sendWeekly, {});
crons.weekly("recruiting: ad batch", { dayOfWeek: "monday", hourUTC: 14, minuteUTC: 7 }, internal.recruiting.adAgent.weekly, {});

export default crons;
