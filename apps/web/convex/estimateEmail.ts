import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { siteUrl } from "./delivery";
import { fail, getOwned, logActivity, nowIso } from "./lib/access";
import { mutationDef } from "./lib/actor";
import { sendEmail } from "./lib/email";
import { MESSAGES, langOf, money, withLang, type Lang } from "./lib/i18n";

// Emailing an estimate to the client: from the company's name, replies to
// the company, with the link where they view and sign it. Used from the
// estimate's Share menu and by an assistant when the person asks it to send.

/** No second email for the same estimate within this long. */
const RESEND_GAP_MS = 10 * 60_000;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The email, in the client's language; the link opens the page in it too. */
export function estimateEmail(r: {
  clientName?: string;
  company: string;
  number: string;
  title?: string;
  total: number;
  link: string;
  message?: string;
  lang?: Lang;
}) {
  const m = MESSAGES[r.lang ?? "en"];
  const link = withLang(r.link, r.lang ?? "en");
  const first = r.clientName?.split(/\s+/)[0];
  const lines = [
    m.hi(first),
    ...(r.message ? [r.message] : []),
    m.estimateBody(m.estimateWhat(r.number, r.title), r.company, money(r.total)),
    link,
    m.questions(r.company),
  ];
  const paragraphs = lines.filter((l) => l !== link);
  return {
    subject: m.estimateSubject(r.company),
    text: lines.join("\n\n"),
    html: [
      ...paragraphs.slice(0, -1).map((l) => `<p>${escape(l).replace(/\n/g, "<br>")}</p>`),
      `<p><a href="${escape(link)}" style="display:inline-block;padding:10px 18px;background:#336699;color:#fff;text-decoration:none">${m.estimateButton}</a></p>`,
      `<p style="color:#666">${escape(paragraphs[paragraphs.length - 1])}</p>`,
    ].join(""),
  };
}

/**
 * Emails the estimate to its client and marks it sent. Refused when the
 * client has no email, email isn't set up, it's signed or declined, or it
 * was emailed in the last few minutes.
 */
export const emailDef = mutationDef({
  args: { id: v.id("estimates"), message: v.optional(v.string()) },
  handler: async (ctx, { id, message }) => {
    const { doc: estimate, user } = await getOwned(ctx, "estimates", id);
    if (!["draft", "sent", "opened"].includes(estimate.status)) fail("INVALID", "This estimate was already answered, so it can't be sent again");
    if (estimate.items.length === 0 || estimate.totalAmount <= 0) fail("INVALID", "Add line items before sending");
    const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
    if (!client?.email) fail("INVALID", "Add an email for this client first, or share the link yourself");
    if (!process.env.RESEND_API_KEY) fail("INVALID", "Email isn't set up for Tolliver yet. Share the link instead");
    const now = nowIso();
    if (estimate.lastEmailedAt && Date.parse(now) - Date.parse(estimate.lastEmailedAt) < RESEND_GAP_MS)
      fail("INVALID", "It was emailed a few minutes ago");
    const organization = (await ctx.db.get(estimate.organizationId))!;
    const shareToken = estimate.shareToken ?? crypto.randomUUID().replace(/-/g, "");
    await ctx.db.patch(id, {
      shareToken,
      lastEmailedAt: now,
      ...(estimate.status === "draft" ? { status: "sent" as const } : {}),
      ...(estimate.sentAt ? {} : { sentAt: now }),
      updatedAt: now,
    });
    const email = estimateEmail({
      clientName: client.name,
      company: organization.name,
      number: estimate.estimateNumber,
      title: estimate.title,
      total: estimate.totalAmount,
      link: `${siteUrl()}/share/estimate/${shareToken}`,
      message: message?.trim().slice(0, 1000) || undefined,
      lang: langOf(client),
    });
    await ctx.scheduler.runAfter(0, internal.estimateEmail.deliver, { estimateId: id, to: client.email, replyTo: organization.email, ...email });
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: user._id,
      action: "emailed_to_client",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: estimate.estimateNumber, to: client.email },
    });
    return { to: client.email, link: withLang(`${siteUrl()}/share/estimate/${shareToken}`, langOf(client)) };
  },
});

export const email = mutation(emailDef);

export const deliver = internalAction({
  args: { estimateId: v.id("estimates"), to: v.string(), replyTo: v.optional(v.string()), subject: v.string(), text: v.string(), html: v.string() },
  handler: async (ctx, { estimateId, to, replyTo, ...body }) => {
    const result = await sendEmail([to], { ...body, replyTo });
    if (result.status !== "sent") await ctx.runMutation(internal.estimateEmail.recordFailure, { estimateId, to, error: result.error ?? result.status });
    return result.status;
  },
});

/** A send that didn't go through: logged, and the estimate can be emailed again straight away. */
export const recordFailure = internalMutation({
  args: { estimateId: v.id("estimates"), to: v.string(), error: v.string() },
  handler: async (ctx, { estimateId, to, error }) => {
    const estimate = await ctx.db.get(estimateId);
    if (!estimate) return;
    await ctx.db.patch(estimateId, { lastEmailedAt: undefined });
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: estimate.userId,
      action: "email_failed",
      resourceType: "estimate",
      resourceId: estimateId,
      details: { estimateNumber: estimate.estimateNumber, to, error },
    });
  },
});
