import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { MESSAGES, langOf } from "./lib/i18n";
import { dollars } from "./lib/wallet";
import { tellStaff } from "./notify";
import { badLeadLine } from "./lib/support";
import { sendEmail, type SendResult } from "./lib/email";

// Other modules import sendEmail from here; it lives in lib/email.ts.
export { sendEmail };

/**
 * Getting an awarded lead to the company in a way a roofer on a roof will
 * notice: the full lead by email, a one-segment text with a link, and a
 * "Got it" button behind the link. Email goes through Resend and texts
 * through Twilio, both plain HTTPS; with no keys on the deployment each
 * channel is recorded as skipped rather than failing the award.
 *
 * Environment (set on the Convex deployment, never committed):
 *   RESEND_API_KEY, RESEND_FROM          email
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   texts
 *   HOMEOWNER_SMS=on                      also text the homeowner (needs form consent)
 *   SITE_URL                              where the links point
 */

/** How long a company has to tap "Got it" before staff step in. */
export const ACK_MINUTES = 15;
/** Outside these hours (Central time) the clock doesn't run. */
export const HOURS = { open: 8, close: 20 };

export const channel = v.union(v.literal("email"), v.literal("sms"), v.literal("homeowner_sms"));

export const siteUrl = () => (process.env.SITE_URL ?? "https://estimate-wave-app-git-fieldquote-convex-cymoes-projects.vercel.app").replace(/\/$/, "");

export const leadLink = (orgLeadId: Id<"leads">, base = siteUrl()) => `${base}/leads?lead=${orgLeadId}&ack=1`;

/** An assistant someone at the company connected (Settings → Assistants). */
export type AssistantApp = "claude" | "chatgpt";
export const ASSISTANT_NAMES: Record<AssistantApp, string> = { claude: "Claude", chatgpt: "ChatGPT" };

/** Opens a new chat in that assistant asking about the lead (the web app's /open page writes the question). */
export const assistantLink = (app: AssistantApp, orgLeadId: Id<"leads">, base = siteUrl()) => `${base}/open/${app}/${orgLeadId}`;

/** How far Central time is from UTC at a moment, in ms (negative: -5h or -6h). */
function centralOffsetMs(ms: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(new Date(ms))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Minutes of business hours (8am to 8pm Central) between two moments: the
 * "Got it" clock. A sale at 7:55pm has five minutes on the clock at
 * closing and the rest from 8am; a sale at 9pm starts at 8am.
 */
export function businessMinutesBetween(startMs: number, endMs: number): number {
  if (!(endMs > startMs)) return 0;
  let total = 0;
  // Walk the Central calendar days from the start's day, adding each day's open window.
  const startLocal = new Date(startMs + centralOffsetMs(startMs));
  let day = Date.UTC(startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate());
  for (let i = 0; i < 400; i++) {
    // DST changes at 2am, outside the window, so midday's offset holds for the whole window
    // (18:00 UTC is midday or 1pm in Central).
    const offset = centralOffsetMs(day + 18 * 3_600_000);
    const open = day + HOURS.open * 3_600_000 - offset;
    const close = day + HOURS.close * 3_600_000 - offset;
    if (open >= endMs) break;
    total += Math.max(0, Math.min(close, endMs) - Math.max(open, startMs));
    day += 24 * 3_600_000;
  }
  return Math.floor(total / 60_000);
}

/** Whether a Central-time moment is inside the hours the clock runs. */
export function withinHours(iso: string): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }).format(new Date(iso)),
  );
  return hour >= HOURS.open && hour < HOURS.close;
}

/** Everyone and everything an alert needs, in one read. */
/** A US number as +1 and ten digits, or undefined when it isn't one. */
function usMobile(raw: string | undefined): string | undefined {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? `+1${digits}` : undefined;
}

/** The text to the homeowner once a company has their request, in their language. */
export function homeownerText(r: { lead: { language?: string }; tradeName: string; company: { name: string; phone?: string } }) {
  return MESSAGES[langOf(r.lead)].matched(r.tradeName.toLowerCase(), r.company.name, r.company.phone);
}

