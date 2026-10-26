import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createDef as createClientDef } from "../clients";
import { siteUrl } from "../delivery";
import { createDef as createEstimateDef, listDef as listEstimatesDef, updateDef as updateEstimateDef } from "../estimates";
import { createDef as createExpenseDef } from "../expenses";
import { updateDef as updateLeadDef } from "../leads";
import { emailDef as emailEstimateDef } from "../estimateEmail";
import { createDef as createItemDef, listDef as listItemsDef } from "../lineItems";
import { createDef as createProjectDef } from "../projects";
import { fail, getOwned, requireMember } from "./access";
import type { Connection, Tool, ToolResult } from "./mcpTools";

// The connector's estimating tools: pricing a job from the company's price
// book, drafts the person reviews (and has emailed to the client when they ask), projects and
// their costs. Prices always come from the price book here, never from the
// assistant: a line is the item's cap unless a price is given, and never
// below its red line.

type Args = Record<string, unknown>;
type Item = Doc<"estimates">["items"][number];

const app = (path: string) => `${siteUrl()}${path}`;
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EXPENSE_CATEGORIES = ["Materials", "Labor", "Equipment", "Service", "Permits", "Subcontractor", "Disposal", "Other"] as const;

const PROJECT_STATUS: Record<Doc<"projects">["status"], string> = {
  planning: "Planned",
  in_progress: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ESTIMATE_STATUS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  opened: "Opened by the client",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
};

// ---- Reading arguments ----

function text(args: Args, key: string, { required = false, max = 2000 } = {}): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) fail("INVALID", `${key} is required`);
    return undefined;
  }
  if (typeof value !== "string") fail("INVALID", `${key} must be text`);
  return value.trim().slice(0, max) || undefined;
}

function number(args: Args, key: string, { required = false, min = 0 } = {}): number | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) fail("INVALID", `${key} is required`);
    return undefined;
  }
  const n = typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) fail("INVALID", `${key} must be a number`);
  if (n < min) fail("INVALID", `${key} must be ${min} or more`);
  return n;
}

