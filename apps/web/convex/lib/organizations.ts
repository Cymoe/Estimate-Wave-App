import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { nowIso } from "./access";

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "company";
}

export async function uniqueSlug(
  ctx: MutationCtx,
  base: string,
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  for (let counter = 1; ; counter++) {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();
    if (existing === null) return candidate;
    candidate = `${root}-${counter}`;
  }
}

type OrganizationInput = {
  name: string;
  slug?: string;
  email?: string;
  [key: string]: unknown;
};

/** Creates an organization with no members yet. */
export async function createOrganization(
  ctx: MutationCtx,
  fields: OrganizationInput,
): Promise<Id<"organizations">> {
  const now = nowIso();
  return await ctx.db.insert("organizations", {
    ...fields,
    name: fields.name,
    slug: await uniqueSlug(ctx, fields.slug ?? fields.name),
    settings: fields.settings ?? {},
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as any);
}

/** Creates an organization and makes `userId` its owner. */
export async function createOrganizationWithOwner(
  ctx: MutationCtx,
  userId: Id<"users">,
  fields: OrganizationInput,
): Promise<Id<"organizations">> {
  const now = nowIso();
  const organizationId = await createOrganization(ctx, fields);
  await ctx.db.insert("memberships", {
    organizationId,
    userId,
    role: "owner",
    createdAt: now,
  });
  return organizationId;
}

/** Makes the user owner of every company waiting for their email. Returns whether there were any. */
export async function acceptInvites(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
): Promise<boolean> {
  const invites = await ctx.db
    .query("companyInvites")
    .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
    .collect();
  const open = invites.filter((invite) => !invite.acceptedAt);
  const now = nowIso();
  for (const invite of open) {
    await ctx.db.insert("memberships", {
      organizationId: invite.organizationId,
      userId,
      role: "owner",
      createdAt: now,
    });
    await ctx.db.patch(invite._id, { acceptedAt: now });
  }
  return open.length > 0;
}
