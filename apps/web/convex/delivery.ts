import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { dollars } from "./lib/wallet";

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

const siteUrl = () => (process.env.SITE_URL ?? "https://estimate-wave-app-git-fieldquote-convex-cymoes-projects.vercel.app").replace(/\/$/, "");

export const leadLink = (orgLeadId: Id<"leads">, base = siteUrl()) => `${base}/leads?lead=${orgLeadId}&ack=1`;

/** Whether a Central-time moment is inside the hours the clock runs. */
export function withinHours(iso: string): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }).format(new Date(iso)),
  );
  return hour >= HOURS.open && hour < HOURS.close;
}

/** Everyone and everything an alert needs, in one read. */
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
        verified: lead.verified,
        pricePaidCents: lead.pricePaidCents ?? 0,
      },
      tradeName: trade?.name ?? lead.jobType ?? "Lead",
      company: { id: company._id, name: company.name, email: company.email, phone: company.phone },
      emails: [...new Set([company.email, ...people.map((p) => p.email)].filter((e): e is string => Boolean(e)))],
      mobiles: [...new Set(people.map((p) => p.mobile).filter((m): m is string => Boolean(m)))],
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
    return null;
  },
});

type Recipients = NonNullable<Awaited<ReturnType<typeof recipients._handler>>>;

const firstName = (name: string) => name.trim().split(/\s+/)[0];
const digits = (phone?: string) => phone?.replace(/[^\d+]/g, "") ?? "";

/** One segment: who, what, where, the number to call, the link. */
export function smsText(r: Recipients, link: string): string {
  const where = r.lead.city ?? (r.lead.county ? `${r.lead.county} County` : "your area");
  const text = `FieldQuote: new ${r.tradeName.toLowerCase()} lead in ${where}. ${firstName(r.lead.name)} ${r.lead.phone ?? ""}. Details: ${link} Reply STOP to opt out`;
  return text.replace(/\s+/g, " ").trim();
}

/** The whole lead, since email has no segment cost and contractors forward it. */
export function emailBody(r: Recipients, link: string): { subject: string; text: string; html: string } {
  const lines = [
    `${r.lead.name}${r.lead.phone ? ` · ${r.lead.phone}` : ""}`,
    [r.lead.address, r.lead.city, r.lead.county ? `${r.lead.county} County` : undefined].filter(Boolean).join(", "),
    r.lead.email,
    r.lead.notes,
    r.lead.verified ? `Confirmed with the homeowner by FieldQuote${r.lead.verified.note ? `: ${r.lead.verified.note}` : ""}` : undefined,
    r.lead.pricePaidCents > 0 ? `Yours exclusively for ${dollars(r.lead.pricePaidCents)}.` : "Yours exclusively.",
  ].filter((l): l is string => Boolean(l));
  const subject = `New ${r.tradeName.toLowerCase()} lead: ${r.lead.name}${r.lead.city ? ` in ${r.lead.city}` : ""}`;
  const text = `${lines.join("\n")}\n\nTap to open it and tell us you're on it: ${link}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p style="font-size:18px;margin:0 0 12px"><strong>New ${esc(r.tradeName.toLowerCase())} lead</strong></p>
${lines.map((l) => `<p style="margin:0 0 6px">${esc(l).replace(/\n/g, "<br>")}</p>`).join("\n")}
${r.lead.phone ? `<p style="margin:12px 0"><a href="tel:${digits(r.lead.phone)}" style="display:inline-block;padding:10px 16px;background:#336699;color:#fff;text-decoration:none;border-radius:4px">Call ${esc(firstName(r.lead.name))}</a></p>` : ""}
<p style="margin:12px 0"><a href="${link}" style="display:inline-block;padding:10px 16px;border:1px solid #336699;color:#336699;text-decoration:none;border-radius:4px">Got it, calling now</a></p>
<p style="color:#666;font-size:13px">FieldQuote sends each lead to one company only. Tapping the button tells our team you have it.</p>
</div>`;
  return { subject, text, html };
}

type Result = { status: "sent" | "failed" | "skipped"; error?: string; providerId?: string };

async function sendEmail(to: string[], body: { subject: string; text: string; html: string }): Promise<Result> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "FieldQuote <leads@fieldquote.app>";
  if (!key) return { status: "skipped", error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", error: data.message ?? `Resend ${res.status}` };
    return { status: "sent", providerId: data.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

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
    else for (const mobile of r.mobiles) rows.push({ ...base, channel: "sms", to: mobile, ...(await sendSms(mobile, smsText(r, link))) });

    if (process.env.HOMEOWNER_SMS === "on") {
      const to = r.lead.phone ? `+1${r.lead.phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1")}` : "";
      if (!r.homeownerConsent) rows.push({ ...base, channel: "homeowner_sms", to, status: "skipped", error: "No consent recorded on the form" });
      else if (!to) rows.push({ ...base, channel: "homeowner_sms", to, status: "skipped", error: "No phone" });
      else
        rows.push({
          ...base,
          channel: "homeowner_sms",
          to,
          ...(await sendSms(to, `FieldQuote: your ${r.tradeName.toLowerCase()} request was matched. ${r.company.name} will call you${r.company.phone ? ` from ${r.company.phone}` : " shortly"}. Reply STOP to opt out`)),
        });
    }
    await ctx.runMutation(internal.delivery.record, { rows });
    return null;
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

/** The last awarded leads with what was sent and whether the company has tapped "Got it". */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const sold = (
      await ctx.db
        .query("marketplaceLeads")
        .withIndex("by_status", (q) => q.eq("status", "assigned"))
        .order("desc")
        .take(300)
    )
      .filter((l) => l.orgLeadId && l.assignedAt)
      .sort((a, b) => (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""))
      .slice(0, 100);
    const now = Date.now();
    return await Promise.all(
      sold.map(async (lead) => {
        const company = lead.assignedOrganizationId ? await ctx.db.get(lead.assignedOrganizationId) : null;
        const deliveries = await ctx.db
          .query("deliveries")
          .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", lead._id))
          .collect();
        const assignedAt = lead.assignedAt!;
        const minutesOpen = lead.acknowledgedAt
          ? Math.round((Date.parse(lead.acknowledgedAt) - Date.parse(assignedAt)) / 60_000)
          : Math.round((now - Date.parse(assignedAt)) / 60_000);
        const afterHours = !withinHours(assignedAt);
        return {
          id: lead._id,
          orgLeadId: lead.orgLeadId!,
          name: lead.name,
          jobType: lead.jobType,
          county: lead.county,
          city: lead.city,
          companyName: company?.name ?? "Unknown company",
          priceCents: lead.priceCents ?? 0,
          assignedAt,
          acknowledgedAt: lead.acknowledgedAt,
          minutesOpen,
          afterHours,
          // Red: nobody has tapped "Got it" inside the window, during hours.
          overdue: !lead.acknowledgedAt && !afterHours && minutesOpen >= ACK_MINUTES,
          deliveries: deliveries
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((d) => ({ id: d._id, channel: d.channel, to: d.to, status: d.status, error: d.error, at: d.createdAt })),
        };
      }),
    );
  },
});
