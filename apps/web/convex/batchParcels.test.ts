import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.setup";
import { batchDeeds, batchParcel, findBody, searchBody, searchResults } from "./lib/batchProperty";
import { parcelKind, vendorKind } from "./lib/parcels";
import { batchSource } from "./batchParcels";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** A property as BatchData's field definitions give it: Atlas Self Storage's old place, bought by KO Storage. */
const property = (over: Record<string, unknown> = {}) => ({
  _id: "abc123",
  address: { street: "200 S Norman St", city: "Midland", state: "TX", zip: "79701", county: "Midland", countyFipsCode: "48329" },
  ids: { apn: "R000004331" },
  owner: {
    fullName: "Kosf II Midland LLC",
    names: [{ full: "Kosf II Midland LLC" }],
    mailingAddress: { street: "10301 Wayzata Blvd", city: "Minnetonka", state: "MN", zip: "55305-1234" },
    ownerOccupied: false,
  },
  general: { propertyTypeCategory: "Commercial", propertyTypeDetail: "Mini-Warehouse or Self-Storage", standardizedLandUseCode: "C32" },
  assessment: { totalMarketValue: 1_250_000, improvementMarketValue: 900_000 },
  sale: { lastSale: { saleDate: "2023-06-01T00:00:00.000Z", documentType: "Warranty Deed" } },
  quickLists: { cashBuyer: true },
  deedHistory: [
    { sellers: ["HEJL BETTY TR"], buyers: ["PROPERTY RENEGADES LLC"], saleDate: "2022-03-31T00:00:00.000Z", documentType: "Warranty Deed" },
    { sellers: ["Property Renegades LLC"], buyers: ["KOSF II MIDLAND LLC"], recordingDate: "2023-06-01T00:00:00.000Z", documentType: "Warranty Deed" },
    { sellers: ["Property Renegades LLC"], buyers: ["KOSF II MIDLAND LLC"], saleDate: "2023-06-01T00:00:00.000Z", documentType: "Correction Document" },
    { sellers: [], buyers: ["HEJL JEROME C"], saleDate: "2010-04-08T00:00:00.000Z" },
  ],
  ...over,
});

const answer = (properties: unknown[], found = properties.length) => ({ status: { code: 200 }, results: { properties, meta: { results: { resultsFound: found, resultCount: properties.length } } } });

/** BatchData's search, answering each request's skip with that page; every request body is kept. */
function stub(pages: unknown[][], found?: number) {
  const asked: Array<{ url: string; auth: string | null; body: { searchCriteria: Record<string, unknown>; options: { skip: number; take: number } } }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      asked.push({ url, auth: new Headers(init.headers).get("Authorization"), body });
      const all = pages.flat();
      const page = body.options.take === 0 ? [] : all.slice(body.options.skip, body.options.skip + body.options.take);
      return new Response(JSON.stringify(answer(page, found ?? all.length)), { status: 200 });
    }),
  );
  return asked;
}

