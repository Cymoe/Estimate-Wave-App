// The two public recruiting pages, no login:
//   /jobs/<slug>?ad=<source ad id>   the apply page an ad links to; the rep agrees to texts and Jordan texts them
//   /hires/<token>                   the client's private link (in the weekly report) to mark who they hired

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { fail } from "../lib/access";
import { applyIn, serviceName, setOutcome } from "./applicants";
import { clientBySlug } from "./clients";

/** The words a rep agrees to on the apply page. Saved with each applicant as proof of opt-in. */
export const consentText = (client: string) =>
  `By tapping Apply, you agree that ${serviceName()} may text you at this number about the ${client} job, including automated texts, to ask a few questions and set up an interview. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`;

/** More than this many applications to one client inside ten minutes and the page asks people to wait. */
export const BURST = 30;
const BURST_MS = 10 * 60_000;

/** An ad's source ad id from the link: short, letters, numbers and dashes. Anything else counts as no ad. */
export const adFromLink = (ad: string | undefined) => {
  const s = (ad ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(s) ? s : "direct";
};

/** What the apply page shows: the job, and the consent wording. Null when the link is wrong or the client is paused. */
export const job = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const c = await clientBySlug(ctx, slug);
    if (!c || !c.active) return null;
    return { company: c.name, role: c.role, city: c.city, perks: c.perks ?? null, service: serviceName(), consent: consentText(c.name) };
  },
});

/** A rep applies: saved with their consent, and Jordan's first text goes out within two minutes. */
export const apply = mutation({
  args: { slug: v.string(), ad: v.optional(v.string()), name: v.string(), phone: v.string(), agreed: v.boolean() },
  handler: async (ctx, { slug, ad, name, phone, agreed }) => {
    const c = await clientBySlug(ctx, slug);
    if (!c || !c.active) fail("NOT_FOUND", "This job isn't taking applications right now", "job_closed");
    if (!agreed) fail("INVALID", "Check the box to agree to texts: that's how the interview gets set up", "consent");
    if (!name.trim()) fail("INVALID", "Enter your name", "name");
    const since = new Date(Date.now() - BURST_MS).toISOString();
    const recent = await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", c._id).gte("createdAt", since)).take(BURST);
    if (recent.filter((a) => !a.test).length >= BURST) fail("INVALID", "Lots of people are applying right now. Try again in a few minutes.", "busy");
    const r = await applyIn(ctx, { name: name.trim().slice(0, 120), phone: phone.slice(0, 40), clientId: c._id, sourceAdId: adFromLink(ad), consentText: consentText(c.name) });
    if (!r.ok) {
      if (r.error.startsWith("phone")) fail("INVALID", "Enter a US cell number, like (432) 555-0100", "phone");
      if (r.error.includes("opted out")) fail("INVALID", "This number opted out of our texts. Text START to the number we texted you from to opt back in.", "opted_out");
      fail("INVALID", r.error);
    }
    return { existing: r.existing };
  },
});

// ---- The client's hires link ----

/** Reps go on the hires list once their interview time has passed, or they're marked showed or have an outcome. Last 90 days. */
const HIRES_DAYS = 90;

async function clientByToken(ctx: QueryCtx, token: string): Promise<Doc<"recruitClients"> | null> {
  if (!token) return null;
  return await ctx.db.query("recruitClients").withIndex("by_hires_token", (q) => q.eq("hiresToken", token)).first();
}

export const interviewedOf = (applicants: Doc<"recruitApplicants">[], now: number) =>
  applicants.filter(
    (a) =>
      !a.test &&
      (a.outcome !== undefined || a.status === "interviewed" || ((a.status === "booked" || a.status === "no_show") && a.interviewAt !== undefined && Date.parse(a.interviewAt) <= now)),
  );

/** The client's reps who've interviewed lately, with whether they were hired. */
export const hires = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const c = await clientByToken(ctx, token);
    if (!c) return null;
    const now = Date.now();
    const since = new Date(now - HIRES_DAYS * 86_400_000).toISOString();
    const applicants = await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", c._id).gte("createdAt", since)).collect();
    const reps = interviewedOf(applicants, now)
      .sort((x, y) => (y.interviewAt ?? y.createdAt).localeCompare(x.interviewAt ?? x.createdAt))
      .map((a) => ({ id: a._id, name: a.name, score: a.score ?? null, interviewAt: a.interviewAt ?? null, missed: a.status === "no_show", outcome: a.outcome ?? null }));
    return { company: c.name, role: c.role, reps };
  },
});

export const setHire = mutation({
  args: { token: v.string(), applicantId: v.string(), outcome: v.union(v.literal("hired"), v.literal("not_hired"), v.null()) },
  handler: async (ctx, { token, applicantId, outcome }) => {
    const c = await clientByToken(ctx, token);
    if (!c) fail("NOT_FOUND", "This link isn't valid", "link_invalid");
    const id = ctx.db.normalizeId("recruitApplicants", applicantId);
    const a = id && (await ctx.db.get(id as Id<"recruitApplicants">));
    if (!a || a.clientId !== c._id || a.test) fail("NOT_FOUND", "That rep isn't on this list", "not_found");
    await setOutcome(ctx, a, outcome);
    return null;
  },
});
