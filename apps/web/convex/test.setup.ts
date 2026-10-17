/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

export const modules = import.meta.glob("./**/!(*.*.*)*.*s");

export function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

/** Creates a user with their own organization and returns a client acting as them. */
export async function signUp(t: T, email: string, opts: { role?: "super_admin" } = {}) {
  const now = new Date().toISOString();
  const { userId, organizationId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email, name: email.split("@")[0], ...opts });
    const organizationId = await ctx.db.insert("organizations", {
      name: `${email} Co`,
      slug: email.replace(/[^a-z0-9]/g, "-"),
      settings: {},
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("memberships", { organizationId, userId, role: "owner", createdAt: now });
    return { userId, organizationId };
  });
  // Convex Auth identities carry "<userId>|<sessionId>" as the subject.
  const as = t.withIdentity({ subject: `${userId}|session-${userId}` });
  return { as, userId: userId as Id<"users">, organizationId: organizationId as Id<"organizations"> };
}