function list(args: Args, key: string): Args[] {
  const value = args[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object")) fail("INVALID", `${key} must be a list`);
  return value as Args[];
}

function id<T extends "lineItems" | "estimates" | "projects" | "clients" | "leads">(ctx: MutationCtx, table: T, raw: string | undefined, what: string): Id<T> {
  const found = raw === undefined ? null : ctx.db.normalizeId(table, raw);
  if (found === null) fail("NOT_FOUND", `No ${what} with id ${raw}`);
  return found;
}

/** The connected company's record, or not found (another company's reads the same as a wrong id). */
async function own<T extends "estimates" | "projects" | "clients" | "leads">(ctx: MutationCtx, connection: Connection, table: T, raw: string | undefined, what: string) {
  const { doc } = await getOwned(ctx, table, id(ctx, table, raw, what));
  if (doc.organizationId !== connection.organizationId) fail("NOT_FOUND", `No ${what} with id ${raw}`);
  return doc as Doc<T>;
}

// ---- Prices ----

const floorOf = (item: Doc<"lineItems">) => item.red_line_price ?? item.base_price;
const capOf = (item: Doc<"lineItems">) => item.cap_price ?? floorOf(item);

/** Checks a price for one line against its floor and ceiling. */
function checkPrice(name: string, unit: string, price: number, floor: number | undefined, cap: number | undefined) {
  if (floor !== undefined && price < floor)
    fail("INVALID", `${name}: the lowest it can go is ${money(floor)} per ${unit} (its red line). Nothing was saved.`);
  if (cap !== undefined && price > cap)
    fail("INVALID", `${name}: the most it can go is ${money(cap)} per ${unit} (its cap). Nothing was saved.`);
}

/** Estimate lines from price book items and custom lines; prices from the price book. */
async function priceLines(ctx: MutationCtx, connection: Connection, args: Args, linesKey: string, customKey: string) {
  const items: Array<Omit<Item, "_id" | "totalPrice" | "displayOrder">> = [];
  for (const line of list(args, linesKey)) {
    const itemId = id(ctx, "lineItems", text(line, "line_item_id", { required: true }), "price book item");
    const item = await ctx.db.get(itemId);
    if (item === null || !item.is_active || (item.organization_id !== undefined && item.organization_id !== connection.organizationId))
      fail("NOT_FOUND", `No price book item with id ${itemId}`);
    const quantity = number(line, "quantity") ?? 1;
    if (quantity <= 0) fail("INVALID", "quantity must be more than 0");
    const floor = floorOf(item);
    const cap = capOf(item);
    const price = number(line, "price");
    if (price !== undefined) checkPrice(item.name, item.unit, price, floor, cap);
    const costCode = await ctx.db.get(item.cost_code_id);
    items.push({
      description: item.name,
      quantity,
      unitPrice: price ?? cap,
      redLinePrice: floor,
      capPrice: cap,
      ...(costCode ? { costCode: costCode.code } : {}),
      productId: item._id,
    });
  }
  for (const line of list(args, customKey)) {
    const description = text(line, "description", { required: true, max: 300 })!;
    const quantity = number(line, "quantity") ?? 1;
    if (quantity <= 0) fail("INVALID", "quantity must be more than 0");
    items.push({ description, quantity, unitPrice: number(line, "price", { required: true })! });
  }
  return items;
}

/** One line of an estimate, as the assistant reads it back. */
function itemLine(item: Item) {
  const custom = item.redLinePrice === undefined;
  return `- ${item.description}: ${item.quantity} × ${money(item.unitPrice)} = ${money(item.totalPrice)}${
    custom ? " (custom line, not from the price book)" : ` (floor ${money(item.redLinePrice!)}${item.capPrice !== undefined ? `, cap ${money(item.capPrice)}` : ""})`
  } · line id ${item._id}`;
}

const floorTotal = (items: Item[]) => items.reduce((sum, i) => sum + i.quantity * (i.redLinePrice ?? i.unitPrice), 0);

function estimateText(estimate: Doc<"estimates">, headline: string, clientName?: string): ToolResult {
  const custom = estimate.items.filter((i) => i.redLinePrice === undefined).length;
  const lines = [
    headline,
    `${estimate.estimateNumber}${estimate.title ? ` · ${estimate.title}` : ""}${clientName ? ` · ${clientName}` : ""} · ${ESTIMATE_STATUS[estimate.status] ?? estimate.status}`,
    ...estimate.items.map(itemLine),
    `Total ${money(estimate.totalAmount)}. The lowest it can go is ${money(floorTotal(estimate.items))} (every line at its red line${custom ? ", custom lines as they are" : ""}).`,
    estimate.notes ? `Notes: ${estimate.notes}` : "",
    estimate.status === "draft" ? `It's a draft for the person to review: ${app(`/estimates/${estimate._id}`)}. When they say to send it, send_estimate emails it to the client.` : `Open it: ${app(`/estimates/${estimate._id}`)}`,
  ];
  return {
    text: lines.filter(Boolean).join("\n"),
    data: {
      id: estimate._id,
      number: estimate.estimateNumber,
      title: estimate.title,
      client: clientName,
      status: estimate.status,
      total: estimate.totalAmount,
      lowestTotal: floorTotal(estimate.items),
      items: estimate.items.map((i) => ({
        lineId: i._id,
        description: i.description,
        quantity: i.quantity,
        price: i.unitPrice,
        total: i.totalPrice,
        redLine: i.redLinePrice,
        cap: i.capPrice,
        fromPriceBook: i.redLinePrice !== undefined,
      })),
      notes: estimate.notes,
      link: app(`/estimates/${estimate._id}`),
    },
  };
}

// ---- Clients ----

const digits = (phone?: string) => (phone ?? "").replace(/\D/g, "").slice(-10);

/** The client given by id, or one matched by phone or email, or a new one. */
async function clientFor(ctx: MutationCtx, connection: Connection, clientId: string | undefined, contact: Args | undefined) {
  if (clientId) return await own(ctx, connection, "clients", clientId, "client");
  if (!contact) return null;
  const name = text(contact, "name", { max: 200 });
  const phone = text(contact, "phone", { max: 40 });
  const email = text(contact, "email", { max: 200 })?.toLowerCase();
  const address = text(contact, "address", { max: 300 });
  if (!name && !phone && !email) return null;
  const clients = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) => q.eq("organizationId", connection.organizationId))
    .take(2000);
  const match = clients.find(
    (c) => (phone && digits(phone).length >= 7 && digits(c.phone) === digits(phone)) || (email && c.email?.toLowerCase() === email),
  );
  if (match) return match;
  if (!name) fail("INVALID", "A new client needs a name");
  return (await createClientDef.handler(ctx, {
    organizationId: connection.organizationId,
    data: { name, phone, email, address },
  }))!;
}

