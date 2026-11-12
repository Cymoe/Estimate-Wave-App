import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { markOrderedDef } from "../purchaseOrders";
import { fail, getOwned } from "./access";
import { TOOLS, app, num, type Connection, type Tool, type ToolResult } from "./mcpTools";
import { centralDay } from "./oauth";
import { usMobile } from "./phone";
import { orderTotal } from "./purchaseOrders";

// The office line's tools (convex/agent.ts): the connector's tools, less
// ChatGPT's search/fetch, plus what an agent working for the owner needs:
// what needs them today, a memory, and purchase orders.
//
// Anything that reaches someone outside the company, spends, or can't be
// taken back only runs after the owner's YES (needsAsk).

type Args = Record<string, unknown>;

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "Nov 5" from a YYYY-MM-DD or ISO date. */
export function shortDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** YYYY-MM-DD, `days` after `day`. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

async function activeProjects(ctx: MutationCtx, organizationId: Id<"organizations">) {
  return (await ctx.db.query("projects").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(500)).filter(
    (p) => p.status === "planning" || p.status === "in_progress",
  );
}

async function clientName(ctx: MutationCtx, id: Id<"clients"> | undefined): Promise<string | undefined> {
  if (!id) return undefined;
  return (await ctx.db.get(id))?.name;
}

/**
 * What needs the owner today, by kind. Shared by the business_snapshot tool
 * and the morning brief; `count` is 0 when nothing does.
 */
