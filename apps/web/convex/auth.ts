import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import { createOrganizationWithOwner } from "./lib/organizations";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET set on the Convex deployment.
    Google,
    Password({
      profile(params) {
        return {
          email: params.email as string,
          ...(params.name ? { name: params.name as string } : {}),
        };
      },
    }),
  ],
  callbacks: {
    // Every new account gets its own company workspace, as the old backend did.
    async afterUserCreatedOrUpdated(genericCtx, { userId, existingUserId }) {
      if (existingUserId !== null) return;
      const ctx = genericCtx as unknown as MutationCtx;
      const user = await ctx.db.get(userId);
      const email = user?.email;
      const displayName = user?.name ?? email?.split("@")[0] ?? "My";
      await createOrganizationWithOwner(ctx, userId, {
        name: `${displayName}'s Company`,
        slug: email?.split("@")[0] ?? displayName,
        email,
      });
    },
  },
});
