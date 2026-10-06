import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!url) {
  console.error(
    "VITE_CONVEX_URL is not set. Run `npx convex dev` in apps/web (it writes .env.local) " +
      "or set it to your deployment URL, e.g. https://your-deployment.convex.cloud",
  );
}

/** False when the build had no VITE_CONVEX_URL, so the backend is unreachable. */
export const convexConfigured = Boolean(url);

/** Host the app talks to, shown in connection errors to help diagnose setup. */
export const convexHost = (() => {
  try {
    return new URL(url ?? "").host;
  } catch {
    return url ?? "(none)";
  }
})();

/** The app's single Convex connection (queries, mutations, auth, live updates). */
export const convex = new ConvexReactClient(url ?? "https://missing-convex-url.convex.cloud");
