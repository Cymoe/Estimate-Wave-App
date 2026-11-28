import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addressKey, isEstateOwner, looseKey } from "./lib/parcels";
import { LIKELY_SELLER_MIN, defaultTitle, facetsOf, guessDefinition, listOrder, ownerKey, propertyFor, underFloor, why, type OwnerRow } from "./lib/outreach";
import { isEstateName, nameOrders, parseRecords, recordDate, stackFor } from "./lib/signals";
import { rollAccount, rollColumns } from "./lib/districtRoll";
import { homesteadChange } from "./parcels";
import { setup, signUp } from "./test.setup";

describe("what the rolls say about an owner likely to sell", () => {
  test("an estate or heirs on the roll; a real estate business or a name with EST in it isn't one", () => {
    for (const owner of ["ESTATE OF MARY JONES", "JONES MARY EST", "HEIRS OF R L SMITH", "SMITH R L HEIRS", "JONES MARY DECD", "JONES MARY DEC'D", "JONES MARY LIFE ESTATE", "JONES M EST."])
      expect(isEstateOwner(owner), owner).toBe(true);
    for (const owner of ["WESTERN JOHN", "ESTRADA MARIA", "PERMIAN REAL ESTATE", "JONES MARY", "ESTES ROBERT", undefined])
      expect(isEstateOwner(owner), String(owner)).toBe(false);
    // Businesses named for an estate, as Odessa's roll has them.
    for (const owner of ["PREMIUM ESTATE PROPERTIES LLC", "AMERICAN ESTATE & TRUST LC", "WEST TEXAS ESTATES", "LEGACY ESTATE HOLDINGS"]) {
      expect(isEstateOwner(owner), owner).toBe(false);
      expect(isEstateName(owner), owner).toBe(false);
    }
    expect(isEstateName("LEE R L & DOROTHY ESTATE")).toBe(true);
  });

  test("a homestead gone from the same owner is a drop; a new owner, the first read, or a source that doesn't say is not", () => {
    const now = "2026-11-23T00:00:00.000Z";
    const was = { owner: "JONES MARY", homestead: true };
    expect(homesteadChange(was, { owner: "JONES MARY", homestead: false }, true, now)).toEqual({ homestead: false, over65: undefined, homesteadDroppedAt: now });
    // Sold: the new owner's lack of a homestead says nothing about the seller moving out.
    expect(homesteadChange(was, { owner: "SMITH BOB", homestead: false }, false, now).homesteadDroppedAt).toBeUndefined();
    // First time the roll tells: nothing to compare with.
    expect(homesteadChange({ owner: "JONES MARY" }, { owner: "JONES MARY", homestead: false }, true, now).homesteadDroppedAt).toBeUndefined();
    expect(homesteadChange(null, { owner: "JONES MARY", homestead: false }, false, now).homesteadDroppedAt).toBeUndefined();
    // The city's copy of Midland's roll doesn't say: what's known stays.
    const dropped = { owner: "JONES MARY", homestead: false, homesteadDroppedAt: "2026-06-01" };
    expect(homesteadChange(dropped, { owner: "JONES MARY" }, true, now)).toEqual({ homestead: false, over65: undefined, homesteadDroppedAt: "2026-06-01" });
    // Still without it: the drop keeps its date. Back again: cleared.
    expect(homesteadChange(dropped, { owner: "JONES MARY", homestead: false }, true, now).homesteadDroppedAt).toBe("2026-06-01");
    expect(homesteadChange(dropped, { owner: "JONES MARY", homestead: true, over65: true }, true, now)).toEqual({ homestead: true, over65: true, homesteadDroppedAt: undefined });
  });

  test("Midland's roll: homestead code S is an over-65 homestead; H a plain one", () => {
    const header = "collector_id|collector_name|collector_addr1|collector_city|collector_state|collector_zip|collector_strnum|collector_street|collector_ptdimphs|collector_hscode|collector_interest";
    const columns = rollColumns(header);
    const line = (id: string, code: string) => `${id}|JONES MARY|100 ELM ST|MIDLAND|TX|79701|100|ELM ST|A1|${code}|1`;
    expect(rollAccount(line("R000000001", "S"), columns, Date.now())).toMatchObject({ homestead: true, over65: true });
    expect(rollAccount(line("R000000002", "H"), columns, Date.now())).toMatchObject({ homestead: true, over65: false });
    expect(rollAccount(line("R000000003", ""), columns, Date.now())).toMatchObject({ homestead: false, over65: false });
  });

  test("two reads of Odessa's roll: the same owner without a homestead now is marked; then the roll's word is kept", async () => {
    const t = setup();
    const row = (homestead: boolean | undefined, owner = "JONES MARY") => ({
      cadId: "Ector:77",
      useCode: "A1",
      siteAddress: "100 ELM ST",
      addressKey: "100 ELM ST",
      looseKey: "100 ELM",
      owner,
      mailing: { address: "100 ELM ST", city: "ODESSA", state: "TX", zip: "79761" },
      ownerOccupied: Boolean(homestead),
      companyOwned: false,
      deedDate: "1995-04-01",
      ...(homestead === undefined ? {} : { homestead }),
    });
    const get = () => t.run(async (ctx) => (await ctx.db.query("parcels").collect())[0]);
    await t.mutation(internal.parcels.upsert, { rows: [row(true)], county: "Ector" });
    expect(await get()).toMatchObject({ homestead: true });
    expect((await get()).homesteadDroppedAt).toBeUndefined();
    await t.mutation(internal.parcels.upsert, { rows: [row(false)], county: "Ector" });
    const dropped = await get();
    expect(dropped.homestead).toBe(false);
    expect(dropped.homesteadDroppedAt).toMatch(/^\d{4}-/);
    // A read that doesn't say keeps both.
    await t.mutation(internal.parcels.upsert, { rows: [row(undefined)], county: "Ector" });
    expect(await get()).toMatchObject({ homestead: false, homesteadDroppedAt: dropped.homesteadDroppedAt });
    // Sold to someone else: no longer the owner who moved out.
    await t.mutation(internal.parcels.upsert, { rows: [row(false, "SMITH BOB")], county: "Ector" });
    expect((await get()).homesteadDroppedAt).toBeUndefined();
  });
});

