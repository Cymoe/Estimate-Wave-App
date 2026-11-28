import type Anthropic from "@anthropic-ai/sdk";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules, signUp } from "../test.setup";
import { briefText } from "./reports";

const claude = vi.hoisted(() => ({ script: [] as unknown[], calls: 0 }));
vi.mock("./lib/claude", () => ({
  MODEL: () => "test-model",
  createMessage: async () => {
    claude.calls++;
    const next = claude.script.shift();
    if (!next) throw new Error("fake Claude: the script ran out");
    return next;
  },
  createJson: async () => {
    throw new Error("not in these tests");
  },
}));
const say = (text: string) =>
  ({ id: "m", type: "message", role: "assistant", model: "test", content: [{ type: "text", text, citations: null }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Anthropic.Message;

const NOW = Date.parse("2026-11-09T16:00:00.000Z");
type Call = { url: string; body: string };
let calls: Call[];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
  vi.stubEnv("RECRUIT_TWILIO_FROM", "+14325559999");
  vi.stubEnv("RECRUIT_FLAG_PHONES", "+14325558888");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("SITE_URL", "https://app.example");
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      return new Response(JSON.stringify({ sid: "SM1", id: "em1" }), { status: 201 });
    }),
  );
  claude.script.length = 0;
  claude.calls = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const texts = () => calls.filter((c) => c.url.includes("twilio")).map((c) => Object.fromEntries(new URLSearchParams(c.body)));
const emails = () => calls.filter((c) => c.url.includes("resend")).map((c) => JSON.parse(c.body) as { to: string[]; subject: string; text: string });

async function setUp(status: "flagged" | "screening" = "flagged") {
  const t = convexTest(schema, modules);
  const staff = (await signUp(t, "myles@webbleads.example", { role: "staff" })).as;
  const clientId = (await staff.mutation(api.recruiting.ops.saveClient, {
    name: "Acme Roofing",
    role: "Roofing sales rep",
    city: "Midland, TX",
    compSheet: "10% of every roof. Earnings vary.",
    calEventLink: "https://cal.com/acme/interview",
    timezone: "America/Chicago",
    reportEmail: "hiring@acme.example",
  })) as Id<"recruitClients">;
  const applicantId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("recruitApplicants", {
      name: "Omar Diaz",
      phone: "+14325550100",
      clientId,
      sourceAdId: "acme-m1",
      answers: { d2d: "sold cars 2 years" },
      score: "B",
      status,
      notes: status === "flagged" ? "Flagged: asked about a 2015 conviction." : undefined,
      followUps: 0,
      createdAt: new Date(NOW - 3_600_000).toISOString(),
      lastOutboundAt: new Date(NOW - 3_000_000).toISOString(),
      lastInboundAt: new Date(NOW - 2_000_000).toISOString(),
    });
    await ctx.db.insert("recruitMessages", { applicantId: id, direction: "in", body: "do they hire people with a record?", at: new Date(NOW - 2_000_000).toISOString() });
    return id;
  });
  return { t, staff, clientId, applicantId };
}

