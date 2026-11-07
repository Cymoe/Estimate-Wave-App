import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { fail, getOwned, logActivity, nowIso } from "./lib/access";
import { mutationDef } from "./lib/actor";
import { documentNumber } from "./lib/documents";
import { logoUrlOf } from "./lib/organizations";
import {
  buildOrders,
  orderTotal,
  splitUnit,
  type BuiltOrder,
  type SourceLine,
} from "./lib/purchaseOrders";

// Purchase orders on a project: what's bought from each supplier and sub,
// at the company's cost. A project started from a package or template comes
// with them (projectTemplates.startFrom); any project can build them from its
// estimate. Sent to the vendor as a link, they're Ordered; Received, they
// become an expense on the project.

type Po = Doc<"purchaseOrders">;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (text: string | undefined, max: number) =>
  text?.trim().slice(0, max) || undefined;

/** A PO and the user, if the PO's project is theirs to see (else "not found"). */
async function ownedPo(ctx: QueryCtx | MutationCtx, id: Id<"purchaseOrders">) {
  const po = await ctx.db.get(id);
  if (!po) fail("NOT_FOUND", "Not found");
  const { doc: project, user } = await getOwned(ctx, "projects", po.projectId);
  return { po, project, user };
}

async function ordersOf(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
) {
  return (
    await ctx.db
      .query("purchaseOrders")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(500)
  ).sort((a, b) => a.order - b.order);
}

/** Where things are delivered: the project's client's address. */
async function addressFor(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"projects">,
) {
  const client = project.clientId ? await ctx.db.get(project.clientId) : null;
  if (!client?.address) return undefined;
  const place = [
    client.city,
    [client.state, client.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  return [client.address, place].filter(Boolean).join(", ");
}

/**
 * Adds POs to a project, numbered on from the ones it has. Used when a project
 * starts from a package or template, and by "Build from the estimate".
 */
export async function insertOrders(
  ctx: MutationCtx,
  project: Doc<"projects">,
  userId: Id<"users">,
  built: BuiltOrder[],
) {
  if (built.length === 0) return 0;
  const existing = await ordersOf(ctx, project._id);
  const base = documentNumber("PO");
  const deliverTo = await addressFor(ctx, project);
  const now = nowIso();
  let order = existing.reduce((max, po) => Math.max(max, po.order), 0);
  for (const [index, po] of built.entries())
    await ctx.db.insert("purchaseOrders", {
      organizationId: project.organizationId,
      projectId: project._id,
      number: `${base}-${existing.length + index + 1}`,
      title: po.title,
      lines: po.lines.map((line) => ({ ...line, _id: crypto.randomUUID() })),
      status: "draft",
      neededBy: project.startDate,
      deliverTo,
      order: ++order,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  return built.length;
}

/** An estimate's lines as the builder reads them (the unit back out of ", per sf"). */
export function estimateLines(
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    optional?: boolean;
    included?: boolean;
  }>,
): SourceLine[] {
  return items
    .filter((item) => !item.optional || item.included)
    .map((item) => {
      const { description, unit } = splitUnit(item.description);
      return {
        description,
        unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      };
    });
}

const view = (po: Po) => ({
  id: po._id,
  number: po.number,
  title: po.title,
  vendor: po.vendor,
  lines: po.lines,
  total: orderTotal(po.lines),
  status: po.status,
  neededBy: po.neededBy,
  deliverTo: po.deliverTo,
  notes: po.notes,
  shareToken: po.shareToken,
  orderedAt: po.orderedAt,
  receivedAt: po.receivedAt,
  receivedAmount: po.receivedAmount,
});

/** A project's POs in order, with what's committed (ordered, not yet received) and received. */
export const forProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await getOwned(ctx, "projects", projectId);
    const orders = (await ordersOf(ctx, projectId)).map(view);
    return {
      orders,
      committed: round2(
        orders
          .filter((o) => o.status === "ordered")
          .reduce((sum, o) => sum + o.total, 0),
      ),
      received: round2(
        orders
          .filter((o) => o.status === "received")
          .reduce((sum, o) => sum + (o.receivedAmount ?? o.total), 0),
      ),
    };
  },
});

/** A blank PO on the project. */
export const create = mutation({
  args: { projectId: v.id("projects"), title: v.string() },
  handler: async (ctx, { projectId, title }) => {
    const { doc: project, user } = await getOwned(ctx, "projects", projectId);
    const name = clean(title, 120);
    if (!name) fail("INVALID", "Say who the PO is for");
    await insertOrders(ctx, project, user._id, [{ title: name, lines: [] }]);
    const created = (await ordersOf(ctx, projectId)).at(-1)!;
    await logActivity(ctx, {
      organizationId: project.organizationId,
      userId: user._id,
      action: "created",
      resourceType: "purchase_order",
      resourceId: created._id,
      details: { number: created.number, title: name },
    });
    return created._id;
  },
});

