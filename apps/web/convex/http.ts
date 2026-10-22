import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Where leads from outside land: Zapier, LeadsBridge or Make (fed by a
 * Facebook Lead Ads form) POST JSON here. The key comes from the INTAKE_KEY
 * environment variable on the deployment and travels as ?key=… or an
 * x-intake-key header. The lead goes into the intake queue for staff to
 * confirm; nothing is sold from this endpoint.
 */
http.route({
  path: "/intake/lead",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.INTAKE_KEY;
    if (!expected) return json({ error: "Intake isn't set up yet (no INTAKE_KEY)" }, 503);
    const url = new URL(request.url);
    const given = request.headers.get("x-intake-key") ?? url.searchParams.get("key");
    if (given !== expected) return json({ error: "Wrong key" }, 401);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Send JSON" }, 400);
    }
    if (!payload || typeof payload !== "object") return json({ error: "Send a JSON object" }, 400);
    const source = url.searchParams.get("source");
    const result = await ctx.runMutation(internal.intake.receive, {
      payload,
      source: source === "meta" || source === "call" || source === "manual" || source === "api" ? source : undefined,
    });
    return json(result, result.repeat ? 200 : 201);
  }),
});

export default http;
