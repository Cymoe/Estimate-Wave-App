import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;

async function job(t: T) {
  const owner = await signUp(t, "owner@peak.example");
  const client = (await owner.as.mutation(api.clients.create, { organizationId: owner.organizationId, data: { name: "Ann Miller", address: "12 Elm St", city: "Midland" } }))!;
  const project = (await owner.as.mutation(api.projects.create, {
    organizationId: owner.organizationId,
    data: { name: "Miller re-roof", status: "in_progress", clientId: client._id, startDate: "2026-11-02", endDate: "2026-11-13" },
  }))!;
  return { ...owner, projectId: project._id as Id<"projects"> };
}

describe("crew, tasks and the schedule", () => {
  test("tasks have days and crew, sort by start with done ones last, and make the company's schedule", async () => {
    const t = setup();
    const { as, organizationId, projectId } = await job(t);
    const joe = await as.mutation(api.crew.add, { organizationId, name: " Joe Ruiz ", phone: "432-555-0101", trade: "Roofer" });
    const sparks = await as.mutation(api.crew.add, { organizationId, name: "Sparks Electric", trade: "Electrician (sub)" });
    await expect(as.mutation(api.crew.add, { organizationId, name: " " })).rejects.toThrow(/their name/);

    const tearOff = await as.mutation(api.tasks.add, { projectId, title: "Tear-off", startDate: "2026-11-03", endDate: "2026-11-04", crewIds: [joe, joe] });
    await as.mutation(api.tasks.add, { projectId, title: "Order materials" });
    await as.mutation(api.tasks.add, { projectId, title: "Vent wiring", startDate: "2026-11-02", crewIds: [sparks] });
    await expect(as.mutation(api.tasks.add, { projectId, title: "Bad", startDate: "2026-11-05", endDate: "2026-11-01" })).rejects.toThrow(/before the start/);
    await expect(as.mutation(api.tasks.add, { projectId, title: "Bad", startDate: "next week" })).rejects.toThrow(/must be a date/);

    let tasks = await as.query(api.tasks.forProject, { projectId });
    expect(tasks.map((x) => x.title)).toEqual(["Vent wiring", "Tear-off", "Order materials"]);
    expect(tasks[1]).toMatchObject({ startDate: "2026-11-03", endDate: "2026-11-04", done: false, crew: [{ name: "Joe Ruiz", phone: "432-555-0101", trade: "Roofer" }] });

    await as.mutation(api.tasks.update, { id: tearOff, done: true });
    await as.mutation(api.tasks.update, { id: tearOff, endDate: null });
    tasks = await as.query(api.tasks.forProject, { projectId });
    expect(tasks.map((x) => x.title)).toEqual(["Vent wiring", "Order materials", "Tear-off"]);
    expect(tasks[2]).toMatchObject({ done: true, doneAt: expect.any(String) });
    expect(tasks[2].endDate).toBeUndefined();

    const week = await as.query(api.tasks.schedule, { organizationId, from: "2026-11-03", to: "2026-11-09" });
    expect(week.tasks.map((x) => x.title)).toEqual(["Tear-off"]);
    expect(week.tasks[0]).toMatchObject({ projectName: "Miller re-roof", address: "12 Elm St, Midland" });
    expect(week.projects).toEqual([expect.objectContaining({ name: "Miller re-roof", startDate: "2026-11-02", endDate: "2026-11-13" })]);
    // A task that started before the range still shows while it runs.
    await as.mutation(api.tasks.update, { id: tearOff, startDate: "2026-10-30", endDate: "2026-11-04" });
    expect((await as.query(api.tasks.schedule, { organizationId, from: "2026-11-03", to: "2026-11-09" })).tasks.map((x) => x.title)).toEqual(["Tear-off"]);

    // Taking someone off the list keeps their name on past tasks.
    await as.mutation(api.crew.archive, { id: sparks, archived: true });
    expect((await as.query(api.crew.list, { organizationId })).map((p) => p.name)).toEqual(["Joe Ruiz"]);
    expect((await as.query(api.tasks.forProject, { projectId }))[0].crew[0].name).toBe("Sparks Electric");

    await as.mutation(api.projects.remove, { id: projectId });
    expect(await t.run((ctx) => ctx.db.query("projectTasks").collect())).toEqual([]);
  });

  test("another company can't see or change them, or put its crew on them", async () => {
    const t = setup();
    const { as, organizationId, projectId } = await job(t);
    const task = await as.mutation(api.tasks.add, { projectId, title: "Tear-off" });
    const joe = await as.mutation(api.crew.add, { organizationId, name: "Joe" });
    const rival = await signUp(t, "rival@example.com");
    const theirs = await rival.as.mutation(api.crew.add, { organizationId: rival.organizationId, name: "Theirs" });
    await expect(rival.as.query(api.tasks.forProject, { projectId })).rejects.toThrow(/Not found/);
    await expect(rival.as.mutation(api.tasks.update, { id: task, done: true })).rejects.toThrow(/Not found/);
    await expect(rival.as.mutation(api.tasks.remove, { id: task })).rejects.toThrow(/Not found/);
    await expect(rival.as.mutation(api.crew.update, { id: joe, name: "Mine" })).rejects.toThrow(/Not found/);
    await expect(rival.as.query(api.crew.list, { organizationId })).rejects.toThrow();
    await expect(rival.as.query(api.tasks.schedule, { organizationId, from: "2026-11-01", to: "2026-11-07" })).rejects.toThrow();
    await expect(as.mutation(api.tasks.update, { id: task, crewIds: [theirs] })).rejects.toThrow(/wasn't found/);
  });
});
