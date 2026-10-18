import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Marketplace leads nobody bought in a week move to Older leads; a month on
// they're archived.
crons.hourly("age leads", { minuteUTC: 7 }, internal.marketplace.ageLeads, {});

// Monthly plan fees come out of lead balances as they fall due.
crons.daily(
  "charge plans",
  { hourUTC: 9, minuteUTC: 12 },
  internal.marketplace.chargePlans,
  {},
);

export default crons;
