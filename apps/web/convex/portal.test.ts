import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const SIG = "data:image/png;base64,AAAA";

/**
 * Ann's jobs with Peak: a bathroom (signed, on a project, with a tile allowance),
 * a deck estimate sent and waiting, and a draft she hasn't seen.
 */
async function annsJobs(t: T) {
  const owner = await signUp(t, "owner@peak.example");
  const { organizationId, as } = owner;
  const clientId = (await as.mutation(api.clients.create, { organizationId, data: { name: "Ann Miller", language: "es" } }))!._id as Id<"clients">;
  const projectId = (await as.mutation(api.projects.create, { organizationId, data: { name: "Bathroom remodel", clientId } }))!._id as Id<"projects">;
  const make = async (title: string, items: unknown[], extra: Record<string, unknown> = {}) =>
    (await as.mutation(api.estimates.create, { organizationId, data: { title, clientId, items, ...extra } }))!._id as Id<"estimates">;
  const bathroom = await make(
    "Bathroom",
    [
      { _id: "labor", description: "Tile install", quantity: 1, unitPrice: 2000 },
      { _id: "tile", description: "Tile allowance", quantity: 300, unitPrice: 4, allowance: true },
      { _id: "faucet", description: "Faucet allowance", quantity: 1, unitPrice: 350, allowance: true },
    ],
    { projectId },
  );
  const bathroomLink = await as.mutation(api.estimates.shareLink, { id: bathroom });
  await t.mutation(api.publicEstimates.accept, { token: bathroomLink, signature: SIG });
  const deck = await make("Deck", [{ _id: "d", description: "Deck boards", quantity: 1, unitPrice: 5000 }]);
  const deckLink = await as.mutation(api.estimates.shareLink, { id: deck });
  await as.mutation(api.estimates.update, { id: deck, data: { status: "sent" } });
  await make("Fence", [{ _id: "f", description: "Fence", quantity: 1, unitPrice: 900 }]);
  return { ...owner, clientId, projectId, bathroom, bathroomLink, deck, deckLink };
}

