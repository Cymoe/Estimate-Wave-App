import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { realtorsQuery, rowsToRealtors, trecDate } from "./lib/realtors";
import { RealtorGrouper, definitionFromArgs, defaultTitle, guessDefinition, listOrder, why } from "./lib/outreach";
import { foundOnLicense } from "./outreach";

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = Date.parse("2026-11-08T15:00:00.000Z");

const trec = (license_number: string, full_name: string, over: Record<string, unknown> = {}) => ({
  license_type: "Sales Agent",
  license_number,
  full_name,
  suffix: "",
  status: "Active",
  original_license_date: "03/14/2016",
  license_expiration_date: "09/30/2027",
  designated_supervisor_flag: "0",
  county: "Midland",
  related_license_type: "Broker Company",
  related_license_number: "601430-BB",
  related_license_full_name: "FATHOM REALTY, LLC",
  related_license_suffix: "",
  related_license_start_date: "03/01/2021",
  agency_identifier: "880000001",
  key_name: full_name.split(" ").reverse().join(", "),
  first_name: full_name.split(" ")[0],
  middle_name: "",
  last_name: full_name.split(" ").at(-1),
  ...over,
});

describe("TREC's license holders", () => {
  test("rows become agents, brokers and brokerages, with the brokerage each hangs with; dates become ISO; other license types are skipped", () => {
    const rows = rowsToRealtors([
      trec("700001", "ELENA MARIE RIVERA"),
      trec("516832-B", "TERRY LANCE MARKER", { license_type: "Broker Individual", original_license_date: "08/07/1989", related_license_type: "", related_license_number: "", related_license_full_name: "", related_license_start_date: "", designated_supervisor_flag: "1" }),
      trec("601430-BB", "FATHOM REALTY, LLC", { license_type: "Broker Company", first_name: "", last_name: "", related_license_type: "Broker Individual", related_license_number: "400000-B", related_license_full_name: "JOSHUA HARLEY" }),
      trec("1", "AN INSPECTOR", { license_type: "Professional Inspector" }),
      trec("", "NOBODY"),
    ]);
    expect(rows).toEqual([
      { licenseNumber: "700001", type: "agent", name: "ELENA MARIE RIVERA", first: "ELENA", last: "RIVERA", licensedAt: "2016-03-14", expiresAt: "2027-09-30", brokerage: { licenseNumber: "601430-BB", name: "FATHOM REALTY, LLC", type: "brokerage" }, brokerageSince: "2021-03-01", supervisor: false },
      { licenseNumber: "516832-B", type: "broker", name: "TERRY LANCE MARKER", first: "TERRY", last: "MARKER", licensedAt: "1989-08-07", expiresAt: "2027-09-30", brokerageSince: undefined, supervisor: true },
      { licenseNumber: "601430-BB", type: "brokerage", name: "FATHOM REALTY, LLC", licensedAt: "2016-03-14", expiresAt: "2027-09-30", brokerage: { licenseNumber: "400000-B", name: "JOSHUA HARLEY", type: "broker" }, brokerageSince: "2021-03-01", supervisor: false },
    ]);
    expect([trecDate("1/5/2020"), trecDate("2020-01-05"), trecDate(""), trecDate(null)]).toEqual(["2020-01-05", undefined, undefined, undefined]);
    expect(realtorsQuery("Midland", 1000, 1000)).toBe(
      "https://data.texas.gov/resource/s7ft-44qi.json?%24where=upper%28county%29%3D%27MIDLAND%27+AND+status%3D%27Active%27+AND+license_type+in%28%27Sales+Agent%27%2C%27Broker+Individual%27%2C%27Broker+Company%27%29&%24order=license_number&%24limit=1000&%24offset=1000",
    );
  });

  test("the realtor list: one row per agent and broker, the brokerage as their company, sponsoring brokers first; the words that ask for it", () => {
    const grouper = new RealtorGrouper().addAll(
      rowsToRealtors([
        trec("700001", "ELENA MARIE RIVERA"),
        trec("700002", "SAM LEE", { related_license_type: "Broker Individual", related_license_number: "516832-B", related_license_full_name: "TERRY LANCE MARKER", original_license_date: "01/10/2024", related_license_start_date: "02/01/2024" }),
        trec("700003", "ANA CRUZ", { related_license_type: "Broker Individual", related_license_number: "516832-B", related_license_full_name: "TERRY LANCE MARKER", original_license_date: "06/01/2010" }),
        trec("516832-B", "TERRY LANCE MARKER", { license_type: "Broker Individual", original_license_date: "08/07/1989", related_license_type: "", related_license_number: "", related_license_full_name: "", related_license_start_date: "", designated_supervisor_flag: "1" }),
        trec("601430-BB", "FATHOM REALTY, LLC", { license_type: "Broker Company", first_name: "", last_name: "" }),
      ]),
    );
    expect(grouper.size).toBe(5);
    const rows = [...grouper.grouped(NOW)].sort((a, b) => b.facets[0].sort - a.facets[0].sort);
    // The brokerage company is nobody's row; the broker with two agents leads, then the longest licensed.
    expect(rows.map((r) => [r.owner.name, r.owner.company, r.owner.brokerage, r.facets.map((f) => f.facet)])).toEqual([
      ["Terry Marker", false, undefined, ["realtor"]],
      ["Ana Cruz", false, "Terry Lance Marker", ["realtor"]],
      ["Elena Rivera", false, "Fathom Realty, LLC", ["realtor"]],
      ["Sam Lee", false, "Terry Lance Marker", ["realtor"]],
    ]);
    const marker = rows[0].owner;
    expect(marker).toMatchObject({ kind: "realtor", key: "realtor:516832-B", parcels: 0, mailing: { city: "Midland", state: "TX" }, tops: {}, license: { number: "516832-B", type: "broker", since: "1989-08-07", expires: "2027-09-30", sponsors: 2, supervisor: true } });
    expect(why(marker, "realtor")).toBe("Broker, licensed since 1989; sponsors 2 agents; license through Sep 2027");
    expect(why(rows[2].owner, "realtor")).toBe("Sales agent with Fathom Realty, LLC since Mar 2021, licensed since 2016; license through Sep 2027");
    // The person is the row, free, from the license.
    expect(foundOnLicense(rows[2].owner)).toEqual({ person: { name: "Elena Rivera", title: "Sales agent, TREC license 700001", source: "trec" }, phones: [], emails: [], source: "trec" });
    expect(listOrder({ county: "Midland", who: "realtor" }).label).toBe("sponsoring brokers first, then longest licensed");
    const who = (ask: string) => guessDefinition(ask)?.definition;
    expect(who("realtors")).toEqual({ county: "Midland", who: "realtor" });
    expect(who("real estate agents in Midland")).toEqual({ county: "Midland", who: "realtor" });
    expect(who("brokers who can refer work")).toEqual({ county: "Midland", who: "realtor" });
    expect(who("listing agents")).toEqual({ county: "Midland", who: "realtor" });
    expect(defaultTitle({ county: "Midland", who: "realtor" })).toBe("Realtors, Midland");
    expect(definitionFromArgs({ who: "realtor" })).toEqual({ county: "Midland", who: "realtor" });
  });

  test("the weekly read pages TREC, upserts by license number, and drops the licenses that lapsed", async () => {
    const t = setup();
    const staff = await signUp(t, "staff@fieldquote.example", { role: "staff" });
    const offsets: string[] = [];
    let pages: Array<Array<Record<string, unknown>>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      offsets.push(u.searchParams.get("$offset")!);
      expect(u.searchParams.get("$where")).toContain("status='Active'");
      return new Response(JSON.stringify(pages.shift() ?? []), { status: 200 });
    }));
    const many = Array.from({ length: 1000 }, (_, i) => trec(`8${String(i).padStart(5, "0")}`, `AGENT ${i} SMITH`));
    pages = [many, [trec("700001", "ELENA MARIE RIVERA"), trec("516832-B", "TERRY LANCE MARKER", { license_type: "Broker Individual" })]];
    expect(await t.action(internal.realtors.syncMidland, {})).toEqual({ fetched: 1002, added: 1002, updated: 0, error: undefined });
    await t.finishAllScheduledFunctions(() => {});
    expect(offsets).toEqual(["0", "1000"]);
    expect(await t.run(async (ctx) => ctx.db.query("realtors").withIndex("by_license", (q) => q.eq("licenseNumber", "700001")).unique())).toMatchObject({ county: "Midland", type: "agent", name: "ELENA MARIE RIVERA", brokerage: { name: "FATHOM REALTY, LLC" } });
    // Next week: Elena moved brokerages, Terry let his license lapse, the rest are unchanged.
    pages = [[trec("700001", "ELENA MARIE RIVERA", { related_license_number: "9007202-BB", related_license_full_name: "THE REAL ESTATE RANCH LLC", related_license_start_date: "11/01/2026" })]];
    expect(await t.action(internal.realtors.syncMidland, {})).toEqual({ fetched: 1, added: 0, updated: 1, error: undefined });
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run(async (ctx) => (await ctx.db.query("realtors").collect()).map((r) => [r.name, r.brokerage?.name]))).toEqual([["ELENA MARIE RIVERA", "THE REAL ESTATE RANCH LLC"]]);
    // A read that fails keeps everything and says why.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: true, message: "Rate limited" }), { status: 200 })));
    expect(await t.action(internal.realtors.syncMidland, {})).toMatchObject({ fetched: 0, error: "TREC license holders: Rate limited" });
    expect(await t.run(async (ctx) => ctx.db.query("realtors").collect())).toHaveLength(1);
    // Staff can run it by hand; nobody else.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await staff.as.action(api.realtors.syncNow, {})).toMatchObject({ fetched: 0 });
    await t.finishAllScheduledFunctions(() => {});
    await expect(t.action(api.realtors.syncNow, {})).rejects.toThrow();
  });
});
