// Booking through Cal.com's API v2.
//
// Environment: CAL_API_KEY. CAL_MODE=stub returns made-up slots and bookings
// (the simulator and tests), so nothing lands on a real calendar.

const BASE = "https://api.cal.com/v2";

export type Slot = { start: string };
export type Booking = { uid: string; start: string };

const stub = () => process.env.CAL_MODE === "stub";

function headers(version: string) {
  const key = process.env.CAL_API_KEY;
  if (!key) throw new Error("Cal.com isn't set up (CAL_API_KEY)");
  return { authorization: `Bearer ${key}`, "cal-api-version": version, "content-type": "application/json" };
}

/** Open slots for an event type over the next `days` days. */
export async function openSlots(eventTypeId: number | undefined, timeZone: string, days = 7, now = new Date()): Promise<Slot[]> {
  if (stub()) return stubSlots(now);
  if (!eventTypeId) throw new Error("This client has no Cal.com event type id (calEventTypeId)");
  const start = now.toISOString();
  const end = new Date(now.getTime() + days * 86_400_000).toISOString();
  const url = `${BASE}/slots?${new URLSearchParams({ eventTypeId: String(eventTypeId), start, end, timeZone })}`;
  const res = await fetch(url, { headers: headers("2024-09-04") });
  const data = (await res.json().catch(() => ({}))) as { data?: Record<string, Array<{ start: string }>>; error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Cal.com slots ${res.status}`);
  return Object.values(data.data ?? {})
    .flat()
    .map((s) => ({ start: new Date(s.start).toISOString() }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Books a slot for the applicant. Cal.com wants an email; a placeholder is used when the rep hasn't given one. */
export async function book(args: { eventTypeId: number | undefined; start: string; name: string; phone: string; email?: string; timeZone: string }): Promise<Booking> {
  if (stub()) return { uid: `stub-${args.phone.replace(/\D/g, "")}-${Date.parse(args.start)}`, start: new Date(args.start).toISOString() };
  if (!args.eventTypeId) throw new Error("This client has no Cal.com event type id (calEventTypeId)");
  const email = args.email ?? `${args.phone.replace(/\D/g, "")}@${process.env.CAL_PLACEHOLDER_EMAIL_DOMAIN ?? "sms.invalid"}`;
  const res = await fetch(`${BASE}/bookings`, {
    method: "POST",
    headers: headers("2024-08-13"),
    body: JSON.stringify({
      start: new Date(args.start).toISOString(),
      eventTypeId: args.eventTypeId,
      attendee: { name: args.name, email, timeZone: args.timeZone, phoneNumber: args.phone },
      metadata: { source: "sms-screener" },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { uid?: string; start?: string }; error?: { message?: string } };
  if (!res.ok || !data.data?.uid) throw new Error(data.error?.message ?? `Cal.com booking ${res.status}`);
  return { uid: data.data.uid, start: new Date(data.data.start ?? args.start).toISOString() };
}

/** Cancels a booking (a rebook replaces it). */
export async function cancel(uid: string, reason: string): Promise<void> {
  if (stub()) return;
  const res = await fetch(`${BASE}/bookings/${encodeURIComponent(uid)}/cancel`, {
    method: "POST",
    headers: headers("2024-08-13"),
    body: JSON.stringify({ cancellationReason: reason }),
  });
  if (!res.ok) throw new Error(`Cal.com cancel ${res.status}`);
}

/** Two slots a day, 10am and 2pm UTC-ish, on the next three weekdays: enough to book against in a test. */
function stubSlots(now: Date): Slot[] {
  const out: Slot[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (out.length < 6) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    for (const hour of [16, 20]) out.push({ start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour)).toISOString() });
  }
  return out;
}

/** Whether a Cal.com webhook really came from Cal.com: x-cal-signature-256 is the hex HMAC-SHA256 of the raw body. */
export async function calSignatureOk(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