describe("a person takes the conversation", () => {
  test("staff text the rep from Jordan's number; the thread shows who sent it", async () => {
    const { staff, applicantId } = await setUp();
    await staff.action(api.recruiting.people.reply, { applicantId, body: "Hi Omar, it's Myles. A record from 2015 doesn't rule you out. Want to talk it through?" });
    expect(texts()).toEqual([expect.objectContaining({ To: "+14325550100", From: "+14325559999", Body: expect.stringContaining("doesn't rule you out") })]);
    const thread = (await staff.query(api.recruiting.ops.thread, { applicantId }))!;
    expect(thread.messages.at(-1)).toMatchObject({ direction: "out", by: "myles" });
    expect(thread.applicant.status).toBe("flagged");
  });

  test("texting a rep Jordan is screening takes over: Jordan goes quiet, and their reply goes to the flag phones", async () => {
    const { t, staff, applicantId } = await setUp("screening");
    await staff.action(api.recruiting.people.reply, { applicantId, body: "Hey Omar, Myles here. Quick question for you." });
    const a = (await staff.query(api.recruiting.ops.thread, { applicantId }))!.applicant;
    expect(a).toMatchObject({ status: "flagged", notes: expect.stringContaining("myles took over from Jordan.") });
    await t.mutation(internal.recruiting.applicants.inbound, { from: "+14325550100", body: "sure what is it" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(claude.calls).toBe(0);
    expect(texts().at(-1)).toMatchObject({ To: "+14325558888", Body: expect.stringMatching(/^Omar Diaz \(Acme Roofing\) replied: "sure what is it"\nAnswer in Ops: https:\/\/app\.example\/ops\/recruiting\?applicant=/) });
  });

  test("Hand back to Jordan: if the rep's text is the last one, Jordan answers it", async () => {
    const { t, staff, applicantId } = await setUp();
    claude.script.push(say("Good question, Omar. Someone will confirm, but most of our clients look at each case. Closer or setter?"));
    await staff.mutation(api.recruiting.people.handBack, { applicantId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const thread = (await staff.query(api.recruiting.ops.thread, { applicantId }))!;
    expect(thread.applicant.status).toBe("screening");
    expect(thread.applicant.notes).toContain("Handed back to Jordan.");
    expect(thread.messages.at(-1)).toMatchObject({ direction: "out", body: expect.stringContaining("Closer or setter?") });
    expect(thread.messages.at(-1)!.by).toBeUndefined();
  });

  test("nothing goes to a rep who texted STOP; owners can't text reps", async () => {
    const { t, staff, applicantId } = await setUp();
    await t.run(async (ctx) => ctx.db.patch(applicantId, { status: "opted_out" }));
    await expect(staff.action(api.recruiting.people.reply, { applicantId, body: "hi" })).rejects.toThrow(/texted STOP/);
    const owner = await signUp(t, "owner@roofer.example");
    await expect(owner.as.action(api.recruiting.people.reply, { applicantId, body: "hi" })).rejects.toThrow();
    await expect(owner.as.mutation(api.recruiting.people.handBack, { applicantId })).rejects.toThrow();
    expect(texts()).toEqual([]);
  });

  test("without Jordan's number set, staff are told why it didn't send", async () => {
    const { staff, applicantId } = await setUp();
    vi.stubEnv("RECRUIT_TWILIO_FROM", undefined as unknown as string);
    await expect(staff.action(api.recruiting.people.reply, { applicantId, body: "hi" })).rejects.toThrow(/Not sent: Recruiting's Twilio number isn't set/);
  });
});

describe("the interview brief to the client", () => {
  test("each new or moved interview emails the client who's coming and what they told Jordan; the same booking again doesn't", async () => {
    const { t, applicantId } = await setUp("screening");
    const at = "2026-11-10T16:00:00.000Z";
    await t.mutation(internal.recruiting.followups.booked, { applicantId, interviewAt: at, calBookingUid: "bk1" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    // Cal.com's webhook for the same booking: no second email.
    await t.mutation(internal.recruiting.followups.calEvent, { trigger: "BOOKING_CREATED", uid: "bk1", startTime: at });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.recruiting.followups.calEvent, { trigger: "BOOKING_RESCHEDULED", uid: "bk1", startTime: "2026-11-11T20:00:00.000Z" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const sent = emails();
    expect(sent.map((e) => e.subject)).toEqual(["Interview booked: Omar Diaz (B), Tue, Nov 10 at 10:00 AM", "Interview moved: Omar Diaz (B), Wed, Nov 11 at 2:00 PM"]);
    expect(sent[0].to).toEqual(["hiring@acme.example"]);
    expect(sent[0].text).toContain("Phone: +14325550100");
    expect(sent[0].text).toContain("d2d: sold cars 2 years");
    expect(sent[0].text).toMatch(/mark whether you hired them: https:\/\/app\.example\/hires\/[0-9a-f]{32}/);
  });

  test("no email for a client without a report email, a test or a demo rep", async () => {
    const { t, applicantId, clientId } = await setUp("screening");
    await t.run(async (ctx) => ctx.db.patch(applicantId, { demo: true }));
    await t.mutation(internal.recruiting.followups.booked, { applicantId, interviewAt: "2026-11-10T16:00:00.000Z", calBookingUid: "bk1" });
    await t.run(async (ctx) => ctx.db.patch(applicantId, { demo: false, test: true, status: "screening" }));
    await t.mutation(internal.recruiting.followups.booked, { applicantId, interviewAt: "2026-11-11T16:00:00.000Z", calBookingUid: "bk2" });
    await t.run(async (ctx) => {
      await ctx.db.patch(applicantId, { test: false, status: "screening" });
      await ctx.db.patch(clientId, { reportEmail: undefined });
    });
    await t.mutation(internal.recruiting.followups.booked, { applicantId, interviewAt: "2026-11-12T16:00:00.000Z", calBookingUid: "bk3" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(emails()).toEqual([]);
  });

  test("the brief reads plainly with notes and no answers", () => {
    const b = briefText({
      applicant: { name: "Sam Ortiz", phone: "+14325550101", score: "A", sourceAdId: "acme-v3", answers: {}, notes: "Strong closer.", interviewAt: "2026-11-10T16:00:00.000Z" } as never,
      client: { role: "Roofing sales rep", timezone: "America/Chicago" } as never,
      moved: false,
    });
    expect(b.subject).toBe("Interview booked: Sam Ortiz (A), Tue, Nov 10 at 10:00 AM");
    expect(b.text).toContain("Score: A (top of the list)");
    expect(b.text).toContain("Notes:\n  Strong closer.");
    expect(b.text).not.toContain("What they told us");
  });
});
