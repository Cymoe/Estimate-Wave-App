// Tolliver callers phone Midland homeowners from call lists built on the
// appraisal roll (parcels) and the permit feed. Before a number is shown
// as dialable it is checked against the Do Not Call lists, Texas calling
// hours and how often it was tried; every call's outcome is logged, and a
// "don't call again" is kept for good. Rules: lib/calls.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, nowIso, requireCaller, requireStaff } from "./lib/access";
import {
  CALL_WINDOW_DAYS,
  DNC_LABEL,
  DNC_LISTS,
  LIVE,
  MAX_TRIES,
  callingHours,
  centralMidnight,
  consentLine,
  listDue,
  type DncList,
} from "./lib/calls";
import { normalizePhone } from "./lib/intake";
import { cleanFields, findDuplicate } from "./intake";
import { MIDLAND_PARCELS, ownerName, streetKey } from "./lib/parcels";
import { DAY_MS } from "./lib/report";
import { recentAuctions, saleLabel } from "./lib/foreclosures";

type Ctx = QueryCtx | MutationCtx;

const dncList = v.union(v.literal("national"), v.literal("texas"));
const outcome = v.union(
  v.literal("no_answer"),
  v.literal("voicemail"),
  v.literal("wrong_number"),
  v.literal("not_interested"),
  v.literal("callback"),
  v.literal("do_not_call"),
);

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const since = (days: number, now = Date.now()) => new Date(now - days * DAY_MS).toISOString();

// ---- Do Not Call lists ----

async function currentUpload(ctx: Ctx, list: DncList) {
  return await ctx.db
    .query("dncLists")
    .withIndex("by_list_and_current", (q) => q.eq("list", list).eq("current", true))
    .first();
}

/** Each list's current upload, when it falls due, and whether calling is allowed on it. */
async function listsState(ctx: Ctx) {
  return await Promise.all(
    DNC_LISTS.map(async (list) => {
      const upload = await currentUpload(ctx, list);
      const { current, dueAt } = listDue(list, upload?.uploadedAt);
      return {
        list,
        label: DNC_LABEL[list],
        batchId: upload?._id,
        count: upload?.count ?? 0,
        uploadedAt: upload?.uploadedAt,
        fileName: upload?.fileName,
        dueAt,
        current,
      };
    }),
  );
}

/** For Ops and the Calls page: each list's upload and when it is due again. */
export const dncStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireCaller(ctx);
    // The upload's id stays on the server.
    return (await listsState(ctx)).map((l) => ({ ...l, batchId: undefined }));
  },
});

/** Opens an upload; its chunks don't count until finishDncImport. */
export const startDncImport = mutation({
  args: { list: dncList, fileName: v.optional(v.string()) },
  handler: async (ctx, { list, fileName }) => {
    const user = await requireStaff(ctx);
    return await ctx.db.insert("dncLists", {
      list,
      count: 0,
      startedAt: nowIso(),
      uploadedBy: user._id,
      current: false,
      fileName: fileName?.slice(0, 120),
    });
  },
});

/** Up to 5,000 numbers of an open upload. */
export const importDncChunk = mutation({
  args: { batchId: v.id("dncLists"), numbers: v.array(v.string()) },
  handler: async (ctx, { batchId, numbers }) => {
    await requireStaff(ctx);
    const batch = await ctx.db.get(batchId);
    if (!batch || batch.uploadedAt) fail("INVALID", "That upload is already finished");
    if (numbers.length > 5000) fail("INVALID", "Send at most 5,000 numbers at a time");
    const addedAt = nowIso();
    let added = 0;
    for (const phone of numbers) {
      if (!/^\d{10}$/.test(phone)) continue;
      await ctx.db.insert("doNotCall", { phone, list: batch.list, batchId, addedAt });
      added++;
    }
    await ctx.db.patch(batchId, { count: batch.count + added });
    return { added };
  },
});

/** Makes the upload the list's current one and clears out the one it replaces. */
export const finishDncImport = mutation({
  args: { batchId: v.id("dncLists") },
  handler: async (ctx, { batchId }) => {
    await requireStaff(ctx);
    const batch = await ctx.db.get(batchId);
    if (!batch || batch.uploadedAt) fail("INVALID", "That upload is already finished");
    if (batch.count === 0) fail("INVALID", "No 10-digit numbers were found in that file");
    const previous = await currentUpload(ctx, batch.list);
    if (previous) await ctx.db.patch(previous._id, { current: false });
    await ctx.db.patch(batchId, { current: true, uploadedAt: nowIso() });
    await ctx.scheduler.runAfter(0, internal.calls.removeOldDnc, { list: batch.list });
    return { count: batch.count };
  },
});

