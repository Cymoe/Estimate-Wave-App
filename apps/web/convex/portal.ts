import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso } from "./lib/access";
import { isLang, langOf } from "./lib/i18n";
import { logoUrlOf } from "./lib/organizations";
import { allowanceUnitPrice, cleanLink, selectionsFor } from "./lib/selections";
import { cents } from "./lib/totals";
import { changesSince, createSignoff } from "./signoffs";

// The client portal: one private link per client, no login, with everything
// for their jobs. It shows only what the company has sent or asked for: the
// open asks first (an estimate to sign, changes to sign, a pick to make), then
// each job's signed documents. The link is the only key, so the company can
// turn it off (and get a new one) if it's passed around.

const newToken = () => crypto.randomUUID().replace(/-/g, "");

async function clientByToken(ctx: QueryCtx | MutationCtx, token: string): Promise<Doc<"clients"> | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return await ctx.db
    .query("clients")
    .withIndex("by_portal_token", (q) => q.eq("portalToken", token))
    .unique();
}

/** The client's portal link, if it has one (null while turned off). */
export const current = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const { doc } = await getOwned(ctx, "clients", clientId);
    return doc.portalToken ?? null;
  },
});

/** The client's portal link, made the first time it's asked for. */
export const link = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const { doc } = await getOwned(ctx, "clients", clientId);
    if (doc.portalToken) return doc.portalToken;
    const portalToken = newToken();
    await ctx.db.patch(clientId, { portalToken, updatedAt: nowIso() });
    return portalToken;
  },
});

/** Turns the link off: the old one stops working; the next "link" makes a new one. */
export const turnOff = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    await getOwned(ctx, "clients", clientId);
    await ctx.db.patch(clientId, { portalToken: undefined, updatedAt: nowIso() });
    return null;
  },
});

type Estimate = Doc<"estimates">;
const OPEN = new Set(["sent", "opened"]);
const isOpen = (e: Estimate, today: string) => OPEN.has(e.status) && !(e.expiryDate && e.expiryDate.slice(0, 10) < today);

/**
 * The portal page: what the client sees, or (preview) that plus what's
 * queued for the next send, marked new. Paths are relative to the site.
 */
