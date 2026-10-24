import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, nowIso, requireSuperAdmin } from "./lib/access";
import { normalizeEmail } from "./lib/staff";

/**
 * Who runs the Lead Market. Only the platform owner manages this list:
 * staff confirm and send leads but never touch money, prices or companies.
 */

/** Staff accounts and the invites still waiting for a sign-up. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const users = (await ctx.db.query("users").take(2000)).filter((u) => u.role === "staff");
    const invites = (await ctx.db.query("staffInvites").take(500)).filter((i) => !i.acceptedAt);
    return {
      staff: users.map((u) => ({ id: u._id, email: u.email ?? "", name: u.name ?? "" })),
      invites: invites.map((i) => ({ id: i._id, email: i.email, createdAt: i.createdAt })),
    };
  },
});

/**
 * Invites someone by email. If they already have an account they become staff
 * right away (their company, if any, is left alone); otherwise the role is
 * applied when they sign up with that email.
 */
export const invite = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("INVALID", "Enter an email address");
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (existing !== null) {
      if (existing.role === "super_admin") fail("INVALID", "That account already owns the platform");
      await ctx.db.patch(existing._id, { role: "staff" });
      return { status: "staff" as const };
    }
    const open = await ctx.db
      .query("staffInvites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (open !== null && !open.acceptedAt) return { status: "invited" as const };
    await ctx.db.insert("staffInvites", { email, invitedBy: admin._id, createdAt: nowIso() });
    return { status: "invited" as const };
  },
});

/** Takes an invite back before it's used. */
export const removeInvite = mutation({
  args: { id: v.id("staffInvites") },
  handler: async (ctx, { id }) => {
    await requireSuperAdmin(ctx);
    const invite = await ctx.db.get(id);
    if (invite === null) return null;
    await ctx.db.delete(id);
    return null;
  },
});

/** Turns a staff account back into an ordinary one. The owner can't demote themselves. */
export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    const admin = await requireSuperAdmin(ctx);
    if (id === admin._id) fail("INVALID", "You can't remove yourself");
    const user = await ctx.db.get(id);
    if (user === null) fail("NOT_FOUND", "Account not found");
    if (user.role !== "staff") fail("INVALID", "That account isn't staff");
    await ctx.db.patch(id, { role: "user" });
    return null;
  },
});
