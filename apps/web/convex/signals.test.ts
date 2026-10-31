import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { addressKey, looseKey } from "./lib/parcels";
import { codeCaseSignals, demolitionSignals, dilapidatedSignals, stackFor, stalledPermitSignal, toCsv } from "./lib/signals";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const NOW = Date.parse("2026-10-26T15:00:00.000Z");

async function addHome(t: ReturnType<typeof setup>, site: string, over: Record<string, unknown> = {}) {
  return await t.run(async (ctx) =>
    ctx.db.insert("parcels", {
      county: "Midland",
      cadId: `R-${site}`,
      useCode: "A1",
      siteAddress: site,
      addressKey: addressKey(site),
      looseKey: looseKey(site),
      street: site.replace(/^\d+\s+/, ""),
      owner: "COLE JANE",
      mailing: { address: site, city: "MIDLAND", state: "TX", zip: "79705" },
      ownerOccupied: true,
      companyOwned: false,
      marketValueCents: 18_000_000,
      deedDate: "2018-04-02",
      importedAt: "2026-10-25T07:20:00.000Z",
      ...over,
    }),
  );
}

const inspection = (id: string, address: string, violation: string, created: string, extra: Record<string, unknown> = {}) => ({
  attributes: { IMINSPECTIONID: id, ADDRESS: address, VIOLATION: violation, CREATED_DATE: Date.parse(created), STATUS: "In Violation", CASE_NUMBER: `C-${id}`, ...extra },
});

describe("reading the city's records", () => {
  test("a code case's short address matches the roll's full one; county roads keep their RD", () => {
    expect(looseKey("807 W WEATHERFORD AV")).toBe("807 WEATHERFORD");
    expect(looseKey("807 WEATHERFORD")).toBe("807 WEATHERFORD");
    expect(looseKey("1807 East Front Street")).toBe("1807 FRONT");
    expect(looseKey("801 N D ST")).toBe(looseKey("801 D"));
    expect(looseKey("3107 S COUNTY RD 01109")).toBe("3107 COUNTY RD 1109");
  });

  test("each layer's rows become signals; a permit only when it stopped", () => {
    expect(codeCaseSignals([inspection("i1", "807 WEATHERFORD", "Deteriorated Structure", "2026-10-01T15:00:00Z"), { attributes: { ADDRESS: "no id" } }])).toEqual([
      { sourceId: "code:i1", kind: "code_violation", address: "807 WEATHERFORD", detail: "Deteriorated Structure", status: "In Violation", caseNumber: "C-i1", date: "2026-10-01T15:00:00.000Z" },
    ]);
    expect(dilapidatedSignals([{ attributes: { ID: "d1", Address: "604 S. Jackson", Zone: "SF3 - Residential", Date: Date.parse("2025-02-19T00:00:00Z") } }])[0]).toMatchObject({
      sourceId: "dilapidated:d1",
      address: "604 S. Jackson",
      date: "2025-02-19T00:00:00.000Z",
    });
    expect(demolitionSignals([{ attributes: { ObjectID: 18, Address: "1807 East Front Street", Issue_Approval_Date: "5/8/2025", Work_Class: "Residential", Abatement_Type: "Voluntary", Status_1: "Completed" } }])[0]).toMatchObject({
      sourceId: "demolition:18",
      detail: "Residential, Voluntary",
      date: "2025-05-08T12:00:00.000Z",
    });
    const permit = { permitNumber: "RES-9", address: "2709 HOWDY DR", appliedAt: "2026-09-01T00:00:00Z", name: "Residential - Building" };
    expect(stalledPermitSignal({ ...permit, status: "Stop Work Order" })).toMatchObject({ sourceId: "permit:RES-9", detail: "Residential - Building: Stop Work Order" });
    expect(stalledPermitSignal({ ...permit, status: "Issued" })).toBeNull();
  });

  test("the stack: lists, weights, repeat cases, and old cases dropping off", () => {
    const parcel = { ownerOccupied: false, mailing: { state: "CA" }, deedDate: "1999-03-01" };
    const code = (n: string, detail: string, date = "2026-06-01T00:00:00.000Z") => ({ sourceId: `code:${n}`, kind: "code_violation" as const, detail, caseNumber: `C${n}`, date });
    const stack = stackFor(
      parcel,
      [code("1", "Junk Vehicle"), code("2", "Deteriorated Structure"), code("3", "Weeds/Tall Grass/Rubbish/Brush"), code("4", "Junk Vehicle", "2023-01-05T00:00:00.000Z")],
      { preForeclosure: true, landlord: false },
      NOW,
    );
    expect(stack.lists).toEqual(["pre_foreclosure", "serious_violation", "repeat_violations", "out_of_state", "code_violation", "absentee", "long_owned"]);
    expect(stack.score).toBe(3 + 3 + 2 + 2 + 1 + 1 + 1);
    expect([stack.codeCases, stack.seriousCases]).toEqual([3, 1]);
    expect(stackFor({ ownerOccupied: true, mailing: { state: "TX" }, deedDate: "2020-01-01" }, [], { preForeclosure: false, landlord: false }, NOW).lists).toEqual([]);
    expect(toCsv(["a", "b"], [["x, y", 'say "hi"'], [1, undefined]])).toBe('a,b\n"x, y","say ""hi"""\n1,');
  });
});

