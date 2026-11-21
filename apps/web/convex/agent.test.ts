import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { centralMinutes, parseAnswer, plainText } from "./agent";
import { twilioSignatureOk } from "./lib/sms";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const OWNER_MOBILE = "+14325550100";

/** Runs scheduled functions one at a time until none are left (see ads.test.ts). */
async function drain(t: T, limit = 200) {
  for (let i = 0; i < limit; i++) {
    await t.finishInProgressScheduledFunctions();
    if (vi.getTimerCount() === 0) return;
    vi.advanceTimersToNextTimer();
  }
  throw new Error("Scheduled functions kept going");
}

/** Twilio and Claude, stubbed: texts sent, and Claude's replies in order. */
function stubNet(replies: unknown[] = []) {
  const texts: Array<{ to: string; body: string }> = [];
  // Request bodies as sent to Claude, read loosely in the assertions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claude: Array<Record<string, any>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("api.twilio.com")) {
        const p = new URLSearchParams(String(init!.body));
        texts.push({ to: p.get("To")!, body: p.get("Body")! });
        return new Response(JSON.stringify({ sid: `SM${texts.length}` }), { status: 201 });
      }
      if (u.includes("api.anthropic.com")) {
        claude.push(JSON.parse(String(init!.body)));
        const next = replies.shift();
        if (!next) return new Response(JSON.stringify({ error: { message: "no reply stubbed" } }), { status: 500 });
        return new Response(JSON.stringify(next));
      }
      return new Response(JSON.stringify({ id: "email-1" }));
    }),
  );
  return { texts, claude };
}

/** The owner with a mobile and the office line on. */
async function owner(t: T, email = "owner@peak.example", mobile = "432-555-0100") {
  const o = await signUp(t, email);
  await o.as.mutation(api.users.setMobile, { mobile });
  await o.as.mutation(api.agent.configure, { organizationId: o.organizationId, on: true });
  return o;
}

/** Peak's kitchen job from the built-in package: an estimate, and draft POs. */
async function kitchen(t: T, o: Awaited<ReturnType<typeof owner>>) {
  const { as, organizationId } = o;
  const clientId = (await as.mutation(api.clients.create, {
    organizationId,
    data: { name: "Ann Miller", email: "ann@example.com", address: "12 Oak St", city: "Midland", state: "TX", zip: "79701" },
  }))!._id as Id<"clients">;
  const started = await as.mutation(api.projectTemplates.startPackage, {
    organizationId,
    packageId: "general-construction/remodel/kitchen-remodel",
    data: { name: "Miller kitchen", clientId, startDate: "2026-12-01" },
  });
  const projectId = started.project._id as Id<"projects">;
  const orders = (await as.query(api.purchaseOrders.forProject, { projectId })).orders;
  return { projectId, estimateId: started.estimateId as Id<"estimates">, orders };
}

