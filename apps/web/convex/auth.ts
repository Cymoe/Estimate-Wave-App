import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import { claimInvites } from "./lib/organizations";
import { ResendOTP } from "./lib/resendOtp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET set on the Convex deployment.
    Google,
    // Email + password, with the address proven by a code (needs RESEND_API_KEY).
    Password({
      profile(params) {
        return {
          email: params.email as string,
          ...(params.name ? { name: params.name as string } : {}),
        };
      },
      verify: ResendOTP,
    }),
  ],
  callbacks: {
    /**
     * Runs when an account is created or signs in again. Nothing is handed
     * over on an unproven address: a password sign-up waits for its code
     * (type "verification" fires once the code is right), Google addresses
     * arrive verified. Then the email's staff invite or company invites are
     * claimed, or a first company is made.
     */
    async afterUserCreatedOrUpdated(genericCtx, { userId, type }) {
      if (type !== "oauth" && type !== "verification") return;
      const ctx = genericCtx as unknown as MutationCtx;
      await claimInvites(ctx, userId);
    },
  },
});
