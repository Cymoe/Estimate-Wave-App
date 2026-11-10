import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { ECTOR_ROLL, LUBBOCK_ROLL, ectorParcels, lubbockParcels, splitMailing } from "./lib/parcels";
import { QUERY_WAITS } from "./parcels";

const ECTOR_PAGE = ECTOR_ROLL.pageSize;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  ECTOR_ROLL.pageSize = ECTOR_PAGE;
});

const NOW = Date.parse("2026-11-05T15:00:00.000Z");
const feature = (attributes: Record<string, unknown>) => ({ attributes });

describe("Odessa's and Lubbock's rolls, read", () => {
  test("Ector's one-line mailing address is split into street, city, state and zip", () => {
    expect(splitMailing("80 SUGAR CREEK CENTER BLVD  SUGAR LAND TX 77478-3542")).toEqual({ address: "80 SUGAR CREEK CENTER BLVD", city: "SUGAR LAND", state: "TX", zip: "77478" });
    // One space all through: the city starts after the street's suffix, box number, direction or unit.
    expect(splitMailing("6977 KING RANCH RD ODESSA TX 79765")).toEqual({ address: "6977 KING RANCH RD", city: "ODESSA", state: "TX", zip: "79765" });
    expect(splitMailing("PO BOX 4458 ODESSA TX 797604458")).toEqual({ address: "PO BOX 4458", city: "ODESSA", state: "TX", zip: "79760" });
    expect(splitMailing("123 MAIN ST N ODESSA TX 79761")).toMatchObject({ address: "123 MAIN ST N", city: "ODESSA" });
    expect(splitMailing("1204 BROADWAY STE 103 LUBBOCK TX 79401")).toMatchObject({ address: "1204 BROADWAY STE 103", city: "LUBBOCK" });
    // Nothing to split on: the line is kept whole rather than guessed at.
    expect(splitMailing("605 EASY ROCK LANDING BROUSSARD LA 70518")).toEqual({ address: "605 EASY ROCK LANDING BROUSSARD", state: "LA", zip: "70518" });
    expect(splitMailing(undefined)).toEqual({});
  });

  test("Ector's parcels: kept uses in Midland's codes, at their PIN's address; sheds, deleted and unaddressed ones left off", () => {
    const addresses = new Map([
      ["1", "6977 KING RANCH RD"],
      ["2", "4281 N JOHN BEN SHEPPERD PKWY"],
      ["3", "10 ELM ST"],
      ["5", "12 ELM ST"],
    ]);
    const rows = ectorParcels(
      [
        feature({ PIN: "1", use_cd: "A1", owner_name: "PLASTERR GEOFFREY", owner_addr: "6977 KING RANCH RD ODESSA TX 79765", bxcm_val: 404321, land_val: 30840, dos: "2019-08-16", homestead: 0, deleted_flg: 0 }),
        feature({ PIN: "2", use_cd: "F5", owner_name: "MCM PROPERTIES II LTD", owner_addr: "80 SUGAR CREEK CENTER BLVD  SUGAR LAND TX 77478-3542", bxcm_val: 340479, land_val: 262219, dos: null, homestead: 0, deleted_flg: 0 }),
        // A shed on a lot.
        feature({ PIN: "3", use_cd: "A4", owner_name: "ROSALES AARON", owner_addr: "PO BOX 1123  ODESSA TX 79760-1123", bxcm_val: 26792 }),
        // No address point.
        feature({ PIN: "4", use_cd: "A1", owner_name: "NOBODY KNOWS", owner_addr: "1 MAIN ST  ODESSA TX 79761" }),
        // Deleted.
        feature({ PIN: "5", use_cd: "A1", owner_name: "GONE OWNER", owner_addr: "12 ELM ST  ODESSA TX 79761", deleted_flg: 1 }),
      ],
      addresses,
    );
    expect(rows).toEqual([
      {
        cadId: "Ector:1",
        pin: "1",
        useCode: "A1",
        siteAddress: "6977 KING RANCH RD",
        addressKey: "6977 KING RANCH RD",
        looseKey: "6977 KING RANCH",
        street: "KING RANCH RD",
        owner: "PLASTERR GEOFFREY",
        mailing: { address: "6977 KING RANCH RD", city: "ODESSA", state: "TX", zip: "79765" },
        marketValueCents: 40432100,
        buildingValueCents: 37348000 + 100,
        deedDate: "2019-08-16",
        ownerOccupied: true,
        companyOwned: false,
      },
      expect.objectContaining({ cadId: "Ector:2", useCode: "F1", companyOwned: true, ownerOccupied: false, deedDate: undefined, mailing: { address: "80 SUGAR CREEK CENTER BLVD", city: "SUGAR LAND", state: "TX", zip: "77478" } }),
    ]);
  });

  test("Lubbock's parcels: the roll's comma dropped from names, homestead as living there, no deed date", () => {
    const rows = lubbockParcels(
      [
        feature({ PIN: "28302", LCADID: "R87275", SPTB_CODE: "F1", OWNER_NAME: "DIRKS DIRT LLC", OWNER_ADDRESS: "1204 BROADWAY ", OWNER_ADDRESS2: "STE 103", OWNER_CITY: "LUBBOCK", OWNER_ST: "TX", OWNER_ZIP: "79401", TOTALVALUE: 306943, IMPVALUE: 280063 }),
        feature({ PIN: "14847", LCADID: "R92539", SPTB_CODE: "A1", OWNER_NAME: "WOOD, LEONARD W", OWNER_ADDRESS: "PO BOX 9", OWNER_CITY: "LUBBOCK", OWNER_ST: "TX", OWNER_ZIP: "79407-1234", TOTALVALUE: 87910, EXEMPTIONS: "HS;OA" }),
        // Farmland isn't kept.
        feature({ PIN: "1", LCADID: "R1", SPTB_CODE: "D1", OWNER_NAME: "FARMER JO", TOTALVALUE: 1 }),
      ],
      new Map([
        ["28302", "1636 13TH ST"],
        ["14847", "2802 YORK AVE"],
        ["1", "1 FIELD RD"],
      ]),
    );
    expect(rows.map((r) => [r.cadId, r.owner, r.siteAddress, r.useCode, r.mailing, r.ownerOccupied, r.companyOwned, r.marketValueCents, r.deedDate])).toEqual([
      ["Lubbock:R87275", "DIRKS DIRT LLC", "1636 13TH ST", "F1", { address: "1204 BROADWAY STE 103", city: "LUBBOCK", state: "TX", zip: "79401" }, false, true, 30694300, undefined],
      ["Lubbock:R92539", "WOOD LEONARD W", "2802 YORK AVE", "A1", { address: "PO BOX 9", city: "LUBBOCK", state: "TX", zip: "79407" }, true, false, 8791000, undefined],
    ]);
  });
});

