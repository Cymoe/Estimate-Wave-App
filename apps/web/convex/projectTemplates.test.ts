import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";
import { BUILT_IN_PACKAGES, findPackage, packageTotal } from "./catalog/packages";
import { PROJECT_TYPES } from "./catalog/projectTypes";

type T = ReturnType<typeof setup>;

/** A finished re-roof: a signed estimate with two lines and three dated tasks. */
async function finishedJob(t: T) {
  const owner = await signUp(t, "owner@peak.example");
  const { as, organizationId } = owner;
  const client = (await as.mutation(api.clients.create, { organizationId, data: { name: "Ann Miller" } }))!;
  const project = (await as.mutation(api.projects.create, {
    organizationId,
    data: {
      name: "Miller re-roof",
      status: "completed",
      clientId: client._id,
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      category: "Roof Replacement",
      description: "Tear-off and architectural shingles",
    },
  }))!;
  const projectId = project._id as Id<"projects">;
  await as.mutation(api.estimates.create, {
    organizationId,
    data: { projectId, clientId: client._id, title: "Old draft", items: [{ description: "Wrong", quantity: 1, unitPrice: 1 }] },
  });
  const signed = (await as.mutation(api.estimates.create, {
    organizationId,
    data: {
      projectId,
      clientId: client._id,
      title: "Signed",
      items: [
        { description: "Tear-off", quantity: 20, unitPrice: 85, redLinePrice: 70, capPrice: 95, costCode: "RF100" },
        { description: "Architectural shingles", quantity: 20, unitPrice: 320, redLinePrice: 280, capPrice: 340 },
      ],
    },
  }))!;
  await t.run((ctx) => ctx.db.patch(signed._id, { status: "accepted" }));
  await as.mutation(api.tasks.add, { projectId, title: "Order materials" });
  await as.mutation(api.tasks.add, { projectId, title: "Tear-off", startDate: "2026-09-07", endDate: "2026-09-08", notes: "Dumpster by 7am" });
  await as.mutation(api.tasks.add, { projectId, title: "Shingles", startDate: "2026-09-09", endDate: "2026-09-11" });
  return { ...owner, projectId, clientId: client._id as Id<"clients"> };
}