export const recipients = internalQuery({
  args: { orgLeadId: v.id("leads") },
  handler: async (ctx, { orgLeadId }) => {
    const lead = await ctx.db.get(orgLeadId);
    if (lead === null || !lead.marketplaceLeadId) return null;
    const company = await ctx.db.get(lead.organizationId);
    if (company === null) return null;
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_organization", (q) => q.eq("organizationId", lead.organizationId))
      .take(50);
    const people = (await Promise.all(memberships.filter((m) => m.role !== "member").map((m) => ctx.db.get(m.userId)))).filter(
      (u): u is Doc<"users"> => u !== null,
    );
    // Assistants connected to this company, most recently used first: the alert offers to open the lead in them.
    const connections = (
      await ctx.db
        .query("aiConnections")
        .withIndex("by_organization", (q) => q.eq("organizationId", lead.organizationId))
        .take(100)
    )
      .filter((c) => !c.revokedAt && c.refreshExpiresAt > Date.now() && c.app !== "other")
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    const appsOf = (userId?: Id<"users">) => [
      ...new Set(connections.filter((c) => userId === undefined || c.userId === userId).map((c) => c.app as AssistantApp)),
    ];
    const trade = lead.jobType
      ? await ctx.db
          .query("industries")
          .withIndex("by_slug", (q) => q.eq("slug", lead.jobType!))
          .first()
      : null;
    const intake = await ctx.db
      .query("intakeLeads")
      .withIndex("by_confirmed_lead", (q) => q.eq("confirmedLeadId", lead.marketplaceLeadId!))
      .first();
    return {
      lead: {
        id: lead._id,
        marketplaceLeadId: lead.marketplaceLeadId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        address: lead.address,
        city: lead.city,
        county: lead.county,
        notes: lead.notes,
        language: lead.language,
        verified: lead.verified,
        pricePaidCents: lead.pricePaidCents ?? 0,
      },
      tradeName: trade?.name ?? lead.jobType ?? "Lead",
      company: { id: company._id, name: company.name, email: company.email, phone: company.phone },
      emails: [...new Set([company.email, ...people.map((p) => p.email)].filter((e): e is string => Boolean(e)))],
      // Nobody has added a mobile yet: the company's own phone (from its
      // application) gets the text, so the promised text still arrives.
      mobiles: (() => {
        const own = [...new Set(people.map((p) => p.mobile).filter((m): m is string => Boolean(m)))];
        const fallback = usMobile(company.phone);
        return own.length > 0 ? own : fallback ? [fallback] : [];
      })(),
      assistants: appsOf(),
      // Each mobile's own assistants; the company's phone (the fallback) gets the company's.
      mobileAssistants: (() => {
        const byMobile: Record<string, AssistantApp[]> = {};
        for (const p of people) if (p.mobile) byMobile[p.mobile] = [...new Set([...(byMobile[p.mobile] ?? []), ...appsOf(p._id)])];
        const fallback = usMobile(company.phone);
        if (fallback && !(fallback in byMobile)) byMobile[fallback] = appsOf();
        return byMobile;
      })(),
      homeownerConsent: Boolean(intake?.consent?.value && /^(1|true|yes|on|checked)$/i.test(intake.consent.value)),
    };
  },
});