export async function snapshot(ctx: MutationCtx, organizationId: Id<"organizations">, now = Date.now()): Promise<{ text: string; count: number }> {
  const today = centralDay(now);
  const sections: Array<[string, string[]]> = [];

  // Leads
  const leads = (
    await ctx.db
      .query("leads")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(400)
  ).filter((l) => !l.isSample);
  const untouched = leads.filter((l) => l.status === "new" && !l.lastContactAt && now - Date.parse(l.createdAt) > 15 * 60_000);
  sections.push([
    "New leads nobody has called",
    untouched.slice(0, 6).map((l) => `${l.name}${l.city ? ` (${l.city})` : ""}, in ${ago(l.createdAt, now)} ago · lead ${l._id}`),
  ]);
  const followUps = leads.filter((l) => l.followUpDate && l.followUpDate.slice(0, 10) <= today && l.status !== "won" && l.status !== "lost");
  sections.push(["Follow-ups due", followUps.slice(0, 6).map((l) => `${l.name}, due ${shortDay(l.followUpDate!)} · lead ${l._id}`)]);
  const visits = leads.filter((l) => l.appointmentAt && centralDay(Date.parse(l.appointmentAt)) === today);
  sections.push([
    "Estimate visits today",
    visits.map(
      (l) =>
        `${new Date(l.appointmentAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} ${l.name}${l.address ? `, ${l.address}` : ""}`,
    ),
  ]);

  // Estimates out with the client
  const estimates = await ctx.db
    .query("estimates")
    .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", organizationId))
    .order("desc")
    .take(200);
  const waiting: string[] = [];
  for (const e of estimates) {
    if (e.signedAt || e.approvedAt) continue;
    const label = `${e.title || `Estimate ${e.estimateNumber}`} for ${(await clientName(ctx, e.clientId)) ?? "a client"} (${money(e.totalAmount)})`;
    if (e.status === "opened" && e.firstOpenedAt && now - Date.parse(e.firstOpenedAt) > 24 * 3_600_000)
      waiting.push(`${label}: opened ${ago(e.firstOpenedAt, now)} ago, not signed · estimate ${e._id}`);
    else if (e.status === "sent" && e.sentAt && now - Date.parse(e.sentAt) > 3 * 24 * 3_600_000)
      waiting.push(`${label}: sent ${ago(e.sentAt, now)} ago, not opened · estimate ${e._id}`);
  }
  sections.push(["Estimates waiting on the client", waiting.slice(0, 6)]);

  // Jobs
  const projects = await activeProjects(ctx, organizationId);
  const soon = addDays(today, 3);
  const orders: string[] = [];
  const picks: string[] = [];
  for (const p of projects.slice(0, 60)) {
    for (const po of await ctx.db.query("purchaseOrders").withIndex("by_project", (q) => q.eq("projectId", p._id)).collect()) {
      if (po.status === "draft" && po.lines.length > 0 && po.neededBy && po.neededBy <= soon)
        orders.push(`${po.number} ${po.title} for ${p.name} (${money(orderTotal(po.lines))}), needed ${shortDay(po.neededBy)}, not ordered · po ${po._id}`);
    }
    for (const e of await ctx.db.query("estimates").withIndex("by_project", (q) => q.eq("projectId", p._id)).collect()) {
      const picked = (await ctx.db.query("selections").withIndex("by_estimate", (q) => q.eq("estimateId", e._id)).collect()).filter(
        (s) => s.status === "picked",
      );
      if (picked.length) picks.push(`${p.name}: ${picked.length} client pick${picked.length === 1 ? "" : "s"} to approve`);
    }
  }
  sections.push(["Purchase orders to send", orders.slice(0, 6)]);
  sections.push(["Selections to approve", picks.slice(0, 6)]);

  const tasks = (
    await ctx.db
      .query("projectTasks")
      .withIndex("by_organization_and_start", (q) => q.eq("organizationId", organizationId).gte("startDate", addDays(today, -60)).lte("startDate", today))
      .take(300)
  ).filter((t) => !t.doneAt && !t.warrantyRequest && (t.endDate ?? t.startDate!) >= today);
  const projectNames = new Map(projects.map((p) => [p._id as string, p.name]));
  const projectName = async (id: Id<"projects">) => projectNames.get(id) ?? (await ctx.db.get(id))?.name ?? "a job";
  const taskLines: string[] = [];
  for (const t of tasks.slice(0, 8)) taskLines.push(`${t.title} (${await projectName(t.projectId)})`);
  sections.push(["On the schedule today", taskLines]);

  const warranty: string[] = [];
  for (const p of (await ctx.db.query("projects").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(500)).filter(
    (p) => p.status === "completed",
  )) {
    for (const t of await ctx.db.query("projectTasks").withIndex("by_project", (q) => q.eq("projectId", p._id)).collect())
      if (t.warrantyRequest && !t.doneAt) warranty.push(`${p.name}: "${t.warrantyRequest.note.slice(0, 120)}", asked ${ago(t.warrantyRequest.requestedAt, now)} ago`);
  }
  sections.push(["Warranty requests open", warranty.slice(0, 6)]);

  const filled = sections.filter(([, lines]) => lines.length > 0);
  const count = filled.reduce((n, [, lines]) => n + lines.length, 0);
  if (count === 0) return { text: "Nothing needs the owner right now: no new leads waiting, nothing to chase, nothing due.", count };
  return { text: filled.map(([title, lines]) => `${title}:\n${lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n"), count };
}

async function ownPo(ctx: MutationCtx, connection: Connection, args: Args): Promise<Doc<"purchaseOrders">> {
  const raw = typeof args.purchase_order_id === "string" ? args.purchase_order_id.trim() : "";
  const id = raw ? ctx.db.normalizeId("purchaseOrders", raw) : null;
  const po = id ? await ctx.db.get(id) : null;
  if (!po || po.organizationId !== connection.organizationId) fail("NOT_FOUND", `No purchase order with id ${raw || "(none given)"}`);
  return po;
}

const OFFICE_TOOLS: Tool[] = [
  {
    name: "business_snapshot",
    title: "What needs me today",
    description:
      "What needs the owner today: new leads nobody has called, follow-ups due, estimate visits, estimates opened but not signed, purchase orders needed soon and not sent, client selections to approve, today's tasks and open warranty requests. Start here for 'what's going on' questions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection) => {
      const { text, count } = await snapshot(ctx, connection.organizationId);
      return { text, data: { count } };
    },
  },
  {
    name: "remember",
    title: "Remember",
    description:
      "Saves a standing fact or preference the owner told you (their usual suppliers, how they like estimates worded, who their crew lead is), so you know it next time. Keep each note short.",
    inputSchema: {
      type: "object",
      properties: {
        note: { type: "string", description: "The fact, in one line." },
        replace_all: { type: "boolean", description: "Replace everything remembered with this note (only when the owner asks to forget the rest)." },
      },
      required: ["note"],
      additionalProperties: false,
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const note = typeof args.note === "string" ? args.note.trim().slice(0, 400) : "";
      if (!note) fail("INVALID", "note is required");
      const org = (await ctx.db.get(connection.organizationId))!;
      const line = org.officeLine;
      if (!line) fail("INVALID", "The office line is off");
      const all = args.replace_all === true ? note : [line.notes, note].filter(Boolean).join("\n");
      // Newest notes are kept when it's full.
      await ctx.db.patch(org._id, { officeLine: { ...line, notes: all.slice(-2000) } });
      return { text: `Remembered: ${note}` };
    },
  },
  {
    name: "cancel_ask",
    title: "Drop a waiting ask",
    description: "Drops an ask that's waiting on the owner's YES (when they change their mind or you saved the wrong one).",
    inputSchema: { type: "object", properties: { number: { type: "number", description: "The ask's number (#N)." } }, required: ["number"], additionalProperties: false },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args) => {
      const n = num(args, "number", { required: true })!;
      const ask = (
        await ctx.db
          .query("agentAsks")
          .withIndex("by_org_status", (q) => q.eq("organizationId", connection.organizationId).eq("status", "pending"))
          .collect()
      ).find((a) => a.number === n);
      if (!ask) fail("NOT_FOUND", `No ask #${n} is waiting`);
      await ctx.db.patch(ask._id, { status: "declined", answeredAt: new Date().toISOString() });
      return { text: `Dropped ask #${n}.` };
    },
  },
  {
    name: "list_purchase_orders",
    title: "Purchase orders",
    description:
      "Purchase orders on one job, or on all active jobs (planning or in progress): number, who it's for, status, total, when it's needed, and its id for send_purchase_order.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "One job's id, from list_projects. Leave out for all active jobs." },
        status: { type: "string", enum: ["draft", "ordered", "received", "cancelled"] },
      },
      additionalProperties: false,
    },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection, args) => {
      let projects: Doc<"projects">[];
      if (typeof args.project_id === "string" && args.project_id) {
        const id = ctx.db.normalizeId("projects", args.project_id);
        if (!id) fail("NOT_FOUND", `No job with id ${args.project_id}`);
        const { doc } = await getOwned(ctx, "projects", id);
        if (doc.organizationId !== connection.organizationId) fail("NOT_FOUND", "Not found");
        projects = [doc];
      } else projects = await activeProjects(ctx, connection.organizationId);
      const rows: string[] = [];
      for (const p of projects.slice(0, 60)) {
        for (const po of await ctx.db.query("purchaseOrders").withIndex("by_project", (q) => q.eq("projectId", p._id)).collect()) {
          if (args.status ? po.status !== args.status : po.status === "cancelled") continue;
          rows.push(
            [
              `${po.number} · ${po.title}${po.vendor?.name ? ` (${po.vendor.name})` : ""} · ${p.name}`,
              po.status,
              money(orderTotal(po.lines)),
              po.neededBy ? `needed ${shortDay(po.neededBy)}` : undefined,
              po.vendor?.phone ? "vendor phone on file" : "no vendor phone",
              `id ${po._id}`,
            ]
              .filter(Boolean)
              .join(" · "),
          );
        }
      }
      return { text: rows.length ? rows.join("\n") : "No purchase orders there.", data: { count: rows.length } };
    },
  },
  {
    name: "send_purchase_order",
    title: "Send a purchase order",
    description:
      "Marks a purchase order Ordered and texts the vendor its link (or gives the owner the link to forward when no vendor phone is on file). Reaches the vendor, so it waits for the owner's YES.",
    inputSchema: {
      type: "object",
      properties: { purchase_order_id: { type: "string", description: "From list_purchase_orders or business_snapshot." } },
      required: ["purchase_order_id"],
      additionalProperties: false,
    },
    readOnly: false,
    openWorld: true,
    scope: "leads",
    run: async (ctx, connection, args): Promise<ToolResult> => {
      const po = await ownPo(ctx, connection, args);
      const token = await markOrderedDef.handler(ctx, { id: po._id });
      const url = app(`/po/${token}`);
      const company = (await ctx.db.get(connection.organizationId))?.name ?? "Your customer";
      const to = usMobile(po.vendor?.phone);
      if (to) {
        await ctx.scheduler.runAfter(0, internal.agent.textOut, {
          organizationId: connection.organizationId,
          to,
          text: `${company} purchase order ${po.number}${po.neededBy ? `, needed ${shortDay(po.neededBy)}` : ""}: ${url}`,
        });
        return { text: `${po.number} is ordered and its link was texted to ${po.vendor!.name}: ${url}`, data: { url } };
      }
      return { text: `${po.number} is ordered. No vendor phone on file, so forward this link to them: ${url}`, data: { url } };
    },
  },
];