const lineArg = v.object({
  _id: v.optional(v.string()),
  description: v.string(),
  quantity: v.number(),
  unit: v.optional(v.string()),
  unitCost: v.number(),
  kind: v.union(v.literal("material"), v.literal("labor")),
});

/** Changes a draft or ordered PO: who it's for, the vendor, its lines, when and where. */
export const update = mutation({
  args: {
    id: v.id("purchaseOrders"),
    title: v.optional(v.string()),
    vendor: v.optional(
      v.object({
        name: v.string(),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
      }),
    ),
    lines: v.optional(v.array(lineArg)),
    neededBy: v.optional(v.string()),
    deliverTo: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { id, title, vendor, lines, neededBy, deliverTo, notes },
  ) => {
    const { po } = await ownedPo(ctx, id);
    if (po.status === "received" || po.status === "cancelled")
      fail("INVALID", "Reopen the PO to change it");
    const patch: Partial<Po> = { updatedAt: nowIso() };
    if (title !== undefined) {
      const name = clean(title, 120);
      if (!name) fail("INVALID", "Say who the PO is for");
      patch.title = name;
    }
    if (vendor !== undefined) {
      const name = clean(vendor.name, 120);
      patch.vendor = name
        ? {
            name,
            phone: clean(vendor.phone, 40),
            email: clean(vendor.email, 200),
          }
        : undefined;
    }
    if (lines !== undefined) {
      for (const line of lines)
        if (
          !Number.isFinite(line.quantity) ||
          line.quantity < 0 ||
          !Number.isFinite(line.unitCost) ||
          line.unitCost < 0
        )
          fail("INVALID", "Quantities and costs must be zero or more");
      patch.lines = lines
        .filter((line) => line.description.trim())
        .map((line) => ({
          _id: line._id ?? crypto.randomUUID(),
          description: line.description.trim().slice(0, 300),
          quantity: line.quantity,
          unit: clean(line.unit, 20),
          unitCost: round2(line.unitCost),
          kind: line.kind,
        }));
    }
    if (neededBy !== undefined)
      patch.neededBy = /^\d{4}-\d{2}-\d{2}$/.test(neededBy)
        ? neededBy
        : undefined;
    if (deliverTo !== undefined) patch.deliverTo = clean(deliverTo, 300);
    if (notes !== undefined) patch.notes = clean(notes, 2000);
    await ctx.db.patch(id, patch);
    return view((await ctx.db.get(id))!);
  },
});

/** Deletes a draft PO. */
export const remove = mutation({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, { id }) => {
    const { po, user } = await ownedPo(ctx, id);
    if (po.status !== "draft" && po.status !== "cancelled")
      fail("INVALID", "Cancel the PO before deleting it");
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: po.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "purchase_order",
      resourceId: id,
      details: { number: po.number, title: po.title },
    });
    return null;
  },
});

/**
 * POs from the project's estimate (the accepted one, else the latest), for a
 * project that didn't start from a package. Adds only vendors it doesn't have.
 */
export const buildFromEstimate = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const { doc: project, user } = await getOwned(ctx, "projects", projectId);
    const estimates = (
      await ctx.db
        .query("estimates")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(100)
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const estimate =
      estimates.find((e) => e.status === "accepted") ?? estimates[0];
    if (!estimate) fail("INVALID", "Add an estimate to the project first");
    const organization = await ctx.db.get(project.organizationId);
    const have = new Set(
      (await ordersOf(ctx, projectId)).map((po) => po.title),
    );
    const built = buildOrders(
      estimateLines(estimate.contractSnapshot?.items ?? estimate.items),
      organization?.leadTrades?.[0],
    ).filter((po) => !have.has(po.title));
    const added = await insertOrders(ctx, project, user._id, built);
    if (added)
      await logActivity(ctx, {
        organizationId: project.organizationId,
        userId: user._id,
        action: "created",
        resourceType: "purchase_order",
        resourceId: projectId,
        details: { count: added, from: estimate.estimateNumber },
      });
    return added;
  },
});