describe("the client portal", () => {
  test("one link per client, made once; turned off, the old link stops working and a new one is made", async () => {
    const t = setup();
    const { as, clientId } = await annsJobs(t);
    expect(await as.query(api.portal.current, { clientId })).toBeNull();
    const token = await as.mutation(api.portal.link, { clientId });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await as.mutation(api.portal.link, { clientId })).toBe(token);
    expect(await t.query(api.portal.get, { token })).not.toBeNull();
    await as.mutation(api.portal.turnOff, { clientId });
    expect(await as.query(api.portal.current, { clientId })).toBeNull();
    expect(await t.query(api.portal.get, { token })).toBeNull();
    const next = await as.mutation(api.portal.link, { clientId });
    expect(next).not.toBe(token);
    expect(await t.query(api.portal.get, { token: "nope" })).toBeNull();

    const rival = await signUp(t, "rival@example.com");
    await expect(rival.as.mutation(api.portal.link, { clientId })).rejects.toThrow();
    await expect(rival.as.mutation(api.portal.turnOff, { clientId })).rejects.toThrow();
  });

  test("shows only what was sent or asked: the open asks first, then each job's signed documents", async () => {
    const t = setup();
    const { as, clientId, bathroom, bathroomLink, deckLink } = await annsJobs(t);
    const token = await as.mutation(api.portal.link, { clientId });
    let page = (await t.query(api.portal.get, { token }))!;
    expect(page.client).toEqual({ name: "Ann Miller", language: "es" });
    expect(page.company).toMatchObject({ name: expect.any(String) });
    // The deck waits for her signature; the draft fence and the unasked allowances don't show.
    expect(page.asks).toEqual([
      { kind: "estimate", at: expect.any(String), number: expect.any(String), title: "Deck", total: 5000, path: `/share/estimate/${deckLink}` },
    ]);
    expect(page.jobs).toEqual([
      {
        key: expect.stringMatching(/^p:/),
        name: "Bathroom remodel",
        total: 3550,
        documents: [{ kind: "estimate", number: expect.any(String), signedAt: expect.any(String), path: `/share/estimate/${bathroomLink}` }],
        selections: [],
      },
    ]);

    // Asked to pick the tile; the company enters the faucet itself and sends the difference.
    await as.mutation(api.selections.setPickBy, { estimateId: bathroom, itemId: "tile", pickBy: "2026-12-01" });
    await as.mutation(api.selections.ask, { estimateId: bathroom, itemId: "tile" });
    await as.mutation(api.selections.record, { estimateId: bathroom, itemId: "faucet", name: "Delta Trinsic", unitPrice: 420 });
    await as.mutation(api.selections.queueChangeOrder, { estimateId: bathroom });
    // Queued: nothing reaches the client until the company sends.
    page = (await t.query(api.portal.get, { token }))!;
    expect(page.asks.map((a) => a.kind)).toEqual(["estimate"]);
    // The preview shows the portal as it will be, with what's new marked, and the change order's real changes.
    const preview = (await as.query(api.portal.preview, { clientId }))!;
    expect(preview.token).toBe(token);
    expect(preview.newCount).toBe(2);
    expect(preview.asks.map((a) => [a.kind, a.isNew ?? false])).toEqual([
      ["selection", true],
      ["estimate", false],
      ["change_order", true],
    ]);
    expect(preview.asks[2]).toMatchObject({ difference: 70, changes: [{ description: "Faucet allowance", before: 350, after: 420 }] });
    expect(preview.asks[2]).not.toHaveProperty("path", expect.anything());
    const sent = await as.mutation(api.portal.send, { clientId });
    expect(sent).toEqual({ token, picks: [{ description: "Tile allowance", pickBy: "2026-12-01" }], changeOrders: 1 });
    expect((await as.query(api.portal.preview, { clientId }))!.newCount).toBe(0);
    const [order] = (await as.query(api.signoffs.forEstimate, { estimateId: bathroom })).filter((s) => s.kind === "change_order");
    page = (await t.query(api.portal.get, { token }))!;
    expect(page.asks.map((a) => a.kind)).toEqual(["selection", "estimate", "change_order"]);
    expect(page.asks[0]).toMatchObject({
      description: "Tile allowance",
      quantity: 300,
      allowanceUnitPrice: 4,
      allowanceTotal: 1200,
      pickBy: "2026-12-01",
    });
    expect(page.asks[0]).not.toHaveProperty("pick", expect.anything());
    expect(page.asks[2]).toMatchObject({ number: order.number, difference: 70, path: `/share/signoff/${order.token}` });
    expect(page.jobs[0].selections).toEqual([{ description: "Faucet allowance", name: "Delta Trinsic", url: undefined }]);

    // Signed, the change order moves from the asks to the job's documents.
    await t.mutation(api.signoffs.sign, { token: order.token, signerName: "Ann Miller", signature: SIG });
    page = (await t.query(api.portal.get, { token }))!;
    expect(page.asks.map((a) => a.kind)).toEqual(["selection", "estimate"]);
    expect(page.jobs[0].documents.map((d) => d.kind)).toEqual(["estimate", "change_order"]);
    expect(page.jobs[0].total).toBe(3620); // the agreed total now includes the signed changes
  });

  test("the client picks what was asked: a link, its name and price; changeable until approved", async () => {
    const t = setup();
    const { as, clientId, bathroom, projectId } = await annsJobs(t);
    const token = await as.mutation(api.portal.link, { clientId });
    // Not asked yet: nothing to pick.
    await expect(t.mutation(api.portal.pick, { token, estimateId: bathroom, itemId: "tile", url: "https://homedepot.com/p/1" })).rejects.toThrow(
      /isn't on the estimate/,
    );
    await as.mutation(api.selections.ask, { estimateId: bathroom, itemId: "tile" });
    // Queued but not sent: still not theirs to pick.
    await expect(t.mutation(api.portal.pick, { token, estimateId: bathroom, itemId: "tile", url: "https://homedepot.com/p/1" })).rejects.toThrow(
      /isn't on the estimate/,
    );
    await as.mutation(api.portal.send, { clientId });
    await expect(t.mutation(api.portal.pick, { token, estimateId: bathroom, itemId: "tile", url: "javascript:alert(1)" })).rejects.toThrow(
      /Paste the link/,
    );
    await expect(t.mutation(api.portal.pick, { token, estimateId: bathroom, itemId: "tile", url: "https://x.com", unitPrice: -1 })).rejects.toThrow(
      /\$0 or more/,
    );
    await t.mutation(api.portal.pick, {
      token,
      estimateId: bathroom,
      itemId: "tile",
      url: "homedepot.com/p/marble",
      name: " Marble ",
      unitPrice: 5.4,
      note: "Gray",
    });

    const page = (await t.query(api.portal.get, { token }))!;
    expect(page.asks.find((a) => a.kind === "selection")).toMatchObject({
      kind: "selection",
      pick: { url: "https://homedepot.com/p/marble", name: "Marble", unitPrice: 5.4, note: "Gray", status: "picked" },
    });
    const [job] = await as.query(api.selections.forProject, { projectId });
    expect(job.allowances[0].pick).toMatchObject({ status: "picked", difference: 420, entered: false });

    await as.mutation(api.selections.approve, { id: job.allowances[0].pick!.id, unitPrice: 5.4 });
    await expect(t.mutation(api.portal.pick, { token, estimateId: bathroom, itemId: "tile", url: "https://homedepot.com/p/2" })).rejects.toThrow(
      /already approved/,
    );
    expect((await t.query(api.portal.get, { token }))!.jobs[0].selections).toEqual([
      { description: "Tile allowance", name: "Marble", url: "https://homedepot.com/p/marble" },
    ]);
  });

  test("another client's link can't reach this client's estimate, and the language sticks", async () => {
    const t = setup();
    const { as, organizationId, bathroom, clientId } = await annsJobs(t);
    await as.mutation(api.selections.ask, { estimateId: bathroom, itemId: "tile" });
    await as.mutation(api.portal.send, { clientId });
    const bob = (await as.mutation(api.clients.create, { organizationId, data: { name: "Bob" } }))!._id as Id<"clients">;
    const bobToken = await as.mutation(api.portal.link, { clientId: bob });
    await expect(t.mutation(api.portal.pick, { token: bobToken, estimateId: bathroom, itemId: "tile", url: "https://x.com" })).rejects.toThrow(
      /isn't on the estimate/,
    );
    expect((await t.query(api.portal.get, { token: bobToken }))!).toMatchObject({ asks: [], jobs: [] });

    const token = await as.mutation(api.portal.link, { clientId });
    await t.mutation(api.portal.setLanguage, { token, language: "en" });
    expect((await t.query(api.portal.get, { token }))!.client.language).toBe("en");
    // The estimate link points back to the portal.
    const link = await as.mutation(api.estimates.shareLink, { id: bathroom });
    expect((await t.query(api.publicEstimates.get, { token: link }))!.portalToken).toBe(token);
  });

  test("a project's portal is its client's, or the one client on its estimates; another company gets nothing", async () => {
    const t = setup();
    const { as, organizationId, projectId, clientId, bathroom } = await annsJobs(t);
    expect(await as.query(api.portal.forProject, { projectId })).toEqual({ clientId, name: "Ann Miller", language: "es", token: null, queued: 0 });
    // A project with no client of its own: the one client on its estimates.
    const bare = (await as.mutation(api.projects.create, { organizationId, data: { name: "Porch" } }))!._id as Id<"projects">;
    expect(await as.query(api.portal.forProject, { projectId: bare })).toBeNull();
    await as.mutation(api.estimates.create, { organizationId, data: { title: "Porch", clientId, projectId: bare, items: [] } });
    expect((await as.query(api.portal.forProject, { projectId: bare }))!.clientId).toBe(clientId);
    await as.mutation(api.selections.ask, { estimateId: bathroom, itemId: "tile" });
    expect((await as.query(api.portal.forProject, { projectId }))!.queued).toBe(1);
    const rival = await signUp(t, "rival@example.com");
    await expect(rival.as.query(api.portal.preview, { clientId })).rejects.toThrow();
    await expect(rival.as.mutation(api.portal.send, { clientId })).rejects.toThrow();
    await expect(rival.as.query(api.portal.forProject, { projectId })).rejects.toThrow();
  });
});