const NOW = Date.parse("2026-11-23T12:00:00.000Z");
const home = { ownerOccupied: true, mailing: { state: "TX" }, deedDate: "2018-04-02", owner: "JONES MARY" };

describe("the new lists a home can be on", () => {
  test("the roll's word: inherited, mail returned, moved out, over 65 and owned 15+ years", () => {
    const lists = (p: Record<string, unknown>, signals: Array<Record<string, string>> = []) => stackFor({ ...home, ...p }, signals as never, { preForeclosure: false, landlord: false }, NOW).lists;
    expect(lists({})).toEqual([]);
    expect(lists({ owner: "JONES MARY EST" })).toEqual(["inherited"]);
    expect(lists({ owner2: "HEIRS OF JONES" })).toEqual(["inherited"]);
    expect(lists({ returnedMail: true })).toEqual(["mail_returned"]);
    expect(lists({ homestead: false, homesteadDroppedAt: "2026-06-01T00:00:00.000Z" })).toEqual(["homestead_dropped"]);
    // Dropped long ago, or back on: not now.
    expect(lists({ homestead: false, homesteadDroppedAt: "2023-01-01T00:00:00.000Z" })).toEqual([]);
    expect(lists({ homestead: true, homesteadDroppedAt: "2026-06-01T00:00:00.000Z" })).toEqual([]);
    expect(lists({ over65: true, deedDate: "2009-01-01" })).toEqual(["senior_long_owned"]);
    expect(lists({ over65: true, deedDate: "2015-01-01" })).toEqual([]);
    // An over-65 owner of 25 years is on both.
    expect(lists({ over65: true, deedDate: "2000-01-01" })).toEqual(["senior_long_owned", "long_owned"]);
  });

  test("uploaded records count within two years; the score adds the weights", () => {
    const stack = stackFor(
      { ...home, owner: "JONES MARY EST" },
      [
        { kind: "tax_delinquent", detail: "", date: "2026-05-01", sourceId: "a" },
        { kind: "probate", detail: "", date: "2026-02-01", sourceId: "b" },
        { kind: "divorce", detail: "", date: "2022-01-01", sourceId: "c" },
      ] as never,
      { preForeclosure: false, landlord: false },
      NOW,
    );
    expect(stack.lists).toEqual(["tax_delinquent", "probate", "inherited"]);
    expect(stack.score).toBe(9);
  });

  test("a pasted list: columns by their names, dates read, a header-less list is addresses", () => {
    const rows = parseRecords(
      'Cause Number,Decedent,Date Filed,Property Address,Court\n2026-123,"Smith, John A",5/8/2026,1209 W Ohio Ave,County Court\n2026-124,Mary Jones,2026-06-01,,County Court',
    );
    expect(rows).toEqual([
      { line: 2, caseNumber: "2026-123", owner: "Smith, John A", date: "2026-05-08", address: "1209 W Ohio Ave", detail: "County Court" },
      { line: 3, caseNumber: "2026-124", owner: "Mary Jones", date: "2026-06-01", address: undefined, detail: "County Court" },
    ]);
    expect(parseRecords("1209 W Ohio Ave\n\n4407 Erie Dr")).toEqual([
      { line: 1, address: "1209 W Ohio Ave" },
      { line: 2, address: "4407 Erie Dr" },
    ]);
    expect(recordDate("May 8, 2026")).toBe("2026-05-08");
    expect(recordDate("5/8/26")).toBe("2026-05-08");
    expect(recordDate("soon")).toBeUndefined();
    expect(nameOrders("John A. Smith")).toEqual(["JOHN A SMITH", "SMITH JOHN A"]);
  });
});

