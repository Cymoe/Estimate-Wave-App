import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listDef, logContactDef, updateDef, acknowledgeDef } from "../leads";
import { bidsDef, buyDef, cancelBidDef, claimDef, feedDef, olderLeadsDef, placeBidDef, requestCreditDef, walletDef, CREDIT_REASONS } from "../marketplace";
import { listStandingDef, removeStandingDef, resultsDef, setStandingDef } from "../bids";
import { createLinkDef } from "../funding";
import { reportDef } from "../report";
import { reportText } from "./report";
import { siteUrl } from "../delivery";
import { fail, getOwned, logActivity } from "./access";
import { priceAt } from "./auction";
import { claimPrice, planIsActive } from "./plan";
import { centralDay } from "./oauth";
import { dollars, leadPriceCents } from "./wallet";

// The connector's tools: what Claude or ChatGPT can do in Tolliver for
// the person who connected it. Each runs the same code as the web app
// (see lib/actor.ts), signed in as that person in the connected company.

export type Connection = Doc<"aiConnections">;
export type ToolResult = { text: string; data?: unknown };
type Args = Record<string, unknown>;
type JsonSchema = Record<string, unknown>;

export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  /** Only reads (moving the "what's new" cursor doesn't count). */
  readOnly: boolean;
  /** Spends from the balance. */
  destructive?: boolean;
  scope: "leads" | "spend";
  run: (ctx: MutationCtx, connection: Connection, args: Args) => Promise<ToolResult>;
};

// ---- Reading arguments ----

function str(args: Args, key: string, { required = false, max = 2000 } = {}): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) fail("INVALID", `${key} is required`);
    return undefined;
  }
  if (typeof value !== "string") fail("INVALID", `${key} must be text`);
  return value.trim().slice(0, max);
}

function oneOf<T extends string>(args: Args, key: string, values: readonly T[], opts: { required?: boolean } = {}): T | undefined {
  const value = str(args, key, opts);
  if (value === undefined) return undefined;
  if (!(values as readonly string[]).includes(value)) fail("INVALID", `${key} must be one of: ${values.join(", ")}`);
  return value as T;
}

export function num(args: Args, key: string, { required = false } = {}): number | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) fail("INVALID", `${key} is required`);
    return undefined;
  }
  const n = typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) fail("INVALID", `${key} must be a number`);
  return n;
}

export function idOf<T extends "leads" | "marketplaceLeads" | "leadBids" | "standingBids">(ctx: MutationCtx, table: T, args: Args, key: string): Id<T> {
  const raw = str(args, key, { required: true })!;
  const id = ctx.db.normalizeId(table, raw);
  if (id === null) fail("NOT_FOUND", `No ${key.replace(/_id$/, "").replace(/_/g, " ")} with id ${raw}`);
  return id;
}

// ---- Wording ----

export const leadLink = (id: string) => `${siteUrl()}/leads?lead=${id}`;
export const app = (path: string) => `${siteUrl()}${path}`;

const STATUS_LABELS: Record<Doc<"leads">["status"], string> = {
  new: "New",
  no_answer: "No answer",
  contacted: "Contacted",
  scheduled: "Estimate scheduled",
  quoted: "Estimate sent",
  won: "Job sold",
  lost: "Lost",
};
const STATUSES = Object.keys(STATUS_LABELS) as Doc<"leads">["status"][];

const ROUTES = {
  bid: "Won with a bid",
  order: "Buy order filled",
  buy: "Bought in the Marketplace",
  claim: "Claimed from the Vault",
  sent: "Sent by Tolliver",
} as const;

/** The source a sold lead is stored with; leads sold before the rename carry the old name. */
const NETWORK_SOURCES = new Set(["Tolliver Lead", "FieldQuote Lead"]);

/** How a lead got to the company: "Won with a bid · $300.00", or "Added by hand · Referral". Same wording as the web app. */
export function leadRoute(lead: Pick<Doc<"leads">, "marketplaceLeadId" | "wonVia" | "pricePaidCents" | "source">): string {
  if (lead.marketplaceLeadId) {
    const how = lead.wonVia ? ROUTES[lead.wonVia] : "From Tolliver";
    const price = lead.wonVia === "claim" && !lead.pricePaidCents ? "included in the plan" : dollars(lead.pricePaidCents ?? 0);
    return `${how} · ${price}`;
  }
  return lead.source && !NETWORK_SOURCES.has(lead.source) ? `Added by hand · ${lead.source}` : "Added by hand";
}

function tradeNames(ctx: MutationCtx) {
  const names = new Map<string, string>();
  return async (slug: string | undefined) => {
    if (!slug) return undefined;
    if (!names.has(slug)) {
      const row = await ctx.db
        .query("industries")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      names.set(slug, row?.name ?? slug);
    }
    return names.get(slug);
  };
}

