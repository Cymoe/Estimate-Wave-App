import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listDef, logContactDef, updateDef, acknowledgeDef } from "../leads";
import { bidsDef, feedDef, olderLeadsDef, requestCreditDef, walletDef, CREDIT_REASONS } from "../marketplace";
import { listStandingDef, resultsDef } from "../bids";
import { createLinkDef } from "../funding";
import { siteUrl } from "../delivery";
import { fail, getOwned } from "./access";
import { priceAt } from "./auction";
import { centralDay } from "./oauth";
import { dollars } from "./wallet";

// The connector's tools: what Claude or ChatGPT can do in FieldQuote for
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
  sent: "Sent by FieldQuote",
} as const;

/** How a lead got to the company: "Won with a bid · $300.00", or "Added by hand · Referral". Same wording as the web app. */
export function leadRoute(lead: Pick<Doc<"leads">, "marketplaceLeadId" | "wonVia" | "pricePaidCents" | "source">): string {
  if (lead.marketplaceLeadId) {
    const how = lead.wonVia ? ROUTES[lead.wonVia] : "From FieldQuote";
    const price = lead.wonVia === "claim" && !lead.pricePaidCents ? "included in the plan" : dollars(lead.pricePaidCents ?? 0);
    return `${how} · ${price}`;
  }
  return lead.source && lead.source !== "FieldQuote Lead" ? `Added by hand · ${lead.source}` : "Added by hand";
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
      "The connected FieldQuote company: its balance, plan, trades, bids, and what this assistant is allowed to spend today. Call this first when you need context.",
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
          : "Buying and bidding are off for this assistant; the person can turn them on in FieldQuote → Company settings → Assistants.",
      ];
      return { text: lines.join("\n"), data };
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
        lead.verified ? `FieldQuote confirmed it with the homeowner${lead.verified.note ? `: ${lead.verified.note}` : ""}` : "",
        lead.followUpDate ? `Follow up: ${lead.followUpDate}` : "",
        lead.appointmentAt ? `Estimate visit: ${lead.appointmentAt}` : "",
        `Calls ${lead.contacts ?? 0}, texts ${lead.texts ?? 0}${lead.lastContactAt ? `, last ${lead.lastContactAt.slice(0, 10)}` : ""}`,
        lead.marketplaceLeadId && !lead.acknowledgedAt ? 'Not marked "Got it" yet.' : "",
        lead.creditRequest ? `Credit request: ${lead.creditRequest.status}` : "",
        lead.notes ? `Notes:\n${lead.notes}` : "",
        `Open in FieldQuote: ${leadLink(lead._id)}`,
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
    description: 'Tells FieldQuote the company has a new lead and is calling the homeowner (the "Got it" on the alert). Do this once someone is on it.',
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
      "Leads for sale in the FieldQuote Marketplace right now, with today's price (it drops every hour until someone buys), town and the job. Homeowner contact details show only after buying. The company's own trades come first.",
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
    description: "Asks FieldQuote to credit back a bad lead bought from FieldQuote, within 3 days of getting it. FieldQuote staff decide.",
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
      return { text: `Credit requested for ${lead.name}. FieldQuote will review it; whats_new reports the answer.`, data: { id: leadId } };
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
];

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