const text = (from: string, body: string) => ({ from, body });
const toolUse = (name: string, input: Record<string, unknown>, id = "tu1") => ({
  content: [{ type: "tool_use", id, name, input }],
  stop_reason: "tool_use",
});
const says = (words: string) => ({ content: [{ type: "text", text: words }], stop_reason: "end_turn" });

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
  vi.stubEnv("TWILIO_FROM", "+14325559999");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("plain commands", () => {
  test("parseAnswer reads YES, YES 2, ok 1 and 3, yes all, NO; anything else goes to the agent", () => {
    expect(parseAnswer("YES")).toEqual({ yes: true, numbers: "one" });
    expect(parseAnswer("yes 2")).toEqual({ yes: true, numbers: [2] });
    expect(parseAnswer("ok #1 and 3!")).toEqual({ yes: true, numbers: [1, 3] });
    expect(parseAnswer("Yes all")).toEqual({ yes: true, numbers: "all" });
    expect(parseAnswer("no 2")).toEqual({ yes: false, numbers: [2] });
    expect(parseAnswer("yes but change the date to Friday")).toBeUndefined();
    expect(parseAnswer("yesterday's leads?")).toBeUndefined();
    expect(parseAnswer("not now")).toBeUndefined();
  });

  test("texts from a stranger, a plain member, or a company with the line off get nothing", async () => {
    const t = setup();
    const net = stubNet();
    const o = await owner(t);
    vi.useFakeTimers();
    expect(await t.mutation(internal.agent.inboundSms, text("+14325550111", "HELP"))).toEqual({ handled: false });
    // A member of the company with a mobile on file.
    const member = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "crew@peak.example", mobile: "+14325550122" });
      await ctx.db.insert("memberships", { organizationId: o.organizationId, userId, role: "member", createdAt: new Date().toISOString() });
      return userId;
    });
    expect(member).toBeTruthy();
    expect(await t.mutation(internal.agent.inboundSms, text("+14325550122", "HELP"))).toEqual({ handled: false });
    await o.as.mutation(api.agent.configure, { organizationId: o.organizationId, on: false });
    expect(await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "HELP"))).toEqual({ handled: false });
    await drain(t);
    expect(net.texts).toEqual([]);
  });

  test("HELP texts back the commands; STOP turns the line off without a reply", async () => {
    const t = setup();
    const net = stubNet();
    const o = await owner(t);
    vi.useFakeTimers();
    expect(await t.mutation(internal.agent.inboundSms, text("(432) 555-0100", "help"))).toEqual({ handled: true });
    await drain(t);
    expect(net.texts).toEqual([{ to: OWNER_MOBILE, body: expect.stringContaining("Reply YES") }]);
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "STOP"));
    await drain(t);
    expect(net.texts).toHaveLength(1);
    expect((await o.as.query(api.agent.settings, { organizationId: o.organizationId })).on).toBe(false);
  });

  test("turning it on needs a mobile; only owners and admins can change it", async () => {
    const t = setup();
    const o = await signUp(t, "owner@peak.example");
    await expect(o.as.mutation(api.agent.configure, { organizationId: o.organizationId, on: true })).rejects.toThrow(/mobile/);
    await o.as.mutation(api.users.setMobile, { mobile: "4325550100" });
    await o.as.mutation(api.agent.configure, { organizationId: o.organizationId, on: true, briefAt: "07:15" });
    await expect(o.as.mutation(api.agent.configure, { organizationId: o.organizationId, briefAt: "7am" })).rejects.toThrow(/06:30/);
    const s = await o.as.query(api.agent.settings, { organizationId: o.organizationId });
    expect(s).toMatchObject({ on: true, briefAt: "07:15", allowSpend: false, canEdit: true, myMobile: "(432) 555-0100", lineNumber: "(432) 555-9999" });
  });
});