async function addHome(t: ReturnType<typeof setup>, county: string, site: string, owner: string, over: Record<string, unknown> = {}) {
  const mailing = { address: site, city: county === "Ector" ? "ODESSA" : "MIDLAND", state: "TX", zip: "79761" };
  return (await t.run(async (ctx) =>
    ctx.db.insert("parcels", {
      county,
      cadId: `${county}:${site}`,
      useCode: "A1",
      siteAddress: site,
      addressKey: addressKey(site),
      looseKey: looseKey(site),
      owner,
      ownerKey: `${ownerKey(owner)}|${addressKey(site)}`,
      mailing,
      ownerOccupied: true,
      companyOwned: false,
      deedDate: "2018-04-02",
      importedAt: "2026-11-01T00:00:00.000Z",
      ...over,
    }),
  )) as Id<"parcels">;
}

describe("scoring Midland and Odessa, and uploading records", () => {
  test("Odessa homes are scored on their own counts; a landlord is counted on the roll; other counties aren't scored", async () => {
    const t = setup();
    // An Odessa owner with five homes, living elsewhere; one an estate's.
    for (let i = 1; i <= 5; i++) await addHome(t, "Ector", `${100 + i} ELM ST`, "LANDLORD LARRY", { ownerOccupied: false, ownerKey: "LANDLORD LARRY|PO BOX 1", mailing: { address: "PO BOX 1", city: "ODESSA", state: "TX" } });
    const estate = await addHome(t, "Ector", "77 OAK ST", "JONES MARY EST");
    await addHome(t, "Lubbock", "9 PINE ST", "SMITH BOB EST");
    await t.mutation(internal.signals.recomputePage, {});
    await t.finishAllScheduledFunctions(() => {});
    const rows = await t.run((ctx) => ctx.db.query("distress").collect());
    expect(rows.every((r) => r.county === "Ector")).toBe(true);
    expect(rows.find((r) => r.parcelId === estate)!.lists).toEqual(["inherited"]);
    expect(rows.filter((r) => r.lists.includes("landlord") && r.lists.includes("absentee"))).toHaveLength(5);
    const counts = await t.run((ctx) => ctx.db.query("sellerCounts").collect());
    expect(counts.find((c) => c.county === "Ector")!.counts).toMatchObject({ inherited: 1, landlord: 5, absentee: 5 });
    expect(counts.find((c) => c.county === "Midland")!.total).toBe(0);
    // The Ops page reads Odessa when asked.
    const staff = await signUp(t, "ops@goodfit.example", { role: "staff" });
    const odessa = await staff.as.query(api.signals.sellers, { county: "Ector" });
    expect(odessa.county).toBe("Ector");
    // Highest score first: the estate's home (3) above the landlord's (absentee 1 + landlord 1).
    expect(odessa.homes[0].lists).toEqual(["inherited"]);
    expect(odessa.homes.filter((h) => h.lists.includes("landlord"))).toHaveLength(5);
  });

  test("an uploaded list: matched by address or by name, restacked at once, the rest sent back; twice adds nothing", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@goodfit.example", { role: "staff" });
    const byAddress = await addHome(t, "Midland", "1209 W OHIO AV", "GARCIA ANA");
    const byName = await addHome(t, "Midland", "4407 ERIE DR", "SMITH JOHN A");
    const text = "Account,Owner,Property Address,Filed\nT-1,Garcia Ana,1209 W Ohio Ave,6/1/2026\nT-2,John A Smith,,6/2/2026\nT-3,Nobody Here,1 NOWHERE LN,6/3/2026";
    const first = await staff.as.mutation(api.signals.addRecords, { county: "Midland", kind: "tax_delinquent", text });
    expect(first).toMatchObject({ read: 3, added: 2, already: 0, unmatchedCount: 1 });
    expect(first.unmatched[0]).toEqual({ line: 4, text: "1 NOWHERE LN · Nobody Here · T-3" });
    const d = await t.run((ctx) => ctx.db.query("distress").collect());
    expect(d.find((r) => r.parcelId === byAddress)!.lists).toContain("tax_delinquent");
    expect(d.find((r) => r.parcelId === byName)!.lists).toContain("tax_delinquent");
    const again = await staff.as.mutation(api.signals.addRecords, { county: "Midland", kind: "tax_delinquent", text });
    expect(again).toMatchObject({ added: 0, already: 2 });
    // The home's detail shows the record.
    const detail = await staff.as.query(api.signals.home, { parcelId: byAddress });
    expect(detail!.signals[0]).toMatchObject({ kind: "tax_delinquent", caseNumber: "T-1", date: "2026-06-01" });
    // Only staff, and only the scored counties.
    await expect(t.mutation(api.signals.addRecords, { county: "Midland", kind: "probate", text })).rejects.toThrow();
    await expect(staff.as.mutation(api.signals.addRecords, { county: "Lubbock", kind: "probate", text })).rejects.toThrow("Midland and Ector");
  });
});

