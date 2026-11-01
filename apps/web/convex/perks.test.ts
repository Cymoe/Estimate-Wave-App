import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { warrantyEnds, warrantyMonths } from "./lib/perks";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const SIG = "data:image/png;base64,AAAA";

/** Ann's bathroom with Peak, signed, on a project; `finish` signs the job-complete sign-off. */
async function annsBathroom(t: T) {
  const owner = await signUp(t, "owner@peak.example");
  const { organizationId, as } = owner;
  const clientId = (await as.mutation(api.clients.create, {
    organizationId,
    data: { name: "Ann Miller", phone: "555-0100" },
  }))!._id as Id<"clients">;
  const projectId = (await as.mutation(api.projects.create, {
    organizationId,
    data: { name: "Bathroom remodel", clientId },
  }))!._id as Id<"projects">;
  const estimateId = (await as.mutation(api.estimates.create, {
    organizationId,
    data: {
      title: "Bathroom",
      clientId,
      projectId,
      items: [
        { _id: "a", description: "Tile install", quantity: 1, unitPrice: 2000 },
      ],
    },
  }))!._id as Id<"estimates">;
  await t.mutation(api.publicEstimates.accept, {
    token: await as.mutation(api.estimates.shareLink, { id: estimateId }),
    signature: SIG,
  });
  const token = await as.mutation(api.portal.link, { clientId });
  const finish = async (id = estimateId) => {
    const affidavit = await as.mutation(api.signoffs.request, {
      estimateId: id,
      kind: "affidavit",
      completionDate: "2026-11-20",
    });
    await t.mutation(api.signoffs.sign, {
      token: affidavit.token,
      signerName: "Ann Miller",
      signature: SIG,
    });
  };
  return { ...owner, clientId, projectId, estimateId, token, finish };
}

describe("warranty wording", () => {
  test("reads years, months, weeks and days, in English and Spanish", () => {
    expect(warrantyMonths("1 year")).toBe(12);
    expect(warrantyMonths("2 Years")).toBe(24);
    expect(warrantyMonths("18 months")).toBe(18);
    expect(warrantyMonths("2 años")).toBe(24);
    expect(warrantyMonths("6 meses")).toBe(6);
    expect(warrantyMonths("Lifetime")).toBeNull();
    expect(warrantyMonths(undefined)).toBeNull();
    expect(warrantyEnds("2026-11-20T15:00:00.000Z", "1 year")).toBe(
      "2027-11-20",
    );
    expect(warrantyEnds("2026-01-31T15:00:00.000Z", "1 month")).toBe(
      "2026-02-28",
    );
    expect(warrantyEnds("2026-11-20T15:00:00.000Z", "90 days")).toBe(
      "2027-02-18",
    );
    expect(
      warrantyEnds("2026-11-20T15:00:00.000Z", "Lifetime"),
    ).toBeUndefined();
  });
});

