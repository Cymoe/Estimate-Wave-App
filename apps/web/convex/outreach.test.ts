import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";
import { actAs } from "./lib/actor";
import { findTool } from "./lib/mcpTools";
import { addressKey, looseKey } from "./lib/parcels";
import { AddressCounter, OwnerGrouper, careOf, definitionFromArgs, defaultTitle, displayName, dollarsIn, groupOwners, guessDefinition, mailKey, ownerKey, shortMoney, type Condensed } from "./lib/outreach";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const NOW = Date.parse("2026-11-05T15:00:00.000Z");

/** A parcel as the rebuild condenses it. */
const parcel = (id: string, over: Partial<Condensed> = {}): Condensed => ({
  id,
  siteAddress: `${id} SPRUCE AV`,
  street: "SPRUCE AV",
  useCode: "A1",
  owner: "COLE JANE",
  mailing: { address: `${id} SPRUCE AV`, city: "MIDLAND", state: "TX", zip: "79705" },
  ownerOccupied: true,
  companyOwned: false,
  marketValueCents: 30_000_000,
  deedDate: "2018-04-02",
  ...over,
});

/** The twelve parcels every grouping test reads. */
const ROLL: Condensed[] = [
  // A wealthy homeowner.
  parcel("1", { owner: "VANCE ROBERT & LINDA", marketValueCents: 120_000_000 }),
  // A modest one.
  parcel("2", { owner: "REYES SAMUEL", marketValueCents: 18_000_000, deedDate: "2026-10-10" }),
  // An absentee owner in New Mexico.
  parcel("3", { owner: "ORTIZ MARIA", ownerOccupied: false, mailing: { address: "9 MESA DR", city: "HOBBS", state: "NM", zip: "88240" } }),
  // One LLC with three homes, all billed to its office.
  parcel("4", { owner: "NUKA HIVA LLC", companyOwned: true, ownerOccupied: false, mailing: { address: "100 WALL ST STE 4", city: "MIDLAND", state: "TX", zip: "79701" } }),
  parcel("5", { owner: "NUKA HIVA LLC &", companyOwned: true, ownerOccupied: false, mailing: { address: "100 Wall Street Suite 4", city: "MIDLAND", state: "TX", zip: "79701" } }),
  parcel("6", { owner: "NUKA HIVA LLC", companyOwned: true, ownerOccupied: false, street: "ELM ST", siteAddress: "6 ELM ST", mailing: { address: "100 WALL ST", city: "MIDLAND", state: "TX", zip: "79701" } }),
  // A management office: five parcels from three owners, named on the c/o line.
  ...["7", "8", "9", "10", "11"].map((id, i) =>
    parcel(id, {
      owner: ["PARK HOLDINGS LP", "SMITH JOHN", "SMITH JOHN", "DOE ANN", "DOE ANN"][i],
      companyOwned: i === 0,
      ownerOccupied: false,
      useCode: i === 0 ? "B1" : "A1",
      marketValueCents: i === 0 ? 240_000_000 : 20_000_000,
      mailing: { address: "C/O ACME MANAGEMENT", city: "MIDLAND", state: "TX", zip: "79701" },
    }),
  ),
  // A shopping center.
  parcel("12", { owner: "OAK PLAZA LLC", companyOwned: true, ownerOccupied: false, useCode: "F1", siteAddress: "12 MIDKIFF RD", street: "MIDKIFF RD", marketValueCents: 300_000_000, deedDate: "2026-09-01", mailing: { address: "1 MAIN ST", city: "DALLAS", state: "TX", zip: "75201" } }),
  // The city, owning four parcels: not an investor.
  ...["13", "14", "15", "16"].map((id) => parcel(id, { owner: "CITY OF MIDLAND", companyOwned: true, ownerOccupied: false, useCode: "F1", mailing: { address: "300 N LORAINE ST", city: "MIDLAND", state: "TX", zip: "79701" } })),
  // A homebuilder with three spec homes: not an investor either.
  ...["17", "18", "19"].map((id) => parcel(id, { owner: "BETENBOUGH HOMES LLC", companyOwned: true, ownerOccupied: false, mailing: { address: "6305 82ND ST", city: "LUBBOCK", state: "TX", zip: "79424" } })),
];