const clientName = (client: Doc<"clients"> | null | undefined) => client?.companyName || client?.name;

// ---- Projects ----

async function projectMoney(ctx: MutationCtx, project: Doc<"projects">) {
  const estimates = (
    await ctx.db
      .query("estimates")
      .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", project.organizationId))
      .take(2000)
  ).filter((e) => e.projectId === project._id);
  const expenses = (await ctx.db.query("expenses").withIndex("by_project", (q) => q.eq("projectId", project._id)).take(2000)).filter(
    (e) => e.organizationId === project.organizationId,
  );
  const contract = estimates.filter((e) => e.status === "accepted").reduce((sum, e) => sum + e.totalAmount, 0);
  const costs = expenses.reduce((sum, e) => sum + e.amount, 0);
  const byType = new Map<string, number>();
  for (const e of expenses) byType.set(e.category || "Other", (byType.get(e.category || "Other") ?? 0) + e.amount);
  return {
    estimates,
    expenses,
    contract,
    costs,
    profit: contract > 0 ? contract - costs : null,
    margin: contract > 0 ? Math.round(((contract - costs) / contract) * 100) : null,
    budget: project.budget ?? null,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function moneyLine(m: Awaited<ReturnType<typeof projectMoney>>) {
  return [
    m.contract > 0 ? `Contract ${money(m.contract)}` : "No accepted estimate yet",
    `costs ${money(m.costs)}${m.budget ? ` of a ${money(m.budget)} budget` : ""}`,
    m.profit !== null ? `profit ${money(m.profit)} (${m.margin}% margin)` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

async function projectText(ctx: MutationCtx, project: Doc<"projects">, headline?: string): Promise<ToolResult> {
  const client = project.clientId ? await ctx.db.get(project.clientId) : null;
  const m = await projectMoney(ctx, project);
  const latest = [...m.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const lines = [
    headline ?? "",
    `${project.name} · ${PROJECT_STATUS[project.status]}${clientName(client) ? ` · ${clientName(client)}` : ""}${
      project.startDate || project.endDate ? ` · ${[project.startDate, project.endDate].filter(Boolean).join(" to ")}` : ""
    }`,
    `${moneyLine(m)}.`,
    m.byType.length ? `Costs by type: ${m.byType.map(([type, amount]) => `${type} ${money(amount)}`).join(", ")}.` : "No costs logged yet.",
    ...latest.map((e) => `- ${e.date} ${e.description}: ${money(e.amount)} (${e.category}${e.vendor ? `, ${e.vendor}` : ""}, ${e.status === "paid" ? "paid" : "not paid yet"})`),
    m.estimates.length ? `Estimates: ${m.estimates.map((e) => `${e.estimateNumber} ${ESTIMATE_STATUS[e.status] ?? e.status} ${money(e.totalAmount)}`).join("; ")}.` : "",
    project.description ? `About the job: ${project.description}` : "",
    `Open it: ${app(`/projects/${project._id}`)}`,
  ];
  return {
    text: lines.filter(Boolean).join("\n"),
    data: {
      id: project._id,
      name: project.name,
      status: PROJECT_STATUS[project.status],
      client: clientName(client),
      startDate: project.startDate,
      endDate: project.endDate,
      budget: m.budget,
      contract: m.contract,
      costs: m.costs,
      profit: m.profit,
      margin: m.margin,
      costsByType: Object.fromEntries(m.byType),
      estimates: m.estimates.map((e) => ({ id: e._id, number: e.estimateNumber, status: e.status, total: e.totalAmount })),
      link: app(`/projects/${project._id}`),
    },
  };
}

// ---- Schemas ----

const priceBookLines = {
  type: "array",
  description: "Items from search_price_book. Each is priced at its cap unless you give a price, which must be between its red line and its cap.",
  items: {
    type: "object",
    properties: {
      line_item_id: { type: "string", description: "The item's id from search_price_book." },
      quantity: { type: "number", description: "How many of the item's unit (squares, sq ft, each, hours…). Default 1." },
      price: { type: "number", description: "Dollars per unit, only when the person asks for a different price." },
    },
    required: ["line_item_id"],
    additionalProperties: false,
  },
};
const customLines = {
  type: "array",
  description: "Lines that aren't in the price book. Use only when nothing in it fits, and say so to the person.",
  items: {
    type: "object",
    properties: {
      description: { type: "string" },
      quantity: { type: "number", description: "Default 1." },
      price: { type: "number", description: "Dollars per unit." },
    },
    required: ["description", "price"],
    additionalProperties: false,
  },
};
const contact = {
  type: "object",
  description: "The homeowner, when there's no client_id. Matched to an existing client by phone or email, else added as a new client.",
  properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, address: { type: "string" } },
  additionalProperties: false,
};

// ---- Tools ----

export const ESTIMATING_TOOLS: Tool[] = [
  {
    name: "search_price_book",
    title: "Search the price book",
    description:
      "Finds items in the company's price book (its own items first, then Tolliver's catalog) to price a job with. Each has a unit, a cap (the price that goes on an estimate) and a red line (the lowest it can go). Search with the words for the work, for example \"architectural shingles\", \"tear off\", \"interior wall paint\".",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words for the work or material." },
        trade: { type: "string", description: "Narrow to one trade, by name or slug, for example Roofing." },
        limit: { type: "number", description: "How many to return (default 12, at most 40)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const query = text(args, "query", { required: true, max: 200 })!;
      const trade = text(args, "trade", { max: 80 })?.toLowerCase();
      const limit = Math.min(Math.max(Math.round(number(args, "limit") ?? 12), 1), 40);
      const organization = (await ctx.db.get(connection.organizationId))!;
      const myTrades = new Set(organization.leadTrades ?? []);
      let tradeSlug: string | undefined;
      if (trade) {
        const industries = await ctx.db.query("industries").take(200);
        tradeSlug = industries.find((i) => i.slug.toLowerCase() === trade || i.name.toLowerCase() === trade)?.slug ?? trade;
      }
      const stem = (word: string) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
      const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1).map(stem);
      const rows = await listItemsDef.handler(ctx, { organizationId: connection.organizationId });
      const found = rows
        .filter((item) => !tradeSlug || item.cost_code?.industry_id === tradeSlug)
        .map((item) => {
          const hay = [item.name, item.description, item.cost_code?.name, item.cost_code?.code].filter(Boolean).join(" ").toLowerCase();
          const hits = words.filter((w) => hay.includes(w)).length;
          const own = item.organization_id !== undefined;
          const inTrade = item.cost_code?.industry_id !== undefined && myTrades.has(item.cost_code.industry_id);
          return { item, score: hits + (hits && own ? 0.5 : 0) + (hits && inTrade ? 0.25 : 0), own };
        })
        .filter((row) => row.score >= 1)
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
        .slice(0, limit);
      if (found.length === 0)
        return { text: `Nothing in the price book matches "${query}". Try other words, or use a custom line and tell the person it isn't from their price book.`, data: { items: [] } };
      const items = found.map(({ item, own }) => ({
        id: item._id,
        name: item.name,
        description: item.description,
        unit: item.unit,
        cap: capOf(item),
        redLine: floorOf(item),
        costCode: item.cost_code ? `${item.cost_code.code} ${item.cost_code.name}` : undefined,
        trade: item.cost_code?.industry_id,
        source: own ? "company" : "tolliver",
      }));
      return {
        text: [
          `${items.length} item(s) for "${query}" (cap is the price on the estimate, red line the lowest it can go):`,
          ...items.map(
            (i) =>
              `- ${i.name}: ${money(i.cap)} per ${i.unit} (red line ${money(i.redLine)})${i.costCode ? ` · ${i.costCode}` : ""} · ${i.source === "company" ? "the company's item" : "Tolliver catalog"} · id ${i.id}`,
          ),
        ].join("\n"),
        data: { items },
      };
    },
  },
  {
    name: "list_estimates",
    title: "List estimates",
    description: "The company's estimates, newest first: number, title, client, total and status. Filter by status or search words.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: Object.keys(ESTIMATE_STATUS) },
        search: { type: "string", description: "Number, title or client name." },
        limit: { type: "number", description: "How many to return (default 20, at most 100)." },
      },
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const status = text(args, "status") as Doc<"estimates">["status"] | undefined;
      if (status && !(status in ESTIMATE_STATUS)) fail("INVALID", `status must be one of: ${Object.keys(ESTIMATE_STATUS).join(", ")}`);
      const search = text(args, "search", { max: 200 })?.toLowerCase();
      const limit = Math.min(Math.max(Math.round(number(args, "limit") ?? 20), 1), 100);
      const estimates = await listEstimatesDef.handler(ctx, { organizationId: connection.organizationId, status });
      const clients = new Map<string, Doc<"clients"> | null>();
      const rows = [];
      for (const e of estimates) {
        if (e.clientId && !clients.has(e.clientId)) clients.set(e.clientId, await ctx.db.get(e.clientId));
        const client = clientName(e.clientId ? clients.get(e.clientId) : null);
        if (search && ![e.estimateNumber, e.title, client].some((v) => v?.toLowerCase().includes(search))) continue;
        rows.push({
          id: e._id,
          number: e.estimateNumber,
          title: e.title,
          client,
          total: e.totalAmount,
          status: e.status,
          link: app(`/estimates/${e._id}`),
        });
        if (rows.length === limit) break;
      }
      if (rows.length === 0) return { text: "No estimates match.", data: { estimates: [] } };
      return {
        text: rows
          .map((r) => `- ${r.number}${r.title ? ` · ${r.title}` : ""}${r.client ? ` · ${r.client}` : ""} · ${money(r.total)} · ${ESTIMATE_STATUS[r.status] ?? r.status} · id ${r.id}`)
          .join("\n"),
        data: { estimates: rows },
      };
    },
  },
  {
    name: "get_estimate",
    title: "Read an estimate",
    description: "One estimate's lines (with each line's red line and cap), its total, the lowest it can go, its status, notes and link.",
    inputSchema: {
      type: "object",
      properties: { estimate_id: { type: "string", description: "From list_estimates or create_estimate." } },
      required: ["estimate_id"],
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const estimate = await own(ctx, connection, "estimates", text(args, "estimate_id", { required: true }), "estimate");
      const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
      return estimateText(estimate, "", clientName(client));
    },
  },
  {
    name: "create_estimate",
    title: "Draft an estimate",
    description:
      "Drafts an estimate from price book items (search_price_book first) for the job the person described or showed in photos. Prices come from the price book: each line is the item's cap unless a price is given, never below its red line. It stays a draft: the person reviews it and sends it from Tolliver. Put the scope and what you saw in the photos in notes, with any measurements you assumed.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The job in a few words, for example \"Re-roof, architectural shingles\"." },
        lines: priceBookLines,
        custom_lines: customLines,
        client_id: { type: "string", description: "An existing client's id." },
        client: contact,
        lead_id: { type: "string", description: "The lead this estimate is for (from list_my_leads). Its contact becomes the client when none is given." },
        project_id: { type: "string", description: "A project to file it under (from list_projects)." },
        notes: { type: "string", description: "Scope, what the photos show, measurements and assumptions." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const title = text(args, "title", { required: true, max: 200 })!;
      const lead = args.lead_id ? await own(ctx, connection, "leads", text(args, "lead_id"), "lead") : null;
      const contactArgs =
        (args.client as Args | undefined) ?? (lead ? { name: lead.name, phone: lead.phone, email: lead.email, address: lead.address } : undefined);
      const items = await priceLines(ctx, connection, args, "lines", "custom_lines");
      if (items.length === 0) fail("INVALID", "Add at least one line (search_price_book for items)");
      const project = args.project_id ? await own(ctx, connection, "projects", text(args, "project_id"), "project") : null;
      const client = await clientFor(ctx, connection, text(args, "client_id"), contactArgs);
      const estimate = (await createEstimateDef.handler(ctx, {
        organizationId: connection.organizationId,
        data: { title, items, notes: text(args, "notes", { max: 5000 }), clientId: client?._id, projectId: project?._id },
      }))!;
      if (lead) await updateLeadDef.handler(ctx, { id: lead._id, data: { estimateId: estimate._id } });
      return estimateText(estimate, `Drafted ${estimate.estimateNumber}${lead ? ` for the lead ${lead.name}` : ""}.`, clientName(client));
    },
  },
  {
    name: "update_estimate",
    title: "Change a draft estimate",
    description:
      "Changes a draft: add lines (from the price book or custom), remove lines, change a line's quantity or price (between its red line and cap), or the title and notes. Line ids come from get_estimate. An estimate already sent or signed is changed in Tolliver instead.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        add_lines: priceBookLines,
        add_custom_lines: customLines,
        remove_lines: { type: "array", items: { type: "string" }, description: "Line ids to take off." },
        change_lines: {
          type: "array",
          description: "Lines to change, by line id.",
          items: {
            type: "object",
            properties: { line_id: { type: "string" }, quantity: { type: "number" }, price: { type: "number", description: "Dollars per unit." } },
            required: ["line_id"],
            additionalProperties: false,
          },
        },
        title: { type: "string" },
        notes: { type: "string", description: "Replaces the notes." },
      },
      required: ["estimate_id"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const estimate = await own(ctx, connection, "estimates", text(args, "estimate_id", { required: true }), "estimate");
      if (estimate.status !== "draft" || estimate.contractLockedAt)
        fail("INVALID", `${estimate.estimateNumber} has been ${ESTIMATE_STATUS[estimate.status]?.toLowerCase() ?? estimate.status}, so change it in Tolliver: ${app(`/estimates/${estimate._id}`)}`);
      const removeArg = args.remove_lines ?? [];
      if (!Array.isArray(removeArg) || removeArg.some((x) => typeof x !== "string")) fail("INVALID", "remove_lines must be a list of line ids");
      const remove = new Set(removeArg as string[]);
      for (const lineId of remove) if (!estimate.items.some((i) => i._id === lineId)) fail("NOT_FOUND", `No line ${lineId} on ${estimate.estimateNumber}`);
      const items: Array<Partial<Item>> = estimate.items.filter((i) => !remove.has(i._id)).map((i) => ({ ...i }));
      for (const change of list(args, "change_lines")) {
        const lineId = text(change, "line_id", { required: true })!;
        const item = items.find((i) => i._id === lineId);
        if (!item) fail("NOT_FOUND", `No line ${lineId} on ${estimate.estimateNumber}`);
        const quantity = number(change, "quantity");
        if (quantity !== undefined) {
          if (quantity <= 0) fail("INVALID", "quantity must be more than 0");
          item.quantity = quantity;
        }
        const price = number(change, "price");
        if (price !== undefined) {
          checkPrice(item.description!, "unit", price, item.redLinePrice, item.capPrice);
          item.unitPrice = price;
        }
      }
      items.push(...(await priceLines(ctx, connection, args, "add_lines", "add_custom_lines")));
      if (items.length === 0) fail("INVALID", "An estimate needs at least one line");
      const updated = (await updateEstimateDef.handler(ctx, {
        id: estimate._id,
        data: { items, ...(args.title !== undefined ? { title: text(args, "title", { max: 200 }) } : {}), ...(args.notes !== undefined ? { notes: text(args, "notes", { max: 5000 }) } : {}) },
      }))!;
      const client = updated.clientId ? await ctx.db.get(updated.clientId) : null;
      return estimateText(updated, `Updated ${updated.estimateNumber}.`, clientName(client));
    },
  },
  {
    name: "send_estimate",
    title: "Email an estimate to the client",
    description:
      "Emails the estimate to its client from the company, with the link where they view, accept and sign it, and marks it sent. Only when the person asks you to send it: first tell them who it goes to (name and email) and the total, and call this with confirm: true once they say yes. It can't be unsent. Needs an email on the client; otherwise give the person the link (get_estimate) to send themselves.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        confirm: { type: "boolean", description: "true once the person has said to send it to that client." },
        message: { type: "string", description: "A short personal note from the person to put above the link, in their words." },
      },
      required: ["estimate_id", "confirm"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    openWorld: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const estimate = await own(ctx, connection, "estimates", text(args, "estimate_id", { required: true }), "estimate");
      const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
      if (args.confirm !== true)
        return {
          text: `Not sent. Ask the person to confirm: ${estimate.estimateNumber} for ${money(estimate.totalAmount)} to ${clientName(client) ?? "the client"}${client?.email ? ` at ${client.email}` : " (no email on file)"}. Then call again with confirm: true.`,
        };
      const sent = await emailEstimateDef.handler(ctx, { id: estimate._id, message: text(args, "message", { max: 1000 }) });
      return {
        text: `Emailed ${estimate.estimateNumber} (${money(estimate.totalAmount)}) to ${clientName(client) ?? "the client"} at ${sent.to}, from the company, with the link to sign. Replies go to the company. Their link: ${sent.link}. Tolliver follows up if they don't sign.`,
        data: { to: sent.to, link: sent.link },
      };
    },
  },
  {
    name: "add_price_book_item",
    title: "Add an item to the price book",
    description:
      "Adds an item to the company's own price book, for work or materials it prices often, so estimates can use it. Only an owner or admin of the company can. Confirm the name, unit, cap (the price that goes on an estimate) and red line (the lowest it can go) with the person first. cost_code is a code from search_price_book results, for example RF500.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "For example \"Ridge vent, shingle-over\"." },
        unit: { type: "string", description: "What it's priced per: each, sq ft, linear ft, square, hour…" },
        cap: { type: "number", description: "The price that goes on an estimate." },
        red_line: { type: "number", description: "The lowest it can go. At most the cap." },
        cost_code: { type: "string", description: "The cost code it files under, for example RF500 (Roofing Materials)." },
        description: { type: "string" },
      },
      required: ["name", "unit", "cap", "red_line", "cost_code"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const name = text(args, "name", { required: true, max: 200 })!;
      const unit = text(args, "unit", { required: true, max: 40 })!;
      const cap = number(args, "cap", { required: true })!;
      const redLine = number(args, "red_line", { required: true })!;
      if (redLine > cap) fail("INVALID", "The red line can't be above the cap");
      try {
        await requireMember(ctx, connection.organizationId, "admin");
      } catch {
        fail("FORBIDDEN", "Only an owner or admin of the company can add price book items. Ask one of them, or add it in Tolliver as an admin.");
      }
      const code = text(args, "cost_code", { required: true, max: 20 })!.toUpperCase().replace(/\s+/g, "");
      const codes = [
        ...(await ctx.db.query("costCodes").withIndex("by_organization", (q) => q.eq("organization_id", connection.organizationId)).take(500)),
        ...(await ctx.db.query("costCodes").withIndex("by_organization", (q) => q.eq("organization_id", undefined)).take(2000)),
      ];
      const costCode = codes.find((c) => c.code.toUpperCase().replace(/\s+/g, "") === code);
      if (!costCode) fail("INVALID", `No cost code ${code}. Use one shown by search_price_book, for example RF500.`);
      const item = await createItemDef.handler(ctx, {
        data: {
          organization_id: connection.organizationId,
          name,
          unit,
          description: text(args, "description", { max: 1000 }),
          red_line_price: redLine,
          cap_price: cap,
          cost_code_id: costCode._id,
        },
      });
      return {
        text: `Added "${name}" to the price book: ${money(cap)} per ${unit} (red line ${money(redLine)}) under ${costCode.code} ${costCode.name}. id ${item._id}. It's ready to use on estimates: ${app("/price-book/items")}`,
        data: { id: item._id },
      };
    },
  },
  {
    name: "list_projects",
    title: "List projects",
    description: "The company's jobs: status, client, dates, and each one's contract, costs, profit and margin.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: Object.keys(PROJECT_STATUS) },
        limit: { type: "number", description: "How many to return (default 20, at most 100)." },
      },
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const status = text(args, "status");
      if (status && !(status in PROJECT_STATUS)) fail("INVALID", `status must be one of: ${Object.keys(PROJECT_STATUS).join(", ")}`);
      const limit = Math.min(Math.max(Math.round(number(args, "limit") ?? 20), 1), 100);
      const projects = (
        await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) => q.eq("organizationId", connection.organizationId))
          .order("desc")
          .take(2000)
      )
        .filter((p) => !status || p.status === status)
        .slice(0, limit);
      if (projects.length === 0) return { text: "No projects yet.", data: { projects: [] } };
      const rows = [];
      const lines = [];
      for (const p of projects) {
        const m = await projectMoney(ctx, p);
        const client = clientName(p.clientId ? await ctx.db.get(p.clientId) : null);
        const status = PROJECT_STATUS[p.status];
        rows.push({ id: p._id, name: p.name, status, client, contract: m.contract, costs: m.costs, profit: m.profit, margin: m.margin, link: app(`/projects/${p._id}`) });
        lines.push(`- ${p.name} · ${status}${client ? ` · ${client}` : ""} · ${moneyLine(m)} · id ${p._id}`);
      }
      return { text: lines.join("\n"), data: { projects: rows } };
    },
  },
  {
    name: "get_project",
    title: "Read a project",
    description: "One job: its contract (accepted estimates), costs by type, the latest costs, profit and margin, budget, estimates and dates.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string", description: "From list_projects." } },
      required: ["project_id"],
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => projectText(ctx, await own(ctx, connection, "projects", text(args, "project_id", { required: true }), "project")),
  },
  {
    name: "create_project",
    title: "Start a project",
    description: "Starts a job, optionally from an estimate (its client carries over and the estimate is filed under the project), with a budget and dates.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        estimate_id: { type: "string" },
        client_id: { type: "string" },
        client: contact,
        budget: { type: "number", description: "What the job should cost the company, in dollars." },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        description: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const day = (key: string) => {
        const value = text(args, key, { max: 10 });
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("INVALID", `${key} must be YYYY-MM-DD`);
        return value;
      };
      const estimate = args.estimate_id ? await own(ctx, connection, "estimates", text(args, "estimate_id"), "estimate") : null;
      const client =
        (await clientFor(ctx, connection, text(args, "client_id"), args.client as Args | undefined)) ?? (estimate?.clientId ? await ctx.db.get(estimate.clientId) : null);
      const project = (await createProjectDef.handler(ctx, {
        organizationId: connection.organizationId,
        data: {
          name: text(args, "name", { required: true, max: 200 }),
          status: "planning",
          clientId: client?._id,
          budget: number(args, "budget"),
          startDate: day("start_date"),
          endDate: day("end_date"),
          description: text(args, "description", { max: 5000 }),
        },
      }))!;
      if (estimate) await updateEstimateDef.handler(ctx, { id: estimate._id, data: { projectId: project._id } });
      return projectText(ctx, project, `Started the project ${project.name}.`);
    },
  },
  {
    name: "add_cost",
    title: "Log a job cost",
    description:
      "Logs a cost on a project, for example from a receipt the person shares: what it was, the amount, its type, the vendor and the date. Then shows the job's costs and profit.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "From list_projects." },
        description: { type: "string", description: "What was paid for." },
        amount: { type: "number", description: "Dollars." },
        category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
        vendor: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD; today if left out." },
        paid: { type: "boolean", description: "Already paid (default true for a receipt)." },
      },
      required: ["project_id", "description", "amount"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const project = await own(ctx, connection, "projects", text(args, "project_id", { required: true }), "project");
      const category = text(args, "category") ?? "Other";
      if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) fail("INVALID", `category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`);
      const date = text(args, "date", { max: 10 });
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("INVALID", "date must be YYYY-MM-DD");
      const amount = number(args, "amount", { required: true })!;
      const description = text(args, "description", { required: true, max: 300 })!;
      await createExpenseDef.handler(ctx, {
        organizationId: connection.organizationId,
        data: { projectId: project._id, description, amount, category, vendor: text(args, "vendor", { max: 200 }), date, status: args.paid === false ? "pending" : "paid" },
      });
      return projectText(ctx, project, `Logged ${money(amount)} for ${description} on ${project.name}.`);
    },
  },
];
