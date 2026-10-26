import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { siteUrl } from "./delivery";
import { getOwned, logActivity, nowIso } from "./lib/access";
import { sendEmail } from "./lib/email";

// Reminders for estimates the client hasn't signed: an email to the client
// some days after it was sent, and once more after the same wait. The
// company turns them off or changes the wait in Settings → Notifications,
// and can stop them for one estimate.

export const MAX_REMINDERS = 2;
const DEFAULT_DAYS = 3;
const DAY_MS = 86_400_000;
/** Reminders go out in the daytime, Central time. */
const SEND_HOURS = { from: 9, to: 18 };

type FollowUps = Doc<"organizations">["followUps"];
const settingsOf = (followUps: FollowUps) => ({ enabled: followUps?.enabled ?? true, afterDays: followUps?.afterDays ?? DEFAULT_DAYS });

const centralHour = (ms: number) => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }).format(ms)) % 24;

/** When the next reminder is due for this estimate, or null if none will be sent. */
export function nextReminderAt(estimate: Doc<"estimates">, followUps: FollowUps, nowMs = Date.now()): number | null {
  const { enabled, afterDays } = settingsOf(followUps);
  if (!enabled || estimate.remindersOff || !estimate.shareToken) return null;
  if (estimate.status !== "sent" && estimate.status !== "opened") return null;
  if ((estimate.remindersSent ?? 0) >= MAX_REMINDERS) return null;
  if (estimate.expiryDate && estimate.expiryDate.slice(0, 10) < new Date(nowMs).toISOString().slice(0, 10)) return null;
  const since = estimate.lastReminderAt ?? estimate.sentAt ?? estimate.firstOpenedAt ?? estimate.updatedAt;
  return Date.parse(since) + afterDays * DAY_MS;
}

/** The reminder email: from the company, with the estimate's link. */
export function reminderEmail(r: { clientName?: string; company: string; number: string; title?: string; total: number; link: string; opened: boolean }) {
  const first = r.clientName?.split(/\s+/)[0];
  const what = r.title ? `${r.title} (${r.number})` : `estimate ${r.number}`;
  const total = `$${r.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines = [
    `${first ? `Hi ${first},` : "Hi,"}`,
    `Just checking in on your ${what} from ${r.company}, for ${total}.`,
    r.opened ? "When you're ready, you can accept and sign it here:" : "You can look it over and sign it here:",
    r.link,
    `Questions? Reply to this email and ${r.company} will get back to you.`,
  ];
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    subject: `Your estimate from ${r.company}`,
    text: lines.join("\n\n"),
    html: [
      `<p>${escape(lines[0])}</p>`,
      `<p>${escape(lines[1])}</p>`,
      `<p>${escape(lines[2])}</p>`,
      `<p><a href="${escape(r.link)}" style="display:inline-block;padding:10px 18px;background:#336699;color:#fff;text-decoration:none">View your estimate</a></p>`,
      `<p style="color:#666">${escape(lines[4])}</p>`,
    ].join(""),
  };
}

/** Estimates with a reminder due now, and who to email. */
export const due = internalQuery({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now: at }) => {
    const now = at ?? Date.now();
    const open = [
      ...(await ctx.db.query("estimates").withIndex("by_status", (q) => q.eq("status", "sent")).take(1000)),
      ...(await ctx.db.query("estimates").withIndex("by_status", (q) => q.eq("status", "opened")).take(1000)),
    ];
    const organizations = new Map<string, Doc<"organizations"> | null>();
    const rows = [];
    for (const estimate of open) {
      if (!organizations.has(estimate.organizationId)) organizations.set(estimate.organizationId, await ctx.db.get(estimate.organizationId));
      const organization = organizations.get(estimate.organizationId);
      if (!organization || organization.isSample) continue;
      const next = nextReminderAt(estimate, organization.followUps, now);
      if (next === null || next > now) continue;
      const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
      if (!client?.email) continue;
      rows.push({
        estimateId: estimate._id,
        to: client.email,
        replyTo: organization.email,
        clientName: client.name,
        company: organization.name,
        number: estimate.estimateNumber,
        title: estimate.title,
        total: estimate.totalAmount,
        opened: estimate.status === "opened",
        link: `${siteUrl()}/share/estimate/${estimate.shareToken}`,
        nth: (estimate.remindersSent ?? 0) + 1,
      });
    }
    return rows;
  },
});

/** Counts a reminder that went out, and logs what happened either way. */
export const record = internalMutation({
  args: { estimateId: v.id("estimates"), status: v.string(), to: v.string(), error: v.optional(v.string()), at: v.optional(v.string()) },
  handler: async (ctx, { estimateId, status, to, error, at }) => {
    const estimate = await ctx.db.get(estimateId);
    if (!estimate) return;
    const now = at ?? nowIso();
    if (status === "sent") await ctx.db.patch(estimateId, { remindersSent: (estimate.remindersSent ?? 0) + 1, lastReminderAt: now });
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: estimate.userId,
      action: status === "sent" ? "reminder_sent" : "reminder_failed",
      resourceType: "estimate",
      resourceId: estimateId,
      details: { estimateNumber: estimate.estimateNumber, to, error },
    });
  },
});

/** Emails the reminders that are due (hourly; only in the daytime, Central). */
export const send = internalAction({
  args: { now: v.optional(v.number()), anyHour: v.optional(v.boolean()) },
  handler: async (ctx, { now, anyHour }) => {
    const at = now ?? Date.now();
    const hour = centralHour(at);
    if (!anyHour && (hour < SEND_HOURS.from || hour >= SEND_HOURS.to)) return { sent: 0, failed: 0, skipped: 0 };
    const rows = await ctx.runQuery(internal.followUps.due, { now: at });
    const counts = { sent: 0, failed: 0, skipped: 0 };
    for (const row of rows) {
      const result = await sendEmail([row.to], { ...reminderEmail(row), replyTo: row.replyTo });
      counts[result.status] += 1;
      // Without an email key nothing goes out and nothing is counted, so reminders start once it's set.
      if (result.status !== "skipped") await ctx.runMutation(internal.followUps.record, { estimateId: row.estimateId, status: result.status, to: row.to, error: result.error, at: new Date(at).toISOString() });
    }
    return counts;
  },
});

/** Where one estimate's reminders stand, for its Overview. */
export const status = query({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    const { doc: estimate } = await getOwned(ctx, "estimates", estimateId);
    const organization = await ctx.db.get(estimate.organizationId);
    const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
    const settings = settingsOf(organization?.followUps);
    const next = nextReminderAt(estimate, organization?.followUps);
    return {
      companyOn: settings.enabled,
      afterDays: settings.afterDays,
      on: !estimate.remindersOff,
      clientEmail: client?.email,
      sent: estimate.remindersSent ?? 0,
      max: MAX_REMINDERS,
      lastAt: estimate.lastReminderAt,
      nextAt: next !== null && client?.email ? new Date(Math.max(next, Date.now())).toISOString() : undefined,
      open: estimate.status === "sent" || estimate.status === "opened",
    };
  },
});

/** Turns reminders on or off for one estimate. */
export const setForEstimate = mutation({
  args: { estimateId: v.id("estimates"), on: v.boolean() },
  handler: async (ctx, { estimateId, on }) => {
    await getOwned(ctx, "estimates", estimateId);
    await ctx.db.patch(estimateId, { remindersOff: on ? undefined : true, updatedAt: nowIso() });
    return null;
  },
});
