import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.setup";
import { DEED_PACE, MIDLAND_OWNERS_SOURCE } from "./parcels";
import { rowsToParcels } from "./lib/parcels";

const pace = { ...DEED_PACE };
beforeEach(() => {
  DEED_PACE.waitMs = 0;
  vi.useFakeTimers({ now: Date.parse("2026-11-12T12:00:00Z"), toFake: ["Date"] });
});
afterEach(() => {
  Object.assign(DEED_PACE, pace);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The district's property page, the parts read: who owns it, where the bill goes, and the deeds, newest first. */
const page = (owner: string, mail: string, deeds: Array<[string, string]>) => () =>
  new Response(
    `<html><body><table><tr><td id="webprop_name">${owner}</td></tr><tr><td id="webprop_mailaddress">${mail}</td></tr></table>
     <table><tbody id="tableBld"><tr><td>101</td><td>RES</td><td>RESIDENCE</td></tr></tbody></table>
     <table><tbody id="tableSale">${deeds.map(([who, date]) => `<tr><td align='left'>${who}</td><td></td><td></td><td align='right'>${date}</td><td>2026-1</td></tr>`).join("")}</tbody></table></body></html>`,
    { status: 200 },
  );

/** The district's site by property id; `asked` is every id requested, in order. */
function district(pages: Record<string, () => Response>) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = new URL(url).searchParams.get("id")!;
      asked.push(id);
      return (pages[id] ?? (() => new Response("gone", { status: 404 })))();
    }),
  );
  return asked;
}

const home = (cadId: string, siteAddress: string, owner: string, over: Record<string, unknown> = {}) => ({
  county: "Midland", cadId, useCode: "A1", siteAddress, addressKey: siteAddress, looseKey: siteAddress, owner, mailing: { address: siteAddress, city: "MIDLAND", state: "TX", zip: "79705" },
  ownerOccupied: true, companyOwned: false, deedDate: "2019-06-27", importedAt: "2026-01-01T00:00:00.000Z", ...over,
});
const parcels = (t: ReturnType<typeof setup>) => t.run(async (ctx) => Object.fromEntries((await ctx.db.query("parcels").collect()).map((p) => [p.cadId, p])));
const state = (t: ReturnType<typeof setup>) => t.query(internal.permits.sourceState, { source: MIDLAND_OWNERS_SOURCE });

