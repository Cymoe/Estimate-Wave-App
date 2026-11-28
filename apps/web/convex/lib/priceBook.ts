import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail, isSuperAdmin, requireMember, requireUser } from "./access";

type Ctx = QueryCtx | MutationCtx;

/** Parses an optional organization id coming from loosely typed UI data. */
export function organizationIdFrom(ctx: Ctx, value: unknown): Id<"organizations"> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const id = typeof value === "string" ? ctx.db.normalizeId("organizations", value) : null;
  if (id === null) fail("INVALID", "Invalid organization id");
  return id;
}

/**
 * Shared catalog rows (no organization) can be read by anyone signed in and
 * written only by super admins. Organization rows need membership.
 */
export async function requireCatalogAccess(
  ctx: Ctx,
  organizationId: Id<"organizations"> | undefined,
  mode: "read" | "write",
): Promise<Doc<"users">> {
  if (organizationId !== undefined) return (await requireMember(ctx, organizationId)).user;
  const user = await requireUser(ctx);
  if (mode === "write" && !isSuperAdmin(user)) {
    fail("FORBIDDEN", "Only administrators can change the shared catalog");
  }
  return user;
}

/** Checks a cost code exists and is usable by items in `organizationId`. */
export async function resolveCostCode(
  ctx: Ctx,
  value: unknown,
  organizationId: Id<"organizations"> | undefined,
): Promise<Id<"costCodes">> {
  const id = typeof value === "string" ? ctx.db.normalizeId("costCodes", value) : null;
  const costCode = id === null ? null : await ctx.db.get(id);
  if (
    costCode === null ||
    (costCode.organization_id !== undefined && costCode.organization_id !== organizationId)
  ) {
    fail("INVALID", "Cost code not found");
  }
  return costCode._id;
}

export function byDisplayOrder<T extends { display_order?: number }>(key: (row: T) => string) {
  return (a: T, b: T) =>
    (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER) ||
    key(a).localeCompare(key(b));
}
