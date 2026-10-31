import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, isSuperAdmin, nowIso, organizationIdsFor, pick, requireMember, requireUser } from "./lib/access";
import { createOrganizationWithOwner, uniqueSlug } from "./lib/organizations";
import { organizationFields } from "./schema";

/** Organizations the signed-in user belongs to (all of them for super admins). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (isSuperAdmin(user)) {
      // Deactivated companies (e.g. ones removed by their owner) stay hidden.
      return (await ctx.db.query("organizations").order("desc").take(500)).filter((org) => org.isActive);
    }
    const ids = await organizationIdsFor(ctx, user._id);
    const orgs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return orgs
      .filter((org): org is Doc<"organizations"> => org !== null && org.isActive)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/** The signed-in user's role in an organization (super admins count as owners). */
export const myRole = query({
  args: { id: v.id("organizations") },
  handler: async (ctx, { id }) => {
    const { user } = await requireMember(ctx, id);
    if (isSuperAdmin(user)) return "owner";
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_organization_and_user", (q) => q.eq("organizationId", id).eq("userId", user._id))
      .unique();
    return membership?.role ?? "member";
  },
});

export const get = query({
  args: { id: v.id("organizations") },
  handler: async (ctx, { id }) => {
    const { organization } = await requireMember(ctx, id);
    return organization;
  },
});

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const user = await requireUser(ctx);
    const fields = pick(data, organizationFields);
    if (typeof fields.name !== "string" || fields.name.trim() === "") {
      fail("INVALID", "Organization name is required");
    }
    const id = await createOrganizationWithOwner(ctx, user._id, fields as { name: string });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("organizations"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    await requireMember(ctx, id, "admin");
    const patch = pick(data, organizationFields, { forPatch: true });
    if (patch.slug !== undefined) {
      const existing = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", patch.slug))
        .first();
      if (existing !== null && existing._id !== id) patch.slug = await uniqueSlug(ctx, patch.slug);
    }
    await ctx.db.patch(id, { ...patch, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

/**
 * The company's wording for the built-in agreement: default payment terms
 * and warranty (an estimate can still override them) and extra clauses of
 * the company's own. Blank means the Webb Leads default. Owners and admins only.
 */
export const setAgreement = mutation({
  args: {
    id: v.id("organizations"),
    paymentTerms: v.optional(v.string()),
    warranty: v.optional(v.string()),
    extraTerms: v.optional(v.string()),
  },
  handler: async (ctx, { id, paymentTerms, warranty, extraTerms }) => {
    await requireMember(ctx, id, "admin");
    const clean = (text: string | undefined, max: number) => text?.trim().slice(0, max) || undefined;
    const agreement = { paymentTerms: clean(paymentTerms, 1000), warranty: clean(warranty, 200), extraTerms: clean(extraTerms, 10000) };
    await ctx.db.patch(id, { agreement, updatedAt: nowIso() });
    return agreement;
  },
});

/**
 * How clients pay the company: the deposit asked when an estimate is
 * signed (0 for none), the company's own pay link and instructions shown
 * to the client. Owners and admins only.
 */
export const setPayments = mutation({
  args: {
    id: v.id("organizations"),
    depositPercent: v.number(),
    payLink: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, { id, depositPercent, payLink, instructions }) => {
    await requireMember(ctx, id, "admin");
    if (!Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > 100) fail("INVALID", "The deposit is a percent from 0 to 100");
    const link = payLink?.trim() || undefined;
    if (link) {
      let url: URL | null = null;
      try {
        url = new URL(link);
      } catch {
        url = null;
      }
      if (!url || url.protocol !== "https:") fail("INVALID", "The pay link must start with https://");
    }
    await ctx.db.patch(id, {
      payments: { depositPercent: Math.round(depositPercent * 100) / 100, payLink: link, instructions: instructions?.trim().slice(0, 1000) || undefined },
      updatedAt: nowIso(),
    });
    return (await ctx.db.get(id))!.payments;
  },
});

/** Reminder emails to clients who haven't signed: on or off, and how many days after sending. */
export const setFollowUps = mutation({
  args: { id: v.id("organizations"), enabled: v.boolean(), afterDays: v.number() },
  handler: async (ctx, { id, enabled, afterDays }) => {
    await requireMember(ctx, id, "admin");
    if (!Number.isInteger(afterDays) || afterDays < 1 || afterDays > 30) fail("INVALID", "Remind after 1 to 30 days");
    await ctx.db.patch(id, { followUps: { enabled, afterDays }, updatedAt: nowIso() });
    return { enabled, afterDays };
  },
});

/**
 * Deactivates the organization (owner only). Its data is kept so it can be
 * restored; it just stops appearing for its members.
 */
export const remove = mutation({
  args: { id: v.id("organizations") },
  handler: async (ctx, { id }) => {
    await requireMember(ctx, id, "owner");
    await ctx.db.patch(id, { isActive: false, updatedAt: nowIso() });
    return { message: "Organization deleted successfully" };
  },
});
