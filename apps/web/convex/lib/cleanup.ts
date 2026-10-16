import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Deletes a company and everything stored under it. Leads it bought from the
 * Lead Market are deleted too. Only for throwaway companies (smoke tests,
 * demo data): real companies are deactivated, never deleted.
 */
export async function deleteOrganization(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<number> {
  let deleted = 0;
  const drop = async (rows: Array<{ _id: Id<any> }>) => {
    for (const row of rows) await ctx.db.delete(row._id);
    deleted += rows.length;
  };
  const byOrg = <
    T extends
      | "memberships"
      | "clients"
      | "projects"
      | "leads"
      | "expenses"
      | "organizationIndustries"
      | "activityLogs"
      | "walletTransactions",
  >(
    table: T,
  ) =>
    ctx.db
      .query(table)
      .withIndex("by_organization" as any, (q: any) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
  for (const table of [
    "memberships",
    "clients",
    "projects",
    "leads",
    "expenses",
    "organizationIndustries",
    "activityLogs",
    "walletTransactions",
  ] as const) {
    await drop(await byOrg(table));
  }
  for (const table of ["estimates", "invoices"] as const) {
    await drop(
      await ctx.db
        .query(table)
        .withIndex("by_organization_and_issue_date", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
    );
  }
  for (const table of ["lineItems", "costCodes", "pricingModes"] as const) {
    await drop(
      await ctx.db
        .query(table)
        .withIndex("by_organization", (q) =>
          q.eq("organization_id", organizationId),
        )
        .collect(),
    );
  }
  await drop(
    await ctx.db
      .query("marketplaceLeads")
      .withIndex("by_organization", (q) =>
        q.eq("assignedOrganizationId", organizationId),
      )
      .collect(),
  );
  await drop(
    await ctx.db
      .query("companyInvites")
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .collect(),
  );
  await ctx.db.delete(organizationId);
  return deleted + 1;
}

/** Deletes a user and their sign-in records. */
export async function deleteUser(ctx: MutationCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }
  await ctx.db.delete(userId);
}
