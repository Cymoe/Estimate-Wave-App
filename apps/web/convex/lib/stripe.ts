// Stripe over plain HTTPS: Checkout sessions and webhook signatures. No SDK
// (Convex's default runtime isn't Node) and no Convex imports, so tests can
// use the same helpers to sign what they send.

export interface CheckoutInput {
  amountCents: number;
  bonusCents: number;
  companyName: string;
  token: string;
  organizationId: string;
  requestId: string;
  successUrl: string;
  cancelUrl: string;
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

/** Opens a Stripe Checkout session for one lead-balance top-up and returns where to send the payer. */
export async function createCheckoutSession(
  secretKey: string,
  input: CheckoutInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  params.set("line_items[0][price_data][product_data][name]", `FieldQuote lead balance for ${input.companyName}`);
  if (input.bonusCents > 0) {
    params.set(
      "line_items[0][price_data][product_data][description]",
      `${dollars(input.amountCents)} loaded plus a ${dollars(input.bonusCents)} bonus`,
    );
  }
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("client_reference_id", input.token);
  params.set("metadata[fundingRequestId]", input.requestId);
  params.set("metadata[organizationId]", input.organizationId);
  params.set("metadata[bonusCents]", String(input.bonusCents));
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !body.id || !body.url) throw new Error(body.error?.message ?? `Stripe answered ${res.status}`);
  return { id: body.id, url: body.url };
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** What Stripe puts in the `stripe-signature` header for this body at this second (tests sign with it). */
export async function signStripePayload(secret: string, timestampSec: number, rawBody: string): Promise<string> {
  return `t=${timestampSec},v1=${await hmacHex(secret, `${timestampSec}.${rawBody}`)}`;
}

/** True when the header was signed with our webhook secret for exactly this body, within the last five minutes. */
export async function verifyStripeSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  nowMs = Date.now(),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header) return false;
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestamp = v;
    if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((s) => sameString(s, expected));
}
