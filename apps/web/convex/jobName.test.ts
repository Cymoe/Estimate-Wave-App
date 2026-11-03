import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { isPlaceholderTitle, jobName } from "./lib/jobName";
import { setup, signUp } from "./test.setup";

describe("what a job from an estimate is called", () => {
  test("a real title stays; a placeholder gives way to the client, then the address, then the number", () => {
    expect(isPlaceholderTitle("Estimate 031934")).toBe(true);
    expect(isPlaceholderTitle("Presupuesto EST-2026-01")).toBe(true);
    expect(isPlaceholderTitle("Kitchen Remodel - Estimate")).toBe(false);
    expect(isPlaceholderTitle("Estimate for the deck")).toBe(false);
    expect(jobName({ title: "Kitchen Remodel", clientName: "Ann Miller" })).toBe("Kitchen Remodel");
    expect(jobName({ title: "Estimate 031934", clientName: "Ann Miller" })).toBe("Ann Miller job");
    expect(jobName({ title: "Estimate 031934", address: "12 Oak St, Midland" })).toBe("12 Oak St, Midland");
    expect(jobName({ title: "", estimateNumber: "EST-2026-031935" })).toBe("Job for EST-2026-031935");
  });

  test("the deploy renames projects still called 'Estimate 0…', and only those", async () => {
    const t = setup();
    const { organizationId, userId } = await signUp(t, "owner@peak.example");
    const now = new Date().toISOString();
    const ids = await t.run(async (ctx) => {
      const clientId = await ctx.db.insert("clients", { organizationId, userId, name: "Ann Miller", createdAt: now, updatedAt: now });
      const project = (name: string, extra: Record<string, unknown> = {}) =>
        ctx.db.insert("projects", { organizationId, userId, name, status: "planning", createdAt: now, updatedAt: now, ...extra });
      const withClient = await project("Estimate 031934", { clientId });
      const bare = await project("Estimate 002499");
      await ctx.db.insert("estimates", {
        organizationId, userId, projectId: bare, estimateNumber: "EST-2026-002500", title: "Estimate 002499", status: "draft",
        issueDate: "2026-10-31", subtotal: 0, taxRate: 0, taxAmount: 0, totalAmount: 0, items: [], createdAt: now, updatedAt: now,
      });
      const kept = await project("Kitchen Remodel");
      return { withClient, bare, kept };
    });
    expect(await t.mutation(internal.projects.renamePlaceholderProjects, {})).toEqual({ renamed: 2 });
    const names = await t.run(async (ctx) => Promise.all([ids.withClient, ids.bare, ids.kept].map(async (id) => (await ctx.db.get(id))!.name)));
    expect(names).toEqual(["Ann Miller job", "Job for EST-2026-002500", "Kitchen Remodel"]);
    expect(await t.mutation(internal.projects.renamePlaceholderProjects, {})).toEqual({ renamed: 0 });
  });

  test("the deploy clears 'Estimate 0…' titles on estimates, and keeps real ones", async () => {
    const t = setup();
    const { organizationId, userId } = await signUp(t, "owner@peak.example");
    const now = new Date().toISOString();
    const ids = await t.run(async (ctx) => {
      const estimate = (estimateNumber: string, title?: string) =>
        ctx.db.insert("estimates", {
          organizationId, userId, estimateNumber, ...(title === undefined ? {} : { title }), status: "draft",
          issueDate: "2026-10-31", subtotal: 0, taxRate: 0, taxAmount: 0, totalAmount: 0, items: [], createdAt: now, updatedAt: now,
        });
      return Promise.all([estimate("EST-2026-002500", "Estimate 002499"), estimate("EST-2026-002501", "Kitchen Remodel"), estimate("EST-2026-002502")]);
    });
    expect(await t.mutation(internal.estimates.clearPlaceholderTitles, {})).toEqual({ cleared: 1 });
    const titles = await t.run(async (ctx) => Promise.all(ids.map(async (id) => (await ctx.db.get(id))!.title ?? null)));
    expect(titles).toEqual([null, "Kitchen Remodel", null]);
    expect(await t.mutation(internal.estimates.clearPlaceholderTitles, {})).toEqual({ cleared: 0 });
  });
});
