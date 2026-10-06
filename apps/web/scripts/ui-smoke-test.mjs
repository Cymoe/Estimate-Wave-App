#!/usr/bin/env node
/**
 * Browser check of a deployed site: signs up with a throwaway email account
 * through the real UI and prints what happened (console errors, failed
 * requests, where the app ended up). Used by .github/workflows/ui-smoke.yml.
 *
 *   SITE=https://... node scripts/ui-smoke-test.mjs
 */
import { chromium } from "playwright";

const site = (process.env.SITE ?? "").replace(/\/$/, "");
if (!site) throw new Error("Set SITE");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `ui-smoke+${stamp}@fieldquote.test`;
const password = `Ui-${stamp}-${Math.random().toString(36).slice(2)}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// Vercel preview deployments are behind Vercel login; a "Protection Bypass
// for Automation" secret lets this script through.
const bypass = process.env.VERCEL_BYPASS;
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ...(bypass
    ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }
    : {}),
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`);
});
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
});

function dump(label) {
  console.log(`\n--- ${label} (${problems.length} problems) ---`);
  for (const p of problems.splice(0)) console.log(p.slice(0, 400));
}

const response = await page.goto(site, { waitUntil: "networkidle", timeout: 60000 });
console.log(`GET ${site} -> ${response?.status()} ${page.url()}`);
console.log(`title: ${await page.title()}`);
if (page.url().startsWith("https://vercel.com/login")) {
  console.log("Blocked by Vercel deployment protection. Add a VERCEL_AUTOMATION_BYPASS_SECRET repository secret.");
  await browser.close();
  process.exit(1);
}

const html = await page.content();
const bundles = [...html.matchAll(/src="(\/assets\/index-[^"]+\.js)"/g)].map((m) => m[1]);
for (const bundle of bundles) {
  const js = await (await fetch(site + bundle)).text();
  const urls = [...new Set(js.match(/https:\/\/[a-z0-9-]+\.convex\.cloud|missing-convex-url/g) ?? [])];
  console.log(`Convex URL baked into ${bundle}: ${urls.join(", ") || "(none found)"}`);
}
dump("landing page");

try {
  await page.click("[data-testid=email-signin]", { timeout: 10000 });
  await page.click("text=New here? Create an account");
  const form = page.locator("[data-testid=email-signin-form]");
  await form.locator('input[autocomplete="name"]').fill("UI Smoke Test");
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(10000);
} catch (error) {
  console.log(`sign-up interaction failed: ${error.message}`);
}

console.log(`\nafter sign-up: ${page.url()}`);
const formError = await page.locator("[data-testid=email-signin-form] .text-red-600").textContent().catch(() => null);
if (formError) console.log(`form error shown: ${formError}`);
const storageKeys = await page.evaluate(() => Object.keys(localStorage));
console.log(`localStorage keys: ${storageKeys.join(", ") || "(none)"}`);
console.log(`page text: ${(await page.innerText("body")).replace(/\s+/g, " ").slice(0, 400)}`);
dump("sign-up");

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(5000);
console.log(`\nafter reload: ${page.url()}`);
dump("reload");

await browser.close();