/**
 * Deletes the numbers of replaced uploads (and of uploads abandoned for a
 * day), a page at a time, then the uploads themselves.
 */
export const removeOldDnc = internalMutation({
  args: { list: dncList },
  handler: async (ctx, { list }) => {
    const stale = (
      await ctx.db
        .query("dncLists")
        .withIndex("by_list_and_current", (q) => q.eq("list", list).eq("current", false))
        .take(20)
    ).filter((b) => b.uploadedAt || Date.parse(b.startedAt) < Date.now() - DAY_MS);
    const batch = stale[0];
    if (!batch) return;
    const rows = await ctx.db
      .query("doNotCall")
      .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
      .take(2000);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length < 2000) await ctx.db.delete(batch._id);
    if (rows.length === 2000 || stale.length > 1)
      await ctx.scheduler.runAfter(0, internal.calls.removeOldDnc, { list });
  },
});

/** Someone asked not to be called (on a call, or by calling in): never dialed again. */
async function addAsked(ctx: MutationCtx, phone: string, by: Id<"users">, note?: string) {
  const rows = await ctx.db
    .query("doNotCall")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .collect();
  if (rows.some((r) => r.list === "asked")) return;
  await ctx.db.insert("doNotCall", { phone, list: "asked", addedAt: nowIso(), addedBy: by, note: note?.slice(0, 200) });
}

export const addDoNotCall = mutation({
  args: { phone: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { phone, note }) => {
    const user = await requireCaller(ctx);
    const normalized = normalizePhone(phone);
    if (!normalized) fail("INVALID", "Enter a 10-digit phone number");
    await addAsked(ctx, normalized, user._id, note);
    return null;
  },
});

// ---- Before a call ----

/** Why a number is on a Do Not Call list (the current uploads, or our own), or nothing. */
async function onDoNotCall(ctx: Ctx, phone: string, lists: Awaited<ReturnType<typeof listsState>>) {
  const listed = await ctx.db
    .query("doNotCall")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .collect();
  if (listed.some((r) => r.list === "asked")) return "This number asked not to be called again.";
  const onList = lists.find((l) => listed.some((r) => r.batchId === l.batchId));
  return onList ? `This number is on the ${onList.label}.` : undefined;
}

/** Why a number can't be called right now, or nothing when it can. */
async function blockedReason(ctx: Ctx, phone: string, now = Date.now()): Promise<string | undefined> {
  const hours = callingHours(now);
  if (!hours.open) return hours.reason;
  const lists = await listsState(ctx);
  for (const l of lists)
    if (!l.current)
      return l.uploadedAt
        ? `The ${l.label} is out of date. Staff upload this month's in Ops, Calls.`
        : `Staff need to upload the ${l.label} in Ops, Calls, before anyone calls.`;
  const listed = await onDoNotCall(ctx, phone, lists);
  if (listed) return listed;
  const recent = await ctx.db
    .query("outboundCalls")
    .withIndex("by_phone", (q) => q.eq("phone", phone).gte("at", since(CALL_WINDOW_DAYS, now)))
    .collect();
  if (!recent.some((c) => LIVE.has(c.outcome)) && recent.length >= MAX_TRIES)
    return `Called ${recent.length} times in the last ${CALL_WINDOW_DAYS} days without an answer. Leave it for now.`;
  return undefined;
}

/** Whether the number can be dialed now. The Calls page shows it as a link only when it can. */
export const check = query({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    await requireCaller(ctx);
    const normalized = normalizePhone(phone);
    if (!normalized) return { ok: false as const, reason: "Enter a 10-digit phone number." };
    const reason = await blockedReason(ctx, normalized);
    return reason ? { ok: false as const, reason } : { ok: true as const, phone: normalized };
  },
});

// ---- After a call ----

