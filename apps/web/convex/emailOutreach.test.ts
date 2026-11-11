import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";
import { addressFor, centralDay, isAutoReply, isOpen, plan, replyText, svixOk, tokenFrom } from "./lib/emailOutreach";
import { rawMessage } from "./lib/gmail";
import { open, seal } from "./lib/secretBox";
import { templateDraft, writeDraft } from "./lib/emailDraft";

const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));
const WEBHOOK = `whsec_${btoa("webhook-secret-bytes-0123456789")}`;
// Tuesday Nov 10 2026, 10am Central.
const NOW = Date.parse("2026-11-10T16:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const decode = (raw: string) => {
  const text = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  // The parts are base64 too: read them back for the asserts.
  return text.replace(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g, (_m, b: string) => `\r\n${new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)))}\r\n--`);
};

describe("email outreach's rules", () => {
  test("a refresh token is sealed so it can be read back, and only with the key", async () => {
    const sealed = await seal("1//refresh-token", KEY);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("refresh");
    expect(await open(sealed, KEY)).toBe("1//refresh-token");
    await expect(open(sealed, btoa("x".repeat(32)))).rejects.toThrow();
  });

  test("the message: footer, unsubscribe headers, reply address and threading", () => {
    const raw = decode(
      rawMessage({
        from: { name: "Jo Webb (Webb Roofing)", email: "jo@gmail.com" },
        to: "owner@oakplaza.com",
        subject: "About 12 Midkiff Rd",
        body: "Hi Robert,\n\nA quick note.",
        footer: "Webb Roofing · 1 Main St, Midland, TX 79701",
        unsubscribeUrl: "https://x.convex.site/u/tok",
        replyTo: "r-tok@replies.webbleads.com",
        messageId: "<tok.1@replies.webbleads.com>",
        inReplyTo: "<tok.0@replies.webbleads.com>",
      }),
    );
    expect(raw).toContain("From: Jo Webb (Webb Roofing) <jo@gmail.com>");
    expect(raw).toContain("Reply-To: r-tok@replies.webbleads.com");
    expect(raw).toContain("List-Unsubscribe: <https://x.convex.site/u/tok>");
    expect(raw).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(raw).toContain("In-Reply-To: <tok.0@replies.webbleads.com>");
    expect(raw).toContain("Webb Roofing · 1 Main St, Midland, TX 79701\nDon't want these emails? Unsubscribe: https://x.convex.site/u/tok");
    expect(raw).toContain('<a href="https://x.convex.site/u/tok"');
  });

  test("the plan: working hours on weekdays, the daily limit, a few minutes apart", () => {
    const rand = () => 0;
    // Friday 4:55pm Central: two fit today, the third goes Monday at 8.
    const friday = Date.parse("2026-11-13T22:55:00.000Z");
    const times = plan(3, { now: friday, cap: 30, rand });
    expect(times.every(isOpen)).toBe(true);
    expect(times.map(centralDay)).toEqual(["2026-11-13", "2026-11-13", "2026-11-16"]);
    expect(times[1] - times[0]).toBe(3 * 60 * 1000);
    // A day already holding 29 takes one more, then the next day.
    const capped = plan(3, { now: NOW, cap: 30, booked: { "2026-11-10": 29 }, rand });
    expect(capped.map(centralDay)).toEqual(["2026-11-10", "2026-11-11", "2026-11-11"]);
  });

  test("who's emailed at which address, and reading a reply", async () => {
    expect(addressFor([{ email: "Wrong@x.com", nameMatch: false }, { email: "maybe@x.com" }, { email: "Sure@X.com", verified: true }])).toBe("sure@x.com");
    expect(addressFor([{ email: "bad@x.com", verified: false }])).toBeUndefined();
    expect(replyText("Yes, call me Thursday.\n\nOn Tue, Nov 10, 2026 at 10:02 AM Jo <jo@gmail.com> wrote:\n> Hi Robert")).toBe("Yes, call me Thursday.");
    expect(isAutoReply("Automatic reply: About 12 Midkiff Rd")).toBe(true);
    expect(isAutoReply("Re: About 12 Midkiff Rd", { "Auto-Submitted": "auto-replied" })).toBe(true);
    expect(isAutoReply("Re: About 12 Midkiff Rd")).toBe(false);
    expect(tokenFrom(["Owner <someone@x.com>", "r-abcdefgh123@replies.webbleads.com"])).toBe("abcdefgh123");
    const body = '{"type":"email.received"}';
    const sig = await sign(body, "msg_1", Math.floor(NOW / 1000));
    expect(await svixOk(WEBHOOK, { id: "msg_1", timestamp: String(Math.floor(NOW / 1000)), signature: sig }, body, NOW)).toBe(true);
    expect(await svixOk(WEBHOOK, { id: "msg_1", timestamp: String(Math.floor(NOW / 1000)), signature: sig }, body + " ", NOW)).toBe(false);
  });

  test("a draft: Claude's when it answers, the template when there's no key", async () => {
    const input = {
      owner: { name: "Oak Plaza LLC", company: "Oak Plaza LLC", person: { name: "Robert Vance", source: "comptroller" }, property: { address: "12 Midkiff Rd", city: "Midland", state: "TX" }, mailing: { address: "1 Main St", city: "Dallas", state: "TX" } },
      why: "Commercial building worth $3M",
      signals: ["Code violation, Roof in disrepair, Oct 2026"],
      sender: { name: "Jo Webb", company: "Webb Roofing", trades: ["Roofing"], phone: "432-555-0100", city: "Midland" },
      followUps: 2,
    };
    const t = templateDraft(input);
    expect(t).toMatchObject({ subject: "About 12 Midkiff Rd", by: "template" });
    expect(t.body).toMatch(/^Hi Robert,/);
    expect(t.body).toContain("Roof in disrepair");
    expect(t.followUps).toHaveLength(2);
    expect(await writeDraft(input, vi.fn(), {})).toMatchObject({ by: "template" });
    const ask = vi.fn(async () => ({ content: [{ type: "text", text: JSON.stringify({ subject: "Re: The roof at 12 Midkiff", body: "Hi Robert, ...", follow_ups: ["Nudge one"] }) }], stop_reason: "end_turn" }));
    const d = await writeDraft(input, ask, { ANTHROPIC_API_KEY: "k" });
    // No "Re:" tricks on a first email; a missing follow-up comes from the template.
    expect(d).toMatchObject({ subject: "The roof at 12 Midkiff", body: "Hi Robert, ...", by: "claude" });
    expect(d.followUps[0]).toBe("Nudge one");
    expect(d.followUps[1]).toBe(t.followUps[1]);
  });
});

