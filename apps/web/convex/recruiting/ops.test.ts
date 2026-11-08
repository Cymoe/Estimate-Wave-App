import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { modules, signUp } from "../test.setup";
import { AD_BRIEF, BRIEF } from "./lib/briefs";
import { sendText } from "./lib/texts";

// Claude, played from a script.
const claude = vi.hoisted(() => ({ script: [] as unknown[] }));
vi.mock("./lib/claude", () => ({
  MODEL: () => "test-model",
  createMessage: async () => {
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

const client = {
  name: "Acme Roofing",
  role: "Door-to-door roofing sales rep",
  city: "Midland, TX",
  compSheet: "Closers: 10% of contract value. Earnings vary.",
  calEventLink: "https://cal.com/acme/interview",
  timezone: "America/Chicago",
};

beforeEach(() => {
  // No simulate mode here: a test applicant has to stay silent on its own.
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("RECRUIT_TWILIO_FROM", "+14325559999");
  vi.useFakeTimers({ now: Date.parse("2026-11-09T16:00:00.000Z"), toFake: ["Date", "setTimeout", "clearTimeout"] });
  claude.script.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Ops → Recruiting", () => {
  test("staff only: a company owner can't see or change recruiting", async () => {
    const t = convexTest(schema, modules);
    const owner = await signUp(t, "owner@roofer.example");
    await expect(owner.as.query(api.recruiting.ops.clients, {})).rejects.toThrow();
    await expect(owner.as.mutation(api.recruiting.ops.saveClient, client)).rejects.toThrow();
    await expect(owner.as.mutation(api.recruiting.ops.tryItSend, { body: "hi" })).rejects.toThrow();
  });

  test("staff add and change a client, with the ad inputs; a bad timezone is refused", async () => {
    const t = convexTest(schema, modules);
    const staff = (await signUp(t, "staff@webbleads.example", { role: "staff" })).as;
    const id = await staff.mutation(api.recruiting.ops.saveClient, { ...client, repStories: ["Marcus was a line cook.", "  "], adsEnabled: true });
    // The form sends every field: saving is the whole client.
    await staff.mutation(api.recruiting.ops.saveClient, { clientId: id, ...client, repStories: ["Marcus was a line cook."], perks: "Cabo trip for the top 10", adsEnabled: true });
    expect(await staff.query(api.recruiting.ops.clients, {})).toEqual([expect.objectContaining({ id, name: "Acme Roofing", repStories: ["Marcus was a line cook."], perks: "Cabo trip for the top 10", applicants: 0 })]);
    await expect(staff.mutation(api.recruiting.ops.saveClient, { ...client, timezone: "Central" })).rejects.toThrow(/isn't a timezone/);
  });

  test("Try it: Jordan's real loop answers a test rep, nothing is sent through Twilio, and the test stays out of the lists", async () => {
    const t = convexTest(schema, modules);
    const twilio = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", twilio);
    const staff = (await signUp(t, "staff@webbleads.example", { role: "staff" })).as;
    const clientId = await staff.mutation(api.recruiting.ops.saveClient, client);
    claude.script.push(say("Hey Test, it's Jordan with National Sales Registry. Done sales before? Reply STOP to opt out."));
    await staff.mutation(api.recruiting.ops.tryItStart, { clientId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    claude.script.push(say("Nice. Closer, setter, or both?"));
    await staff.mutation(api.recruiting.ops.tryItSend, { body: "Yeah 2 years roofing" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const convo = (await staff.query(api.recruiting.ops.tryIt, {}))!;
    expect(convo.messages.map((m) => [m.direction, m.body])).toEqual([
      ["out", "Hey Test, it's Jordan with National Sales Registry. Done sales before? Reply STOP to opt out."],
      ["in", "Yeah 2 years roofing"],
      ["out", "Nice. Closer, setter, or both?"],
    ]);
    expect(convo.applicant).toMatchObject({ test: true, phone: "test" });
    // Twilio was never called, even with the screener's number set and no simulate mode.
    expect(twilio).not.toHaveBeenCalled();
    // Not in the applicant list, not in the numbers.
    expect(await staff.query(api.recruiting.ops.applicants, {})).toEqual([]);
    expect(await staff.query(api.recruiting.ops.byAd, {})).toEqual([]);
    // STOP works the same in a test; Reset starts over.
    await staff.mutation(api.recruiting.ops.tryItSend, { body: "STOP" });
    expect((await staff.query(api.recruiting.ops.tryIt, {}))!.applicant.status).toBe("opted_out");
    await staff.mutation(api.recruiting.ops.tryItReset, {});
    expect(await staff.query(api.recruiting.ops.tryIt, {})).toBeNull();
  });
});

describe("recruiting's own number", () => {
  test("texts go from RECRUIT_TWILIO_FROM, never the office line's number; without it nothing is sent", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_FROM", "+14325551111");
    const twilio = vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify({ sid: "SM1", body: init.body }), { status: 201 }));
    vi.stubGlobal("fetch", twilio);
    expect(await sendText("+14325550101", "hi")).toMatchObject({ status: "sent" });
    expect(new URLSearchParams(String(twilio.mock.calls[0][1].body)).get("From")).toBe("+14325559999");
    vi.stubEnv("RECRUIT_TWILIO_FROM", "");
    vi.stubEnv("RECRUIT_TWILIO_FROM", undefined as unknown as string);
    expect(await sendText("+14325550101", "hi")).toMatchObject({ status: "skipped" });
    expect(twilio).toHaveBeenCalledTimes(1);
  });
});

describe("the briefs", () => {
  test("lib/briefs.ts matches screener-brief.md and ad-brief.md: run `npm run recruiting:briefs` after editing them", () => {
    expect(BRIEF).toBe(readFileSync(new URL("./screener-brief.md", import.meta.url), "utf8"));
    expect(AD_BRIEF).toBe(readFileSync(new URL("./ad-brief.md", import.meta.url), "utf8"));
  });
});
