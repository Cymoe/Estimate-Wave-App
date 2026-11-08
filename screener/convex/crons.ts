import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Follow-ups after silence, and ghosting after the second one goes unanswered.
crons.hourly("follow up on silence", { minuteUTC: 7 }, internal.followups.sweep, {});

// The weekly client report, Monday 8:13am Central (13:13 UTC; an hour later in winter).
crons.weekly("weekly client report", { dayOfWeek: "monday", hourUTC: 13, minuteUTC: 13 }, internal.reports.sendWeekly, {});

// The ad agent's weekly batch, after the report: each client with ads on gets new drafts to review.
crons.weekly("weekly ad batch", { dayOfWeek: "monday", hourUTC: 14, minuteUTC: 7 }, internal.adAgent.weekly, {});

export default crons;
