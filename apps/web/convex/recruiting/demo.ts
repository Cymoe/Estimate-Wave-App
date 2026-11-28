// The recruiting demo: a made-up client with applicants, threads, ads and
// hires in every state, plus a scripted conversation that plays out live in
// Ops → Recruiting. All scripted: nothing goes to Claude, Twilio or Cal.com.
//   Ops → Recruiting → Setup → Demo, or npx convex run recruiting/demo:seed

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { cancelJobs } from "./applicants";
import { ensureLinks } from "./clients";
import { checkPiece, type Kind } from "./lib/adChecks";
import { atWallClock, spoken, wallClock } from "./lib/time";
import { consentText } from "./public";

const TZ = "America/Chicago";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const CLIENT = {
  name: "Demo Roofing Co",
  role: "Door-to-door roofing sales rep (closers and setters)",
  city: "Midland, TX",
  compSheet:
    "Closers: 10% of every contract you close; the average roof is $14,000. Setters: $50 per inspection set, plus $150 when it closes. Paid weekly. Earnings vary and are commission-based.",
  calEventLink: "https://cal.com/demo/interview",
  timezone: TZ,
  territory: "Permian Basin",
  repStories: ["Marcus was a line cook making $13 an hour. His first summer closing roofs, he made $38,000.", "Dana drove for Uber. She set 160 inspections in her first 10 weeks."],
  perks: "Paid training, weekly leaderboard, and the top 10 reps go to Cabo.",
  wants: "Closers and setters; door-to-door experience a plus",
};

type Ad = { sourceAdId: string; kind: Kind; angle: string; title?: string; body: string; spendCents: number; status: "approved" | "retired" };
const ADS: Ad[] = [
  {
    sourceAdId: "demo-m1",
    kind: "meta_primary",
    angle: "money proof",
    body: "Marcus was a line cook at $13 an hour. His first summer closing roofs with Demo Roofing Co, he made $38,000. Closers keep 10% of every roof. Paid training, paid weekly. Earnings vary and are commission-based. Apply in 20 seconds.",
    spendCents: 30_000,
    status: "approved",
  },
  { sourceAdId: "demo-h2", kind: "hook", angle: "career change", body: "Tired of $13 an hour? Marcus was too.", spendCents: 12_000, status: "approved" },
  {
    sourceAdId: "demo-v3",
    kind: "video_script",
    angle: "day in the life",
    title: "A day on the doors",
    body: "[Rep walking a sunny street, 9am] This is my office. I knock doors from 10 to 6, and every roof I close, I keep 10%. [Rep shaking a homeowner's hand] Paid training, paid weekly. Earnings vary and are commission-based. Link below.",
    spendCents: 18_000,
    status: "approved",
  },
  {
    sourceAdId: "demo-i4",
    kind: "indeed",
    angle: "straight talk",
    title: "Roofing Sales Rep (Closer) - Midland, TX",
    body: "Demo Roofing Co is hiring closers in the Permian Basin. You'll meet homeowners whose roofs were hit by storms and walk them through the claim. Pay: 10% of every contract you close (the average roof is $14,000), paid weekly. Earnings vary and are commission-based. Paid training. Apply in 20 seconds and our recruiter will text you.",
    spendCents: 9_000,
    status: "approved",
  },
  {
    sourceAdId: "demo-m5",
    kind: "meta_primary",
    angle: "competition",
    body: "Think you can top our leaderboard? The top 10 reps go to Cabo. Earnings vary and are commission-based.",
    spendCents: 15_000,
    status: "retired",
  },
];