async function portalView(ctx: QueryCtx, client: Doc<"clients">, preview: boolean) {
  const organization = await ctx.db.get(client.organizationId);
  const today = new Date().toISOString().slice(0, 10);
  const estimates = (
    await ctx.db
      .query("estimates")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .take(200)
  ).filter((e) => e.organizationId === client.organizationId);

  type Ask =
    | { kind: "estimate"; at: string; number: string; title?: string; total: number; path: string; isNew?: boolean }
    | {
        kind: "change_order" | "affidavit";
        at: string;
        number: string;
        title?: string;
        difference?: number;
        // Absent on a change order still waiting for the next send (preview only).
        path?: string;
        changes?: Array<{ description: string; before?: number; after?: number }>;
        isNew?: boolean;
      }
    | {
        kind: "selection";
        at: string;
        estimateId: Id<"estimates">;
        itemId: string;
        description: string;
        quantity: number;
        allowanceUnitPrice: number;
        allowanceTotal: number;
        pickBy?: string;
        pick?: { url?: string; name?: string; unitPrice?: number; note?: string; status: "asked" | "picked" };
        isNew?: boolean;
      };
  const asks: Ask[] = [];
  type Job = {
    key: string;
    name: string;
    total: number;
    latest: string;
    documents: Array<{ kind: "estimate" | "change_order" | "affidavit"; number: string; signedAt?: string; path?: string }>;
    selections: Array<{ description: string; name?: string; url?: string }>;
  };
  const jobs = new Map<string, Job>();

  for (const estimate of estimates) {
    if (isOpen(estimate, today) && estimate.shareToken)
      asks.push({
        kind: "estimate",
        at: estimate.sentAt ?? estimate.updatedAt,
        number: estimate.estimateNumber,
        title: estimate.title,
        total: estimate.totalAmount,
        path: `/share/estimate/${estimate.shareToken}`,
      });
    if (estimate.status !== "accepted" || !estimate.contractSnapshot) continue;

    const project = estimate.projectId ? await ctx.db.get(estimate.projectId) : null;
    const key = project ? `p:${project._id}` : `e:${estimate._id}`;
    const job = jobs.get(key) ?? {
      key,
      name: project?.name ?? estimate.title ?? estimate.estimateNumber,
      total: 0,
      latest: "",
      documents: [],
      selections: [],
    };
    const signedAt = estimate.signedAt ?? estimate.approvedAt ?? estimate.contractLockedAt;
    job.total = cents(job.total + estimate.contractSnapshot.totalAmount);
    job.documents.push({
      kind: "estimate",
      number: estimate.estimateNumber,
      signedAt,
      path: estimate.shareToken ? `/share/estimate/${estimate.shareToken}` : undefined,
    });
    job.latest = [job.latest, signedAt ?? ""].sort().at(-1)!;

    const signoffs = (
      await ctx.db
        .query("signoffs")
        .withIndex("by_estimate", (q) => q.eq("estimateId", estimate._id))
        .take(100)
    ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const s of signoffs) {
      if (s.status === "sent")
        asks.push({
          kind: s.kind,
          at: s.createdAt,
          number: s.number,
          title: estimate.title,
          difference: s.newTotal !== undefined && s.previousTotal !== undefined ? cents(s.newTotal - s.previousTotal) : undefined,
          path: `/share/signoff/${s.token}`,
        });
      if (s.status === "signed") {
        job.documents.push({ kind: s.kind, number: s.number, signedAt: s.signedAt, path: `/share/signoff/${s.token}` });
        job.latest = [job.latest, s.signedAt ?? ""].sort().at(-1)!;
      }
    }
    // A change order waiting for the next send: shown in the preview as it will go out.
    if (preview && estimate.changeOrderQueuedAt) {
      const changes = changesSince(estimate.contractSnapshot.items, estimate.items);
      if (changes.length > 0)
        asks.push({
          kind: "change_order",
          at: estimate.changeOrderQueuedAt,
          number: "",
          title: estimate.title,
          difference: cents(estimate.totalAmount - estimate.contractSnapshot.totalAmount),
          changes,
          isNew: true,
        });
    }

    for (const row of await selectionsFor(ctx, estimate)) {
      const item = estimate.items.find((i) => i._id === row.itemId && i.allowance);
      if (!item) continue;
      if (row.status === "approved") job.selections.push({ description: item.description, name: row.name, url: row.url });
      else {
        // The client sees what was sent (or what they picked); the preview also shows what's queued.
        const queued = row.queuedAt !== undefined;
        if (!(row.askedAt !== undefined || row.status === "picked" || (preview && queued))) continue;
        const unit = allowanceUnitPrice(item);
        asks.push({
          kind: "selection",
          at: row.askedAt ?? row.updatedAt,
          estimateId: estimate._id,
          itemId: item._id,
          description: item.description,
          quantity: item.quantity,
          allowanceUnitPrice: unit,
          allowanceTotal: cents(unit * item.quantity),
          pickBy: item.allowance?.pickBy,
          pick: row.status === "picked" ? { url: row.url, name: row.name, unitPrice: row.unitPrice, note: row.note, status: "picked" } : undefined,
          isNew: preview && queued ? true : undefined,
        });
      }
    }
    jobs.set(key, job);
  }

  // Picks still to make come first, soonest pick-by date first; then the rest in the order they were sent.
  const rank = (a: Ask) => (a.kind === "selection" && !a.pick ? 0 : 1);
  asks.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.kind === "selection" && b.kind === "selection" ? (a.pickBy ?? "9").localeCompare(b.pickBy ?? "9") : 0) ||
      a.at.localeCompare(b.at),
  );
  return {
    client: { name: client.name, language: langOf(client) },
    company: organization
      ? { name: organization.name, phone: organization.phone, email: organization.email, logoUrl: await logoUrlOf(ctx, organization) }
      : undefined,
    asks,
    jobs: [...jobs.values()]
      .sort((a, b) => b.latest.localeCompare(a.latest))
      .map((job) => ({ key: job.key, name: job.name, total: job.total, documents: job.documents, selections: job.selections })),
  };
}

/** What the client sees, from their link. */
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const client = await clientByToken(ctx, token);
    return client === null ? null : await portalView(ctx, client, false);
  },
});

/** The company's preview: the client's portal as it will be after the next send, with what's new marked. */
export const preview = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const { doc: client } = await getOwned(ctx, "clients", clientId);
    const view = await portalView(ctx, client, true);
    return { ...view, token: client.portalToken ?? null, newCount: view.asks.filter((a) => a.isNew).length };
  },
});

/** The client a project's portal is for: the project's, else the one client on its estimates. */
export const forProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const { doc: project } = await getOwned(ctx, "projects", projectId);
    let clientId = project.clientId;
    if (!clientId) {
      const ids = new Set(
        (
          await ctx.db
            .query("estimates")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .take(100)
        )
          .map((e) => e.clientId)
          .filter((id): id is Id<"clients"> => id !== undefined),
      );
      if (ids.size === 1) clientId = [...ids][0];
    }
    const client = clientId ? await ctx.db.get(clientId) : null;
    if (!client || client.organizationId !== project.organizationId) return null;
    let queued = 0;
    for (const estimate of await ctx.db
      .query("estimates")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .take(200)) {
      if (estimate.changeOrderQueuedAt) queued += 1;
      queued += (await selectionsFor(ctx, estimate)).filter((r) => r.queuedAt !== undefined).length;
    }
    return { clientId: client._id, name: client.name, language: langOf(client), token: client.portalToken ?? null, queued };
  },
});