describe("tools and asks", () => {
  test("a read runs at once; sending an estimate is saved as an ask, not sent", async () => {
    const t = setup();
    const net = stubNet();
    const o = await owner(t);
    const { estimateId } = await kitchen(t, o);
    const snap = await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "business_snapshot", args: {} });
    expect(snap.text).toMatch(/Purchase orders to send|Nothing needs/);
    vi.useFakeTimers();
    const r = await t.mutation(internal.agent.runTool, {
      organizationId: o.organizationId,
      userId: o.userId,
      name: "send_estimate",
      args: { estimate_id: estimateId, confirm: false, ask_summary: "Email the kitchen estimate to Ann Miller" },
    });
    expect(r).toEqual({ text: expect.stringContaining("Saved as ask #1"), ask: 1 });
    await drain(t);
    expect(net.texts).toEqual([]);
    const estimate = await t.run(async (ctx) => await ctx.db.get(estimateId));
    expect(estimate!.status).toBe("draft");
    const ask = await t.run(async (ctx) => (await ctx.db.query("agentAsks").collect())[0]);
    // The YES is the confirmation; ask_summary isn't passed to the tool.
    expect(ask).toMatchObject({ number: 1, tool: "send_estimate", args: { estimate_id: estimateId, confirm: true }, summary: "Email the kitchen estimate to Ann Miller", status: "pending" });
  });

  test("buying is refused while it's off, and is an ask when it's on", async () => {
    const t = setup();
    stubNet();
    const o = await owner(t);
    const off = await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "buy_lead", args: { lead_id: "x" } });
    expect(off.text).toMatch(/turned on|are off/);
    await o.as.mutation(api.agent.configure, { organizationId: o.organizationId, allowSpend: true });
    const on = await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "buy_lead", args: { lead_id: "x", ask_summary: "Buy the Elm St lead" } });
    expect(on.ask).toBe(1);
    // The office line's connection follows the switch, and never shows under Assistants.
    const conns = await t.run(async (ctx) => await ctx.db.query("aiConnections").collect());
    expect(conns).toEqual([expect.objectContaining({ clientId: "office-line", scopes: ["leads", "spend"], accessExpiresAt: 0 })]);
    expect((await o.as.query(api.oauth.myConnections, { organizationId: o.organizationId })).connections).toEqual([]);
  });

  test("YES runs the one waiting ask exactly: the PO is ordered and the vendor gets its link", async () => {
    const t = setup();
    const net = stubNet();
    const o = await owner(t);
    const { orders } = await kitchen(t, o);
    const po = orders.find((x) => x.title === "Cabinet supplier")!;
    await o.as.mutation(api.purchaseOrders.update, { id: po.id, vendor: { name: "Midland Cabinet Co", phone: "432-555-0111" } });
    await t.mutation(internal.agent.runTool, {
      organizationId: o.organizationId,
      userId: o.userId,
      name: "send_purchase_order",
      args: { purchase_order_id: po.id, ask_summary: "Text the cabinet PO to Midland Cabinet Co" },
    });
    vi.useFakeTimers();
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "Yes"));
    await drain(t);
    const row = await t.run(async (ctx) => await ctx.db.get(po.id as Id<"purchaseOrders">));
    expect(row!.status).toBe("ordered");
    expect(net.texts).toEqual([
      { to: "+14325550111", body: expect.stringMatching(new RegExp(`purchase order ${row!.number}.*/po/${row!.shareToken}$`)) },
      { to: OWNER_MOBILE, body: expect.stringContaining("Done #1") },
    ]);
    // A second YES has nothing left to run.
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "YES"));
    await drain(t);
    expect(net.texts[2]).toEqual({ to: OWNER_MOBILE, body: "Nothing is waiting on a YES right now." });
  });

  test("with two waiting: YES asks which, YES 2 runs #2, NO 1 drops #1; an expired ask doesn't run", async () => {
    const t = setup();
    const net = stubNet();
    const o = await owner(t);
    const { orders } = await kitchen(t, o);
    const [a, b] = orders;
    for (const po of [a, b])
      await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "send_purchase_order", args: { purchase_order_id: po.id, ask_summary: `Send ${po.title}` } });
    vi.useFakeTimers();
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "yes"));
    await drain(t);
    expect(net.texts.at(-1)!.body).toMatch(/Which one\?[\s\S]*#1 Send[\s\S]*#2 Send/);
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "YES 2"));
    await drain(t);
    const status = async (id: string) => (await t.run(async (ctx) => await ctx.db.get(id as Id<"purchaseOrders">)))!.status;
    expect(await status(b.id)).toBe("ordered");
    expect(await status(a.id)).toBe("draft");
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "no 1"));
    await drain(t);
    expect(net.texts.at(-1)!.body).toBe("Dropped #1.");
    const asks = await t.run(async (ctx) => await ctx.db.query("agentAsks").collect());
    expect(asks.map((x) => [x.number, x.status])).toEqual([
      [1, "declined"],
      [2, "done"],
    ]);

    // A new ask, left a day: it expires and YES can't run it.
    await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "send_purchase_order", args: { purchase_order_id: a.id } });
    vi.setSystemTime(Date.now() + 25 * 3_600_000);
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "YES"));
    await drain(t);
    expect(net.texts.at(-1)!.body).toBe("Nothing is waiting on a YES right now.");
    expect(await status(a.id)).toBe("draft");
  });

  test("an ask that fails when run is marked failed and the owner hears why", async () => {
    const t = setup();
    const net = stubNet();
    const o = await owner(t);
    const { orders } = await kitchen(t, o);
    const po = orders[0];
    await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "send_purchase_order", args: { purchase_order_id: po.id } });
    await t.run(async (ctx) => await ctx.db.patch(po.id as Id<"purchaseOrders">, { lines: [] }));
    vi.useFakeTimers();
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "YES 1"));
    await drain(t);
    expect(net.texts.at(-1)!.body).toBe("Couldn't do #1: Add what you're ordering first");
    expect((await t.run(async (ctx) => await ctx.db.query("agentAsks").collect()))[0].status).toBe("failed");
  });

  test("Do it from the log in Settings runs the ask; members can't see the log", async () => {
    const t = setup();
    stubNet();
    const o = await owner(t);
    const { orders } = await kitchen(t, o);
    await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "send_purchase_order", args: { purchase_order_id: orders[0].id, ask_summary: "Send it" } });
    const log = await o.as.query(api.agent.log, { organizationId: o.organizationId });
    const row = log.find((r) => r.kind === "ask")!;
    expect(row.ask).toMatchObject({ number: 1, status: "pending" });
    vi.useFakeTimers();
    await o.as.mutation(api.agent.answer, { organizationId: o.organizationId, askId: row.ask!.id, yes: true });
    await drain(t);
    expect((await o.as.query(api.agent.log, { organizationId: o.organizationId })).find((r) => r.kind === "ask")!.ask!.status).toBe("done");
    const crew = await signUp(t, "crew@else.example");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", { organizationId: o.organizationId, userId: crew.userId, role: "member", createdAt: new Date().toISOString() });
    });
    await expect(crew.as.query(api.agent.log, { organizationId: o.organizationId })).rejects.toThrow();
  });
});

