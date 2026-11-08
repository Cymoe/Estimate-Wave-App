import { defineConfig } from "vitest/config";

// Convex functions run in the edge runtime; so do their tests. Texts are logged,
// not sent (SMS_MODE=simulate), and Cal.com is a stub, so nothing real goes out.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
    env: {
      SMS_MODE: "simulate",
      CAL_MODE: "stub",
      APPLY_SECRET: "test-secret",
      TWILIO_AUTH_TOKEN: "test-token",
      TWILIO_WEBHOOK_URL: "https://screener.example/sms",
      MYLES_PHONE: "+14325550000",
      ANTHROPIC_API_KEY: "test-key",
    },
  },
});