const where = (city?: string, county?: string) => [city, county ? `${county} County` : undefined].filter(Boolean).join(", ");

function leadSummary(lead: Doc<"leads">, trade?: string) {
  return {
    id: lead._id,
    name: lead.name,
    status: lead.status,
    statusLabel: STATUS_LABELS[lead.status],
    trade,
    city: lead.city,
    county: lead.county,
    phone: lead.phone,
    origin: leadRoute(lead),
    receivedAt: lead.assignedAt ?? lead.createdAt,
    followUpDate: lead.followUpDate,
    appointmentAt: lead.appointmentAt,
    gotIt: lead.marketplaceLeadId ? Boolean(lead.acknowledgedAt) : undefined,
    link: leadLink(lead._id),
  };
}

const leadLine = (l: ReturnType<typeof leadSummary>) =>
  `- ${l.name} (${l.statusLabel})${l.trade ? ` · ${l.trade}` : ""}${l.city ? ` · ${l.city}` : ""}${l.phone ? ` · ${l.phone}` : ""} · ${l.origin} · id ${l.id}`;

const leadIdArg = { lead_id: { type: "string", description: "The lead's id, from list_my_leads or whats_new." } };

// ---- Tools ----

export const TOOLS: Tool[] = [
  {
    name: "my_company",
    title: "Company and balance",
    description:
      "The connected Tolliver company: its balance, plan, trades, bids, and what this assistant is allowed to spend today. Call this first when you need context.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection) => {
      const organization = (await ctx.db.get(connection.organizationId))!;
      const wallet = await walletDef.handler(ctx, { organizationId: connection.organizationId });
      const tradeName = tradeNames(ctx);
      const trades = await Promise.all(wallet.leadTrades.map((t) => tradeName(t)));
      const spending = connection.scopes.includes("spend");
      const spentToday = spentTodayCents(connection);
      const data = {
        company: organization.name,
        balance: dollars(wallet.balanceCents),
        playMoney: wallet.playMoney || undefined,
        trades,
        plan: wallet.plan ? { status: wallet.plan.status, active: wallet.plan.active } : null,
        standingBids: wallet.standingBids,
        pausedBids: wallet.pausedBids,
        openBuyOrders: wallet.openBids,
        leadsForSaleInYourTrades: wallet.availableLeads,
        vaultLeadsInYourTrades: wallet.olderLeads,
        assistantCanSpend: spending,
        dailyLimit: spending ? dollars(connection.dailyCapCents) : undefined,
        spentToday: spending ? dollars(spentToday) : undefined,
        link: app("/leads"),
      };
      const lines = [
        `${organization.name}: balance ${dollars(wallet.balanceCents)}${wallet.playMoney ? " (play money: payments aren't switched on yet)" : ""}.`,
        `Trades: ${trades.join(", ") || "none picked yet"}.`,
        `Plan: ${wallet.plan ? (wallet.plan.active ? "Pro, active (the Vault is open)" : `Pro, ${wallet.plan.status}`) : "none (the Vault needs the Pro plan)"}.`,
        `${wallet.standingBids} standing bid(s)${wallet.pausedBids ? `, ${wallet.pausedBids} paused because the balance is below them` : ""}; ${wallet.openBids} open buy order(s).`,
        `${wallet.availableLeads} lead(s) for sale in the Marketplace in your trades; ${wallet.olderLeads} in the Vault.`,
        spending
          ? `You may buy and bid up to ${dollars(connection.dailyCapCents)} today (${dollars(spentToday)} spent so far). Always confirm with the person before spending.`
          : "Buying and bidding are off for this assistant; the person can turn them on in Tolliver → Company settings → Assistants.",
      ];
      return { text: lines.join("\n"), data };
    },
  },
  {
    name: "tolliver_report",
    title: "The Tolliver Report",
    description:
      "The Tolliver Report: a county's last 7 days in building permits (how many, by trade, new homes, and where homes are going up), lead demand (what bids win at, what's unsold) and what sold, plus the company's own week. Use it for market questions: \"what's happening in Midland roofing?\", \"is it worth bidding in Ector?\". Without the Pro plan some parts are held back, and it says so.",
    inputSchema: {
      type: "object",
      properties: {
        county: { type: "string", description: "Texas county. Defaults to where the company bids most, else Midland." },
        trade: { type: "string", description: "Narrow to one trade, by name or slug, for example Roofing." },
      },
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const report = await reportDef.handler(ctx, {
        organizationId: connection.organizationId,
        county: str(args, "county", { max: 60 }),
        trade: str(args, "trade", { max: 60 }),
      });
      return { text: reportText(report, { pro: app("/vault"), web: app("/leads") }), data: report };
    },
  },
  {
    name: "whats_new",
    title: "What's new",
    description:
      "Everything that happened since the last time this was asked: leads received, bids lost or outbid, buy orders that ended, credits decided, bids paused by a low balance. Use when the person asks what's new or for an update.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection) => {
      const organizationId = connection.organizationId;
      const since = connection.lastCheckedAt ?? Date.parse(connection.createdAt);
      const after = (iso?: string) => iso !== undefined && Date.parse(iso) > since;
      const tradeName = tradeNames(ctx);
      const leads = await listDef.handler(ctx, { organizationId });
      const received = await Promise.all(
        leads.filter((l) => after(l.assignedAt ?? l.createdAt)).map(async (l) => leadSummary(l, await tradeName(l.jobType))),
      );
      const credits = leads
        .filter((l) => l.creditRequest && after(l.creditRequest.reviewedAt))
        .map((l) => ({ id: l._id, name: l.name, status: l.creditRequest!.status }));
      const lostBids = await Promise.all(
        (await resultsDef.handler(ctx, { organizationId }))
          .filter((r) => !r.won && after(r.resolvedAt))
          .map(async (r) => ({ trade: await tradeName(r.jobType), where: where(r.city, r.county), bid: dollars(r.myBidCents), why: r.outcome })),
      );
      const orders = await Promise.all(
        (await bidsDef.handler(ctx, { organizationId }))
          .filter((b) => (b.status === "lost" || b.status === "filled") && after(b.resolvedAt))
          .map(async (b) => ({ trade: await tradeName(b.jobType), city: b.city, status: b.status, why: b.outcome, max: dollars(b.maxCents) })),
      );
      const outbid = await Promise.all(
        (await listStandingDef.handler(ctx, { organizationId }))
          .filter((b) => b.outbidNew)
          .map(async (b) => ({ trade: await tradeName(b.jobType), county: b.county, bid: dollars(b.amountCents) })),
      );
      const wallet = await walletDef.handler(ctx, { organizationId });
      await ctx.db.patch(connection._id, { lastCheckedAt: Date.now() });

      const lines: string[] = [];
      if (received.length) lines.push(`New leads (${received.length}):`, ...received.map(leadLine));
      const waiting = received.filter((l) => l.gotIt === false);
      if (waiting.length) lines.push(`${waiting.length} of them not marked "Got it" yet: call the homeowner, then acknowledge_lead.`);
      for (const b of lostBids) lines.push(`- Lost a ${b.trade ?? ""} lead in ${b.where} at your ${b.bid} bid: ${b.why ?? "another bid won"}`);
      for (const o of orders) lines.push(`- Buy order (${o.max}, ${o.trade ?? ""} in ${o.city ?? "?"}) ${o.status === "filled" ? "filled" : `ended: ${o.why ?? "lost"}`}`);
      for (const b of outbid) lines.push(`- Outbid: your ${b.bid} ${b.trade ?? ""} bid in ${b.county} County isn't winning any more`);
      for (const c of credits) lines.push(`- Credit request for ${c.name}: ${c.status}`);
      if (wallet.pausedBids)
        lines.push(`- ${wallet.pausedBids} bid(s) paused: the ${dollars(wallet.balanceCents)} balance is below them. Add funds with add_funds_link.`);
      return {
        text: lines.length ? lines.join("\n") : "Nothing new since the last check.",
        data: { since: new Date(since).toISOString(), received, lostBids, orders, outbid, credits, pausedBids: wallet.pausedBids, balance: dollars(wallet.balanceCents) },
      };
    },
  },
  {
    name: "list_my_leads",
    title: "List leads",
    description:
      "The company's leads, open ones first (by follow-up day), with contact phone and where each came from. Filter by status or search by name, phone, town or note.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: STATUSES, description: "Only leads in this stage." },
        search: { type: "string", description: "Name, phone, town or words in the notes." },
        limit: { type: "number", description: "How many to return (default 25, at most 100)." },
      },
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const status = oneOf(args, "status", STATUSES);
      const search = str(args, "search")?.toLowerCase();
      const limit = Math.min(100, Math.max(1, Math.round(num(args, "limit") ?? 25)));
      const tradeName = tradeNames(ctx);
      const leads = (await listDef.handler(ctx, { organizationId: connection.organizationId }))
        .filter((l) => !status || l.status === status)
        .filter((l) => !search || [l.name, l.phone, l.city, l.notes, l.address].some((f) => f?.toLowerCase().includes(search)));
      const shown = await Promise.all(leads.slice(0, limit).map(async (l) => leadSummary(l, await tradeName(l.jobType))));
      return {
        text: shown.length ? [`${leads.length} lead(s)${leads.length > limit ? `, showing ${limit}` : ""}:`, ...shown.map(leadLine)].join("\n") : "No leads match.",
        data: { total: leads.length, leads: shown },
      };
    },
  },
  {
    name: "get_lead",
    title: "Lead details",
    description: "Everything on one lead: contact details, address, the job, stage, notes, calls logged, how it reached the company and whether a credit was asked for.",
    inputSchema: { type: "object", properties: leadIdArg, required: ["lead_id"], additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const { doc: lead } = await getOwned(ctx, "leads", idOf(ctx, "leads", args, "lead_id"));
      if (lead.organizationId !== connection.organizationId) fail("NOT_FOUND", "Not found");
      const trade = await tradeNames(ctx)(lead.jobType);
      const data = {
        ...leadSummary(lead, trade),
        email: lead.email,
        address: lead.address,
        notes: lead.notes,
        calls: lead.contacts ?? 0,
        texts: lead.texts ?? 0,
        lastContactAt: lead.lastContactAt,
        lostReason: lead.lostReason,
        confirmedWithHomeowner: lead.verified ? { at: lead.verified.at, note: lead.verified.note } : undefined,
        credit: lead.creditRequest ? { status: lead.creditRequest.status, reason: lead.creditRequest.reason } : undefined,
      };
      const lines = [
        `${lead.name} · ${STATUS_LABELS[lead.status]}${trade ? ` · ${trade}` : ""}`,
        [lead.phone, lead.email].filter(Boolean).join(" · ") || "No phone or email",
        lead.address || lead.city ? `Address: ${[lead.address, lead.city].filter(Boolean).join(", ")}` : "",
        `Origin: ${leadRoute(lead)}`,
        lead.verified ? `Tolliver confirmed it with the homeowner${lead.verified.note ? `: ${lead.verified.note}` : ""}` : "",
        lead.followUpDate ? `Follow up: ${lead.followUpDate}` : "",
        lead.appointmentAt ? `Estimate visit: ${lead.appointmentAt}` : "",
        `Calls ${lead.contacts ?? 0}, texts ${lead.texts ?? 0}${lead.lastContactAt ? `, last ${lead.lastContactAt.slice(0, 10)}` : ""}`,
        lead.marketplaceLeadId && !lead.acknowledgedAt ? 'Not marked "Got it" yet.' : "",
        lead.creditRequest ? `Credit request: ${lead.creditRequest.status}` : "",
        lead.notes ? `Notes:\n${lead.notes}` : "",
        `Open in Tolliver: ${leadLink(lead._id)}`,
      ];
      return { text: lines.filter(Boolean).join("\n"), data };
    },
  },
  {
    name: "update_lead",
    title: "Update a lead",
    description:
      "Moves a lead to another stage (for example scheduled once the estimate visit is booked, won once the job is sold, lost with a reason) or sets its follow-up day. To add a note, use log_contact.",
    inputSchema: {
      type: "object",
      properties: {
        ...leadIdArg,
        status: { type: "string", enum: STATUSES, description: "won means the company sold the job; lost needs lost_reason." },
        lost_reason: { type: "string", description: "Why it was lost, when status is lost." },
        follow_up_date: { type: "string", description: "Next follow-up day, YYYY-MM-DD." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const id = idOf(ctx, "leads", args, "lead_id");
      const data: Record<string, unknown> = {};
      const status = oneOf(args, "status", STATUSES);
      if (status) data.status = status;
      const lostReason = str(args, "lost_reason", { max: 200 });
      if (lostReason) data.lostReason = lostReason;
      const followUp = str(args, "follow_up_date");
      if (followUp) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(followUp)) fail("INVALID", "follow_up_date must be YYYY-MM-DD");
        data.followUpDate = followUp;
      }
      if (!Object.keys(data).length) fail("INVALID", "Give a status or a follow_up_date to change");
      await ownLead(ctx, connection, id);
      const lead = (await updateDef.handler(ctx, { id, data }))!;
      return {
        text: `${lead.name} is now ${STATUS_LABELS[lead.status]}${lead.followUpDate ? `, follow up ${lead.followUpDate}` : ""}.`,
        data: leadSummary(lead),
      };
    },
  },
  {
    name: "log_contact",
    title: "Log a call, text or note",
    description: "Records a call or text to the homeowner, or adds a dated note to the lead.",
    inputSchema: {
      type: "object",
      properties: {
        ...leadIdArg,
        kind: { type: "string", enum: ["call", "text", "note"] },
        note: { type: "string", description: "The note text (required when kind is note)." },
      },
      required: ["lead_id", "kind"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const id = idOf(ctx, "leads", args, "lead_id");
      const kind = oneOf(args, "kind", ["call", "text", "note"] as const, { required: true })!;
      await ownLead(ctx, connection, id);
      const lead = (await logContactDef.handler(ctx, { id, kind, note: str(args, "note") }))!;
      return {
        text: kind === "note" ? `Note added to ${lead.name}.` : `Logged a ${kind} to ${lead.name} (${kind === "call" ? lead.contacts : lead.texts} so far).`,
        data: leadSummary(lead),
      };
    },
  },
  {
    name: "acknowledge_lead",
    title: 'Mark "Got it"',
    description: 'Tells Tolliver the company has a new lead and is calling the homeowner (the "Got it" on the alert). Do this once someone is on it.',
    inputSchema: { type: "object", properties: leadIdArg, required: ["lead_id"], additionalProperties: false },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const id = idOf(ctx, "leads", args, "lead_id");
      const lead = await ownLead(ctx, connection, id);
      await acknowledgeDef.handler(ctx, { id });
      return { text: `Marked "Got it" for ${lead.name}.`, data: { id } };
    },
  },
  {
    name: "browse_marketplace",
    title: "Leads for sale",
    description:
      "Leads for sale in the Tolliver Marketplace right now, with today's price (it drops every hour until someone buys), town and the job. Homeowner contact details show only after buying. The company's own trades come first.",
    inputSchema: {
      type: "object",
      properties: {
        trade: { type: "string", description: "Trade name or slug, for example Roofing." },
        city: { type: "string" },
        only_my_trades: { type: "boolean", description: "Default true." },
      },
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const trade = str(args, "trade")?.toLowerCase();
      const city = str(args, "city")?.toLowerCase();
      const mine = args.only_my_trades !== false;
      const now = Date.now();
      const leads = (await feedDef.handler(ctx, { organizationId: connection.organizationId }))
        .filter((l) => !mine || l.matchesTrades)
        .filter((l) => !trade || l.jobType?.toLowerCase() === trade || l.tradeName?.toLowerCase().includes(trade))
        .filter((l) => !city || l.city?.toLowerCase().includes(city))
        .slice(0, 25)
        .map((l) => {
          const price = priceAt(l.auction, now);
          return {
            id: l.id,
            trade: l.tradeName ?? l.jobType,
            city: l.city,
            summary: l.summary,
            price: dollars(price.priceCents),
            priceCents: price.priceCents,
            floor: dollars(l.auction.floorCents),
            nextDropAt: price.nextDropAtMs ? new Date(price.nextDropAtMs).toISOString() : undefined,
            confirmedWithHomeowner: Boolean(l.verified),
            demoOnly: l.demo,
            myBuyOrder: l.myBid ? dollars(l.myBid.maxCents) : undefined,
          };
        });
      const lines = leads.map(
        (l) =>
          `- ${l.trade ?? "Lead"} in ${l.city ?? "?"} · ${l.price} now (floor ${l.floor})${l.confirmedWithHomeowner ? " · confirmed" : ""}${l.demoOnly ? " · demo, can't be bought" : ""}${l.myBuyOrder ? ` · your buy order ${l.myBuyOrder}` : ""} · id ${l.id}${l.summary ? `\n  ${l.summary.slice(0, 200)}` : ""}`,
      );
      return {
        text: leads.length ? [`${leads.length} lead(s) for sale:`, ...lines, `Marketplace: ${app("/marketplace")}`].join("\n") : "No leads for sale that match right now.",
        data: { leads },
      };
    },
  },
  {
    name: "browse_vault",
    title: "Vault leads",
    description: "Older leads nobody bought, which a company on the Pro plan can claim (included claims each month, then a set price). Says so if the company isn't on the plan.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection) => {
      const vault = await olderLeadsDef.handler(ctx, { organizationId: connection.organizationId });
      if (vault.locked)
        return {
          text: `The Vault needs the Pro plan. ${vault.count} lead(s) are waiting in your trades. Start it at ${app("/vault")}.`,
          data: { locked: true, count: vault.count },
        };
      const leads = vault.leads.slice(0, 25).map((l) => ({
        id: l.id,
        trade: l.tradeName ?? l.jobType,
        city: l.city,
        county: l.county,
        ageDays: l.ageDays,
        summary: l.summary,
        inMyTrades: l.matchesTrades,
        confirmedWithHomeowner: Boolean(l.verified),
        demoOnly: l.demo,
      }));
      return {
        text: [
          `${vault.leads.length} lead(s) in the Vault:`,
          ...leads.map((l) => `- ${l.trade ?? "Lead"} in ${where(l.city, l.county) || "?"} · ${l.ageDays} days old${l.inMyTrades ? "" : " · not your trade"}${l.demoOnly ? " · demo" : ""} · id ${l.id}`),
        ].join("\n"),
        data: { locked: false, leads },
      };
    },
  },
  {
    name: "my_bids",
    title: "Bids and buy orders",
    description:
      "The company's standing bids (what it pays per lead by county and trade, and whether each is winning), its buy orders on single Marketplace leads, and recent bid results.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection) => {
      const organizationId = connection.organizationId;
      const tradeName = tradeNames(ctx);
      const standing = await Promise.all(
        (await listStandingDef.handler(ctx, { organizationId })).map(async (b) => ({
          id: b.id,
          trade: await tradeName(b.jobType),
          tradeSlug: b.jobType,
          county: b.county,
          amount: dollars(b.amountCents),
          winning: b.leading,
          paused: !b.funded,
        })),
      );
      const orders = await Promise.all(
        (await bidsDef.handler(ctx, { organizationId }))
          .filter((b) => b.status === "open")
          .map(async (b) => ({ id: b.id, leadId: b.leadId, trade: await tradeName(b.jobType), city: b.city, max: dollars(b.maxCents) })),
      );
      const results = await Promise.all(
        (await resultsDef.handler(ctx, { organizationId })).slice(0, 5).map(async (r) => ({
          trade: await tradeName(r.jobType),
          where: where(r.city, r.county),
          bid: dollars(r.myBidCents),
          won: r.won,
          outcome: r.outcome,
          at: r.resolvedAt,
        })),
      );
      const lines = [
        standing.length ? "Standing bids:" : "No standing bids.",
        ...standing.map((b) => `- ${b.trade} in ${b.county} County: ${b.amount} · ${b.paused ? "paused (balance below it)" : b.winning ? "winning" : "not winning"} · id ${b.id}`),
        ...(orders.length ? ["Open buy orders:", ...orders.map((o) => `- ${o.trade ?? "Lead"} in ${o.city ?? "?"}: buys at ${o.max} · id ${o.id}`)] : []),
        ...(results.length ? ["Recent results:", ...results.map((r) => `- ${r.won ? "Won" : "Lost"} ${r.trade ?? ""} in ${r.where} at ${r.bid}${!r.won && r.outcome ? `: ${r.outcome}` : ""}`)] : []),
        `Bids: ${app("/bids")}`,
      ];
      return { text: lines.join("\n"), data: { standing, orders, results } };
    },
  },
  {
    name: "request_credit",
    title: "Ask for a credit",
    description: "Asks Tolliver to credit back a bad lead bought from Tolliver, within 3 days of getting it. Tolliver staff decide.",
    inputSchema: {
      type: "object",
      properties: {
        ...leadIdArg,
        reason: { type: "string", enum: [...CREDIT_REASONS] },
        note: { type: "string", description: "What happened, in a sentence." },
      },
      required: ["lead_id", "reason"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const leadId = idOf(ctx, "leads", args, "lead_id");
      const lead = await ownLead(ctx, connection, leadId);
      const reason = oneOf(args, "reason", CREDIT_REASONS, { required: true })!;
      await requestCreditDef.handler(ctx, { leadId, reason, note: str(args, "note", { max: 500 }) });
      return { text: `Credit requested for ${lead.name}. Tolliver will review it; whats_new reports the answer.`, data: { id: leadId } };
    },
  },
  {
    name: "add_funds_link",
    title: "Add funds",
    description: "A link where the person adds funds to the lead balance by card. Payments happen on that page, never in the chat.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection) => {
      const token = await createLinkDef.handler(ctx, { organizationId: connection.organizationId });
      const url = app(`/fund/${token}`);
      return { text: `Add funds here: ${url}`, data: { url } };
    },
  },

  // ---- Spending (scope "spend": an owner or admin turned it on, under a daily limit) ----
  {
    name: "buy_lead",
    title: "Buy a Marketplace lead",
    description:
      "Buys a lead from the Marketplace at its current price, paid from the company's balance; it's theirs alone and the homeowner's details come back. Pass the price you quoted the person: if it has gone up since, nothing is bought. Confirm with the person first.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "The Marketplace lead's id, from browse_marketplace." },
        expected_price: { type: "number", description: "The price in dollars you told the person, from browse_marketplace." },
      },
      required: ["lead_id", "expected_price"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    scope: "spend",
    run: async (ctx, connection, args) => {
      const leadId = idOf(ctx, "marketplaceLeads", args, "lead_id");
      const expectedCents = Math.round(num(args, "expected_price", { required: true })! * 100);
      const lead = await ctx.db.get(leadId);
      if (lead === null || lead.status !== "available") fail("INVALID", "Someone just bought this lead");
      const priceCents = await leadPriceCents(ctx, lead);
      if (priceCents > expectedCents)
        fail("INVALID", `It's ${dollars(priceCents)} now, not ${dollars(expectedCents)}. Nothing was bought: check the new price with the person.`);
      await spend(ctx, connection, priceCents);
      const sale = await buyDef.handler(ctx, { leadId, organizationId: connection.organizationId });
      await logSpend(ctx, connection, "bought_lead", sale.orgLeadId, priceCents);
      return await bought(ctx, sale.orgLeadId, `Bought for ${dollars(priceCents)}.`);
    },
  },
  {
    name: "claim_vault_lead",
    title: "Claim a Vault lead",
    description:
      "Claims an older lead from the Vault (Pro plan): free while the month's included claims last, then the plan's extra-claim price, paid from the balance. Confirm with the person first.",
    inputSchema: {
      type: "object",
      properties: { lead_id: { type: "string", description: "The Vault lead's id, from browse_vault." } },
      required: ["lead_id"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    scope: "spend",
    run: async (ctx, connection, args) => {
      const leadId = idOf(ctx, "marketplaceLeads", args, "lead_id");
      const organization = (await ctx.db.get(connection.organizationId))!;
      const priceCents = organization.plan && planIsActive(organization.plan, Date.now()) ? claimPrice(organization.plan) : 0;
      await spend(ctx, connection, priceCents);
      const sale = await claimDef.handler(ctx, { leadId, organizationId: connection.organizationId });
      await logSpend(ctx, connection, "claimed_lead", sale.orgLeadId, priceCents);
      return await bought(
        ctx,
        sale.orgLeadId,
        `${priceCents ? `Claimed for ${dollars(priceCents)}` : "Claimed, included in the plan"}; ${sale.claimsLeft} included claim(s) left this month.`,
      );
    },
  },
  {
    name: "place_buy_order",
    title: "Place a buy order",
    description:
      "Names the most the company will pay for one Marketplace lead. Its price drops every hour; the order buys it automatically when it reaches this amount, unless someone buys it first. The amount counts toward today's limit. Confirm with the person first.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "The Marketplace lead's id, from browse_marketplace." },
        max: { type: "number", description: "Dollars: below today's price and not below the lead's floor." },
      },
      required: ["lead_id", "max"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    scope: "spend",
    run: async (ctx, connection, args) => {
      const leadId = idOf(ctx, "marketplaceLeads", args, "lead_id");
      const max = num(args, "max", { required: true })!;
      const maxCents = Math.round(max * 100);
      await spend(ctx, connection, maxCents);
      const order = await placeBidDef.handler(ctx, { leadId, organizationId: connection.organizationId, max });
      await logSpend(ctx, connection, "placed_buy_order", order.bidId, maxCents);
      return {
        text: `Buy order placed at ${dollars(maxCents)}. If nobody buys it first, it fills around ${new Date(order.fillsAt).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })} Central.`,
        data: { orderId: order.bidId, max: dollars(maxCents), fillsAt: order.fillsAt },
      };
    },
  },
  {
    name: "cancel_buy_order",
    title: "Cancel a buy order",
    description: "Cancels one of the company's open buy orders (ids from my_bids).",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "The buy order's id, from my_bids." } },
      required: ["order_id"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "spend",
    run: async (ctx, connection, args) => {
      const bidId = idOf(ctx, "leadBids", args, "order_id");
      const bid = await ctx.db.get(bidId);
      if (bid === null || bid.organizationId !== connection.organizationId) fail("NOT_FOUND", "Buy order not found");
      await cancelBidDef.handler(ctx, { bidId });
      return { text: "Buy order cancelled.", data: { orderId: bidId } };
    },
  },
  {
    name: "set_standing_bid",
    title: "Set a standing bid",
    description:
      "Sets what the company pays per new lead in one county and trade (replacing any bid there). The highest funded bid wins each new lead the moment it arrives, paid from the balance, so this can buy many leads over time. The amount can't be above this assistant's daily limit. Confirm with the person first.",
    inputSchema: {
      type: "object",
      properties: {
        county: { type: "string", description: "Texas county, for example Midland." },
        trade: { type: "string", description: "One of the company's trades, by name or slug, for example Roofing." },
        amount: { type: "number", description: "Dollars per lead." },
      },
      required: ["county", "trade", "amount"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    scope: "spend",
    run: async (ctx, connection, args) => {
      const county = str(args, "county", { required: true })!;
      const amount = num(args, "amount", { required: true })!;
      const amountCents = Math.round(amount * 100);
      if (amountCents > connection.dailyCapCents)
        fail(
          "FORBIDDEN",
          `A ${dollars(amountCents)} bid is above this assistant's ${dollars(connection.dailyCapCents)} daily limit. The person can raise it in Tolliver → Company settings → Assistants, or set the bid on the web.`,
        );
      const jobType = await tradeSlug(ctx, connection, str(args, "trade", { required: true })!);
      const id = await setStandingDef.handler(ctx, { organizationId: connection.organizationId, county, jobType, amount });
      await logSpend(ctx, connection, "set_standing_bid", id, amountCents);
      const row = (await listStandingDef.handler(ctx, { organizationId: connection.organizationId })).find((b) => b.id === id)!;
      return {
        text: `Standing bid set: ${dollars(row.amountCents)} per ${(await tradeNames(ctx)(row.jobType)) ?? row.jobType} lead in ${row.county} County · ${row.leading ? "winning" : row.funded ? "not winning yet: another company bids more" : "paused until the balance covers it"}.`,
        data: { bidId: id, county: row.county, amount: dollars(row.amountCents), winning: row.leading },
      };
    },
  },
  {
    name: "remove_standing_bid",
    title: "Remove a standing bid",
    description: "Removes one of the company's standing bids (ids from my_bids); it wins no more leads.",
    inputSchema: {
      type: "object",
      properties: { bid_id: { type: "string", description: "The standing bid's id, from my_bids." } },
      required: ["bid_id"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "spend",
    run: async (ctx, connection, args) => {
      const id = idOf(ctx, "standingBids", args, "bid_id");
      const row = await ctx.db.get(id);
      if (row === null || row.organizationId !== connection.organizationId) fail("NOT_FOUND", "Bid not found");
      await removeStandingDef.handler(ctx, { id });
      return { text: `Removed the ${row.county} County bid.`, data: { bidId: id } };
    },
  },
];

/**
 * Counts a charge against the connection's daily limit (Central time).
 * Runs in the same mutation as the charge, so a refused or failed buy
 * counts nothing.
 */
async function spend(ctx: MutationCtx, connection: Connection, cents: number) {
  const today = centralDay();
  const spent = spentTodayCents(connection, today);
  if (spent + cents > connection.dailyCapCents)
    fail(
      "FORBIDDEN",
      `That's over today's ${dollars(connection.dailyCapCents)} limit for this assistant (${dollars(spent)} spent so far, this is ${dollars(cents)}). Nothing was spent. The person can raise the limit in Tolliver → Company settings → Assistants.`,
    );
  await ctx.db.patch(connection._id, { spendDay: today, spentTodayCents: spent + cents });
}

/** The audit trail says it was the assistant. */
async function logSpend(ctx: MutationCtx, connection: Connection, action: string, resourceId: string, amountCents: number) {
  await logActivity(ctx, {
    organizationId: connection.organizationId,
    userId: connection.userId,
    action,
    resourceType: "assistant",
    resourceId,
    details: { amountCents },
    metadata: { via: connection.app, connectionId: connection._id },
  });
}

/** After buying or claiming: the lead as the company now has it, contact details included. */
async function bought(ctx: MutationCtx, orgLeadId: Id<"leads">, headline: string): Promise<ToolResult> {
  const lead = (await ctx.db.get(orgLeadId))!;
  const summary = leadSummary(lead, await tradeNames(ctx)(lead.jobType));
  return {
    text: [
      headline,
      `${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}${lead.email ? ` · ${lead.email}` : ""}`,
      lead.address || lead.city ? [lead.address, lead.city].filter(Boolean).join(", ") : "",
      lead.notes ?? "",
      `It's in the company's leads: ${leadLink(lead._id)}. Call the homeowner, then acknowledge_lead.`,
    ]
      .filter(Boolean)
      .join("\n"),
    data: { ...summary, email: lead.email, address: lead.address, notes: lead.notes },
  };
}

/** A trade the company lists, from its name or slug. */
async function tradeSlug(ctx: MutationCtx, connection: Connection, trade: string): Promise<string> {
  const organization = (await ctx.db.get(connection.organizationId))!;
  const wanted = trade.toLowerCase();
  const names = tradeNames(ctx);
  for (const slug of organization.leadTrades ?? []) {
    if (slug.toLowerCase() === wanted || (await names(slug))?.toLowerCase() === wanted) return slug;
  }
  return trade;
}

/** The connected company's lead, or not found (an id from another company reads the same as a wrong one). */
async function ownLead(ctx: MutationCtx, connection: Connection, id: Id<"leads">) {
  const { doc } = await getOwned(ctx, "leads", id);
  if (doc.organizationId !== connection.organizationId) fail("NOT_FOUND", "Not found");
  return doc;
}

/** What the connection has spent today (Central time); a new day starts at zero. */
export function spentTodayCents(connection: Connection, today = centralDay()): number {
  return connection.spendDay === today ? connection.spentTodayCents ?? 0 : 0;
}
