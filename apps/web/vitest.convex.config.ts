import path from "path";
import { defineConfig } from "vitest/config";

// Tests for the Convex backend (convex/**/*.test.ts), run in the edge runtime
// Convex functions use. The React app's tests still run under Jest.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
