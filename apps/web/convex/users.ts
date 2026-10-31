import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail, isStaff, organizationIdsFor, requireUser } from "./lib/access";

/**
 * The signed-in user in the shape the React app's AuthContext expects,
 * or null when signed out.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const [organizationId] = await organizationIdsFor(ctx, userId);
    return {
      id: user._id,
      email: user.email ?? "",
      name: user.name ?? user.email?.split("@")[0] ?? "User",
      picture: user.image,
      organizationId,
      role: user.role ?? "user",
      isStaff: isStaff(user),
      mobile: user.mobile,
    };
  },
});

/** The number lead alerts are texted to. Ten US digits in, E.164 stored; blank clears it. */
export const setMobile = mutation({
  args: { mobile: v.string() },
  handler: async (ctx, { mobile }) => {
    const user = await requireUser(ctx);
    let digits = mobile.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits && digits.length !== 10) fail("INVALID", "Enter a 10-digit US mobile number");
    await ctx.db.patch(user._id, { mobile: digits ? `+1${digits}` : undefined });
    return digits ? `+1${digits}` : null;
  },
});

/** When email sign-up started needing a code. Password accounts made before then keep working. */
export const EMAIL_CODES_FROM = Date.parse("2026-10-24T17:51:00.000Z");

/**
 * Password accounts made before email codes existed already got their
 * invites and company when they signed up, so they count as proven and are
 * not asked for a code. Accounts made after that are left to verify. Safe
 * to re-run: an account already marked is skipped.
 *
 *   npx convex run users:keepEarlierPasswordAccounts
 */
export const keepEarlierPasswordAccounts = internalMutation({
  args: { before: v.optional(v.number()) },
  handler: async (ctx, { before = EMAIL_CODES_FROM }) => {
    const accounts = await ctx.db.query("authAccounts").take(10000);
    let marked = 0;
    for (const account of accounts) {
      if (account.provider !== "password" || account.emailVerified || account._creationTime >= before) continue;
      await ctx.db.patch(account._id, { emailVerified: account.providerAccountId });
      marked++;
    }
    return { marked };
  },
});
