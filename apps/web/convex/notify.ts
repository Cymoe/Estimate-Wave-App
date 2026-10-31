import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type MutationCtx } from "./_generated/server";
import { sendEmail, siteUrl } from "./delivery";

/**
 * Things that need a person at Webb Leads, by email, the moment they happen:
 * a lead to confirm, a company that has not said "Got it", an alert that
 * failed to send, a webhook hit that was turned away. One short email each,
 * to the owner and staff, with a link to the tab where the work is. Sent
 * through Resend like the lead alerts; skipped quietly without a key.
 */

/** Everyone who runs Ops: the owner and staff with an email. */
export const staffEmails = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(5000);
    return [...new Set(users.filter((u) => u.role === "super_admin" || u.role === "staff").map((u) => u.email).filter((e): e is string => Boolean(e)))];
  },
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const send = internalAction({
  args: { subject: v.string(), lines: v.array(v.string()), path: v.string() },
  handler: async (ctx, { subject, lines, path }) => {
    const to = await ctx.runQuery(internal.notify.staffEmails, {});
    if (to.length === 0) return { status: "skipped" as const, error: "Nobody on staff has an email" };
    const link = `${siteUrl()}${path}`;
    const text = [...lines, "", link].join("\n");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">
${lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("\n")}
<p style="margin:12px 0"><a href="${link}" style="display:inline-block;padding:10px 16px;background:#336699;color:#fff;text-decoration:none;border-radius:4px">Open Ops</a></p>
</div>`;
    return await sendEmail(to, { subject: `Webb Leads Ops: ${subject}`, text, html });
  },
});

/** Queues one email to staff from inside a mutation; the send happens after the write commits. */
export async function tellStaff(ctx: MutationCtx, subject: string, lines: string[], path: string): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.notify.send, { subject, lines, path });
}

/** Who hears about money at a company: its own email and its owners' and admins'. */
export const companyEmails = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const organization = await ctx.db.get(organizationId);
    if (!organization || organization.isSample) return [];
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(50);
    const people = await Promise.all(memberships.filter((m) => m.role !== "member").map((m) => ctx.db.get(m.userId)));
    return [...new Set([organization.email, ...people.map((p) => p?.email)].filter((e): e is string => Boolean(e)))];
  },
});

/** One short email to a company (not to staff), with a button to the page that fixes it. */
export const company = internalAction({
  args: { organizationId: v.id("organizations"), subject: v.string(), lines: v.array(v.string()), path: v.string(), button: v.string() },
  handler: async (ctx, { organizationId, subject, lines, path, button }) => {
    const to = await ctx.runQuery(internal.notify.companyEmails, { organizationId });
    if (to.length === 0) return { status: "skipped" as const, error: "The company has no email" };
    const link = `${siteUrl()}${path}`;
    const text = [...lines, "", `${button}: ${link}`].join("\n");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">
${lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("\n")}
<p style="margin:12px 0"><a href="${link}" style="display:inline-block;padding:10px 16px;background:#336699;color:#fff;text-decoration:none;border-radius:4px">${esc(button)}</a></p>
</div>`;
    return await sendEmail(to, { subject: `Webb Leads: ${subject}`, text, html });
  },
});

/** Queues one email to a company from inside a mutation. */
export async function tellCompany(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  message: { subject: string; lines: string[]; path: string; button: string },
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.notify.company, { organizationId, ...message });
}
