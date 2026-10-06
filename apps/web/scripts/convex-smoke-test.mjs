#!/usr/bin/env node
/**
 * End-to-end check against a deployed Convex backend: signs up a throwaway
 * email/password user, then exercises the main functions as that user.
 *
 *   CONVEX_URL=https://<deployment>.convex.cloud node scripts/convex-smoke-test.mjs
 */
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const api = anyApi;
const url = process.env.CONVEX_URL;
if (!url) throw new Error("Set CONVEX_URL");

const client = new ConvexHttpClient(url);
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `smoke-test+${stamp}@fieldquote.test`;
const password = `Smoke-${stamp}-${Math.random().toString(36).slice(2)}`;

function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok - ${message}`);
}

// Signed out: data functions must refuse.
let refused = false;
try {
  await client.query(api.organizations.list, {});
} catch {
  refused = true;
}
check(refused, "signed-out callers are rejected");

const result = await client.action(api.auth.signIn, {
  provider: "password",
  params: { email, password, flow: "signUp", name: "Smoke Test" },
});
check(result?.tokens?.token, "email/password sign-up returns a session token");
client.setAuth(result.tokens.token);

const me = await client.query(api.users.me, {});
check(me?.email === email, "users.me returns the new user");
check(me.organizationId, "a company workspace was created on sign-up");

const orgs = await client.query(api.organizations.list, {});
check(orgs.length === 1 && orgs[0]._id === me.organizationId, "user sees only their own organization");
const organizationId = me.organizationId;

const presets = await client.query(api.pricingModes.presets, {});
check(presets.length >= 3, `pricing presets are seeded (${presets.length})`);

const lineItems = await client.query(api.lineItems.list, { organizationId });
check(lineItems.length >= 15, `shared price book is visible (${lineItems.length} items)`);
check(lineItems.every((item) => item.cost_code), "line items include their cost code");

const costCodes = await client.query(api.costCodes.list, {});
check(costCodes.length >= 5, `cost codes are visible (${costCodes.length})`);

const customer = await client.mutation(api.clients.create, {
  organizationId,
  data: { name: "Smoke Test Customer" },
});
check(customer?._id, "can create a client");

const estimate = await client.mutation(api.estimates.create, {
  organizationId,
  data: {
    clientId: customer._id,
    title: "Roof replacement",
    taxRate: 10,
    items: [
      { description: "Tear-off", quantity: 20, unitPrice: 85 },
      { description: "Architectural shingles", quantity: 20, unitPrice: 185 },
    ],
  },
});
check(estimate.totalAmount === 5940, `estimate totals are computed on the server (${estimate.totalAmount})`);

const signed = await client.mutation(api.estimates.sign, { id: estimate._id, signature: "Smoke Test" });
check(signed.status === "accepted", "estimate can be signed");

const activity = await client.query(api.activityLogs.list, { organizationId });
check(activity.length >= 2, `activity log records changes (${activity.length} entries)`);

// Tidy up the records this run created (the throwaway account remains).
await client.mutation(api.estimates.remove, { id: estimate._id });
await client.mutation(api.clients.remove, { id: customer._id });
await client.mutation(api.organizations.remove, { id: organizationId });

console.log(`\nAll smoke checks passed against ${url}`);