describe("grouping the roll into owners", () => {
  test("one spelling for an owner and for a mailing address; the c/o name", () => {
    expect(ownerKey("NUKA HIVA LLC &")).toBe("NUKA HIVA LLC");
    expect(ownerKey("Smith, John ET AL")).toBe("SMITH JOHN");
    expect(ownerKey("DOE ANN ETUX")).toBe("DOE ANN");
    expect(mailKey({ address: "100 Wall Street Suite 4", zip: "79701-1234" })).toBe("100 WALL ST|79701");
    expect(mailKey({ address: "100 WALL ST STE 4", zip: "79701" })).toBe("100 WALL ST|79701");
    expect(mailKey({})).toBeUndefined();
    expect(careOf("C/O ACME MANAGEMENT")).toBe("ACME MANAGEMENT");
    expect(careOf("% Acme Management, ")).toBe("ACME MANAGEMENT");
    expect(careOf("100 WALL ST")).toBeUndefined();
    expect(displayName("OAK PLAZA LLC")).toBe("Oak Plaza LLC");
    expect(displayName("VANCE ROBERT & LINDA")).toBe("Vance Robert & Linda");
    expect(shortMoney(420_000_000)).toBe("$4.2M");
    expect(shortMoney(85_000_000)).toBe("$850K");
    expect(shortMoney(5_267_400)).toBe("$52,674");
  });

  test("owners, offices and their facets", () => {
    const { owners, facets } = groupOwners(ROLL, NOW);
    const byName = Object.fromEntries(owners.map((o) => [o.name, o]));
    const on = (name: string) => (facets.get(byName[name].key) ?? []).map((f) => f.facet).sort();

    expect(on("Vance Robert & Linda")).toEqual(["homeowner"]);
    expect(byName["Vance Robert & Linda"].homeValueCents).toBe(120_000_000);
    // Bought last month: a buyer too.
    expect(on("Reyes Samuel")).toEqual(["buyer", "homeowner"]);
    expect(on("Ortiz Maria")).toEqual(["absentee", "out_of_state"]);
    expect(byName["Ortiz Maria"]).toMatchObject({ outOfState: true, rentalValueCents: 30_000_000, ownerOccupied: false });
    // The three NUKA HIVA parcels share an owner and (once spelled one way) a mailing address.
    expect(byName["Nuka Hiva LLC"]).toMatchObject({ parcels: 3, residential: 3, company: true, streets: ["SPRUCE AV", "ELM ST"] });
    expect(on("Nuka Hiva LLC")).toEqual(["investor"]);
    // The office is its own row, named from the c/o line, on top of the owners billed there.
    expect(byName["ACME MANAGEMENT"]).toMatchObject({ kind: "office", parcels: 5, owners: 3, multifamily: 1, residential: 4 });
    expect(on("ACME MANAGEMENT")).toEqual(["office"]);
    expect(byName["Smith John"]).toMatchObject({ parcels: 2, kind: "owner" });
    expect(on("Park Holdings LP")).toEqual(["investor", "multifamily"]);
    expect(on("Oak Plaza LLC")).toEqual(["buyer", "commercial", "investor"]);
    expect(byName["Oak Plaza LLC"]).toMatchObject({ commercial: 1, commercialValueCents: 300_000_000, tops: { commercial: { address: "12 MIDKIFF RD", useCode: "F1" } } });
    // Two homes rented out in town: absentee, not out of state, not (yet) an investor.
    expect(on("Smith John")).toEqual(["absentee"]);
    // The city owns four parcels and isn't an investor; its buildings are still commercial.
    expect(on("City Of Midland")).toEqual(["commercial"]);
    expect(on("Betenbough Homes LLC")).toEqual(["builder"]);
    expect(owners).toHaveLength(11);
  });

  test("pass one finds only the office; pass two hands its rows out and lets them go", () => {
    const counter = new AddressCounter().addAll(ROLL);
    // ACME's address: five parcels from three owners. The city's four and the LLC's three are one owner each.
    expect([...counter.candidates()]).toEqual(["C/O ACME MANAGEMENT|79701"]);
    const grouper = new OwnerGrouper(counter.candidates()).addAll(ROLL);
    expect(grouper.size).toBe(11);
    const rows = [...grouper.rows(NOW)];
    expect(rows.map((r) => r.owner.name).sort()).toContain("ACME MANAGEMENT");
    expect(rows).toHaveLength(11);
    expect(grouper.size).toBe(0);
    // An address nobody flagged gets no office row, however many parcels it carries.
    const none = new OwnerGrouper(new Set()).addAll(ROLL);
    expect([...none.rows(NOW)].map((r) => r.owner.kind)).not.toContain("office");
  });

  test("a definition from what the assistant or a tool sends, in dollars", () => {
    expect(definitionFromArgs({ who: "wealthy", min_value: 1_500_000, zips: ["79705-1234"], limit: 900 })).toEqual({
      county: "Midland",
      who: "wealthy",
      minValueCents: 150_000_000,
      zips: ["79705"],
      limit: 500,
    });
    expect(definitionFromArgs({ who: "commercial", use_codes: ["f2"], streets: ["Midkiff Rd"] })).toMatchObject({ useCodes: ["F2"], streets: ["Midkiff Rd"] });
    expect(() => definitionFromArgs({ who: "doctors" })).toThrow(/who must be one of/);
    expect(() => definitionFromArgs({ who: "custom" })).toThrow(/use code/);
    expect(() => definitionFromArgs({ who: "wealthy", min_value: "a lot" })).toThrow(/min_value/);
    expect(() => definitionFromArgs({ who: "wealthy", min_value: 5, max_value: 1 })).toThrow(/above/);
    expect(defaultTitle({ county: "Midland", who: "wealthy", minValueCents: 150_000_000 })).toBe("Wealthy homeowners over $1.5M, Midland");
    expect(defaultTitle({ county: "Midland", who: "manager" })).toBe("Property managers, Midland");
  });

  test("the words alone pick a list while the assistant is away; a stretch is no guess at all", () => {
    const who = (ask: string) => guessDefinition(ask)?.definition;
    expect(who("Property managers")).toEqual({ county: "Midland", who: "manager" });
    expect(who("shopping center owners in Midland")).toEqual({ county: "Midland", who: "commercial" });
    expect(who("strip malls")).toEqual({ county: "Midland", who: "commercial" });
    expect(who("warehouses")).toEqual({ county: "Midland", who: "commercial", useCodes: ["F2"] });
    expect(who("apartment complexes")).toEqual({ county: "Midland", who: "multifamily" });
    expect(who("landlords")).toEqual({ county: "Midland", who: "investor" });
    expect(who("home builders in Midland")).toEqual({ county: "Midland", who: "builder" });
    expect(guessDefinition("builders")?.title).toBe("Homebuilders, Midland");
    expect(who("RE investors with rentals")).toEqual({ county: "Midland", who: "investor" });
    expect(who("out of state owners")).toEqual({ county: "Midland", who: "absentee" });
    expect(who("people who just bought")).toEqual({ county: "Midland", who: "recent_buyer" });
    expect(who("rich people")).toEqual({ county: "Midland", who: "wealthy" });
    expect(who("Homes worth over $1.5M")).toEqual({ county: "Midland", who: "wealthy", minValueCents: 150_000_000 });
    expect(who("$2,000,000 homes")).toEqual({ county: "Midland", who: "wealthy", minValueCents: 200_000_000 });
    expect(who("commercial buildings over 5 million")).toEqual({ county: "Midland", who: "commercial", minValueCents: 500_000_000 });
    expect(guessDefinition("Homes worth over $1.5M")!.title).toBe("Wealthy homeowners over $1.5M, Midland");
    expect(who("oil executives")).toBeUndefined();
    expect(who("doctors")).toBeUndefined();
    expect(dollarsIn("about $850k")).toBe(85_000_000);
    expect(dollarsIn("no money here")).toBeUndefined();
  });
});

