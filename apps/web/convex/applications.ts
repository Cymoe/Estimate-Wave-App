import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { fail, nowIso, requireStaff, requireSuperAdmin } from "./lib/access";
import { COUNTY_CHOICES, WEST_TEXAS_COUNTIES, normalizeCounty } from "./lib/counties";
import { sendEmail, siteUrl } from "./delivery";
import { knownTrades } from "./industries";
import { createCompanyFor } from "./marketplace";

// Applications from the landing page. A company that wants to buy leads
// fills in a short form; the owner approves it from Ops, which sets the
// company up (trades, phone, an invite for the applicant's email) so the
// funding link can go out right away.

const digits = (phone: string) => phone.replace(/\D/g, "");
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function activeTrades(ctx: QueryCtx) {
  return (await ctx.db.query("industries").take(500))
    .filter((row) => row.is_active)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
    .map((row) => ({ slug: row.slug, name: row.name }));
}

/** What the form offers: real trades, West Texas counties first. No login. */
export const options = query({
  args: {},
  handler: async (ctx) => ({
    trades: await activeTrades(ctx),
    counties: [...COUNTY_CHOICES],
    westTexas: [...WEST_TEXAS_COUNTIES],
  }),
});

function shape(row: Doc<"companyApplications">) {
  return {
    id: row._id,
    companyName: row.companyName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    trades: row.trades,
    county: row.county,
    jobsPerMonth: row.jobsPerMonth,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    organizationId: row.organizationId,
  };
}

/** The form's submit. No login: anyone can apply, once per email or phone. */
export const submit = mutation({
  args: {
    companyName: v.string(),
    contactName: v.string(),
    email: v.string(),
    phone: v.string(),
    trades: v.array(v.string()),
    county: v.string(),
    jobsPerMonth: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const companyName = args.companyName.trim().slice(0, 120);
    const contactName = args.contactName.trim().slice(0, 120);
    const email = args.email.trim().toLowerCase();
    const phone = digits(args.phone).replace(/^1(?=\d{10}$)/, "");
    if (!companyName) fail("INVALID", "Company name is required");
    if (!contactName) fail("INVALID", "Your name is required");
    if (!EMAIL.test(email)) fail("INVALID", "Enter a valid email");
    if (phone.length !== 10) fail("INVALID", "Enter a 10-digit phone number");
    const county = normalizeCounty(args.county);
    if (!county || !COUNTY_CHOICES.includes(county)) fail("INVALID", "Pick a Texas county");
    const trades = await knownTrades(ctx, args.trades);
    if (trades.length === 0) fail("INVALID", "Pick at least one trade");

    const byEmail = await ctx.db
      .query("companyApplications")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("status"), "new"))
      .first();
    const byPhone = await ctx.db
      .query("companyApplications")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .filter((q) => q.eq(q.field("status"), "new"))
      .first();
    if (byEmail || byPhone) return { duplicate: true as const };

    const id = await ctx.db.insert("companyApplications", {
      companyName,
      contactName,
      email,
      phone,
      trades,
      county,
      jobsPerMonth: args.jobsPerMonth?.trim().slice(0, 40) || undefined,
      notes: args.notes?.trim().slice(0, 1000) || undefined,
      status: "new",
      createdAt: nowIso(),
    });
    await ctx.scheduler.runAfter(0, internal.applications.notifyOwner, { id });
    return { duplicate: false as const, id };
  },
});

/** The application plus where to send the note: the platform owner's email. */
export const forNotice = internalQuery({
  args: { id: v.id("companyApplications") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row === null) return null;
    const owner = (await ctx.db.query("users").take(5000)).find((u) => u.role === "super_admin");
    const trades = await activeTrades(ctx);
    const names = new Map(trades.map((t) => [t.slug, t.name]));
    return { application: shape(row), to: owner?.email ?? null, tradeNames: row.trades.map((t) => names.get(t) ?? t) };
  },
});

