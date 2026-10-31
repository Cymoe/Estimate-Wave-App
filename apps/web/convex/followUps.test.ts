import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const DAY = 86_400_000;

let emails: Array<Record<string, unknown>> = [];
beforeEach(() => {
  emails = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("SITE_URL", "https://app.example");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      emails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: `em_${emails.length}` }), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A company with an estimate sent to a client with an email; returns when it was sent. */
async function sentEstimate(t: T, client: Record<string, string> = { name: "Ann Miller", email: "ann@example.com" }) {
  const owner = await signUp(t, "owner@peak.example");
  await t.run((ctx) => ctx.db.patch(owner.organizationId, { name: "Peak Roofing", email: "office@peak.example" }));
  const c = (await owner.as.mutation(api.clients.create, { organizationId: owner.organizationId, data: client }))!;
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: { title: "Re-roof", clientId: c._id, items: [{ description: "Shingles", quantity: 1, unitPrice: 9000, totalPrice: 9000 }] },
  }))!;
  const token = await owner.as.mutation(api.estimates.shareLink, { id: estimate._id });
  await owner.as.mutation(api.estimates.update, { id: estimate._id, data: { status: "sent" } });
  const sentAt = Date.parse((await t.run((ctx) => ctx.db.get(estimate._id)))!.sentAt!);
  return { ...owner, estimateId: estimate._id as Id<"estimates">, token, sentAt };
}

const send = (t: T, now: number) => t.action(internal.followUps.send, { now, anyHour: true });

describe("reminders for estimates nobody has signed", () => {
  test("a client who reads Spanish gets the reminder in Spanish, with a link that opens the page in Spanish", async () => {
    const t = setup();
    const { token, sentAt } = await sentEstimate(t, { name: "Ana Ruiz", email: "ana@example.com", language: "es" });
    expect(await send(t, sentAt + 3 * DAY + 1000)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(emails[0]).toMatchObject({ to: ["ana@example.com"], subject: "Tu presupuesto de Peak Roofing" });
    expect(emails[0].text).toContain("Hola Ana:");
    expect(emails[0].text).toContain("Solo para dar seguimiento a tu Re-roof (EST-");
    expect(emails[0].text).toContain(`https://app.example/share/estimate/${token}?lang=es`);
    expect(emails[0].html).toContain("Ver tu presupuesto");
  });

  test("emails the client 3 days after sending and once more 3 days later, then stops", async () => {
    const t = setup();
    const { as, estimateId, token, sentAt } = await sentEstimate(t);
    expect(await send(t, sentAt + 2 * DAY)).toEqual({ sent: 0, failed: 0, skipped: 0 });

    expect(await send(t, sentAt + 3 * DAY + 1000)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(emails[0]).toMatchObject({ to: ["ann@example.com"], subject: "Your estimate from Peak Roofing", reply_to: "office@peak.example" });
    expect(emails[0].text).toContain("Hi Ann,");
    expect(emails[0].text).toContain("Just checking in on your Re-roof (EST-");
    expect(emails[0].text).toContain(`https://app.example/share/estimate/${token}`);
    expect(await send(t, sentAt + 3 * DAY + 2000)).toMatchObject({ sent: 0 });

    const state = await as.query(api.followUps.status, { estimateId });
    expect(state).toMatchObject({ companyOn: true, afterDays: 3, on: true, sent: 1, max: 2, clientEmail: "ann@example.com", open: true });

    expect(await send(t, Date.parse(state.lastAt!) + 3 * DAY + 1000)).toMatchObject({ sent: 1 });
    expect(await send(t, sentAt + 30 * DAY)).toMatchObject({ sent: 0 });
    const log = await t.run((ctx) => ctx.db.query("activityLogs").collect());
    expect(log.filter((l) => l.action === "reminder_sent")).toHaveLength(2);
  });

  test("nothing once it's signed, turned off for the job or the company, or with no client email", async () => {
    const t = setup();
    const { as, organizationId, estimateId, token, sentAt } = await sentEstimate(t);
    await as.mutation(api.followUps.setForEstimate, { estimateId, on: false });
    expect(await send(t, sentAt + 4 * DAY)).toMatchObject({ sent: 0 });
    await as.mutation(api.followUps.setForEstimate, { estimateId, on: true });

    await as.mutation(api.organizations.setFollowUps, { id: organizationId, enabled: false, afterDays: 3 });
    expect(await send(t, sentAt + 4 * DAY)).toMatchObject({ sent: 0 });
    await as.mutation(api.organizations.setFollowUps, { id: organizationId, enabled: true, afterDays: 7 });
    expect(await send(t, sentAt + 4 * DAY)).toMatchObject({ sent: 0 });
    await expect(as.mutation(api.organizations.setFollowUps, { id: organizationId, enabled: true, afterDays: 0 })).rejects.toThrow(/1 to 30/);

    await t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,AAAA" });
    expect(await send(t, sentAt + 8 * DAY)).toMatchObject({ sent: 0 });

    const t2 = setup();
    const noEmail = await sentEstimate(t2, { name: "Bo Diaz", phone: "432-555-0100" });
    expect(await send(t2, noEmail.sentAt + 4 * DAY)).toMatchObject({ sent: 0 });
    expect((await noEmail.as.query(api.followUps.status, { estimateId: noEmail.estimateId })).nextAt).toBeUndefined();
  });

  test("without an email key nothing goes out and nothing is counted; outside the daytime it waits", async () => {
    const t = setup();
    const { estimateId, sentAt } = await sentEstimate(t);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await send(t, sentAt + 4 * DAY)).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect((await t.run((ctx) => ctx.db.get(estimateId)))!.remindersSent).toBeUndefined();

    vi.stubEnv("RESEND_API_KEY", "re_test");
    // 3am Central.
    const night = Date.UTC(2026, 9, 30, 8, 0, 0);
    await t.run((ctx) => ctx.db.patch(estimateId, { sentAt: new Date(night - 5 * DAY).toISOString() }));
    expect(await t.action(internal.followUps.send, { now: night })).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(await t.action(internal.followUps.send, { now: night + 7 * 3_600_000 })).toMatchObject({ sent: 1 });
  });
});