/** This week's drafts: real checks run on them, so two come with warnings to look at. */
const DRAFTS: Array<{ kind: Kind; angle: string; title?: string; body: string; variationOf?: string }> = [
  { kind: "hook", angle: "money proof", body: "He was making $13 an hour flipping burgers. Then he made $38,000 in one summer.", variationOf: "demo-m1" },
  { kind: "hook", angle: "money proof", body: "10% of every roof you close. The average roof is $14,000.", variationOf: "demo-m1" },
  { kind: "hook", angle: "career change", body: "Your Uber rating won't pay your rent. This might." },
  { kind: "hook", angle: "day in the life", body: "My office has no walls and no ceiling.", variationOf: "demo-v3" },
  { kind: "hook", angle: "straight talk", body: "Door-to-door is hard. That's why it pays." },
  { kind: "hook", angle: "money proof", body: "Make $250k this summer knocking doors." },
  {
    kind: "meta_primary",
    angle: "money proof",
    body: "Dana drove for Uber. In her first 10 weeks with Demo Roofing Co she set 160 inspections, at $50 each plus $150 when they close. Paid training, paid weekly. Earnings vary and are commission-based.",
    variationOf: "demo-m1",
  },
  { kind: "meta_primary", angle: "competition", body: "Weekly leaderboard. Top 10 go to Cabo. Are you top 10?" },
  {
    kind: "meta_primary",
    angle: "straight talk",
    body: "No fake promises: you knock doors, you meet homeowners after storms, and you keep 10% of every roof you close. Earnings vary and are commission-based. Paid training starts Monday.",
  },
  {
    kind: "video_script",
    angle: "day in the life",
    title: "From the line to the roof",
    body: "[Marcus in a kitchen apron, then on a doorstep] I was making $13 an hour. Last summer I made $38,000 closing roofs. Earnings vary and are commission-based. Paid training, paid weekly. Tap the link.",
    variationOf: "demo-v3",
  },
  {
    kind: "video_script",
    angle: "career change",
    title: "Quit the drive",
    body: "[Dana in her car, then knocking a door] I drove for Uber. Now I set inspections, $50 each plus $150 when they close. Earnings vary and are commission-based. Apply in 20 seconds.",
  },
  {
    kind: "indeed",
    angle: "money proof",
    title: "Roofing Sales Closer - $14,000 average roof, 10% to you",
    body: "Demo Roofing Co is hiring closers in Midland. 10% of every contract you close, paid weekly. Earnings vary and are commission-based. Paid training. Apply and our recruiter will text you.",
    variationOf: "demo-i4",
  },
];

type Line = [dir: "in" | "out", text: string];
type Seeded = {
  name: string;
  ad: string;
  score?: "A" | "B" | "C";
  status: Doc<"recruitApplicants">["status"];
  outcome?: "hired" | "not_hired";
  appliedDaysAgo: number;
  interviewIn?: number; // days from now (negative: past), at 10am
  answers?: Record<string, string>;
  notes?: string;
  thread: Line[];
};