// ---- With a database ----

async function addParcels(t: ReturnType<typeof setup>, rows: Condensed[]) {
  const ids: Record<string, Id<"parcels">> = {};
  await t.run(async (ctx) => {
    for (const r of rows) {
      ids[r.id] = await ctx.db.insert("parcels", {
        county: "Midland",
        cadId: `R-${r.id}`,
        useCode: r.useCode,
        siteAddress: r.siteAddress,
        addressKey: addressKey(r.siteAddress),
        looseKey: looseKey(r.siteAddress),
        street: r.street,
        owner: r.owner,
        mailing: r.mailing,
        ownerOccupied: r.ownerOccupied,
        companyOwned: r.companyOwned,
        marketValueCents: r.marketValueCents,
        deedDate: r.deedDate,
        importedAt: "2026-11-01T07:20:00.000Z",
      });
    }
  });
  return ids;
}

async function proCompany(t: ReturnType<typeof setup>, email = "owner@roof.example") {
  const co = await signUp(t, email);
  await t.run(async (ctx) => {
    await ctx.db.patch(co.organizationId, {
      plan: { monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, status: "active", periodStart: "2026-10-01T00:00:00.000Z", nextChargeAt: "2026-12-01T00:00:00.000Z", claimsThisPeriod: 0 },
    });
  });
  return co;
}

const rebuild = async (t: ReturnType<typeof setup>) => {
  const result = await t.action(internal.outreachRebuild.rebuild, {});
  await t.finishAllScheduledFunctions(() => {});
  return result;
};

describe("the owners table", () => {
  test("is rebuilt from the roll, written once, and loses owners that left it", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const ids = await addParcels(t, ROLL);
    expect(await rebuild(t)).toEqual({ fetched: 19, added: 11, updated: 0, error: undefined });
    const counts = async () =>
      await t.run(async (ctx) => [(await ctx.db.query("owners").collect()).length, (await ctx.db.query("ownerFacets").collect()).length]);
    expect(await counts()).toEqual([11, 16]);
    // The same roll again: nothing added, nothing duplicated.
    expect(await rebuild(t)).toMatchObject({ added: 0, updated: 0 });
    expect(await counts()).toEqual([11, 16]);
    // The shopping center sells to the Vance family (now investors too), and the city sells one lot.
    await t.run(async (ctx) => {
      await ctx.db.patch(ids["12"], { owner: "VANCE ROBERT & LINDA", companyOwned: false, mailing: { address: "1 SPRUCE AV", city: "MIDLAND", state: "TX", zip: "79705" } });
      await ctx.db.delete(ids["13"]);
    });
    expect(await rebuild(t)).toMatchObject({ fetched: 18, added: 0, updated: 2 });
    await t.run(async (ctx) => {
      const owners = await ctx.db.query("owners").collect();
      expect(owners.map((o) => o.name).sort()).not.toContain("Oak Plaza LLC");
      const vance = owners.find((o) => o.name === "Vance Robert & Linda")!;
      expect(vance).toMatchObject({ parcels: 2, commercial: 1 });
      const facets = (await ctx.db.query("ownerFacets").withIndex("by_owner", (q) => q.eq("ownerId", vance._id)).collect()).map((f) => f.facet).sort();
      expect(facets).toEqual(["buyer", "commercial", "homeowner"]);
      expect((await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-owners")).unique())!.fetched).toBe(18);
    });
    expect(await counts()).toEqual([10, 15]);
    // The deploy's run skips a build that's newer than the roll read, and runs after a new read.
    expect(await t.action(internal.outreachRebuild.rebuild, { ifStale: true })).toEqual({ skipped: true });
    expect(await t.action(internal.outreachRebuild.rebuild, { ifStale: true, background: true })).toEqual({ skipped: true });
    // Owners grouped by an older version of the rules are rebuilt even when newer than the roll.
    await t.run(async (ctx) => {
      const owners = (await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-owners")).unique())!;
      await ctx.db.patch(owners._id, { fieldsVersion: 1 });
    });
    expect(await t.action(internal.outreachRebuild.rebuild, { ifStale: true, background: true })).toEqual({ scheduled: true });
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.action(internal.outreachRebuild.rebuild, { ifStale: true })).toEqual({ skipped: true });
    await t.run(async (ctx) => {
      const roll = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-parcels")).unique();
      if (roll) await ctx.db.patch(roll._id, { syncedAt: new Date(Date.now() + 60_000).toISOString() });
      else await ctx.db.insert("permitSources", { source: "midland-parcels", syncedAt: new Date(Date.now() + 60_000).toISOString(), fetched: 15, added: 0, updated: 0 });
    });
    // In the background (the deploy's way), the work is scheduled and the call returns at once.
    expect(await t.action(internal.outreachRebuild.rebuild, { ifStale: true, background: true })).toEqual({ scheduled: true });
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.action(internal.outreachRebuild.rebuild, {})).toMatchObject({ fetched: 18, added: 0, updated: 0 });
    await t.finishAllScheduledFunctions(() => {});
    // Staff can see when it last ran; a company can't.
    const staff = await signUp(t, "ops@webb.example", { role: "staff" });
    expect(await staff.as.query(api.outreach.status, {})).toMatchObject({ parcels: 18, owners: 0 });
    const co = await signUp(t, "owner@roof.example");
    await expect(co.as.query(api.outreach.status, {})).rejects.toThrow(/staff/);
  });
});

