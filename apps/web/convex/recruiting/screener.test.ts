import type Anthropic from "@anthropic-ai/sdk";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { BRIEF } from "./lib/briefs";
import { conversation, replySpeed } from "./agent";
import { e164, keywordOf, twilioSignature } from "./lib/texts";
import { inQuietHours, nextSendable, nightBefore, spoken } from "./lib/time";
import schema from "../schema";
import { modules } from "../test.setup";

// Claude, played from a script: each call takes the next step. A step can look at the request first.
type Step = Anthropic.Message | ((req: { system: string; messages: Anthropic.MessageParam[]; tools: Anthropic.Tool[] }) => Anthropic.Message);
const claude = vi.hoisted(() => ({ script: [] as unknown[], calls: [] as Array<{ system: string; messages: unknown[]; tools: Array<{ name: string }> }> }));
vi.mock("./lib/claude", () => ({
  MODEL: () => "test-model",
  createMessage: async (req: { system: string; messages: unknown[]; tools: Array<{ name: string }> }) => {
    claude.calls.push(JSON.parse(JSON.stringify(req)));
    const next = claude.script.shift() as Step | undefined;
    if (!next) throw new Error("fake Claude: the script ran out");
    return typeof next === "function" ? next(req as never) : next;
  },
}));

let n = 0;
const message = (content: Anthropic.ContentBlock[], stop: Anthropic.StopReason): Anthropic.Message =>
  ({ id: `msg_${++n}`, type: "message", role: "assistant", model: "test-model", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Anthropic.Message;
const say = (text: string) => message([{ type: "text", text, citations: null } as Anthropic.TextBlock], "end_turn");
const use = (name: string, input: Record<string, unknown> = {}) => message([{ type: "tool_use", id: `tu_${++n}`, name, input } as Anthropic.ToolUseBlock], "tool_use");

// Monday 10am in Chicago: inside texting hours.
const MONDAY_10AM_CT = Date.parse("2026-11-09T16:00:00.000Z");
const PHONE = "+14325550101";

function setup() {
  const t = convexTest(schema, modules);
  const client = async (over: Record<string, unknown> = {}) =>
    (
      await t.mutation(internal.recruiting.clients.create, {
        name: "Acme Solar",
        role: "Door-to-door solar rep",
        city: "Midland, TX",
        compSheet: "$500 per install, paid weekly. Top reps make $8k/month.",
        calEventLink: "https://cal.com/acme/interview",
        calEventTypeId: 123,
        timezone: "America/Chicago",
        reportEmail: "hiring@acme.example",
        ...over,
      })
    ).clientId;
  const apply = (body: Record<string, unknown>, secret = "test-secret") =>
    t.fetch("/recruiting/apply", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
  const text = async (body: string, from = PHONE, signature?: string) => {
    const params = { From: from, To: "+14325559999", Body: body, MessageSid: `SM${++n}` };
    const sig = signature ?? (await twilioSignature("test-token", "https://screener.example/recruiting/sms", params));
    return t.fetch("/recruiting/sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams(params).toString() });
  };
  const thread = async (phone = PHONE) => (await t.query(internal.recruiting.applicants.thread, { phone }))!;
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, client, apply, text, thread, settle };
}

beforeEach(() => {
  // Texts are logged, not sent, and Cal.com is a stub, so nothing real goes out.
  for (const [k, val] of Object.entries({
    RECRUIT_SMS_MODE: "simulate",
    RECRUIT_CAL_MODE: "stub",
    RECRUIT_APPLY_SECRET: "test-secret",
    TWILIO_AUTH_TOKEN: "test-token",
    RECRUIT_TWILIO_WEBHOOK_URL: "https://screener.example/recruiting/sms",
    RECRUIT_MYLES_PHONE: "+14325550000",
    ANTHROPIC_API_KEY: "test-key",
  }))
    vi.stubEnv(k, val);
  vi.useFakeTimers({ now: MONDAY_10AM_CT, toFake: ["Date", "setTimeout", "clearTimeout"] });
  claude.script.length = 0;
  claude.calls.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("applying", () => {
  test("/apply checks the secret and the fields, saves the applicant with the ad, and the first text goes out within two minutes", async () => {
    const { client, apply, thread, settle } = setup();
    const clientId = await client();
    expect((await apply({ name: "Dana Reyes", phone: "432-555-0101", clientId, sourceAdId: "fb-ad-7" }, "wrong")).status).toBe(401);
    expect(await (await apply({ name: "Dana Reyes", phone: "555-0101", clientId, sourceAdId: "fb-ad-7" })).json()).toMatchObject({ ok: false, error: "phone isn't a US number" });
    expect(await (await apply({ name: "Dana Reyes", phone: "432-555-0101", clientId: "nope", sourceAdId: "fb-ad-7" })).json()).toMatchObject({ ok: false, error: "no such client" });
    expect(await (await apply({ name: "Dana Reyes", phone: "432-555-0101", clientId, sourceAdId: "" })).json()).toMatchObject({ ok: false, error: "sourceAdId is required" });

    const res = await apply({ name: "Dana Reyes", phone: "(432) 555-0101", clientId, sourceAdId: "fb-ad-7" });
    expect(res.status).toBe(201);
    const { applicantId } = (await res.json()) as { applicantId: Id<"recruitApplicants"> };
    // The same number applying again for the same client is the same applicant.
    expect(await (await apply({ name: "Dana R", phone: "4325550101", clientId, sourceAdId: "fb-ad-9" })).json()).toEqual({ ok: true, applicantId, existing: true });

    // Claude reads the client, then writes the opener.
    claude.script.push(use("get_client_info"), say("Hi Dana, it's the hiring team at Acme Solar. Thanks for applying! Got a minute for a few quick questions? Reply STOP to opt out."));
    await settle();
    const first = await thread();
    expect(first.applicant).toMatchObject({ name: "Dana Reyes", phone: PHONE, status: "texted", sourceAdId: "fb-ad-7" });
    expect(first.messages).toEqual([expect.objectContaining({ direction: "out", body: expect.stringContaining("Reply STOP to opt out.") })]);
    // The brief is the system prompt; the tools are the five the brief names; the request says who this is.
    expect(claude.calls[0].system).toBe(BRIEF);
    expect(claude.calls[0].tools.map((x) => x.name)).toEqual(["send_text", "get_client_info", "book_interview", "save_applicant", "flag_human"]);
    expect(JSON.stringify(claude.calls[0].messages[0])).toContain("Dana Reyes");
    expect(JSON.stringify(claude.calls[0].messages[0])).toContain("fb-ad-7");
    // The tool's answer went back to Claude: the client's pay plan.
    expect(JSON.stringify(claude.calls[1].messages)).toContain("$500 per install");
  });
});

describe("texting", () => {
  async function screening() {
    const s = setup();
    const clientId = await s.client();
    await s.apply({ name: "Dana Reyes", phone: PHONE, clientId, sourceAdId: "fb-ad-7" });
    claude.script.push(say("Hi Dana, thanks for applying to Acme Solar! How many years of sales have you done? Reply STOP to opt out."));
    await s.settle();
    return { ...s, clientId };
  }

  test("/sms turns away a forged webhook", async () => {
    const { text } = await screening();
    expect((await text("hi", PHONE, "forged")).status).toBe(403);
  });

  test("a reply runs the loop: Claude saves, scores, lists times, books one, and the answer is texted; reminders are set", async () => {
    const { t, text, thread, settle } = await screening();
    let slotStart = "";
    claude.script.push(
      use("save_applicant", { answers: { experience: "3 years solar D2D" }, score: "A", status: "qualified" }),
      use("book_interview"),
      ((req: { messages: Anthropic.MessageParam[] }) => {
        // The open times came back as the tool's result; take the first.
        const last = req.messages[req.messages.length - 1] as { content: Array<{ content: string }> };
        slotStart = (JSON.parse(last.content[0].content) as Array<{ start: string }>)[0].start;
        return use("book_interview", { start: slotStart, email: "dana@example.com" });
      }),
      say("You're booked! Talk soon."),
    );
    const res = await text("3 years selling solar door to door");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    await settle();
    const after = await thread();
    expect(after.applicant).toMatchObject({ status: "booked", score: "A", answers: { experience: "3 years solar D2D", email: "dana@example.com" }, interviewAt: slotStart });
    expect(after.messages.slice(0, 3).map((m) => [m.direction, m.body])).toEqual([
      ["out", expect.stringContaining("How many years")],
      ["in", "3 years selling solar door to door"],
      ["out", "You're booked! Talk soon."],
    ]);
    // Their text reached Claude as their turn.
    expect(JSON.stringify(claude.calls.at(-4)!.messages.at(-1))).toContain("3 years selling solar");
    // Two reminders were put on the clock, and fake time ran them: 8pm the night before and an hour before, client time.
    const a = await t.run(async (ctx) => (await ctx.db.query("recruitApplicants").first())!);
    expect(a.remindersSent).toEqual(["night_before", "hour_before"]);
    expect(after.messages.slice(3).map((m) => m.body)).toEqual([
      "Hi Dana, reminder: your interview for the Door-to-door solar rep role with Acme Solar is tomorrow, Tue, Nov 10 at 10:00 AM. Reply here if anything changes.",
      "Hi Dana, your Acme Solar interview starts in an hour (Tue, Nov 10 at 10:00 AM). Reply here if you're running late.",
    ]);
  });

  test("STOP opts the number out by the rules, without the model; nothing is texted after; START opts back in; HELP says who we are", async () => {
    const { t, text, thread, settle } = await screening();
    const calls = claude.calls.length;
    const stop = await text("Stop");
    expect(await stop.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Message>You&apos;re unsubscribed and won&apos;t get more texts from us. Reply START to opt back in.</Message></Response>'.replace(/&apos;/g, "'"));
    await settle();
    expect((await thread()).applicant.status).toBe("opted_out");
    expect(claude.calls.length).toBe(calls);
    // A text after STOP goes nowhere: no model, no reply.
    expect(await (await text("actually wait, what's the pay?")).text()).not.toContain("<Message>");
    await settle();
    expect(claude.calls.length).toBe(calls);
    // Nothing the agent sends gets through either, and a new application from the number is refused.
    const applicantId = (await thread()).applicant.id as Id<"recruitApplicants">;
    await t.action(internal.recruiting.followups.rebook, { applicantId });
    expect((await thread()).messages.filter((m) => m.direction === "out").map((m) => m.body)).not.toContain(expect.stringContaining("missed you"));
    // HELP still answers, by the rules.
    expect(await (await text("HELP")).text()).toContain("Reply STOP to opt out.");
    // START clears it; their next text goes to the agent again.
    expect(await (await text("start")).text()).toContain("opted back in");
    claude.script.push(say("Welcome back! Where were we: how many years in sales?"));
    await text("ok I'm back");
    await settle();
    expect((await thread()).messages.at(-1)!.body).toBe("Welcome back! Where were we: how many years in sales?");
  });

  test("a sentence that starts with stop isn't an opt-out; YES only opts back in after a STOP", () => {
    expect(keywordOf("STOP", false)).toBe("stop");
    expect(keywordOf(" unsubscribe. ", false)).toBe("stop");
    expect(keywordOf("stop texting me so early", false)).toBeUndefined();
    expect(keywordOf("yes", false)).toBeUndefined();
    expect(keywordOf("yes", true)).toBe("start");
    expect(keywordOf("info", false)).toBe("help");
    expect(e164("(432) 555-0101")).toBe("+14325550101");
    expect(e164("1-432-555-0101")).toBe("+14325550101");
    expect(e164("555-0101")).toBeUndefined();
  });

  test("with Twilio's Advanced Opt-Out on, STOP and HELP are recorded but Twilio does the answering", async () => {
    vi.stubEnv("RECRUIT_TWILIO_ADVANCED_OPT_OUT", "on");
    const { text, thread } = await screening();
    expect(await (await text("STOP")).text()).not.toContain("<Message>");
    expect((await thread()).applicant.status).toBe("opted_out");
    expect(await (await text("HELP")).text()).not.toContain("<Message>");
  });

  test("texts sent while a reply is being written get one more turn, not one each", async () => {
    const { text, thread, settle } = await screening();
    claude.script.push(say("Got it. Can you work in Midland?"), say("Great, and when could you start?"));
    await text("3 years");
    await text("solar mostly");
    await settle();
    // The first turn saw both texts as one; nothing new came after it, so no second turn ran.
    expect(JSON.stringify(claude.calls.at(-1)!.messages.at(-1))).toContain("3 years\\nsolar mostly");
    expect((await thread()).messages.filter((m) => m.direction === "out")).toHaveLength(2);
    expect(claude.script).toHaveLength(1);
  });

  test("flag_human hands them to Myles: status flagged, the agent goes quiet after its last line", async () => {
    const { text, thread, settle } = await screening();
    claude.script.push(use("flag_human", { reason: "Asked about a past wage dispute with the client" }), say("Good question. Someone from the team will text you back shortly."));
    await text("didn't acme stiff their reps last year?");
    await settle();
    const after = await thread();
    expect(after.applicant.status).toBe("flagged");
    expect(after.applicant.notes).toContain("Flagged: Asked about a past wage dispute");
    expect(after.messages.at(-1)!.body).toBe("Good question. Someone from the team will text you back shortly.");
    const calls = claude.calls.length;
    await text("hello?");
    await settle();
    expect(claude.calls.length).toBe(calls);
  });

  test("when Claude fails mid-turn, the applicant is flagged to a person instead of sent something broken", async () => {
    const { text, thread, settle } = await screening();
    claude.script.push(() => {
      throw new Error("overloaded");
    });
    await text("3 years");
    await settle();
    const after = await thread();
    expect(after.applicant.status).toBe("flagged");
    expect(after.applicant.notes).toContain("The agent hit an error: overloaded");
    expect(after.messages.filter((m) => m.direction === "out")).toHaveLength(1);
  });
});

describe("the brief's rules", () => {
  async function screening() {
    const s = setup();
    const clientId = await s.client();
    await s.apply({ name: "Dana Reyes", phone: PHONE, clientId, sourceAdId: "fb-ad-7" });
    claude.script.push(say("Hey Dana, Jordan with National Sales Registry. Saw you applied for the solar rep spot in Midland. Done sales before? Reply STOP to opt out."));
    await s.settle();
    return { ...s, clientId };
  }

  test("get_client_info gives Jordan the open interview times and the booking link along with the comp sheet", async () => {
    const { text, settle } = await screening();
    claude.script.push(use("get_client_info"), say("Cool. Closer, setter, or both?"));
    await text("yeah 2 years");
    await settle();
    const info = JSON.parse((claude.calls.at(-1)!.messages.at(-1) as { content: Array<{ content: string }> }).content[0].content);
    expect(info).toMatchObject({ role: "Door-to-door solar rep", compSheet: expect.stringContaining("$500 per install"), bookingLink: "https://cal.com/acme/interview" });
    expect(info.openInterviewTimes).toHaveLength(6);
    expect(info.openInterviewTimes[0]).toEqual({ start: expect.any(String), says: expect.stringMatching(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+ at \d+:\d{2} [AP]M$/) });
  });

  test("'please stop texting me' in their own words: flagged to everyone on FLAG_PHONES and opted out, so nothing else goes out", async () => {
    vi.stubEnv("RECRUIT_FLAG_PHONES", "+14325550000, +14325550001");
    const sent: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line: string) => void sent.push(String(line)));
    try {
      const { t, text, thread, settle } = await screening();
      claude.script.push(use("flag_human", { reason: "Asked to stop texting", stop_requested: true }), say("No problem, I'll stop texting. Take care!"));
      await text("please stop texting me");
      await settle();
      const after = await thread();
      expect(after.applicant.status).toBe("flagged");
      // Opted out: even this turn's goodbye wasn't sent.
      expect(after.messages.at(-1)).toMatchObject({ direction: "in", body: "please stop texting me" });
      expect(await t.run(async (ctx) => ctx.db.query("recruitOptOuts").collect())).toEqual([expect.objectContaining({ phone: PHONE })]);
      // Both people were texted the summary, with the conversation and how to see all of it.
      const flags = sent.filter((l) => l.startsWith("Flag texted to"));
      expect(flags.map((l) => l.split(" ")[3])).toEqual(["+14325550000", "+14325550001"]);
      expect(flags[0]).toContain("(asked to stop: opted out)");
      expect(flags[0]).toContain("Dana: please stop texting me");
      expect(flags[0]).toContain("/ops/recruiting?applicant=");
      // No follow-ups later either.
      vi.setSystemTime(Date.now() + 5 * 3_600_000);
      await t.mutation(internal.recruiting.followups.sweep, {});
      await settle();
      expect((await thread()).messages.filter((m) => m.direction === "out")).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  test("a time picked through the booking link is confirmed by text; one Jordan booked isn't confirmed twice", async () => {
    const { t, thread, settle } = await screening();
    const confirmation = "You're booked, Dana: Acme Solar interview Wed, Nov 11 at 2:00 PM. See you then!";
    const confirmations = async () => (await thread()).messages.filter((m) => m.body === confirmation).length;
    await t.mutation(internal.recruiting.followups.calEvent, { trigger: "BOOKING_CREATED", uid: "bk_link", startTime: "2026-11-11T20:00:00.000Z", phone: PHONE });
    await settle();
    expect((await thread()).applicant).toMatchObject({ status: "booked", interviewAt: "2026-11-11T20:00:00.000Z" });
    expect(await confirmations()).toBe(1);
    // The same booking arriving again (as when Jordan booked it through the API) sends nothing new.
    await t.mutation(internal.recruiting.followups.calEvent, { trigger: "BOOKING_CREATED", uid: "bk_link", startTime: "2026-11-11T20:00:00.000Z", phone: PHONE });
    await settle();
    expect(await confirmations()).toBe(1);
  });

  test("Jordan sees how fast they reply, for the brief's 'replies fast' bump", () => {
    const at = (min: number) => new Date(MONDAY_10AM_CT + min * 60_000).toISOString();
    const msgs = [
      { direction: "out" as const, body: "hi", at: at(0) },
      { direction: "in" as const, body: "hey", at: at(2) },
      { direction: "out" as const, body: "q", at: at(3) },
      { direction: "in" as const, body: "a", at: at(6) },
      { direction: "out" as const, body: "q2", at: at(7) },
      { direction: "in" as const, body: "a2", at: at(47) },
    ];
    expect(replySpeed(msgs)).toBe(3);
    expect(replySpeed(msgs.slice(0, 2))).toBeUndefined();
    const applicant = { name: "Dana Reyes", phone: PHONE, sourceAdId: "fb-ad-7", status: "screening", answers: {} } as never;
    const client = { name: "Acme Solar", role: "Roofing sales rep", city: "Midland, TX", timezone: "America/Chicago" } as never;
    expect(conversation(applicant, client, msgs)[0].content).toContain("They typically reply in about 3 minutes.");
  });
});

describe("on a clock", () => {
  test("silence: follow-up 1 after 4 hours, follow-up 2 a day later, then ghosted", async () => {
    const { t, client, apply, thread, settle } = setup();
    const clientId = await client();
    await apply({ name: "Sam Ortiz", phone: PHONE, clientId, sourceAdId: "ig-3" });
    claude.script.push(say("Hi Sam, thanks for applying! Got a minute? Reply STOP to opt out."));
    await settle();
    const sweep = () => t.mutation(internal.recruiting.followups.sweep, {});
    const outs = async () => (await thread()).messages.filter((m) => m.direction === "out").length;

    vi.setSystemTime(Date.now() + 3 * 3_600_000);
    await sweep();
    await settle();
    expect(await outs()).toBe(1);

    vi.setSystemTime(Date.now() + 1.5 * 3_600_000);
    claude.script.push(say("Hey Sam, still interested in the solar role?"));
    await sweep();
    await settle();
    expect(await outs()).toBe(2);
    expect(JSON.stringify(claude.calls.at(-1)!.messages.at(-1))).toContain("Send follow-up 1 of 2");
    // The next hour's sweep doesn't send it twice.
    await sweep();
    await settle();
    expect(await outs()).toBe(2);

    vi.setSystemTime(Date.now() + 25 * 3_600_000);
    claude.script.push(say("Last check, Sam: want to set up a quick interview?"));
    await sweep();
    await settle();
    expect(await outs()).toBe(3);

    vi.setSystemTime(Date.now() + 25 * 3_600_000);
    await sweep();
    // Ghosting twice mid-conversation is an instant no: scored C, with a note.
    expect((await thread()).applicant).toMatchObject({ status: "ghosted", score: "C", notes: "Ghosted after two follow-ups." });
  });

  test("a follow-up due at night waits for 8am client time", () => {
    const tz = "America/Chicago";
    const night = new Date("2026-11-10T04:30:00.000Z"); // 10:30pm Monday in Chicago
    expect(inQuietHours(night, tz)).toBe(true);
    expect(nextSendable(night, tz).toISOString()).toBe("2026-11-10T14:00:00.000Z"); // 8am Tuesday
    const early = new Date("2026-11-10T11:00:00.000Z"); // 5am Tuesday
    expect(nextSendable(early, tz).toISOString()).toBe("2026-11-10T14:00:00.000Z");
    const noon = new Date("2026-11-10T18:00:00.000Z");
    expect(nextSendable(noon, tz)).toBe(noon);
  });

  test("the night-before reminder is 8pm where the client is, across zones and a DST change", () => {
    expect(nightBefore(new Date("2026-11-10T16:00:00.000Z"), "America/Chicago").toISOString()).toBe("2026-11-10T02:00:00.000Z");
    expect(nightBefore(new Date("2026-11-10T16:00:00.000Z"), "America/Los_Angeles").toISOString()).toBe("2026-11-10T04:00:00.000Z");
    // The interview is the Monday after clocks fall back (Nov 1, 2026): Sunday 8pm is CST.
    expect(nightBefore(new Date("2026-11-02T16:00:00.000Z"), "America/Chicago").toISOString()).toBe("2026-11-02T02:00:00.000Z");
    // And in summer, CDT.
    expect(nightBefore(new Date("2026-07-14T16:00:00.000Z"), "America/Chicago").toISOString()).toBe("2026-07-14T01:00:00.000Z");
    expect(spoken(new Date("2026-11-10T16:00:00.000Z"), "America/Chicago")).toBe("Tue, Nov 10 at 10:00 AM");
  });

  test("a no-show gets one rebook text with the booking link; Cal.com's webhook can say so too", async () => {
    const { t, client, apply, thread, settle } = setup();
    const clientId = await client();
    await apply({ name: "Lee Park", phone: PHONE, clientId, sourceAdId: "fb-ad-7" });
    claude.script.push(say("Hi Lee! Reply STOP to opt out."));
    await settle();
    const applicantId = (await thread()).applicant.id as Id<"recruitApplicants">;
    await t.mutation(internal.recruiting.followups.booked, { applicantId, interviewAt: "2026-11-09T22:00:00.000Z", calBookingUid: "bk_1" });
    await t.mutation(internal.recruiting.followups.calEvent, { trigger: "BOOKING_NO_SHOW_UPDATED", uid: "bk_1", attendeeNoShow: true });
    await settle();
    const after = await thread();
    expect(after.applicant.status).toBe("no_show");
    expect(after.messages.at(-1)!.body).toBe("Hi Lee, we missed you at the Acme Solar interview. Want to grab another time? Pick one here: https://cal.com/acme/interview or reply with a day that works.");
    // The reminders for the missed one were cancelled: none went out.
    expect(after.messages.some((m) => m.body.includes("reminder"))).toBe(false);
  });

  test("the weekly report: who applied, A/B/C, interviews booked, the show rate, and which ads bring A's", async () => {
    const { t, client } = setup();
    const clientId = await client();
    const other = await client({ name: "Other Co" });
    const add = (name: string, ad: string, score: "A" | "B" | "C" | undefined, status: string, extra: Record<string, unknown> = {}) =>
      t.run(async (ctx) =>
        ctx.db.insert("recruitApplicants", { name, phone: `+1432555${String(++n).padStart(4, "0")}`, clientId, sourceAdId: ad, answers: {}, score, status: status as never, followUps: 0, createdAt: new Date(Date.now() - 86_400_000).toISOString(), ...extra }),
      );
    const past = new Date(Date.now() - 3_600_000).toISOString();
    await add("Ana", "fb-ad-7", "A", "interviewed", { bookedAt: past, interviewAt: past });
    await add("Ben", "fb-ad-7", "A", "no_show", { bookedAt: past, interviewAt: past });
    await add("Cal", "fb-ad-7", "B", "booked", { bookedAt: past, interviewAt: new Date(Date.now() + 86_400_000).toISOString() });
    await add("Dee", "ig-3", "C", "rejected");
    await add("Eve", "ig-3", undefined, "ghosted");
    await t.run(async (ctx) => ctx.db.insert("recruitApplicants", { name: "Old", phone: "+14325559998", clientId, sourceAdId: "ig-3", answers: {}, score: "A", status: "interviewed", followUps: 0, createdAt: "2026-01-01T00:00:00.000Z" }));
    await t.run(async (ctx) => ctx.db.insert("recruitApplicants", { name: "Elsewhere", phone: "+14325559997", clientId: other, sourceAdId: "fb-ad-7", answers: {}, score: "A", status: "texted", followUps: 0, createdAt: new Date().toISOString() }));

    const w = await t.query(internal.recruiting.reports.week, { clientId });
    expect(w.counts).toEqual({ applied: 5, A: 2, B: 1, C: 1, booked: 3, showed: 1, missed: 1, showRate: 0.5 });
    expect(w.byAd).toEqual([
      { sourceAdId: "fb-ad-7", applicants: 3, A: 2, B: 1, C: 0, booked: 3, showed: 1 },
      { sourceAdId: "ig-3", applicants: 2, A: 0, B: 0, C: 1, booked: 0, showed: 0 },
    ]);
    const { reportText } = await import("./reports");
    const email = reportText(w);
    expect(email.subject).toBe("Acme Solar: 5 applicants this week, 2 A's, 3 interviews booked");
    expect(email.text).toContain("Show rate: 50% (1 of 2)");
    expect(email.text).toContain("fb-ad-7: 3 applied, 2 A, 1 B, 0 C, 3 booked");
    // Across all clients, the last 30 days by ad.
    const ads = await t.query(internal.recruiting.reports.byAd, {});
    expect(ads.find((r) => r.sourceAdId === "fb-ad-7")).toMatchObject({ applicants: 4, A: 3 });
  });
});
