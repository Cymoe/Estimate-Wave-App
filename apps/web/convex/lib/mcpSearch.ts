import type { Doc } from "../_generated/dataModel";
import { siteUrl } from "../delivery";
import { fail, requireMember } from "./access";
import type { Tool } from "./mcpTools";

// search and fetch, in the shape ChatGPT's deep research and company
// knowledge call for: search returns ids, titles and links; fetch returns
// one by id. Both answer as JSON text. They cover the company's leads,
// estimates, projects and clients, and reuse the get_* tools for detail.

type Kind = "lead" | "estimate" | "project" | "client";
const DETAIL: Record<Kind, { tool: string; arg: string }> = {
  lead: { tool: "get_lead", arg: "lead_id" },
  estimate: { tool: "get_estimate", arg: "estimate_id" },
  project: { tool: "get_project", arg: "project_id" },
  client: { tool: "", arg: "" },
};
const PATH: Record<Kind, (id: string) => string> = {
  lead: (id) => `/leads?lead=${id}`,
  estimate: (id) => `/estimates/${id}`,
  project: (id) => `/projects/${id}`,
  client: (id) => `/clients/${id}`,
};

const json = (data: unknown) => ({ text: JSON.stringify(data), data });

export function searchTools(byName: (name: string) => Tool | undefined): Tool[] {
  return [
    {
      name: "search",
      title: "Search the company's records",
      description:
        "Searches the company's leads, estimates, projects and clients by name, address, number or words in them. Returns ids to pass to fetch.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
      readOnly: true,
      scope: "leads",
      run: async (ctx, connection, args) => {
        await requireMember(ctx, connection.organizationId);
        const query = typeof args.query === "string" ? args.query.trim().toLowerCase().slice(0, 200) : "";
        const words = query.split(/\s+/).filter(Boolean);
        const matches = (...fields: Array<string | undefined>) => {
          const hay = fields.filter(Boolean).join(" ").toLowerCase();
          return words.length > 0 && words.every((w) => hay.includes(w));
        };
        const org = connection.organizationId;
        const [leads, estimates, projects, clients] = await Promise.all([
          ctx.db.query("leads").withIndex("by_organization", (q) => q.eq("organizationId", org)).take(2000),
          ctx.db.query("estimates").withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", org)).order("desc").take(2000),
          ctx.db.query("projects").withIndex("by_organization", (q) => q.eq("organizationId", org)).take(1000),
          ctx.db.query("clients").withIndex("by_organization", (q) => q.eq("organizationId", org)).take(2000),
        ]);
        const names = new Map(clients.map((c) => [c._id as string, c.companyName || c.name]));
        const result = (kind: Kind, id: string, title: string) => ({ id: `${kind}:${id}`, title, url: `${siteUrl()}${PATH[kind](id)}` });
        const results = [
          ...leads
            .filter((l: Doc<"leads">) => matches(l.name, l.address, l.city, l.jobType, l.notes, l.phone, l.email))
            .map((l) => result("lead", l._id, `Lead: ${l.name}${l.city ? `, ${l.city}` : ""}`)),
          ...estimates
            .filter((e) => matches(e.estimateNumber, e.title, e.notes, e.clientId ? names.get(e.clientId) : undefined))
            .map((e) => result("estimate", e._id, `Estimate ${e.estimateNumber}${e.title ? `: ${e.title}` : ""}`)),
          ...projects
            .filter((p) => matches(p.name, p.description, p.clientId ? names.get(p.clientId) : undefined))
            .map((p) => result("project", p._id, `Project: ${p.name}`)),
          ...clients
            .filter((c) => matches(c.name, c.companyName, c.email, c.phone, c.address, c.city))
            .map((c) => result("client", c._id, `Client: ${c.companyName || c.name}`)),
        ].slice(0, 20);
        return json({ results });
      },
    },
    {
      name: "fetch",
      title: "Open a record",
      description: "Everything on one lead, estimate, project or client, by an id from search (for example estimate:abc123).",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      readOnly: true,
      scope: "leads",
      run: async (ctx, connection, args) => {
        const [given, raw] = typeof args.id === "string" ? args.id.split(":", 2) : ["", ""];
        if (!(given in DETAIL) || !raw) fail("INVALID", "Use an id from search, like estimate:abc123");
        const kind = given as Kind;
        let title: string;
        let text: string;
        if (kind === "client") {
          await requireMember(ctx, connection.organizationId);
          const id = ctx.db.normalizeId("clients", raw);
          const client = id ? await ctx.db.get(id) : null;
          if (!client || client.organizationId !== connection.organizationId) fail("NOT_FOUND", `No client with id ${raw}`);
          title = client.companyName || client.name;
          text = [title, client.email, client.phone, [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ")].filter(Boolean).join("\n");
        } else {
          const detail = await byName(DETAIL[kind].tool)!.run(ctx, connection, { [DETAIL[kind].arg]: raw });
          text = detail.text;
          title = text.split("\n")[0];
        }
        return json({ id: `${kind}:${raw}`, title, text, url: `${siteUrl()}${PATH[kind](raw)}`, metadata: { type: kind } });
      },
    },
  ];
}