describe("a company's lists", () => {
  test("previews, saves a snapshot, works the rows, and removes it; Pro only; its own only", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const ids = await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;

    // Wealthy homeowners: the one home over $1M.
    const wealthy = await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "wealthy" } });
    expect(wealthy).toMatchObject({ count: 1, truncated: false, limited: false });
    expect(wealthy.rows[0].company).toBeUndefined();
    expect(wealthy.rows[0]).toMatchObject({
      name: "Vance Robert & Linda",
      mailing: { address: "1 SPRUCE AV", zip: "79705" },
      property: { address: "1 Spruce Av", useCode: "A1", valueCents: 120_000_000 },
      properties: 1,
      why: "Home worth $1.2M, owner-occupied",
    });
    // Commercial owners, most valuable first; the F2 filter and a street filter narrow it.
    const commercial = await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    expect(commercial.rows.map((r) => [r.name, r.why])).toEqual([
      ["Oak Plaza LLC", "Commercial building worth $3M"],
      ["City Of Midland", "4 commercial buildings worth $300K"],
    ]);
    expect((await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "commercial", streets: ["Midkiff Road"] } })).count).toBe(1);
    expect((await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "commercial", useCodes: ["F2"] } })).count).toBe(0);
    // Property managers and investors.
    const managers = await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "manager" } });
    expect(managers.rows.map((r) => [r.name, r.company, r.why])).toEqual([["ACME MANAGEMENT", "ACME MANAGEMENT", "Gets the tax bills for 5 properties from 3 owners"]]);
    const investors = await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "investor" } });
    expect(investors.rows.map((r) => r.name)).toEqual(["Nuka Hiva LLC", "Oak Plaza LLC", "Park Holdings LP"]);
    expect(investors.rows[0].why).toBe("Owns 3 Midland properties, $900K on the roll");
    const builders = await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "builder" } });
    expect(builders.rows.map((r) => [r.name, r.why])).toEqual([["Betenbough Homes LLC", "Homebuilder with 3 Midland properties on the roll, $900K in all"]]);
    // Out-of-state absentee owners, and recent buyers.
    expect((await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "absentee" } })).rows.map((r) => r.why)).toEqual([
      "Owns a home here, mail goes to Hobbs, NM",
    ]);
    expect((await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "recent_buyer" } })).rows.map((r) => [r.name, r.why])).toEqual([
      ["Reyes Samuel", "Bought Oct 2026"],
      ["Oak Plaza LLC", "Bought Sep 2026"],
    ]);
    expect((await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "recent_buyer", deedWithinDays: 30 } })).count).toBe(1);
    await expect(co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "custom" } })).rejects.toThrow(/use code/);

    // Save the commercial list: its contacts stay as they were, whatever the roll does next.
    const saved = await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    expect(saved).toMatchObject({ rowCount: 2, added: 2, truncated: false });
    await t.run(async (ctx) => ctx.db.patch(ids["12"], { marketValueCents: 1_000 }));
    await rebuild(t);
    const onList = async (listId: typeof saved.listId) => (await co.as.query(api.outreach.contacts, { organizationId: org, listId })).rows;
    const list = await onList(saved.listId);
    expect(list.map((r) => [r.name, r.property.valueCents, r.status, r.kinds])).toEqual([
      ["City Of Midland", 30_000_000, "new", ["commercial"]],
      ["Oak Plaza LLC", 300_000_000, "new", ["commercial"]],
    ]);
    expect((await co.as.query(api.outreach.lists, { organizationId: org })).map((l) => [l.title, l.who, l.rowCount, l.done])).toEqual([
      ["Commercial property owners, Midland", "commercial", 2, 0],
    ]);
    // A second list with an owner already in the CRM: one contact, tagged twice, not two rows.
    const second = await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "investor" } });
    expect(second).toMatchObject({ rowCount: 3, added: 2 });
    const all = await co.as.query(api.outreach.contacts, { organizationId: org });
    expect(all.rows).toHaveLength(4);
    const oak = all.rows.find((r) => r.name === "Oak Plaza LLC")!;
    expect(oak.kinds).toEqual(["commercial", "investor"]);
    expect(oak.listIds).toEqual([saved.listId, second.listId]);
    expect(all).toMatchObject({ balanceCents: 0, unlockCents: 100 });

    // Working the contacts: a status is the contact's, so it shows on every list it's on.
    await co.as.mutation(api.outreach.setStatus, { organizationId: org, contactId: oak.id, status: "done", note: "Mailed the letter" });
    const city = list.find((r) => r.name === "City Of Midland")!;
    await co.as.mutation(api.outreach.setStatus, { organizationId: org, contactId: city.id, status: "skip" });
    await co.as.mutation(api.outreach.setStatus, { organizationId: org, contactId: city.id, status: "sent" });
    expect((await onList(saved.listId)).map((r) => [r.status, r.note])).toEqual([["sent", undefined], ["done", "Mailed the letter"]]);
    expect((await co.as.query(api.outreach.lists, { organizationId: org })).map((l) => [l.who, l.done]).sort()).toEqual([["commercial", 1], ["investor", 1]]);

    // Another company can't see it; a company off the plan can't use Outreach at all.
    const other = await proCompany(t, "owner@paint.example");
    expect((await other.as.query(api.outreach.contacts, { organizationId: other.organizationId, listId: saved.listId })).rows).toEqual([]);
    await expect(other.as.mutation(api.outreach.setStatus, { organizationId: other.organizationId, contactId: oak.id, status: "done" })).rejects.toThrow(/No such contact/);
    const free = await signUp(t, "owner@free.example");
    await expect(free.as.query(api.outreach.lists, { organizationId: free.organizationId })).rejects.toThrow(/Pro plan/);
    await expect(free.as.query(api.outreach.preview, { organizationId: free.organizationId, definition: { county: "Midland", who: "wealthy" } })).rejects.toThrow(/Pro plan/);

    // Dropping a list untags its contacts; one on no other list goes with it.
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: saved.listId });
    expect((await co.as.query(api.outreach.lists, { organizationId: org })).map((l) => l.who)).toEqual(["investor"]);
    const left = await co.as.query(api.outreach.contacts, { organizationId: org });
    expect(left.rows.map((r) => [r.name, r.kinds, r.status])).toEqual([
      ["Nuka Hiva LLC", ["investor"], "new"],
      ["Oak Plaza LLC", ["investor"], "done"],
      ["Park Holdings LP", ["investor"], "new"],
    ]);
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: second.listId });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("outreachContacts").collect()).toEqual([]);
    });
  });

  test("rows kept before contacts existed move over on deploy, tagged with their list", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const co = await proCompany(t);
    const org = co.organizationId;
    const { listId, otherId } = await t.run(async (ctx) => {
      const [user] = await ctx.db.query("users").collect();
      const base = { organizationId: org, title: "Shopping center owners", definition: { county: "Midland", who: "commercial" as const }, rowCount: 1, done: 0, truncated: false, createdBy: user._id, createdAt: "2026-11-01T00:00:00.000Z" };
      const listId = await ctx.db.insert("outreachLists", base);
      const otherId = await ctx.db.insert("outreachLists", { ...base, definition: { county: "Midland", who: "investor" } });
      const row = { organizationId: org, key: "OAK PLAZA LLC|1 MAIN ST|75201", name: "Oak Plaza LLC", company: "Oak Plaza LLC", mailing: { address: "1 MAIN ST", zip: "75201" }, property: { parcelId: (await ctx.db.insert("parcels", { county: "Midland", cadId: "R-1", useCode: "F1", siteAddress: "12 MIDKIFF RD", addressKey: "12 MIDKIFF RD", looseKey: "12 MIDKIFF", owner: "OAK PLAZA LLC", mailing: {}, ownerOccupied: false, companyOwned: true, importedAt: "2026-11-01T00:00:00.000Z" })), address: "12 Midkiff Rd", useCode: "F1", valueCents: 300_000_000 }, properties: 1, totalValueCents: 300_000_000, why: "Commercial building worth $3M" };
      await ctx.db.insert("outreachRows", { ...row, listId, status: "done", note: "Mailed" });
      await ctx.db.insert("outreachRows", { ...row, listId: otherId, status: "new" });
      return { listId, otherId };
    });
    expect(await t.mutation(internal.outreach.migrateRows, {})).toEqual({ moved: 2, more: false });
    const rows = (await co.as.query(api.outreach.contacts, { organizationId: org })).rows;
    expect(rows.map((r) => [r.name, r.kinds, r.listIds, r.status, r.note])).toEqual([["Oak Plaza LLC", ["commercial", "investor"], [listId, otherId], "done", "Mailed"]]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("outreachRows").collect()).toEqual([]);
    });
    expect(await t.mutation(internal.outreach.migrateRows, {})).toEqual({ moved: 0, more: false });
  });

  test("enriching a contact runs the stack per field: the person behind an LLC free, a found phone for $1, emails and misses free", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const rows = (await read()).rows;
    const oak = rows.find((r) => r.name === "Oak Plaza LLC")!;
    const cityHall = rows.find((r) => r.name === "City Of Midland")!;
    expect(oak.enrichment).toEqual({ phone: { status: "locked" }, email: { status: "locked" }, person: { status: "locked" } });
    expect((await read()).coverage).toEqual({ phone: { found: 0, total: 2, sources: 0 }, email: { found: 0, total: 2, sources: 0 }, person: { found: 0, total: 2, sources: 0 } });

    // No balance: refused before anything is queued. The person lookup alone is free.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id] })).rejects.toThrow(/Balance too low: \$1\.00 needed for 1 phone, \$0\.00 available/);
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["person"] })).resolves.toEqual({ queued: 1, costCents: 0 });
    expect((await read()).rows.find((r) => r.id === oak.id)!.enrichment.person.status).toBe("running");
    // No key for it: a failed cell that says so, nothing charged, and not counted as a source attempt.
    vi.stubEnv("TX_COMPTROLLER_API_KEY", "");
    vi.stubEnv("BATCHDATA_API_KEY", "");
    await t.finishAllScheduledFunctions(() => {});
    const noKey = (await read()).rows.find((r) => r.id === oak.id)!;
    expect(noKey.enrichment.person).toMatchObject({ status: "failed", error: expect.stringContaining("TX_COMPTROLLER_API_KEY") });

    // With keys: the Comptroller names Oak Plaza's manager, BatchData finds her phones and an email; the city gets nothing.
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 250 }));
    vi.stubEnv("TX_COMPTROLLER_API_KEY", "cpa-key");
    vi.stubEnv("BATCHDATA_API_KEY", "bd-key");
    const calls: Array<{ url: string; headers: Record<string, string>; body?: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
        calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body });
        const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
        if (url.includes("franchise-tax-list")) {
          const name = decodeURIComponent(url.split("name=")[1]);
          return json({ success: true, data: name === "OAK PLAZA LLC" ? [{ name: "OAK PLAZA LLC", taxpayerId: "32011111111", mailingAddressZip: "75201" }] : [], count: 1 });
        }
        if (url.includes("franchise-tax/32011111111")) {
          return json({
            success: true,
            data: {
              name: "OAK PLAZA LLC",
              officerInfo: [
                { AGNT_NM: "OAK HOLDINGS INC", AGNT_TITL_TX: "MEMBER", CITY_NM: "DALLAS", ST_CD: "TX" },
                { AGNT_NM: "DANA REYES", AGNT_TITL_TX: "MANAGER", AD_STR_POB_TX: "1 MAIN ST STE 400", CITY_NM: "DALLAS", ST_CD: "TX", AD_ZP: "752011234" },
                { AGNT_NM: "SAM REYES", AGNT_TITL_TX: "SECRETARY", CITY_NM: "DALLAS", ST_CD: "TX" },
              ],
            },
          });
        }
        const requests = (body as { requests: Array<{ propertyAddress: { street: string }; name?: { first?: string; last?: string } }> }).requests;
        const hit = requests[0].propertyAddress.street.startsWith("12 ");
        return json({
          results: {
            persons: hit
              ? [
                  {
                    name: { first: "Dana", last: "Reyes" },
                    phoneNumbers: [
                      { number: "432-555-0199", type: "Land Line", tcpa: true, score: 60 },
                      { number: "(432) 555-0100", type: "Mobile", dnc: false, reachable: true, score: 95 },
                      { number: "+1 432 555 0100", type: "Mobile" },
                      { number: "432-555-0177", type: "VoIP", score: 95 },
                    ],
                    emails: [{ email: "Dana@OakPlaza.com" }, { email: "dana@oakplaza.com" }],
                  },
                ]
              : [],
          },
        });
      }),
    );
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id, cityHall.id, oak.id] })).resolves.toEqual({ queued: 2, costCents: 200 });
    const running = (await read()).rows;
    expect(running.find((r) => r.id === oak.id)!.enrichment).toMatchObject({ person: { status: "running" }, phone: { status: "running" }, email: { status: "running" } });
    expect(running.find((r) => r.id === cityHall.id)!.enrichment).toMatchObject({ person: { status: "running" }, phone: { status: "running" } });
    // Running ones aren't queued twice.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id] })).resolves.toEqual({ queued: 0, costCents: 0 });
    await t.finishAllScheduledFunctions(() => {});

    const traced = await read();
    const oakNow = traced.rows.find((r) => r.id === oak.id)!;
    expect(oakNow.person).toEqual({ name: "Dana Reyes", title: "Manager", address: "1 MAIN ST STE 400, DALLAS, TX, 75201", source: "tx-comptroller" });
    expect(oakNow.enrichment).toMatchObject({
      person: { status: "found", source: "tx-comptroller" },
      phone: { status: "found", source: "batchdata", chargedCents: 100 },
      email: { status: "found", source: "batchdata" },
    });
    // Ranked: the vendor's score first, then mobile before VoIP before landline; the DNC landline is kept but flagged.
    expect(oakNow.phones).toEqual([
      { number: "4325550100", type: "mobile", verified: true, score: 95, source: "batchdata" },
      { number: "4325550177", type: "voip", score: 95, source: "batchdata" },
      { number: "4325550199", type: "landline", dnc: true, score: 60, source: "batchdata" },
    ]);
    expect(oakNow.emails).toEqual([{ email: "dana@oakplaza.com", source: "batchdata" }]);
    const cityNow = traced.rows.find((r) => r.id === cityHall.id)!;
    // The state has no entity called City Of Midland, and BatchData has nothing for it: three free misses.
    expect(cityNow.enrichment).toMatchObject({ phone: { status: "none" }, email: { status: "none" }, person: { status: "none" } });
    expect(cityNow.phones).toEqual([]);
    expect(traced.balanceCents).toBe(150);
    expect(traced.coverage).toEqual({ phone: { found: 1, total: 2, sources: 1 }, email: { found: 1, total: 2, sources: 1 }, person: { found: 1, total: 2, sources: 1 } });
    expect(traced.phoneHitRate).toBe(0.5);
    // The Comptroller was asked by name with the key; BatchData was asked once per contact, for the manager by name.
    const cpa = calls.filter((c) => c.url.includes("comptroller.texas.gov"));
    expect(cpa.map((c) => c.headers["x-api-key"])).toEqual(["cpa-key", "cpa-key", "cpa-key"]);
    const bd = calls.filter((c) => c.url === "https://api.batchdata.com/api/v1/property/skip-trace");
    expect(bd).toHaveLength(2);
    const oakAsk = bd.find((c) => (c.body as { requests: Array<{ propertyAddress: { street: string } }> }).requests[0].propertyAddress.street === "12 Midkiff Rd")!;
    expect((oakAsk.body as { requests: Array<{ name: unknown }> }).requests[0].name).toEqual({ first: "Dana", last: "Reyes" });
    await t.run(async (ctx) => {
      const charges = await ctx.db.query("walletTransactions").collect();
      expect(charges.map((c) => [c.type, c.amountCents, c.balanceAfterCents, c.contactId, c.note])).toEqual([["unlock", -100, 150, oak.id, "Phone for Oak Plaza LLC via BatchData"]]);
      const stats = (await ctx.db.query("dataSourceStats").collect()).map((s) => [s.source, s.field, s.attempts, s.hits, s.chargedCents]).sort();
      expect(stats).toEqual([
        ["batchdata", "email", 1, 1, 0],
        ["batchdata", "phone", 1, 1, 100],
        ["none", "email", 1, 0, 0],
        ["none", "person", 1, 0, 0],
        ["none", "phone", 1, 0, 0],
        ["tx-comptroller", "person", 1, 1, 0],
      ]);
    });
    // Staff see the stack with this company's numbers.
    const ops = await signUp(t, "ops@webb.example", { role: "staff" });
    const stack = await ops.as.query(api.outreach.sources, { organizationId: org });
    expect(stack.map((s) => [s.name, s.connected, s.stats.map((x) => [x.field, x.attempts, x.hits, x.chargedCents])])).toEqual([
      ["tx-comptroller", true, [["person", 1, 1, 0]]],
      ["batchdata", true, [["phone", 1, 1, 100], ["email", 1, 1, 0]]],
    ]);
    await expect(co.as.query(api.outreach.sources, { organizationId: org })).rejects.toThrow(/staff/);
    // A found field isn't traced again; a failed one can be. A dropped list keeps a paid contact.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id] })).resolves.toEqual({ queued: 0, costCents: 0 });
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [cityHall.id], fields: ["phone"] })).resolves.toEqual({ queued: 1, costCents: 100 });
    await t.finishAllScheduledFunctions(() => {});
    const lists = await co.as.query(api.outreach.lists, { organizationId: org });
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: lists[0].id });
    expect((await read()).rows.map((r) => [r.name, r.kinds, r.phones.length])).toEqual([["Oak Plaza LLC", [], 3]]);
  });

  test("a contact unlocked before per-field cells gets its cells on deploy", async () => {
    const t = setup();
    const co = await proCompany(t);
    const org = co.organizationId;
    const id = await t.run(async (ctx) => {
      const [user] = await ctx.db.query("users").collect();
      const parcelId = await ctx.db.insert("parcels", { county: "Midland", cadId: "R-9", useCode: "F1", siteAddress: "12 MIDKIFF RD", addressKey: "12 MIDKIFF RD", looseKey: "12 MIDKIFF", owner: "OAK PLAZA LLC", mailing: {}, ownerOccupied: false, companyOwned: true, importedAt: "2026-11-01T00:00:00.000Z" });
      return await ctx.db.insert("outreachContacts", {
        organizationId: org,
        key: "OAK PLAZA LLC|1 MAIN ST|75201",
        name: "Oak Plaza LLC",
        company: "Oak Plaza LLC",
        mailing: { address: "1 MAIN ST", zip: "75201" },
        property: { parcelId, address: "12 Midkiff Rd", useCode: "F1", valueCents: 300_000_000 },
        properties: 1,
        totalValueCents: 300_000_000,
        why: "Commercial building worth $3M",
        kinds: ["commercial"],
        listIds: [],
        status: "new",
        phones: [{ number: "4325550100", type: "mobile", source: "batchdata" }],
        emails: [],
        unlock: { status: "found", at: "2026-11-05T15:01:00.000Z", requestedBy: user._id, vendor: "batchdata", chargedCents: 100 },
        createdAt: "2026-11-05T15:00:00.000Z",
      });
    });
    // Read as cells before the migration, and the same after it.
    const before = (await co.as.query(api.outreach.contacts, { organizationId: org })).rows[0];
    expect(before.enrichment).toMatchObject({ phone: { status: "found", source: "batchdata", chargedCents: 100 }, email: { status: "none" }, person: { status: "locked" } });
    expect(await t.mutation(internal.outreach.migrateUnlocks, {})).toEqual({ moved: 1 });
    const after = (await co.as.query(api.outreach.contacts, { organizationId: org })).rows[0];
    expect(after.enrichment).toEqual(before.enrichment);
    await t.run(async (ctx) => {
      const c = (await ctx.db.get(id))!;
      expect(c.unlock).toBeUndefined();
      expect(c.enrichment?.phone.status).toBe("found");
    });
    expect(await t.mutation(internal.outreach.migrateUnlocks, {})).toEqual({ moved: 0 });
  });

  test("a long facet is read top-down to the limit, and says so when it's cut", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    // 30 homes, $100K apart, then a 5-row list of the most valuable.
    await addParcels(t, Array.from({ length: 30 }, (_, i) => parcel(`h${i}`, { owner: `OWNER ${i}`, marketValueCents: (i + 1) * 10_000_000 })));
    await rebuild(t);
    const co = await proCompany(t);
    const top = await co.as.query(api.outreach.preview, { organizationId: co.organizationId, definition: { county: "Midland", who: "wealthy", minValueCents: 0, limit: 5 } });
    expect(top).toMatchObject({ count: 5, limited: true, truncated: false });
    expect(top.rows.map((r) => r.property.valueCents)).toEqual([300_000_000, 290_000_000, 280_000_000, 270_000_000, 260_000_000]);
    // A floor stops the read early rather than scanning on.
    expect((await co.as.query(api.outreach.preview, { organizationId: co.organizationId, definition: { county: "Midland", who: "wealthy", minValueCents: 285_000_000 } })).count).toBe(2);
  });
});

