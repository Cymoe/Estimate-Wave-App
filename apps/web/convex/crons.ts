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

export default crons;
