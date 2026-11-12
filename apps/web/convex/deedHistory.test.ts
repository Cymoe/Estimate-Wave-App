import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.setup";
import { MIDLAND_DEEDS, deedHistory, parcelKind } from "./lib/parcels";
import { DEED_PACE } from "./parcels";

const pace = { ...DEED_PACE };
beforeEach(() => {
  DEED_PACE.waitMs = 0;
});
afterEach(() => {
  Object.assign(DEED_PACE, pace);
  vi.unstubAllGlobals();
});

/** The deed table as the appraisal district's page has it (a KO Storage parcel, copied from the live page). */
const table = (rows: string) => `
  <table class="propertyDetails" summary="Deed History">
    <thead><tr><th class="style4">Conveyance</th><th align="right">Volume</th><th align="right">Page</th><th align="right">Deed Date</th><th class="style4">Instrument</th></tr></thead>
    <tbody id="tableSale">${rows}</tbody>
  </table>
  <table><tbody id="tableTaxing"><tr><td align='left'>165</td><td align='left'>MIDLAND COUNTY</td><td align='right'>167,268</td><td align='right'>$0.144726</td><td align='right'>0.00144726</td></tr></tbody></table>`;
const KO_ROWS =
  "<tr><td align='left'>MIDLAND LOCK STORAGE LLC</td><td align='right'></td><td align='right'></td><td align='right'>11/15/2022</td><td align='left'>2022-32217</td></tr>" +
  "<tr bgcolor='#E7E7EF'><td align='left'>MIDLAND LOCK STORAGE LLC</td><td align='right'></td><td align='right'></td><td align='right'>11/15/2022</td><td align='left'>2022-32217</td></tr>" +
  "<tr><td align='left'>A-ALLRIGHT MINI STORAGE LLC</td><td align='right'></td><td align='right'></td><td align='right'>5/13/2021</td><td align='left'>2021-14913</td></tr>" +
  "<tr bgcolor='#E7E7EF'><td align='left'>HEJL W GOODRICH &</td><td align='right'></td><td align='right'></td><td align='right'>11/30/2015</td><td align='left'>2015-31384</td></tr>";

/** A roll row as the city's layer returns it. */
const roll = (over: Record<string, unknown> = {}) => ({
  attributes: {
    SU_NUM: "R1",
    PIN_1: "1",
    GOV_USE_CO: "F1",
    LAND_USE: "CWH03",
    SITE_NO: 4500,
    STREET_DIR: "W",
    STREET: "WALL ST",
    OWNER: "KOSF II MIDLAND LLC",
    OWNER2: " ",
    ADDRESS_1: "10301 WAYZATA BLVD",
    CITY_1: "MINNETONKA",
    STATE_1: "MN",
    ZIP: "55305",
    MKT_VALUE: 348000,
    BLDG_VALUE: 300000,
    DEED_DATE: "11/15/2022",
    ...over,
  },
});

/** The roll's layer answering with `features`, and the district's pages answering by property id. */
function stub(features: Array<ReturnType<typeof roll>>, pages: Record<string, () => Response>) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("https://iswdataclient.azurewebsites.net/")) {
        const id = new URL(url).searchParams.get("id")!;
        asked.push(id);
        return (pages[id] ?? (() => new Response("gone", { status: 404 })))();
      }
      if (url.includes("groupByFieldsForStatistics")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      return new Response(JSON.stringify({ features }), { status: 200 });
    }),
  );
  return asked;
}
const page = (rows: string) => () => new Response(`<html><body>${table(rows)}</body></html>`, { status: 200 });