describe("the agent", () => {
  test("a question goes to Claude, which uses a tool and answers; the reply is texted and logged", async () => {
    const t = setup();
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const net = stubNet([toolUse("business_snapshot", {}), says("**All quiet.** No new leads, nothing due.")]);
    const o = await owner(t);
    vi.useFakeTimers();
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "what needs me today?"));
    await drain(t);
    expect(net.claude).toHaveLength(2);
    const [first, second] = net.claude;
    expect(first).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "low" }, fallbacks: "default" });
    expect(first.system[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(first.system[0].text).toContain("owner@peak.example Co");
    expect(first.messages).toEqual([{ role: "user", content: "what needs me today?" }]);
    expect(first.tools.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["business_snapshot", "send_purchase_order", "create_estimate"]));
    expect(first.tools.map((x: { name: string }) => x.name)).not.toContain("search");
    expect(first.tools.find((x: { name: string }) => x.name === "send_estimate").input_schema.required).toContain("ask_summary");
    // The tool's answer went back to Claude.
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu1", content: expect.stringContaining("Nothing needs the owner") });
    expect(net.texts).toEqual([{ to: OWNER_MOBILE, body: "All quiet. No new leads, nothing due." }]);
    const log = await o.as.query(api.agent.log, { organizationId: o.organizationId });
    expect(log.map((r) => [r.direction, r.text])).toEqual([
      ["out", "All quiet. No new leads, nothing due."],
      ["in", "what needs me today?"],
    ]);
  });

  test("when Claude can't be reached the owner hears so and the error is logged", async () => {
    const t = setup();
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const net = stubNet([]);
    const o = await owner(t);
    vi.useFakeTimers();
    await t.mutation(internal.agent.inboundSms, text(OWNER_MOBILE, "draft an estimate for the Smiths"));
    await drain(t);
    expect(net.texts).toEqual([{ to: OWNER_MOBILE, body: "Couldn't get to that just now. Try again in a minute." }]);
    expect((await o.as.query(api.agent.log, { organizationId: o.organizationId })).some((r) => r.kind === "error")).toBe(true);
  });

  test("plainText strips markdown from replies", () => {
    expect(plainText("## Today\n**3 leads** — see [the list](https://x.test/leads)\n\n\n`PO-1`")).toBe("Today\n3 leads — see the list: https://x.test/leads\n\nPO-1");
  });
});

