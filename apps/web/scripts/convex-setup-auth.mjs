#!/usr/bin/env node
/**
 * Non-interactive Convex Auth setup for CI (what `npx @convex-dev/auth` does).
 * Uses CONVEX_DEPLOY_KEY to pick the deployment. Only sets values that are
 * missing, so existing sessions keep working across runs.
 *
 *   SITE_URL=https://your-site node scripts/convex-setup-auth.mjs
 */
import { execFileSync } from "node:child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

function convex(args) {
  return execFileSync("npx", ["convex", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function envGet(name) {
  try {
    return convex(["env", "get", name]);
  } catch {
    return "";
  }
}

function envSet(name, value) {
  // `--` keeps values that start with "-" (like PEM keys) from being read as flags.
  convex(["env", "set", name, "--", value]);
  console.log(`Set ${name}`);
}

if (!envGet("JWT_PRIVATE_KEY") || !envGet("JWKS")) {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  envSet("JWT_PRIVATE_KEY", privateKey.trimEnd().replace(/\n/g, " "));
  envSet("JWKS", JSON.stringify({ keys: [{ use: "sig", ...publicKey }] }));
} else {
  console.log("JWT_PRIVATE_KEY and JWKS already set");
}

const siteUrl = process.env.SITE_URL;
if (siteUrl && envGet("SITE_URL") !== siteUrl) {
  envSet("SITE_URL", siteUrl);
} else {
  console.log(`SITE_URL is ${envGet("SITE_URL") || "(unset)"}`);
}