/** What the office line can use: the connector's tools (not ChatGPT's search/fetch) and its own. */
export const AGENT_TOOLS: Tool[] = [...TOOLS.filter((t) => t.name !== "search" && t.name !== "fetch"), ...OFFICE_TOOLS];

export const findAgentTool = (name: string): Tool | undefined => AGENT_TOOLS.find((t) => t.name === name);

/** Reaches someone outside, spends, or can't be taken back: saved as an ask until the owner says YES. */
export const needsAsk = (tool: Tool): boolean => Boolean(tool.openWorld || tool.destructive || tool.scope === "spend");

/** Claude's tool list: the gated tools also take what YES will do, in words. */
export function claudeTools(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return AGENT_TOOLS.map((t) => {
    const schema = t.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    if (!needsAsk(t)) return { name: t.name, description: t.description, input_schema: t.inputSchema };
    return {
      name: t.name,
      description: `${t.description} Waits for the owner's YES.`,
      input_schema: {
        ...t.inputSchema,
        properties: {
          ...(schema.properties ?? {}),
          ask_summary: { type: "string", description: "What YES will do, in plain words, e.g. \"Text PO-0003 ($4,200) to Midland Cabinet\"." },
        },
        required: [...(schema.required ?? []), "ask_summary"],
      },
    };
  });
}