/** Writes what happened with each alert. */
export const record = internalMutation({
  args: {
    rows: v.array(
      v.object({
        orgLeadId: v.id("leads"),
        marketplaceLeadId: v.id("marketplaceLeads"),
        organizationId: v.id("organizations"),
        channel,
        to: v.string(),
        status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
        error: v.optional(v.string()),
        providerId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    const now = nowIso();
    for (const row of rows) await ctx.db.insert("deliveries", { ...row, createdAt: now });
    // A failed send means the company may never see the lead: a person needs to call.
    const failed = rows.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      const lead = await ctx.db.get(failed[0].marketplaceLeadId);
      const company = await ctx.db.get(failed[0].organizationId);
      const who = company?.name ?? "the company";
      await tellStaff(
        ctx,
        `The alert to ${who} failed: ${failed[0].error ?? "unknown error"}`,
        [
          `${lead?.name ?? "A lead"} was sold to ${who}, but ${failed.length === 1 ? "an alert" : `${failed.length} alerts`} did not go out:`,
          ...failed.map((r) => `${r.channel === "email" ? "Email" : r.channel === "sms" ? "Text" : "Homeowner text"} to ${r.to || "nobody"}: ${r.error ?? "failed"}`),
          `Call them${company?.phone ? ` on ${company.phone}` : ""} so they know they have it, then Resend alerts from the Sold tab.`,
        ],
        "/ops?tab=sold",
      );
    }
    return null;
  },
});

type Recipients = NonNullable<Awaited<ReturnType<typeof recipients._handler>>>;

const firstName = (name: string) => name.trim().split(/\s+/)[0];
const digits = (phone?: string) => phone?.replace(/[^\d+]/g, "") ?? "";

type AlertParts = Pick<Recipients, "lead" | "tradeName"> & Partial<Pick<Recipients, "assistants">>;

/**
 * One segment: who, what, where, the number to call, the link. Someone
 * with an assistant connected also gets a link that opens the lead there
 * (that makes it two segments).
 */
export function smsText(r: AlertParts, link: string, assistants: AssistantApp[] = []): string {
  const where = r.lead.city ?? (r.lead.county ? `${r.lead.county} County` : "your area");
  const ask = assistants[0] ? ` Ask ${ASSISTANT_NAMES[assistants[0]]}: ${assistantLink(assistants[0], r.lead.id, new URL(link).origin)}` : "";
  const text = `Webb Leads: new ${r.tradeName.toLowerCase()} lead in ${where}. ${firstName(r.lead.name)} ${r.lead.phone ?? ""}. Details: ${link}${ask} Reply STOP to opt out`;
  return text.replace(/\s+/g, " ").trim();
}

/** The whole lead, since email has no segment cost and contractors forward it. */
export function emailBody(r: AlertParts & Pick<Recipients, "lead">, link: string): { subject: string; text: string; html: string } {
  const lines = [
    `${r.lead.name}${r.lead.phone ? ` · ${r.lead.phone}` : ""}`,
    [r.lead.address, r.lead.city, r.lead.county ? `${r.lead.county} County` : undefined].filter(Boolean).join(", "),
    r.lead.email,
    r.lead.notes,
    r.lead.verified ? `Confirmed with the homeowner by Webb Leads${r.lead.verified.note ? `: ${r.lead.verified.note}` : ""}` : undefined,
    r.lead.pricePaidCents > 0 ? `Yours exclusively for ${dollars(r.lead.pricePaidCents)}.` : "Yours exclusively.",
  ].filter((l): l is string => Boolean(l));
  const support = badLeadLine();
  const subject = `New ${r.tradeName.toLowerCase()} lead: ${r.lead.name}${r.lead.city ? ` in ${r.lead.city}` : ""}`;
  const origin = new URL(link).origin;
  const apps: AssistantApp[] = r.assistants ?? [];
  const open: Array<{ name: string; url: string }> = apps.map((app) => ({ name: ASSISTANT_NAMES[app], url: assistantLink(app, r.lead.id, origin) }));
  const text = `${lines.join("\n")}\n\nTap to open it and tell us you're on it: ${link}\n${open.map((o) => `Open it in ${o.name}: ${o.url}\n`).join("")}\n${support}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p style="font-size:18px;margin:0 0 12px"><strong>New ${esc(r.tradeName.toLowerCase())} lead</strong></p>
${lines.map((l) => `<p style="margin:0 0 6px">${esc(l).replace(/\n/g, "<br>")}</p>`).join("\n")}
${r.lead.phone ? `<p style="margin:12px 0"><a href="tel:${digits(r.lead.phone)}" style="display:inline-block;padding:10px 16px;background:#336699;color:#fff;text-decoration:none;border-radius:4px">Call ${esc(firstName(r.lead.name))}</a></p>` : ""}
<p style="margin:12px 0"><a href="${link}" style="display:inline-block;padding:10px 16px;border:1px solid #336699;color:#336699;text-decoration:none;border-radius:4px">Got it, calling now</a></p>
${open.map((o) => `<p style="margin:0 0 6px"><a href="${o.url}" style="color:#336699">Open it in ${esc(o.name)}</a></p>`).join("\n")}
<p style="color:#666;font-size:13px">Webb Leads sends each lead to one company only. Tapping the button tells our team you have it.</p>
<p style="color:#666;font-size:13px">${esc(support)}</p>
</div>`;
  return { subject, text, html };
}

type Result = SendResult;

async function sendSms(to: string, text: string): Promise<Result> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { status: "skipped", error: "Twilio not set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { status: "failed", error: data.message ?? `Twilio ${res.status}` };
    return { status: "sent", providerId: data.sid };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs right after a sale (scheduled from sellLead) and again on "Resend alerts". */
export const sendLeadAlerts = internalAction({
  args: { orgLeadId: v.id("leads") },
  handler: async (ctx, { orgLeadId }) => {
    const r = await ctx.runQuery(internal.delivery.recipients, { orgLeadId });
    if (r === null) return null;
    const link = leadLink(r.lead.id);
    const base = { orgLeadId: r.lead.id, marketplaceLeadId: r.lead.marketplaceLeadId, organizationId: r.company.id };
    const rows: Array<typeof base & { channel: "email" | "sms" | "homeowner_sms"; to: string } & Result> = [];

    if (r.emails.length === 0) rows.push({ ...base, channel: "email", to: "", status: "skipped", error: "The company has no email on file" });
    else rows.push({ ...base, channel: "email", to: r.emails.join(", "), ...(await sendEmail(r.emails, emailBody(r, link))) });

    if (r.mobiles.length === 0) rows.push({ ...base, channel: "sms", to: "", status: "skipped", error: "Nobody at the company has a mobile for alerts" });
    else
      for (const mobile of r.mobiles)
        rows.push({ ...base, channel: "sms", to: mobile, ...(await sendSms(mobile, smsText(r, link, r.mobileAssistants[mobile] ?? []))) });

    if (process.env.HOMEOWNER_SMS === "on") {
      const to = r.lead.phone ? `+1${r.lead.phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1")}` : "";
      if (!r.homeownerConsent) rows.push({ ...base, channel: "homeowner_sms", to, status: "skipped", error: "No consent recorded on the form" });
      else if (!to) rows.push({ ...base, channel: "homeowner_sms", to, status: "skipped", error: "No phone" });
      else
        rows.push({
          ...base,
          channel: "homeowner_sms",
          to,
          ...(await sendSms(to, homeownerText(r))),
        });
    }
    await ctx.runMutation(internal.delivery.record, { rows });
    return null;
  },
});

/**
 * Every five minutes: a lead sold during hours with no "Got it" after
 * ACK_MINUTES gets one email to staff, once, so someone calls the company.
 * Demo leads and anything older than a day are left alone.
 */
export const escalateOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60_000).toISOString();
    const sold = await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_status", (q) => q.eq("status", "assigned"))
      .order("desc")
      .take(300);
    let escalated = 0;
    for (const lead of sold) {
      if (!lead.assignedAt || lead.acknowledgedAt || lead.handledAt || lead.escalatedAt || lead.isSample || lead.assignedAt < dayAgo) continue;
      // Only business minutes count, and staff are only chased while the clock runs:
      // an evening sale gets its remaining minutes from 8am.
      if (!withinHours(new Date(now).toISOString())) continue;
      const minutesOpen = businessMinutesBetween(Date.parse(lead.assignedAt), now);
      if (minutesOpen < ACK_MINUTES) continue;
      const company = lead.assignedOrganizationId ? await ctx.db.get(lead.assignedOrganizationId) : null;
      const who = company?.name ?? "the company";
      await ctx.db.patch(lead._id, { escalatedAt: nowIso() });
      await tellStaff(
        ctx,
        `No "Got it" from ${who} after ${minutesOpen} min: ${lead.name}`,
        [
          `${lead.name} was sold to ${who} and nobody there has tapped "Got it" after ${minutesOpen} minutes of business hours (8am to 8pm).`,
          `Call them${company?.phone ? ` on ${company.phone}` : ""} and make sure they have the lead.`,
        ],
        "/ops?tab=sold",
      );
      escalated += 1;
    }
    return { escalated };
  },
});