/** One email to the platform owner per application. Skipped quietly without Resend keys. */
export const notifyOwner = internalAction({
  args: { id: v.id("companyApplications") },
  handler: async (ctx, { id }) => {
    const notice = await ctx.runQuery(internal.applications.forNotice, { id });
    if (!notice || !notice.to) return { status: "skipped" as const };
    const a = notice.application;
    const lines = [
      `${a.companyName} (${a.contactName}) wants to buy leads in ${a.county} County.`,
      `Trades: ${notice.tradeNames.join(", ")}`,
      `Phone: ${a.phone} · Email: ${a.email}`,
      a.jobsPerMonth ? `Jobs a month: ${a.jobsPerMonth}` : "",
      a.notes ? `Notes: ${a.notes}` : "",
      "",
      `Approve or decline it: ${siteUrl()}/ops?tab=companies`,
    ].filter((l) => l !== "");
    return await sendEmail([notice.to], {
      subject: `New lead buyer: ${a.companyName} · ${a.county}`,
      text: lines.join("\n"),
      html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.5">${lines.map((l) => `<p style="margin:0 0 8px">${l}</p>`).join("")}</div>`,
    });
  },
});

/**
 * The applicant hears they are in: sign in with the email they applied with
 * and the company is waiting. Skipped quietly without Resend keys.
 */
export const notifyApplicant = internalAction({
  args: { id: v.id("companyApplications") },
  handler: async (ctx, { id }) => {
    const notice = await ctx.runQuery(internal.applications.forNotice, { id });
    if (!notice || notice.application.status !== "approved") return { status: "skipped" as const };
    const a = notice.application;
    const site = siteUrl();
    const lines = [
      `${a.contactName.trim().split(/\s+/)[0]}, ${a.companyName} is approved to buy ${notice.tradeNames.join(" and ").toLowerCase()} leads in ${a.county} County.`,
      `Go to ${site} and sign in with this address (${a.email}): Continue with Google, or Create an account with it and type the code we email you. Your company is set up and waiting.`,
      "We'll call you about loading your lead balance, so the next confirmed lead in your county can be yours.",
    ];
    return await sendEmail([a.email], {
      subject: `${a.companyName} is approved on FieldQuote`,
      text: lines.join("\n\n"),
      html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.5">${lines.map((l) => `<p style="margin:0 0 10px">${l}</p>`).join("")}<p style="margin:12px 0"><a href="${site}" style="display:inline-block;padding:10px 16px;background:#336699;color:#fff;text-decoration:none;border-radius:4px">Sign in</a></p></div>`,
    });
  },
});

/** Applications waiting on a decision, newest first. Staff. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db
      .query("companyApplications")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .take(200);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(shape);
  },
});

/**
 * Approve: the company is set up with the application's trades and phone,
 * and the applicant becomes its owner when they sign in with that email.
 */
export const approve = mutation({
  args: { id: v.id("companyApplications") },
  handler: async (ctx, { id }) => {
    const user = await requireSuperAdmin(ctx);
    const row = await ctx.db.get(id);
    if (row === null) fail("NOT_FOUND", "Application not found");
    if (row.status !== "new") fail("INVALID", "This application was already decided");
    const organizationId = await createCompanyFor(ctx, user, {
      name: row.companyName,
      ownerEmail: row.email,
      phone: row.phone,
      leadTrades: row.trades,
    });
    await ctx.db.patch(id, { status: "approved", decidedAt: nowIso(), decidedBy: user._id, organizationId });
    await ctx.scheduler.runAfter(0, internal.applications.notifyApplicant, { id });
    return { organizationId };
  },
});

export const decline = mutation({
  args: { id: v.id("companyApplications") },
  handler: async (ctx, { id }) => {
    const user = await requireSuperAdmin(ctx);
    const row = await ctx.db.get(id);
    if (row === null) fail("NOT_FOUND", "Application not found");
    if (row.status !== "new") fail("INVALID", "This application was already decided");
    await ctx.db.patch(id, { status: "declined", decidedAt: nowIso(), decidedBy: user._id });
    return null;
  },
});