/** The live layers, answered from memory: each parcel page, and each address layer by the PINs asked for. */
function fakeLayers(parcels: Record<string, Array<Record<string, unknown>>>, addresses: Record<string, Array<Record<string, unknown>>>) {
  const asked: Array<{ layer: string; params: URLSearchParams }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      const [base, search] = url.split("?");
      const layer = base.replace(/\/query$/, "");
      const params = new URLSearchParams(init?.body ?? search ?? "");
      asked.push({ layer, params });
      if (parcels[layer]) {
        const offset = Number(params.get("resultOffset") ?? 0);
        const size = Number(params.get("resultRecordCount"));
        const all = parcels[layer];
        const page = all.slice(offset, offset + size);
        return new Response(JSON.stringify({ features: page.map(feature), exceededTransferLimit: offset + size < all.length }), { status: 200 });
      }
      const pins = [...(params.get("where") ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
      const rows = (addresses[layer] ?? []).filter((a) => pins.includes(String(a.PIN)));
      return new Response(JSON.stringify({ features: rows.map(feature) }), { status: 200 });
    }),
  );
  return asked;
}

describe("Odessa and Lubbock, synced and listed", () => {
  test("Ector's roll is read in pages with its addresses, its owners built, and lists made there; Midland's untouched", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    // Pages of four here, of a thousand live: the read still has to page.
    ECTOR_ROLL.pageSize = 4;
    const ector = (pin: string, over: Record<string, unknown> = {}) => ({ PIN: pin, use_cd: "A1", owner_name: `OWNER ${pin}`, owner_addr: `${pin} ELM ST  ODESSA TX 79761`, bxcm_val: 200000, land_val: 20000, dos: "2015-01-02", homestead: 1, deleted_flg: 0, ...over });
    const roll = [
      // An investor with three Odessa properties.
      ...["1", "2", "3"].map((pin) => ector(pin, { owner_name: "PERMIAN RENTALS LLC", owner_addr: "PO BOX 50  ODESSA TX 79760", homestead: 0 })),
      // A shopping center.
      ector("4", { use_cd: "F1", owner_name: "GRANT PLAZA LTD", owner_addr: "1 MAIN ST  DALLAS TX 75201", bxcm_val: 3000000, homestead: 0 }),
      ...Array.from({ length: 3 }, (_, i) => ector(String(100 + i))),
      // West of town: only the utility district has its address.
      ector("T2S00-1", { owner_name: "LEWIS PATRICK", bxcm_val: 150000 }),
    ];
    const city = roll.filter((p) => p.PIN !== "T2S00-1").map((p) => ({ PIN: p.PIN, FULLADDR: `${p.PIN} ELM ST` }));
    const asked = fakeLayers({ [ECTOR_ROLL.layer]: roll }, { [ECTOR_ROLL.addresses[0].layer]: city, [ECTOR_ROLL.addresses[1].layer]: [{ PIN: "T2S00-1", PROP_LOC: "8348 W 42ND ST" }] });

    // The deploy's call schedules the read and returns at once.
    expect(await t.action(internal.parcels.syncCounty, { county: "Ector", ifStale: true, background: true })).toEqual({ scheduled: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const parcelAsks = asked.filter((a) => a.layer === ECTOR_ROLL.layer);
    expect(parcelAsks.map((a) => a.params.get("resultOffset"))).toEqual(["0", "4", "8"]);
    expect(parcelAsks[0].params.get("where")).toBe("use_cd IN ('A1','A2','A3','A5','A6','A7','B1','B2','F1','F2','F3','F5')");
    // The utility district is only asked for the PIN the city didn't have.
    const district = asked.filter((a) => a.layer === ECTOR_ROLL.addresses[1].layer);
    expect(district.map((a) => a.params.get("where"))).toEqual(["PIN IN ('T2S00-1')"]);
    await t.run(async (ctx) => {
      const parcels = await ctx.db.query("parcels").collect();
      expect(parcels).toHaveLength(roll.length);
      expect(parcels.every((p) => p.county === "Ector" && p.cadId.startsWith("Ector:"))).toBe(true);
      expect(parcels.find((p) => p.pin === "T2S00-1")!.siteAddress).toBe("8348 W 42ND ST");
      const read = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "ector-parcels")).unique();
      expect(read).toMatchObject({ fetched: roll.length, added: roll.length, lastAppliedAt: "2015-01-02" });
      expect(read!.error).toBeUndefined();
      // The finished read built Ector's owners.
      const built = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "ector-owners")).unique();
      expect(built!.error).toBeUndefined();
      expect(built!.fetched).toBe(roll.length);
    });
    // A clean read this week is skipped.
    expect(await t.action(internal.parcels.syncCounty, { county: "Ector", ifStale: true, background: true })).toEqual({ skipped: true });

    // Lists in Ector: the investor's why names the county; a Midland list finds nobody from Odessa.
    const co = await signUp(t, "owner@roof.example");
    await t.run(async (ctx) => {
      await ctx.db.patch(co.organizationId, {
        plan: { monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, status: "active", periodStart: "2026-10-01T00:00:00.000Z", nextChargeAt: "2026-12-01T00:00:00.000Z", claimsThisPeriod: 0 },
      });
    });
    const org = co.organizationId;
    const investors = await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Ector", who: "investor" } });
    expect(investors.rows.map((r) => [r.name, r.why])).toEqual([
      ["Permian Rentals LLC", "Owns 3 Ector properties, $600K on the roll"],
      ["Grant Plaza LTD", "Owns 1 Ector property (1 commercial building), $3M on the roll"],
    ]);
    const commercial = await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Ector", who: "commercial" } });
    expect(commercial).toMatchObject({ count: 1, total: 1 });
    expect(commercial.rows[0]).toMatchObject({ name: "Grant Plaza LTD", property: { address: "4 Elm St", useCode: "F1" } });
    expect((await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "commercial" } })).count).toBe(0);
    // The page offers Ector now its owners are in; Lubbock still waits.
    expect((await co.as.query(api.outreach.contacts, { organizationId: org })).readyCounties).toEqual(["Ector"]);
  });

  test("Lubbock's roll asks the address points for main addresses only; a failed read is recorded and builds nothing", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const asked = fakeLayers(
      { [LUBBOCK_ROLL.layer]: [{ PIN: "28302", LCADID: "R87275", SPTB_CODE: "F1", OWNER_NAME: "DIRKS DIRT LLC", OWNER_ADDRESS: "1204 BROADWAY", OWNER_CITY: "LUBBOCK", OWNER_ST: "TX", OWNER_ZIP: "79401", TOTALVALUE: 306943 }] },
      { [LUBBOCK_ROLL.addresses[0].layer]: [{ PIN: "28302", FULL_ADDRESS: "1636 13TH ST" }] },
    );
    expect(await t.action(internal.parcels.syncCounty, { county: "Lubbock" })).toMatchObject({ fetched: 1, added: 1 });
    expect(asked.find((a) => a.layer === LUBBOCK_ROLL.addresses[0].layer)!.params.get("where")).toBe("PIN IN ('28302') AND Master='MAIN'");
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.run(async (ctx) => {
      expect((await ctx.db.query("parcels").collect()).map((p) => [p.county, p.cadId, p.siteAddress])).toEqual([["Lubbock", "Lubbock:R87275", "1636 13TH ST"]]);
    });

    // A county server down: each query is tried three times, then the step is tried again a minute later, from where it stopped.
    QUERY_WAITS.splice(0, QUERY_WAITS.length, 0, 0, 0);
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (calls++, new Response("down", { status: 503 }))));
    expect(await t.action(internal.parcels.syncCounty, { county: "Lubbock" })).toMatchObject({ next: 0, error: "Lubbock owners: HTTP 503" });
    expect(calls).toBe(3);
    await t.run(async (ctx) => {
      // Not given up on yet: nothing recorded, the retry waiting.
      expect(await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "lubbock-parcels")).unique()).toMatchObject({ fetched: 1 });
      expect((await ctx.db.system.query("_scheduled_functions").collect()).filter((f) => f.state.kind === "pending").map((f) => f.args[0])).toEqual([
        { county: "Lubbock", offset: 0, totals: { fetched: 0, added: 0, updated: 0 }, failures: 1 },
      ]);
    });
    // The fifth failure in a row stops the read and says why.
    expect(await t.action(internal.parcels.syncCounty, { county: "Lubbock", offset: 0, failures: 4 })).toMatchObject({ error: "Lubbock owners: HTTP 503" });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "lubbock-parcels")).unique()).toMatchObject({ error: "Lubbock owners: HTTP 503" });
    });
    QUERY_WAITS.splice(0, QUERY_WAITS.length, 0, 2_000, 6_000);
  });
});