const SEEDED: Seeded[] = [
  {
    name: "Dana Cruz",
    ad: "demo-m1",
    score: "A",
    status: "interviewed",
    outcome: "hired",
    appliedDaysAgo: 9,
    interviewIn: -6,
    answers: { d2d: "2 summers pest control door to door", role: "closer", availability: "full days Mon-Sat", transport: "own car" },
    notes: "Strong closer, 40 accounts last summer.",
    thread: [
      ["out", "Hey Dana, it's Jordan with National Sales Registry. Saw you applied for the roofing sales job with Demo Roofing Co. Got 2 minutes? Reply STOP to opt out."],
      ["in", "yes!"],
      ["out", "Have you done door-to-door or any commission sales before?"],
      ["in", "2 summers selling pest control door to door"],
      ["out", "Love it. You're a great fit. You're booked with Demo Roofing Co. See you there!"],
    ],
  },
  {
    name: "Marcus Hill",
    ad: "demo-v3",
    score: "A",
    status: "interviewed",
    outcome: "hired",
    appliedDaysAgo: 7,
    interviewIn: -4,
    answers: { d2d: "sold solar for a year", role: "both", availability: "full days", transport: "own truck" },
    thread: [
      ["out", "Hey Marcus, it's Jordan with National Sales Registry. Thanks for applying to Demo Roofing Co! Done sales before? Reply STOP to opt out."],
      ["in", "Sold solar for a year"],
      ["out", "That's great experience. Closer, setter, or both?"],
      ["in", "both"],
    ],
  },
  {
    name: "Lee Park",
    ad: "demo-m1",
    score: "B",
    status: "interviewed",
    outcome: "not_hired",
    appliedDaysAgo: 8,
    interviewIn: -5,
    answers: { d2d: "retail sales", role: "setter", availability: "afternoons" },
    thread: [
      ["out", "Hey Lee, it's Jordan with National Sales Registry. Got 2 minutes for a few questions about the Demo Roofing Co job? Reply STOP to opt out."],
      ["in", "sure, I've done retail sales"],
    ],
  },
  {
    name: "Sam Ortiz",
    ad: "demo-m1",
    score: "A",
    status: "booked",
    appliedDaysAgo: 1,
    interviewIn: 1,
    answers: { d2d: "knocked doors for a campaign", role: "closer", availability: "full days", transport: "own car" },
    thread: [
      ["out", "Hey Sam, it's Jordan with National Sales Registry. Saw your application for Demo Roofing Co. Done door-to-door before? Reply STOP to opt out."],
      ["in", "Knocked doors for a campaign last fall"],
      ["out", "That counts! Want to meet the team? I can do tomorrow at 10:00 AM."],
      ["in", "perfect"],
      ["out", "You're booked. I'll text you a reminder the night before."],
    ],
  },
  {
    name: "Chris Bell",
    ad: "demo-h2",
    score: "B",
    status: "no_show",
    appliedDaysAgo: 5,
    interviewIn: -2,
    answers: { d2d: "none", role: "setter", availability: "full days" },
    thread: [
      ["out", "Hey Chris, it's Jordan with National Sales Registry. Thanks for applying! A few quick questions? Reply STOP to opt out."],
      ["in", "ok"],
      ["out", "Hi Chris, we missed you at the Demo Roofing Co interview. Want to grab another time? Pick one here: https://cal.com/demo/interview or reply with a day that works."],
    ],
  },
  {
    name: "Priya Shah",
    ad: "demo-h2",
    score: "B",
    status: "screening",
    appliedDaysAgo: 0,
    answers: { d2d: "a summer knocking doors for an internet company" },
    thread: [
      ["out", "Hey Priya, it's Jordan with National Sales Registry. Got 2 minutes for the Demo Roofing Co job? Reply STOP to opt out."],
      ["in", "yes"],
      ["out", "Have you done door-to-door or any commission sales before?"],
      ["in", "a summer of knocking doors for an internet company"],
    ],
  },
  {
    name: "Alex Romero",
    ad: "demo-m1",
    score: "A",
    status: "qualified",
    appliedDaysAgo: 0,
    answers: { d2d: "3 years roofing", role: "closer", availability: "full days", transport: "own truck" },
    thread: [
      ["out", "Hey Alex, it's Jordan with National Sales Registry. Thanks for applying to Demo Roofing Co! Done sales before? Reply STOP to opt out."],
      ["in", "3 years in roofing sales"],
      ["out", "Perfect. Want to meet the team? I can do Wed at 10:00 AM or 2:00 PM."],
    ],
  },
  {
    name: "Kim Nguyen",
    ad: "demo-h2",
    score: "C",
    status: "ghosted",
    appliedDaysAgo: 4,
    notes: "Ghosted after two follow-ups.",
    thread: [
      ["out", "Hey Kim, it's Jordan with National Sales Registry. Got 2 minutes for the Demo Roofing Co job? Reply STOP to opt out."],
      ["out", "Hey Kim, still interested in the roofing sales job? Just reply here."],
      ["out", "Last check-in from me, Kim. If you want the interview, reply anytime."],
    ],
  },
  {
    name: "Ray Ford",
    ad: "demo-h2",
    score: "C",
    status: "rejected",
    appliedDaysAgo: 3,
    notes: "No car, and only free on weekends.",
    answers: { availability: "weekends only", transport: "no car" },
    thread: [
      ["out", "Hey Ray, it's Jordan with National Sales Registry. Can you work full days Monday to Saturday, and do you have a car? Reply STOP to opt out."],
      ["in", "only weekends, no car right now"],
      ["out", "Thanks for being straight with me, Ray. This one needs full days and a car, so it's not the right fit now. Good luck!"],
    ],
  },
  {
    name: "Jess Lowe",
    ad: "demo-i4",
    status: "opted_out",
    appliedDaysAgo: 2,
    thread: [
      ["out", "Hey Jess, it's Jordan with National Sales Registry. Thanks for applying to Demo Roofing Co! Reply STOP to opt out."],
      ["in", "STOP"],
      ["out", "You're unsubscribed and won't get more texts from us. Reply START to opt back in."],
    ],
  },
  {
    name: "Omar Diaz",
    ad: "demo-i4",
    score: "B",
    status: "flagged",
    appliedDaysAgo: 1,
    notes: "Flagged: asked whether a 2015 conviction rules him out. A person should answer.",
    answers: { d2d: "sold cars 2 years", role: "closer" },
    thread: [
      ["out", "Hey Omar, it's Jordan with National Sales Registry. Done sales before? Reply STOP to opt out."],
      ["in", "sold cars for 2 years. do they hire people with a record? I had something in 2015"],
      ["out", "Good question, and thanks for asking. Let me get someone from the team to answer that one for you."],
    ],
  },
  {
    name: "Tara Wells",
    ad: "demo-m5",
    score: "C",
    status: "rejected",
    appliedDaysAgo: 12,
    notes: "Wanted salaried office work.",
    thread: [["out", "Hey Tara, it's Jordan with National Sales Registry. This one is commission-based door-to-door. Still interested? Reply STOP to opt out."], ["in", "no I want an office job, thanks"]],
  },
  {
    name: "Ben Cole",
    ad: "demo-m5",
    score: "C",
    status: "ghosted",
    appliedDaysAgo: 11,
    notes: "Ghosted after two follow-ups.",
    thread: [["out", "Hey Ben, it's Jordan with National Sales Registry. Got 2 minutes? Reply STOP to opt out."]],
  },
  {
    name: "Mia Grant",
    ad: "direct",
    status: "texted",
    appliedDaysAgo: 0,
    thread: [["out", "Hey Mia, it's Jordan with National Sales Registry. Saw you applied for the roofing sales job with Demo Roofing Co. Got 2 minutes? Reply STOP to opt out."]],
  },
];