describe("Midland's deed history", () => {
  test("the district's deed table becomes the owners before, newest first, each once", () => {
    expect(deedHistory(table(KO_ROWS))).toEqual([
      { seller: "MIDLAND LOCK STORAGE LLC", date: "2022-11-15", instrument: "2022-32217" },
      { seller: "A-ALLRIGHT MINI STORAGE LLC", date: "2021-05-13", instrument: "2021-14913" },
      // The page cuts a second owner off at "&".
      { seller: "HEJL W GOODRICH", date: "2015-11-30", instrument: "2015-31384" },
    ]);
    // Names with an ampersand written as the page writes it, a date that's no date, and a row with no name.
    expect(
      deedHistory(
        table(
          "<tr><td>MITCHELL ORVIL S &amp; RUTH</td><td></td><td></td><td>12/15/2021</td><td></td></tr>" +
            "<tr><td>OLD OWNER</td><td>123</td><td>45</td><td>&nbsp;</td><td>1999-1</td></tr>" +
            "<tr><td> </td><td></td><td></td><td>1/1/1990</td><td></td></tr>",
        ),
      ),
    ).toEqual([{ seller: "MITCHELL ORVIL S & RUTH", date: "2021-12-15" }, { seller: "OLD OWNER", instrument: "1999-1" }]);
    // A property with no deeds on file has an empty table; a page with no deed table isn't a property's page.
    expect(deedHistory(table(""))).toEqual([]);
    expect(deedHistory("<html><body>Property not found</body></html>")).toBeUndefined();
    expect(MIDLAND_DEEDS.page("R000029279")).toBe("https://iswdataclient.azurewebsites.net/webProperty.aspx?dbkey=MIDLANDCAD&id=R000029279");
  });

  test("a commercial parcel is storage, industrial or neither; a home never is", () => {
    expect(parcelKind({ useCode: "F1", landUse: "CWH03", owner: "KOSF II MIDLAND LLC" })).toBe("storage");
    expect(parcelKind({ useCode: "F1", owner: "A OK SELF STORAGE INC" })).toBe("storage");
    expect(parcelKind({ useCode: "F2", owner: "PERMIAN PIPE LLC" })).toBe("industrial");
    expect(parcelKind({ useCode: "F1", landUse: "CWH05", owner: "PERMIAN PIPE LLC" })).toBe("industrial");
    expect(parcelKind({ useCode: "F1", owner: "OAK PLAZA LLC" })).toBeUndefined();
    // A storage business's sales-tax permit at the address makes it storage, even an industrial lot.
    expect(parcelKind({ useCode: "F2", owner: "TANRIC INVESTMENTS LP" }, true)).toBe("storage");
    expect(parcelKind({ useCode: "A1", landUse: "CWH03", owner: "SMITH STORAGE" }, true)).toBeUndefined();
  });

  test("the roll read files storage and industrial parcels, and their deed history is read once, slowly, from the district", async () => {
    // The roll read schedules the history read; held here so each run is the test's own.
    vi.useFakeTimers();
    const t = setup();
    // A storage business sells from 900 RANKIN HWY: that makes the plain commercial lot there storage.
    await t.run(async (ctx) => {
      await ctx.db.insert("outlets", { county: "Midland", taxpayerNumber: "1", outletNumber: "1", name: "FAMILY RV & STORAGE", address: "900 RANKIN HWY", addressKey: "900 RANKIN HWY", city: "MIDLAND", naics: "531130", importedAt: "2026-01-01", seenAt: "2026-01-01" });
    });
    const features = [
      roll(),
      roll({ SU_NUM: "R2", SITE_NO: 4600, GOV_USE_CO: "F2", LAND_USE: "CID01", OWNER: "PERMIAN PIPE LLC", DEED_DATE: "3/1/2019" }),
      roll({ SU_NUM: "R3", SITE_NO: 900, STREET_DIR: "", STREET: "RANKIN HWY", LAND_USE: "CRT01", OWNER: "TANRIC INVESTMENTS LP", DEED_DATE: "" }),
      roll({ SU_NUM: "R4", SITE_NO: 12, LAND_USE: "CRT01", OWNER: "OAK PLAZA LLC" }),
      roll({ SU_NUM: "R5", SITE_NO: 14, GOV_USE_CO: "A1", LAND_USE: " ", OWNER: "LOZANO ZUNIGA CESAR E" }),
    ];
    const asked = stub(features, {
      R1: page(KO_ROWS),
      R2: page(""),
      // One parcel's page is broken; the next reads fine, so the trouble is that parcel's.
      R3: () => new Response("oops", { status: 500 }),
    });
    await t.action(internal.parcels.syncMidland, {});
    const kinds = await t.run(async (ctx) => Object.fromEntries((await ctx.db.query("parcels").collect()).map((p) => [p.cadId, p.kind])));
    expect(kinds).toEqual({ R1: "storage", R2: "industrial", R3: "storage", R4: undefined, R5: undefined });

    expect(await t.action(internal.parcels.readDeedHistory, {})).toEqual({ left: 0, read: 3, found: 1, blank: 1 });
    // Only the storage and industrial parcels were asked for.
    expect([...asked].sort()).toEqual(["R1", "R2", "R3"]);
    await t.run(async (ctx) => {
      const by = Object.fromEntries((await ctx.db.query("parcels").collect()).map((p) => [p.cadId, p]));
      expect(by.R1.deeds?.map((d) => d.seller)).toEqual(["MIDLAND LOCK STORAGE LLC", "A-ALLRIGHT MINI STORAGE LLC", "HEJL W GOODRICH"]);
      expect(by.R1.deedsReadFor).toBe("2022-11-15");
      // No deeds on the page.
      expect(by.R2).toMatchObject({ deeds: [], deedsReadFor: "2019-03-01" });
      // The broken page (and no deed on the roll): marked read, with nothing.
      expect(by.R3.deedsReadFor).toBe("");
      expect(by.R3.deeds).toBeUndefined();
      expect(by.R4.deedsReadFor).toBeUndefined();
      const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-deeds")).unique();
      expect(sync).toMatchObject({ fetched: 3, added: 1, updated: 1 });
      expect(sync!.error).toBeUndefined();
    });
    expect(await t.query(internal.parcels.deedCoverage, {})).toEqual({
      storage: { parcels: 2, read: 2, withHistory: 1, sellers: 3 },
      industrial: { parcels: 1, read: 1, withHistory: 0, sellers: 0 },
    });
    expect(await t.query(internal.parcels.deedsOf, { owner: "kosf" })).toMatchObject([{ owner: "KOSF II MIDLAND LLC", address: "4500 W WALL ST", kind: "storage", read: true }]);

    // Nothing is asked for again until a parcel changes hands.
    asked.length = 0;
    expect(await t.action(internal.parcels.readDeedHistory, {})).toMatchObject({ read: 0, found: 0 });
    expect(asked).toEqual([]);
    features[0] = roll({ OWNER: "NEW STORAGE BUYER LLC", DEED_DATE: "6/1/2026" });
    await t.action(internal.parcels.syncMidland, {});
    // The roll read keeps the history it had until the new one is read.
    expect(await t.run(async (ctx) => (await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", "R1")).unique())!.deeds?.length)).toBe(3);
    expect(await t.action(internal.parcels.readDeedHistory, {})).toMatchObject({ read: 1, found: 1 });
    expect(asked).toEqual(["R1"]);
    vi.useRealTimers();
  });

  test("a refusal stops the read where it is; a run of unreadable pages is tried again later, then recorded", async () => {
    vi.useFakeTimers();
    const t = setup();
    const features = [1, 2, 3, 4, 5, 6].map((n) => roll({ SU_NUM: `R${n}`, SITE_NO: 4500 + n }));
    const asked = stub(features, { R1: () => new Response("slow down", { status: 429 }) });
    await t.action(internal.parcels.syncMidland, {});
    asked.length = 0;
    const refused = await t.action(internal.parcels.readDeedHistory, {});
    expect(refused.error).toBe("Midland deed history: the district's site refused the read (HTTP 429)");
    // One page asked, and no more: nothing is retried or worked around.
    expect(asked).toHaveLength(1);
    await t.run(async (ctx) => {
      expect((await ctx.db.query("parcels").collect()).every((p) => p.deedsReadFor === undefined)).toBe(true);
      const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-deeds")).unique();
      expect(sync!.error).toContain("refused");
    });

    // Every page missing: five in a row and the step stops, to be tried again in a minute; nothing is marked read.
    asked.length = 0;
    stub(features, {});
    const broken = await t.action(internal.parcels.readDeedHistory, {});
    expect(broken.error).toBe("Midland deed history: 5 pages in a row couldn't be read (HTTP 404)");
    expect(broken.read).toBe(0);
    await t.run(async (ctx) => {
      expect((await ctx.db.query("parcels").collect()).every((p) => p.deedsReadFor === undefined)).toBe(true);
    });
    vi.useRealTimers();
  });
});