describe("the morning brief", () => {
  test("goes once a day at the company's time, to whoever turned the line on", async () => {
    const t = setup();
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const net = stubNet([says("Good morning.\n1) Order the cabinets: YES 1")]);
    const o = await owner(t);
    await o.as.mutation(api.agent.configure, { organizationId: o.organizationId, briefAt: "06:30" });
    const { orders } = await kitchen(t, o);
    // Due in two days and not ordered.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-29T12:00:00.000Z")); // 6:00am Central
    await t.run(async (ctx) => await ctx.db.patch(orders[0].id as Id<"purchaseOrders">, { neededBy: "2026-12-01" }));
    expect(centralMinutes()).toBe(6 * 60);
    expect(await t.mutation(internal.agent.morningBriefs, {})).toEqual({ started: 0 });
    vi.setSystemTime(new Date("2026-11-29T12:45:00.000Z")); // 6:45
    expect(await t.mutation(internal.agent.morningBriefs, {})).toEqual({ started: 1 });
    await drain(t);
    expect(await t.mutation(internal.agent.morningBriefs, {})).toEqual({ started: 0 });
    expect(net.claude).toHaveLength(1);
    expect(net.claude[0]).toMatchObject({ output_config: { effort: "medium" } });
    expect(net.claude[0].messages[0].content).toContain("Purchase orders to send");
    expect(net.texts).toEqual([{ to: OWNER_MOBILE, body: "Good morning.\n1) Order the cabinets: YES 1" }]);
  });

  test("an all-clear morning doesn't call Claude", async () => {
    const t = setup();
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const net = stubNet();
    const o = await owner(t);
    expect(o).toBeTruthy();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-29T12:45:00.000Z"));
    await t.mutation(internal.agent.morningBriefs, {});
    await drain(t);
    expect(net.claude).toEqual([]);
    expect(net.texts).toEqual([{ to: OWNER_MOBILE, body: expect.stringContaining("All clear today") }]);
  });

  test("the snapshot lists new leads nobody called, estimates opened and not signed, and open warranty requests", async () => {
    const t = setup();
    const o = await owner(t);
    const { estimateId, projectId } = await kitchen(t, o);
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const days = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await t.run(async (ctx) => {
      await ctx.db.insert("leads", { organizationId: o.organizationId, userId: o.userId, name: "Bob Ray", city: "Odessa", status: "new", createdAt: old, updatedAt: old });
      await ctx.db.patch(estimateId, { status: "opened", firstOpenedAt: days });
      await ctx.db.patch(projectId, { status: "completed" });
      await ctx.db.insert("projectTasks", {
        organizationId: o.organizationId,
        projectId,
        title: "Warranty",
        crewIds: [],
        order: 99,
        warrantyRequest: { note: "Cabinet door sags", requestedAt: old },
        createdBy: o.userId,
        createdAt: old,
        updatedAt: old,
      });
    });
    const { text: snap } = await t.mutation(internal.agent.runTool, { organizationId: o.organizationId, userId: o.userId, name: "business_snapshot", args: {} });
    expect(snap).toContain("Bob Ray (Odessa), in 2 h ago");
    expect(snap).toMatch(/Estimates waiting on the client:\n- .*Ann Miller.*opened 2 days ago, not signed/);
    expect(snap).toContain('Miller kitchen: "Cabinet door sags"');
  });
});

describe("the webhook", () => {
  test("a text signed by Twilio reaches the line; a bad signature is refused", async () => {
    const t = setup();
    const net = stubNet();
    await owner(t);
    const url = "https://example.convex.site/twilio/sms";
    vi.stubEnv("TWILIO_WEBHOOK_URL", url);
    const params = { From: OWNER_MOBILE, Body: "HELP", MessageSid: "SM9" };
    const sign = async () => {
      const data = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("");
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("tok"), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
      return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))));
    };
    const signature = await sign();
    expect(await twilioSignatureOk("tok", url, params, signature)).toBe(true);
    expect(await twilioSignatureOk("tok", url, { ...params, Body: "YES" }, signature)).toBe(false);
    const post = (sig: string) =>
      t.fetch("/twilio/sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams(params).toString() });
    expect((await post("bad")).status).toBe(403);
    vi.useFakeTimers();
    const ok = await post(signature);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("<Response></Response>");
    await drain(t);
    expect(net.texts).toEqual([{ to: OWNER_MOBILE, body: expect.stringContaining("Reply YES") }]);
  });
});