/** 10am client time, `days` from now. */
function tenAm(now: number, days: number) {
  const d = wallClock(new Date(now + days * DAY), TZ);
  return atWallClock({ ...d, hour: 10, minute: 0 }, TZ);
}

export async function demoClient(ctx: MutationCtx) {
  return (await ctx.db.query("recruitClients").collect()).find((c) => c.demo === true) ?? null;
}

/** Takes every demo record out: the client, its applicants and their texts, its ads, and any scripted step still waiting. */
export async function clearIn(ctx: MutationCtx) {
  let removed = 0;
  for (const c of (await ctx.db.query("recruitClients").collect()).filter((x) => x.demo)) {
    for (const a of await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", c._id)).collect()) {
      await cancelJobs(ctx, a);
      for (const m of await ctx.db.query("recruitMessages").withIndex("by_applicant", (q) => q.eq("applicantId", a._id)).collect()) await ctx.db.delete(m._id);
      await ctx.db.delete(a._id);
      removed++;
    }
    for (const ad of await ctx.db.query("recruitAds").withIndex("by_client_status", (q) => q.eq("clientId", c._id)).collect()) await ctx.db.delete(ad._id);
    for (const b of await ctx.db.query("recruitAdBatches").withIndex("by_client", (q) => q.eq("clientId", c._id)).collect()) await ctx.db.delete(b._id);
    await ctx.db.delete(c._id);
  }
  return { removed };
}

/** A fresh batch of drafts for the demo client: the last batch's undecided drafts expire, as with a real one. */
export async function demoBatchIn(ctx: MutationCtx, clientId: Id<"recruitClients">, retire: Array<{ sourceAdId: string; reason: string }> = []) {
  const client = (await ctx.db.get(clientId))!;
  const at = new Date().toISOString();
  for (const old of await ctx.db.query("recruitAds").withIndex("by_client_status", (q) => q.eq("clientId", clientId).eq("status", "draft")).collect()) await ctx.db.patch(old._id, { status: "expired", decidedAt: at });
  const batchId = await ctx.db.insert("recruitAdBatches", { clientId, status: "writing", createdAt: at });
  const allowed = { inputs: [client.compSheet, ...(client.repStories ?? []), client.perks ?? ""].join("\n") };
  for (const d of DRAFTS) {
    await ctx.db.insert("recruitAds", { ...d, clientId, batchId, status: "draft", warnings: checkPiece(d.kind, [d.title, d.body].filter(Boolean).join("\n"), allowed), createdAt: at });
  }
  const variations = DRAFTS.filter((d) => d.variationOf).length;
  await ctx.db.patch(batchId, {
    status: "ready",
    learningNotes:
      "Money proof wins: demo-m1 brought 3 A's and a hire, and Marcus's day-in-the-life video got a hire for $180.\nThe career-change hook brings volume but no A's yet.\nThis batch riffs on the money proof and the video, and tries straight talk.",
    retire,
    variations,
    fresh: DRAFTS.length - variations,
    problems: [],
  });
  return batchId;
}