describe("BatchData's records as parcels", () => {
  test("its land use codes say storage or industrial", () => {
    expect(vendorKind("C32")).toBe("storage");
    expect(vendorKind("I4")).toBe("industrial");
    expect(vendorKind("I24")).toBe("industrial");
    // A road or an airport is filed as industrial there, and isn't a building.
    expect(vendorKind("I52")).toBeUndefined();
    expect(vendorKind("C51")).toBeUndefined();
    expect(vendorKind(undefined)).toBeUndefined();
    // On a commercial parcel the roll's own codes don't settle, BatchData's does.
    expect(parcelKind({ useCode: "F1", owner: "SMITH JOHN" })).toBeUndefined();
    expect(parcelKind({ useCode: "F1", owner: "SMITH JOHN", vendorUse: "C32" })).toBe("storage");
    expect(parcelKind({ useCode: "F1", owner: "SMITH JOHN", vendorUse: "I4" })).toBe("industrial");
    expect(parcelKind({ useCode: "A1", owner: "SMITH JOHN", vendorUse: "C32" })).toBeUndefined();
  });

  test("the searches ask for a county's storage by code and its industrial by category", () => {
    expect(searchBody("Midland", "storage")).toEqual({
      searchCriteria: { query: "Midland County, TX", general: { standardizedLandUseCode: { equals: "C32" } } },
      options: { skip: 0, take: 100 },
    });
    expect(searchBody("Ector", "industrial", 200, 50)).toEqual({
      searchCriteria: { query: "Ector County, TX", general: { propertyTypeCategory: { equals: "Industrial" } } },
      options: { skip: 200, take: 50 },
    });
    expect(findBody("Midland", { ownerWord: "KOSF" }).searchCriteria).toEqual({ query: "Midland County, TX", owner: { lastName: { containsWords: "KOSF" } } });
    expect(findBody("Midland", { street: "200 S Norman St", city: "Midland" }).searchCriteria).toEqual({
      query: "Midland County, TX",
      address: { street: { equals: "200 S Norman St" }, city: { equals: "Midland" }, state: { equals: "TX" } },
    });
  });

  test("a property becomes a parcel row with its owner, mailing address, value and purchase", () => {
    const got = batchParcel(property(), "storage", Date.parse("2026-11-12"));
    expect(got?.row).toEqual({
      cadId: "bd:abc123",
      pin: "R000004331",
      useCode: "F1",
      siteAddress: "200 S NORMAN ST",
      addressKey: "200 S NORMAN ST",
      looseKey: "200 NORMAN",
      street: "S NORMAN ST",
      owner: "KOSF II MIDLAND LLC",
      mailing: { address: "10301 WAYZATA BLVD", city: "MINNETONKA", state: "MN", zip: "55305" },
      ownerOccupied: false,
      companyOwned: true,
      marketValueCents: 125_000_000,
      buildingValueCents: 90_000_000,
      deedDate: "2023-06-01",
    });
    expect(got).toMatchObject({ vendorUse: "C32", cashBuyer: true, apn: "R000004331" });
    // An industrial building reads as one to the rest of the app.
    expect(batchParcel(property({ general: { standardizedLandUseCode: "I4" } }), "industrial")?.row.useCode).toBe("F2");
    // With no code on the record, what the search asked for decides.
    expect(batchParcel(property({ general: {} }), "industrial")?.row.useCode).toBe("F2");
    // Nothing to keep without an owner or a street address.
    expect(batchParcel(property({ owner: {} }), "storage")).toBeUndefined();
    expect(batchParcel(property({ address: { city: "Midland" } }), "storage")).toBeUndefined();
  });

  test("the deed history is the sellers, newest first, a deed and its correction once", () => {
    expect(batchDeeds(property().deedHistory, Date.parse("2026-11-12"))).toEqual([
      { seller: "PROPERTY RENEGADES LLC", date: "2023-06-01", instrument: "Warranty Deed" },
      { seller: "HEJL BETTY TR", date: "2022-03-31", instrument: "Warranty Deed" },
    ]);
    expect(batchDeeds(undefined)).toEqual([]);
    expect(batchDeeds([{ sellers: ["A", "B"], saleDate: "9202-01-01" }])).toEqual([{ seller: "A & B" }]);
  });

  test("an answer's properties and how many match in all", () => {
    expect(searchResults(answer([1, 2], 40))).toEqual({ properties: [1, 2], found: 40 });
    expect(searchResults({})).toEqual({ properties: [], found: undefined });
  });
});

