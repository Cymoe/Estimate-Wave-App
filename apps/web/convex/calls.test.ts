import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { addressKey, deedIso, isCompanyOwner, ownerName, ownerOccupied, rowsToParcels, siteAddress } from "./lib/parcels";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A roll row as the city's layer returns it. */
const roll = (over: Record<string, unknown> = {}) => ({
  attributes: {
    SU_NUM: "R000029279",
    PIN_1: "560000320062",
    GOV_USE_CO: "A1",
    SITE_NO: 112,
    STREET_DIR: "W",
    STREET: "SPRUCE AV",
    OWNER: "LOZANO ZUNIGA CESAR E",
    OWNER2: " ",
    ADDRESS_1: "112 W SPRUCE AV",
    CITY_1: "MIDLAND",
    STATE_1: "TX",
    ZIP: "79705",
    MKT_VALUE: 357830,
    BLDG_VALUE: 340940,
    DEED_DATE: "10/11/2021",
    ...over,
  },
});

describe("Midland owners (the appraisal roll)", () => {
  test("a permit address and the roll's address for the same house get the same key", () => {
    expect(addressKey("4729 COUNTRY CLUB Drive")).toBe("4729 COUNTRY CLUB DR");
    expect(addressKey("4729 COUNTRY CLUB DR")).toBe("4729 COUNTRY CLUB DR");
    expect(addressKey("2510 Storey Avenue, Midland, TX")).toBe("2510 STOREY AV");
    expect(addressKey("3107 S COUNTY RD 01109 Apt 2")).toBe("3107 S COUNTY RD 1109");
    expect(addressKey("7105 Cactus Trail")).toBe(addressKey("7105 CACTUS TRL"));
    expect(siteAddress({ SITE_NO: 3107, STREET_DIR: "S", STREET: "COUNTY RD 01109" })).toBe("3107 S COUNTY RD 1109");
    expect(siteAddress({ SITE_NO: 0, STREET: "COUNTY RD 01127" })).toBeUndefined();
  });

  test("who lives there, who is a business, and when they bought", () => {
    expect(ownerOccupied("112 W SPRUCE AV", "112 W SPRUCE AV")).toBe(true);
    expect(ownerOccupied("2510 STOREY AV", "2510 STOREY AVE")).toBe(true);
    // The roll's mailing line often drops the direction.
    expect(ownerOccupied("112 W SPRUCE AV", "112 SPRUCE AV")).toBe(true);
    expect(ownerOccupied("4309 COUNTRY CLUB DR", "255 ASSAY ST APT")).toBe(false);
    expect(ownerOccupied("1606 COUNTRY CLUB DR", "P. O. BOX 51138")).toBe(false);
    expect(isCompanyOwner("NUKA HIVA ALPHA 1-54 LLC")).toBe(true);
    expect(isCompanyOwner("BETENBOUGH HOMES")).toBe(true);
    expect(isCompanyOwner("YANGJA JOHNSON REV LIV TRUST")).toBe(false);
    expect(isCompanyOwner("AMERIHOME MORTGAGE COMPANY LLC")).toBe(true);
    expect(isCompanyOwner("HERNANDEZ CONRAD JR")).toBe(false);
    expect(deedIso("6/7/2010")).toBe("2010-06-07");
    expect(deedIso("")).toBeUndefined();
    expect(ownerName("LOZANO ZUNIGA CESAR E")).toBe("Lozano Zuniga Cesar E");
  });

  test("keeps homes with an owner and an address, and reads the money in cents", () => {
    const rows = rowsToParcels([
      roll(),
      roll({ SU_NUM: "R2", OWNER: "MATHES JOE &", ADDRESS_1: "6305 E COUNTY RD 62", SITE_NO: 410, STREET_DIR: " ", STREET: "ELM ST" }),
      roll({ SU_NUM: "R3", GOV_USE_CO: "F1" }),
      roll({ SU_NUM: "R4", SITE_NO: 0 }),
      roll({ SU_NUM: "R5", OWNER: " " }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      cadId: "R000029279",
      siteAddress: "112 W SPRUCE AV",
      addressKey: "112 W SPRUCE AV",
      street: "W Spruce Av",
      ownerOccupied: true,
      companyOwned: false,
      marketValueCents: 35_783_000,
      deedDate: "2021-10-11",
      mailing: { address: "112 W SPRUCE AV", city: "MIDLAND", state: "TX", zip: "79705" },
    });
    expect(rows[0].owner2).toBeUndefined();
    expect(rows[1]).toMatchObject({ owner: "MATHES JOE", ownerOccupied: false });
  });

  test("the weekly pull pages through the roll, adds, updates and records how it went", async () => {
    const t = setup();
    const pages = [
      { features: [roll(), roll({ SU_NUM: "R2", SITE_NO: 9 })], exceededTransferLimit: true },
      { features: [roll({ SU_NUM: "R3", SITE_NO: 11, DEED_DATE: "11/20/2025" })] },
    ];
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(pages[urls.length - 1] ?? { features: [] }), { status: 200 });
    }));
    expect(await t.action(internal.parcels.syncMidland, {})).toEqual({ fetched: 3, added: 3, updated: 0, error: undefined });
    expect(urls).toHaveLength(2);
    expect(new URL(urls[0]).searchParams.get("where")).toBe("GOV_USE_CO IN ('A1','A2','A3','A4','A5')");
    expect(urls[1]).toContain("resultOffset=2");

    // Run again with one owner changed: only that row is written.
    pages[0].features[0] = roll({ OWNER: "NEW OWNER JANE" });
    urls.length = 0;
    expect(await t.action(internal.parcels.syncMidland, {})).toMatchObject({ fetched: 3, added: 0, updated: 1 });
    await t.run(async (ctx) => {
      const all = await ctx.db.query("parcels").collect();
      expect(all).toHaveLength(3);
      expect(all.find((p) => p.cadId === "R000029279")!.owner).toBe("NEW OWNER JANE");
      const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-parcels")).unique();
      expect(sync).toMatchObject({ fetched: 3, lastAppliedAt: "2025-11-20" });
    });

    // The deploy's run skips a roll read cleanly this week.
    urls.length = 0;
    expect(await t.action(internal.parcels.syncMidland, { ifStale: true })).toEqual({ skipped: true });
    expect(urls).toHaveLength(0);

    // The Permits card shows it to staff.
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const status = await staff.as.query(api.permits.status, {});
    expect(status.owners).toMatchObject({ fetched: 3, lastAppliedAt: "2025-11-20" });
  });

  test("a failed read says why and doesn't count as this week's", async () => {
    const t = setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect(await t.action(internal.parcels.syncMidland, { ifStale: true })).toMatchObject({ fetched: 0, error: "Midland owners: HTTP 503" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [roll()] }), { status: 200 })));
    expect(await t.action(internal.parcels.syncMidland, { ifStale: true })).toMatchObject({ fetched: 1, added: 1 });
  });

  test("only staff can start a read", async () => {
    const t = setup();
    const company = await signUp(t, "owner@roof.example");
    await expect(company.as.action(api.parcels.syncNow, {})).rejects.toThrow();
  });
});
