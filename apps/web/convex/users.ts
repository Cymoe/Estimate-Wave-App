import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { organizationIdsFor } from "./lib/access";

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
    };
  },
});