/** The whole demo, fresh: anything from an earlier one is cleared first. */
export async function seedIn(ctx: MutationCtx) {
  await clearIn(ctx);
  const now = Date.now();
  const clientId = await ctx.db.insert("recruitClients", { ...CLIENT, active: true, adsEnabled: false, demo: true, createdAt: iso(now - 14 * DAY), slug: "demo", adSeq: 5 });
  await ensureLinks(ctx, clientId);

  const firstBatch = await ctx.db.insert("recruitAdBatches", { clientId, status: "ready", createdAt: iso(now - 14 * DAY), learningNotes: "First batch: no numbers yet, so it spreads across the angles.", variations: 0, fresh: ADS.length });
  for (const ad of ADS) await ctx.db.insert("recruitAds", { ...ad, clientId, batchId: firstBatch, warnings: [], createdAt: iso(now - 14 * DAY), decidedAt: iso(now - 13 * DAY) });
  await demoBatchIn(ctx, clientId, [{ sourceAdId: "demo-h2", reason: "4 applicants and no A's; the money-proof hooks do better" }]);

  let n = 0;
  for (const s of SEEDED) {
    const applied = now - s.appliedDaysAgo * DAY - (n % 5) * HOUR - 2 * HOUR;
    const interviewAt = s.interviewIn === undefined ? undefined : tenAm(now, s.interviewIn).getTime();
    const id = await ctx.db.insert("recruitApplicants", {
      name: s.name,
      phone: `+1555010${String(1000 + n).slice(-4)}`,
      clientId,
      sourceAdId: s.ad,
      answers: s.answers ?? {},
      score: s.score,
      status: s.status,
      notes: s.notes,
      createdAt: iso(applied),
      followUps: s.status === "ghosted" ? 2 : 0,
      demo: true,
      consentAt: iso(applied),
      consentText: consentText(CLIENT.name),
      ...(interviewAt ? { interviewAt: iso(interviewAt), bookedAt: iso(Math.min(applied + HOUR, now)) } : {}),
      ...(s.outcome ? { outcome: s.outcome, outcomeAt: iso(Math.min((interviewAt ?? now) + DAY, now)) } : {}),
    });
    // Texts a minute or two apart, starting a minute after they applied.
    let at = applied + MIN;
    let lastIn: number | undefined;
    let lastOut: number | undefined;
    for (const [direction, body] of s.thread) {
      await ctx.db.insert("recruitMessages", { applicantId: id, direction, body, at: iso(at), simulated: true });
      if (direction === "in") lastIn = at;
      else lastOut = at;
      at += (direction === "out" ? 3 : 1) * MIN;
    }
    await ctx.db.patch(id, { ...(lastIn ? { lastInboundAt: iso(lastIn) } : {}), ...(lastOut ? { lastOutboundAt: iso(lastOut) } : {}) });
    n++;
  }
  return { clientId, applicants: SEEDED.length };
}

// ---- The live run: one rep, start to hire, about a minute and a half ----

type Step = { after: number; text?: (first: string) => Line; patch?: (now: number) => Partial<Doc<"recruitApplicants">> };

const interviewSlot = (now: number) => tenAm(now, 1);

export const SCRIPT: Step[] = [
  { after: 2_000, text: (f) => ["out", `Hey ${f}, it's Jordan with National Sales Registry. Saw you applied for the roofing sales job with Demo Roofing Co. Got 2 minutes for a few quick questions? Reply STOP to opt out.`], patch: () => ({ status: "texted" }) },
  { after: 5_000, text: () => ["in", "yeah sure"], patch: () => ({ status: "screening" }) },
  { after: 3_000, text: () => ["out", "Have you done door-to-door or any commission sales before?"] },
  { after: 5_000, text: () => ["in", "2 summers selling pest control door to door"], patch: () => ({ answers: { d2d: "2 summers pest control door to door" } }) },
  { after: 3_000, text: () => ["out", "Nice, that counts. Closer, setter, or both?"] },
  { after: 5_000, text: () => ["in", "closer. I closed about 40 accounts last summer"], patch: () => ({ answers: { d2d: "2 summers pest control door to door", role: "closer, about 40 accounts last summer" } }) },
  { after: 3_000, text: () => ["out", "Solid. Can you work full days Monday to Saturday, and do you have a reliable car?"] },
  {
    after: 5_000,
    text: () => ["in", "yes and yes"],
    patch: () => ({ answers: { d2d: "2 summers pest control door to door", role: "closer, about 40 accounts last summer", availability: "full days Mon-Sat", transport: "own car" }, score: "A" }),
  },
  {
    after: 3_000,
    text: (f) => ["out", `Love it, ${f}. You're a great fit. Want to meet the Demo Roofing Co team? I can do ${spoken(interviewSlot(Date.now()), TZ)} or 2:00 PM the same day.`],
    patch: () => ({ status: "qualified", notes: "Experienced closer: 2 summers door to door, about 40 accounts." }),
  },
  { after: 5_000, text: () => ["in", "10 works"] },
  {
    after: 3_000,
    text: () => ["out", `You're booked: ${spoken(interviewSlot(Date.now()), TZ)} with Demo Roofing Co, 1200 Main St, Midland. I'll text you a reminder the night before.`],
    patch: (now) => ({ status: "booked", interviewAt: iso(interviewSlot(now).getTime()), bookedAt: iso(now) }),
  },
  { after: 6_000, text: (f) => ["out", `(Demo: skipping ahead to the night before.) Hi ${f}, reminder: your interview with Demo Roofing Co is tomorrow at 10:00 AM. Reply here if anything changes.`], patch: () => ({ remindersSent: ["night_before"] }) },
  { after: 4_000, text: () => ["in", "see you there 👍"] },
  { after: 6_000, patch: () => ({ status: "interviewed", notes: "Experienced closer: 2 summers door to door, about 40 accounts.\n(Demo: skipped ahead. Showed up for the interview.)" }) },
  { after: 6_000, patch: (now) => ({ outcome: "hired", outcomeAt: iso(now), notes: "Experienced closer: 2 summers door to door, about 40 accounts.\n(Demo: skipped ahead. Showed up for the interview, and Demo Roofing Co hired them.)" }) },
];

