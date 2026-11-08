import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Follow-ups after silence, and ghosting after the second one goes unanswered.
crons.hourly("follow up on silence", { minuteUTC: 7 }, internal.followups.sweep, {});

// The weekly client report, Monday 8:13am Central (13:13 UTC; an hour later in winter).
crons.weekly("weekly client report", { dayOfWeek: "monday", hourUTC: 13, minuteUTC: 13 }, internal.reports.sendWeekly, {});

export default crons;
