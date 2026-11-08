// Numbers: the weekly email each client gets, and which ads bring in A's.

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalQuery, type QueryCtx } from "../_generated/server";
import { sendEmail } from "../lib/email";

const WEEK = 7 * 86_400_000;

type AdRow = { sourceAdId: string; applicants: number; A: number; B: number; C: number; booked: number; showed: number };

function byAdOf(applicants: Doc<"recruitApplicants">[]): AdRow[] {
  const rows = new Map<string, AdRow>();
  for (const a of applicants) {
    const r = rows.get(a.sourceAdId) ?? { sourceAdId: a.sourceAdId, applicants: 0, A: 0, B: 0, C: 0, booked: 0, showed: 0 };
    r.applicants++;
    if (a.score) r[a.score]++;
    if (a.bookedAt) r.booked++;
    if (a.status === "interviewed") r.showed++;
    rows.set(a.sourceAdId, r);
  }
  return [...rows.values()].sort((x, y) => y.A - x.A || y.applicants - x.applicants);
}

/** Real applicants only: "Try it" tests stay out of every number. */
async function applicantsOf(ctx: QueryCtx, clientId: Id<"recruitClients"> | undefined, since: string) {
  const all = clientId
    ? await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", clientId).gte("createdAt", since)).collect()
    : (await ctx.db.query("recruitApplicants").collect()).filter((a) => a.createdAt >= since);
  return all.filter((a) => !a.test);
}

/**
 * Which ads bring in A-grade reps: per ad, how many applied and how they
 * scored, booked and showed. Ops → Recruiting's By ad.
 */
export const byAd = internalQuery({
  args: { clientId: v.optional(v.id("recruitClients")), days: v.optional(v.number()) },
  handler: async (ctx, { clientId, days }) => byAdOf(await applicantsOf(ctx, clientId, new Date(Date.now() - (days ?? 30) * 86_400_000).toISOString())),
});

/** One client's week: who applied, how they scored, interviews booked and the show rate. */
export const week = internalQuery({
  args: { clientId: v.id("recruitClients"), now: v.optional(v.number()) },
  handler: async (ctx, { clientId, now }): Promise<Week> => {
    const end = now ?? Date.now();
    const since = new Date(end - WEEK).toISOString();
    const client = (await ctx.db.get(clientId))!;
    const applicants = await applicantsOf(ctx, clientId, since);
    // Interviews booked this week, whenever the rep applied.
    const all = (await ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", clientId)).collect()).filter((a) => !a.test);
    const booked = all.filter((a) => a.bookedAt && a.bookedAt >= since);
    // Show rate over interviews that were due this week and have a known outcome.
    const due = all.filter((a) => a.interviewAt && a.interviewAt >= since && Date.parse(a.interviewAt) <= end);
    const showed = due.filter((a) => a.status === "interviewed").length;
    const missed = due.filter((a) => a.status === "no_show").length;
    return {
      client: { name: client.name, role: client.role, city: client.city, reportEmail: client.reportEmail },
      since,
      applicants: applicants.map((a) => ({ name: a.name, phone: a.phone, score: a.score ?? "-", status: a.status, sourceAdId: a.sourceAdId, interviewAt: a.interviewAt, notes: a.notes })),
      counts: {
        applied: applicants.length,
        A: applicants.filter((a) => a.score === "A").length,
        B: applicants.filter((a) => a.score === "B").length,
        C: applicants.filter((a) => a.score === "C").length,
        booked: booked.length,
        showed,
        missed,
        showRate: showed + missed > 0 ? showed / (showed + missed) : null,
      },
      byAd: byAdOf(applicants),
    };
  },
});

export type Week = {
  client: { name: string; role: string; city: string; reportEmail?: string };
  since: string;
  applicants: Array<{ name: string; phone: string; score: string; status: string; sourceAdId: string; interviewAt?: string; notes?: string }>;
  counts: { applied: number; A: number; B: number; C: number; booked: number; showed: number; missed: number; showRate: number | null };
  byAd: AdRow[];
};

export function reportText(w: Week): { subject: string; text: string; html: string } {
  const c = w.counts;
  const rate = c.showRate === null ? "no interviews due yet" : `${Math.round(c.showRate * 100)}% (${c.showed} of ${c.showed + c.missed})`;
  const subject = `${w.client.name}: ${c.applied} applicants this week, ${c.A} A's, ${c.booked} interviews booked`;
  const lines = [
    `${w.client.role}, ${w.client.city}: the last 7 days`,
    "",
    `Applicants: ${c.applied}  (A ${c.A} · B ${c.B} · C ${c.C})`,
    `Interviews booked: ${c.booked}`,
    `Show rate: ${rate}`,
    "",
    "By ad:",
    ...w.byAd.map((r) => `  ${r.sourceAdId}: ${r.applicants} applied, ${r.A} A, ${r.B} B, ${r.C} C, ${r.booked} booked`),
    "",
    "Applicants:",
    ...w.applicants.map((a) => `  ${a.score}  ${a.name}  ${a.status}${a.interviewAt ? `  interview ${a.interviewAt.slice(0, 16).replace("T", " ")} UTC` : ""}${a.notes ? `  ${a.notes.split("\n")[0]}` : ""}`),
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const row = (cells: Array<string | number>) => `<tr>${cells.map((x) => `<td style="padding:4px 10px;border-bottom:1px solid #ddd">${esc(String(x))}</td>`).join("")}</tr>`;
  const html = [
    `<h2 style="font-family:sans-serif">${esc(w.client.name)}: ${esc(w.client.role)}, ${esc(w.client.city)}</h2>`,
    `<p style="font-family:sans-serif">Last 7 days: <b>${c.applied}</b> applicants (A ${c.A} · B ${c.B} · C ${c.C}), <b>${c.booked}</b> interviews booked, show rate <b>${esc(rate)}</b>.</p>`,
    `<h3 style="font-family:sans-serif">By ad</h3><table style="font-family:sans-serif;border-collapse:collapse">${row(["Ad", "Applied", "A", "B", "C", "Booked"])}${w.byAd.map((r) => row([r.sourceAdId, r.applicants, r.A, r.B, r.C, r.booked])).join("")}</table>`,
    `<h3 style="font-family:sans-serif">Applicants</h3><table style="font-family:sans-serif;border-collapse:collapse">${row(["Score", "Name", "Status", "Ad", "Notes"])}${w.applicants.map((a) => row([a.score, a.name, a.status, a.sourceAdId, a.notes?.split("\n")[0] ?? ""])).join("")}</table>`,
  ].join("\n");
  return { subject, text: lines.join("\n"), html };
}

/** Monday mornings (crons.ts): each active client with a report email gets their week. */
export const sendWeekly = internalAction({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.runQuery(internal.recruiting.clients.list, {});
    for (const c of clients) {
      if (!c.active || !c.reportEmail) continue;
      const w = await ctx.runQuery(internal.recruiting.reports.week, { clientId: c.clientId });
      const r = await sendEmail([c.reportEmail], reportText(w));
      if (r.status !== "sent") console.error(`Weekly report for ${c.name} not sent: ${r.error}`);
    }
  },
});
