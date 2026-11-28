import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, nowIso, requireSuperAdmin } from "./lib/access";
import { normalizeEmail } from "./lib/staff";

/**
 * Who runs the Lead Market. Only the platform owner manages this list:
 * staff confirm and send leads but never touch money, prices or companies;
 * callers phone homeowners from call lists and see nothing else of Ops.
 */

const teamRole = v.union(v.literal("staff"), v.literal("caller"));
const onTeam = (role: string | undefined): role is "staff" | "caller" => role === "staff" || role === "caller";

/** Staff and caller accounts, and the invites still waiting for a sign-up. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const users = (await ctx.db.query("users").take(2000)).filter((u) => onTeam(u.role));
    const invites = (await ctx.db.query("staffInvites").take(500)).filter((i) => !i.acceptedAt);
    return {
      staff: users.map((u) => ({ id: u._id, email: u.email ?? "", name: u.name ?? "", role: u.role as "staff" | "caller" })),
      invites: invites.map((i) => ({ id: i._id, email: i.email, role: i.role ?? "staff", createdAt: i.createdAt })),
    };
  },
});

/**
 * Invites someone by email as staff (the default) or a caller. If they
 * already have an account they get the role right away (their company, if
 * any, is left alone); otherwise it is applied when they sign up with that
 * email.
 */
export const invite = mutation({
  args: { email: v.string(), role: v.optional(teamRole) },
  handler: async (ctx, args) => {
    const role = args.role ?? "staff";
    const admin = await requireSuperAdmin(ctx);
    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("INVALID", "Enter an email address");
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (existing !== null) {
      if (existing.role === "super_admin") fail("INVALID", "That account already owns the platform");
      await ctx.db.patch(existing._id, { role });
      return { status: role };
    }
    const open = await ctx.db
      .query("staffInvites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (open !== null && !open.acceptedAt) {
      if ((open.role ?? "staff") !== role) await ctx.db.patch(open._id, { role });
      return { status: "invited" as const };
    }
    await ctx.db.insert("staffInvites", { email, role, invitedBy: admin._id, createdAt: nowIso() });
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

/** Turns a staff or caller account back into an ordinary one. The owner can't demote themselves. */
export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    const admin = await requireSuperAdmin(ctx);
    if (id === admin._id) fail("INVALID", "You can't remove yourself");
    const user = await ctx.db.get(id);
    if (user === null) fail("NOT_FOUND", "Account not found");
    if (!onTeam(user.role)) fail("INVALID", "That account isn't on the team");
    await ctx.db.patch(id, { role: "user" });
    return null;
  },
});
