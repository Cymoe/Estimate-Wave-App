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

export async function uniqueSlug(ctx: MutationCtx, base: string): Promise<string> {
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

/** Creates an organization and makes `userId` its owner. */
export async function createOrganizationWithOwner(
  ctx: MutationCtx,
  userId: Id<"users">,
  fields: { name: string; slug?: string; email?: string; [key: string]: unknown },
): Promise<Id<"organizations">> {
  const now = nowIso();
  const organizationId = await ctx.db.insert("organizations", {
    ...fields,
    name: fields.name,
    slug: await uniqueSlug(ctx, fields.slug ?? fields.name),
    settings: fields.settings ?? {},
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as any);
  await ctx.db.insert("memberships", {
    organizationId,
    userId,
    role: "owner",
    createdAt: now,
  });
  return organizationId;
}
