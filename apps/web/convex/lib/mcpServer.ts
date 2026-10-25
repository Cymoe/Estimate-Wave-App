import type { HttpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { TOOLS } from "./mcpTools";
import { resourceMetadataUrl, sha256 } from "./oauth";
import { CORS, json } from "./oauthRoutes";

// Tolliver's MCP connector, for Claude and ChatGPT: JSON-RPC over
// streamable HTTP at POST /mcp. Stateless: every request carries its
// bearer token and gets a plain JSON answer, so there are no sessions.

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const INSTRUCTIONS = `Tolliver sells home-service leads (roofing, painting and more) to contracting companies, and keeps each company's leads.
You are connected to one company for one person. Amounts are US dollars.
- For an update, call whats_new. For context (balance, trades, what you may spend), call my_company.
- Homeowner contact details only appear on leads the company has (list_my_leads, get_lead), never on Marketplace leads before they are bought.
- Before anything that spends from the balance, say what it costs and get a clear yes from the person.
- Give the person the Tolliver links from results when they want to see something on the web.`;

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const rpcResult = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function challenge(error?: string) {
  return `Bearer resource_metadata="${resourceMetadataUrl()}"${error ? `, error="${error}"` : ""}`;
}

const unauthorized = (description: string, error?: string) =>
  json({ error: error ?? "invalid_request", error_description: description }, 401, { "www-authenticate": challenge(error) });

export function toolList() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: Boolean(t.destructive), idempotentHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: [t.scope] }],
  }));
}

export function addMcpRoutes(http: HttpRouter) {
  http.route({
    path: "/mcp",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!bearer) return unauthorized("Sign in to Tolliver to use this connector");
      const accessHash = await sha256(bearer);
      const access = await ctx.runQuery(internal.mcp.authorize, { accessHash });
      if (!access.ok) return unauthorized("This sign-in has expired or was disconnected", "invalid_token");

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json(rpcError(null, -32700, "Send JSON"), 400);
      }

      const answer = async (message: Rpc) => {
        if (!message || typeof message !== "object" || typeof message.method !== "string") return rpcError(message?.id, -32600, "Not a JSON-RPC request");
        const isNotification = message.id === undefined;
        switch (message.method) {
          case "initialize": {
            const asked = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
            return rpcResult(message.id, {
              protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: "tolliver", title: "Tolliver", version: "1.0.0" },
              instructions: INSTRUCTIONS,
            });
          }
          case "ping":
            return rpcResult(message.id, {});
          case "tools/list":
            return rpcResult(message.id, { tools: toolList() });
          case "tools/call": {
            const name = message.params?.name;
            if (typeof name !== "string") return rpcError(message.id, -32602, "Give the tool's name");
            if (!TOOLS.some((t) => t.name === name)) return rpcError(message.id, -32602, `Unknown tool ${name}`);
            try {
              const result = await ctx.runMutation(internal.mcp.call, { accessHash, name, args: message.params?.arguments ?? {} });
              return rpcResult(message.id, {
                content: [{ type: "text", text: result.text }],
                ...(result.data !== undefined ? { structuredContent: result.data } : {}),
              });
            } catch (error) {
              // A Tolliver "no" (not enough balance, someone else bought it) goes back to the assistant to tell the person.
              const data = error instanceof ConvexError ? (error.data as { code?: string; message?: string }) : null;
              if (!data) console.error("connector tool failed", name, error);
              return rpcResult(message.id, {
                content: [{ type: "text", text: data?.message ?? "Something went wrong on Tolliver's side. Try again in a minute." }],
                isError: true,
                ...(data?.code === "UNAUTHENTICATED"
                  ? { _meta: { "mcp/www_authenticate": [`${challenge("invalid_token")}, error_description="Sign in to Tolliver again"`] } }
                  : {}),
              });
            }
          }
          default:
            // Notifications (initialized, cancelled) need no answer; anything else isn't offered here.
            return isNotification ? null : rpcError(message.id, -32601, `${message.method} isn't supported`);
        }
      };

      if (Array.isArray(body)) {
        const answers = (await Promise.all(body.map((m) => answer(m as Rpc)))).filter((a) => a !== null);
        return answers.length ? json(answers) : new Response(null, { status: 202, headers: CORS });
      }
      const single = await answer(body as Rpc);
      return single === null ? new Response(null, { status: 202, headers: CORS }) : json(single);
    }),
  });
  // No server-to-client stream and no sessions to end.
  for (const method of ["GET", "DELETE"] as const)
    http.route({
      path: "/mcp",
      method,
      handler: httpAction(async () => new Response(null, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } })),
    });
  http.route({ path: "/mcp", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })) });
}