async function schedule(ctx: MutationCtx, applicantId: Id<"recruitApplicants">, i: number) {
  const job = await ctx.scheduler.runAfter(SCRIPT[i].after, internal.recruiting.demo.step, { applicantId, i });
  await ctx.db.patch(applicantId, { jobIds: [job] });
}

/** Starts the script for a demo applicant (a new live rep, or someone who applied on /jobs/demo). */
export async function startScript(ctx: MutationCtx, applicantId: Id<"recruitApplicants">) {
  await schedule(ctx, applicantId, 0);
}

export const step = internalMutation({
  args: { applicantId: v.id("recruitApplicants"), i: v.number() },
  handler: async (ctx, { applicantId, i }) => {
    const a = await ctx.db.get(applicantId);
    // Removed, or texted STOP mid-demo: the script stops.
    if (!a || !a.demo || a.status === "opted_out" || !SCRIPT[i]) return;
    const now = Date.now();
    const s = SCRIPT[i];
    const patch: Partial<Doc<"recruitApplicants">> = { ...(s.patch?.(now) ?? {}), jobIds: [] };
    if (s.text) {
      const [direction, body] = s.text(a.name.trim().split(/\s+/)[0] || "there");
      await ctx.db.insert("recruitMessages", { applicantId, direction, body, at: iso(now), simulated: true });
      if (direction === "in") patch.lastInboundAt = iso(now);
      else patch.lastOutboundAt = iso(now);
    }
    await ctx.db.patch(applicantId, patch);
    if (SCRIPT[i + 1]) await schedule(ctx, applicantId, i + 1);
  },
});

// Live reps' made-up numbers start here (555 numbers are never real).
const LIVE_PHONE = "+1555020";
const LIVE_NAMES = ["Taylor Reed", "Jamie Fox", "Casey Moore", "Riley Hart", "Drew Lane"];

/** A new rep applies from demo-m1 and the script starts; seeds the demo first if it isn't there. */
export async function liveIn(ctx: MutationCtx, name?: string) {
  const client = (await demoClient(ctx)) ?? (await ctx.db.get((await seedIn(ctx)).clientId))!;
  const live = (await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", client._id)).collect()).filter((a) => a.phone.startsWith(LIVE_PHONE)).length;
  const now = Date.now();
  const applicantId = await ctx.db.insert("recruitApplicants", {
    name: name?.trim() || LIVE_NAMES[live % LIVE_NAMES.length],
    phone: `${LIVE_PHONE}${String(now % 10_000).padStart(4, "0")}`,
    clientId: client._id,
    sourceAdId: "demo-m1",
    answers: {},
    status: "new",
    followUps: 0,
    createdAt: iso(now),
    demo: true,
    consentAt: iso(now),
    consentText: consentText(client.name),
  });
  await startScript(ctx, applicantId);
  return applicantId;
}

// For `npx convex run` and the ad agent.
export const seed = internalMutation({ args: {}, handler: async (ctx) => seedIn(ctx) });
export const live = internalMutation({ args: { name: v.optional(v.string()) }, handler: async (ctx, { name }) => liveIn(ctx, name) });
export const clear = internalMutation({ args: {}, handler: async (ctx) => clearIn(ctx) });
export const batch = internalMutation({ args: { clientId: v.id("recruitClients") }, handler: async (ctx, { clientId }) => demoBatchIn(ctx, clientId) });