/** Staff called the company and it has the lead: the row stops being red and nobody is chased. */
export const markHandled = mutation({
  args: { leadId: v.id("marketplaceLeads") },
  handler: async (ctx, { leadId }) => {
    const user = await requireStaff(ctx);
    const lead = await ctx.db.get(leadId);
    if (lead === null || !lead.assignedAt) fail("NOT_FOUND", "Lead not found");
    if (lead.handledAt) return lead.handledAt;
    const now = nowIso();
    await ctx.db.patch(leadId, { handledAt: now, handledBy: user._id, updatedAt: now });
    return now;
  },
});

/** Staff send the alerts again, e.g. after the company added a mobile. */
export const resend = mutation({
  args: { orgLeadId: v.id("leads") },
  handler: async (ctx, { orgLeadId }) => {
    await requireStaff(ctx);
    const lead = await ctx.db.get(orgLeadId);
    if (lead === null || !lead.marketplaceLeadId) fail("NOT_FOUND", "Lead not found");
    await ctx.scheduler.runAfter(0, internal.delivery.sendLeadAlerts, { orgLeadId });
    return null;
  },
});

/**
 * The last sold leads: how each went (bid, buy order, Buy now, Vault claim or
 * by hand), what was sent, whether the company has tapped "Got it", and
 * whether it was credited back since. The Sold tab.
 */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const byStatus = (status: "assigned" | "credited", n: number) =>
      ctx.db
        .query("marketplaceLeads")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(n);
    const sold = [...(await byStatus("assigned", 300)), ...(await byStatus("credited", 50))]
      .filter((l) => l.orgLeadId && l.assignedAt)
      .sort((a, b) => (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""))
      .slice(0, 100);
    const now = Date.now();
    return await Promise.all(
      sold.map(async (lead) => {
        const company = lead.assignedOrganizationId ? await ctx.db.get(lead.assignedOrganizationId) : null;
        const orgLead = await ctx.db.get(lead.orgLeadId!);
        const deliveries = await ctx.db
          .query("deliveries")
          .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", lead._id))
          .collect();
        const assignedAt = lead.assignedAt!;
        // Business minutes, the same clock the chase uses: an evening sale isn't late overnight.
        const minutesOpen = businessMinutesBetween(Date.parse(assignedAt), lead.acknowledgedAt ? Date.parse(lead.acknowledgedAt) : now);
        const afterHours = !withinHours(assignedAt);
        return {
          id: lead._id,
          orgLeadId: lead.orgLeadId!,
          name: lead.name,
          jobType: lead.jobType,
          county: lead.county,
          city: lead.city,
          organizationId: company?._id,
          companyName: company?.name ?? "Unknown company",
          companyPhone: company?.phone,
          priceCents: lead.priceCents ?? 0,
          wonVia: orgLead?.wonVia,
          credited: lead.status === "credited",
          assignedAt,
          acknowledgedAt: lead.acknowledgedAt,
          minutesOpen,
          afterHours,
          handledAt: lead.handledAt,
          // Red: nobody has tapped "Got it" within 15 business minutes, and staff haven't
          // called and heard they have it. Demo leads are never chased, so never red.
          overdue: !lead.acknowledgedAt && !lead.handledAt && !lead.isSample && minutesOpen >= ACK_MINUTES,
          deliveries: deliveries
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((d) => ({ id: d._id, channel: d.channel, to: d.to, status: d.status, error: d.error, at: d.createdAt })),
        };
      }),
    );
  },
});
