import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;

/** A company with a client and a sent estimate for $9,000. */
async function sentEstimate(t: T, title = "Re-roof") {
  const owner = await signUp(t, "owner@peak.example");
  const client = (await owner.as.mutation(api.clients.create, { organizationId: owner.organizationId, data: { name: "Ann Miller" } }))!;
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: { title, clientId: client._id, items: [{ description: "Shingles", quantity: 1, unitPrice: 9000, totalPrice: 9000 }] },
  }))!;
  const token = await owner.as.mutation(api.estimates.shareLink, { id: estimate._id });
  await owner.as.mutation(api.estimates.update, { id: estimate._id, data: { status: "sent" } });
  return { ...owner, clientId: client._id, estimateId: estimate._id as Id<"estimates">, token };
}

const projectOf = async (t: T, estimateId: Id<"estimates">) => {
  const estimate = (await t.run((ctx) => ctx.db.get(estimateId)))!;
  return estimate.projectId ? await t.run((ctx) => ctx.db.get(estimate.projectId!)) : null;
};

describe("accepting an estimate makes it a project", () => {
  test("when the client signs their link", async () => {
    const t = setup();
    const { estimateId, token, clientId, organizationId } = await sentEstimate(t);
    expect(await projectOf(t, estimateId)).toBeNull();
    await t.mutation(api.publicEstimates.accept, { token, signature: "data:image/png;base64,AAAA" });
    const project = (await projectOf(t, estimateId))!;
    expect(project).toMatchObject({ name: "Re-roof", clientId, budget: 9000, status: "planning", organizationId });
  });

  test("when the company approves it without a signature", async () => {
    const t = setup();
    const { as, estimateId } = await sentEstimate(t);
    await as.mutation(api.estimates.approve, { id: estimateId });
    expect((await projectOf(t, estimateId))!.name).toBe("Re-roof");
  });

  test("when the client signs in person on the company's device", async () => {
    const t = setup();
    const { as, estimateId } = await sentEstimate(t);
    await as.mutation(api.estimates.sign, { id: estimateId, signature: "data:image/png;base64,AAAA" });
    expect((await projectOf(t, estimateId))!.name).toBe("Re-roof");
  });

  test("when it's marked Accepted by hand, named for the client when the estimate has no title of its own", async () => {
    const t = setup();
    const { as, estimateId } = await sentEstimate(t, "Estimate 031934");
    await as.mutation(api.estimates.update, { id: estimateId, data: { status: "accepted" } });
    expect((await projectOf(t, estimateId))!.name).toBe("Ann Miller job");
  });

  test("an estimate already on a project stays on it, and a second acceptance makes nothing new", async () => {
    const t = setup();
    const { as, estimateId, organizationId } = await sentEstimate(t);
    const existing = (await as.mutation(api.projects.create, { organizationId, data: { name: "Miller house" } }))!;
    await as.mutation(api.estimates.update, { id: estimateId, data: { projectId: existing._id } });
    await as.mutation(api.estimates.approve, { id: estimateId });
    expect((await projectOf(t, estimateId))!._id).toBe(existing._id);
    const count = async () => (await t.run((ctx) => ctx.db.query("projects").collect())).length;
    const before = await count();
    await as.mutation(api.estimates.update, { id: estimateId, data: { status: "accepted" } });
    expect(await count()).toBe(before);
  });
});