describe("the likely-to-sell list in Outreach", () => {
  const prop = (id: string, address: string, valueCents: number) => ({ parcelId: id, address, useCode: "A1", valueCents });
  const owner = (over: Partial<OwnerRow> = {}): OwnerRow => ({
    key: "JONES MARY|100 ELM ST",
    kind: "owner",
    name: "Mary Jones",
    company: false,
    mailing: { address: "100 ELM ST", city: "MIDLAND", state: "TX", zip: "79701" },
    parcels: 1,
    residential: 1,
    multifamily: 0,
    commercial: 0,
    totalValueCents: 25_000_000,
    maxValueCents: 25_000_000,
    homeValueCents: 25_000_000,
    ownerOccupied: true,
    outOfState: false,
    homeDeed: "1998-03-02",
    useCodes: ["A1"],
    streets: ["ELM ST"],
    tops: { all: prop("p1", "100 ELM ST", 25_000_000), home: prop("p1", "100 ELM ST", 25_000_000), seller: prop("p1", "100 ELM ST", 25_000_000) },
    ...over,
  });
  const facets = (row: OwnerRow) => facetsOf(row, NOW).filter((f) => f.facet === "likely_seller");

  test("a person or an estate whose home scores enough; never a company, a low score, or a home posted for auction", () => {
    expect(LIKELY_SELLER_MIN).toBe(2);
    expect(facets(owner({ seller: { score: 4, lists: ["inherited", "long_owned"] } }))).toHaveLength(1);
    expect(facets(owner({ seller: { score: 1, lists: ["absentee"] } }))).toHaveLength(0);
    expect(facets(owner({ company: true, seller: { score: 6, lists: ["tax_delinquent", "dilapidated"] } }))).toHaveLength(0);
    expect(facets(owner({ seller: { score: 5, lists: ["pre_foreclosure", "absentee", "out_of_state"] } }))).toHaveLength(0);
    expect(facets(owner())).toHaveLength(0);
    // Most signs first, then the most valuable home.
    const [a] = facets(owner({ seller: { score: 5, lists: ["probate", "mail_returned"] } }));
    const [b] = facets(owner({ seller: { score: 4, lists: ["inherited", "long_owned"] }, tops: { all: prop("p2", "9 OAK", 90_000_000), seller: prop("p2", "9 OAK", 90_000_000) } }));
    expect(a.sort).toBeGreaterThan(b.sort);
  });

  test("why they're on it, the home it's about, the order, and no value floor to stop at", () => {
    const row = owner({ seller: { score: 4, lists: ["inherited", "long_owned"] } });
    expect(why(row, "likely_seller")).toBe("100 Elm St: Inherited (estate or heirs) · Owned 20+ years; owned since 1998");
    expect(why(owner({ seller: { score: 4, lists: ["homestead_dropped", "mail_returned"] } }), "likely_seller")).toBe("100 Elm St: Moved out · Mail returned");
    expect(propertyFor(row, "likely_seller")).toMatchObject({ parcelId: "p1" });
    expect(listOrder({ county: "Ector", who: "likely_seller" }).label).toBe("most signs of selling first");
    expect(defaultTitle({ county: "Ector", who: "likely_seller" })).toBe("Likely to sell, Ector");
    expect(underFloor(owner({ homeValueCents: 1, seller: { score: 9, lists: ["probate"] } }), { county: "Midland", who: "likely_seller", minValueCents: 50_000_000 }, "likely_seller")).toBe(false);
  });

  test("asked in words", () => {
    for (const ask of ["homeowners likely to sell", "motivated sellers", "inherited homes in Odessa", "probate leads", "people thinking about selling their house"])
      expect(guessDefinition(ask)?.definition.who, ask).toBe("likely_seller");
    // Who already sold is still its own list.
    expect(guessDefinition("people who sold their house")?.definition.who).toBe("home_seller");
  });

  test("rebuilt from the roll: Odessa's estate home and its owner are on the list, with the home", async () => {
    const t = setup();
    const estate = await addHome(t, "Ector", "77 OAK ST", "JONES MARY EST", { ownerKey: undefined, ownerOccupied: false, mailing: { address: "1 MAIN ST", city: "DALLAS", state: "TX", zip: "75201" } });
    await addHome(t, "Ector", "78 OAK ST", "SMITH BOB", { ownerKey: undefined });
    await t.mutation(internal.signals.recomputePage, { county: "Ector" });
    await t.finishAllScheduledFunctions(() => {});
    const rows = await t.run(async (ctx) => {
      const facets = await ctx.db.query("ownerFacets").collect();
      return Promise.all(facets.filter((f) => f.facet === "likely_seller").map(async (f) => ctx.db.get(f.ownerId)));
    });
    expect(rows.map((o) => o!.name)).toEqual(["Jones Mary Est"]);
    expect(rows[0]!.seller).toEqual({ score: 4, lists: ["inherited", "absentee"] });
    expect(rows[0]!.tops.seller.parcelId).toBe(estate);
  });
});