// ---- From the office line and Claude ----

/** A Claude or ChatGPT connection for the company's owner, as the connector stores one. */
async function connection(t: ReturnType<typeof setup>, co: { userId: Id<"users">; organizationId: Id<"organizations"> }) {
  const id = await t.run(async (ctx) =>
    ctx.db.insert("aiConnections", {
      userId: co.userId,
      organizationId: co.organizationId,
      clientId: "claude",
      app: "claude",
      scopes: ["leads"],
      dailyCapCents: 50_000,
      accessHash: `a-${co.userId}`,
      accessExpiresAt: Date.now() + 3_600_000,
      refreshHash: `r-${co.userId}`,
      refreshExpiresAt: Date.now() + 86_400_000,
      createdAt: new Date().toISOString(),
    }),
  );
  return (await t.run(async (ctx) => ctx.db.get(id)))!;
}

/** Runs a connector tool the way /mcp and the office line do: in a mutation, signed in as the connection's person. */
const runTool = (t: ReturnType<typeof setup>, conn: Awaited<ReturnType<typeof connection>>, name: string, args: Record<string, unknown> = {}) =>
  t.run(async (ctx) => await findTool(name)!.run(actAs(ctx, conn.userId, conn._id), conn, args));

describe("pulling a list from Claude or the office line", () => {
  test("saves the list and answers with the count, a sample and the link; Pro only", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("SITE_URL", "https://app.example");
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const conn = await connection(t, co);

    const pulled = await runTool(t, conn, "pull_outreach_list", { who: "commercial", title: "Shopping center owners" });
    const data = pulled.data as { listId: string; count: number; link: string };
    expect(data.count).toBe(2);
    expect(data.link).toBe(`https://app.example/outreach/${data.listId}`);
    expect(pulled.text).toContain(`2 commercial owners in Midland County, saved as "Shopping center owners": https://app.example/outreach/${data.listId}`);
    expect(pulled.text).toContain("- Oak Plaza LLC, 1 MAIN ST, DALLAS, TX, 75201 (Commercial building worth $3M)");
    expect(pulled.text).toContain("Names and mailing addresses only");
    expect((await co.as.query(api.outreach.lists, { organizationId: co.organizationId })).map((l) => l.title)).toEqual(["Shopping center owners"]);

    // Dollars in, a default title out; save false only counts.
    const counted = await runTool(t, conn, "pull_outreach_list", { who: "wealthy", min_value: 1_000_000, save: false });
    expect(counted.text).toContain("1 wealthy homeowners in Midland County (not saved).");
    expect((counted.data as { definition: unknown }).definition).toEqual({ county: "Midland", who: "wealthy", minValueCents: 100_000_000 });
    expect((await co.as.query(api.outreach.lists, { organizationId: co.organizationId }))).toHaveLength(1);
    await expect(runTool(t, conn, "pull_outreach_list", { who: "doctors" })).rejects.toThrow(/who must be one of/);

    const listed = await runTool(t, conn, "list_outreach_lists");
    expect(listed.text).toBe(`- Shopping center owners: 2 commercial owners, 0 done. https://app.example/outreach/${data.listId}`);

    // Off the plan: told where to start it, nothing built.
    const free = await signUp(t, "owner@free.example");
    const freeConn = await connection(t, free);
    expect(await runTool(t, freeConn, "pull_outreach_list", { who: "commercial" })).toEqual({
      text: "Outreach lists are part of the Pro plan. Start it at https://app.example/plan.",
      data: { locked: true },
    });
    expect((await runTool(t, freeConn, "list_outreach_lists")).data).toEqual({ locked: true });
  });
});

