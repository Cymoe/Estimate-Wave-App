import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { nowIso } from "./access";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Called when a new account is created: if the email was invited to run the
 * Lead Market, make the user staff and mark the invite accepted. Returns
 * whether that happened, so sign-up can skip creating a company.
 */
export async function acceptStaffInvite(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
): Promise<boolean> {
  const invite = await ctx.db
    .query("staffInvites")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .first();
  if (invite === null || invite.acceptedAt) return false;
  await ctx.db.patch(userId, { role: "staff" });
  await ctx.db.patch(invite._id, { acceptedAt: nowIso() });
  return true;
}