describe("who owns each Midland parcel today, from the appraisal district", () => {
  test("a sold house takes its new owner; the same owner takes a new mailing address; the rest are only marked read", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("parcels", home("R000000001", "100 ASH ST", "PRATHER DEAN"));
      await ctx.db.insert("parcels", home("R000000002", "200 BIRCH ST", "MATHES JOE", { owner2: "MATHES MARY" }));
      await ctx.db.insert("parcels", home("R000000003", "300 CEDAR ST", "WIGGINS LESLIE D"));
      await ctx.db.insert("parcels", home("R000000004", "400 DATE ST", "RETIRED ID"));
      // Another county's parcel, and one only BatchData has, have no page at this district.
      await ctx.db.insert("parcels", home("R123456", "1 A ST", "LUBBOCK OWNER", { county: "Lubbock" }));
      await ctx.db.insert("parcels", home("bd:abc", "2 B ST", "VENDOR ONLY", { source: "batchdata" }));
    });
    const asked = district({
      // Sold in April to a company that gets its mail elsewhere.
      R000000001: page("SAUM HOLDINGS LLC", "PO BOX 9<br/>ODESSA, TX 79760-1234", [["PRATHER DEAN", "4/30/2026"], ["MARTIN TRUST", "9/22/2022"]]),
      // The same two owners, written on one line.
      R000000002: page("MATHES JOE & MARY", "200 BIRCH ST<br/>MIDLAND, TX 79705", [["SMITH JOHN", "6/27/2019"]]),
      // The same owner, whose bill goes to Austin now.
      R000000003: page("WIGGINS LESLIE D", "16304 FM 1325 APT 6105<br/>AUSTIN, TX 78728", [["SMITH JOHN", "6/27/2019"]]),
    });
    const result = await t.action(internal.parcels.refreshOwners, {});
    expect(result).toEqual({ done: true, read: 4, sold: 1, moved: 1, unreadable: 1 });
    expect(asked.slice().sort()).toEqual(["R000000001", "R000000002", "R000000003", "R000000004"]);
    const now = await parcels(t);
    expect(now.R000000001).toMatchObject({
      owner: "SAUM HOLDINGS LLC", mailing: { address: "PO BOX 9", city: "ODESSA", state: "TX", zip: "79760" }, deedDate: "2026-04-30", ownerOccupied: false, companyOwned: true, districtAt: "2026-11-12T12:00:00.000Z",
    });
    expect(now.R000000002).toMatchObject({ owner: "MATHES JOE", owner2: "MATHES MARY", mailing: { address: "200 BIRCH ST" }, deedDate: "2019-06-27", districtAt: expect.any(String) });
    expect(now.R000000003).toMatchObject({ owner: "WIGGINS LESLIE D", mailing: { address: "16304 FM 1325 APT 6105", city: "AUSTIN", zip: "78728" }, ownerOccupied: false });
    // No page under that id any more: marked read, left as it was.
    expect(now.R000000004).toMatchObject({ owner: "RETIRED ID", districtAt: expect.any(String) });
    expect(now.R123456.districtAt).toBeUndefined();
    expect(now["bd:abc"].districtAt).toBeUndefined();
    expect(await state(t)).toMatchObject({ fetched: 4, added: 1, updated: 1, lastAppliedAt: "2026-11-12T12:00:00.000Z" });
    expect((await state(t))?.error).toBeUndefined();

    // Read again the same day: nothing is due, and the district isn't asked.
    asked.length = 0;
    expect(await t.action(internal.parcels.refreshOwners, {})).toEqual({ done: true, read: 0, sold: 0, moved: 0, unreadable: 0 });
    expect(asked).toEqual([]);
    // A month on, every page is read again.
    vi.setSystemTime(Date.parse("2026-12-20T12:00:00Z"));
    expect(await t.action(internal.parcels.refreshOwners, {})).toMatchObject({ done: true, read: 4, sold: 0 });
  });

  test("the city's weekly read doesn't put the old owner back, until it has a newer deed of its own", async () => {
    const t = setup();
    const roll = (over: Record<string, unknown> = {}) =>
      rowsToParcels([{ attributes: { SU_NUM: "R000000001", PIN_1: "1", GOV_USE_CO: "A1", LAND_USE: " ", SITE_NO: 100, STREET_DIR: " ", STREET: "ASH ST", OWNER: "PRATHER DEAN", OWNER2: " ", ADDRESS_1: "100 ASH ST", CITY_1: "MIDLAND", STATE_1: "TX", ZIP: "79705", MKT_VALUE: 250000, BLDG_VALUE: 200000, DEED_DATE: "9/22/2022", ...over } }]);
    await t.mutation(internal.parcels.upsert, { rows: roll() });
    district({ R000000001: page("SAUM ANDREW RYAN", "9 AUBURN CT<br/>MIDLAND, TX 79705", [["PRATHER DEAN", "4/30/2026"]]) });
    await t.action(internal.parcels.refreshOwners, {});
    // The city's layer still has last year's owner, and a new value.
    expect(await t.mutation(internal.parcels.upsert, { rows: roll({ MKT_VALUE: 260000 }) })).toEqual({ added: 0, updated: 1 });
    expect((await parcels(t)).R000000001).toMatchObject({ owner: "SAUM ANDREW RYAN", mailing: { address: "9 AUBURN CT" }, deedDate: "2026-04-30", marketValueCents: 26_000_000 });
    // Nothing new on the city's side: nothing written.
    expect(await t.mutation(internal.parcels.upsert, { rows: roll({ MKT_VALUE: 260000 }) })).toEqual({ added: 0, updated: 0 });
    // The layer catches up past the district's last read: its newer deed wins.
    await t.mutation(internal.parcels.upsert, { rows: roll({ OWNER: "LATER BUYER LLC", ADDRESS_1: "PO BOX 5", DEED_DATE: "8/1/2026" }) });
    expect((await parcels(t)).R000000001).toMatchObject({ owner: "LATER BUYER LLC", mailing: { address: "PO BOX 5" }, deedDate: "2026-08-01", companyOwned: true });
    // The layer's short zip gets its leading zero back.
    expect(roll({ ZIP: "7731" })[0].mailing.zip).toBe("07731");
  });

  test("a refusal stops the pass where it is; a run of unreadable pages is tried again later; one pass at a time", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      for (let i = 1; i <= 7; i++) await ctx.db.insert("parcels", home(`R00000000${i}`, `${i}00 ASH ST`, `OWNER ${i}`));
    });
    let asked = district({ R000000001: () => new Response("slow down", { status: 429 }), R000000002: () => new Response("slow down", { status: 429 }) });
    const refused = await t.action(internal.parcels.refreshOwners, {});
    expect(refused.error).toBe("Midland owners: the district's site refused the read (HTTP 429)");
    expect(asked).toHaveLength(1);
    expect(Object.values(await parcels(t)).every((p) => p.districtAt === undefined)).toBe(true);
    expect((await state(t))?.error).toContain("refused");

    // Every page unreadable (the site down): five in a row and the step stops, to be tried again in a minute; nothing is marked read.
    asked = district({});
    const down = await t.action(internal.parcels.refreshOwners, {});
    expect(down.error).toBe("Midland owners: 5 pages in a row couldn't be read (HTTP 404)");
    expect(asked).toHaveLength(5);
    expect(Object.values(await parcels(t)).every((p) => p.districtAt === undefined)).toBe(true);
    // That pass is still under way (its next try is scheduled): a second one isn't started beside it.
    expect(await state(t)).toMatchObject({ lastAppliedAt: "running" });
    expect(await t.action(internal.parcels.refreshOwners, {})).toMatchObject({ running: true });
    expect(await t.action(internal.parcels.refreshOwners, { background: true })).toMatchObject({ running: true });
  });
});
