import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { addressKey } from "./lib/parcels";
import { kindOfBusiness, outletsQuery, rowsToOutlets } from "./lib/outlets";
import { isOccupancy, rowsToPermits } from "./lib/permits";

afterEach(() => {
  vi.unstubAllGlobals();
});

const soda = (taxpayer_number: string, outlet_name: string, outlet_address: string, over: Record<string, unknown> = {}) => ({
  taxpayer_number,
  taxpayer_name: outlet_name,
  taxpayer_address: "PO BOX 9",
  taxpayer_city: "MIDLAND",
  taxpayer_state: "TX",
  taxpayer_zip_code: "79702-0009",
  outlet_number: "00001",
  outlet_name,
  outlet_address,
  outlet_city: "MIDLAND",
  outlet_zip_code: "79705",
  outlet_naics_code: "448120",
  outlet_permit_issue_date: "2026-09-15T00:00:00.000",
  outlet_first_sales_date: "2026-10-20T00:00:00.000",
  ...over,
});

describe("the Comptroller's sales-tax permits", () => {
  test("rows become outlets: the business, where it sells, when it started, the taxpayer behind it and where its mail goes", () => {
    const rows = rowsToOutlets([
      soda("1", "BLUE DOOR BOUTIQUE", "30  WADLEY AV", { taxpayer_name: "RIVERA ELENA" }),
      // No first-sales date yet: the permit's date stands in. No outlet name: the taxpayer's.
      soda("2", "TACO LOCO LLC", "31 WADLEY AV", { outlet_first_sales_date: null, outlet_name: undefined, outlet_naics_code: "722511", taxpayer_address: undefined, taxpayer_city: undefined }),
      // Nothing to place it by.
      soda("3", "GHOST", "", {}),
    ]);
    expect(rows).toEqual([
      { taxpayerNumber: "1", outletNumber: "00001", name: "BLUE DOOR BOUTIQUE", address: "30 WADLEY AV", city: "MIDLAND", zip: "79705", naics: "448120", at: "2026-10-20T00:00:00.000Z", taxpayer: "RIVERA ELENA", mailing: { address: "PO BOX 9", city: "MIDLAND", state: "TX", zip: "79702" } },
      { taxpayerNumber: "2", outletNumber: "00001", name: "TACO LOCO LLC", address: "31 WADLEY AV", city: "MIDLAND", zip: "79705", naics: "722511", at: "2026-09-15T00:00:00.000Z", taxpayer: "TACO LOCO LLC" },
    ]);
    expect(outletsQuery("Midland", 2000, 1000)).toBe("https://data.texas.gov/resource/jrea-zgmq.json?%24where=upper%28outlet_city%29%3D%27MIDLAND%27&%24order=taxpayer_number%2Coutlet_number&%24limit=1000&%24offset=2000");
    expect([kindOfBusiness("722511"), kindOfBusiness("722410"), kindOfBusiness("448120"), kindOfBusiness("812112"), kindOfBusiness("236220"), kindOfBusiness("999"), kindOfBusiness(undefined)]).toEqual(["restaurant", "bar", "retail", "salon", "contractor", undefined, undefined]);
  });

  test("a certificate of occupancy is kept as a permit that says who moved in, but is no job: not stalled, not in the Webb Report", async () => {
    const feature = (PermitNumber: string, Name: string, PermitWorkClass: string, extra: Record<string, unknown> = {}) => ({
      attributes: { PermitNumber, PermitStatus: "Issued", Name, PermitWorkClass, Description: Name, Address: "30 WADLEY AV", ApplyDate: Date.parse("2026-10-15T15:00:00Z"), ...extra },
    });
    const rows = rowsToPermits([feature("CO-1", "Certificate of Occupancy", "Certificate of Occupancy", { Description1: "  Blue Door   Boutique " }), feature("SGN-1", "Sign", "Sign")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ permitNumber: "CO-1", name: "Certificate of Occupancy", detail: "Blue Door Boutique", trades: [], residential: false });
    expect(isOccupancy(rows[0])).toBe(true);
    const t = setup();
    await t.mutation(internal.permits.upsert, { source: "midland", rows });
    expect(await t.run(async (ctx) => (await ctx.db.query("permits").collect()).map((p) => p.name))).toEqual(["Certificate of Occupancy"]);
    // Expired, it is no stalled job.
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("permits").first())!;
      await ctx.db.patch(p._id, { status: "Expired - after 6 month" });
    });
    expect(await t.query(internal.signals.stalledPermits, {})).toEqual([]);
  });

  test("the weekly read pages the dataset, upserts by taxpayer and outlet, and drops the permits that closed", async () => {
    const t = setup();
    const staff = await signUp(t, "staff@fieldquote.example", { role: "staff" });
    const offsets: string[] = [];
    let pages: Array<Array<Record<string, unknown>>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      offsets.push(u.searchParams.get("$offset")!);
      expect(u.searchParams.get("$where")).toBe("upper(outlet_city)='MIDLAND'");
      return new Response(JSON.stringify(pages.shift() ?? []), { status: 200 });
    }));
    // Two full pages and a short one, as the API hands them out.
    const many = Array.from({ length: 1000 }, (_, i) => soda(`t${i}`, `SHOP ${i}`, `${i} WALL ST`));
    pages = [many, many.map((r) => ({ ...r, taxpayer_number: `u${r.taxpayer_number}` })), [soda("1", "BLUE DOOR BOUTIQUE", "30 WADLEY AV", { taxpayer_name: "RIVERA ELENA" }), soda("2", "TACO LOCO LLC", "31 WADLEY AV")]];
    expect(await t.action(internal.outlets.syncMidland, {})).toEqual({ fetched: 2002, added: 2002, updated: 0, error: undefined });
    await t.finishAllScheduledFunctions(() => {});
    expect(offsets).toEqual(["0", "1000", "2000"]);
    const blueDoor = await t.run(async (ctx) => ctx.db.query("outlets").withIndex("by_outlet", (q) => q.eq("taxpayerNumber", "1").eq("outletNumber", "00001")).unique());
    expect(blueDoor).toMatchObject({ county: "Midland", name: "BLUE DOOR BOUTIQUE", address: "30 WADLEY AV", addressKey: addressKey("30 WADLEY AV"), taxpayer: "RIVERA ELENA", at: "2026-10-20T00:00:00.000Z" });
    // Next week: the boutique moved across the street, the taqueria's permit closed, nothing else changed.
    pages = [[soda("1", "BLUE DOOR BOUTIQUE", "33 WADLEY AV", { taxpayer_name: "RIVERA ELENA" })]];
    expect(await t.action(internal.outlets.syncMidland, {})).toEqual({ fetched: 1, added: 0, updated: 1, error: undefined });
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run(async (ctx) => (await ctx.db.query("outlets").collect()).map((o) => [o.name, o.address]))).toEqual([["BLUE DOOR BOUTIQUE", "33 WADLEY AV"]]);
    // A read that fails keeps everything and says why.
    pages = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: true, message: "Rate limited" }), { status: 200 })));
    expect(await t.action(internal.outlets.syncMidland, {})).toMatchObject({ fetched: 0, error: "Comptroller outlets: Rate limited" });
    expect(await t.run(async (ctx) => ctx.db.query("outlets").collect())).toHaveLength(1);
    // Staff can run it by hand; nobody else.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await staff.as.action(api.outlets.syncNow, {})).toMatchObject({ fetched: 0 });
    await t.finishAllScheduledFunctions(() => {});
    await expect(t.action(api.outlets.syncNow, {})).rejects.toThrow();
  });
});