/**
 * Sends what's queued: the picks go onto the portal, the change orders are
 * made, the link is made if it's the first time. Returns what went out, so
 * the message can say it.
 */
export const send = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const { doc: client, user } = await getOwned(ctx, "clients", clientId);
    const now = nowIso();
    let token = client.portalToken;
    if (!token) {
      token = newToken();
      await ctx.db.patch(clientId, { portalToken: token, updatedAt: now });
    }
    const picks: Array<{ description: string; pickBy?: string }> = [];
    let changeOrders = 0;
    for (const estimate of await ctx.db
      .query("estimates")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .take(200)) {
      if (estimate.organizationId !== client.organizationId) continue;
      for (const row of await selectionsFor(ctx, estimate)) {
        if (row.queuedAt === undefined) continue;
        const item = estimate.items.find((i) => i._id === row.itemId && i.allowance);
        if (!item || row.status === "approved") {
          await ctx.db.patch(row._id, { queuedAt: undefined });
          continue;
        }
        await ctx.db.patch(row._id, { askedAt: now, queuedAt: undefined, updatedAt: now });
        picks.push({ description: item.description, pickBy: item.allowance?.pickBy });
      }
      if (estimate.changeOrderQueuedAt) {
        const fresh = (await ctx.db.get(estimate._id))!;
        if (fresh.contractSnapshot && changesSince(fresh.contractSnapshot.items, fresh.items).length > 0) {
          await createSignoff(ctx, fresh, "change_order", user._id);
          changeOrders += 1;
        } else await ctx.db.patch(estimate._id, { changeOrderQueuedAt: undefined });
      }
    }
    return { token, picks, changeOrders };
  },
});

/**
 * The client's pick for something the company asked them to choose: a link
 * to the product, and its name and price as they saw it. They can change it
 * until the company approves it.
 */
export const pick = mutation({
  args: {
    token: v.string(),
    estimateId: v.id("estimates"),
    itemId: v.string(),
    url: v.string(),
    name: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { token, estimateId, itemId, url, name, unitPrice, note }) => {
    const client = await clientByToken(ctx, token);
    if (client === null) fail("NOT_FOUND", "This link isn't valid", "link_invalid");
    const estimate = await ctx.db.get(estimateId);
    const item =
      estimate?.clientId === client._id && estimate.contractLockedAt ? estimate.items.find((i) => i._id === itemId && i.allowance) : undefined;
    const found = estimate && item ? (await selectionsFor(ctx, estimate)).find((p) => p.itemId === itemId) : undefined;
    // Only what was sent to them: a pick still waiting for the company's next send isn't theirs yet.
    const row = found && (found.askedAt !== undefined || found.status !== "asked") ? found : undefined;
    if (!estimate || !item || !row) fail("NOT_FOUND", "That choice isn't on the estimate any more", "selection_gone");
    if (row.status === "approved") fail("INVALID", "This choice is already approved. Ask the company to change it.", "selection_approved");
    const link = cleanLink(url);
    if (!link) fail("INVALID", "Paste the link to the product's page", "selection_link");
    if (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10_000_000))
      fail("INVALID", "Enter the price, $0 or more", "selection_price");
    const now = nowIso();
    await ctx.db.patch(row._id, {
      status: "picked",
      url: link,
      name: name?.trim().slice(0, 200) || undefined,
      unitPrice: unitPrice === undefined ? undefined : Math.round(unitPrice * 100) / 100,
      note: note?.trim().slice(0, 500) || undefined,
      enteredBy: undefined,
      pickedAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: estimate.userId,
      action: "selection_picked",
      resourceType: "estimate",
      resourceId: estimate._id,
      details: { estimateNumber: estimate.estimateNumber, item: item.description, product: name?.trim() || undefined },
    });
    return null;
  },
});

/** The client flipped the portal to English or Spanish: remember it on their record. */
export const setLanguage = mutation({
  args: { token: v.string(), language: v.string() },
  handler: async (ctx, { token, language }) => {
    if (!isLang(language)) fail("INVALID", "Pick English or Spanish");
    const client = await clientByToken(ctx, token);
    if (client === null) fail("NOT_FOUND", "This link isn't valid", "link_invalid");
    if (client.language !== language) await ctx.db.patch(client._id, { language, updatedAt: nowIso() });
    return null;
  },
});