describe("asking in plain words", () => {
  /** Claude, stubbed with one structured answer; the request bodies it got. */
  function stubClaude(answer: unknown, status = 200) {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init!.body)) as Record<string, unknown>);
        const text = typeof answer === "string" ? answer : JSON.stringify(answer);
        return new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn" }), { status });
      }),
    );
    return bodies;
  }

  test("turns the ask into a definition with a count and preview, as structured output", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const bodies = stubClaude({
      kind: "list",
      title: "Shopping center owners, Midland",
      explanation: "Owners of commercial buildings on the roll; no phone numbers, and LLC names where a company owns it.",
      definition: { who: "commercial" },
    });
    const got = await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "shopping center owners in Midland" });
    expect(got).toMatchObject({ ok: true, title: "Shopping center owners, Midland", definition: { county: "Midland", who: "commercial" }, count: 2, truncated: false });
    expect(got.ok && got.preview.map((r) => r.name)).toEqual(["Oak Plaza LLC", "City Of Midland"]);
    // One call, structured output, no forced tool, the guide cached, the ask as the message.
    expect(bodies).toHaveLength(1);
    const body = bodies[0] as { output_config: { format: { type: string } }; tool_choice?: unknown; system: Array<{ cache_control?: unknown }>; messages: Array<{ content: string }> };
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.tool_choice).toBeUndefined();
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages).toEqual([{ role: "user", content: "shopping center owners in Midland" }]);
  });

  test("says what it can't do and offers the closest list; a bad answer or no key is a plain message", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    stubClaude({
      kind: "cannot",
      explanation: "The roll doesn't say what anyone does for a living.",
      closest: { definition: { who: "wealthy", min_value: 1_500_000 }, title: "Homes over $1.5M, Midland" },
    });
    expect(await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "oil executives" })).toEqual({
      ok: false,
      explanation: "The roll doesn't say what anyone does for a living.",
      suggestion: { definition: { county: "Midland", who: "wealthy", minValueCents: 150_000_000 }, title: "Homes over $1.5M, Midland" },
    });
    stubClaude("not json");
    expect(await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "a list of accountants" })).toEqual({
      ok: false,
      explanation: "The assistant couldn't answer just now. Until it is, say one of: shopping center owners, investors, property managers, apartment owners, homes over $1M, recent buyers, absentee owners.",
    });
    // No key: the words alone build the common lists, and say so; a stretch names what's missing.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const words = await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "Property managers" });
    expect(words).toMatchObject({ ok: true, definition: { county: "Midland", who: "manager" }, title: "Property managers, Midland", count: 1 });
    expect(words.explanation).toBe("Property managers. Names and mailing addresses; no phone numbers.");
    expect(words).not.toHaveProperty("note");
    const stretch = await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "oil executives" });
    expect(stretch).toEqual({
      ok: false,
      explanation: "The assistant isn't connected. Until it is, say one of: shopping center owners, investors, property managers, apartment owners, homes over $1M, recent buyers, absentee owners.",
    });
    // Staff see why the words picked the list.
    const ops = await signUp(t, "ops@webb.example", { role: "staff" });
    await t.run(async (ctx) => {
      await ctx.db.patch(ops.organizationId, {
        plan: { monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, status: "active", periodStart: "2026-10-01T00:00:00.000Z", nextChargeAt: "2026-12-01T00:00:00.000Z", claimsThisPeriod: 0 },
      });
    });
    const seen = await ops.as.action(api.outreach.interpret, { organizationId: ops.organizationId, request: "Property managers" });
    expect(seen).toMatchObject({ ok: true, note: "The assistant isn't connected: the Convex deployment has no Anthropic key, so the words alone picked this list." });
    // The assistant errors out: the words step in too.
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    stubClaude("not json");
    expect(await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "landlords" })).toMatchObject({ ok: true, definition: { who: "investor" }, count: 3 });
    // Off the plan: refused before any call.
    const free = await signUp(t, "owner@free.example");
    await expect(free.as.action(api.outreach.interpret, { organizationId: free.organizationId, request: "investors" })).rejects.toThrow(/Pro plan/);
  });
});