describe("pulling a county from BatchData", () => {
  const parcel = { county: "Midland", useCode: "F1", ownerOccupied: false, companyOwned: true, mailing: {}, importedAt: "2026-01-01T00:00:00.000Z" };

  test("without a key nothing is asked and the reason is recorded", async () => {
    const t = setup();
    const asked = stub([[property()]]);
    const result = await t.action(internal.batchParcels.pull, { county: "Midland", kind: "storage" });
    expect(result.error).toMatch(/BATCHDATA_API_KEY/);
    expect(asked).toHaveLength(0);
    expect(await t.action(internal.batchParcels.count, { county: "Midland" })).toEqual({ error: expect.stringMatching(/BATCHDATA_API_KEY/) });
    const state = await t.query(internal.permits.sourceState, { source: batchSource("Midland", "storage") });
    expect(state?.error).toMatch(/BATCHDATA_API_KEY/);
  });

  test("a parcel the roll lacks is added with its deed history; one it has gains the code, the cash flag and the history", async () => {
    vi.useFakeTimers();
    vi.stubEnv("BATCHDATA_API_KEY", "test-key");
    const t = setup();
    // The roll has 60 Industrial Loop under the district's id, with no land code that says storage.
    await t.run(async (ctx) => {
      await ctx.db.insert("parcels", { ...parcel, cadId: "R000111", siteAddress: "60 INDUSTRIAL LOOP", addressKey: "60 INDUSTRIAL LP", owner: "PLAINS HOLDINGS LLC" });
    });
    const asked = stub([
      [
        property(),
        property({
          _id: "def456",
          ids: { apn: "00012345" },
          address: { street: "60 Industrial Loop", city: "Midland", state: "TX" },
          owner: { fullName: "Plains Holdings LLC", mailingAddress: { street: "PO Box 1", city: "Midland", state: "TX", zip: "79702" } },
          quickLists: { cashBuyer: false },
          deedHistory: [{ sellers: ["MITCHELL ORVIL S & RUTH"], saleDate: "2021-12-15T00:00:00.000Z" }],
        }),
      ],
    ]);
    const result = await t.action(internal.batchParcels.pull, { county: "Midland", kind: "storage" });
    expect(result).toMatchObject({ fetched: 2, added: 1, matched: 1, found: 2 });
    expect(asked[0]).toMatchObject({ url: "https://api.batchdata.com/api/v1/property/search", auth: "Bearer test-key" });
    const parcels = await t.run((ctx) => ctx.db.query("parcels").collect());
    expect(parcels).toHaveLength(2);
    const atlas = parcels.find((p) => p.cadId === "bd:abc123");
    expect(atlas).toMatchObject({ county: "Midland", source: "batchdata", kind: "storage", vendorUse: "C32", cashBuyer: true, owner: "KOSF II MIDLAND LLC", deedsReadFor: "2023-06-01" });
    expect(atlas?.deeds?.[0]).toEqual({ seller: "PROPERTY RENEGADES LLC", date: "2023-06-01", instrument: "Warranty Deed" });
    const roll = parcels.find((p) => p.cadId === "R000111");
    expect(roll).toMatchObject({ kind: "storage", vendorUse: "C32", cashBuyer: false, deeds: [{ seller: "MITCHELL ORVIL S & RUTH", date: "2021-12-15" }] });
    expect(roll?.source).toBeUndefined();
    // The district's deed read leaves BatchData's own parcel alone: its id isn't the district's.
    const due = await t.query(internal.parcels.deedsDue, { limit: 10 });
    expect(due.due.map((d) => d.cadId)).toEqual(["R000111"]);
    const state = await t.query(internal.permits.sourceState, { source: batchSource("Midland", "storage") });
    expect(state).toMatchObject({ fetched: 2, added: 1, updated: 1 });
    expect(state?.error).toBeUndefined();

    // Read again: nothing is added twice. Once the roll has the parcel, BatchData's copy goes.
    await t.run(async (ctx) => {
      await ctx.db.insert("parcels", { ...parcel, cadId: "R000004331", siteAddress: "200 S NORMAN", addressKey: "200 S NORMAN", owner: "KOSF II MIDLAND LLC" });
    });
    const again = await t.action(internal.batchParcels.pull, { county: "Midland", kind: "storage" });
    expect(again).toMatchObject({ fetched: 2, added: 0, matched: 2 });
    const after = await t.run((ctx) => ctx.db.query("parcels").collect());
    expect(after.map((p) => p.cadId).sort()).toEqual(["R000004331", "R000111"]);
    expect(after.find((p) => p.cadId === "R000004331")).toMatchObject({ kind: "storage", vendorUse: "C32", cashBuyer: true });
  });

  test("a pull reads page after page and stops at its ceiling", async () => {
    vi.useFakeTimers();
    vi.stubEnv("BATCHDATA_API_KEY", "test-key");
    const t = setup();
    const many = Array.from({ length: 230 }, (_, i) => property({ _id: `p${i}`, ids: {}, address: { street: `${100 + i} Garden City Hwy`, city: "Midland", state: "TX" }, owner: { fullName: "Permian Yards LLC" }, general: { standardizedLandUseCode: "I4" }, deedHistory: [] }));
    const asked = stub([many]);
    const capped = await t.action(internal.batchParcels.pull, { county: "Midland", kind: "industrial", max: 150 });
    expect(capped).toMatchObject({ fetched: 150, added: 150, found: 230, capped: true });
    expect(asked.map((a) => [a.body.options.skip, a.body.options.take])).toEqual([[0, 100], [100, 50]]);
    const state = await t.query(internal.permits.sourceState, { source: batchSource("Midland", "industrial") });
    expect(state?.error).toMatch(/Stopped at 150 of 230/);
    const all = await t.action(internal.batchParcels.pull, { county: "Midland", kind: "industrial" });
    expect(all).toMatchObject({ fetched: 230, added: 80, found: 230 });
    expect(all.capped).toBeUndefined();
    expect(await t.run(async (ctx) => (await ctx.db.query("parcels").collect()).filter((p) => p.kind === "industrial").length)).toBe(230);
  });

  test("a refused key stops the pull; counting and finding read nothing into the app", async () => {
    vi.stubEnv("BATCHDATA_API_KEY", "bad-key");
    const t = setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"status":{"code":401,"message":"Invalid token"}}', { status: 401 })));
    const refused = await t.action(internal.batchParcels.pull, { county: "Midland", kind: "storage" });
    expect(refused.error).toMatch(/HTTP 401/);
    expect(fetch).toHaveBeenCalledTimes(1);

    const asked = stub([[property()]], 97);
    expect(await t.action(internal.batchParcels.count, { county: "Midland" })).toEqual({ storage: 97, industrial: 97 });
    expect(asked.map((a) => a.body.options.take)).toEqual([0, 0]);
    const found = await t.action(internal.batchParcels.find, { county: "Midland", ownerWord: "KOSF" });
    expect(found).toMatchObject({ found: 97, properties: [{ owner: "KOSF II MIDLAND LLC", address: "200 S Norman St, Midland", use: "C32 Mini-Warehouse or Self-Storage", bought: "2023-06-01", cash: true, before: ["PROPERTY RENEGADES LLC (2023-06-01)", "HEJL BETTY TR (2022-03-31)"] }] });
    expect(await t.action(internal.batchParcels.find, { county: "Midland" })).toEqual({ error: expect.stringMatching(/Say who or where/) });
    expect(await t.run((ctx) => ctx.db.query("parcels").collect())).toHaveLength(0);
  });
});
