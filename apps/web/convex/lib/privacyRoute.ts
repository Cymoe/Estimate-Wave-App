import type { HttpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { SUPPORT_EMAIL, consumerBrand } from "./support";

/**
 * /privacy on the backend's own address: the homeowner brand's privacy policy, for Meta (an app's privacy link, an
 * instant form's privacy link) and anyone who taps it. The app's own /privacy sits behind the preview address's Vercel
 * sign-in, which Meta can't get past. It says the same as the app's policy (src/pages/Legal.tsx) about homeowner
 * requests, in the brand homeowners know. #delete is how to have a request deleted (Meta's "data deletion" link).
 */
export function addPrivacyRoute(http: HttpRouter) {
  http.route({
    path: "/privacy",
    method: "GET",
    handler: httpAction(async () => new Response(privacyHtml(consumerBrand()), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } })),
  });
}

const UPDATED = "November 27, 2026";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function privacyHtml(brandName: string): string {
  const brand = esc(brandName);
  const mail = esc(SUPPORT_EMAIL);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${brand} Privacy Policy</title>
<style>
  body { margin: 0; background: #f6f5f2; color: #1d1c19; font: 16px/1.6 -apple-system, system-ui, "Segoe UI", Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 1.8rem; line-height: 1.2; margin: 0 0 4px; }
  h2 { font-size: 1.15rem; margin: 28px 0 8px; }
  .muted { color: #6b675e; font-size: 14px; }
  ul { padding-left: 1.2em; }
  li { margin: 4px 0; }
  a { color: #1d4f91; }
</style>
</head>
<body>
<main>
  <h1>${brand} Privacy Policy</h1>
  <p class="muted">Last updated ${UPDATED}</p>
  <p>${brand} helps homeowners in Midland, Odessa and nearby get free quotes from local home-service companies. ${brand} is run by Webb Leads of Midland, Texas. This page explains what we collect when you ask for a quote through our ads or forms, how we use it, and the choices you have.</p>

  <h2>What we collect</h2>
  <ul>
    <li>What you give us on a quote form: your name, phone number, email, ZIP code or address, and what you'd like done.</li>
    <li>Whether and when you confirmed the request, and the messages about it.</li>
    <li>Basic technical details needed to run and secure our forms and pages.</li>
  </ul>

  <h2>How we use it</h2>
  <ul>
    <li>To pass your request to <strong>one</strong> local company from the ${brand} network, so they can call or text you about your job.</li>
    <li>To confirm your request by text, and to answer you if you write back.</li>
    <li>To prevent fraud and keep our service working.</li>
  </ul>

  <h2>Who we share it with</h2>
  <ul>
    <li><strong>One local company:</strong> your request and contact details go to the one company that takes it, and to no one else.</li>
    <li><strong>Service providers</strong> that help us run ${brand}: Meta (the ads and forms you used), hosting and database (Vercel, Convex), texting (Twilio) and email (Resend). They may only use it to provide their service to us.</li>
    <li>When the law requires it.</li>
  </ul>
  <p>We don't sell, rent or share mobile phone numbers or text-messaging opt-in data with anyone for their own marketing.</p>

  <h2>Calls and texts</h2>
  <p>When you ask for a quote, you agree that one local company from the ${brand} network may call or text you at the number you gave about that job. Message and data rates may apply. Reply STOP to any text to stop texts from that number, or HELP for help. Agreeing isn't a condition of any purchase.</p>

  <h2 id="delete">Deleting your request</h2>
  <p>Email <a href="mailto:${mail}">${mail}</a> with the name and phone number you used, and we'll delete your request and stop sharing it within 30 days. A company that already received your request keeps its own copy; you can ask them directly to delete it.</p>

  <h2>How long we keep it</h2>
  <p>We keep requests as long as needed to handle the job and any questions about it, then trim them.</p>

  <h2>Children</h2>
  <p>${brand} is for adults. We don't knowingly collect information from anyone under 18.</p>

  <h2>Changes</h2>
  <p>We'll post changes on this page and update the date above.</p>

  <h2>Contact</h2>
  <p>Questions or requests: <a href="mailto:${mail}">${mail}</a>. Webb Leads, Midland, Texas.</p>
</main>
</body>
</html>`;
}