/** How the call went. "Don't call again" puts the number on our own list for good. */
export const log = mutation({
  args: {
    phone: v.string(),
    outcome,
    parcelId: v.optional(v.id("parcels")),
    address: v.string(),
    owner: v.optional(v.string()),
    trade: v.optional(v.string()),
    note: v.optional(v.string()),
    callbackAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const phone = normalizePhone(args.phone);
    if (!phone) fail("INVALID", "Enter a 10-digit phone number");
    if (args.outcome === "callback" && !args.callbackAt) fail("INVALID", "Pick when to call back");
    const id = await ctx.db.insert("outboundCalls", {
      parcelId: args.parcelId,
      address: args.address.slice(0, 200),
      owner: args.owner?.slice(0, 200),
      phone,
      callerId: user._id,
      outcome: args.outcome,
      note: args.note?.trim().slice(0, 500) || undefined,
      callbackAt: args.outcome === "callback" ? args.callbackAt : undefined,
      trade: args.trade,
      at: nowIso(),
    });
    if (args.outcome === "do_not_call") await addAsked(ctx, phone, user._id, "Asked on a call");
    return id;
  },
});

// ---- A homeowner said yes ----

/**
 * The homeowner wants the work and said yes to the consent line: the lead
 * goes into the Ops intake queue as a Tolliver call, with the line they
 * agreed to, for someone other than the caller to confirm and list.
 */
