import type { MutationCtx } from "../_generated/server";
import { siteUrl } from "../delivery";
import { buildRows, createDef, listsDef } from "../outreach";
import { DEFINITION_SCHEMA, WHO_GUIDE, WHO_LABEL, definitionFromArgs, shortMoney } from "./outreach";
import { fail } from "./access";
import type { Connection, Tool, ToolResult } from "./mcpTools";
import { planIsActive } from "./plan";

// Not from mcpTools: this file loads while mcpTools is still loading.
const app = (path: string) => `${siteUrl()}${path}`;

// The connector's Outreach tools: "pull me a list of shopping center owners"
// from the office line or Claude. The calling model reads the who guide in
// the description and sends a definition itself, so no second model call is
// needed; the list is built from the owners table and saved like one made
// on the Outreach page.

type Args = Record<string, unknown>;

const locked = (): ToolResult => ({
  text: `Outreach lists are part of the Pro plan. Start it at ${app("/plan")}.`,
  data: { locked: true },
});

async function pro(ctx: MutationCtx, connection: Connection): Promise<boolean> {
  const organization = await ctx.db.get(connection.organizationId);
  return Boolean(organization?.plan && planIsActive(organization.plan, Date.now()));
}

const mailLine = (m: { address?: string; city?: string; state?: string; zip?: string }) =>
  [m.address, [m.city, m.state].filter(Boolean).join(", "), m.zip?.slice(0, 5)].filter(Boolean).join(", ");

export const OUTREACH_TOOLS: Tool[] = [
  {
    name: "pull_outreach_list",
    title: "Pull an outreach list",
    description: `Builds a mailing list from the Midland County appraisal roll (names, mailing addresses, properties, values; never phone numbers) and saves it on the company's Outreach page. Use for "pull me a list of…", "who owns…", "get me shopping center owners / investors / property managers / wealthy homeowners". Only Midland County, Texas exists; anything about a person's job, income, age or anything not on the roll can't be done, so say so and offer the closest list (usually wealthy homeowners by value, or commercial owners).\n${WHO_GUIDE}`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["who"],
      properties: {
        ...DEFINITION_SCHEMA.properties,
        title: { type: "string", description: "A name for the list, 50 characters or fewer. Left out, one is made from the ask." },
        save: { type: "boolean", description: "False to only count and sample without saving. Default true." },
      },
    },
    readOnly: false,
    scope: "leads",
    run: async (ctx, connection, args: Args) => {
      if (!(await pro(ctx, connection))) return locked();
      let definition;
      try {
        definition = definitionFromArgs(args);
      } catch (e) {
        fail("INVALID", e instanceof Error ? e.message : String(e));
      }
      const title = typeof args.title === "string" ? args.title.trim().slice(0, 50) : undefined;
      const save = args.save !== false;
      const label = WHO_LABEL[definition.who].toLowerCase();
      const sampleLines = (rows: Array<{ name: string; mailing: Parameters<typeof mailLine>[0]; why: string }>) =>
        rows.slice(0, 3).map((r) => `- ${r.name}, ${mailLine(r.mailing)} (${r.why})`);
      const narrow = (truncated: boolean, limited: boolean) =>
        truncated ? " That's the top of a longer list: narrow it by value, street or zip to see everyone." : limited ? " That's the cap; raise limit (up to 500) or narrow it for the rest." : "";
      if (!save) {
        const built = await buildRows(ctx, definition);
        return {
          text: [`${built.rows.length} ${label} in ${definition.county} County (not saved).${narrow(built.truncated, built.limited)}`, ...sampleLines(built.rows)].join("\n"),
          data: { count: built.rows.length, truncated: built.truncated, limited: built.limited, sample: built.rows.slice(0, 3), definition },
        };
      }
      const made = await createDef.handler(ctx, { organizationId: connection.organizationId, title, definition });
      const link = app(`/outreach/${made.listId}`);
      const name = title ?? (await ctx.db.get(made.listId))?.title ?? label;
      return {
        text: [
          `${made.rowCount} ${label} in ${definition.county} County, saved as "${name}": ${link}${narrow(made.truncated, made.limited)}`,
          ...sampleLines(made.sample),
          made.rowCount ? "Names and mailing addresses only; the page exports a CSV for letters and opens each address in Apple Maps." : "Nobody matched; try a lower value or no street.",
        ].join("\n"),
        data: { listId: made.listId, count: made.rowCount, truncated: made.truncated, limited: made.limited, link, sample: made.sample, definition },
      };
    },
  },
  {
    name: "list_outreach_lists",
    title: "Saved outreach lists",
    description: "The company's saved Outreach mailing lists: title, who's on it, how many rows and how many are done, with a link to each.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    scope: "leads",
    run: async (ctx, connection) => {
      if (!(await pro(ctx, connection))) return locked();
      const lists = await listsDef.handler(ctx, { organizationId: connection.organizationId });
      if (lists.length === 0) return { text: `No outreach lists yet. Pull one, or make one at ${app("/outreach")}.`, data: { lists: [] } };
      const lines = lists.map((l) => {
        const floor = l.definition.minValueCents ? ` over ${shortMoney(l.definition.minValueCents)}` : "";
        return `- ${l.title}: ${l.rowCount} ${WHO_LABEL[l.who].toLowerCase()}${floor}, ${l.done} done. ${app(`/outreach/${l.id}`)}`;
      });
      return {
        text: lines.join("\n"),
        data: { lists: lists.map((l) => ({ id: l.id, title: l.title, who: l.who, rowCount: l.rowCount, done: l.done, link: app(`/outreach/${l.id}`) })) },
      };
    },
  },
];