async function sign(body: string, id: string, ts: number) {
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(WEBHOOK.replace("whsec_", "")), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return `v1,${btoa(String.fromCharCode(...mac))}`;
}

const PLAN = { monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, status: "active" as const, periodStart: "2026-10-01T00:00:00.000Z", nextChargeAt: "2026-12-01T00:00:00.000Z", claimsThisPeriod: 0 };

async function company(t: ReturnType<typeof setup>) {
  const co = await signUp(t, "jo@webbroofing.example");
  await t.run(async (ctx) => {
    await ctx.db.patch(co.organizationId, { plan: PLAN, name: "Webb Roofing", phone: "432-555-0100" });
    await ctx.db.patch(co.userId, { name: "Jo Webb" });
  });
  return co;
}

async function owner(t: ReturnType<typeof setup>, organizationId: Id<"organizations">, key: string, over: Record<string, unknown> = {}) {
  return await t.run(async (ctx) =>
    ctx.db.insert("outreachContacts", {
      organizationId,
      key,
      name: "Oak Plaza LLC",
      company: "Oak Plaza LLC",
      mailing: { address: "1 MAIN ST", city: "DALLAS", state: "TX", zip: "75201" },
      property: { parcelId: (await ctx.db.insert("parcels", { county: "Midland", cadId: `R-${key}`, useCode: "F1", siteAddress: "12 MIDKIFF RD", addressKey: "12 MIDKIFF RD", owner: "OAK PLAZA LLC", mailing: {}, ownerOccupied: false, companyOwned: true, importedAt: "2026-11-01T00:00:00.000Z" })) as Id<"parcels">, address: "12 Midkiff Rd", useCode: "F1", valueCents: 300_000_000 },
      properties: 1,
      totalValueCents: 300_000_000,
      why: "Commercial building worth $3M",
      kinds: ["commercial"],
      listIds: [],
      status: "new",
      person: { name: "Robert Vance", source: "comptroller" },
      emails: [{ email: `${key}@oakplaza.com`, source: "batchdata", verified: true }],
      createdAt: "2026-11-05T00:00:00.000Z",
      ...over,
    }),
  );
}