describe("after the job", () => {
  test("nothing extra shows until the job-complete sign-off is signed; then the warranty and the company's perks", async () => {
    const t = setup();
    const { as, organizationId, token, finish } = await annsBathroom(t);
    await as.mutation(api.organizations.setPerks, {
      id: organizationId,
      reviewUrl: "g.page/r/peak/review",
      referralReward: "$250 gift card",
    });
    let page = (await t.query(api.portal.get, { token }))!;
    expect(page.perks).toBeUndefined();
    expect(page.jobs[0].completed).toBeUndefined();

    await finish();
    page = (await t.query(api.portal.get, { token }))!;
    expect(page.jobs[0].completed).toEqual({
      at: expect.any(String),
      warranty: "1 year",
      warrantyEnds: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      requests: [],
    });
    expect(page.perks).toEqual({
      reviewUrl: "https://g.page/r/peak/review",
      referral: {
        reward: "$250 gift card",
        code: undefined,
        referred: 0,
        earned: 0,
      },
    });

    // Without perks set up, nothing to show for them (the warranty still does).
    await as.mutation(api.organizations.setPerks, { id: organizationId });
    page = (await t.query(api.portal.get, { token }))!;
    expect(page.perks).toEqual({ reviewUrl: undefined, referral: undefined });
    expect(page.jobs[0].completed).toBeDefined();
  });

  test("perks are the admin's to set, and the review link must be a web address", async () => {
    const t = setup();
    const { as, organizationId } = await annsBathroom(t);
    await expect(
      as.mutation(api.organizations.setPerks, {
        id: organizationId,
        reviewUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow(/web address/);
    expect(
      await as.mutation(api.organizations.setPerks, {
        id: organizationId,
        referralReward: "  $100 off your next job  ",
      }),
    ).toEqual({
      reviewUrl: undefined,
      referralReward: "$100 off your next job",
    });
    const rival = await signUp(t, "rival@example.com");
    await expect(
      rival.as.mutation(api.organizations.setPerks, {
        id: organizationId,
        referralReward: "x",
      }),
    ).rejects.toThrow();
  });

  test("a referral: the client shares their link, a friend sends their details, it lands in Leads; signed, the reward is owed, then given", async () => {
    const t = setup();
    const { as, organizationId, clientId, token, finish } =
      await annsBathroom(t);
    await as.mutation(api.organizations.setPerks, {
      id: organizationId,
      referralReward: "$250 gift card",
    });
    await finish();
    const code = await t.mutation(api.portal.shareReferral, { token });
    expect(code).toMatch(/^[a-z0-9]{8}$/);
    expect(await t.mutation(api.portal.shareReferral, { token })).toBe(code);

    const friendPage = (await t.query(api.referrals.get, { code }))!;
    expect(friendPage.referrer).toBe("Ann");
    expect(JSON.stringify(friendPage)).not.toContain("Miller");
    expect(await t.query(api.referrals.get, { code: "nope" })).toBeNull();

    await expect(
      t.mutation(api.referrals.submit, { code, name: "Bo" }),
    ).rejects.toThrow(/phone number or email/);
    await t.mutation(api.referrals.submit, {
      code,
      name: "Bo Jones",
      phone: "555-0199",
      note: "Kitchen next spring",
      language: "es",
    });
    const [lead] = await as.query(api.leads.list, { organizationId });
    expect(lead).toMatchObject({
      name: "Bo Jones",
      phone: "555-0199",
      status: "new",
      source: "Referral from Ann Miller",
      language: "es",
    });

    let mine = await as.query(api.referrals.forClient, { clientId });
    expect(mine).toMatchObject({
      reward: "$250 gift card",
      referrals: [{ name: "Bo Jones", status: "new", earned: false }],
    });
    expect((await t.query(api.portal.get, { token }))!.perks!.referral).toEqual(
      { reward: "$250 gift card", code, referred: 1, earned: 0 },
    );

    await as.mutation(api.leads.update, {
      id: lead._id,
      data: { status: "won" },
    });
    mine = await as.query(api.referrals.forClient, { clientId });
    expect(mine.referrals[0]).toMatchObject({ earned: true });
    expect(mine.referrals[0].paidAt).toBeUndefined();
    expect(
      (await t.query(api.portal.get, { token }))!.perks!.referral!.earned,
    ).toBe(1);
    await as.mutation(api.referrals.markPaid, { leadId: lead._id, paid: true });
    expect(
      (await as.query(api.referrals.forClient, { clientId })).referrals[0]
        .paidAt,
    ).toEqual(expect.any(String));

    const rival = await signUp(t, "rival@example.com");
    await expect(
      rival.as.query(api.referrals.forClient, { clientId }),
    ).rejects.toThrow();
    await expect(
      rival.as.mutation(api.referrals.markPaid, {
        leadId: lead._id,
        paid: false,
      }),
    ).rejects.toThrow();
  });

  test("a referral link takes at most 10 a day", async () => {
    const t = setup();
    const { token, finish } = await annsBathroom(t);
    await finish();
    const code = await t.mutation(api.portal.shareReferral, { token });
    for (let i = 0; i < 10; i++)
      await t.mutation(api.referrals.submit, {
        code,
        name: `Friend ${i}`,
        email: `f${i}@example.com`,
      });
    await expect(
      t.mutation(api.referrals.submit, {
        code,
        name: "One more",
        email: "x@example.com",
      }),
    ).rejects.toThrow(/Too many/);
  });

  test("warranty service: only on a finished job; it goes onto the project's tasks and shows under the warranty, not the timeline", async () => {
    const t = setup();
    const { as, projectId, token, finish } = await annsBathroom(t);
    const jobKey = (await t.query(api.portal.get, { token }))!.jobs[0].key;
    await expect(
      t.mutation(api.portal.requestWarranty, {
        token,
        jobKey,
        note: "Grout cracking",
      }),
    ).rejects.toThrow(/isn't finished/);
    await finish();
    await expect(
      t.mutation(api.portal.requestWarranty, { token, jobKey, note: "  " }),
    ).rejects.toThrow(/needs looking at/);
    await t.mutation(api.portal.requestWarranty, {
      token,
      jobKey,
      note: "Grout cracking by the tub",
    });
    const tasks = await as.query(api.tasks.forProject, { projectId });
    expect(tasks).toEqual([
      expect.objectContaining({
        title: "Warranty request: Grout cracking by the tub",
        notes: "Grout cracking by the tub",
      }),
    ]);
    const [job] = (await t.query(api.portal.get, { token }))!.jobs;
    expect(job.steps).toEqual([]);
    expect(job.completed!.requests).toEqual([
      {
        note: "Grout cracking by the tub",
        requestedAt: expect.any(String),
        done: false,
      },
    ]);

    // Someone else's job, or a made-up key, is refused.
    await expect(
      t.mutation(api.portal.requestWarranty, {
        token,
        jobKey: "p:nope",
        note: "x",
      }),
    ).rejects.toThrow();
    const other = await signUp(t, "rival@example.com");
    const otherProject = (await other.as.mutation(api.projects.create, {
      organizationId: other.organizationId,
      data: { name: "Theirs" },
    }))!._id;
    await expect(
      t.mutation(api.portal.requestWarranty, {
        token,
        jobKey: `p:${otherProject}`,
        note: "x",
      }),
    ).rejects.toThrow();
  });

  test("warranty service on a job with no project goes to Leads", async () => {
    const t = setup();
    const { as, organizationId, clientId, token, finish } =
      await annsBathroom(t);
    const solo = (await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        title: "Porch light",
        clientId,
        items: [
          { _id: "x", description: "Fixture", quantity: 1, unitPrice: 300 },
        ],
      },
    }))!._id as Id<"estimates">;
    await t.mutation(api.publicEstimates.accept, {
      token: await as.mutation(api.estimates.shareLink, { id: solo }),
      signature: SIG,
    });
    await finish(solo);
    const porch = (await t.query(api.portal.get, { token }))!.jobs.find(
      (j) => j.name === "Porch light",
    )!;
    expect(porch.completed).toBeDefined();
    await t.mutation(api.portal.requestWarranty, {
      token,
      jobKey: porch.key,
      note: "Light flickers",
    });
    const [lead] = await as.query(api.leads.list, { organizationId });
    expect(lead).toMatchObject({
      name: "Ann Miller",
      phone: "555-0100",
      source: "Warranty request",
      notes: "Light flickers",
      clientId,
    });
  });
});
