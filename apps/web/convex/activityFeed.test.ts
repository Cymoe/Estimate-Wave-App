import { describe as group, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { describe } from "./lib/activityText";
import { setup, signUp } from "./test.setup";

/** Peak's kitchen for Ann, from the built-in package: an estimate and draft POs, each logged. */
async function kitchen(t: ReturnType<typeof setup>) {
  const owner = await signUp(t, "myles@peak.example");
  const { as, organizationId } = owner;
  const clientId = (await as.mutation(api.clients.create, { organizationId, data: { name: "Ann Miller", email: "ann@example.com" } }))!._id as Id<"clients">;
  const started = await as.mutation(api.projectTemplates.startPackage, {
    organizationId,
    packageId: "general-construction/remodel/kitchen-remodel",
    data: { name: "Miller kitchen", clientId, startDate: "2026-12-01" },
  });
  const projectId = started.project._id as Id<"projects">;
  const estimateId = started.estimateId as Id<"estimates">;
  const orders = (await as.query(api.purchaseOrders.forProject, { projectId })).orders;
  return { ...owner, clientId, projectId, estimateId, orders };
}

group("activity in words", () => {
  test("each kind of row reads as a sentence; unknown ones still read", () => {
    expect(describe({ action: "created", resourceType: "estimate", details: { estimateNumber: "EST-0012", totalAmount: 8400 } }).text).toBe(
      "Created estimate EST-0012 ($8,400)",
    );
    expect(describe({ action: "accepted_by_client", resourceType: "estimate", details: { estimateNumber: "EST-0012" } })).toMatchObject({
      text: "Signed estimate EST-0012",
      icon: "sign",
      tone: "green",
    });
    expect(describe({ action: "emailed_to_client", resourceType: "estimate", details: { estimateNumber: "EST-1", to: "ann@example.com" } }).text).toBe(
      "Emailed estimate EST-1 to ann@example.com",
    );
    expect(describe({ action: "ordered", resourceType: "purchase_order", details: { number: "PO-1", title: "Cabinet supplier", total: 3811.5 } }).text).toBe(
      "Ordered PO-1 · Cabinet supplier ($3,811.50)",
    );
    expect(describe({ action: "received", resourceType: "purchase_order", details: { number: "PO-1", title: "Tile", amount: 900 } }).text).toBe(
      "Received PO-1 · Tile ($900)",
    );
    expect(describe({ action: "created", resourceType: "purchase_order", details: { count: 6, from: "EST-1" } }).text).toBe("Built 6 purchase orders from EST-1");
    expect(describe({ action: "warranty_requested", resourceType: "project", details: { note: "Cabinet door sags" } }).text).toBe(
      "Asked for warranty service “Cabinet door sags”",
    );
    expect(describe({ action: "task_done", resourceType: "project", details: { title: "Demo" } }).text).toBe("Finished task “Demo”");
    expect(describe({ action: "funding_paid", resourceType: "organization", details: { amountCents: 50000 } }).text).toBe("Added $500 to the lead balance");
    expect(describe({ action: "lead_delivered", resourceType: "lead", details: { name: "Bob Ray", priceCents: 4500 } }).text).toBe("Got lead Bob Ray ($45)");
    expect(describe({ action: "status_changed", resourceType: "estimate", details: { from: "draft", to: "rejected" } }).text).toBe("Marked estimate declined");
    expect(describe({ action: "deleted", resourceType: "lead", details: { name: "Bob Ray" } })).toMatchObject({ text: "Deleted lead Bob Ray", tone: "red" });
    expect(describe({ action: "bought_lead", resourceType: "assistant", details: { amountCents: 3000 } }).text).toBe("Bought a lead ($30)");
    expect(describe({ action: "something_new", resourceType: "project", details: { name: "Deck" } }).text).toBe("Something new project Deck");
  });
});

group("the activity feed", () => {
  test("what the company did, who did it, and where it opens; the client's own actions are theirs", async () => {
    const t = setup();
    const { as, organizationId, projectId, estimateId, orders, userId } = await kitchen(t);
    await as.mutation(api.purchaseOrders.markOrdered, { id: orders[0].id as Id<"purchaseOrders"> });
    // The client signs on their link (stored under the estimate's owner, like publicEstimates.accept does).
    await t.run(async (ctx) => {
      await ctx.db.insert("activityLogs", {
        organizationId,
        userId,
        action: "accepted_by_client",
        resourceType: "estimate",
        resourceId: estimateId,
        details: { estimateNumber: "EST-9" },
        createdAt: new Date(Date.now() + 1000).toISOString(),
      });
    });
    const feed = await as.query(api.activityLogs.feed, { organizationId });
    expect(feed[0]).toMatchObject({ who: "Ann Miller", text: "Signed estimate EST-9", link: `/estimates/${estimateId}`, tone: "green" });
    const ordered = feed.find((r) => r.text.startsWith("Ordered"))!;
    expect(ordered).toMatchObject({ who: "myles", link: `/projects/${projectId}`, icon: "send" });
    expect(feed.find((r) => r.text.startsWith("Created project"))).toMatchObject({ who: "myles", link: `/projects/${projectId}` });
    expect(feed.find((r) => r.text.startsWith("Created estimate"))).toMatchObject({ link: `/estimates/${estimateId}` });
    expect(feed.find((r) => r.text.startsWith("Created client"))).toMatchObject({ text: "Created client Ann Miller" });

    // Filtered to one kind.
    const onlyPos = await as.query(api.activityLogs.feed, { organizationId, resourceType: "purchase_order" });
    expect(onlyPos.length).toBeGreaterThan(0);
    expect(onlyPos.every((r) => /purchase order|^Ordered/.test(r.text))).toBe(true);

    // Gone things don't link.
    await t.run(async (ctx) => await ctx.db.delete(orders[0].id as Id<"purchaseOrders">));
    expect((await as.query(api.activityLogs.feed, { organizationId })).find((r) => r.text.startsWith("Ordered"))!.link).toBeUndefined();
  });

  test("what the office line did after a YES says Office line", async () => {
    const t = setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const k = await kitchen(t);
    await k.as.mutation(api.users.setMobile, { mobile: "4325550100" });
    await k.as.mutation(api.agent.configure, { organizationId: k.organizationId, on: true });
    await t.mutation(internal.agent.runTool, { organizationId: k.organizationId, userId: k.userId, name: "send_purchase_order", args: { purchase_order_id: k.orders[0].id } });
    const askId = await t.run(async (ctx) => (await ctx.db.query("agentAsks").first())!._id);
    expect(await t.mutation(internal.agent.runAsk, { askId, userId: k.userId })).toMatch(/^Done #1/);
    const ordered = (await k.as.query(api.activityLogs.feed, { organizationId: k.organizationId })).find((r) => r.text.startsWith("Ordered"))!;
    expect(ordered).toMatchObject({ who: "Office line", link: `/projects/${k.projectId}` });
    vi.unstubAllGlobals();
  });

  test("only the company's members can read it", async () => {
    const t = setup();
    const { organizationId } = await kitchen(t);
    const stranger = await signUp(t, "x@else.example");
    await expect(stranger.as.query(api.activityLogs.feed, { organizationId })).rejects.toThrow();
  });
});