/** Google, answering the token call (with an id token for jo@gmail.com) and the send call. */
function fakeGoogle(opts: { revoked?: boolean } = {}) {
  const sent: Array<{ raw: string; threadId?: string }> = [];
  const idToken = `x.${btoa(JSON.stringify({ email: "jo@gmail.com", name: "Jo Webb" }))}.y`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        if (opts.revoked && String(init?.body).includes("refresh_token")) return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 });
        return new Response(JSON.stringify({ access_token: "ya29.access", expires_in: 3599, refresh_token: "1//refresh", scope: "openid email https://www.googleapis.com/auth/gmail.send", id_token: idToken }), { status: 200 });
      }
      if (url.startsWith("https://gmail.googleapis.com/")) {
        const body = JSON.parse(String(init?.body)) as { raw: string; threadId?: string };
        sent.push(body);
        return new Response(JSON.stringify({ id: `m${sent.length}`, threadId: body.threadId ?? `t${sent.length}` }), { status: 200 });
      }
      if (url.startsWith("https://api.resend.com/emails/receiving/")) {
        return new Response(JSON.stringify({ from: "Robert Vance <a@oakplaza.com>", subject: "Re: About 12 Midkiff Rd", text: "Sure, call me Thursday at 2.\n\nOn Tue, Nov 10, 2026 Jo wrote:\n> Hi Robert", headers: {} }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
  return sent;
}

async function connect(t: ReturnType<typeof setup>, co: Awaited<ReturnType<typeof company>>) {
  const url = new URL(await co.as.mutation(api.emailOutreach.connectGmail, { organizationId: co.organizationId, returnTo: "/outreach" }));
  expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/gmail.send");
  expect(url.searchParams.get("access_type")).toBe("offline");
  const res = await t.fetch(`/google/gmail/callback?state=${url.searchParams.get("state")}&code=4/abc`, { redirect: "manual" });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toMatch(/\/outreach\?gmail=connected$/);
}

describe("emailing owners from the company's Gmail", () => {
  test("connect, draft, approve, send from Gmail with follow-ups planned; nothing for owners who can't be emailed", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("AUTH_GOOGLE_ID", "client");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    vi.stubEnv("MAILBOX_KEY", KEY);
    vi.stubEnv("REPLY_DOMAIN", "replies.webbleads.com");
    const t = setup();
    const co = await company(t);
    const org = co.organizationId;
    const sent = fakeGoogle();

    // Before setup is complete, connecting says what's missing.
    vi.stubEnv("MAILBOX_KEY", "");
    await expect(co.as.mutation(api.emailOutreach.connectGmail, { organizationId: org })).rejects.toThrow(/MAILBOX_KEY/);
    vi.stubEnv("MAILBOX_KEY", KEY);
    await connect(t, co);
    await t.run(async (ctx) => {
      const [m] = await ctx.db.query("mailboxes").collect();
      expect(m).toMatchObject({ email: "jo@gmail.com", dailyCap: 30 });
      expect(m.refreshTokenEnc).not.toContain("refresh");
      expect(await open(m.refreshTokenEnc, KEY)).toBe("1//refresh");
    });
    expect(await co.as.query(api.emailOutreach.mailbox, { organizationId: org })).toMatchObject({ connected: { email: "jo@gmail.com", dailyCap: 30 }, postal: null, replies: true });

    const a = await owner(t, org, "a");
    const none = await owner(t, org, "b", { emails: [] });
    const gone = await owner(t, org, "c");
    await t.run(async (ctx) => ctx.db.insert("emailOptOuts", { organizationId: org, email: "c@oakplaza.com", at: "2026-11-01T00:00:00.000Z", how: "unsubscribe" }));
    expect(await co.as.query(api.emailOutreach.check, { organizationId: org, contactIds: [a, none, gone] })).toEqual({
      count: 1,
      sample: 0,
      skipped: ["1 has no email yet: find phones & emails first", "1 asked not to be emailed"],
    });
    // An owner whose only address is someone else's, or failed the check, has an email but isn't sent one; it says so rather than "no email yet".
    const theirs = await owner(t, org, "d", { emails: [{ email: "d@x.com", source: "batchdata", nameMatch: false }] });
    const failed = await owner(t, org, "e", { emails: [{ email: "e@x.com", source: "batchdata", grade: "F" }] });
    expect(await co.as.query(api.emailOutreach.check, { organizationId: org, contactIds: [a, theirs, failed] })).toEqual({
      count: 1,
      sample: 0,
      skipped: ["2 have only an address that failed the check or belongs to someone else"],
    });

    const started = await co.as.mutation(api.emailOutreach.start, { organizationId: org, contactIds: [a, none, gone] });
    expect(started).toMatchObject({ count: 1, more: 0 });
    const campaignId = started.campaignId!;
    await t.finishAllScheduledFunctions(() => {});
    const view = await co.as.query(api.emailOutreach.campaign, { organizationId: org, campaignId });
    expect(view.status).toBe("review");
    expect(view.writing).toBe(0);
    expect(view.owners).toHaveLength(1);
    expect(view.owners[0]).toMatchObject({ name: "Robert Vance", to: "a@oakplaza.com", property: "12 Midkiff Rd" });
    expect(view.owners[0].emails.map((e) => [e.step, e.subject])).toEqual([
      [0, "About 12 Midkiff Rd"],
      [1, "Re: About 12 Midkiff Rd"],
      [2, "Re: About 12 Midkiff Rd"],
    ]);
    // Editing the first email's subject carries to the follow-ups.
    await co.as.mutation(api.emailOutreach.editDraft, { organizationId: org, emailId: view.owners[0].emails[0].id, subject: "Your roof at 12 Midkiff" });

    // No street address yet: the law's footer can't be written, so nothing is approved.
    await expect(co.as.mutation(api.emailOutreach.approve, { organizationId: org, campaignId })).rejects.toThrow(/street address/);
    await t.run(async (ctx) => ctx.db.patch(org, { address: "1 Main St", city: "Midland", state: "TX", zip: "79701" }));
    const approved = await co.as.mutation(api.emailOutreach.approve, { organizationId: org, campaignId });
    expect(approved.count).toBe(1);
    expect(isOpen(approved.first)).toBe(true);
    await t.run(async (ctx) => { expect((await ctx.db.get(a))!.email?.state).toBe("scheduled"); });

    // Its time comes: sent from Gmail, the owner marked emailed, the follow-ups planned 3 and 7 days on.
    vi.setSystemTime(approved.first + 1000);
    expect(await t.action(internal.emailOutreach.sendDue, {})).toEqual({ sent: 1 });
    expect(sent).toHaveLength(1);
    const mail = decode(sent[0].raw);
    expect(mail).toContain("Subject: Your roof at 12 Midkiff");
    expect(mail).toContain("To: a@oakplaza.com");
    expect(mail).toMatch(/Reply-To: r-[\w-]+@replies\.webbleads\.com/);
    expect(mail).toContain("Webb Roofing · 1 Main St, Midland, TX 79701");
    await t.run(async (ctx) => {
      expect((await ctx.db.get(a))!.email?.state).toBe("emailed");
      const emails = await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", a)).collect();
      const [first, f1, f2] = emails.sort((x, y) => x.step - y.step);
      expect(first).toMatchObject({ status: "sent", gmailId: "m1", threadId: "t1" });
      expect(f1).toMatchObject({ status: "scheduled", threadId: "t1", subject: "Re: Your roof at 12 Midkiff" });
      expect(Math.round((f1.sendAt! - approved.first) / 86_400_000)).toBe(3);
      expect(Math.round((f2.sendAt! - approved.first) / 86_400_000)).toBe(7);
    });
    // The first follow-up goes in the same Gmail thread.
    const f1At = await t.run(async (ctx) => (await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", a)).collect()).find((e) => e.step === 1)!.sendAt!);
    vi.setSystemTime(f1At + 1000);
    expect(await t.action(internal.emailOutreach.sendDue, {})).toEqual({ sent: 1 });
    expect(sent[1].threadId).toBe("t1");
    expect(decode(sent[1].raw)).toMatch(/In-Reply-To: <[\w-]+\.0@replies\.webbleads\.com>/);
  });

  test("a reply: Replied, follow-ups stopped, to Leads with the reply, and the contractor told; an out-of-office changes nothing", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("AUTH_GOOGLE_ID", "client");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    vi.stubEnv("MAILBOX_KEY", KEY);
    vi.stubEnv("REPLY_DOMAIN", "replies.webbleads.com");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", WEBHOOK);
    const t = setup();
    const co = await company(t);
    const org = co.organizationId;
    fakeGoogle();
    await connect(t, co);
    await t.run(async (ctx) => ctx.db.patch(org, { address: "1 Main St", city: "Midland", state: "TX" }));
    const a = await owner(t, org, "a");
    const { campaignId } = await co.as.mutation(api.emailOutreach.start, { organizationId: org, contactIds: [a] });
    await t.finishAllScheduledFunctions(() => {});
    const approved = await co.as.mutation(api.emailOutreach.approve, { organizationId: org, campaignId: campaignId! });
    vi.setSystemTime(approved.first + 1000);
    await t.action(internal.emailOutreach.sendDue, {});
    const token = await t.run(async (ctx) => (await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", a)).first())!.replyToken);

    const deliver = async (payload: object, opts: { badSig?: boolean } = {}) => {
      const body = JSON.stringify(payload);
      const ts = Math.floor(Date.now() / 1000);
      return t.fetch("/email/inbound", { method: "POST", headers: { "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": opts.badSig ? "v1,bad" : await sign(body, "msg_1", ts) }, body });
    };
    const event = { type: "email.received", data: { email_id: "in_1", from: "a@oakplaza.com", to: [`r-${token}@replies.webbleads.com`], subject: "Re: About 12 Midkiff Rd" } };
    expect((await deliver(event, { badSig: true })).status).toBe(403);
    expect((await deliver(event)).status).toBe(200);
    await t.finishAllScheduledFunctions(() => {});
    await t.run(async (ctx) => {
      const c = (await ctx.db.get(a))!;
      expect(c.email).toMatchObject({ state: "replied", replyText: "Sure, call me Thursday at 2." });
      expect(c.status).toBe("lead");
      const lead = (await ctx.db.get(c.leadId!))!;
      expect(lead.notes).toContain('replied to your email: "Sure, call me Thursday at 2."');
      const emails = await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", a)).collect();
      expect(emails.filter((e) => e.step > 0).map((e) => e.status)).toEqual(["cancelled", "cancelled"]);
    });
    // The owner's sheet shows the email and the reply.
    const mine = await co.as.query(api.emailOutreach.ofOwner, { organizationId: org, contactId: a });
    expect(mine).toMatchObject({ state: "replied", replyText: "Sure, call me Thursday at 2." });
    expect(mine!.emails.map((e) => [e.step, e.status])).toEqual([[0, "sent"]]);

    // An out-of-office to another owner changes nothing.
    const b = await owner(t, org, "b");
    await t.run(async (ctx) => {
      const campaignId2 = await ctx.db.insert("emailCampaigns", { organizationId: org, createdBy: co.userId, createdAt: "2026-11-10T00:00:00.000Z", followUps: [], status: "sending" });
      await ctx.db.insert("outreachEmails", { organizationId: org, campaignId: campaignId2, contactId: b, step: 0, to: "b@oakplaza.com", subject: "Hi", body: "Hi", status: "sent", replyToken: "tokenforb123" });
    });
    expect(await t.mutation(internal.emailOutreach.recordReply, { token: "tokenforb123", from: "b@oakplaza.com", subject: "Automatic reply: Hi", text: "I'm away" })).toEqual({ ok: false, why: "auto-reply" });
    await t.run(async (ctx) => { expect((await ctx.db.get(b))!.email).toBeUndefined(); });
  });

  test("unsubscribe: the link asks, the one-click POST does it; that address is never emailed again", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const co = await company(t);
    const org = co.organizationId;
    const a = await owner(t, org, "a");
    const token = await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("emailCampaigns", { organizationId: org, createdBy: co.userId, createdAt: "2026-11-10T00:00:00.000Z", followUps: [3], status: "sending" });
      await ctx.db.insert("outreachEmails", { organizationId: org, campaignId, contactId: a, step: 0, to: "a@oakplaza.com", subject: "Hi", body: "Hi", status: "sent", replyToken: "unsubtoken123" });
      await ctx.db.insert("outreachEmails", { organizationId: org, campaignId, contactId: a, step: 1, to: "a@oakplaza.com", subject: "Re: Hi", body: "Hi", status: "scheduled", sendAt: NOW + 3 * 86_400_000, replyToken: "unsubtoken123" });
      return "unsubtoken123";
    });
    const page = await t.fetch(`/u/${token}`);
    expect(await page.text()).toContain("Stop these emails?");
    await t.run(async (ctx) => { expect(await ctx.db.query("emailOptOuts").collect()).toHaveLength(0); });
    const done = await t.fetch(`/u/${token}`, { method: "POST" });
    expect(await done.text()).toContain("Webb Roofing won't email you again.");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("emailOptOuts").collect()).toMatchObject([{ email: "a@oakplaza.com", how: "unsubscribe" }]);
      expect((await ctx.db.get(a))!.email?.state).toBe("opted_out");
      const f = (await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", a)).collect()).find((e) => e.step === 1)!;
      expect(f.status).toBe("cancelled");
    });
    expect((await co.as.query(api.emailOutreach.check, { organizationId: org, contactIds: [a] })).skipped).toEqual(["1 asked not to be emailed"]);
  });

  test("Google takes the permission back: the mailbox shows as lost, sends wait, and a reconnect plans them again", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("AUTH_GOOGLE_ID", "client");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    vi.stubEnv("MAILBOX_KEY", KEY);
    const t = setup();
    const co = await company(t);
    const org = co.organizationId;
    fakeGoogle();
    await connect(t, co);
    await t.run(async (ctx) => {
      await ctx.db.patch(org, { address: "1 Main St", city: "Midland", state: "TX" });
      // An expired access token, so the send has to refresh it.
      const [m] = await ctx.db.query("mailboxes").collect();
      await ctx.db.patch(m._id, { accessExpiresAt: 0 });
    });
    const a = await owner(t, org, "a");
    const { campaignId } = await co.as.mutation(api.emailOutreach.start, { organizationId: org, contactIds: [a], followUps: false });
    await t.finishAllScheduledFunctions(() => {});
    const approved = await co.as.mutation(api.emailOutreach.approve, { organizationId: org, campaignId: campaignId! });
    fakeGoogle({ revoked: true });
    vi.setSystemTime(approved.first + 1000);
    expect(await t.action(internal.emailOutreach.sendDue, {})).toEqual({ sent: 0 });
    expect(await co.as.query(api.emailOutreach.mailbox, { organizationId: org })).toMatchObject({ connected: null, lost: { email: "jo@gmail.com" } });
    await t.run(async (ctx) => { expect((await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", a)).first())!.status).toBe("paused"); });
    fakeGoogle();
    await connect(t, co);
    await t.run(async (ctx) => { expect((await ctx.db.query("outreachEmails").withIndex("by_contact", (q) => q.eq("contactId", a)).first())!.status).toBe("scheduled"); });
  });
});