describe("the sync and the Sellers lists", () => {
  test("reads every layer, matches homes, stacks them, and staff filter the lists", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const weatherford = await addHome(t, "807 W WEATHERFORD AV", { ownerOccupied: false, owner: "AWAY OWNER", mailing: { address: "1 OCEAN WAY", city: "MALIBU", state: "CA", zip: "90265" } });
    const jackson = await addHome(t, "604 S JACKSON ST");
    // Two homes "801 N D ST" and "801 S D ST": a code case at "801 D" can't say which.
    await addHome(t, "801 N D ST");
    await addHome(t, "801 S D ST");
    const howdy = await addHome(t, "2709 HOWDY DR", { deedDate: "1998-01-01" });
    await t.run(async (ctx) => {
      await ctx.db.insert("permits", { source: "midland", permitNumber: "RES-9", name: "Residential - Building", status: "Stop Work Order", address: "2709 HOWDY DR", county: "Midland", city: "Midland", appliedAt: "2026-09-01T00:00:00.000Z", trades: [], importedAt: "2026-09-01T00:00:00.000Z" });
      await ctx.db.insert("landlords", { county: "Midland", owner: "AWAY OWNER", homes: 6 });
    });

    const wheres: string[] = [];
    const codePages = [
      { features: [inspection("i1", "807 WEATHERFORD", "Deteriorated Structure", "2026-09-01T15:00:00Z"), inspection("i2", "807 WEATHERFORD", "Junk Vehicle", "2026-09-20T15:00:00Z")], exceededTransferLimit: true },
      { features: [inspection("i3", "807 WEATHERFORD", "Weeds/Tall Grass/Rubbish/Brush", "2026-10-01T15:00:00Z"), inspection("i4", "801 D", "Junk Vehicle", "2026-10-02T15:00:00Z")] },
    ];
    let codeCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      if (url.includes("Code_Cases")) {
        wheres.push(u.searchParams.get("where")!);
        return new Response(JSON.stringify(codePages[codeCalls++] ?? { features: [] }), { status: 200 });
      }
      if (url.includes("Dilapidated")) return new Response(JSON.stringify({ features: [{ attributes: { ID: "d1", Address: "604 S. Jackson", Date: Date.parse("2025-02-19T00:00:00Z") } }] }), { status: 200 });
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    }));

    // It starts and returns; the pages run as scheduled steps.
    expect(await t.action(internal.signals.syncMidland, {})).toEqual({ started: true, full: true });
    await t.finishAllScheduledFunctions(() => {});
    expect(wheres).toEqual(["1=1", "1=1"]);
    expect((await staff.as.query(api.signals.status, {})).source).toMatchObject({ fetched: 6, added: 6, updated: 0 });
    await t.run(async (ctx) => {
      const unmatched = (await ctx.db.query("signals").collect()).filter((s) => !s.parcelId).map((s) => s.address);
      expect(unmatched).toEqual(["801 D"]);
    });

    const all = await staff.as.query(api.signals.sellers, {});
    expect(all.homes.map((h) => [h.address, h.lists, h.score])).toEqual([
      ["807 W Weatherford Av", ["serious_violation", "repeat_violations", "out_of_state", "code_violation", "absentee", "landlord"], 10],
      ["2709 Howdy Dr", ["stalled_permit", "long_owned"], 3],
      ["604 S Jackson St", ["dilapidated"], 3],
    ]);
    expect(all.counts).toMatchObject({ absentee: 1, out_of_state: 1, dilapidated: 1, stalled_permit: 1, long_owned: 1 });
    expect([all.stacked, all.total]).toEqual([2, 3]);
    expect(all.homes[0]).toMatchObject({ owner: "Away Owner", mailing: { address: "1 OCEAN WAY", state: "CA" }, codeCases: 3, seriousCases: 1 });

    expect((await staff.as.query(api.signals.sellers, { lists: ["stalled_permit"] })).homes.map((h) => h.parcelId)).toEqual([howdy]);
    expect((await staff.as.query(api.signals.sellers, { lists: ["absentee", "code_violation"] })).homes.map((h) => h.parcelId)).toEqual([weatherford]);
    expect((await staff.as.query(api.signals.sellers, { minLists: 2 })).homes.map((h) => h.parcelId)).toEqual([weatherford, howdy]);

    // The export reads every matching home a page at a time, in score order.
    const exportAll = async (filters: { lists?: string[]; minLists?: number }) => {
      const ids = [];
      let cursor: string | null = null;
      for (;;) {
        const page: { page: Array<{ parcelId: string }>; isDone: boolean; continueCursor: string } = await staff.as.query(api.signals.sellersExport, {
          ...filters,
          paginationOpts: { numItems: 1, cursor },
        });
        ids.push(...page.page.map((h) => h.parcelId));
        if (page.isDone) return ids;
        cursor = page.continueCursor;
      }
    };
    expect(await exportAll({})).toEqual([weatherford, howdy, jackson]);
    expect(await exportAll({ minLists: 2 })).toEqual([weatherford, howdy]);
    expect(await exportAll({ lists: ["absentee", "code_violation"] })).toEqual([weatherford]);
    const first = await staff.as.query(api.signals.sellersExport, { paginationOpts: { numItems: 5, cursor: null } });
    expect(first.page[0]).toMatchObject({ address: "807 W Weatherford Av", owner: "Away Owner", mailing: { address: "1 OCEAN WAY", state: "CA" } });

    const detail = await staff.as.query(api.signals.home, { parcelId: weatherford });
    expect(detail!.signals.map((s) => s.detail)).toEqual(["Weeds/Tall Grass/Rubbish/Brush", "Junk Vehicle", "Deteriorated Structure"]);

    // The next day reads only the recent code cases, and a case closing is an update.
    codeCalls = 0;
    codePages.splice(0, 2, { features: [inspection("i1", "807 WEATHERFORD", "Deteriorated Structure", "2026-09-01T15:00:00Z", { STATUS: "Compliant" })] });
    expect(await t.action(internal.signals.syncMidland, {})).toEqual({ started: true, full: false });
    await t.finishAllScheduledFunctions(() => {});
    expect((await staff.as.query(api.signals.status, {})).source).toMatchObject({ added: 0, updated: 1 });
    expect(wheres[wheres.length - 1]).toMatch(/^CREATED_DATE >= DATE '2026-04-29/);
    // A clean run today: the deploy's run skips it.
    expect(await t.action(internal.signals.syncMidland, { ifStale: true })).toEqual({ skipped: true });

    // A home posted for the auction goes on the Pre-foreclosure list.
    await staff.as.mutation(api.foreclosures.addMany, { saleDate: "2026-11-03", kind: "mortgage", addresses: "604 S JACKSON ST" });
    await t.finishAllScheduledFunctions(() => {});
    expect((await staff.as.query(api.signals.sellers, { lists: ["pre_foreclosure"] })).homes.map((h) => h.parcelId)).toEqual([jackson]);

    // Only staff.
    const company = await signUp(t, "owner@roof.example");
    await expect(company.as.query(api.signals.sellers, {})).rejects.toThrow(/staff/);
    await expect(company.as.query(api.signals.sellersExport, { paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow(/staff/);
    await expect(company.as.action(api.signals.syncNow, {})).rejects.toThrow();
  });

  test("restacking every home drops ones on no list and recounts", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    await addHome(t, "1 A ST", { ownerOccupied: false });
    const settled = await addHome(t, "2 A ST", { ownerOccupied: false });
    await addHome(t, "3 A ST");
    await t.mutation(internal.signals.recomputePage, {});
    await t.finishAllScheduledFunctions(() => {});
    expect((await staff.as.query(api.signals.sellers, {})).total).toBe(2);
    // The owner moves back in: off the list at the next restack.
    await t.run(async (ctx) => ctx.db.patch(settled, { ownerOccupied: true }));
    await t.mutation(internal.signals.recomputePage, {});
    await t.finishAllScheduledFunctions(() => {});
    const after = await staff.as.query(api.signals.sellers, {});
    expect([after.total, after.counts.absentee]).toEqual([1, 1]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("distressLists").collect()).toHaveLength(1);
    });
  });
});