export const takeLead = mutation({
  args: {
    parcelId: v.optional(v.id("parcels")),
    phone: v.string(),
    name: v.string(),
    address: v.string(),
    city: v.optional(v.string()),
    zip: v.optional(v.string()),
    county: v.optional(v.string()),
    jobType: v.string(),
    scope: v.optional(v.string()),
    timeline: v.optional(v.string()),
    notes: v.optional(v.string()),
    isOwner: v.boolean(),
    consented: v.boolean(),
  },
  handler: async (ctx, { parcelId, consented, ...args }) => {
    const user = await requireCaller(ctx);
    if (!consented) fail("INVALID", "The homeowner has to say yes to the consent line");
    if (!args.isOwner) fail("INVALID", "Leads are for the owner who decides on the work");
    const phone = normalizePhone(args.phone);
    if (!phone) fail("INVALID", "Enter a 10-digit phone number");
    const listed = await onDoNotCall(ctx, phone, await listsState(ctx));
    if (listed) fail("INVALID", listed);
    const fields = await cleanFields(ctx, { ...args, city: args.city ?? "Midland", county: args.county ?? MIDLAND_PARCELS.county });
    if (!fields.name) fail("INVALID", "The homeowner's name is needed");
    const trade = await ctx.db.query("industries").withIndex("by_slug", (q) => q.eq("slug", args.jobType)).first();
    const now = nowIso();
    const duplicateOf = await findDuplicate(ctx, phone);
    const id = await ctx.db.insert("intakeLeads", {
      source: "outbound",
      status: "new",
      ...fields,
      phone,
      phoneNormalized: phone,
      consent: { text: consentLine(trade?.name ?? args.jobType), value: "Said yes on the call", at: now },
      duplicateOf,
      attempts: [{ at: now, by: user._id, outcome: "reached", note: "Taken on a Tolliver call" }],
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("outboundCalls", {
      parcelId,
      address: fields.address ?? args.address,
      owner: fields.name,
      phone,
      callerId: user._id,
      outcome: "lead_taken",
      trade: args.jobType,
      intakeLeadId: id,
      at: now,
    });
    return { id, duplicate: duplicateOf !== undefined };
  },
});

// ---- Call lists ----

const LIST_DAYS = { tradePermits: 30, recentBuyers: 540, auctionBuyers: 120, foreclosure: 365 };
const MAX_HOMES = 50;

type Home = {
  parcelId?: Id<"parcels">;
  owner: string;
  /** The number to call when we already have it (an auction buyer's). */
  phone?: string;
  owner2?: string;
  address: string;
  street?: string;
  zip?: string;
  marketValueCents?: number;
  deedDate?: string;
  why: string;
};

/**
 * Called in the last 30 days, or asked never to be called: not on any list.
 * Nor is a home on Midland's foreclosure auction in the last year or coming
 * up: its owner on the roll is the family losing it, and they're never called.
 */
async function leaveOff(ctx: QueryCtx, parcelId: Id<"parcels">, from: string, now: number) {
  const calls = await ctx.db
    .query("outboundCalls")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
    .order("desc")
    .take(20);
  if (calls.some((c) => c.at >= from || c.outcome === "do_not_call")) return true;
  const foreclosureSince = since(LIST_DAYS.foreclosure, now).slice(0, 10);
  const foreclosures = await ctx.db
    .query("foreclosures")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
    .collect();
  return foreclosures.some((f) => f.saleDate >= foreclosureSince);
}

const homeOf = (p: Doc<"parcels">, why: string): Home => ({
  parcelId: p._id,
  owner: ownerName(p.owner),
  owner2: p.owner2 ? ownerName(p.owner2) : undefined,
  address: title(p.siteAddress),
  street: p.street ? title(p.street) : undefined,
  zip: p.mailing.zip?.slice(0, 5),
  marketValueCents: p.marketValueCents,
  deedDate: p.deedDate,
  why,
});

const callable = (p: Doc<"parcels">) => p.ownerOccupied && !p.companyOwned;

/**
 * Homes to call, up to 50:
 * - trade_permits: on Midland streets where that trade pulled permits in the
 *   last 30 days, busiest streets first (the neighbors of work going on);
 * - recent_buyers: bought in the last 18 months of the roll, newest first;
 * - street: everyone on one street;
 * - auction_buyers: homes bought at the courthouse foreclosure auction in the
 *   last 120 days, called under the buyer's name and number (staff add them
 *   in Ops), for the rehab work.
 * Only owners who live there, never a company (auction buyers aside); a home
 * called in the last 30 days, that asked not to be called, or that's on the
 * foreclosure auction, is left off.
 */
export const list = query({
  args: {
    kind: v.union(v.literal("trade_permits"), v.literal("recent_buyers"), v.literal("street"), v.literal("auction_buyers")),
    trade: v.optional(v.string()),
    street: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCaller(ctx);
    const now = Date.now();
    const calledSince = since(CALL_WINDOW_DAYS, now);
    const trade = args.trade
      ? await ctx.db.query("industries").withIndex("by_slug", (q) => q.eq("slug", args.trade!)).first()
      : null;
    const tradeName = trade?.name ?? (args.trade ? title(args.trade.replace(/-/g, " ")) : undefined);
    const homes: Home[] = [];
    const add = async (p: Doc<"parcels">, why: string) => {
      if (homes.length >= MAX_HOMES || !callable(p) || (await leaveOff(ctx, p._id, calledSince, now))) return;
      homes.push(homeOf(p, why));
    };
    const streetHomes = (street: string) =>
      ctx.db
        .query("parcels")
        .withIndex("by_county_and_street", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("street", street))
        .take(300);

    if (args.kind === "trade_permits") {
      if (!args.trade) fail("INVALID", "Pick a trade");
      const permits = (
        await ctx.db
          .query("permits")
          .withIndex("by_county_and_applied", (q) =>
            q.eq("county", MIDLAND_PARCELS.county).gte("appliedAt", since(LIST_DAYS.tradePermits, now)),
          )
          .take(5000)
      ).filter((p) => p.residential !== false && p.trades.includes(args.trade!));
      const byStreet = new Map<string, number>();
      for (const p of permits) {
        const s = streetKey(p.address);
        if (s) byStreet.set(s, (byStreet.get(s) ?? 0) + 1);
      }
      const streets = [...byStreet.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      for (const [street, count] of streets) {
        if (homes.length >= MAX_HOMES) break;
        const why = `${count} ${tradeName!.toLowerCase()} permit${count === 1 ? "" : "s"} on ${title(street)} in the last ${LIST_DAYS.tradePermits} days`;
        for (const p of await streetHomes(street)) await add(p, why);
      }
      return { kind: args.kind, tradeName, streets: streets.slice(0, 10).map(([s, n]) => ({ street: title(s), permits: n })), homes };
    }

    if (args.kind === "recent_buyers") {
      const recent = await ctx.db
        .query("parcels")
        .withIndex("by_county_and_deed", (q) =>
          q.eq("county", MIDLAND_PARCELS.county).gte("deedDate", since(LIST_DAYS.recentBuyers, now).slice(0, 10)),
        )
        .order("desc")
        .take(400);
      for (const p of recent) {
        const bought = new Date(`${p.deedDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
        await add(p, `Bought ${bought}: new owners often have work done`);
      }
      return { kind: args.kind, tradeName, homes };
    }

    if (args.kind === "auction_buyers") {
      const from = since(LIST_DAYS.auctionBuyers, now).slice(0, 10);
      for (const date of recentAuctions(now, 6).slice(1).filter((d) => d >= from)) {
        const sold = (
          await ctx.db
            .query("foreclosures")
            .withIndex("by_county_and_sale", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("saleDate", date))
            .collect()
        ).filter((f) => f.status === "sold" && f.buyer?.phone);
        for (const f of sold) {
          if (homes.length >= MAX_HOMES) break;
          const phone = f.buyer!.phone!;
          const calls = await ctx.db
            .query("outboundCalls")
            .withIndex("by_phone", (q) => q.eq("phone", phone))
            .collect();
          if (calls.some((c) => c.at >= calledSince || c.outcome === "do_not_call")) continue;
          const parcel = f.parcelId ? await ctx.db.get(f.parcelId) : null;
          homes.push({
            parcelId: f.parcelId,
            owner: f.buyer!.name,
            phone,
            address: title(f.address),
            street: parcel?.street ? title(parcel.street) : undefined,
            zip: parcel?.mailing.zip?.slice(0, 5),
            marketValueCents: parcel?.marketValueCents,
            why: `Bought at the ${saleLabel(date)} courthouse auction${f.salePriceCents ? ` for $${Math.round(f.salePriceCents / 100).toLocaleString("en-US")}` : ""}`,
          });
        }
      }
      return { kind: args.kind, tradeName, homes };
    }

    const street = streetKey(`1 ${args.street ?? ""}`);
    if (!street) fail("INVALID", "Type a street name");
    for (const p of await streetHomes(street)) await add(p, `On ${title(street)}`);
    return { kind: args.kind, tradeName, homes };
  },
});

// ---- How the calling is going ----

/** The caller's own day: calls, answers, leads, and callbacks that are due. */
export const myDay = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCaller(ctx);
    const now = Date.now();
    const today = await ctx.db
      .query("outboundCalls")
      .withIndex("by_caller_and_at", (q) => q.eq("callerId", user._id).gte("at", new Date(centralMidnight(now)).toISOString()))
      .collect();
    const pending = (
      await ctx.db
        .query("outboundCalls")
        .withIndex("by_caller_and_at", (q) => q.eq("callerId", user._id).gte("at", since(CALL_WINDOW_DAYS, now)))
        .collect()
    ).filter((c) => c.outcome === "callback");
    const callbacks = [];
    for (const c of pending) {
      const after = await ctx.db
        .query("outboundCalls")
        .withIndex("by_phone", (q) => q.eq("phone", c.phone).gte("at", c.at))
        .collect();
      if (!after.some((a) => a._creationTime > c._creationTime)) callbacks.push({ id: c._id, parcelId: c.parcelId, phone: c.phone, address: c.address, owner: c.owner, trade: c.trade, callbackAt: c.callbackAt!, note: c.note });
    }
    callbacks.sort((a, b) => a.callbackAt.localeCompare(b.callbackAt));
    return {
      calls: today.length,
      answered: today.filter((c) => LIVE.has(c.outcome)).length,
      leads: today.filter((c) => c.outcome === "lead_taken").length,
      callbacks,
      hours: callingHours(now),
    };
  },
});

/** For Ops: each caller's calls, answers, leads taken, and how many were confirmed and sold. */
export const tally = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    await requireStaff(ctx);
    const calls = await ctx.db
      .query("outboundCalls")
      .withIndex("by_at", (q) => q.gte("at", since(days ?? 7)))
      .take(10000);
    const byCaller = new Map<Id<"users">, { calls: number; answered: number; leads: number; confirmed: number; sold: number }>();
    for (const c of calls) {
      const row = byCaller.get(c.callerId) ?? { calls: 0, answered: 0, leads: 0, confirmed: 0, sold: 0 };
      row.calls++;
      if (LIVE.has(c.outcome)) row.answered++;
      if (c.outcome === "lead_taken") {
        row.leads++;
        const intake = c.intakeLeadId ? await ctx.db.get(c.intakeLeadId) : null;
        const listed = intake?.confirmedLeadId ? await ctx.db.get(intake.confirmedLeadId) : null;
        if (listed) row.confirmed++;
        if (listed?.status === "assigned") row.sold++;
      }
      byCaller.set(c.callerId, row);
    }
    const rows = [];
    for (const [callerId, row] of byCaller) {
      const user = await ctx.db.get(callerId);
      rows.push({ callerId, name: user?.name || user?.email || "Former caller", email: user?.email ?? "", ...row });
    }
    return rows.sort((a, b) => b.leads - a.leads || b.calls - a.calls);
  },
});