describe("project templates", () => {
  test("saved from a project: the signed estimate's lines, tasks as days from the start, and the length", async () => {
    const t = setup();
    const { as, organizationId, projectId } = await finishedJob(t);
    await expect(as.mutation(api.projectTemplates.saveFromProject, { projectId, name: " " })).rejects.toThrow(/a name/);
    const template = await as.mutation(api.projectTemplates.saveFromProject, { projectId, name: " Re-roof, 20 squares " });
    expect(template).toMatchObject({
      name: "Re-roof, 20 squares",
      description: "Tear-off and architectural shingles",
      category: "Roof Replacement",
      days: 5,
      total: 8100,
      itemCount: 2,
      taskCount: 3,
      usageCount: 0,
    });
    expect(template.items.map((i) => [i.description, i.quantity, i.unitPrice, i.redLinePrice, i.capPrice])).toEqual([
      ["Tear-off", 20, 85, 70, 95],
      ["Architectural shingles", 20, 320, 280, 340],
    ]);
    expect(template.tasks).toEqual([
      { title: "Tear-off", notes: "Dumpster by 7am", startOffset: 0, days: 2 },
      { title: "Shingles", startOffset: 2, days: 3 },
      { title: "Order materials" },
    ]);
    const listed = await as.query(api.projectTemplates.list, { organizationId });
    expect(listed.map((x) => x.name)).toEqual(["Re-roof, 20 squares"]);
  });

  test("starting a project from a template makes the project, a draft estimate with its lines, and its tasks on the calendar", async () => {
    const t = setup();
    const { as, organizationId, projectId, clientId } = await finishedJob(t);
    const template = await as.mutation(api.projectTemplates.saveFromProject, { projectId, name: "Re-roof" });

    const { project, estimateId } = await as.mutation(api.projectTemplates.start, {
      id: template._id,
      data: { name: "Garcia re-roof", clientId, startDate: "2026-11-02" },
    });
    // The sheet left the end, budget and description to the template.
    expect(project).toMatchObject({
      name: "Garcia re-roof",
      status: "planning",
      clientId,
      startDate: "2026-11-02",
      endDate: "2026-11-06",
      budget: 8100,
      category: "Roof Replacement",
      description: "Tear-off and architectural shingles",
    });
    const estimate = (await as.query(api.estimates.get, { id: estimateId! }))!;
    expect(estimate).toMatchObject({ status: "draft", title: "Garcia re-roof - Estimate", projectId: project._id, clientId, totalAmount: 8100 });
    expect(estimate.items.map((i) => [i.description, i.unitPrice, i.redLinePrice])).toEqual([
      ["Tear-off", 85, 70],
      ["Architectural shingles", 320, 280],
    ]);
    const tasks = await as.query(api.tasks.forProject, { projectId: project._id });
    expect(tasks.map((x) => [x.title, x.startDate, x.endDate])).toEqual([
      ["Tear-off", "2026-11-02", "2026-11-03"],
      ["Shingles", "2026-11-04", "2026-11-06"],
      ["Order materials", undefined, undefined],
    ]);
    expect((await as.query(api.projectTemplates.get, { id: template._id })).usageCount).toBe(1);

    // What the sheet sets wins; without a start date the tasks stay undated.
    const second = await as.mutation(api.projectTemplates.start, {
      id: template._id,
      data: { name: "Lopez re-roof", budget: 9000, description: "Steeper pitch", endDate: "" },
    });
    expect(second.project).toMatchObject({ budget: 9000, description: "Steeper pitch" });
    expect(second.project.startDate).toBeUndefined();
    expect(second.project.endDate).toBeUndefined();
    expect((await as.query(api.tasks.forProject, { projectId: second.project._id })).every((x) => !x.startDate)).toBe(true);
    await expect(
      as.mutation(api.projectTemplates.start, { id: template._id, data: { name: "Bad", startDate: "2026-11-05", endDate: "2026-11-01" } }),
    ).rejects.toThrow(/before the start/);
    expect((await as.query(api.projectTemplates.list, { organizationId }))[0].usageCount).toBe(2);
  });

  test("a template without lines makes no estimate; rename, write by hand, and delete", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "owner@peak.example");
    const byHand = await as.mutation(api.projectTemplates.create, {
      organizationId,
      data: { name: "Fence repair", days: 1, tasks: [{ title: "Replace posts", startOffset: 0, days: 1 }, { title: " " }].slice(0, 1) },
    });
    expect(byHand).toMatchObject({ name: "Fence repair", days: 1, total: 0, itemCount: 0, taskCount: 1 });
    await expect(as.mutation(api.projectTemplates.create, { organizationId, data: { name: "Bad", tasks: [{ title: "" }] } })).rejects.toThrow(
      /needs a title/,
    );
    await expect(as.mutation(api.projectTemplates.create, { organizationId, data: { name: "Bad", days: 0 } })).rejects.toThrow(/at least 1/);

    const { project, estimateId } = await as.mutation(api.projectTemplates.start, {
      id: byHand._id,
      data: { name: "Smith fence", startDate: "2026-11-02" },
    });
    expect(estimateId).toBeNull();
    expect(project).toMatchObject({ name: "Smith fence", endDate: "2026-11-02" });
    expect(project.budget).toBeUndefined();
    expect(await as.query(api.estimates.list, { organizationId })).toEqual([]);

    const renamed = await as.mutation(api.projectTemplates.update, { id: byHand._id, data: { name: "Fence post repair", days: 2 } });
    expect(renamed).toMatchObject({ name: "Fence post repair", days: 2, usageCount: 1 });
    await as.mutation(api.projectTemplates.remove, { id: byHand._id });
    expect(await as.query(api.projectTemplates.list, { organizationId })).toEqual([]);
  });

  test("another company can't see, use or change a template", async () => {
    const t = setup();
    const { as, projectId } = await finishedJob(t);
    const other = await signUp(t, "other@rival.example");
    const template = await as.mutation(api.projectTemplates.saveFromProject, { projectId, name: "Re-roof" });
    expect(await other.as.query(api.projectTemplates.list, { organizationId: other.organizationId })).toEqual([]);
    await expect(other.as.query(api.projectTemplates.get, { id: template._id })).rejects.toThrow();
    await expect(other.as.mutation(api.projectTemplates.start, { id: template._id, data: { name: "Theirs" } })).rejects.toThrow();
    await expect(other.as.mutation(api.projectTemplates.update, { id: template._id, data: { name: "Mine now" } })).rejects.toThrow();
    await expect(other.as.mutation(api.projectTemplates.remove, { id: template._id })).rejects.toThrow();
    await expect(other.as.mutation(api.projectTemplates.saveFromProject, { projectId, name: "Theirs" })).rejects.toThrow();
  });

  test("a built-in package starts a project with its lines, tasks and length, for any member of the company", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "owner@peak.example");
    const client = (await as.mutation(api.clients.create, { organizationId, data: { name: "Ann Miller" } }))!;
    const kitchen = findPackage("general-construction/remodel/kitchen-remodel")!;
    const { project, estimateId } = await as.mutation(api.projectTemplates.startPackage, {
      organizationId,
      packageId: kitchen.id,
      data: { name: "Miller kitchen", clientId: client._id, startDate: "2026-11-02" },
    });
    expect(project).toMatchObject({
      name: "Miller kitchen",
      status: "planning",
      category: "Remodel",
      startDate: "2026-11-02",
      endDate: "2026-11-21",
      budget: packageTotal(kitchen),
      description: kitchen.description,
    });
    const estimate = (await as.query(api.estimates.get, { id: estimateId! }))!;
    expect(estimate.totalAmount).toBe(packageTotal(kitchen));
    expect(estimate.items).toHaveLength(kitchen.lines.length);
    // Units that matter ride along in the description; the red line and cap are kept for the pricing drawer.
    expect(estimate.items[2]).toMatchObject({
      description: "Semi-custom cabinets, supplied and installed, per lf",
      quantity: 22,
      unitPrice: 385,
      redLinePrice: 327.25,
      capPrice: 385,
    });
    expect(estimate.items[0].description).toBe("Demo and haul-off of existing cabinets, counters and flooring");
    const tasks = await as.query(api.tasks.forProject, { projectId: project._id });
    expect(tasks).toHaveLength(kitchen.tasks.length);
    expect(tasks[0]).toMatchObject({ title: "Order cabinets and counters", startDate: "2026-11-02" });
    expect(tasks[1]).toMatchObject({ title: "Demo", startDate: "2026-11-16", endDate: "2026-11-17" });

    await expect(
      as.mutation(api.projectTemplates.startPackage, { organizationId, packageId: "nope/nope/nope", data: { name: "X" } }),
    ).rejects.toThrow(/package/);
    const other = await signUp(t, "other@rival.example");
    await expect(
      as.mutation(api.projectTemplates.startPackage, { organizationId: other.organizationId, packageId: kitchen.id, data: { name: "X" } }),
    ).rejects.toThrow();
  });

  test("every built-in package hangs off a real kind of job, has priced lines and a schedule that fits", () => {
    const ids = new Set<string>();
    for (const p of BUILT_IN_PACKAGES) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(PROJECT_TYPES[p.trade]?.some((t) => t.name === p.type)).toBe(true);
      expect(p.lines.length).toBeGreaterThan(0);
      expect(p.days).toBeGreaterThanOrEqual(1);
      for (const line of p.lines) {
        expect(line.unitPrice).toBeGreaterThan(0);
        expect(line.redLinePrice).toBeLessThanOrEqual(line.capPrice);
        expect(line.capPrice).toBe(line.unitPrice);
      }
      for (const task of p.tasks) expect((task.startOffset ?? 0) + (task.days ?? 1)).toBeLessThanOrEqual(p.days + 60);
    }
    expect(BUILT_IN_PACKAGES.filter((p) => p.trade === "general-construction" && p.type === "Remodel").map((p) => p.name)).toEqual([
      "Kitchen Remodel",
      "Bathroom Remodel",
      "Tub-to-Shower Conversion",
      "Basement Finish",
      "Garage Conversion",
    ]);
  });
});
