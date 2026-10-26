import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;
type MemberRole = Doc<"memberships">["role"];

const ROLE_RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

export function fail(code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID", message: string): never {
  throw new ConvexError({ code, message });
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) fail("UNAUTHENTICATED", "You must be signed in");
  const user = await ctx.db.get(userId);
  if (user === null) fail("UNAUTHENTICATED", "User not found");
  return user;
}

export function isSuperAdmin(user: Doc<"users">): boolean {
  return user.role === "super_admin";
}

/** Throws unless the signed-in user owns the platform (money, prices, companies). */
export async function requireSuperAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!isSuperAdmin(user)) fail("FORBIDDEN", "Only Tolliver admins can do this");
  return user;
}

/** Staff run the Lead Market day to day; the owner is staff too. */
export function isStaff(user: Doc<"users">): boolean {
  return user.role === "staff" || isSuperAdmin(user);
}

/** Throws unless the signed-in user is Tolliver staff (or the owner). */
export async function requireStaff(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!isStaff(user)) fail("FORBIDDEN", "Only Tolliver staff can do this");
  return user;
}

/** Callers phone homeowners from call lists; staff and the owner can do it too. */
export function isCaller(user: Doc<"users">): boolean {
  return user.role === "caller" || isStaff(user);
}

/** Throws unless the signed-in user is a Tolliver caller (or staff, or the owner). */
export async function requireCaller(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!isCaller(user)) fail("FORBIDDEN", "Only Tolliver callers can do this");
  return user;
}

/**
 * Throws unless the signed-in user belongs to the organization with at least
 * `minRole`. Super admins pass every check.
 */
export async function requireMember(
  ctx: Ctx,
  organizationId: Id<"organizations">,
  minRole: MemberRole = "member",
): Promise<{ user: Doc<"users">; organization: Doc<"organizations"> }> {
  const user = await requireUser(ctx);
  const organization = await ctx.db.get(organizationId);
  if (organization === null) fail("NOT_FOUND", "Organization not found");
  if (isSuperAdmin(user)) return { user, organization };

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_organization_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", user._id),
    )
    .unique();
  if (membership === null || ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    fail("FORBIDDEN", "You don't have access to this organization");
  }
  return { user, organization };
}

/**
 * For reads only: a member of the company, or Tolliver staff, who look
 * after every company from Ops (its balance, its leads). Changing anything
 * still goes through requireMember or the owner-only guards.
 */
export async function requireMemberOrStaff(
  ctx: Ctx,
  organizationId: Id<"organizations">,
): Promise<{ user: Doc<"users">; organization: Doc<"organizations"> }> {
  const user = await requireUser(ctx);
  if (isStaff(user)) {
    const organization = await ctx.db.get(organizationId);
    if (organization === null) fail("NOT_FOUND", "Organization not found");
    return { user, organization };
  }
  return await requireMember(ctx, organizationId);
}

export async function organizationIdsFor(ctx: Ctx, userId: Id<"users">): Promise<Id<"organizations">[]> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(100);
  return memberships.map((m) => m.organizationId);
}

/**
 * Loads an organization-owned document and checks the caller may access it.
 * Missing documents and documents in other organizations both read as
 * "not found" so IDs from other tenants can't be probed.
 */
export async function getOwned<
  T extends "clients" | "projects" | "estimates" | "activityLogs" | "leads" | "expenses",
>(
  ctx: Ctx,
  table: T,
  id: Id<T>,
  minRole: MemberRole = "member",
): Promise<{ doc: Doc<T>; user: Doc<"users"> }> {
  const normalized = ctx.db.normalizeId(table, id);
  const doc = normalized === null ? null : ((await ctx.db.get(normalized)) as Doc<T> | null);
  if (doc === null) fail("NOT_FOUND", "Not found");
  try {
    const { user } = await requireMember(ctx, doc.organizationId as Id<"organizations">, minRole);
    return { doc, user };
  } catch (error) {
    if (error instanceof ConvexError && error.data?.code === "FORBIDDEN") fail("NOT_FOUND", "Not found");
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Keeps only the keys listed in `fields` and returns a loosely typed object
 * that the schema validator then checks on write. For inserts, null/undefined
 * values are dropped. For patches (`forPatch`), null becomes undefined, which
 * Convex treats as "remove this field".
 */
export function pick(
  data: unknown,
  fields: Record<string, unknown>,
  { forPatch = false }: { forPatch?: boolean } = {},
): Record<string, any> {
  if (data === null || typeof data !== "object") return {};
  const out: Record<string, any> = {};
  for (const key of Object.keys(fields)) {
    if (!(key in data)) continue;
    const value = (data as Record<string, unknown>)[key];
    if (value === undefined || value === null) {
      if (forPatch) out[key] = undefined;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function logActivity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    action: string;
    resourceType: string;
    resourceId?: string;
    details?: unknown;
    metadata?: unknown;
  },
): Promise<Id<"activityLogs">> {
  // Something an assistant did for the person says so (see lib/actor.ts).
  const identity = await ctx.auth.getUserIdentity();
  const assistant = identity?.issuer === "fieldquote-assistant" ? identity.subject.split("|assistant:")[1] : undefined;
  const metadata =
    assistant && !(args.metadata && typeof args.metadata === "object" && "via" in args.metadata)
      ? { ...(args.metadata as Record<string, unknown> | undefined), via: "assistant", connectionId: assistant }
      : args.metadata;
  return await ctx.db.insert("activityLogs", { ...args, ...(metadata !== undefined ? { metadata } : {}), createdAt: nowIso() });
}