/** Sends the PO: it's Ordered, and its link for the vendor is made (returned to share). */
export const markOrderedDef = mutationDef({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, { id }) => {
    const { po, user } = await ownedPo(ctx, id);
    if (po.status === "received")
      fail("INVALID", "This PO is already received");
    if (po.lines.length === 0)
      fail("INVALID", "Add what you're ordering first");
    const shareToken = po.shareToken ?? crypto.randomUUID().replace(/-/g, "");
    const now = nowIso();
    await ctx.db.patch(id, {
      status: "ordered",
      shareToken,
      orderedAt: po.orderedAt ?? now,
      updatedAt: now,
    });
    if (po.status !== "ordered")
      await logActivity(ctx, {
        organizationId: po.organizationId,
        userId: user._id,
        action: "ordered",
        resourceType: "purchase_order",
        resourceId: id,
        details: {
          number: po.number,
          title: po.title,
          total: orderTotal(po.lines),
        },
      });
    return shareToken;
  },
});
export const markOrdered = mutation(markOrderedDef);

/** Received: the final amount (the vendor's invoice) goes onto the project's expenses. */
export const markReceived = mutation({
  args: { id: v.id("purchaseOrders"), amount: v.number() },
  handler: async (ctx, { id, amount }) => {
    const { po, user } = await ownedPo(ctx, id);
    if (po.status !== "ordered" && po.status !== "draft")
      fail("INVALID", "This PO can't be received");
    if (!Number.isFinite(amount) || amount < 0)
      fail("INVALID", "Amount must be zero or more");
    const now = nowIso();
    const allLabor =
      po.lines.length > 0 && po.lines.every((line) => line.kind === "labor");
    const expenseId = await ctx.db.insert("expenses", {
      projectId: po.projectId,
      description: `${po.number} · ${po.title}`,
      amount: round2(amount),
      category: allLabor ? "Subcontractor" : "Materials",
      vendor: po.vendor?.name ?? po.title,
      date: now.slice(0, 10),
      status: "pending",
      organizationId: po.organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, {
      status: "received",
      receivedAt: now,
      receivedAmount: round2(amount),
      expenseId,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId: po.organizationId,
      userId: user._id,
      action: "received",
      resourceType: "purchase_order",
      resourceId: id,
      details: { number: po.number, title: po.title, amount: round2(amount) },
    });
    return expenseId;
  },
});

/** Back to Ordered (or Draft, from cancelled); a received PO's expense goes too, unless it's been changed. */
export const reopen = mutation({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, { id }) => {
    const { po } = await ownedPo(ctx, id);
    if (po.status === "received" && po.expenseId) {
      const expense = await ctx.db.get(po.expenseId);
      if (
        expense &&
        expense.amount === po.receivedAmount &&
        expense.status === "pending"
      )
        await ctx.db.delete(po.expenseId);
    }
    await ctx.db.patch(id, {
      status: po.orderedAt ? "ordered" : "draft",
      receivedAt: undefined,
      receivedAmount: undefined,
      expenseId: undefined,
      updatedAt: nowIso(),
    });
    return null;
  },
});

/** Cancelled: kept for the record, its link stops working. */
export const cancel = mutation({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, { id }) => {
    const { po, user } = await ownedPo(ctx, id);
    if (po.status === "received")
      fail("INVALID", "Reopen the PO before cancelling it");
    await ctx.db.patch(id, { status: "cancelled", updatedAt: nowIso() });
    await logActivity(ctx, {
      organizationId: po.organizationId,
      userId: user._id,
      action: "cancelled",
      resourceType: "purchase_order",
      resourceId: id,
      details: { number: po.number, title: po.title },
    });
    return null;
  },
});

/** The vendor's page, from the PO's link: the company, the PO, its lines and total. Never the client's prices. */
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!/^[0-9a-f]{32}$/.test(token)) return null;
    const po = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_share_token", (q) => q.eq("shareToken", token))
      .unique();
    if (!po || po.status === "cancelled" || po.status === "draft") return null;
    const organization = await ctx.db.get(po.organizationId);
    const project = await ctx.db.get(po.projectId);
    return {
      company: organization
        ? {
            name: organization.name,
            phone: organization.phone,
            email: organization.email,
            logoUrl: await logoUrlOf(ctx, organization),
          }
        : undefined,
      number: po.number,
      title: po.title,
      vendor: po.vendor,
      job: project?.name,
      orderedAt: po.orderedAt,
      neededBy: po.neededBy,
      deliverTo: po.deliverTo,
      notes: po.notes,
      status: po.status,
      lines: po.lines.map(({ description, quantity, unit, unitCost }) => ({
        description,
        quantity,
        unit,
        unitCost,
      })),
      total: orderTotal(po.lines),
    };
  },
});
