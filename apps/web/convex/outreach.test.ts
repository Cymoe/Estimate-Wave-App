import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";
import { actAs } from "./lib/actor";
import { findTool } from "./lib/mcpTools";
import { addressKey, looseKey } from "./lib/parcels";
import { isSampleNumber, sampleFor } from "./lib/outreachSample";
import { syncContactSignals } from "./lib/contactSignals";
import { FREE_LOOKUPS, AddressCounter, OccupantGrouper, OwnerGrouper, careOf, definitionFromArgs, defaultTitle, designersOn, displayName, dollarsIn, facetsOf, familyKey, groupOwners, guessDefinition, listOrder, mailKey, matches, occupantsOn, ownerKey, parcelsIn, sameParty, shortMoney, tradesForSignal, underFloor, why, withSignal, type Condensed, type OwnerRow } from "./lib/outreach";
import { applyEmailCheck, checkEmails, checkPhones, checkPhonesWith, cobaltSos, enformion, expectedNames, guarded, hunter, leadMagic, leadMagicMobile, lineFrom, lineOwner, samePerson, scrubPhones, standsAlone, tracerfyDnc, trestleRealContact, twilioLookup, vendors, waterfall, zeroBounce, type TraceInput } from "./lib/skipTrace";
import { CHANGES_MAX, GIVE_UP_AFTER_MS, GIVE_UP_ERROR, OWNER_CAP, OWNER_CAP_ERROR, SAMPLE_LEFT_OUT, UNPAID_ERROR } from "./outreach";

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

  test("governments, districts and lenders hold parcels without being investors", () => {
    const holder = (name: string): OwnerRow => ({
      key: name,
      kind: "owner",
      name,
      company: true,
      mailing: { address: "500 N LORAINE ST", city: "MIDLAND", state: "TX", zip: "79701" },
      parcels: 28,
      residential: 0,
      multifamily: 0,
      commercial: 28,
      totalValueCents: 2_810_000_000,
      maxValueCents: 2_810_000_000,
      commercialValueCents: 2_810_000_000,
      ownerOccupied: false,
      outOfState: false,
      useCodes: ["F1"],
      streets: ["N LORAINE ST"],
      tops: {},
    });
    const facets = (name: string) => facetsOf(holder(name), NOW).map((f) => f.facet);
    // The roll writes the county's own name without "County of".
    for (const name of ["Midland County", "Midland County Hospital District", "Midland Independent School District", "Permian Basin Municipal Utility District", "Midland Memorial Foundation", "First Federal Credit Union", "Fairview Cemetery"]) {
      expect(facets(name), name).toEqual(["commercial"]);
    }
    // A company with a government word inside its name is still an investor; with 28 buildings it's a portfolio owner too, where the city with as many is not.
    for (const name of ["County Line Investments LLC", "District Holdings LLC", "Federal Street Partners LP"]) {
      expect(facets(name), name).toEqual(["investor", "commercial", "portfolio"]);
    }
    expect(facetsOf(holder("District Holdings LLC"), NOW).find((f) => f.facet === "portfolio")!.sort).toBe(28 * 1e9 + 1e9 - 1);
    expect(underFloor(holder("District Holdings LLC"), { county: "Midland", who: "portfolio", minParcels: 30 }, "portfolio")).toBe(true);
    expect(matches({ ...holder("District Holdings LLC"), parcels: 30, commercial: 2 }, { county: "Midland", who: "portfolio", minParcels: 3 }, "portfolio", NOW)).toBe(false);
    // Read top-down by holdings, an investor list with a floor stops at the first owner under it; by value, the rest do.
    const four = { ...holder("Four Corners LLC"), parcels: 4 };
    expect(underFloor(four, { county: "Midland", who: "investor", minParcels: 5 }, "investor")).toBe(true);
    expect(underFloor(four, { county: "Midland", who: "investor", minParcels: 4 }, "investor")).toBe(false);
    expect(underFloor(four, { county: "Midland", who: "investor", companyOwned: true }, "investor")).toBe(false);
    // Landlords: homes they rent out, not buildings; the one they live in doesn't count.
    const landlord = { ...holder("Rentals Of Midland LLC"), parcels: 4, residential: 4, commercial: 0, ownerOccupied: false };
    const rentals = { county: "Midland", who: "investor" as const, minParcels: 3, minRentals: 3 };
    expect(matches(landlord, rentals, "investor", NOW)).toBe(true);
    expect(matches({ ...landlord, ownerOccupied: true, residential: 3 }, rentals, "investor", NOW)).toBe(false);
    expect(matches(holder("District Holdings LLC"), rentals, "investor", NOW)).toBe(false);
    expect(defaultTitle(rentals)).toBe("Landlords with 3+ rental homes, Midland");
    expect(definitionFromArgs({ who: "investor", min_rentals: 3 })).toMatchObject({ who: "investor", minRentals: 3 });
    expect(underFloor(four, { county: "Midland", who: "builder", minParcels: 5 }, "builder")).toBe(true);
    expect(underFloor(four, { county: "Midland", who: "commercial", minValueCents: 3_000_000_000 }, "commercial")).toBe(true);
    expect(underFloor(four, { county: "Midland", who: "commercial", minValueCents: 2_000_000_000 }, "commercial")).toBe(false);
    expect(underFloor(four, { county: "Midland", who: "recent_buyer", minValueCents: 9_000_000_000 }, "buyer")).toBe(false);
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
    expect(defaultTitle({ county: "Midland", who: "investor", companyOwned: true, minParcels: 5 })).toBe("Company investors with 5+ properties, Midland");
    expect(defaultTitle({ county: "Midland", who: "investor", companyOwned: false, outOfState: true })).toBe("Out-of-state individual investors, Midland");
    expect(defaultTitle({ county: "Midland", who: "commercial", companyOwned: true, minValueCents: 500_000_000 })).toBe("Commercial property owners (companies) over $5M, Midland");
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
    // The cuts on a holder list: companies only, a floor on holdings, mail outside Texas.
    expect(who("Company investors with 5 or more properties")).toEqual({ county: "Midland", who: "investor", companyOwned: true, minParcels: 5 });
    expect(guessDefinition("Company investors with 5 or more properties")!.title).toBe("Company investors with 5+ properties, Midland");
    expect(who("investors who are LLCs with 10+ properties")).toEqual({ county: "Midland", who: "investor", companyOwned: true, minParcels: 10 });
    expect(who("landlords with more than 4 rentals")).toEqual({ county: "Midland", who: "investor", minParcels: 5 });
    expect(who("individual investors with at least 3 properties")).toEqual({ county: "Midland", who: "investor", companyOwned: false, minParcels: 3 });
    expect(who("out of state investors")).toEqual({ county: "Midland", who: "investor", outOfState: true });
    expect(who("investors with mail outside Texas")).toEqual({ county: "Midland", who: "investor", outOfState: true });
    expect(who("shopping center owners that are companies")).toEqual({ county: "Midland", who: "commercial", companyOwned: true });
    // Dollars are not a floor on holdings, and a homeowner list takes no company cut.
    expect(who("commercial buildings over 5 million")).toEqual({ county: "Midland", who: "commercial", minValueCents: 500_000_000 });
    expect(who("wealthy company owners")).toEqual({ county: "Midland", who: "wealthy" });
    expect(parcelsIn("5+")).toBe(5);
    expect(parcelsIn("over 5 million")).toBeUndefined();
  });

  test("the records lists from their words: violations by trade, stalled permits, contractors by permits, homes owned for years", () => {
    const who = (ask: string) => guessDefinition(ask)?.definition;
    const title = (ask: string) => guessDefinition(ask)?.title;
    expect(who("homes with code violations")).toEqual({ county: "Midland", who: "violation" });
    expect(who("roof violations")).toEqual({ county: "Midland", who: "violation", trades: ["roofing"] });
    expect(title("roof violations")).toBe("Code violations for roofing, Midland");
    expect(who("fix-it list for fences and weeds")).toEqual({ county: "Midland", who: "violation", trades: ["outdoor-construction"] });
    expect(who("stalled permits")).toEqual({ county: "Midland", who: "stalled" });
    expect(who("expired permits for pools")).toEqual({ county: "Midland", who: "stalled", trades: ["outdoor-construction"] });
    expect(who("contractors pulling permits")).toEqual({ county: "Midland", who: "contractor" });
    expect(who("roofing contractors with 3+ permits")).toEqual({ county: "Midland", who: "contractor", trades: ["roofing"], minParcels: 3 });
    expect(title("roofing contractors with 3+ permits")).toBe("Roofing contractors with 3+ permits, Midland");
    expect(who("GCs who are building right now")).toEqual({ county: "Midland", who: "contractor", trades: ["general-construction"] });
    expect(who("active builders")).toEqual({ county: "Midland", who: "contractor" });
    // Homebuilders holding lots are still their own list.
    expect(who("homebuilders")).toEqual({ county: "Midland", who: "builder" });
    expect(who("homes owned 20+ years")).toEqual({ county: "Midland", who: "long_owned", ownedForDays: 7305 });
    expect(title("homes owned 20+ years")).toBe("Homes owned 20+ years, Midland");
    expect(who("long-time homeowners")).toEqual({ county: "Midland", who: "long_owned" });
    expect(title("long-time homeowners")).toBe("Long-time homeowners, Midland");
    expect(who("empty nesters")).toEqual({ county: "Midland", who: "long_owned" });
    // From the assistant: the same fields in its words, checked.
    expect(definitionFromArgs({ who: "contractor", trades: ["Roofing", "hvac"], within_days: 90, min_parcels: 2 })).toEqual({ county: "Midland", who: "contractor", trades: ["roofing", "hvac"], withinDays: 90, minParcels: 2 });
    expect(definitionFromArgs({ who: "long_owned", owned_for_years: 30 })).toEqual({ county: "Midland", who: "long_owned", ownedForDays: 10958 });
    expect(() => definitionFromArgs({ who: "violation", trades: ["astrology"] })).toThrow(/trades must be among/);
    expect(defaultTitle({ county: "Midland", who: "contractor", trades: ["roofing", "electrical"] })).toBe("Active contractors for roofing, electrical, Midland");
    // What a violation calls for.
    expect(tradesForSignal({ kind: "code_violation", detail: "Deteriorated Structure" })).toEqual(["general-construction", "roofing"]);
    expect(tradesForSignal({ kind: "code_violation", detail: "High Weeds" })).toEqual(["outdoor-construction"]);
    expect(tradesForSignal({ kind: "code_violation", detail: "Illegal Sign" })).toEqual([]);
    expect(tradesForSignal({ kind: "stalled_permit", detail: "Pool: Expired - after 6 month" })).toEqual(["outdoor-construction", "concrete"]);
    expect(tradesForSignal({ kind: "demolition", detail: "Residential, Full" })).toEqual(["general-construction"]);
  });

  test("the upstream lists from their words: one owner with several buildings, and the architects and engineers on commercial permits", () => {
    const who = (ask: string) => guessDefinition(ask)?.definition;
    const title = (ask: string) => guessDefinition(ask)?.title;
    expect(who("retail shop owners")).toEqual({ county: "Midland", who: "portfolio" });
    expect(who("owners of retail stores")).toEqual({ county: "Midland", who: "portfolio" });
    expect(who("storefront owners with 3+ buildings")).toEqual({ county: "Midland", who: "portfolio", minParcels: 3 });
    expect(title("storefront owners with 3+ buildings")).toBe("Commercial portfolio owners with 3+ buildings, Midland");
    expect(who("companies that own several commercial buildings")).toEqual({ county: "Midland", who: "portfolio", companyOwned: true });
    expect(who("commercial portfolios over $2M")).toEqual({ county: "Midland", who: "portfolio", minValueCents: 200_000_000 });
    // A shopping center is still the commercial list.
    expect(who("shopping center owners")).toEqual({ county: "Midland", who: "commercial" });
    expect(who("architects")).toEqual({ county: "Midland", who: "designer" });
    expect(who("engineering firms on commercial permits")).toEqual({ county: "Midland", who: "designer" });
    expect(who("who's drawing the plans")).toEqual({ county: "Midland", who: "designer" });
    expect(who("architects with 2+ permits")).toEqual({ county: "Midland", who: "designer", minParcels: 2 });
    expect(title("architects with 2+ permits")).toBe("Architects and engineers with 2+ permits, Midland");
    expect(definitionFromArgs({ who: "portfolio", min_parcels: 4 })).toEqual({ county: "Midland", who: "portfolio", minParcels: 4 });
    expect(definitionFromArgs({ who: "designer", within_days: 60 })).toEqual({ county: "Midland", who: "designer", withinDays: 60 });
    // Who on a permit counts as the designer: a role that says so, or an applicant that is neither the owner nor the builder nor named like a trade.
    const permit = (contacts: Array<{ role: string; company?: string; person?: string; phone?: string }>, over: { builder?: string; residential?: boolean } = {}) => designersOn({ builder: "WEST TEXAS ROOFING LLC", residential: false, contacts, ...over });
    expect(permit([{ role: "Architect", company: "Parkhill", person: "Lee Ortiz", phone: "4325550199" }, { role: "Owner", company: "Oak Plaza LLC" }])).toEqual([{ company: "Parkhill", contacts: [{ role: "Architect", person: "Lee Ortiz", phone: "4325550199", email: undefined }] }]);
    expect(permit([{ role: "Applicant", company: "Rhotenberry Wellen Architects", person: "Mark Wellen" }])).toEqual([{ company: "Rhotenberry Wellen Architects", contacts: [{ role: "Applicant", person: "Mark Wellen", phone: undefined, email: undefined }] }]);
    expect(permit([{ role: "Applicant", company: "West Texas Roofing, LLC", person: "Ray Soto" }])).toEqual([]);
    expect(permit([{ role: "Applicant", company: "Oak Plaza LLC" }, { role: "Owner", company: "Oak Plaza LLC" }])).toEqual([]);
    expect(permit([{ role: "Applicant", company: "Basin Electric Inc" }])).toEqual([]);
    expect(permit([{ role: "Applicant", company: "Parkhill" }], { residential: true })).toEqual([]);
    expect(permit([{ role: "Applicant", company: "Parkhill" }], { builder: undefined })).toHaveLength(1);
  });

  test("the tenant list: the business in the space, from whichever source names it, never the landlord", async () => {
    const who = (ask: string) => guessDefinition(ask)?.definition;
    expect(who("new businesses moving in")).toEqual({ county: "Midland", who: "occupant" });
    expect(who("retail tenants")).toEqual({ county: "Midland", who: "occupant" });
    expect(who("restaurants opening in the last 90 days")).toEqual({ county: "Midland", who: "occupant", withinDays: 90 });
    expect(guessDefinition("who just moved in within 6 months")?.title).toBe("Businesses moved in within 183 days, Midland");
    expect(defaultTitle({ county: "Midland", who: "occupant" })).toBe("New businesses moving in, Midland");
    // The owner of the building is still the portfolio or commercial list.
    expect(who("retail shop owners")).toEqual({ county: "Midland", who: "portfolio" });
    // Who a permit says is there: the certificate names the business (the description when the portal has no contacts); a commercial permit's owner contacts, never the builder.
    const co = { name: "Certificate of Occupancy", appliedAt: "2026-10-15T15:00:00.000Z", address: "30 WADLEY AV", addressKey: addressKey("30 WADLEY AV") };
    expect(occupantsOn({ ...co, detail: "Blue Door Boutique" })).toEqual([{ business: "Blue Door Boutique", source: "occupancy", address: "30 WADLEY AV", addressKey: addressKey("30 WADLEY AV"), at: co.appliedAt, contacts: [] }]);
    expect(occupantsOn({ ...co, detail: "Blue Door Boutique", contacts: [{ role: "Applicant", company: "Blue Door LLC", person: "Elena Rivera", phone: "432-555-0144" }] })[0]).toMatchObject({ business: "Blue Door LLC", contacts: [{ person: "Elena Rivera", phone: "432-555-0144" }] });
    expect(occupantsOn({ ...co, detail: "Certificate of Occupancy" })).toEqual([]);
    const job = { name: "Commercial - Building", residential: false, appliedAt: "2026-10-25T15:00:00.000Z", address: "32 WADLEY AV", addressKey: addressKey("32 WADLEY AV"), builder: "GHOST BUILDERS INC" };
    expect(occupantsOn({ ...job, contacts: [{ role: "Contractor", company: "Ghost Builders Inc" }, { role: "Owner", company: "Desert Dental PLLC", person: "Kim Pham" }, { role: "Architect", company: "Parkhill" }] })).toEqual([{ business: "Desert Dental PLLC", source: "permit", address: "32 WADLEY AV", addressKey: addressKey("32 WADLEY AV"), at: job.appliedAt, contacts: [{ role: "Owner", person: "Kim Pham", phone: undefined, email: undefined }] }]);
    expect(occupantsOn({ ...job, contacts: [{ role: "Owner", company: "Ghost Builders, Inc." }] })).toEqual([]);
    expect(occupantsOn({ ...job, residential: true, contacts: [{ role: "Owner", company: "Desert Dental PLLC" }] })).toEqual([]);
    // The same party under another spelling, or one name inside the other.
    expect(sameParty("OAK PLAZA LLC", "Oak Plaza, L.L.C.")).toBe(true);
    expect(sameParty("SMITH JOHN", "John Smith")).toBe(true);
    expect(sameParty("OAK PLAZA", "OAK PLAZA HOLDINGS LLC")).toBe(true);
    expect(sameParty("Desert Dental PLLC", "WADLEY SQUARE PARTNERS LP")).toBe(false);
    // Grouped: the sources for one business merge onto one row (the certificate's spelling wins), a permit "owner" who holds the deed is the landlord and is dropped, a home address is no storefront.
    const roll: Record<string, { parcelId: string; address: string; useCode: string; valueCents?: number; owner?: string }> = {
      [addressKey("30 WADLEY AV")]: { parcelId: "p30", address: "30 WADLEY AV", useCode: "F1", valueCents: 80_000_000, owner: "WADLEY SQUARE PARTNERS LP" },
      [addressKey("12 MIDKIFF RD")]: { parcelId: "p12", address: "12 MIDKIFF RD", useCode: "F1", valueCents: 300_000_000, owner: "OAK PLAZA LLC" },
      [addressKey("4 SPRUCE AV")]: { parcelId: "p4", address: "4 SPRUCE AV", useCode: "A1", owner: "NUKA HIVA LLC" },
    };
    const grouper = new OccupantGrouper().addAll([
      { business: "BLUE DOOR BOUTIQUE", source: "outlet", address: "30 WADLEY AV", addressKey: addressKey("30 WADLEY AV"), at: "2026-10-20T00:00:00.000Z", taxpayer: "RIVERA ELENA", naics: "448120", mailing: { address: "PO BOX 9", city: "MIDLAND", state: "TX", zip: "79702" } },
      ...occupantsOn({ ...co, detail: "Blue Door Boutique" }),
      { business: "Oak Plaza LLC", source: "permit", address: "12 MIDKIFF RD", addressKey: addressKey("12 MIDKIFF RD"), at: "2026-10-05T15:00:00.000Z" },
      { business: "TACO LOCO LLC", source: "outlet", address: "12 MIDKIFF RD", addressKey: addressKey("12 MIDKIFF RD"), at: "2026-09-01T00:00:00.000Z", taxpayer: "TACO LOCO LLC", naics: "722511" },
      { business: "HOME BAKES", source: "outlet", address: "4 SPRUCE AV", addressKey: addressKey("4 SPRUCE AV"), at: "2026-10-01T00:00:00.000Z" },
      { business: "GONE FISHING", source: "outlet", address: "1 NOWHERE LN", addressKey: addressKey("1 NOWHERE LN"), at: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(grouper.size).toBe(5);
    const rows = await grouper.grouped(async () => roll, NOW);
    expect(rows.map((r) => [r.owner.name, r.owner.tops.all.address, r.owner.sources, r.facets.map((f) => f.facet)])).toEqual([
      ["Blue Door Boutique", "30 WADLEY AV", ["occupancy", "outlet"], ["occupant"]],
      ["Taco Loco LLC", "12 MIDKIFF RD", ["outlet"], ["occupant"]],
    ]);
    const boutique = rows[0].owner;
    expect(boutique).toMatchObject({ kind: "occupant", company: true, latestAt: "2026-10-20T00:00:00.000Z", businessKind: "retail", taxpayer: "Rivera Elena", mailing: { city: "MIDLAND", zip: "79702" }, totalValueCents: 80_000_000 });
    // The person behind the sales-tax permit is somebody to ask for; a company behind its own permit is not.
    expect(boutique.contacts).toEqual([{ role: "Sales-tax permit holder", person: "Rivera Elena" }]);
    expect(rows[1].owner.contacts).toBeUndefined();
    expect(why(boutique, "occupant")).toBe("Moved into 30 Wadley Av Oct 2026, a space they don't own (certificate of occupancy, sales-tax permit); retail, run by Rivera Elena");
    expect(why(rows[1].owner, "occupant")).toBe("Moved into 12 Midkiff Rd Sep 2026, a space they don't own (sales-tax permit); restaurant");
    // Newest arrival first; an arrival older than the window is off the facet.
    expect(rows[0].facets[0].sort).toBeGreaterThan(rows[1].facets[0].sort);
    expect(facetsOf({ ...boutique, latestAt: "2025-01-01T00:00:00.000Z" }, NOW)).toEqual([]);
    expect(listOrder({ county: "Midland", who: "occupant" }).label).toBe("newest arrival first");
  });

  test("one more record onto a stored owner row, the way the build would have put it", () => {
    const home = { parcelId: "p1", address: "4 SPRUCE AV", useCode: "A1" };
    const other = { parcelId: "p2", address: "6 ELM ST", useCode: "A1" };
    const base = { signals: [{ kind: "code_violation" as const, detail: "High Weeds", date: "2026-06-01T12:00:00.000Z" }], trades: ["outdoor-construction"], latestAt: "2026-06-01T12:00:00.000Z", tops: { home, signal: home } };
    // Newer: it leads, its home becomes the row's, trades gain what it calls for.
    const newer = withSignal(base, { kind: "code_violation", detail: "Deteriorated Structure", date: "2026-09-01T12:00:00.000Z" }, other);
    expect(newer.signals.map((s) => s.detail)).toEqual(["Deteriorated Structure", "High Weeds"]);
    expect(newer).toMatchObject({ latestAt: "2026-09-01T12:00:00.000Z", trades: ["general-construction", "roofing", "outdoor-construction"], tops: { home, signal: other } });
    // Older: it files in behind, the row's property stays.
    const older = withSignal(base, { kind: "stalled_permit", detail: "Pool: Expired", date: "2026-01-01T12:00:00.000Z" }, other);
    expect(older.signals.map((s) => s.kind)).toEqual(["code_violation", "stalled_permit"]);
    expect(older.tops.signal).toBe(home);
    // The same record again is the same row, by identity, so the pass writes nothing.
    expect(withSignal(base, base.signals[0], other)).toBe(base);
    // A row already full of newer records: an old one doesn't make the cut, and nothing changes.
    const full = { ...base, signals: Array.from({ length: 6 }, (_, i) => ({ kind: "code_violation" as const, detail: `Case ${i}`, date: `2026-0${6 - i}-01T12:00:00.000Z` })) };
    expect(withSignal(full, { kind: "code_violation", detail: "Ancient", date: "2025-01-01T12:00:00.000Z" }, other)).toBe(full);
    expect(withSignal(full, { kind: "code_violation", detail: "New", date: "2026-07-01T12:00:00.000Z" }, other).signals.map((s) => s.detail)).toEqual(["New", "Case 0", "Case 1", "Case 2", "Case 3", "Case 4"]);
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
      // Its free phone lookups are used up, so the tests below are of paid ones; the free ones have a test of their own.
      outreachFreeUsed: FREE_LOOKUPS,
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
  test("reads more than a page of permits, in the build and in the daily pass", async () => {
    // The live rebuild once failed on page two with InvalidCursor: the window's start was recomputed per page, so the cursor belonged to another query. The window is now an argument fixed once per read; this harness doesn't bind cursors to queries, so it only checks the paging itself.
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await t.run(async (ctx) => {
      for (let i = 0; i < 501; i++) {
        await ctx.db.insert("permits", { source: "midland", permitNumber: `P-${i}`, name: "Residential - Building", workClass: "Alteration & Repair", county: "Midland", city: "Midland", appliedAt: new Date(NOW - (i % 170) * 24 * 3600_000).toISOString(), address: "12 MIDKIFF RD", addressKey: addressKey("12 MIDKIFF RD"), trades: ["roofing"], residential: true, importedAt: "2026-11-01T07:20:00.000Z", builder: `BUILDER ${i % 7} LLC` });
      }
    });
    const result = await rebuild(t);
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ fetched: 19, added: 11 + 7 });
    await t.run(async (ctx) => {
      const builders = (await ctx.db.query("owners").collect()).filter((o) => o.kind === "contractor");
      expect(builders.map((b) => b.parcels).reduce((a, b) => a + b, 0)).toBe(501);
    });
    // The daily pass reads the same way.
    expect((await t.action(internal.outreachRefresh.refresh, {})).error).toBeUndefined();
  });

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
    // A list that doesn't narrow its facet is counted from the rebuild's tally, not by reading every owner.
    await t.run(async (ctx) => {
      const owners = (await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-owners")).unique())!;
      expect(owners.facetCounts).toMatchObject({ commercial: 2 });
    });
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: { county: "Midland", who: "commercial" } })).toMatchObject({ count: 2, total: 2, truncated: false, limited: false });
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
    // In the list's own order: the most valuable building first, not the alphabet.
    expect(list.map((r) => [r.name, r.property.valueCents, r.status, r.kinds])).toEqual([
      ["Oak Plaza LLC", 300_000_000, "new", ["commercial"]],
      ["City Of Midland", 30_000_000, "new", ["commercial"]],
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
    expect((await onList(saved.listId)).map((r) => [r.name, r.status, r.note])).toEqual([
      ["Oak Plaza LLC", "done", "Mailed the letter"],
      ["City Of Midland", "sent", undefined],
    ]);
    expect((await co.as.query(api.outreach.lists, { organizationId: org })).map((l) => [l.who, l.done]).sort()).toEqual([["commercial", 1], ["investor", 1]]);

    // A status without a note keeps the note there; an empty one clears it.
    const cityNow = async () => (await co.as.query(api.outreach.contacts, { organizationId: org })).rows.find((r) => r.id === city.id)!;
    await co.as.mutation(api.outreach.setStatus, { organizationId: org, contactId: city.id, status: "new", note: "Ask for Dana, mornings" });
    await co.as.mutation(api.outreach.setStatus, { organizationId: org, contactId: city.id, status: "skip" });
    expect(await cityNow()).toMatchObject({ status: "skip", note: "Ask for Dana, mornings" });
    await co.as.mutation(api.outreach.setStatus, { organizationId: org, contactId: city.id, status: "new" });
    // Send to Leads makes one new lead, from Outreach: the person to call, the company they're with, the property as its address, the note in its notes.
    await t.run(async (ctx) => ctx.db.patch(city.id as never, { person: { name: "Dana Reyes", title: "Owns the home the mail goes to", source: "tx-comptroller" } }));
    const leadId = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: city.id });
    expect(await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: city.id })).toBe(leadId);
    const lead = await t.run(async (ctx) => ctx.db.get(leadId));
    expect(lead).toMatchObject({ name: "Dana Reyes", company: "City Of Midland", source: "Outreach", status: "new", city: "Midland", organizationId: org });
    expect(lead!.notes).not.toContain("Owns the home the mail goes to");
    // Quoting them later makes a client with the company on it.
    const clientId = await co.as.mutation(api.leads.ensureClient, { id: leadId });
    expect(await t.run(async (ctx) => ctx.db.get(clientId))).toMatchObject({ name: "Dana Reyes", companyName: "City Of Midland" });
    expect(lead!.address).toBe(city.property.address);
    expect(lead!.notes).toContain("From Outreach.");
    expect(lead!.notes).toContain("Ask for Dana, mornings");
    // It's on the Leads page like any other lead.
    expect((await co.as.query(api.leads.list, { organizationId: org })).map((l: { name: string }) => l.name)).toContain("Dana Reyes");
    expect(await cityNow()).toMatchObject({ status: "lead", leadId });
    // Deleting the lead in Leads puts the owner back to New here, and Send to Leads makes a fresh one.
    await co.as.mutation(api.leads.remove, { id: leadId });
    expect(await cityNow()).toMatchObject({ status: "new" });
    expect((await cityNow()).leadId).toBeUndefined();
    const again = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: city.id });
    expect(again).not.toBe(leadId);
    // A lead gone some other way (deleted before this was in place) shows the owner as New too.
    await t.run(async (ctx) => ctx.db.delete(again));
    expect(await cityNow()).toMatchObject({ status: "new" });
    // Quoting made them a client, so the owner says so, and a new lead goes under that client instead of making a second one.
    expect((await cityNow()).known).toEqual({ kind: "client", id: clientId, name: "City Of Midland" });
    // With no decision maker found yet, the lead is the company itself, and Company still says so.
    await t.run(async (ctx) => ctx.db.patch(city.id as never, { person: undefined }));
    const bare = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: city.id });
    expect(await t.run(async (ctx) => ctx.db.get(bare))).toMatchObject({ name: "City Of Midland", company: "City Of Midland", clientId });
    expect((await t.run(async (ctx) => ctx.db.get(bare)))!.notes).toContain("Already a client: City Of Midland.");
    expect((await cityNow()).known).toBeUndefined();
    // A lead sent before Company was always filled gets it from the one-off fill; a lead from elsewhere is left alone.
    await t.run(async (ctx) => ctx.db.patch(bare, { company: undefined }));
    const walkIn = await co.as.mutation(api.leads.create, { organizationId: org, data: { name: "Walk-in", source: "Outreach" } });
    expect(await t.mutation(internal.outreach.fillLeadCompanies, {})).toMatchObject({ missing: 2, filled: 1 });
    expect(await t.run(async (ctx) => ctx.db.get(bare))).toMatchObject({ company: "City Of Midland" });
    expect(await t.run(async (ctx) => ctx.db.get(walkIn!._id))).not.toHaveProperty("company");
    expect((await co.as.query(api.outreach.lists, { organizationId: org })).find((l) => l.who === "commercial")!.done).toBe(2);
    // Under a client with no number looked up, the lead takes the client's phone and email: nothing to pay for.
    await t.run(async (ctx) => {
      await ctx.db.delete(bare);
      await ctx.db.patch(clientId, { phone: "(432) 555-0188", email: "dana@city.example" });
    });
    const underClient = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: city.id });
    expect(await t.run(async (ctx) => ctx.db.get(underClient))).toMatchObject({ clientId, phone: "(432) 555-0188", email: "dana@city.example" });

    // A lead the company already has, by a phone, an email or the same name without its LP, is joined, not made twice.
    const park = all.rows.find((r) => r.name === "Park Holdings LP")!;
    const walkUp = await co.as.mutation(api.leads.create, { organizationId: org, data: { name: "Park Holdings", source: "Referral" } });
    const parkNow = async () => (await co.as.query(api.outreach.contacts, { organizationId: org })).rows.find((r) => r.id === park.id)!;
    expect((await parkNow()).known).toEqual({ kind: "lead", id: walkUp!._id, name: "Park Holdings" });
    expect(await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: park.id })).toBe(walkUp!._id);
    expect((await t.run(async (ctx) => ctx.db.get(walkUp!._id)))!.notes).toContain("Also owns as Park Holdings LP:");
    // The lead's drawer shows who it came from.
    expect(await co.as.query(api.outreach.ownersOfLead, { organizationId: org, leadId: walkUp!._id })).toEqual([
      expect.objectContaining({ id: park.id, name: "Park Holdings LP", why: park.why }),
    ]);
    // One word is too loose to match on: a lead named "Nuka" is not Nuka Hiva LLC.
    await co.as.mutation(api.leads.create, { organizationId: org, data: { name: "Nuka" } });
    expect(all.rows.find((r) => r.name === "Nuka Hiva LLC")).toBeDefined();
    expect((await co.as.query(api.outreach.contacts, { organizationId: org })).rows.find((r) => r.name === "Nuka Hiva LLC")!.known).toBeUndefined();

    // Another company can't see it; a company off the plan can't use Outreach at all.
    const other = await proCompany(t, "owner@paint.example");
    expect((await other.as.query(api.outreach.contacts, { organizationId: other.organizationId, listId: saved.listId })).rows).toEqual([]);
    await expect(other.as.mutation(api.outreach.setStatus, { organizationId: other.organizationId, contactId: oak.id, status: "done" })).rejects.toThrow(/No such contact/);
    await expect(other.as.mutation(api.outreach.sendToLeads, { organizationId: other.organizationId, contactId: city.id })).rejects.toThrow(/No such contact/);
    const free = await signUp(t, "owner@free.example");
    await expect(free.as.query(api.outreach.lists, { organizationId: free.organizationId })).rejects.toThrow(/Pro plan/);
    await expect(free.as.query(api.outreach.preview, { organizationId: free.organizationId, definition: { county: "Midland", who: "wealthy" } })).rejects.toThrow(/Pro plan/);

    // Dropping a list untags its contacts; one on no other list goes with it, unless it holds your work (a lead, a status, a note, a lookup).
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: saved.listId });
    expect((await co.as.query(api.outreach.lists, { organizationId: org })).map((l) => l.who)).toEqual(["investor"]);
    const left = await co.as.query(api.outreach.contacts, { organizationId: org });
    expect(left.rows.map((r) => [r.name, r.kinds, r.status])).toEqual([
      ["City Of Midland", [], "lead"],
      ["Nuka Hiva LLC", ["investor"], "new"],
      ["Oak Plaza LLC", ["investor"], "done"],
      ["Park Holdings LP", ["investor"], "lead"],
    ]);
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: second.listId });
    // The owners you worked stay (sent to Leads, or marked done); the untouched one goes.
    await t.run(async (ctx) => {
      expect((await ctx.db.query("outreachContacts").collect()).map((c) => [c.name, c.listIds]).sort()).toEqual([
        ["City Of Midland", []],
        ["Oak Plaza LLC", []],
        ["Park Holdings LP", []],
      ]);
    });
  });

  test("any list can be deleted; owners holding work are never dropped (a list nobody worked says it loses nothing); leftovers are cleared on deploy", async () => {
    const t = setup();
    const co = await proCompany(t);
    const org = co.organizationId;
    const at = "2026-11-01T00:00:00.000Z";
    const gone = (await co.as.mutation(api.leads.create, { organizationId: org, data: { name: "Sent Gone LLC" } }))!._id;
    const { fresh, worked } = await t.run(async (ctx) => {
      const [user] = await ctx.db.query("users").collect();
      const list = { organizationId: org, title: "Fresh", definition: { county: "Midland", who: "investor" as const }, rowCount: 4, done: 0, truncated: false, createdBy: user._id, createdAt: at };
      const fresh = await ctx.db.insert("outreachLists", list);
      const worked = await ctx.db.insert("outreachLists", { ...list, title: "Worked", createdAt: "2026-11-02T00:00:00.000Z" });
      const locked = { status: "locked" as const };
      const contact = (name: string, extra: Record<string, unknown> = {}) =>
        ctx.db.insert("outreachContacts", { organizationId: org, key: name, name, mailing: {}, properties: 1, totalValueCents: 0, why: "", kinds: ["investor"], listIds: [fresh], status: "new", createdAt: at, enrichment: { phone: locked, email: locked, person: locked }, ...extra });
      // Fresh: nothing of the company's own. Simulated results are made up; a worked owner also on Worked loses nothing.
      await contact("Simulated LLC", { phones: [{ number: "+14325550100", type: "mobile", source: "sim" }], enrichment: { phone: { status: "found", source: "sim", simulated: true }, email: locked, person: locked } });
      await contact("Untouched LLC");
      // Sent to Leads, then the lead was deleted there: New again on the page, nothing to keep.
      await ctx.db.delete(gone);
      await contact("Sent Gone LLC", { status: "lead", leadId: gone });
      // A contractor whose permits named who to call: free from the record at build, nobody asked for it.
      await contact("Permit Roofing LLC", { kinds: ["contractor"], person: { name: "Dale Ortiz", source: "permits" }, phones: [{ number: "+14325550111", type: "unknown", source: "permits" }], enrichment: { phone: { status: "found", source: "permits", chargedCents: 0 }, email: locked, person: { status: "found", source: "permits" } } });
      await contact("Two Lists LLC", { listIds: [fresh, worked], status: "callback" });
      // Worked: a real paid lookup only this list holds.
      await contact("Paid LLC", { listIds: [worked], phones: [{ number: "+14326831234", type: "mobile", source: "batchdata" }], enrichment: { phone: { status: "found", source: "batchdata", chargedCents: 100 }, email: locked, person: locked } });
      // On no list already: each kind of work keeps its owner through the cleanup; sample-only results don't.
      await contact("Leftover LLC", { listIds: [], emails: [{ email: "x@example.com", source: "sim" }], enrichment: { phone: locked, email: { status: "found", simulated: true }, person: locked } });
      await contact("License Realty", { listIds: [], kinds: ["realtor"], person: { name: "Ann Lee", source: "trec" }, enrichment: { phone: locked, email: locked, person: { status: "found", source: "trec" } } });
      await contact("Noted LLC", { listIds: [], note: "Wants a quote in spring" });
      await contact("Called LLC", { listIds: [], status: "no_answer" });
      await contact("Researched LLC", { listIds: [], research: { question: "Who manages it?", answer: "Pat at Oak Mgmt", sources: [], at } });
      // The simulated chain's research answer is made up too: nothing of the company's own.
      await contact("Sample Research LLC", { listIds: [], research: { question: "Who manages it?", answer: "Sample: holds 3 Midland properties", sources: [], at }, enrichment: { phone: locked, email: locked, person: locked, research: { status: "found", source: "claude", simulated: true } } });
      return { fresh, worked };
    });
    const flags = async () => (await co.as.query(api.outreach.lists, { organizationId: org })).map((l) => [l.title, l.deletable]);
    expect(await flags()).toEqual([
      ["Worked", false],
      ["Fresh", true],
    ]);
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: fresh });
    const names = async () => (await t.run(async (ctx) => ctx.db.query("outreachContacts").collect())).map((c) => c.name).sort();
    expect(await names()).toEqual(["Called LLC", "Leftover LLC", "License Realty", "Noted LLC", "Paid LLC", "Researched LLC", "Sample Research LLC", "Two Lists LLC"]);
    expect(await t.mutation(internal.outreach.clearLeftovers, {})).toEqual({ removed: 3, done: true });
    expect(await names()).toEqual(["Called LLC", "Noted LLC", "Paid LLC", "Researched LLC", "Two Lists LLC"]);
    // Again: nothing more to do.
    expect(await t.mutation(internal.outreach.clearLeftovers, {})).toEqual({ removed: 0, done: true });
    // The worked list goes too; its paid owner stays, on no list.
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: worked });
    expect(await names()).toEqual(["Called LLC", "Noted LLC", "Paid LLC", "Researched LLC", "Two Lists LLC"]);
  });

  test("while no phone source is connected, simulated lookups count as work: their owners stay when the list goes, until a real source is connected", async () => {
    vi.stubEnv("OUTREACH_SIMULATE", "");
    for (const k of ["TX_COMPTROLLER_API_KEY", "COBALT_API_KEY", "BATCHDATA_API_KEY", "TRACERFY_API_KEY", "ENFORMION_AP_NAME", "HUNTER_API_KEY", "LEADMAGIC_API_KEY", "TRESTLE_API_KEY", "TWILIO_ACCOUNT_SID", "ZEROBOUNCE_API_KEY"]) vi.stubEnv(k, "");
    const t = setup();
    const co = await proCompany(t);
    const org = co.organizationId;
    const at = "2026-11-01T00:00:00.000Z";
    const listId = await t.run(async (ctx) => {
      const [user] = await ctx.db.query("users").collect();
      const listId = await ctx.db.insert("outreachLists", { organizationId: org, title: "Tried", definition: { county: "Midland", who: "investor" as const }, rowCount: 2, done: 0, truncated: false, createdBy: user._id, createdAt: at });
      const locked = { status: "locked" as const };
      const base = { organizationId: org, mailing: {}, properties: 1, totalValueCents: 0, why: "", kinds: ["investor" as const], listIds: [listId], status: "new" as const, createdAt: at };
      await ctx.db.insert("outreachContacts", { ...base, key: "sim", name: "Looked Up LLC", phones: [{ number: "+14325550100", type: "mobile", source: "batchdata" }], enrichment: { phone: { status: "found", source: "batchdata", requestedBy: user._id, simulated: true }, email: locked, person: locked } });
      await ctx.db.insert("outreachContacts", { ...base, key: "none", name: "Untouched LLC", enrichment: { phone: locked, email: locked, person: locked } });
      return listId;
    });
    expect((await co.as.query(api.outreach.contacts, { organizationId: org, listId })).simulating).toBe(true);
    expect((await co.as.query(api.outreach.lists, { organizationId: org }))[0]).toMatchObject({ deletable: false, worked: 1 });
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId });
    const names = async () => (await t.run(async (ctx) => ctx.db.query("outreachContacts").collect())).map((c) => c.name);
    expect(await names()).toEqual(["Looked Up LLC"]);
    expect(await t.mutation(internal.outreach.clearLeftovers, {})).toEqual({ removed: 0, done: true });
    // A real phone source connected: what was simulated keeps nothing now, and the sweep clears it.
    vi.stubEnv("BATCHDATA_API_KEY", "bd-key");
    expect(await t.mutation(internal.outreach.clearLeftovers, {})).toEqual({ removed: 1, done: true });
    vi.unstubAllEnvs();
  });

  test("owners on no list: shown on their own with a count, removable all at once or some; leads and clients stay; a list can take its worked owners with it", async () => {
    const t = setup();
    const co = await proCompany(t);
    const org = co.organizationId;
    const at = "2026-11-01T00:00:00.000Z";
    const lead = (await co.as.mutation(api.leads.create, { organizationId: org, data: { name: "Sent LLC" } }))!._id;
    const { listId, a } = await t.run(async (ctx) => {
      const [user] = await ctx.db.query("users").collect();
      const listId = await ctx.db.insert("outreachLists", { organizationId: org, title: "Going", definition: { county: "Midland", who: "investor" as const }, rowCount: 3, done: 0, truncated: false, createdBy: user._id, createdAt: at });
      const locked = { status: "locked" as const };
      const contact = (name: string, extra: Record<string, unknown> = {}) =>
        ctx.db.insert("outreachContacts", { organizationId: org, key: name, name, mailing: {}, properties: 1, totalValueCents: 0, why: "", kinds: ["investor"], listIds: [], status: "new", createdAt: at, enrichment: { phone: locked, email: locked, person: locked }, ...extra });
      const a = await contact("Kept A LLC", { note: "Call in spring" });
      await contact("Kept B LLC", { status: "no_answer" });
      await contact("Sent LLC", { status: "lead", leadId: lead });
      await contact("On List LLC", { listIds: [listId] });
      await contact("Worked On List LLC", { listIds: [listId], status: "callback" });
      await contact("Sent On List LLC", { listIds: [listId], status: "lead", leadId: lead });
      // Being looked up: the answer asked for is on the way, so it stays whatever is deleted.
      const running = { phone: { status: "running" as const, at, requestedBy: user._id }, email: locked, person: locked };
      await contact("Looking Up LLC", { enrichment: running });
      await contact("Looking Up On List LLC", { listIds: [listId], enrichment: running });
      return { listId, a };
    });
    const view = await co.as.query(api.outreach.contacts, { organizationId: org, unlisted: true });
    expect(view.rows.map((r) => r.name).sort()).toEqual(["Kept A LLC", "Kept B LLC", "Looking Up LLC", "Sent LLC"]);
    expect(view.unlisted).toBe(4);
    expect((await co.as.query(api.outreach.contacts, { organizationId: org, listId })).unlisted).toBe(4);
    // Some of them: just the one asked for.
    expect(await co.as.mutation(api.outreach.removeUnlisted, { organizationId: org, contactIds: [a] })).toEqual({ removed: 1, kept: 0 });
    // All of them: the lead's owner stays, and so does the one still being looked up.
    expect(await co.as.mutation(api.outreach.removeUnlisted, { organizationId: org })).toEqual({ removed: 1, kept: 2 });
    const names = async () => (await t.run(async (ctx) => ctx.db.query("outreachContacts").collect())).map((c) => c.name).sort();
    expect(await names()).toEqual(["Looking Up LLC", "Looking Up On List LLC", "On List LLC", "Sent LLC", "Sent On List LLC", "Worked On List LLC"]);
    // Deleting a list with its worked owners too: only the lead's owner and the one being looked up stay.
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId, alsoWorked: true });
    expect(await names()).toEqual(["Looking Up LLC", "Looking Up On List LLC", "Sent LLC", "Sent On List LLC"]);
  });

  test("starting over removes a company's lists and owners, after a dry run; leads and other companies stay", async () => {
    const t = setup();
    const co = await proCompany(t);
    const other = await proCompany(t, "other@paint.example");
    const at = "2026-11-01T00:00:00.000Z";
    const lead = await co.as.mutation(api.leads.create, { organizationId: co.organizationId, data: { name: "City Of Midland" } });
    const leadId = lead!._id;
    const names = await t.run(async (ctx) => {
      const [a, b] = await Promise.all([ctx.db.get(co.organizationId), ctx.db.get(other.organizationId)]);
      const [user] = await ctx.db.query("users").collect();
      for (const organizationId of [co.organizationId, other.organizationId]) {
        const listId = await ctx.db.insert("outreachLists", { organizationId, title: "Investors", definition: { county: "Midland", who: "investor" as const }, rowCount: 2, done: 0, truncated: false, createdBy: user._id, createdAt: at });
        for (const name of ["Oak Plaza LLC", "City Of Midland"])
          await ctx.db.insert("outreachContacts", { organizationId, key: name, name, mailing: {}, properties: 1, totalValueCents: 0, why: "", kinds: ["investor"], listIds: [listId], status: "new", createdAt: at, ...(name === "City Of Midland" && organizationId === co.organizationId ? { leadId } : {}) });
      }
      return { mine: a!.name, theirs: b!.name };
    });
    const count = async (organizationId: typeof co.organizationId) =>
      t.run(async (ctx) => [
        (await ctx.db.query("outreachLists").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()).length,
        (await ctx.db.query("outreachContacts").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()).length,
      ]);
    // A dry run only reports.
    expect(await t.mutation(internal.outreach.startOver, { organization: names.mine })).toMatchObject({ dryRun: true, matches: [{ organization: names.mine, lists: 1, owners: 2, sentToLeads: 1 }] });
    expect(await count(co.organizationId)).toEqual([1, 2]);
    await t.mutation(internal.outreach.startOver, { organization: names.mine, confirm: true });
    await t.finishAllScheduledFunctions(() => {});
    expect(await count(co.organizationId)).toEqual([0, 0]);
    expect(await count(other.organizationId)).toEqual([1, 2]);
    expect(await t.run(async (ctx) => (await ctx.db.query("leads").collect()).map((l) => l.name))).toEqual(["City Of Midland"]);
  });

  test("lists are kept tidy: renamed, pinned, archived (unpinned, contacts kept) and restored; only by the company", async () => {
    const t = setup();
    const co = await proCompany(t);
    const org = co.organizationId;
    const listId = await t.run(async (ctx) => {
      const [user] = await ctx.db.query("users").collect();
      return ctx.db.insert("outreachLists", { organizationId: org, title: "Shopping center owners", definition: { county: "Midland", who: "commercial" as const }, rowCount: 1, done: 0, truncated: false, createdBy: user._id, createdAt: "2026-11-01T00:00:00.000Z" });
    });
    const view = async () => (await co.as.query(api.outreach.lists, { organizationId: org }))[0];
    expect(await view()).toMatchObject({ pinned: false, archived: false });
    await co.as.mutation(api.outreach.organizeList, { organizationId: org, listId, title: "  Midland   shopping centers ", pinned: true });
    expect(await view()).toMatchObject({ title: "Midland shopping centers", pinned: true, archived: false });
    await co.as.mutation(api.outreach.organizeList, { organizationId: org, listId, archived: true });
    expect(await view()).toMatchObject({ pinned: false, archived: true });
    await co.as.mutation(api.outreach.organizeList, { organizationId: org, listId, archived: false });
    expect(await view()).toMatchObject({ archived: false });
    await expect(co.as.mutation(api.outreach.organizeList, { organizationId: org, listId, title: "   " })).rejects.toThrow(/Give the list a name/);
    const other = await proCompany(t, "other@roof.example");
    await expect(other.as.mutation(api.outreach.organizeList, { organizationId: other.organizationId, listId, pinned: true })).rejects.toThrow(/No such list/);
    await expect(other.as.mutation(api.outreach.organizeList, { organizationId: org, listId, pinned: true })).rejects.toThrow();
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
    expect(oak.enrichment).toEqual({ phone: { status: "locked" }, email: { status: "locked" }, person: { status: "locked" }, research: { status: "locked" } });
    expect((await read()).coverage).toEqual({ phone: { found: 0, total: 2, sources: 0 }, email: { found: 0, total: 2, sources: 0 }, person: { found: 0, total: 2, sources: 0 }, research: { found: 0, total: 2, sources: 0 } });

    // No balance: refused before anything is queued. The person lookup alone is free.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id] })).rejects.toThrow(/Balance too low: \$1\.00 needed for 1 phone, \$0\.00 available/);
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["person"] })).resolves.toMatchObject({ queued: 1, costCents: 0 });
    expect((await read()).rows.find((r) => r.id === oak.id)!.enrichment.person.status).toBe("running");
    // No key for it: a failed cell that says so, nothing charged, and not counted as a source attempt.
    vi.stubEnv("TX_COMPTROLLER_API_KEY", "");
    vi.stubEnv("BATCHDATA_API_KEY", "");
    await t.finishAllScheduledFunctions(() => {});
    const noKey = (await read()).rows.find((r) => r.id === oak.id)!;
    expect(noKey.enrichment.person).toMatchObject({ status: "failed", error: expect.stringContaining("TX_COMPTROLLER_API_KEY"), tries: [{ source: "roll", outcome: "skipped", note: "The mail goes to Dallas, off the roll" }, { source: "permits", outcome: "skipped", note: "No permits at the property" }, { source: "tx-comptroller", outcome: "skipped", note: "Not connected" }, { source: "cobalt", outcome: "skipped", note: "Not connected" }] });

    // With keys: the Comptroller names Oak Plaza's manager, BatchData finds her phones and an email; the city gets nothing.
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 250 }));
    vi.stubEnv("TX_COMPTROLLER_API_KEY", "cpa-key");
    vi.stubEnv("BATCHDATA_API_KEY", "bd-key");
    vi.stubEnv("TRESTLE_API_KEY", "tr-key");
    const calls: Array<{ url: string; headers: Record<string, string>; body?: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
        calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body });
        const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
        // The contact check: the mobile is hers (and so is the email sent along); the VoIP and the landline aren't.
        if (url.includes("trestleiq")) {
          const q = new URL(url).searchParams;
          const phone = q.get("phone");
          const email = q.get("email") ? { contact_grade: "B", is_valid: true, name_match: true } : null;
          if (phone === "4325550199") return json({ phone: { contact_grade: "C", is_valid: true, activity_score: 60, line_type: "Landline", name_match: false }, email, add_ons: { litigator_checks: { phone_is_litigator_risk: false } } });
          if (phone === "4325550177") return json({ phone: { contact_grade: "D", is_valid: true, activity_score: 40, line_type: "NonFixedVOIP", name_match: false }, email, add_ons: { litigator_checks: { phone_is_litigator_risk: false } } });
          return json({ phone: { contact_grade: "A", is_valid: true, activity_score: 95, line_type: "Mobile", name_match: true }, email, add_ons: { litigator_checks: { phone_is_litigator_risk: false } } });
        }
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
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id, cityHall.id, oak.id] })).resolves.toMatchObject({ queued: 2, costCents: 200 });
    const running = (await read()).rows;
    expect(running.find((r) => r.id === oak.id)!.enrichment).toMatchObject({ person: { status: "running" }, phone: { status: "running" }, email: { status: "running" } });
    expect(running.find((r) => r.id === cityHall.id)!.enrichment).toMatchObject({ person: { status: "running" }, phone: { status: "running" } });
    // Running ones aren't queued twice.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id] })).resolves.toMatchObject({ queued: 0, costCents: 0 });
    await t.finishAllScheduledFunctions(() => {});

    const traced = await read();
    const oakNow = traced.rows.find((r) => r.id === oak.id)!;
    expect(oakNow.person).toEqual({ name: "Dana Reyes", title: "Manager", address: "1 MAIN ST STE 400, DALLAS, TX, 75201", source: "tx-comptroller" });
    expect(oakNow.enrichment).toMatchObject({
      person: { status: "found", source: "tx-comptroller" },
      phone: { status: "found", source: "batchdata", chargedCents: 100 },
      email: { status: "found", source: "batchdata" },
    });
    // The ledger for the sheet: every source's turn, in order; Tracerfy isn't connected in this test.
    expect(oakNow.enrichment.person.tries).toEqual([{ source: "roll", outcome: "skipped", note: "The mail goes to Dallas, off the roll" }, { source: "permits", outcome: "skipped", note: "No permits at the property" }, { source: "tx-comptroller", outcome: "hit", note: "Dana Reyes, Manager" }, { source: "cobalt", outcome: "skipped", note: "Not connected" }]);
    expect(oakNow.enrichment.phone.tries).toEqual([
      { source: "permits", outcome: "skipped", note: "No permits at the property" },
      { source: "batchdata", outcome: "hit", note: "3 numbers" },
      { source: "tracerfy", outcome: "skipped", note: "Not connected" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic-mobile", outcome: "skipped", note: "Not connected" },
      { source: "trestle", outcome: "hit", note: "3 of 3 live · 1 in the owner's name · 1 personal" },
      { source: "twilio", outcome: "skipped", note: "Not needed, already checked" },
      { source: "tracerfy-dnc", outcome: "skipped", note: "Not connected" },
    ]);
    expect(oakNow.enrichment.email.tries).toEqual([
      { source: "permits", outcome: "skipped", note: "No permits at the property" },
      { source: "batchdata", outcome: "hit", note: "1 email" },
      { source: "tracerfy", outcome: "skipped", note: "Not connected" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "hunter", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic", outcome: "skipped", note: "Not connected" },
      { source: "zerobounce", outcome: "skipped", note: "Not connected" },
      // The contact check's word on the email, from the call made for her mobile.
      { source: "trestle", outcome: "hit", note: "In the owner's name · grade B" },
    ]);
    // Ranked: the name match first at 100, then the vendor's score, then mobile before VoIP before landline; the DNC landline is kept but flagged. Each carries the checker's grade.
    expect(oakNow.phones).toEqual([
      { number: "4325550100", type: "mobile", line: "personal", verified: true, score: 100, grade: "A", source: "batchdata" },
      { number: "4325550177", type: "voip", line: "personal", verified: true, score: 95, grade: "D", source: "batchdata" },
      { number: "4325550199", type: "landline", line: "personal", dnc: true, verified: true, score: 60, grade: "C", source: "batchdata" },
    ]);
    expect(oakNow.emails).toEqual([{ email: "dana@oakplaza.com", source: "batchdata", nameMatch: true, grade: "B" }]);
    // One contact-check call per number; the email rode on the first only.
    const tr = calls.filter((c) => c.url.includes("trestleiq")).map((c) => new URL(c.url).searchParams);
    expect(tr.map((q) => [q.get("phone"), q.get("email"), q.get("name"), q.get("business.name")])).toEqual([
      ["4325550100", "dana@oakplaza.com", "Dana Reyes", "Oak Plaza LLC"],
      ["4325550177", null, "Dana Reyes", "Oak Plaza LLC"],
      ["4325550199", null, "Dana Reyes", "Oak Plaza LLC"],
    ]);
    const cityNow = traced.rows.find((r) => r.id === cityHall.id)!;
    // The state has no entity called City Of Midland, and BatchData has nothing for it: three free misses.
    expect(cityNow.enrichment).toMatchObject({ phone: { status: "none" }, email: { status: "none" }, person: { status: "none" } });
    expect(cityNow.enrichment.person.tries).toEqual([{ source: "roll", outcome: "skipped", note: "No home owned by a person at the mailing address" }, { source: "permits", outcome: "skipped", note: "No permits at the property" }, { source: "tx-comptroller", outcome: "miss", note: "No match" }, { source: "cobalt", outcome: "skipped", note: "Not connected" }]);
    expect(cityNow.phones).toEqual([]);
    expect(traced.balanceCents).toBe(150);
    expect(traced.coverage).toEqual({ phone: { found: 1, total: 2, sources: 1 }, email: { found: 1, total: 2, sources: 1 }, person: { found: 1, total: 2, sources: 1 }, research: { found: 0, total: 2, sources: 0 } });
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
        ["trestle", "email", 1, 1, 0],
        ["trestle", "phone", 1, 1, 0],
        ["tx-comptroller", "person", 1, 1, 0],
      ]);
    });
    // Staff see the stack with this company's numbers.
    const ops = await signUp(t, "ops@webb.example", { role: "staff" });
    const stack = await ops.as.query(api.outreach.sources, { organizationId: org });
    expect(stack.map((s) => [s.name, s.connected, s.stats.map((x) => [x.field, x.attempts, x.hits, x.chargedCents])])).toEqual([
      ["roll", true, [["person", 0, 0, 0]]],
      ["permits", true, [["person", 0, 0, 0], ["phone", 0, 0, 0], ["email", 0, 0, 0]]],
      ["tx-comptroller", true, [["person", 1, 1, 0]]],
      ["cobalt", false, [["person", 0, 0, 0]]],
      ["batchdata", true, [["phone", 1, 1, 100], ["email", 1, 1, 0]]],
      ["tracerfy", false, [["phone", 0, 0, 0], ["email", 0, 0, 0]]],
      ["enformion", false, [["phone", 0, 0, 0], ["email", 0, 0, 0]]],
      ["leadmagic-mobile", false, [["phone", 0, 0, 0]]],
      ["hunter", false, [["email", 0, 0, 0]]],
      ["leadmagic", false, [["email", 0, 0, 0]]],
      ["trestle", true, [["phone", 1, 1, 0], ["email", 1, 1, 0]]],
      ["twilio", false, [["phone", 0, 0, 0]]],
      ["tracerfy-dnc", false, [["phone", 0, 0, 0]]],
      ["zerobounce", false, [["email", 0, 0, 0]]],
    ]);
    await expect(co.as.query(api.outreach.sources, { organizationId: org })).rejects.toThrow(/staff/);
    // A found field isn't traced again; a failed one can be. A deleted list keeps its paid contact.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id] })).resolves.toMatchObject({ queued: 0, costCents: 0 });
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [cityHall.id], fields: ["phone"] })).resolves.toMatchObject({ queued: 1, costCents: 100 });
    await t.finishAllScheduledFunctions(() => {});
    const lists = await co.as.query(api.outreach.lists, { organizationId: org });
    expect(lists[0].deletable).toBe(false);
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: lists[0].id });
    expect((await read()).rows.map((r) => [r.name, r.kinds, r.phones.length])).toEqual([["Oak Plaza LLC", [], 3]]);
  });

  test("what BatchData misses falls through to Tracerfy; a vendor error is skipped free", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    // The Vances (wealthy), Samuel Reyes (a recent buyer) and Maria Ortiz (absentee) in the CRM.
    for (const who of ["wealthy", "recent_buyer", "absentee"] as const) await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const vance = (await read()).rows.find((r) => r.name === "Vance Robert & Linda")!;
    vi.stubEnv("BATCHDATA_API_KEY", "bd-key");
    vi.stubEnv("TRACERFY_API_KEY", "tf-key");
    vi.stubEnv("TRACERFY_API_BASE", "https://mock.tracerfy.com/v1/api/");
    vi.stubEnv("ZEROBOUNCE_API_KEY", "zb-key");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    let batchDataStatus = 200;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
        calls.push({ url, body });
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
        if (url.includes("batchdata")) return batchDataStatus === 200 ? json({ results: { persons: [] } }) : json({ message: "Rate limited" }, batchDataStatus);
        // ZeroBounce: the Vances' address is live.
        if (url.includes("zerobounce")) return json({ address: "robert@vance.example", status: "valid", sub_status: "" });
        // The Do Not Call scrub, with the same key: the mobile is on the Texas list, the landline is clear.
        if (url.endsWith("/dnc/lookup/")) {
          const phones = (body as unknown as Array<{ phone: string }>).map((p) => p.phone);
          return json({
            results: phones.map((phone) => ({ phone, hit: phone === "4325550301", national_dnc: false, state_dnc: phone === "4325550301", state_dnc_list: phone === "4325550301" ? ["TX"] : [], litigator: false, is_clean: phone !== "4325550301", credits_deducted: 5 })),
            credits_deducted: phones.length * 5,
          });
        }
        // Tracerfy: two people at the address; the Vances are the ones asked for.
        return json({
          hit: true,
          persons_count: 2,
          credits_deducted: 1,
          persons: [
            { first_name: "Pat", last_name: "Tenant", phones: [{ number: "4325559999", type: "Mobile", rank: 1 }], emails: [] },
            {
              first_name: "Robert",
              last_name: "Vance",
              phones: [
                { number: "(432) 555-0300", type: "Landline", dnc: false, tcpa: false, rank: 2 },
                { number: "432-555-0301", type: "Mobile", dnc: true, rank: 1 },
              ],
              emails: [{ email: "Robert@Vance.example", rank: 1 }],
            },
          ],
        });
      }),
    );
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [vance.id], fields: ["phone", "email"] });
    await t.finishAllScheduledFunctions(() => {});
    let now = (await read()).rows.find((r) => r.id === vance.id)!;
    expect(now.enrichment).toMatchObject({ phone: { status: "found", source: "tracerfy", chargedCents: 100 }, email: { status: "found", source: "tracerfy" } });
    expect(now.enrichment.phone.tries).toEqual([
      { source: "batchdata", outcome: "miss", note: "No match" },
      { source: "tracerfy", outcome: "hit", note: "2 numbers" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic-mobile", outcome: "skipped", note: "Not connected" },
      { source: "trestle", outcome: "skipped", note: "Not connected" },
      { source: "twilio", outcome: "skipped", note: "Not connected" },
      { source: "tracerfy-dnc", outcome: "hit", note: "1 of 2 clear · 1 on the Do Not Call list (TX)" },
    ]);
    // Rank 1 first even though it's DNC; the landline follows. Only the Vances' numbers, not the tenant's.
    expect(now.phones).toEqual([
      { number: "4325550301", type: "mobile", line: "personal", dnc: true, score: 99, source: "tracerfy" },
      { number: "4325550300", type: "landline", line: "personal", score: 98, source: "tracerfy" },
    ]);
    const dnc = calls.filter((c) => c.url === "https://www.tracerfy.com/v2/api/dnc/lookup/");
    expect(dnc).toHaveLength(1);
    expect(dnc[0].body).toEqual([{ phone: "4325550301" }, { phone: "4325550300" }]);
    // Checked and deliverable: marked verified, and the checker's turn closes the email ledger.
    expect(now.emails).toEqual([{ email: "robert@vance.example", source: "tracerfy", verified: true }]);
    expect(now.enrichment.email.tries).toEqual([
      { source: "batchdata", outcome: "miss", note: "No match" },
      { source: "tracerfy", outcome: "hit", note: "1 email" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "hunter", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic", outcome: "skipped", note: "Not connected" },
      { source: "zerobounce", outcome: "hit", note: "1 of 1 deliverable" },
      { source: "trestle", outcome: "skipped", note: "Not connected" },
    ]);
    expect(calls.filter((c) => c.url.startsWith("https://api.zerobounce.net/v2/validate?api_key=zb-key&email=robert%40vance.example"))).toHaveLength(1);
    // Asked by name (the roll's "VANCE ROBERT & LINDA"), at the sandbox, after BatchData came back empty.
    const tf = calls.filter((c) => c.url.startsWith("https://mock.tracerfy.com/v1/api/trace/lookup/"));
    expect(tf).toHaveLength(1);
    expect(tf[0].body).toMatchObject({ address: "1 Spruce Av", city: "Midland", state: "TX", find_owner: false, first_name: "Robert", last_name: "Vance" });
    expect(calls.filter((c) => c.url.includes("batchdata"))).toHaveLength(1);
    expect((await read()).balanceCents).toBe(400);
    await t.run(async (ctx) => {
      const stats = (await ctx.db.query("dataSourceStats").collect()).map((s) => [s.source, s.field, s.attempts, s.hits, s.chargedCents]).sort();
      expect(stats).toEqual([
        ["tracerfy", "email", 1, 1, 0],
        ["tracerfy", "phone", 1, 1, 100],
        ["tracerfy-dnc", "phone", 1, 1, 0],
        ["zerobounce", "email", 1, 1, 0],
      ]);
    });

    // BatchData errors out: Tracerfy still answers, and the cell carries no error.
    batchDataStatus = 429;
    const reyes = (await read()).rows.find((r) => r.name === "Reyes Samuel")!;
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [reyes.id], fields: ["phone"] });
    await t.finishAllScheduledFunctions(() => {});
    now = (await read()).rows.find((r) => r.id === reyes.id)!;
    expect(now.enrichment.phone).toMatchObject({ status: "found", source: "tracerfy" });
    expect(now.enrichment.phone.error).toBeUndefined();
    expect(now.enrichment.phone.tries).toEqual([
      { source: "batchdata", outcome: "error", note: expect.stringContaining("429") },
      // Nobody at the address shares Reyes's surname, so every number there counts.
      { source: "tracerfy", outcome: "hit", note: "3 numbers" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic-mobile", outcome: "skipped", note: "Not connected" },
      { source: "trestle", outcome: "skipped", note: "Not connected" },
      { source: "twilio", outcome: "skipped", note: "Not connected" },
      // The same three numbers as the Vances' address, one of them on the Texas list.
      { source: "tracerfy-dnc", outcome: "hit", note: "2 of 3 clear · 1 on the Do Not Call list (TX)" },
    ]);

    // Tracerfy out of credits and BatchData empty: a free miss whose note names the cause.
    batchDataStatus = 200;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
        if (url.includes("batchdata")) return json({ results: { persons: [] } });
        return json({ error: "Insufficient credits. Instant trace requires 5 credits per lookup. You have 0 credits." }, 402);
      }),
    );
    const ortiz = (await read()).rows.find((r) => r.name === "Ortiz Maria")!;
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [ortiz.id], fields: ["phone"] });
    await t.finishAllScheduledFunctions(() => {});
    now = (await read()).rows.find((r) => r.id === ortiz.id)!;
    expect(now.enrichment.phone).toMatchObject({ status: "failed", error: "tracerfy: Tracerfy: HTTP 402 (Insufficient credits. Instant trace requires 5 credits per lookup. You have 0 credits.)" });
    expect(now.enrichment.phone.tries).toEqual([
      { source: "batchdata", outcome: "miss", note: "No match" },
      { source: "tracerfy", outcome: "error", note: "Tracerfy: HTTP 402 (Insufficient credits. Instant trace requires 5 credits per lookup. You have 0 credits.)" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic-mobile", outcome: "skipped", note: "Not connected" },
    ]);
    expect((await read()).balanceCents).toBe(300);
    // An empty account is flagged on the Sources page until Tracerfy answers properly again; the earlier 429 was not (a retry handles that).
    const ops = await signUp(t, "ops@webb.example", { role: "staff" });
    const flagged = (await ops.as.query(api.outreach.sources, { organizationId: org })).find((s) => s.name === "tracerfy")!;
    expect(flagged.stats.map((s) => [s.field, s.problem])).toEqual([
      ["phone", "Tracerfy: HTTP 402 (Insufficient credits. Instant trace requires 5 credits per lookup. You have 0 credits.)"],
      ["email", undefined],
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
        return url.includes("batchdata") ? json({ results: { persons: [] } }) : json({ hit: false });
      }),
    );
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [ortiz.id], fields: ["phone"] });
    await t.finishAllScheduledFunctions(() => {});
    expect((await read()).rows.find((r) => r.id === ortiz.id)!.enrichment.phone.status).toBe("none");
    const cleared = (await ops.as.query(api.outreach.sources, { organizationId: org })).find((s) => s.name === "tracerfy")!;
    expect(cleared.stats.map((s) => [s.field, s.problem])).toEqual([["phone", undefined], ["email", undefined]]);
  });

  test("sister entities share one lookup: tagged as related, staggered, and the second copies the first's phone free once the same decision maker is named", async () => {
    // The family: legal words and numbering go, the name stays.
    expect(familyKey("NUKA HIVA ALPHA 1-54 LLC")).toBe("NUKA HIVA ALPHA");
    expect(familyKey("Nuka Hiva Alpha 55-106, LLC")).toBe("NUKA HIVA ALPHA");
    expect(familyKey("NUKA HIVA ALPHA LLC")).toBe("NUKA HIVA ALPHA");
    expect(familyKey("OAK PLAZA II LP")).toBe(familyKey("Oak Plaza LLC"));
    expect(familyKey("MIDLAND TX PROPERTIES LLC")).not.toBe(familyKey("MIDLAND HOLDINGS LLC"));
    expect(familyKey("SMITH LLC")).toBeUndefined();
    expect(familyKey("MIDLAND 2 LLC")).toBeUndefined();

    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const three = (prefix: string, owner: string, mailing: Condensed["mailing"]) =>
      ["1", "2", "3"].map((n) => parcel(`${prefix}${n}`, { owner, companyOwned: true, ownerOccupied: false, mailing }));
    await addParcels(t, [
      ...three("a", "NUKA HIVA ALPHA 1-54 LLC", { address: "3119 S COUNTY RD 1109", city: "MIDLAND", state: "TX", zip: "79706" }),
      ...three("b", "NUKA HIVA ALPHA 55-106, LLC", { address: "319 S COUNTY ROAD 1109", city: "MIDLAND", state: "TX", zip: "79706" }),
      ...three("c", "BRAZOS VENTURES LLC", { address: "9 OAK ST", city: "AUSTIN", state: "TX", zip: "78701" }),
    ]);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 1000 }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "investor" } });
    const read = async () => (await co.as.query(api.outreach.contacts, { organizationId: org })).rows;
    const byName = async (start: string) => (await read()).find((r) => r.name.startsWith(start))!;
    const first = await byName("Nuka Hiva Alpha 1-54");
    const second = await byName("Nuka Hiva Alpha 55-106");
    const brazos = await byName("Brazos");
    // Tagged as related, both ways; an unrelated company is not.
    expect(first.related).toEqual([{ id: second.id, name: second.name }]);
    expect(second.related).toEqual([{ id: first.id, name: first.name }]);
    expect(brazos.related).toEqual([]);

    // The Comptroller names one manager for both Nuka Hiva entities, and a man of the same name at another address for Brazos.
    vi.stubEnv("TX_COMPTROLLER_API_KEY", "cpa-key");
    vi.stubEnv("BATCHDATA_API_KEY", "bd-key");
    for (const k of ["TRACERFY_API_KEY", "ENFORMION_AP_NAME", "TRESTLE_API_KEY", "TWILIO_ACCOUNT_SID", "ZEROBOUNCE_API_KEY", "HUNTER_API_KEY", "LEADMAGIC_API_KEY", "COBALT_API_KEY"]) vi.stubEnv(k, "");
    const batchdata: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
        if (url.includes("franchise-tax-list")) {
          const name = decodeURIComponent(url.split("name=")[1]).toUpperCase();
          const id = name.includes("BRAZOS") ? "32022222222" : name.includes("NUKA") ? `3201${name.includes("55") ? "2" : "1"}000000` : undefined;
          return json({ success: true, data: id ? [{ name, taxpayerId: id, mailingAddressZip: "79706" }] : [], count: id ? 1 : 0 });
        }
        if (url.includes("franchise-tax/")) {
          const brazosId = url.includes("32022222222");
          return json({
            success: true,
            data: {
              name: brazosId ? "BRAZOS VENTURES LLC" : "NUKA HIVA ALPHA LLC",
              officerInfo: [
                brazosId
                  ? { AGNT_NM: "KAI MOANA", AGNT_TITL_TX: "MANAGER", AD_STR_POB_TX: "50 RIVER RD", CITY_NM: "AUSTIN", ST_CD: "TX", AD_ZP: "78701" }
                  : { AGNT_NM: "KAI MOANA", AGNT_TITL_TX: "MANAGER", AD_STR_POB_TX: "1 HARBOR DR", CITY_NM: "MIDLAND", ST_CD: "TX", AD_ZP: "79706" },
              ],
            },
          });
        }
        const body = JSON.parse((init?.body as string) ?? "{}") as { requests: Array<{ propertyAddress: { street: string } }> };
        const street = body.requests[0].propertyAddress.street;
        batchdata.push(street);
        // The other Kai Moana, looked up from Brazos's parcels, has his own phone and email.
        const other = street.startsWith("C");
        return json({
          results: {
            persons: [
              {
                name: { first: "Kai", last: "Moana" },
                phoneNumbers: [{ number: other ? "512-555-0177" : "432-555-0142", type: "Mobile", score: 90 }],
                emails: [{ email: other ? "kai@brazos.example" : "kai@nukahiva.example" }],
              },
            ],
          },
        });
      }),
    );
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [first.id, second.id, brazos.id] })).resolves.toMatchObject({ queued: 3, costCents: 300 });
    // The first of the family and the unrelated company run now; the sister waits its turn.
    await t.finishAllScheduledFunctions(() => {});
    expect((await byName("Nuka Hiva Alpha 1-54")).enrichment.phone).toMatchObject({ status: "found", source: "batchdata", chargedCents: 100 });
    expect((await byName("Brazos")).enrichment.phone).toMatchObject({ status: "found", source: "batchdata", chargedCents: 100 });
    expect((await byName("Nuka Hiva Alpha 55-106")).enrichment.phone.status).toBe("running");
    const asked = batchdata.length;
    expect(asked).toBeGreaterThan(0);

    // Its turn: the same manager, so the phone and email are copied, nothing is charged and no paid source is asked.
    await t.action(internal.skipTrace.trace, { contactId: second.id, fields: ["person", "phone", "email"] });
    const copied = await byName("Nuka Hiva Alpha 55-106");
    expect(copied.person).toMatchObject({ name: "Kai Moana", source: "tx-comptroller" });
    expect(copied.phones).toEqual((await byName("Nuka Hiva Alpha 1-54")).phones);
    expect(copied.emails).toEqual((await byName("Nuka Hiva Alpha 1-54")).emails);
    expect(copied.enrichment.phone).toMatchObject({ status: "found", source: "shared", chargedCents: 0 });
    expect(copied.enrichment.email).toMatchObject({ status: "found", source: "shared" });
    expect(copied.enrichment.phone.tries![0]).toEqual({ source: "shared", outcome: "hit", note: `Same decision maker as ${first.name}; copied, no charge` });
    expect(copied.enrichment.phone.tries).toContainEqual({ source: "batchdata", outcome: "skipped", note: "Not needed, already found" });
    expect(batchdata).toHaveLength(asked);
    // Two phones paid for, not three; the copy is not a source hit on the scorecard.
    const after = await co.as.query(api.outreach.contacts, { organizationId: org });
    expect(after.balanceCents).toBe(800);
    const stats = await t.run(async (ctx) => ctx.db.query("dataSourceStats").collect());
    expect(stats.some((s) => s.source === "shared")).toBe(false);

    // Send all three to Leads at once: the two Nuka Hiva entities become one lead for Kai Moana; Brazos gets its own.
    const sent = await co.as.mutation(api.outreach.sendManyToLeads, { organizationId: org, contactIds: [first.id, second.id, brazos.id] as never });
    expect(sent).toEqual({ sent: 3, leads: 2, joined: 1 });
    const one = await byName("Nuka Hiva Alpha 1-54");
    const two = await byName("Nuka Hiva Alpha 55-106");
    expect(one.leadId).toBeDefined();
    expect(two.leadId).toBe(one.leadId);
    expect((await byName("Brazos")).leadId).not.toBe(one.leadId);
    const shared = await t.run(async (ctx) => ctx.db.get(one.leadId as never));
    expect(shared).toMatchObject({ name: "Kai Moana", company: first.name, source: "Outreach", status: "new" });
    expect((shared as { notes: string }).notes).toContain(`Also owns as ${second.name}:`);
    expect((await co.as.query(api.leads.list, { organizationId: org })).filter((l: { source?: string }) => l.source === "Outreach")).toHaveLength(2);
    // Sending again sends nobody; deleting the shared lead puts both entities back to New.
    expect(await co.as.mutation(api.outreach.sendManyToLeads, { organizationId: org, contactIds: [first.id, second.id] as never })).toEqual({ sent: 0, leads: 0, joined: 0 });
    await co.as.mutation(api.leads.remove, { id: one.leadId as never });
    expect([(await byName("Nuka Hiva Alpha 1-54")).status, (await byName("Nuka Hiva Alpha 55-106")).status]).toEqual(["new", "new"]);

    // Undo takes a send back: its leads still at New go and their owners are New again; a lead already worked stays.
    await co.as.mutation(api.leads.remove, { id: (await byName("Brazos")).leadId as never });
    vi.setSystemTime(new Date(new Date(NOW).getTime() + 60_000));
    expect(await co.as.mutation(api.outreach.sendManyToLeads, { organizationId: org, contactIds: [first.id, second.id, brazos.id] as never })).toEqual({ sent: 3, leads: 2, joined: 1 });
    const last = (await co.as.query(api.outreach.contacts, { organizationId: org })).lastSend!;
    expect(last.leads).toBe(2);
    await co.as.mutation(api.leads.update, { id: (await byName("Brazos")).leadId as never, data: { status: "contacted" } });
    expect(await co.as.mutation(api.outreach.undoSend, { organizationId: org, at: last.at })).toEqual({ removed: 1, kept: 1 });
    expect([(await byName("Nuka Hiva Alpha 1-54")).status, (await byName("Nuka Hiva Alpha 55-106")).status, (await byName("Brazos")).status]).toEqual(["new", "new", "lead"]);
    expect((await co.as.query(api.outreach.contacts, { organizationId: org })).lastSend).toBeNull();
  });

  test("a running lookup's progress shows on its cell, only while it runs; a signal first seen this week is new, but not the first import", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => (await co.as.query(api.outreach.contacts, { organizationId: org })).rows;
    const oak = (await read()).find((r) => r.name === "Oak Plaza LLC")!;
    const started = await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["phone"] });
    expect(started.at).toEqual(expect.any(String));
    const tries = [{ source: "permits", outcome: "skipped" as const, note: "No permits at the property" }];
    const updatedAt = (await t.run(async (ctx) => ctx.db.get(oak.id as Id<"outreachContacts">)))!.updatedAt;
    await t.mutation(internal.outreach.noteProgress, { contactId: oak.id, field: "phone", asking: "batchdata", tries });
    const progress = async () => await co.as.query(api.outreach.progress, { organizationId: org });
    expect(await progress()).toEqual([{ contactId: oak.id, field: "phone", asking: "batchdata", tries }]);
    // On its own row: the owner itself is untouched, so the owners page isn't read again for it.
    expect((await t.run(async (ctx) => ctx.db.get(oak.id as Id<"outreachContacts">)))!.updatedAt).toBe(updatedAt);
    expect((await read()).find((r) => r.id === oak.id)!.enrichment.phone).toMatchObject({ status: "running" });
    // The next step replaces it, not adds another.
    await t.mutation(internal.outreach.noteProgress, { contactId: oak.id, field: "phone", asking: "tracerfy", tries });
    expect((await progress()).map((p) => p.asking)).toEqual(["tracerfy"]);
    // Not running: nothing to narrate, and a locked cell stays locked.
    await t.mutation(internal.outreach.noteProgress, { contactId: oak.id, field: "email", asking: "hunter", tries: [] });
    expect((await read()).find((r) => r.id === oak.id)!.enrichment.email).toEqual({ status: "locked" });
    expect(await progress()).toHaveLength(1);
    // The answer landing takes the narration away.
    await t.mutation(internal.outreach.recordEnrichment, { contactId: oak.id, field: "phone", source: "batchdata", tries });
    expect(await progress()).toEqual([]);

    // Signals: the first import is not news; one seen days later, within the week, is.
    const parcelOf = async (id: string) => await t.run(async (ctx) => (await ctx.db.get(id as Id<"outreachContacts">))!.property.parcelId);
    const parcelId = await parcelOf(oak.id);
    const day = 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      const base = { county: "Midland", parcelId, address: "12 MIDKIFF RD", detail: "High weeds" };
      await ctx.db.insert("signals", { ...base, kind: "code_violation", date: "2026-08-01", sourceId: "code:1", importedAt: new Date(Date.now() - 6 * day).toISOString() });
      await ctx.db.insert("signals", { ...base, kind: "stalled_permit", date: "2026-10-30", sourceId: "permit:2", importedAt: new Date(Date.now() - 2 * day).toISOString() });
    });
    // Kept on the owner: none yet (they came in after it was added), until its home's records are synced.
    expect((await read()).find((r) => r.id === oak.id)!.signals).toEqual([]);
    await t.run(async (ctx) => syncContactSignals(ctx, [parcelId]));
    const signals = (await read()).find((r) => r.id === oak.id)!.signals;
    expect(signals.find((x) => x.kind === "code_violation")!.fresh).toBeUndefined();
    expect(signals.find((x) => x.kind === "stalled_permit")!.fresh).toBe(true);
    // An owner saved before records were kept on owners is looked up until the backfill gives it them.
    await t.run(async (ctx) => ctx.db.patch(oak.id as Id<"outreachContacts">, { signals: undefined }));
    expect((await read()).find((r) => r.id === oak.id)!.signals.map((x) => x.kind).sort()).toEqual(["code_violation", "stalled_permit"]);
    expect(await t.mutation(internal.outreach.backfillContactSignals, {})).toMatchObject({ done: true });
    expect((await t.run(async (ctx) => ctx.db.get(oak.id as Id<"outreachContacts">)))!.signals!.map((x) => x.kind).sort()).toEqual(["code_violation", "stalled_permit"]);
    // A record coming in through the sync reaches the owner by itself.
    await t.mutation(internal.signals.upsert, { rows: [{ kind: "demolition", detail: "Demolition order", date: "2026-11-02", sourceId: "demo:9", address: "12 MIDKIFF RD" }] });
    const after = (await t.run(async (ctx) => ctx.db.get(oak.id as Id<"outreachContacts">)))!.signals!;
    expect(after.map((x) => x.kind)).toContain("demolition");
  });

  test("the watchdog fails a lookup that never wrote back, free and with Retry; a newer request on the field is left to its own", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const oak = (await read()).rows.find((r) => r.name === "Oak Plaza LLC")!;
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["person", "phone"] });
    const running = (await read()).rows.find((r) => r.id === oak.id)!;
    expect(running.enrichment).toMatchObject({ person: { status: "running" }, phone: { status: "running" } });
    const at = running.enrichment.phone.at!;
    // Another request's watchdog: not these cells.
    expect(await t.mutation(internal.outreach.giveUp, { contactId: oak.id, fields: ["person", "phone"], at: "2026-01-01T00:00:00.000Z" })).toEqual({ failed: 0 });
    // The lookup never wrote back: ten minutes on, both cells are failed, nothing charged, and the phone can be asked for again.
    await t.mutation(internal.outreach.noteProgress, { contactId: oak.id, field: "phone", asking: "batchdata", tries: [] });
    expect(await t.mutation(internal.outreach.giveUp, { contactId: oak.id, fields: ["person", "phone"], at })).toEqual({ failed: 2 });
    // Its narration goes with it.
    expect(await co.as.query(api.outreach.progress, { organizationId: org })).toEqual([]);
    const gaveUp = (await read()).rows.find((r) => r.id === oak.id)!;
    expect(gaveUp.enrichment.phone).toMatchObject({ status: "failed", error: GIVE_UP_ERROR });
    expect(gaveUp.enrichment.person).toMatchObject({ status: "failed", error: GIVE_UP_ERROR });
    expect(GIVE_UP_ERROR).toBe("Took longer than 10 minutes and was stopped.");
    expect((await read()).balanceCents).toBe(500);
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["phone"] })).resolves.toMatchObject({ queued: 1, costCents: 100 });
    // The lookup runs and writes its answer (no keys: a failed cell that says so); the watchdog then finds nothing left to fail.
    for (const k of ["BATCHDATA_API_KEY", "TRACERFY_API_KEY", "ENFORMION_AP_NAME"]) vi.stubEnv(k, "");
    const again = (await read()).rows.find((r) => r.id === oak.id)!.enrichment.phone.at!;
    await t.finishAllScheduledFunctions(() => {});
    expect((await read()).rows.find((r) => r.id === oak.id)!.enrichment.phone).toMatchObject({ status: "failed", error: expect.stringContaining("BATCHDATA_API_KEY") });
    expect(await t.mutation(internal.outreach.giveUp, { contactId: oak.id, fields: ["phone"], at: again })).toEqual({ failed: 0 });
  });

  test("seedSampleList fills a list's first owners with a run's worth of sample results, skips real ones, charges nothing, and clears them all", async () => {
    // The mix, one owner at a time: found, found the hard way, found with a mismatch, a person but no phone, DNC only, found, not looked up, nothing, a litigator, failed.
    const s = (i: number) => sampleFor(i, { name: "Oak Plaza LLC", company: true, properties: 3 }, "2026-11-07T12:00:00.000Z");
    expect(s(0)).toMatchObject({ person: { name: "Mark Ellison", source: "tx-comptroller" }, cells: { phone: { status: "found", source: "batchdata", chargedCents: 100 }, research: { status: "found", chargedCents: 25 } } });
    expect(s(0).phones!.every((p) => isSampleNumber(p.number))).toBe(true);
    expect(s(0).emails![0].email).toBe("mark.ellison@example.com");
    expect(s(1).cells.phone).toMatchObject({ status: "found", source: "tracerfy" });
    expect(s(1).cells.email.status).toBe("none");
    expect(s(2).person!.confirmedBy).toEqual(["roll"]);
    expect(s(2).emails![0].nameMatch).toBe(false);
    expect(s(3).cells.phone.status).toBe("none");
    expect(s(4).phones!.every((p) => p.dnc)).toBe(true);
    expect(s(6).cells).toEqual({ person: { status: "locked" }, phone: { status: "locked" }, email: { status: "locked" }, research: { status: "locked" } });
    expect(s(7).person).toBeUndefined();
    expect(s(8).phones![0].litigator).toBe(true);
    expect(s(9).cells.phone).toMatchObject({ status: "failed", error: "batchdata: HTTP 503 Service Unavailable" });
    // A person owning in their own name has no person step.
    expect(sampleFor(0, { name: "Vance Robert & Linda", company: false, properties: 1 }, "2026-11-07T12:00:00.000Z").cells.person).toEqual({ status: "locked" });

    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "investor" } });
    const read = async () => (await co.as.query(api.outreach.contacts, { organizationId: org })).rows;
    // An owner with a real result is left as it is.
    const park = (await read()).find((r) => r.name === "Park Holdings LP")!;
    await t.run(async (ctx) => ctx.db.patch(park.id, { person: { name: "Real Person", source: "tx-comptroller" }, enrichment: { person: { status: "found", at: "2026-11-01T00:00:00.000Z", source: "tx-comptroller" }, phone: { status: "locked" }, email: { status: "locked" }, research: { status: "locked" } } }));
    expect(await t.mutation(internal.outreach.seedSampleList, { email: "nobody@roof.example" })).toEqual({ done: false, reason: "no user" });
    // No list named so: the newest list is filled, in its own order.
    expect(await t.mutation(internal.outreach.seedSampleList, { email: "owner@roof.example", count: 5 })).toEqual({ done: true, organization: expect.any(String), list: "Real estate investors, Midland", filled: 2, shared: 0 });
    const rows = await read();
    const nuka = rows.find((r) => r.name === "Nuka Hiva LLC")!;
    expect(nuka).toMatchObject({ person: { name: "Mark Ellison" }, note: "Sample data to show the layout, not a real lookup.", enrichment: { phone: { status: "found", chargedCents: 100 } } });
    expect(nuka.phones.length).toBe(2);
    expect(rows.find((r) => r.name === "Oak Plaza LLC")!.enrichment.phone).toMatchObject({ status: "found", source: "tracerfy" });
    expect(rows.find((r) => r.name === "Park Holdings LP")!.person).toEqual({ name: "Real Person", source: "tx-comptroller" });
    // Nothing charged: the balance is as it was.
    expect((await co.as.query(api.outreach.contacts, { organizationId: org })).balanceCents).toBe(500);
    // Cleared: every sample owner back to locked with no note; the real one untouched.
    expect(await t.mutation(internal.outreach.seedSampleList, { email: "owner@roof.example", clear: true })).toEqual({ done: true, cleared: 2, organization: expect.any(String) });
    const after = await read();
    for (const name of ["Nuka Hiva LLC", "Oak Plaza LLC"]) {
      const r = after.find((x) => x.name === name)!;
      expect(r).toMatchObject({ phones: [], emails: [], enrichment: { phone: { status: "locked" }, person: { status: "locked" } } });
      expect(r.person).toBeUndefined();
      expect(r.note).toBeUndefined();
    }
    expect(after.find((r) => r.name === "Park Holdings LP")!.person).toEqual({ name: "Real Person", source: "tx-comptroller" });
  });

  test("a sample owner's rerun walks every source in order, narrates, and lands sample results free; a real owner still uses real sources", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("SAMPLE_STEP_MS", "0");
    for (const k of ["TX_COMPTROLLER_API_KEY", "COBALT_API_KEY", "BATCHDATA_API_KEY", "TRACERFY_API_KEY", "ENFORMION_AP_NAME", "HUNTER_API_KEY", "LEADMAGIC_API_KEY", "TRESTLE_API_KEY", "TWILIO_ACCOUNT_SID", "ZEROBOUNCE_API_KEY"]) vi.stubEnv(k, "");
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "investor" } });
    await t.mutation(internal.outreach.seedSampleList, { email: "owner@roof.example", count: 1 });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const sample = (await read()).rows.find((r) => r.note?.startsWith("Sample"))!;
    const real = (await read()).rows.find((r) => !r.note && r.company)!;
    // Clear the sample's cells, as if never looked up, and run it again.
    await t.run(async (ctx) => ctx.db.patch(sample.id, { enrichment: { phone: { status: "locked" }, email: { status: "locked" }, person: { status: "locked" }, research: { status: "locked" } }, person: undefined, phones: undefined, emails: undefined }));
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [sample.id, real.id] });
    await t.finishAllScheduledFunctions(() => {});
    const after = await read();
    const rerun = after.rows.find((r) => r.id === sample.id)!;
    // The whole chain, by name, in the real order.
    expect(rerun.enrichment.person.tries!.map((x) => x.source)).toEqual(["roll", "permits", "tx-comptroller", "cobalt"]);
    expect(rerun.enrichment.phone.tries!.map((x) => x.source).slice(0, 4)).toEqual(["permits", "batchdata", "tracerfy", "enformion"]);
    expect(rerun.enrichment.person.status).toMatch(/found|none/);
    if (rerun.enrichment.phone.status === "found") {
      expect(rerun.phones.every((p) => isSampleNumber(p.number))).toBe(true);
      expect(rerun.enrichment.phone.chargedCents).toBe(0);
      expect(rerun.enrichment.phone.tries!.map((x) => x.source)).toContain("tracerfy-dnc");
    }
    // The real owner, with no keys, says so; nothing was charged for either.
    expect(after.rows.find((r) => r.id === real.id)!.enrichment.phone).toMatchObject({ status: "failed", error: expect.stringContaining("BATCHDATA_API_KEY") });
    expect(after.balanceCents).toBe(500);
    // The sample run leaves no mark on the sources' scorecard.
    expect((await t.run(async (ctx) => ctx.db.query("dataSourceStats").collect())).filter((x) => x.hits > 0)).toEqual([]);
  });

  test("with no phone source connected, a real owner's lookup walks the simulated chain: marked simulated, never charged, off the scorecard, cleared with the samples", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("SAMPLE_STEP_MS", "0");
    vi.stubEnv("OUTREACH_SIMULATE", "");
    for (const k of ["TX_COMPTROLLER_API_KEY", "COBALT_API_KEY", "BATCHDATA_API_KEY", "TRACERFY_API_KEY", "ENFORMION_AP_NAME", "HUNTER_API_KEY", "LEADMAGIC_API_KEY", "TRESTLE_API_KEY", "TWILIO_ACCOUNT_SID", "ZEROBOUNCE_API_KEY"]) vi.stubEnv(k, "");
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "investor" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const real = (await read()).rows.find((r) => r.company)!;
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [real.id], fields: ["person", "phone", "email", "research"] });
    await t.finishAllScheduledFunctions(() => {});
    const after = await read();
    const row = after.rows.find((r) => r.id === real.id)!;
    // Every source gets its turn, in the real order, and no cell says "not connected".
    expect(row.enrichment.person.tries!.map((x) => x.source)).toEqual(["roll", "permits", "tx-comptroller", "cobalt"]);
    expect(row.enrichment.phone.tries!.map((x) => x.source).slice(0, 4)).toEqual(["permits", "batchdata", "tracerfy", "enformion"]);
    for (const f of ["person", "phone", "email", "research"] as const) {
      expect(row.enrichment[f]!.status).not.toBe("failed");
      expect(row.enrichment[f]!.simulated).toBe(true);
    }
    expect(row.phones.every((p) => isSampleNumber(p.number))).toBe(true);
    // Free, and the sources' scorecard is left alone.
    expect(after.balanceCents).toBe(500);
    expect((await t.run(async (ctx) => ctx.db.query("dataSourceStats").collect())).filter((x) => x.hits > 0)).toEqual([]);
    // Sent to Leads, the made-up phone, email and decision maker stay behind, and the lead says so.
    const leadId = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: real.id });
    const lead = (await t.run(async (ctx) => ctx.db.get(leadId)))!;
    expect(lead).toMatchObject({ name: real.name, company: real.name });
    expect(lead.phone).toBeUndefined();
    expect(lead.email).toBeUndefined();
    expect(lead.notes).toContain(SAMPLE_LEFT_OUT);
    await t.run(async (ctx) => ctx.db.delete(leadId));
    // The sample clear-out takes simulated results too.
    expect(await t.mutation(internal.outreach.seedSampleList, { email: "owner@roof.example", clear: true })).toMatchObject({ done: true, cleared: 1 });
    expect((await read()).rows.find((r) => r.id === real.id)!.enrichment).toEqual({ phone: { status: "locked" }, email: { status: "locked" }, person: { status: "locked" }, research: { status: "locked" } });
  });

  test("running lookups hold what they could charge, so a second batch can't spend the same balance; a hit the balance can't pay for isn't handed over", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 100 }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const rows = (await read()).rows;
    const oak = rows.find((r) => r.name === "Oak Plaza LLC")!;
    const cityHall = rows.find((r) => r.name === "City Of Midland")!;

    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["phone"] })).resolves.toMatchObject({ queued: 1, costCents: 100 });
    // Nothing charged yet, but the dollar is spoken for.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [cityHall.id], fields: ["phone"] })).rejects.toThrow(
      /Balance too low: \$1\.00 needed for 1 phone, \$0\.00 available \(\$1\.00 held for lookups still running\)/,
    );
    // Free fields still go.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [cityHall.id], fields: ["person"] })).resolves.toMatchObject({ queued: 1, costCents: 0 });

    // The balance is spent elsewhere before the hit lands: the phone isn't kept, nothing is charged, and Retry shows.
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 0 }));
    await t.mutation(internal.outreach.recordEnrichment, { contactId: oak.id as Id<"outreachContacts">, field: "phone", source: "batchdata", phones: [{ number: "4325550100", type: "mobile", source: "batchdata" }] });
    const after = await read();
    const oakNow = after.rows.find((r) => r.id === oak.id)!;
    expect(oakNow.enrichment.phone).toMatchObject({ status: "failed", source: "batchdata", error: UNPAID_ERROR });
    expect(oakNow.phones).toEqual([]);
    expect(after.balanceCents).toBe(0);
    expect(await t.run(async (ctx) => ctx.db.query("walletTransactions").collect())).toEqual([]);
  });

  test("a company's first five phones found are free: no balance needed, nothing charged, a miss uses none, and the sixth is $1", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { outreachFreeUsed: undefined }));
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const first = await read();
    expect(first.freeLookups).toBe(FREE_LOOKUPS);
    expect(first.balanceCents).toBe(0);
    const oak = first.rows.find((r) => r.name === "Oak Plaza LLC")!;
    const cityHall = first.rows.find((r) => r.name === "City Of Midland")!;

    // No balance, and both go: the free ones cover them.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id, cityHall.id], fields: ["phone"] })).resolves.toMatchObject({ queued: 2, costCents: 0 });
    await t.mutation(internal.outreach.recordEnrichment, { contactId: oak.id as Id<"outreachContacts">, field: "phone", source: "batchdata", phones: [{ number: "4325550100", type: "mobile", source: "batchdata" }] });
    await t.mutation(internal.outreach.recordEnrichment, { contactId: cityHall.id as Id<"outreachContacts">, field: "phone", source: "batchdata" });
    const after = await read();
    const oakNow = after.rows.find((r) => r.id === oak.id)!;
    expect(oakNow.enrichment.phone).toMatchObject({ status: "found", source: "batchdata", chargedCents: 0 });
    expect(oakNow.phones.map((p) => p.number)).toEqual(["4325550100"]);
    expect(after.rows.find((r) => r.id === cityHall.id)!.enrichment.phone.status).toBe("none");
    // One found, one missed: one free lookup used, nothing charged.
    expect(after.freeLookups).toBe(FREE_LOOKUPS - 1);
    expect(await t.run(async (ctx) => ctx.db.query("walletTransactions").collect())).toEqual([]);

    // The last free one is spoken for by a running lookup: the next owner needs a dollar.
    await t.run(async (ctx) => ctx.db.patch(org, { outreachFreeUsed: FREE_LOOKUPS - 1 }));
    await t.run(async (ctx) => ctx.db.patch(oak.id as Id<"outreachContacts">, { enrichment: { ...oakNow.enrichment, phone: { status: "locked" } }, phones: [] }));
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [cityHall.id], fields: ["phone"] })).resolves.toMatchObject({ queued: 1, costCents: 0 });
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["phone"] })).rejects.toThrow(/Balance too low: \$1\.00 needed for 1 phone, \$0\.00 available/);
    await t.mutation(internal.outreach.recordEnrichment, { contactId: cityHall.id as Id<"outreachContacts">, field: "phone", source: "batchdata", phones: [{ number: "4325550101", type: "mobile", source: "batchdata" }] });
    expect((await read()).freeLookups).toBe(0);
    expect(await t.run(async (ctx) => ctx.db.query("walletTransactions").collect())).toEqual([]);

    // All five used: a phone found now is $1 from the balance.
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 100 }));
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["phone"] })).resolves.toMatchObject({ queued: 1, costCents: 100 });
    await t.mutation(internal.outreach.recordEnrichment, { contactId: oak.id as Id<"outreachContacts">, field: "phone", source: "batchdata", phones: [{ number: "4325550100", type: "mobile", source: "batchdata" }] });
    const paid = await read();
    expect(paid.rows.find((r) => r.id === oak.id)!.enrichment.phone).toMatchObject({ status: "found", chargedCents: 100 });
    expect(paid.balanceCents).toBe(0);
  });

  test("lookups wait their turn: only so many run at once, companies share the room, the next starts as one ends, and the watchdog counts from the start", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("OUTREACH_MAX_ACTIVE", "4");
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const a = await proCompany(t);
    const b = await proCompany(t, "second@roof.example");
    await a.as.mutation(api.outreach.create, { organizationId: a.organizationId, definition: { county: "Midland", who: "commercial" } });
    // Owners of their own for each company: copies of one from the roll, under names no two of which are sister companies.
    const names = ["Alder", "Birchwood", "Cedarline", "Dogwood", "Elmhurst", "Firethorn", "Ginkgo", "Hazelnut"];
    const ids = await t.run(async (ctx) => {
      const { _id, _creationTime, ...owner } = (await ctx.db.query("outreachContacts").first())!;
      void _id, _creationTime;
      const made: Id<"outreachContacts">[] = [];
      for (const [i, name] of names.entries()) {
        made.push(await ctx.db.insert("outreachContacts", { ...owner, organizationId: i < 6 ? a.organizationId : b.organizationId, key: `owner:${name}`, name: `${name} Partners`, company: `${name} Partners`, listIds: [] }));
      }
      await ctx.db.patch(a.organizationId, { walletBalanceCents: 10_000 });
      await ctx.db.patch(b.organizationId, { walletBalanceCents: 10_000 });
      return made;
    });
    const queue = async () => (await t.run(async (ctx) => ctx.db.query("outreachQueue").collect())).map((r) => ({ id: r._id, mine: r.organizationId === a.organizationId, state: r.state, contactId: r.contactId, startedAt: r.startedAt }));
    const count = (rows: Awaited<ReturnType<typeof queue>>, mine: boolean, state: string) => rows.filter((r) => r.mine === mine && r.state === state).length;

    // The first company asks for six, then the second for two: nothing starts until the pump runs.
    await expect(a.as.mutation(api.outreach.enrich, { organizationId: a.organizationId, contactIds: ids.slice(0, 6), fields: ["phone"] })).resolves.toMatchObject({ queued: 6 });
    await expect(b.as.mutation(api.outreach.enrich, { organizationId: b.organizationId, contactIds: ids.slice(6), fields: ["phone"] })).resolves.toMatchObject({ queued: 2 });
    expect((await queue()).every((r) => r.state === "queued")).toBe(true);
    // Each request scheduled one pump, not two functions an owner.
    const scheduled = async () => (await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter((f) => f.state.kind === "pending");
    expect((await scheduled()).map((f) => f.name)).toEqual(["outreach:pump", "outreach:pump"]);

    // Room for four: two each, though the first company asked first and for more.
    expect(await t.mutation(internal.outreach.pump, {})).toEqual({ started: 4 });
    let rows = await queue();
    expect([count(rows, true, "active"), count(rows, false, "active"), count(rows, true, "queued")]).toEqual([2, 2, 4]);
    // Full: another pump starts nothing.
    expect(await t.mutation(internal.outreach.pump, {})).toEqual({ started: 0 });
    // Each started lookup has its watchdog ten minutes from its start; the ones still waiting have none yet.
    const watchdogs = (await scheduled()).filter((f) => f.name === "outreach:giveUp");
    expect(watchdogs).toHaveLength(4);
    expect(watchdogs.every((f) => Math.round(f.scheduledTime) === NOW + GIVE_UP_AFTER_MS)).toBe(true);

    // One of the second company's ends: it has none waiting, so the place goes to the first.
    const done = rows.find((r) => !r.mine && r.state === "active")!;
    expect(await t.mutation(internal.outreach.lookupDone, { queueId: done.id })).toEqual({ started: 1 });
    rows = await queue();
    expect([count(rows, true, "active"), count(rows, false, "active"), count(rows, true, "queued")]).toEqual([3, 1, 3]);

    // A lookup that died without a word: its watchdog fails its cell and gives its place to the next one waiting.
    vi.setSystemTime(NOW + GIVE_UP_AFTER_MS);
    const dead = rows.find((r) => r.mine && r.state === "active")!;
    const at = (await t.run(async (ctx) => ctx.db.get(dead.contactId)))!.enrichment!.phone.at!;
    expect(await t.mutation(internal.outreach.giveUp, { contactId: dead.contactId, fields: ["phone"], at, queueId: dead.id })).toEqual({ failed: 1 });
    rows = await queue();
    expect(rows.find((r) => r.id === dead.id)).toBeUndefined();
    expect([count(rows, true, "active"), count(rows, true, "queued")]).toEqual([3, 2]);
    // The one just started counts its ten minutes from now, not from when it was asked for.
    const latest = (await scheduled()).filter((f) => f.name === "outreach:giveUp").map((f) => Math.round(f.scheduledTime));
    expect(Math.max(...latest)).toBe(NOW + 2 * GIVE_UP_AFTER_MS);

    // What's waiting or running holds the balance, from the queue alone; a field that has landed holds nothing more.
    await t.run(async (ctx) => ctx.db.patch(a.organizationId, { walletBalanceCents: 500 }));
    const spare = await t.run(async (ctx) => {
      const { _id, _creationTime, ...owner } = (await ctx.db.get(ids[0]))!;
      void _id, _creationTime;
      return await ctx.db.insert("outreachContacts", { ...owner, key: "owner:Ironwood", name: "Ironwood Partners", company: "Ironwood Partners", enrichment: { phone: { status: "locked" }, email: { status: "locked" }, person: { status: "locked" }, research: { status: "locked" } } });
    });
    // Five still to land at $1 each against $5: no room for a sixth.
    await expect(a.as.mutation(api.outreach.enrich, { organizationId: a.organizationId, contactIds: [spare], fields: ["phone"] })).rejects.toThrow(/Balance too low: \$1\.00 needed for 1 phone, \$0\.00 available \(\$5\.00 held for lookups still running\)/);
    const landed = rows.find((r) => r.mine && r.state === "active")!;
    await t.mutation(internal.outreach.recordEnrichment, { contactId: landed.contactId, field: "phone", source: "batchdata" });
    await expect(a.as.mutation(api.outreach.enrich, { organizationId: a.organizationId, contactIds: [spare], fields: ["phone"] })).resolves.toMatchObject({ queued: 1, costCents: 100 });
  });

  test("a company's lists stop at the owner cap, with the reason, on a new list and on loading more", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    const made = await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    // The lists already hold all but one of what's allowed.
    await t.run(async (ctx) => ctx.db.patch(made.listId as Id<"outreachLists">, { rowCount: OWNER_CAP - 1 }));
    await expect(co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } })).rejects.toThrow(OWNER_CAP_ERROR);
    expect(OWNER_CAP_ERROR).toBe("This company has 4,000 owners loaded, the most Outreach holds right now. Delete a list you're done with to load more.");
    // With room again, a list is made as before.
    await t.run(async (ctx) => ctx.db.patch(made.listId as Id<"outreachLists">, { rowCount: 2 }));
    await expect(co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } })).resolves.toMatchObject({ rowCount: 2 });
  });

  test("the page's live feed: only the owners changed since a moment, the balance with them, a removal stamped on the company, and a reload when too much changed", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 300 }));
    const made = await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const first = await co.as.query(api.outreach.contacts, { organizationId: org });
    expect(first.asOf).toBe(new Date(NOW).toISOString());
    expect(first.removedAt).toBeUndefined();
    const oak = first.rows.find((r) => r.name === "Oak Plaza LLC")!;
    const feed = async (since = first.asOf) => await co.as.query(api.outreach.changes, { organizationId: org, since });
    // Nothing since the read.
    expect(await feed()).toEqual({ balanceCents: 300, freeLookups: 0, removedAt: undefined, reload: false, rows: [], upTo: first.asOf });

    // A status set: that owner alone, as the page shows an owner.
    vi.setSystemTime(NOW + 60_000);
    await co.as.mutation(api.outreach.setStatus, { organizationId: org, contactId: oak.id, status: "skip", note: "Not now" });
    const one = await feed();
    expect(one.rows.map((r) => [r.name, r.status, r.note])).toEqual([["Oak Plaza LLC", "skip", "Not now"]]);
    expect(one.upTo).toBe(new Date(NOW + 60_000).toISOString());
    // From there on, nothing again.
    expect((await feed(one.upTo)).rows).toEqual([]);

    // A lookup asked for and landing: the owner comes each time, and the balance follows.
    vi.setSystemTime(NOW + 120_000);
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["phone"] });
    expect((await feed(one.upTo)).rows.map((r) => r.enrichment.phone.status)).toEqual(["running"]);
    vi.setSystemTime(NOW + 180_000);
    await t.mutation(internal.outreach.recordEnrichment, { contactId: oak.id as Id<"outreachContacts">, field: "phone", source: "batchdata", phones: [{ number: "4325550100", type: "mobile", source: "batchdata" }] });
    const landed = await feed(one.upTo);
    expect(landed.rows.map((r) => [r.enrichment.phone.status, r.phones.length])).toEqual([["found", 1]]);
    expect(landed.balanceCents).toBe(200);
    // Email outreach's own stamps come through too.
    vi.setSystemTime(NOW + 240_000);
    await t.run(async (ctx) => {
      await ctx.db.patch(oak.id as Id<"outreachContacts">, { email: { state: "emailed", at: new Date().toISOString() }, updatedAt: new Date().toISOString() });
    });
    expect((await feed(landed.upTo)).rows.map((r) => r.email?.state)).toEqual(["emailed"]);

    const copy = (await t.run(async (ctx) => ctx.db.get(oak.id as Id<"outreachContacts">)))!;
    // A list deleted takes its untouched owner with it: not in the feed, but the company's removal stamp moves.
    vi.setSystemTime(NOW + 300_000);
    await co.as.mutation(api.outreach.remove, { organizationId: org, listId: made.listId as Id<"outreachLists">, alsoWorked: true });
    expect((await feed(landed.upTo)).removedAt).toBe(new Date(NOW + 300_000).toISOString());

    // More changed than one answer carries: the page is told to read again.
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...owner } = copy;
      void _id, _creationTime;
      for (let i = 0; i <= CHANGES_MAX; i++) await ctx.db.insert("outreachContacts", { ...owner, key: `bulk:${i}`, name: `Bulk ${i}`, listIds: [], updatedAt: new Date(NOW + 360_000).toISOString() });
    });
    expect(await feed(landed.upTo)).toMatchObject({ reload: true, rows: [] });
  });

  test("seedSample fills one owner with marked sample data for a look at the layout, charges nothing, and clears it again", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    expect(await t.mutation(internal.outreach.seedSample, { email: "nobody@roof.example" })).toEqual({ done: false, reason: "no user" });
    expect(await t.mutation(internal.outreach.seedSample, { organization: "nobody" })).toEqual({ done: false, reason: "no contact", seen: [] });
    // The company can be named instead of reached through a user; what was looked at comes back when nothing fits.
    const other = await signUp(t, "other@roof.example");
    expect(await t.mutation(internal.outreach.seedSample, { email: "other@roof.example", organization: "other@roof" })).toEqual({ done: false, reason: "no contact", seen: [{ organization: "other@roof.example Co", contacts: 0 }] });
    void other;
    expect(await t.mutation(internal.outreach.seedSample, { email: "owner@roof.example", name: "Oak Plaza LLC" })).toEqual({ done: true, organization: "owner@roof.example Co", contact: "Oak Plaza LLC" });
    const after = await read();
    const oak = after.rows.find((r) => r.name === "Oak Plaza LLC")!;
    expect(oak.person).toEqual({ name: "Mark Ellison", title: "Managing member", source: "tx-comptroller" });
    expect(oak.phones.map((p) => p.number)).toEqual(["4325550142", "4325550199"]);
    expect(oak.emails).toEqual([{ email: "mark.ellison@example.com", source: "tracerfy", verified: true }]);
    expect(oak.research?.answer).toMatch(/^Sample: Oak Plaza LLC/);
    expect(oak.note).toBe("Sample data to show the layout, not a real lookup.");
    expect(oak.enrichment).toMatchObject({
      person: { status: "found", source: "tx-comptroller", tries: [{ source: "tx-comptroller", outcome: "hit", note: "Mark Ellison, Managing member" }] },
      phone: { status: "found", source: "tracerfy", chargedCents: 100, tries: [{ source: "batchdata", outcome: "miss" }, { source: "tracerfy", outcome: "hit", note: "2 numbers" }] },
      email: { status: "found", source: "tracerfy" },
      research: { status: "found", source: "claude", chargedCents: 25 },
    });
    expect(after.coverage.phone).toEqual({ found: 1, total: 2, sources: 1 });
    expect(after.balanceCents).toBe(0);
    // Sent to Leads: the sample person, phone, email and note stay behind.
    const leadId = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: oak.id });
    const lead = (await t.run(async (ctx) => ctx.db.get(leadId)))!;
    expect([lead.name, lead.phone, lead.email]).toEqual(["Oak Plaza LLC", undefined, undefined]);
    expect(lead.notes).toContain(SAMPLE_LEFT_OUT);
    expect(lead.notes).not.toContain("Sample data to show the layout");
    await t.run(async (ctx) => ctx.db.delete(leadId));
    // Again: nothing changes.
    expect(await t.mutation(internal.outreach.seedSample, { email: "owner@roof.example", name: "Oak Plaza LLC" })).toEqual({ done: true, already: true, organization: "owner@roof.example Co", contact: "Oak Plaza LLC" });
    // Cleared: back to locked cells, nothing left behind.
    expect(await t.mutation(internal.outreach.seedSample, { email: "owner@roof.example", name: "Oak Plaza LLC", clear: true })).toEqual({ done: true, cleared: true, organization: "owner@roof.example Co", contact: "Oak Plaza LLC" });
    const cleared = (await read()).rows.find((r) => r.name === "Oak Plaza LLC")!;
    expect(cleared.enrichment).toEqual({ phone: { status: "locked" }, email: { status: "locked" }, person: { status: "locked" }, research: { status: "locked" } });
    expect([cleared.person, cleared.research, cleared.note]).toEqual([undefined, undefined, undefined]);
    expect([cleared.phones, cleared.emails]).toEqual([[], []]);
    // A real owner is never cleared.
    expect(await t.mutation(internal.outreach.seedSample, { email: "owner@roof.example", name: "Oak Plaza LLC", clear: true })).toEqual({ done: false, reason: "not a sample", organization: "owner@roof.example Co", contact: "Oak Plaza LLC" });
  });

  test("our own records come first: the home the mail goes to names the owner, the company's permits name a person with a phone, and the carrier confirms the line", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, [
      ...ROLL,
      // An LLC billed at a Midland home that a couple owns and lives in: they run it.
      parcel("20", { owner: "BENT TREE DEVELOPMENT LLC", companyOwned: true, ownerOccupied: false, useCode: "F1", siteAddress: "10008 W COUNTY RD 157", street: "COUNTY RD 157", marketValueCents: 96_800_000, mailing: { address: "4516 Bent Tree Trail", city: "Midland", state: "TX", zip: "79707" } }),
      parcel("21", { owner: "ELLISON MARK & SUE", siteAddress: "4516 BENT TREE TRL", street: "BENT TREE TRL", marketValueCents: 60_000_000, mailing: { address: "4516 BENT TREE TRL", city: "MIDLAND", state: "TX", zip: "79707" } }),
    ]);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const bentTree = (await read()).rows.find((r) => r.name === "Bent Tree Development LLC")!;
    const oak = (await read()).rows.find((r) => r.name === "Oak Plaza LLC")!;
    // A permit Oak Plaza pulled at its shopping center, with the applicant's details; the roofer on it is someone else's company.
    await t.run(async (ctx) => {
      await ctx.db.insert("permits", {
        source: "midland",
        permitNumber: "P-1",
        name: "Reroof",
        county: "Midland",
        city: "Midland",
        address: "12 Midkiff Rd",
        addressKey: addressKey("12 Midkiff Rd"),
        appliedAt: "2026-08-01",
        trades: ["roofing"],
        importedAt: "2026-08-02T00:00:00.000Z",
        contacts: [
          { role: "Applicant", company: "Oak Plaza, L.L.C.", person: "Dana Reyes", phone: "(432) 555-0100", email: "Dana@OakPlaza.com" },
          { role: "Contractor", company: "ACME ROOFING LLC", person: "Bob Roofer", phone: "432-555-9999" },
        ],
      });
      await ctx.db.patch(org, { walletBalanceCents: 500 });
    });
    for (const k of ["TX_COMPTROLLER_API_KEY", "COBALT_API_KEY", "BATCHDATA_API_KEY", "TRACERFY_API_KEY", "ENFORMION_AP_NAME", "HUNTER_API_KEY", "ZEROBOUNCE_API_KEY"]) vi.stubEnv(k, "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(url);
        expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
        return new Response(JSON.stringify({ valid: true, line_type_intelligence: { type: "mobile" }, caller_name: { caller_name: "REYES DANA", caller_type: "CONSUMER" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [bentTree.id], fields: ["person"] });
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["person", "phone", "email"] });
    await t.finishAllScheduledFunctions(() => {});
    const after = await read();
    const bt = after.rows.find((r) => r.id === bentTree.id)!;
    expect(bt.person).toEqual({ name: "Mark Ellison", title: "Owns the home the mail goes to", address: "4516 Bent Tree Trl, Midland, TX", source: "roll" });
    expect(bt.enrichment.person.tries).toEqual([
      { source: "roll", outcome: "hit", note: "Mark Ellison, Owns the home the mail goes to" },
      // Free, so still asked to confirm; nothing at the property to ask.
      { source: "permits", outcome: "skipped", note: "No permits at the property" },
      { source: "tx-comptroller", outcome: "skipped", note: "Not connected" },
      { source: "cobalt", outcome: "skipped", note: "Not connected" },
    ]);
    const oakNow = after.rows.find((r) => r.id === oak.id)!;
    expect(oakNow.person).toEqual({ name: "Dana Reyes", title: "Applicant on permit P-1", source: "permits" });
    // The applicant's number, confirmed live, mobile and in her name by the carrier, so her own line rather than the office's the permit implied; the roofer's number never appears.
    expect(oakNow.phones).toEqual([{ number: "4325550100", type: "mobile", line: "personal", verified: true, score: 100, source: "permits", name: "REYES DANA" }]);
    expect(oakNow.emails).toEqual([{ email: "dana@oakplaza.com", source: "permits" }]);
    expect(oakNow.enrichment.phone).toMatchObject({ status: "found", source: "permits", chargedCents: 100 });
    expect(oakNow.enrichment.phone.tries).toEqual([
      { source: "permits", outcome: "hit", note: "1 number" },
      { source: "batchdata", outcome: "skipped", note: "Not connected" },
      { source: "tracerfy", outcome: "skipped", note: "Not connected" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic-mobile", outcome: "skipped", note: "Not connected" },
      { source: "trestle", outcome: "skipped", note: "Not connected" },
      { source: "twilio", outcome: "hit", note: "1 of 1 live · 1 in the owner's name · 1 personal" },
      { source: "tracerfy-dnc", outcome: "skipped", note: "Not connected" },
    ]);
    expect(oakNow.enrichment.person.tries[0]).toEqual({ source: "roll", outcome: "skipped", note: "The mail goes to Dallas, off the roll" });
    expect(oakNow.enrichment.person.tries[1]).toEqual({ source: "permits", outcome: "hit", note: "Dana Reyes, Applicant on permit P-1" });
    expect(urls).toEqual(["https://lookups.twilio.com/v2/PhoneNumbers/%2B14325550100?Fields=line_type_intelligence,caller_name"]);
    expect(after.balanceCents).toBe(400);
    await t.run(async (ctx) => {
      const stats = (await ctx.db.query("dataSourceStats").collect()).map((s) => [s.source, s.field, s.attempts, s.hits]).sort();
      expect(stats).toEqual([
        ["permits", "email", 1, 1],
        ["permits", "person", 1, 1],
        ["permits", "phone", 1, 1],
        ["roll", "person", 1, 1],
        ["twilio", "phone", 1, 1],
      ]);
    });
  });

  test("the realtors list: licensed agents and brokers with no property, the person free from the license, and lookups that work from the name and brokerage", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await t.run(async (ctx) => {
      const stamp = "2026-11-08T06:55:00.000Z";
      const holder = (licenseNumber: string, type: "agent" | "broker" | "brokerage", name: string, over: Record<string, unknown> = {}) =>
        ctx.db.insert("realtors", { county: "Midland", licenseNumber, type, name, expiresAt: "2027-09-30", supervisor: false, importedAt: stamp, seenAt: stamp, ...over });
      await holder("700001", "agent", "ELENA MARIE RIVERA", { first: "ELENA", last: "RIVERA", licensedAt: "2016-03-14", brokerage: { licenseNumber: "601430-BB", name: "FATHOM REALTY, LLC", type: "brokerage" }, brokerageSince: "2021-03-01" });
      await holder("700002", "agent", "SAM LEE", { first: "SAM", last: "LEE", licensedAt: "2024-01-10", brokerage: { licenseNumber: "516832-B", name: "TERRY LANCE MARKER", type: "broker" } });
      await holder("516832-B", "broker", "TERRY LANCE MARKER", { first: "TERRY", last: "MARKER", licensedAt: "1989-08-07", supervisor: true });
      await holder("601430-BB", "brokerage", "FATHOM REALTY, LLC");
    });
    // Eleven owners and offices from the roll, and three people on the realtor list; the brokerage company is nobody's row.
    expect(await rebuild(t)).toEqual({ fetched: 19, added: 14, updated: 0 });
    await t.run(async (ctx) => {
      const realtors = (await ctx.db.query("owners").collect()).filter((o) => o.kind === "realtor");
      expect(realtors.map((o) => [o.name, o.brokerage, o.license?.sponsors]).sort()).toEqual([["Elena Rivera", "Fathom Realty, LLC", undefined], ["Sam Lee", "Terry Lance Marker", undefined], ["Terry Marker", undefined, 1]]);
      expect((await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-owners")).unique())!.facetCounts).toMatchObject({ realtor: 3 });
    });
    const co = await proCompany(t);
    const org = co.organizationId;
    // Sponsoring brokers first, then the longest licensed.
    const preview = await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "realtor" }) });
    expect(preview.rows.map((r) => [r.name, r.company, r.property, r.properties, r.why])).toEqual([
      ["Terry Marker", undefined, undefined, 0, "Broker, licensed since 1989; sponsors 1 agent; license through Sep 2027"],
      ["Elena Rivera", "Fathom Realty, LLC", undefined, 0, "Sales agent with Fathom Realty, LLC since Mar 2021, licensed since 2016; license through Sep 2027"],
      ["Sam Lee", "Terry Lance Marker", undefined, 0, "Sales agent with Terry Lance Marker, licensed since 2024; license through Sep 2027"],
    ]);
    const { listId } = await co.as.mutation(api.outreach.create, { organizationId: org, definition: definitionFromArgs({ who: "realtor" }) });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org, listId });
    const elena = (await read()).rows.find((r) => r.name === "Elena Rivera")!;
    // The person is the row, from the license, free; nothing to show for a property or its signals.
    expect(elena).toMatchObject({ company: "Fathom Realty, LLC", properties: 0, mailing: { city: "Midland", state: "TX" }, signals: [], kinds: ["realtor"] });
    expect(elena.property).toBeUndefined();
    expect(elena.person).toEqual({ name: "Elena Rivera", title: "Sales agent, TREC license 700001", source: "trec" });
    expect(elena.enrichment).toMatchObject({ person: { status: "found", source: "trec" }, phone: { status: "locked" }, email: { status: "locked" } });
    // A lookup: the sources that trace from a property address stand aside; Hunter finds her work email from her name and the brokerage, and the mobile finder turns that into her cell.
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    for (const k of ["TX_COMPTROLLER_API_KEY", "COBALT_API_KEY", "ENFORMION_AP_NAME", "ZEROBOUNCE_API_KEY", "TRESTLE_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]) vi.stubEnv(k, "");
    vi.stubEnv("BATCHDATA_API_KEY", "bd");
    vi.stubEnv("TRACERFY_API_KEY", "tf");
    vi.stubEnv("HUNTER_API_KEY", "hk");
    vi.stubEnv("LEADMAGIC_API_KEY", "lm");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url.includes("hunter.io")) return new Response(JSON.stringify({ data: { email: "elena@fathomrealty.com", verification: { status: "valid" } } }), { status: 200 });
      if (url.includes("mobile-finder")) {
        expect(JSON.parse(init!.body as string)).toEqual({ work_email: "elena@fathomrealty.com" });
        return new Response(JSON.stringify({ mobile_number: "+1 432-555-0700", credits_consumed: 5, message: "Mobile number found." }), { status: 200 });
      }
      if (url.includes("/dnc/lookup/")) return new Response(JSON.stringify({ results: [{ phone: "4325550700", national_dnc: false, state_dnc: false, litigator: false }] }), { status: 200 });
      throw new Error(`unexpected call: ${url}`);
    }));
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [elena.id], fields: ["phone", "email"] });
    await t.finishAllScheduledFunctions(() => {});
    const after = (await read()).rows.find((r) => r.id === elena.id)!;
    expect(after.enrichment.phone.tries).toEqual([
      { source: "permits", outcome: "skipped", note: "No permits at the property" },
      { source: "batchdata", outcome: "skipped", note: "No property address on file" },
      { source: "tracerfy", outcome: "skipped", note: "No property address on file" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic-mobile", outcome: "hit", note: "1 number" },
      { source: "trestle", outcome: "skipped", note: "Not connected" },
      { source: "twilio", outcome: "skipped", note: "Not connected" },
      { source: "tracerfy-dnc", outcome: "hit", note: "1 of 1 clear" },
    ]);
    // Her own cell, $1, clear to call; the line checkers weren't connected to say more.
    expect(after.phones).toEqual([{ number: "4325550700", type: "mobile", line: "personal", source: "leadmagic-mobile" }]);
    expect(after.enrichment.phone).toMatchObject({ status: "found", source: "leadmagic-mobile", chargedCents: 100 });
    expect((await read()).balanceCents).toBe(400);
    expect(after.emails).toEqual([{ email: "elena@fathomrealty.com", source: "hunter", verified: true }]);
    expect(after.enrichment.email).toMatchObject({ status: "found", source: "hunter" });
    expect(urls.filter((u) => u.includes("hunter.io"))).toEqual(["https://api.hunter.io/v2/email-finder?company=Fathom%20Realty%2C%20LLC&first_name=Elena&last_name=Rivera&api_key=hk"]);
    // Sent to Leads: her name, the brokerage as the company, the cell and the email, no address.
    const leadId = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: elena.id });
    const lead = (await t.run(async (ctx) => ctx.db.get(leadId)))!;
    expect([lead.name, lead.company, lead.phone, lead.email, lead.address]).toEqual(["Elena Rivera", "Fathom Realty, LLC", "4325550700", "elena@fathomrealty.com", undefined]);
    expect(guessDefinition("realtors who can send me work")?.definition).toEqual({ county: "Midland", who: "realtor" });
  });

  test("a mobile from an email: the work email found first, LeadMagic's finder keys off it, the carrier says it's hers, and the row shows a personal mobile for $1", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const oak = (await read()).rows.find((r) => r.name === "Oak Plaza LLC")!;
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 500 }));
    // The skip trace is connected but has nothing; Hunter has her work email; LeadMagic's finder has her cell; the carrier knows whose it is.
    for (const k of ["TX_COMPTROLLER_API_KEY", "COBALT_API_KEY", "TRACERFY_API_KEY", "ENFORMION_AP_NAME", "ZEROBOUNCE_API_KEY", "TRESTLE_API_KEY"]) vi.stubEnv(k, "");
    vi.stubEnv("OUTREACH_SIMULATE", "off");
    vi.stubEnv("BATCHDATA_API_KEY", "bd");
    vi.stubEnv("HUNTER_API_KEY", "hk");
    vi.stubEnv("LEADMAGIC_API_KEY", "lm");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
        if (url.includes("batchdata")) return (calls.push("batchdata"), json({ results: { persons: [] } }));
        if (url.includes("hunter.io")) return (calls.push("hunter"), json({ data: { email: "dana@oakplaza.com", verification: { status: "valid" } } }));
        if (url.includes("mobile-finder")) return (calls.push(`mobile:${JSON.stringify(JSON.parse(init!.body as string))}`), json({ mobile_number: "+1 (432) 555-0142", credits_consumed: 5, message: "Mobile number found." }));
        if (url.includes("email-finder")) return (calls.push("leadmagic"), json({ email: null, status: null }));
        if (url.includes("lookups.twilio.com")) return (calls.push("twilio"), json({ valid: true, line_type_intelligence: { type: "mobile" }, caller_name: { caller_name: "REYES DANA", caller_type: "CONSUMER" } }));
        throw new Error(`unexpected call: ${url}`);
      }),
    );
    // The person is already known: the email and phone steps alone.
    await t.run(async (ctx) => ctx.db.patch(oak.id, { person: { name: "Dana Reyes", title: "Manager", source: "tx-comptroller" }, enrichment: { ...oak.enrichment, person: { status: "found", at: new Date(NOW).toISOString(), source: "tx-comptroller" } } }));
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["phone", "email"] });
    await t.finishAllScheduledFunctions(() => {});
    const now = (await read()).rows.find((r) => r.id === oak.id)!;
    // The email came first so the finder had it to work from; the carrier was asked about the one number.
    expect(calls).toEqual(["batchdata", "hunter", 'mobile:{"work_email":"dana@oakplaza.com"}', "twilio"]);
    expect(now.emails).toEqual([{ email: "dana@oakplaza.com", source: "hunter", verified: true }]);
    expect(now.phones).toEqual([{ number: "4325550142", type: "mobile", line: "personal", verified: true, score: 100, name: "REYES DANA", source: "leadmagic-mobile" }]);
    expect(now.enrichment.phone).toMatchObject({ status: "found", source: "leadmagic-mobile", chargedCents: 100 });
    expect(now.enrichment.phone.tries).toEqual([
      { source: "permits", outcome: "skipped", note: "No permits at the property" },
      { source: "batchdata", outcome: "miss", note: "No match" },
      { source: "tracerfy", outcome: "skipped", note: "Not connected" },
      { source: "enformion", outcome: "skipped", note: "Not connected" },
      { source: "leadmagic-mobile", outcome: "hit", note: "1 number" },
      { source: "trestle", outcome: "skipped", note: "Not connected" },
      { source: "twilio", outcome: "hit", note: "1 of 1 live · 1 in the owner's name · 1 personal" },
      { source: "tracerfy-dnc", outcome: "skipped", note: "Not connected" },
    ]);
    expect(now.enrichment.email).toMatchObject({ status: "found", source: "hunter" });
    expect((await read()).balanceCents).toBe(400);
    // The ledger on the Sources page: the finder's one try, one hit, the dollar.
    const ops = await signUp(t, "ops@webb.example", { role: "staff" });
    const stack = await ops.as.query(api.outreach.sources, { organizationId: org });
    expect(stack.find((s) => s.name === "leadmagic-mobile")).toMatchObject({ connected: true, stats: [{ field: "phone", attempts: 1, hits: 1, chargedCents: 100 }] });
  });

  test("research reads the web about an owner through Claude: an answer with sources for 25¢, nothing found free", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "commercial" } });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org });
    const first = await read();
    expect(first).toMatchObject({ researchCents: 25, researchQuestion: expect.stringContaining("planned construction") });
    expect(first.coverage.research).toEqual({ found: 0, total: 2, sources: 0 });
    const oak = first.rows.find((r) => r.name === "Oak Plaza LLC")!;
    const cityHall = first.rows.find((r) => r.name === "City Of Midland")!;
    expect(oak.enrichment.research).toEqual({ status: "locked" });

    // No balance: refused, and the note says what the money is for.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["research"] })).rejects.toThrow(/\$0\.25 needed for 1 research answer/);
    await t.run(async (ctx) => ctx.db.patch(org, { walletBalanceCents: 100 }));
    // No key: a failed cell that says so, free.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["research"] });
    await t.finishAllScheduledFunctions(() => {});
    expect((await read()).rows.find((r) => r.id === oak.id)!.enrichment.research).toMatchObject({ status: "failed", error: expect.stringContaining("ANTHROPIC_API_KEY") });

    // With the key: Claude searches, answers in a few sentences, and cites two pages; the city gets "nothing found".
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const asks: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        asks.push(body);
        const text = (body.messages as Array<{ content: string }>)[0].content;
        const content = text.includes("Oak Plaza LLC")
          ? [
              { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "Oak Plaza LLC Midland" } },
              { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://example.com/oak", title: "Oak Plaza" }] },
              { type: "text", text: "Oak Plaza LLC owns the shopping center at 12 Midkiff Rd, run by manager Dana Reyes.", citations: [{ type: "web_search_result_location", url: "https://example.com/oak", title: "Oak Plaza Shopping Center", cited_text: "..." }] },
              { type: "text", text: " A permit for a facade renovation was filed in September 2026.", citations: [{ type: "web_search_result_location", url: "https://permits.example.com/123", title: "Permit 123" }, { type: "web_search_result_location", url: "https://example.com/oak", title: "Oak Plaza Shopping Center" }] },
            ]
          : [{ type: "text", text: "NOTHING FOUND. Searched the city's name with the address; only the roll itself came up." }];
        return new Response(JSON.stringify({ content, stop_reason: "end_turn" }), { status: 200 });
      }),
    );
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id, cityHall.id], fields: ["research"], question: "Any renovation planned?" })).resolves.toMatchObject({ queued: 2, costCents: 50 });
    expect((await read()).rows.find((r) => r.id === oak.id)!.enrichment.research).toMatchObject({ status: "running" });
    await t.finishAllScheduledFunctions(() => {});
    const after = await read();
    const oakNow = after.rows.find((r) => r.id === oak.id)!;
    expect(oakNow.enrichment.research).toMatchObject({ status: "found", source: "claude", chargedCents: 25, tries: [{ source: "claude", outcome: "hit", note: "2 pages read" }] });
    expect(oakNow.research).toEqual({
      question: "Any renovation planned?",
      answer: "Oak Plaza LLC owns the shopping center at 12 Midkiff Rd, run by manager Dana Reyes. A permit for a facade renovation was filed in September 2026.",
      sources: [
        { title: "Oak Plaza Shopping Center", url: "https://example.com/oak" },
        { title: "Permit 123", url: "https://permits.example.com/123" },
      ],
      at: new Date(NOW).toISOString(),
    });
    const cityNow = after.rows.find((r) => r.id === cityHall.id)!;
    expect(cityNow.enrichment.research).toMatchObject({ status: "none", source: "claude", tries: [{ source: "claude", outcome: "miss", note: "Nothing specific on this owner" }] });
    expect(cityNow.research).toBeUndefined();
    expect(after.balanceCents).toBe(75);
    expect(after.coverage.research).toEqual({ found: 1, total: 2, sources: 1 });
    // Claude was asked with web search, at low effort, the question and the owner's roll facts in the message.
    expect(asks).toHaveLength(2);
    expect(asks[0]).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "low" }, tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] });
    const oakAsk = asks.find((a) => (a.messages as Array<{ content: string }>)[0].content.includes("Oak Plaza LLC"))!;
    expect((oakAsk.messages as Array<{ content: string }>)[0].content).toContain("Property: 12 Midkiff Rd, Midland, TX");
    expect((oakAsk.messages as Array<{ content: string }>)[0].content).toContain("Question: Any renovation planned?");
    await t.run(async (ctx) => {
      const charges = (await ctx.db.query("walletTransactions").collect()).map((c) => [c.type, c.amountCents, c.note]);
      expect(charges).toEqual([["unlock", -25, "Research on Oak Plaza LLC"]]);
      const stats = (await ctx.db.query("dataSourceStats").collect()).map((s) => [s.source, s.field, s.attempts, s.hits, s.chargedCents]).sort();
      expect(stats).toEqual([["claude", "research", 2, 1, 25]]);
    });
    // Answered rows aren't asked again.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [oak.id], fields: ["research"] })).resolves.toMatchObject({ queued: 0, costCents: 0 });
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

  test("the records lists: violations by what they call for, stalled permits, contractors with their permits' contacts free, and long-held homes", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    // One more home, held since 2001; and a landlord with three storefronts on Wadley.
    const storefront = (id: string, cents: number) => parcel(id, { owner: "WADLEY SQUARE PARTNERS LP", companyOwned: true, ownerOccupied: false, useCode: "F1", siteAddress: `${id} WADLEY AV`, street: "WADLEY AV", marketValueCents: cents, mailing: { address: "9 OAK ST", city: "MIDLAND", state: "TX", zip: "79705" } });
    const ids = await addParcels(t, [...ROLL, parcel("20", { owner: "HALE DOROTHY", deedDate: "2001-05-10", marketValueCents: 25_000_000 }), storefront("30", 80_000_000), storefront("31", 60_000_000), storefront("32", 40_000_000)]);
    await t.run(async (ctx) => {
      const stamp = "2026-11-01T07:20:00.000Z";
      // The city's records: a deteriorated structure on one of Nuka Hiva's homes (newest first on the row), weeds on another, a stalled pool permit at Oak Plaza, and an old case that no longer counts.
      await ctx.db.insert("signals", { county: "Midland", parcelId: ids["4"], address: "4 SPRUCE AV", kind: "code_violation", detail: "Deteriorated Structure", caseNumber: "C-1", date: "2026-09-01T12:00:00.000Z", sourceId: "code:1", importedAt: stamp });
      await ctx.db.insert("signals", { county: "Midland", parcelId: ids["6"], address: "6 ELM ST", kind: "code_violation", detail: "High Weeds", caseNumber: "C-2", date: "2026-06-01T12:00:00.000Z", sourceId: "code:2", importedAt: stamp });
      await ctx.db.insert("signals", { county: "Midland", parcelId: ids["12"], address: "12 MIDKIFF RD", kind: "stalled_permit", detail: "Pool: Expired - after 6 month", status: "Expired - after 6 month", date: "2026-08-15T12:00:00.000Z", sourceId: "permit:P-9", importedAt: stamp });
      await ctx.db.insert("signals", { county: "Midland", parcelId: ids["2"], address: "2 SPRUCE AV", kind: "code_violation", detail: "Deteriorated Structure", date: "2023-01-01T12:00:00.000Z", sourceId: "code:old", importedAt: stamp });
      // The permits: a roofer on three jobs (one older than the window), with its own people on them; a builder whose job is off the roll.
      const permit = (n: string, appliedAt: string, address: string, over: Record<string, unknown> = {}) =>
        ctx.db.insert("permits", { source: "midland", permitNumber: n, name: "Residential - Building", workClass: "Alteration & Repair", county: "Midland", city: "Midland", appliedAt, address, addressKey: addressKey(address), trades: ["roofing"], residential: true, importedAt: stamp, ...over });
      const roofer = [
        { role: "Contractor", company: "West Texas Roofing, LLC", person: "Ray Soto", phone: "(432) 555-0123", email: "Ray@WTRoofing.com" },
        { role: "Owner", company: "Oak Plaza LLC", person: "Dana Reyes", phone: "432-555-0100" },
      ];
      await permit("P-1", "2026-10-01T15:00:00.000Z", "12 MIDKIFF RD", { builder: "WEST TEXAS ROOFING LLC", valuationCents: 1_800_000, contacts: roofer });
      await permit("P-2", "2026-09-10T15:00:00.000Z", "1 SPRUCE AV", { builder: "West Texas Roofing, LLC", valuationCents: 1_200_000, residential: false, trades: ["roofing", "general-construction"], contacts: [{ role: "Contractor", company: "West Texas Roofing LLC", person: "Ray Soto", phone: "4325550123" }, { role: "Applicant", company: "West Texas Roofing LLC", person: "Ana Soto", email: "ana@wtroofing.com" }, { role: "Architect", company: "Parkhill Inc", person: "Lee Ortiz", phone: "(432) 555-0199", email: "LOrtiz@Parkhill.com" }] });
      // A second commercial job the same architect applied for, with a different builder; the owner is on it too.
      await permit("P-5", "2026-10-05T15:00:00.000Z", "12 MIDKIFF RD", { builder: "GHOST BUILDERS INC", valuationCents: 5_000_000, residential: false, trades: ["general-construction"], contacts: [{ role: "Applicant", company: "Parkhill", person: "Lee Ortiz", phone: "432-555-0199" }, { role: "Owner", company: "Oak Plaza LLC", person: "Dana Reyes" }] });
      await permit("P-3", "2026-01-10T15:00:00.000Z", "2 SPRUCE AV", { builder: "WEST TEXAS ROOFING LLC", valuationCents: 9_000_000 });
      await permit("P-4", "2026-10-20T15:00:00.000Z", "999 NOWHERE LN", { builder: "GHOST BUILDERS INC", trades: ["general-construction"] });
      // The tenants, from three sources: a certificate of occupancy for a boutique in one of Wadley Square's storefronts; a dentist's build-out permit in another, with the dentist as its "owner"; and the state's sales-tax permits, one for the boutique again and one for a taqueria the city's records never named.
      await permit("CO-1", "2026-10-15T15:00:00.000Z", "30 WADLEY AV", { name: "Certificate of Occupancy", workClass: "Certificate of Occupancy", detail: "Blue Door Boutique", trades: [], residential: false });
      await permit("P-7", "2026-10-25T15:00:00.000Z", "32 WADLEY AV", { name: "Commercial - Building", workClass: "Alteration & Repair", trades: ["general-construction"], residential: false, valuationCents: 12_000_000, contacts: [{ role: "Owner", company: "Desert Dental PLLC", person: "Kim Pham", phone: "432-555-0155" }] });
      const outlet = (taxpayerNumber: string, name: string, address: string, at: string, over: Record<string, unknown> = {}) =>
        ctx.db.insert("outlets", { county: "Midland", taxpayerNumber, outletNumber: "1", name, address, addressKey: addressKey(address), city: "MIDLAND", at, importedAt: stamp, seenAt: stamp, ...over });
      await outlet("1", "BLUE DOOR BOUTIQUE", "30 WADLEY AV", "2026-10-20T00:00:00.000Z", { taxpayer: "RIVERA ELENA", naics: "448120", mailing: { address: "PO BOX 9", city: "MIDLAND", state: "TX", zip: "79702" } });
      await outlet("2", "TACO LOCO LLC", "31 WADLEY AV", "2026-09-01T00:00:00.000Z", { taxpayer: "TACO LOCO LLC", naics: "722511" });
      // A business run from a home, and one that has sold here for years: neither is a tenant moving in.
      await outlet("3", "HOME BAKES", "4 SPRUCE AV", "2026-10-01T00:00:00.000Z");
      await outlet("4", "OLD RELIABLE TIRES", "13 SPRUCE AV", "2019-03-01T00:00:00.000Z");
    });
    expect(await rebuild(t)).toEqual({ fetched: 23, added: 19, updated: 0, error: undefined });
    await t.run(async (ctx) => {
      const owners = await ctx.db.query("owners").collect();
      const facetsOfName = async (name: string) => {
        const o = owners.find((x) => x.name === name)!;
        return (await ctx.db.query("ownerFacets").withIndex("by_owner", (q) => q.eq("ownerId", o._id)).collect()).map((f) => f.facet).sort();
      };
      // Nuka Hiva's two cases ride on its row, newest first, with what they call for; the row's property is the newest case's home.
      const nuka = owners.find((o) => o.name === "Nuka Hiva LLC")!;
      expect(nuka.signals!.map((s) => [s.detail, s.date.slice(0, 10)])).toEqual([["Deteriorated Structure", "2026-09-01"], ["High Weeds", "2026-06-01"]]);
      expect(nuka.trades).toEqual(["general-construction", "roofing", "outdoor-construction"]);
      expect(nuka.tops.signal!.address).toBe("4 SPRUCE AV");
      expect(await facetsOfName("Nuka Hiva LLC")).toEqual(["investor", "violation"]);
      expect(await facetsOfName("Oak Plaza LLC")).toEqual(["buyer", "commercial", "investor", "stalled"]);
      // A case from three years back puts nobody on the list.
      expect(await facetsOfName("Reyes Samuel")).toEqual(["buyer", "homeowner"]);
      expect(await facetsOfName("Hale Dorothy")).toEqual(["homeowner", "long_owned"]);
      // The roofer: two permits in the window (the January one is out), both spellings as one, its own people only, no property off the roll.
      const roofer = owners.find((o) => o.kind === "contractor")!;
      expect(roofer).toMatchObject({ name: "West Texas Roofing LLC", company: true, parcels: 2, residential: 1, commercial: 1, totalValueCents: 3_000_000, trades: ["general-construction", "roofing"], latestAt: "2026-10-01T15:00:00.000Z" });
      expect(roofer.contacts).toEqual([
        { role: "Contractor", person: "Ray Soto", phone: "4325550123", email: "ray@wtroofing.com" },
        { role: "Applicant", person: "Ana Soto", email: "ana@wtroofing.com" },
      ]);
      expect(roofer.tops.all.address).toBe("12 MIDKIFF RD");
      // Ghost Builders' first job is off the roll, its second is on it: a row from the second alone.
      expect(owners.filter((o) => o.kind === "contractor").map((o) => [o.name, o.parcels, o.tops.all.address])).toEqual([["West Texas Roofing LLC", 2, "12 MIDKIFF RD"], ["Ghost Builders INC", 2, "12 MIDKIFF RD"]]);
      expect(await facetsOfName("West Texas Roofing LLC")).toEqual(["contractor"]);
      // The architect: two commercial permits under two spellings, one row, her own contacts only, the property from her newest permit.
      const architect = owners.find((o) => o.kind === "designer")!;
      expect(architect).toMatchObject({ name: "Parkhill", company: true, parcels: 2, commercial: 2, totalValueCents: 6_200_000, trades: ["general-construction", "roofing"], latestAt: "2026-10-05T15:00:00.000Z" });
      expect(architect.contacts).toEqual([{ role: "Architect", person: "Lee Ortiz", phone: "4325550199", email: "lortiz@parkhill.com" }]);
      expect(architect.tops.all.address).toBe("12 MIDKIFF RD");
      expect(await facetsOfName("Parkhill")).toEqual(["designer"]);
      // Three storefronts: a portfolio owner as well as an investor and a commercial owner; the city with four is not.
      expect(await facetsOfName("Wadley Square Partners LP")).toEqual(["commercial", "investor", "portfolio"]);
      expect(await facetsOfName("City Of Midland")).toEqual(["commercial"]);
      // The tenants: the boutique once, from both sources; the dentist off its permit; the taqueria off its sales-tax permit. Oak Plaza, the "owner" on its own center's permit, is the landlord, not a tenant.
      expect(owners.filter((o) => o.kind === "occupant").map((o) => [o.name, o.tops.all.address, o.sources, o.latestAt?.slice(0, 10)])).toEqual([
        ["Blue Door Boutique", "30 WADLEY AV", ["occupancy", "outlet"], "2026-10-20"],
        ["Desert Dental PLLC", "32 WADLEY AV", ["permit"], "2026-10-25"],
        ["Taco Loco LLC", "31 WADLEY AV", ["outlet"], "2026-09-01"],
      ]);
      expect(await facetsOfName("Blue Door Boutique")).toEqual(["occupant"]);
    });

    const co = await proCompany(t);
    const org = co.organizationId;
    const pull = async (definition: Parameters<typeof definitionFromArgs>[0]) => {
      const r = await co.as.mutation(api.outreach.create, { organizationId: org, definition: definitionFromArgs(definition) });
      const rows = (await co.as.query(api.outreach.contacts, { organizationId: org, listId: r.listId })).rows;
      return { ...r, rows };
    };
    // Every violation, newest first; then only the ones a roofer can fix.
    const violations = await pull({ who: "violation" });
    expect(violations.rows.map((r) => [r.name, r.property.address, r.why])).toEqual([["Nuka Hiva LLC", "4 Spruce Av", "Code violation Sep 2026: Deteriorated Structure; 2 records since Jun 2026"]]);
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "violation", trades: ["roofing"] }) })).toMatchObject({ count: 1, total: 1 });
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "violation", trades: ["plumbing"] }) })).toMatchObject({ count: 0, total: 0 });
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "violation", within_days: 30 }) })).toMatchObject({ count: 0, total: 0 });
    const stalled = await pull({ who: "stalled" });
    expect(stalled.rows.map((r) => [r.name, r.why])).toEqual([["Oak Plaza LLC", "Permit stalled Aug 2026: Pool, Expired - after 6 month"]]);
    // Long-held homes: the default twenty years; a shorter ask reads the homeowner facet instead.
    const held = await pull({ who: "long_owned" });
    expect(held.rows.map((r) => [r.name, r.why])).toEqual([["Hale Dorothy", "Owner-occupied since May 2001, home worth $250K"]]);
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "long_owned", owned_for_years: 5 }) })).toMatchObject({ count: 2, total: 2 });
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "long_owned", owned_for_years: 10 }) })).toMatchObject({ count: 1, total: 1 });
    // Contractors: the permits' own people come along as found cells, free, so the row can be called without a lookup.
    const contractors = await pull({ who: "contractor", trades: ["roofing"] });
    expect(contractors.rows).toHaveLength(1);
    const roofer = contractors.rows[0];
    expect(roofer).toMatchObject({ name: "West Texas Roofing LLC", company: "West Texas Roofing LLC", properties: 2, why: "Pulled 2 permits in the last 180 days (1 residential, 1 commercial), $30,000 of work; General Construction, Roofing" });
    expect(roofer.person).toEqual({ name: "Ray Soto", title: "Contractor on a permit", source: "permits" });
    expect(roofer.phones).toEqual([{ number: "4325550123", type: "unknown", source: "permits" }]);
    expect(roofer.emails).toEqual([{ email: "ray@wtroofing.com", source: "permits" }, { email: "ana@wtroofing.com", source: "permits" }]);
    expect(roofer.enrichment).toMatchObject({ person: { status: "found", source: "permits" }, phone: { status: "found", source: "permits", chargedCents: 0 }, email: { status: "found", source: "permits" }, research: { status: "locked" } });
    // Already found: a lookup has nothing to run, and nothing to charge.
    await expect(co.as.mutation(api.outreach.enrich, { organizationId: org, contactIds: [roofer.id] })).resolves.toMatchObject({ queued: 0, costCents: 0 });
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "contractor", min_parcels: 3 }) })).toMatchObject({ count: 0, total: 0 });
    // Sent to Leads, the permit's phone goes along.
    const leadId = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: roofer.id });
    expect(await t.run(async (ctx) => ctx.db.get(leadId))).toMatchObject({ name: "Ray Soto", company: "West Texas Roofing LLC", phone: "4325550123", email: "ray@wtroofing.com" });
    // Upstream of the work: the landlord with several buildings, and the architect, with her number off the permit.
    const landlords = await pull({ who: "portfolio", min_parcels: 3 });
    expect(landlords.rows.map((r) => [r.name, r.property.address, r.properties, r.why])).toEqual([["Wadley Square Partners LP", "30 Wadley Av", 3, "Owns 3 commercial buildings, the biggest worth $800K"]]);
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "portfolio", min_parcels: 4 }) })).toMatchObject({ count: 0, total: 0 });
    const architects = await pull({ who: "designer" });
    expect(architects.rows.map((r) => [r.name, r.why])).toEqual([["Parkhill", "Applied for 2 commercial permits in the last 180 days, $62,000 of work; General Construction, Roofing"]]);
    expect(architects.rows[0]).toMatchObject({ person: { name: "Lee Ortiz", title: "Architect on a permit", source: "permits" }, phones: [{ number: "4325550199", source: "permits" }], emails: [{ email: "lortiz@parkhill.com", source: "permits" }], enrichment: { phone: { status: "found", chargedCents: 0 } } });
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "designer", trades: ["plumbing"] }) })).toMatchObject({ count: 0, total: 0 });
    // The tenants, newest arrival first on the preview, each with what its sources gave: the dentist's own phone off the permit, the person behind the boutique's sales-tax permit, the taqueria with its kind of business.
    const arrivals = await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "occupant" }) });
    expect(arrivals.rows.map((r) => [r.name, r.property.address, r.why])).toEqual([
      ["Desert Dental PLLC", "32 Wadley Av", "Moved into 32 Wadley Av Oct 2026, a space they don't own (named on a permit)"],
      ["Blue Door Boutique", "30 Wadley Av", "Moved into 30 Wadley Av Oct 2026, a space they don't own (certificate of occupancy, sales-tax permit); retail, run by Rivera Elena"],
      ["Taco Loco LLC", "31 Wadley Av", "Moved into 31 Wadley Av Sep 2026, a space they don't own (sales-tax permit); restaurant"],
    ]);
    const tenants = await pull({ who: "occupant" });
    expect(tenants.rows.map((r) => r.name)).toEqual(["Blue Door Boutique", "Desert Dental PLLC", "Taco Loco LLC"]);
    expect(tenants.rows[1]).toMatchObject({ person: { name: "Kim Pham", title: "Owner on a permit", source: "permits" }, phones: [{ number: "4325550155", source: "permits" }], enrichment: { phone: { status: "found", chargedCents: 0 } } });
    expect(tenants.rows[0]).toMatchObject({ person: { name: "Rivera Elena", title: "Sales-Tax Permit Holder on a permit", source: "permits" }, mailing: { city: "MIDLAND", zip: "79702" } });
    expect(tenants.rows[0].phones).toEqual([]);
    expect(await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "occupant", within_days: 30 }) })).toMatchObject({ count: 2, total: 2 });

    // Dorothy Hale goes to Leads today; tomorrow's records will find her lead.
    const haleLead = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId: held.rows[0].id });

    // ---- The next morning: the daily pass, without remaking the owners ----
    vi.setSystemTime(Date.parse("2026-11-06T07:00:00.000Z"));
    const buildOf = async (name: string) => t.run(async (ctx) => (await ctx.db.query("owners").filter((q) => q.eq(q.field("name"), name)).first())!.buildId);
    const weekly = await buildOf("Nuka Hiva LLC");
    await t.run(async (ctx) => {
      const stamp = "2026-11-06T06:45:00.000Z";
      // A new case on Dorothy Hale's home; the case on Nuka Hiva's came through the sync again, unchanged.
      await ctx.db.insert("signals", { county: "Midland", parcelId: ids["20"], address: "20 SPRUCE AV", kind: "code_violation", detail: "Deteriorated Structure", caseNumber: "C-3", date: "2026-11-04T12:00:00.000Z", sourceId: "code:3", importedAt: stamp });
      const repeat = (await ctx.db.query("signals").withIndex("by_source_id", (q) => q.eq("sourceId", "code:1")).unique())!;
      await ctx.db.patch(repeat._id, { importedAt: stamp });
      // A plumber's first permit; and Ghost Builders' one job on the roll is gone (as when the window moves past it).
      await ctx.db.insert("permits", { source: "midland", permitNumber: "P-6", name: "Residential - Building", workClass: "Alteration & Repair", county: "Midland", city: "Midland", appliedAt: "2026-11-05T16:00:00.000Z", address: "6 ELM ST", addressKey: addressKey("6 ELM ST"), trades: ["plumbing"], residential: true, importedAt: stamp, builder: "BASIN PLUMBING LLC", valuationCents: 450_000, contacts: [{ role: "Contractor", company: "Basin Plumbing LLC", person: "Gil Baca", phone: "432-555-0177" }] });
      const gone = (await ctx.db.query("permits").filter((q) => q.eq(q.field("permitNumber"), "P-5")).unique())!;
      await ctx.db.delete(gone._id);
    });
    const pass = await t.action(internal.outreachRefresh.refresh, {});
    await t.finishAllScheduledFunctions(() => {});
    // Two records read (one a repeat), five permit rows, two tenant sightings off permits and three outlets in the window; one owner given her case, the architect down a permit, one contractor new, the tenants unchanged.
    expect(pass).toEqual({ fetched: 12, added: 1, updated: 2, error: undefined });
    await t.run(async (ctx) => {
      const owners = await ctx.db.query("owners").collect();
      const facetsOfName = async (name: string) => {
        const o = owners.find((x) => x.name === name)!;
        return (await ctx.db.query("ownerFacets").withIndex("by_owner", (q) => q.eq("ownerId", o._id)).collect()).map((f) => f.facet).sort();
      };
      const hale = owners.find((o) => o.name === "Hale Dorothy")!;
      expect(hale.signals!.map((s) => [s.detail, s.date.slice(0, 10)])).toEqual([["Deteriorated Structure", "2026-11-04"]]);
      expect(hale.tops.signal!.address).toBe("20 SPRUCE AV");
      expect(await facetsOfName("Hale Dorothy")).toEqual(["homeowner", "long_owned", "violation"]);
      // The repeat changed nothing: Nuka Hiva's row is the weekly build's, untouched.
      const nuka = owners.find((o) => o.name === "Nuka Hiva LLC")!;
      expect(nuka.signals).toHaveLength(2);
      expect(nuka.buildId).toBe(weekly);
      expect(hale.buildId).not.toBe(weekly);
      expect(owners.filter((o) => o.kind === "contractor").map((o) => o.name).sort()).toEqual(["Basin Plumbing LLC", "West Texas Roofing LLC"]);
      expect(owners.find((o) => o.kind === "designer")).toMatchObject({ name: "Parkhill INC", parcels: 1 });
      // The build's facet counts moved with it, so whole-facet totals stay exact.
      const counts = (await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-owners")).unique())!.facetCounts!;
      expect(counts).toMatchObject({ violation: 2, stalled: 1, contractor: 2, designer: 1, occupant: 3 });
      expect(owners.filter((o) => o.kind === "occupant")).toHaveLength(3);
      expect((await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-owners-records")).unique())!).toMatchObject({ fetched: 12, added: 1, updated: 2 });
    });
    // Her lead hears about the new case: a dated line in its notes and the New signal tag, once.
    const told = (await t.run(async (ctx) => ctx.db.get(haleLead)))!;
    expect(told.notes!.split("\n").filter((l) => l.includes("new code violation"))).toEqual(["Nov 4: new code violation, Deteriorated Structure."]);
    expect(told.newSignal).toMatchObject({ kind: "code_violation", detail: "Deteriorated Structure", date: "2026-11-04T12:00:00.000Z" });
    // The list says what it has turned into, and the owner shows the lead's stage as it moves.
    const heldList = async () => (await co.as.query(api.outreach.lists, { organizationId: org })).find((l) => l.id === held.listId)!;
    const haleNow = async () => (await co.as.query(api.outreach.contacts, { organizationId: org, listId: held.listId })).rows[0];
    expect((await heldList()).results).toEqual({ sent: 1, estimates: 0, sold: 0 });
    expect((await haleNow()).leadStage).toBe("new");
    await co.as.mutation(api.leads.update, { id: haleLead, data: { status: "quoted" } });
    expect((await heldList()).results).toEqual({ sent: 1, estimates: 1, sold: 0 });
    await co.as.mutation(api.leads.update, { id: haleLead, data: { status: "won" } });
    expect((await heldList()).results).toEqual({ sent: 1, estimates: 1, sold: 1 });
    expect((await haleNow()).leadStage).toBe("won");

    // On the lists: the new case leads, newest first; the plumber is there to call; the preview's total is exact.
    const since = await co.as.query(api.outreach.preview, { organizationId: org, definition: definitionFromArgs({ who: "violation" }) });
    expect(since).toMatchObject({ count: 2, total: 2 });
    expect(since.rows.map((r) => [r.name, r.why])).toEqual([["Hale Dorothy", "Code violation Nov 2026: Deteriorated Structure"], ["Nuka Hiva LLC", "Code violation Sep 2026: Deteriorated Structure; 2 records since Jun 2026"]]);
    const plumbers = await pull({ who: "contractor", trades: ["plumbing"] });
    expect(plumbers.rows.map((r) => [r.name, r.property.address, r.phones])).toEqual([["Basin Plumbing LLC", "6 Elm St", [{ number: "4325550177", type: "unknown", source: "permits" }]]]);
    // Staff see the pass on the status line, once it has run since the build.
    expect(await co.as.query(api.outreach.status, {}).catch(() => "staff only")).toBe("staff only");
    // Nothing to do before the owners exist.
    await t.run(async (ctx) => { for (const s of await ctx.db.query("permitSources").collect()) await ctx.db.delete(s._id); });
    expect(await t.action(internal.outreachRefresh.refresh, {})).toEqual({ skipped: true, fetched: 0, added: 0, updated: 0 });
  });

  test("a big list opens with its first 50 owners at once and adds the rest in the background, saying so until it has", async () => {
    const t = setup();
    await addParcels(t, Array.from({ length: 120 }, (_, i) => parcel(`b${i}`, { owner: `OWNER ${i}`, marketValueCents: (i + 1) * 10_000_000 })));
    await rebuild(t);
    const co = await proCompany(t);
    const org = co.organizationId;
    const saved = await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "wealthy", minValueCents: 0 } });
    expect(saved).toMatchObject({ rowCount: 120, total: 120, added: 50 });
    const view = async () => (await co.as.query(api.outreach.lists, { organizationId: org })).find((l) => l.id === saved.listId)!;
    const count = async () => (await co.as.query(api.outreach.contacts, { organizationId: org, listId: saved.listId })).rows.length;
    expect(await view()).toMatchObject({ filling: true, rowCount: 50 });
    expect(await count()).toBe(50);
    // Loading more waits for the fill: the two would read the same owners.
    await expect(co.as.mutation(api.outreach.extend, { organizationId: org, listId: saved.listId })).rejects.toThrow(/Still adding owners/);
    await t.finishAllScheduledFunctions(() => {});
    expect(await view()).toMatchObject({ filling: false, rowCount: 120, total: 120 });
    expect(await count()).toBe(120);
  });

  test("a long facet is read top-down to the limit, and says so when it's cut", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    // 30 homes, $100K apart, then a 5-row list of the most valuable.
    await addParcels(t, Array.from({ length: 30 }, (_, i) => parcel(`h${i}`, { owner: `OWNER ${i}`, marketValueCents: (i + 1) * 10_000_000 })));
    await rebuild(t);
    const co = await proCompany(t);
    const top = await co.as.query(api.outreach.preview, { organizationId: co.organizationId, definition: { county: "Midland", who: "wealthy", minValueCents: 0, limit: 5 } });
    // The cap is never mistaken for the count: 5 load, 30 are reached.
    expect(top).toMatchObject({ count: 5, total: 30, limited: true, truncated: false });
    expect(top.rows.map((r) => r.property.valueCents)).toEqual([300_000_000, 290_000_000, 280_000_000, 270_000_000, 260_000_000]);
    // A floor stops the read early rather than scanning on.
    expect(await co.as.query(api.outreach.preview, { organizationId: co.organizationId, definition: { county: "Midland", who: "wealthy", minValueCents: 285_000_000 } })).toMatchObject({ count: 2, total: 2 });
    // Saved, the list holds the first page and knows the total; each Load the next adds the following page in the same order, until there are none left.
    const org = co.organizationId;
    const def = { county: "Midland", who: "wealthy" as const, minValueCents: 0, limit: 5 };
    const saved = await co.as.mutation(api.outreach.create, { organizationId: org, definition: def });
    expect(saved).toMatchObject({ rowCount: 5, total: 30, added: 5, limited: true });
    const read = async () => await co.as.query(api.outreach.contacts, { organizationId: org, listId: saved.listId });
    // The table keeps the list's own order (highest value first here), not the alphabet.
    expect((await read()).rows.map((r) => r.property.valueCents)).toEqual([300_000_000, 290_000_000, 280_000_000, 270_000_000, 260_000_000]);
    expect(await co.as.mutation(api.outreach.extend, { organizationId: org, listId: saved.listId })).toEqual({ loaded: 5, added: 5, rowCount: 10, total: 30, truncated: false });
    const ten = (await read()).rows.map((r) => r.property.valueCents);
    expect(ten).toHaveLength(10);
    expect(ten[9]).toBe(210_000_000);
    // Investors come biggest holder first, whatever their names.
    expect(listOrder({ county: "Midland", who: "investor" }).label).toBe("most properties first");
    const byHoldings = [
      { properties: 3, totalValueCents: 50_000_000, property: { valueCents: 90_000_000 } },
      { properties: 54, totalValueCents: 1_200_000_000, property: { valueCents: 34_500_000 } },
      { properties: 3, totalValueCents: 80_000_000, property: { valueCents: 10_000_000 } },
    ].sort((a, b) => listOrder({ county: "Midland", who: "investor" }).key(b) - listOrder({ county: "Midland", who: "investor" }).key(a));
    expect(byHoldings.map((r) => r.properties)).toEqual([54, 3, 3]);
    expect(byHoldings[1].totalValueCents).toBe(80_000_000);
    const lists = await co.as.query(api.outreach.lists, { organizationId: org });
    expect(lists.find((l) => l.id === saved.listId)).toMatchObject({ rowCount: 10, total: 30, truncated: false });
    for (let i = 0; i < 4; i++) await co.as.mutation(api.outreach.extend, { organizationId: org, listId: saved.listId });
    expect((await read()).rows).toHaveLength(30);
    expect(await co.as.mutation(api.outreach.extend, { organizationId: org, listId: saved.listId })).toEqual({ loaded: 0, added: 0, rowCount: 30, total: 30, truncated: false });
    // A bigger list opens with its first 50 at once; the rest land in the background, a page at a time, and it says so until they have.
    const all = await co.as.mutation(api.outreach.create, { organizationId: org, definition: { county: "Midland", who: "wealthy", minValueCents: 0 }, title: "Every home" });
    expect(all).toMatchObject({ rowCount: 30, total: 30 });
    expect((await co.as.query(api.outreach.lists, { organizationId: org })).find((l) => l.id === all.listId)).toMatchObject({ filling: false, rowCount: 30 });
    // An owner already on another list is tagged, not duplicated.
    await co.as.mutation(api.outreach.create, { organizationId: org, definition: { ...def, limit: 3 } });
    expect((await co.as.query(api.outreach.contacts, { organizationId: org })).rows).toHaveLength(30);
    await expect(co.as.mutation(api.outreach.extend, { organizationId: org, listId: "k17abcdefghijklmnopqrstuvwxyz0" as never })).rejects.toThrow();
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

describe("the deliverability check", () => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const found = (...emails: string[]) => emails.map((email) => ({ email, source: "batchdata" }));

  test("marks deliverable addresses verified, drops dead ones, keeps catch-all and unknown, and checks at most three", async () => {
    const asked: string[] = [];
    const checker = zeroBounce("zb-key", async (url) => {
      const email = decodeURIComponent(String(url).split("&email=")[1].split("&")[0]);
      asked.push(email);
      const status = email.startsWith("dead") ? "invalid" : email.startsWith("trap") ? "spamtrap" : email.startsWith("any") ? "catch-all" : email.startsWith("good") ? "valid" : "unknown";
      return json({ address: email, status, sub_status: "" });
    });
    const r = await checkEmails(found("good@a.example", "dead@a.example", "any@b.example", "good2@c.example"), checker);
    expect(asked).toEqual(["good@a.example", "dead@a.example", "any@b.example"]);
    expect(r.emails).toEqual([
      { email: "good@a.example", source: "batchdata", verified: true },
      { email: "any@b.example", source: "batchdata" },
      { email: "good2@c.example", source: "batchdata" },
    ]);
    expect(r.try).toEqual({ source: "zerobounce", outcome: "hit", note: "1 of 3 deliverable · 1 dropped" });
    expect((await checkEmails(found("trap@a.example"), checker)).try).toEqual({ source: "zerobounce", outcome: "miss", note: "0 of 1 deliverable · 1 dropped" });
  });

  test("no key, nothing to check, or an error from the checker: the emails stay as found and the ledger says why", async () => {
    expect(await checkEmails(found("x@a.example"), zeroBounce(undefined))).toEqual({ emails: found("x@a.example"), try: { source: "zerobounce", outcome: "skipped", note: "Not connected" } });
    expect((await checkEmails([], zeroBounce("k"))).try).toEqual({ source: "zerobounce", outcome: "skipped", note: "Nothing to check" });
    const broke = zeroBounce("k", async () => json({ error: "Invalid API key or your account ran out of credits" }));
    expect(await checkEmails(found("x@a.example"), broke)).toEqual({ emails: found("x@a.example"), try: { source: "zerobounce", outcome: "error", note: "ZeroBounce: Invalid API key or your account ran out of credits" } });
    const down = zeroBounce("k", async () => json({}, 503));
    expect((await checkEmails(found("x@a.example"), down)).try).toEqual({ source: "zerobounce", outcome: "error", note: "ZeroBounce: HTTP 503" });
  });
});

describe("the wider stack", () => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const company: TraceInput = {
    name: "Oak Plaza LLC",
    company: "Oak Plaza LLC",
    property: { address: "12 Midkiff Rd", city: "Midland", state: "TX" },
    mailing: { address: "1 MAIN ST", city: "DALLAS", state: "TX", zip: "75201" },
  };
  const outOfState: TraceInput = { ...company, name: "Pine Holdings LLC", company: "Pine Holdings LLC", mailing: { address: "9 ELM ST", city: "DENVER", state: "CO", zip: "80202" } };

  test("Cobalt asks the mailing state's registry, waits out a slow state, and names the officer who runs it, or a registered agent who is a person", async () => {
    const urls: string[] = [];
    const waits: number[] = [];
    let slow = true;
    const source = cobaltSos(
      "cb-key",
      async (url, init) => {
        urls.push(String(url));
        expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("cb-key");
        if (String(url).includes("retryId=") || !slow) {
          return json({
            status: "complete",
            results: [
              { title: "PINE HOLDINGS LLC", officers: [{ name: "CT CORPORATION SYSTEM", title: "AGENT" }, { name: "JANE PINE", title: "MANAGING MEMBER", address: "9 Elm St, Denver, CO 80202" }, { name: "AL PINE", title: "MEMBER" }] },
              { title: "PINE HOLDINGS II LLC", officers: [{ name: "BOB WRONG", title: "MANAGER" }] },
            ],
          });
        }
        return json({ status: "pending", results: [], retryId: "retry_1" });
      },
      "https://cobalt.example",
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(await source.trace(outOfState)).toEqual({ person: { name: "Jane Pine", title: "Managing Member", address: "9 Elm St, Denver, CO 80202", source: "cobalt" } });
    expect(urls).toEqual(["https://cobalt.example/v1/search?searchQuery=Pine%20Holdings%20LLC&state=colorado", "https://cobalt.example/v1/search?retryId=retry_1&state=colorado"]);
    expect(waits).toEqual([5000]);
    // Only an agent listed, and a person: they stand in. An agent that is a company doesn't.
    slow = false;
    const agentOnly = cobaltSos("cb-key", async () => json({ status: "complete", results: [{ title: "X LLC", officers: [], registeredAgent: { name: "Sam Agent", address: "1 Oak St" } }] }));
    expect(await agentOnly.trace(company)).toEqual({ person: { name: "Sam Agent", title: "Registered Agent", address: "1 Oak St", source: "cobalt" } });
    const firmAgent = cobaltSos("cb-key", async () => json({ status: "complete", results: [{ title: "X LLC", officers: [], registeredAgent: { name: "CT Corporation System" } }] }));
    expect(await firmAgent.trace(company)).toEqual({});
    expect(await cobaltSos("cb-key", async () => json({ status: "complete", results: [] })).trace(company)).toEqual({});
    await expect(cobaltSos("cb-key", async () => json({}, 429)).trace(company)).rejects.toThrow("Cobalt: HTTP 429");
    expect(await cobaltSos("cb-key").trace({ ...company, company: undefined })).toEqual({});
    // A registry still searching when we stop asking is an error that says so, not a miss: a retry asks again.
    const stuckWaits: number[] = [];
    const stuck = cobaltSos("cb-key", async () => json({ status: "pending", results: [], retryId: "retry_9" }), "https://cobalt.example", async (ms) => void stuckWaits.push(ms));
    await expect(stuck.trace(outOfState)).rejects.toThrow("Cobalt: the Colorado registry was still searching after 20 seconds");
    expect(stuckWaits).toEqual([5000, 5000, 5000, 5000]);
  });

  test("a guarded fetch gives up on a call that hangs, tries once more after a rate limit, a server error or a dropped connection, and honors a short retry-after", async () => {
    const waits: number[] = [];
    const wait = async (ms: number) => void waits.push(ms);
    // A vendor that never answers: an error after the time limit, and no second try (it would hold the lookup twice as long).
    const hung = guarded(((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch, 50, wait);
    await expect(hung("https://slow.example")).rejects.toThrow(/No answer after \d+ seconds/);
    expect(waits).toEqual([]);
    // Rate limited with a Retry-After: one wait of that long, then the answer.
    let calls = 0;
    const limited = guarded(async () => (++calls === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "2" } }) : json({ ok: true })), 50, wait);
    expect((await limited("https://x.example")).status).toBe(200);
    expect([calls, waits]).toEqual([2, [2000]]);
    // Tracerfy's way of saying it (in the body), capped at five seconds.
    calls = 0;
    waits.length = 0;
    const bodyWait = guarded(async () => (++calls === 1 ? json({ error: "Rate limited", retry_after_seconds: 60 }, 429) : json({ ok: true })), 50, wait);
    expect((await bodyWait("https://x.example")).status).toBe(200);
    expect(waits).toEqual([5000]);
    // A server error with no hint: a second's wait. A second failure stands.
    waits.length = 0;
    const down = guarded(async () => json({}, 503), 50, wait);
    expect((await down("https://x.example")).status).toBe(503);
    expect(waits).toEqual([1000]);
    // A dropped connection: one more try.
    calls = 0;
    waits.length = 0;
    const flaky = guarded(async () => {
      if (++calls === 1) throw new TypeError("fetch failed");
      return json({ ok: true });
    }, 50, wait);
    expect((await flaky("https://x.example")).status).toBe(200);
    expect([calls, waits]).toEqual([2, [1000]]);
    // A POST is a paid trace the vendor may already have run: never sent twice after a server error or a dropped connection, only after a rate limit.
    calls = 0;
    waits.length = 0;
    const paidDown = guarded(async () => (calls++, json({}, 503)), 50, wait);
    expect((await paidDown("https://x.example", { method: "POST", body: "{}" })).status).toBe(503);
    expect([calls, waits]).toEqual([1, []]);
    calls = 0;
    const paidDropped = guarded(async () => {
      calls++;
      throw new TypeError("fetch failed");
    }, 50, wait);
    await expect(paidDropped("https://x.example", { method: "POST", body: "{}" })).rejects.toThrow("fetch failed");
    expect([calls, waits]).toEqual([1, []]);
    calls = 0;
    const paidLimited = guarded(async () => (++calls === 1 ? json({}, 429) : json({ ok: true })), 50, wait);
    expect((await paidLimited("https://x.example", { method: "POST", body: "{}" })).status).toBe(200);
    expect([calls, waits]).toEqual([2, [1000]]);
    // Headers arrive and the body stalls: the same clock covers both, so the call still ends with no answer.
    waits.length = 0;
    const stalled = guarded(
      (async (_url: RequestInfo | URL, init?: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init!.signal!.addEventListener("abort", () => controller.error(new Error("aborted")));
            },
          }),
          { status: 200 },
        )) as typeof fetch,
      50,
      wait,
    );
    await expect(stalled("https://slow.example")).rejects.toThrow(/No answer after \d+ seconds/);
    expect(waits).toEqual([]);
    // A refused key isn't retried: it won't change in a second.
    calls = 0;
    waits.length = 0;
    const refused = guarded(async () => (calls++, json({}, 401)), 50, wait);
    expect((await refused("https://x.example")).status).toBe(401);
    expect([calls, waits]).toEqual([1, []]);
  });

  test("EnformionGO traces a named person at their mailing address: connected lines score higher; a company with nobody named is skipped", async () => {
    let sent: Record<string, unknown> = {};
    const source = enformion("ap-name", "ap-pass", async (url, init) => {
      expect(String(url)).toBe("https://devapi.enformion.com/Contact/Enrich");
      const h = init?.headers as Record<string, string>;
      expect([h["galaxy-ap-name"], h["galaxy-ap-password"], h["galaxy-search-type"]]).toEqual(["ap-name", "ap-pass", "DevAPIContactEnrich"]);
      sent = JSON.parse(init?.body as string);
      return json({
        isError: false,
        person: {
          phones: [
            { number: "(432) 555-0142", type: "Mobile", isConnected: true },
            { number: "432-555-0199", type: "Landline", isConnected: false },
          ],
          emails: [{ email: "Dana@Reyes.example", isValidated: true, isBusiness: false }],
        },
      });
    });
    const named = { ...company, person: { name: "Dana Reyes", title: "Manager", source: "tx-comptroller" } };
    expect(source.applies?.(named)).toBeUndefined();
    expect(source.applies?.(company)).toBe("Needs a person's name");
    expect(await source.trace(named)).toEqual({
      phones: [
        { number: "(432) 555-0142", type: "mobile", line: "personal", verified: true, score: 80, source: "enformion" },
        { number: "432-555-0199", type: "landline", line: "personal", score: 20, source: "enformion" },
      ],
      emails: [{ email: "Dana@Reyes.example", source: "enformion" }],
    });
    expect(sent).toEqual({ FirstName: "Dana", LastName: "Reyes", Address: { addressLine1: "1 MAIN ST", addressLine2: "DALLAS, TX 75201" } });
    // A person from the roll ("VANCE ROBERT & LINDA") is traced at the property when the roll has no mailing address.
    const vance: TraceInput = { name: "VANCE ROBERT & LINDA", property: { address: "1 Spruce Av", city: "Midland", state: "TX" }, mailing: {} };
    await source.trace(vance);
    expect(sent).toEqual({ FirstName: "Robert", LastName: "Vance", Address: { addressLine1: "1 Spruce Av", addressLine2: "Midland, TX" } });
    const refused = enformion("a", "b", async () => json({ isError: true, error: { inputErrors: [], warnings: ["Not enough criteria"] } }));
    await expect(refused.trace(named)).rejects.toThrow("EnformionGO: Not enough criteria");
    expect(enformion("a", undefined).connected).toBe(false);
  });

  test("Hunter finds a work email for the person behind a company, from the company's name; it needs both, and a miss costs nothing", async () => {
    const urls: string[] = [];
    const source = hunter("h-key", async (url) => {
      urls.push(String(url));
      return json({ data: { email: "dana@oakplaza.com", score: 92, verification: { status: "valid" } } });
    });
    const named = { ...company, person: { name: "Dana Reyes", source: "tx-comptroller" } };
    expect(source.applies?.(named)).toBeUndefined();
    expect(source.applies?.(company)).toBe("Needs a named person at a company");
    expect(source.applies?.({ ...named, company: undefined })).toBe("Needs a named person at a company");
    expect(await source.trace(named)).toEqual({ emails: [{ email: "dana@oakplaza.com", source: "hunter", verified: true }] });
    expect(urls).toEqual(["https://api.hunter.io/v2/email-finder?company=Oak%20Plaza%20LLC&first_name=Dana&last_name=Reyes&api_key=h-key"]);
    expect(await hunter("h-key", async () => json({ data: { email: null, score: null } })).trace(named)).toEqual({});
    expect(await hunter("h-key", async () => json({ errors: [{ id: "not_found" }] }, 404)).trace(named)).toEqual({});
    await expect(hunter("h-key", async () => json({ errors: [{ id: "usage_limit", details: "You have reached your usage limit." }] }, 429)).trace(named)).rejects.toThrow("Hunter: HTTP 429 (You have reached your usage limit.)");
  });

  test("the line check drops dead numbers, takes the carrier's line type and name, and says how many are in the owner's name", async () => {
    const checker = twilioLookup("AC1", "tok", async (url) => {
      const number = decodeURIComponent(String(url).split("/PhoneNumbers/")[1].split("?")[0]);
      if (number === "+14325550000") return json({ code: 20404 }, 404);
      if (number === "+14325550199") return json({ valid: true, line_type_intelligence: { type: "landline" }, caller_name: { caller_name: "OAK PLAZA LLC", caller_type: "BUSINESS" } });
      return json({ valid: true, line_type_intelligence: { type: "nonFixedVoip" }, caller_name: { caller_name: null } });
    });
    const phones = [
      { number: "4325550142", type: "unknown" as const, source: "batchdata" },
      { number: "4325550000", type: "mobile" as const, source: "batchdata" },
      { number: "4325550199", type: "unknown" as const, score: 60, source: "batchdata" },
    ];
    const expected = expectedNames({ name: "OAK PLAZA LLC", company: "Oak Plaza LLC", person: { name: "Dana Reyes", source: "x" } });
    expect(expected).toEqual(["REYES", "PLAZA"]);
    const r = await checkPhones(phones, checker, expected);
    expect(r.phones).toEqual([
      { number: "4325550199", type: "landline", line: "work", score: 100, verified: true, source: "batchdata", name: "OAK PLAZA LLC" },
      { number: "4325550142", type: "voip", verified: true, source: "batchdata" },
    ]);
    expect(r.try).toEqual({ source: "twilio", outcome: "hit", note: "2 of 3 live · 1 in the owner's name · 1 dropped · 1 work" });
    expect((await checkPhones(phones, twilioLookup(undefined, undefined), expected)).try).toEqual({ source: "twilio", outcome: "skipped", note: "Not connected" });
    const down = twilioLookup("AC1", "tok", async () => json({}, 503));
    expect(await checkPhones(phones, down, expected)).toEqual({ phones, try: { source: "twilio", outcome: "error", note: "Twilio: HTTP 503" } });
    expect(expectedNames({ name: "VANCE ROBERT & LINDA" })).toEqual(["VANCE"]);
  });

  test("Trestle grades each line for reaching this person, says whether the name matches, flags a litigator, and hands over to the carrier when it's down", async () => {
    const urls: string[] = [];
    const trestle = trestleRealContact("tr-key", async (url, init) => {
      urls.push(String(url));
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("tr-key");
      const phone = new URL(String(url)).searchParams.get("phone");
      if (phone === "4325550000") return json({ phone: { contact_grade: "F", is_valid: false, activity_score: 5, line_type: "Landline", name_match: false }, add_ons: { litigator_checks: { phone_is_litigator_risk: false } } });
      if (phone === "4325550199") return json({ phone: { contact_grade: "C", is_valid: true, activity_score: 55, line_type: "Landline", name_match: false }, add_ons: { litigator_checks: { phone_is_litigator_risk: true } } });
      return json({ phone: { contact_grade: "A", is_valid: true, activity_score: 92, line_type: "Mobile", name_match: true }, add_ons: { litigator_checks: { phone_is_litigator_risk: false } } });
    });
    const phones = [
      { number: "4325550142", type: "unknown" as const, source: "batchdata" },
      { number: "4325550000", type: "mobile" as const, source: "batchdata" },
      { number: "4325550199", type: "unknown" as const, source: "batchdata" },
    ];
    const who = lineOwner({ name: "OAK PLAZA LLC", company: "Oak Plaza LLC", person: { name: "Dana Reyes", source: "x" } });
    expect(who).toEqual({ name: "Dana Reyes", business: "Oak Plaza LLC" });
    expect(lineOwner({ name: "VANCE ROBERT & LINDA" })).toEqual({ name: "Robert Vance" });
    expect(lineOwner({ name: "OAK PLAZA LLC", company: "Oak Plaza LLC" })).toEqual({ name: "Oak Plaza LLC", business: "Oak Plaza LLC" });
    const r = await checkPhones(phones, trestle, ["REYES", "PLAZA"], who);
    // The dead line is dropped; the matched mobile leads at 100; the litigator's landline is kept, flagged, graded C.
    expect(r.phones).toEqual([
      { number: "4325550142", type: "mobile", line: "personal", verified: true, score: 100, grade: "A", source: "batchdata" },
      { number: "4325550199", type: "landline", verified: true, score: 60, grade: "C", litigator: true, source: "batchdata" },
    ]);
    expect(r.try).toEqual({ source: "trestle", outcome: "hit", note: "2 of 3 live · 1 in the owner's name · 1 dropped · 1 personal · 1 known litigator" });
    expect(urls[0]).toBe("https://api.trestleiq.com/2.0/real_contact?name=Dana+Reyes&phone=4325550142&add_ons=litigator_checks&business.name=Oak+Plaza+LLC");
    // The checkers in order: Trestle answers and the carrier isn't needed; Trestle down, the carrier takes over; neither connected, both say so.
    const twilio = twilioLookup("AC1", "tok", async () => json({ valid: true, line_type_intelligence: { type: "mobile" }, caller_name: { caller_name: "REYES DANA" } }));
    const both = await checkPhonesWith(phones, [trestle, twilio], ["REYES"], who);
    expect(both.tries.map((t) => [t.source, t.outcome, t.note])).toEqual([
      ["trestle", "hit", "2 of 3 live · 1 in the owner's name · 1 dropped · 1 personal · 1 known litigator"],
      ["twilio", "skipped", "Not needed, already checked"],
    ]);
    const down = trestleRealContact("tr-key", async () => json({}, 503));
    const fallen = await checkPhonesWith(phones, [down, twilio], ["REYES"], who);
    expect(fallen.tries.map((t) => [t.source, t.outcome, t.note])).toEqual([
      ["trestle", "error", "Trestle: HTTP 503"],
      ["twilio", "hit", "3 of 3 live · 3 in the owner's name · 3 personal"],
    ]);
    // The carrier's name on the line is hers, so each is her own line.
    expect(fallen.phones.every((p) => p.verified && p.name === "REYES DANA" && p.line === "personal")).toBe(true);
    const none = await checkPhonesWith(phones, [trestleRealContact(undefined), twilioLookup(undefined, undefined)], ["REYES"], who);
    expect(none.phones).toEqual(phones);
    expect(none.tries).toEqual([
      { source: "trestle", outcome: "skipped", note: "Not connected" },
      { source: "twilio", outcome: "skipped", note: "Not connected" },
    ]);
    // A refused key reads as one that needs attention.
    await expect(trestleRealContact("bad", async () => json({ errorCode: "AUTHENTICATION_FAILED" }, 403)).check("4325550142", who)).rejects.toThrow("Trestle: HTTP 403");
    // Nothing said about a number: it is left as it was, neither live nor dropped, and the ledger counts it unchecked.
    const quiet = trestleRealContact("tr-key", async (url) => (new URL(String(url)).searchParams.get("phone") === "4325550000" ? json({ phone: null, add_ons: null }) : json({ phone: { contact_grade: "B", is_valid: true, line_type: "Mobile", name_match: false } })));
    const partly = await checkPhones(phones, quiet, ["REYES"], who);
    expect(partly.phones).toEqual([
      { number: "4325550142", type: "mobile", verified: true, score: 80, grade: "B", source: "batchdata" },
      { number: "4325550199", type: "mobile", verified: true, score: 80, grade: "B", source: "batchdata" },
      { number: "4325550000", type: "mobile", source: "batchdata" },
    ]);
    expect(partly.try).toEqual({ source: "trestle", outcome: "hit", note: "2 of 2 live · 1 unchecked" });
    // Nothing on any of them: an error, so the carrier gets its turn.
    const mute = trestleRealContact("tr-key", async () => json({ phone: null }));
    const handed = await checkPhonesWith(phones, [mute, twilio], ["REYES"], who);
    expect(handed.tries.map((t) => [t.source, t.outcome, t.note])).toEqual([
      ["trestle", "error", "Nothing on any of the numbers"],
      ["twilio", "hit", "3 of 3 live · 3 in the owner's name · 3 personal"],
    ]);
    // An email sent along rides on the first call only, and comes back with whose it is; it's kept either way, with the ledger saying.
    const emailed: Array<string | null> = [];
    const withEmail = trestleRealContact("tr-key", async (url) => {
      emailed.push(new URL(String(url)).searchParams.get("email"));
      return json({ phone: { contact_grade: "A", is_valid: true, line_type: "Mobile", name_match: true }, email: emailed.length === 1 ? { contact_grade: "F", is_valid: true, name_match: false } : null });
    });
    const ride = await checkPhonesWith(phones, [withEmail], ["REYES"], who, "dana@oakplaza.com");
    expect(emailed).toEqual(["dana@oakplaza.com", null, null]);
    expect(ride.email).toEqual({ valid: true, nameMatch: false, grade: "F", source: "trestle" });
    const marked = applyEmailCheck([{ email: "dana@oakplaza.com", source: "batchdata" }, { email: "other@x.example", source: "batchdata" }], "Dana@OakPlaza.com", ride.email!);
    expect(marked.emails).toEqual([{ email: "dana@oakplaza.com", source: "batchdata", nameMatch: false, grade: "F" }, { email: "other@x.example", source: "batchdata" }]);
    expect(marked.try).toEqual({ source: "trestle", outcome: "miss", note: "Not in the owner's name · grade F" });
    expect(applyEmailCheck([{ email: "a@b.example", source: "x" }], "a@b.example", { source: "trestle" }).try).toEqual({ source: "trestle", outcome: "miss", note: "Couldn't say whose it is" });
    // No email sent: nothing comes back about one.
    expect((await checkPhonesWith(phones, [withEmail], ["REYES"], who)).email).toBeUndefined();
  });

  test("LeadMagic finds a work email from the person's name and the company's, after Hunter; a miss or an address on another company's domain is nothing, and a refused key says so", async () => {
    const bodies: unknown[] = [];
    const source = leadMagic("lm-key", async (url, init) => {
      expect(String(url)).toBe("https://api.leadmagic.io/v1/people/email-finder");
      expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe("lm-key");
      bodies.push(JSON.parse(init!.body as string));
      return json({ email: "dana@oakplaza.com", status: "valid", credits_consumed: 1, message: "Email found", first_name: "Dana", last_name: "Reyes", domain: "oakplaza.com", employment_verified: true });
    });
    const named = { ...company, person: { name: "Dana Reyes", source: "tx-comptroller" } };
    expect(await source.trace(named)).toEqual({ emails: [{ email: "dana@oakplaza.com", source: "leadmagic", verified: true }] });
    expect(bodies).toEqual([{ first_name: "Dana", last_name: "Reyes", company_name: "Oak Plaza LLC" }]);
    // Nobody named yet, or a person who isn't at a company: not asked, and the ledger says why.
    expect(source.applies!(company)).toBe("Needs a named person at a company");
    expect(source.applies!({ ...named, company: undefined })).toBe("Needs a named person at a company");
    expect(source.applies!(named)).toBeUndefined();
    // A miss is free and empty; an address on some other company's domain doesn't count.
    expect(await leadMagic("lm-key", async () => json({ email: null, status: null, credits_consumed: 0, message: "No email found" })).trace(named)).toEqual({});
    expect(await leadMagic("lm-key", async () => json({ email: "dana@gmail.com", status: "valid", credits_consumed: 1, domain_mismatch: true, requested_domain: "oakplaza.com" })).trace(named)).toEqual({});
    await expect(leadMagic("bad", async () => json({ message: "Invalid API key" }, 401)).trace(named)).rejects.toThrow("LeadMagic: HTTP 401 (Invalid API key)");
    expect(leadMagic(undefined).connected).toBe(false);
    // Last in the email chain, after Hunter.
    const [email] = await waterfall(named, [hunter("h-key", async () => json({ data: { email: null } })), source], ["email"]);
    expect(email.source).toBe("leadmagic");
    expect(email.tries).toEqual([
      { source: "hunter", outcome: "miss", note: "No match" },
      { source: "leadmagic", outcome: "hit", note: "1 email" },
    ]);
  });

  test("personal or work: the carrier's business flag settles it, else the name on the line; a skip trace's numbers are personal and a permit's is work until the carrier says otherwise", () => {
    const dana = { name: "Dana Reyes", business: "Oak Plaza LLC" };
    const oak = { name: "Oak Plaza LLC", business: "Oak Plaza LLC" };
    const vance = { name: "Robert Vance" };
    // The carrier's word first.
    expect(lineFrom({ business: true, name: "REYES DANA" }, dana)).toBe("work");
    expect(lineFrom({ business: false, name: "OAK PLAZA LLC" }, dana)).toBe("personal");
    // Then whose name is on the line: the company's words make it a work line, the person's surname their own.
    expect(lineFrom({ name: "OAK PLAZA LLC" }, dana)).toBe("work");
    expect(lineFrom({ name: "REYES DANA" }, dana)).toBe("personal");
    expect(lineFrom({ name: "VANCE ROBERT" }, vance)).toBe("personal");
    expect(lineFrom({ name: "SMITH JOHN" }, dana)).toBeUndefined();
    // A match with no name (Trestle): the person's line, or the company's when the company is who was asked about.
    expect(lineFrom({ nameMatch: true }, dana)).toBe("personal");
    expect(lineFrom({ nameMatch: true }, vance)).toBe("personal");
    expect(lineFrom({ nameMatch: true }, oak)).toBe("work");
    expect(lineFrom({ nameMatch: false }, dana)).toBeUndefined();
    expect(lineFrom({}, dana)).toBeUndefined();
    // Nothing said leaves the source's word; the carrier's word replaces it.
    const found = [
      { number: "4325550100", type: "unknown" as const, line: "work" as const, source: "permits" },
      { number: "4325550142", type: "mobile" as const, line: "personal" as const, source: "batchdata" },
      { number: "4325550199", type: "mobile" as const, line: "personal" as const, source: "batchdata" },
    ];
    const carrier = twilioLookup("AC1", "tok", async (url) => {
      const number = decodeURIComponent(String(url).split("/PhoneNumbers/")[1].split("?")[0]);
      if (number === "+14325550100") return json({ valid: true, line_type_intelligence: { type: "mobile" }, caller_name: { caller_name: "REYES DANA", caller_type: "CONSUMER" } });
      if (number === "+14325550142") return json({ valid: true, line_type_intelligence: { type: "fixedVoip" }, caller_name: { caller_name: "OAK PLAZA LLC", caller_type: "BUSINESS" } });
      return json({ valid: true, line_type_intelligence: { type: "mobile" }, caller_name: { caller_name: null, caller_type: null } });
    });
    return checkPhones(found, carrier, ["REYES", "PLAZA"], dana).then((r) => {
      expect(r.phones.map((p) => [p.number, p.type, p.line])).toEqual([
        ["4325550100", "mobile", "personal"],
        ["4325550142", "voip", "work"],
        ["4325550199", "mobile", "personal"],
      ]);
      // The ledger counts what the carrier said; the third keeps the skip trace's word without being counted.
      expect(r.try.note).toBe("3 of 3 live · 2 in the owner's name · 1 personal, 1 work");
    });
  });

  test("LeadMagic's mobile finder works from an email the lookup has, a work one first, after the skip traces; it doesn't count as a phone source on its own", async () => {
    const bodies: unknown[] = [];
    const source = leadMagicMobile("lm-key", async (url, init) => {
      expect(String(url)).toBe("https://api.leadmagic.io/v1/people/mobile-finder");
      expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe("lm-key");
      bodies.push(JSON.parse(init!.body as string));
      return json({ profile_url: null, email: "dana@oakplaza.com", mobile_number: "+1-432-555-0142", credits_consumed: 5, message: "Mobile number found." });
    });
    const named = { ...company, person: { name: "Dana Reyes", source: "tx-comptroller" } };
    // Nothing to key off: not asked, and the ledger says why.
    expect(source.applies!(named)).toBe("Needs an email to find the mobile by");
    expect(source.applies!({ ...named, emails: ["dana@gmail.com"] })).toBeUndefined();
    // The work address over the free-mail one; the number comes back as ten digits, a personal mobile.
    expect(await source.trace({ ...named, emails: ["dana@gmail.com", "Dana@OakPlaza.com"] })).toEqual({ phones: [{ number: "4325550142", type: "mobile", line: "personal", source: "leadmagic-mobile" }] });
    expect(bodies).toEqual([{ work_email: "dana@oakplaza.com" }]);
    // Only a free-mail address: sent as the personal one.
    await source.trace({ ...named, emails: ["dana@gmail.com"] });
    expect(bodies[1]).toEqual({ personal_email: "dana@gmail.com" });
    // A miss is free and empty; a refused key says so.
    expect(await leadMagicMobile("lm-key", async () => json({ mobile_number: null, credits_consumed: 0, message: "No mobile number found for this contact." })).trace({ ...named, emails: ["dana@oakplaza.com"] })).toEqual({});
    await expect(leadMagicMobile("bad", async () => json({ message: "Invalid API key" }, 401)).trace({ ...named, emails: ["dana@oakplaza.com"] })).rejects.toThrow("LeadMagic: HTTP 401 (Invalid API key)");
    expect(leadMagicMobile(undefined).connected).toBe(false);
    // In the stack after EnformionGO, and a follow-up: with only its key set, the phone has no source of its own.
    const stack = vendors({ LEADMAGIC_API_KEY: "lm-key" });
    expect(stack.map((v) => v.name)).toEqual(["tx-comptroller", "cobalt", "batchdata", "tracerfy", "enformion", "leadmagic-mobile", "hunter", "leadmagic"]);
    expect(stack.filter((v) => standsAlone(v, "phone")).map((v) => v.name)).toEqual([]);
    expect(stack.filter((v) => standsAlone(v, "email")).map((v) => v.name)).toEqual(["leadmagic"]);
    expect(vendors({ LEADMAGIC_API_KEY: "lm-key", BATCHDATA_API_KEY: "bd" }).filter((v) => standsAlone(v, "phone")).map((v) => v.name)).toEqual(["batchdata"]);
    // In one lookup the email step runs first, and the mobile finder keys off what it found; the outcomes still read person, phone, email.
    const asked: string[] = [];
    const skipTrace = { name: "batchdata", fields: ["phone" as const, "email" as const], connected: true, trace: async () => (asked.push("batchdata"), {}) };
    const finder = hunter("h-key", async () => (asked.push("hunter"), json({ data: { email: "dana@oakplaza.com", verification: { status: "valid" } } })));
    const mobile = leadMagicMobile("lm-key", async (_url, init) => (asked.push(`mobile:${(JSON.parse(init!.body as string) as { work_email: string }).work_email}`), json({ mobile_number: "4325550142" })));
    const outcomes = await waterfall(named, [skipTrace, mobile, finder], ["phone", "email"]);
    expect(outcomes.map((o) => [o.field, o.source])).toEqual([
      ["phone", "leadmagic-mobile"],
      ["email", "hunter"],
    ]);
    expect(asked).toEqual(["batchdata", "hunter", "mobile:dana@oakplaza.com"]);
    expect(outcomes[0].tries).toEqual([
      { source: "batchdata", outcome: "miss", note: "No match" },
      { source: "leadmagic-mobile", outcome: "hit", note: "1 number" },
    ]);
    // Asked for the phone alone with no address on file, it stands aside and says so.
    const [alone] = await waterfall(named, [skipTrace, mobile], ["phone"]);
    expect(alone.tries[1]).toEqual({ source: "leadmagic-mobile", outcome: "skipped", note: "Needs an email to find the mobile by" });
  });

  test("the Do Not Call scrub flags listed numbers and known litigators, drops nothing, and says how many are clear", async () => {
    const bodies: unknown[] = [];
    const scrub = tracerfyDnc("tf-key", async (url, init) => {
      expect(String(url)).toBe("https://www.tracerfy.com/v2/api/dnc/lookup/");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tf-key");
      bodies.push(JSON.parse(init!.body as string));
      return json({
        results: [
          { phone: "4325550100", hit: false, national_dnc: false, state_dnc: false, state_dnc_list: [], litigator: false, is_clean: true, credits_deducted: 5 },
          { phone: "4325550199", hit: true, national_dnc: true, state_dnc: true, state_dnc_list: ["TX", "FL"], litigator: false, is_clean: false, credits_deducted: 5 },
          { phone: "4325550177", hit: true, national_dnc: false, state_dnc: false, state_dnc_list: [], litigator: true, is_clean: false, credits_deducted: 5 },
        ],
        credits_deducted: 15,
      });
    });
    const phones = [
      { number: "4325550100", type: "mobile" as const, source: "batchdata" },
      { number: "4325550199", type: "landline" as const, source: "batchdata" },
      { number: "4325550177", type: "voip" as const, source: "batchdata" },
    ];
    // Only the best three go to the paid scrub; a fourth stays as it was.
    const r = await scrubPhones([...phones, { number: "4325550001", type: "unknown" as const, source: "batchdata" }], scrub);
    expect(bodies).toEqual([[{ phone: "4325550100" }, { phone: "4325550199" }, { phone: "4325550177" }]]);
    expect(r.phones[3]).toEqual({ number: "4325550001", type: "unknown", source: "batchdata" });
    r.phones.pop();
    expect(r.phones).toEqual([
      { number: "4325550100", type: "mobile", source: "batchdata" },
      { number: "4325550199", type: "landline", source: "batchdata", dnc: true },
      { number: "4325550177", type: "voip", source: "batchdata", litigator: true },
    ]);
    expect(r.try).toEqual({ source: "tracerfy-dnc", outcome: "hit", note: "1 of 3 clear · 1 on the Do Not Call list (FL, TX) · 1 known litigator" });
    expect((await scrubPhones(phones, tracerfyDnc(undefined))).try).toEqual({ source: "tracerfy-dnc", outcome: "skipped", note: "Not connected" });
    expect((await scrubPhones([], scrub)).try).toEqual({ source: "tracerfy-dnc", outcome: "skipped", note: "Nothing to check" });
    expect(await scrubPhones(phones, tracerfyDnc("tf-key", async () => json({ error: "Insufficient credits" }, 402)))).toEqual({ phones, try: { source: "tracerfy-dnc", outcome: "error", note: "Tracerfy DNC: HTTP 402" } });
  });

  test("a free source is still asked once the person is found, and agreement is kept on the person; a paid one is not", async () => {
    expect(samePerson({ name: "Dana Reyes" }, { name: "REYES, DANA M" })).toBe(true);
    expect(samePerson({ name: "Dana Reyes" }, { name: "Dana M. Reyes" })).toBe(true);
    expect(samePerson({ name: "Dana Reyes" }, { name: "Sam Reyes" })).toBe(false);
    expect(samePerson({ name: "Dana Reyes" }, { name: "Dana" })).toBe(false);
    const asked: string[] = [];
    const source = (name: string, person: string | undefined, free?: boolean, authority?: number) => ({
      name,
      fields: ["person" as const],
      connected: true,
      free,
      authority,
      trace: async () => (asked.push(name), person ? { person: { name: person, source: name } } : {}),
    });
    const [agree] = await waterfall(company, [source("roll", "Dana Reyes", true, 1), source("tx-comptroller", "REYES DANA", true, 3), source("other-free", "Bob Smith", true), source("cobalt", "Dana Reyes")], ["person"]);
    expect(agree.source).toBe("roll");
    expect(agree.found.person).toEqual({ name: "Dana Reyes", source: "roll", confirmedBy: ["tx-comptroller"] });
    expect(agree.tries).toEqual([
      { source: "roll", outcome: "hit", note: "Dana Reyes" },
      { source: "tx-comptroller", outcome: "hit", note: "Also names Dana Reyes" },
      { source: "other-free", outcome: "hit", note: "Names Bob Smith instead" },
      { source: "cobalt", outcome: "skipped", note: "Not needed, already found" },
    ]);
    expect(asked).toEqual(["roll", "tx-comptroller", "other-free"]);
    // The roll's guess (the LLC's mail goes to the accountant's house) loses to the state's filed record naming the manager; a weaker source disagreeing changes nothing.
    const [outranked] = await waterfall(company, [source("roll", "Pat Accountant", true, 1), source("tx-comptroller", "Dana Reyes", true, 3), source("permits", "Sam Other", true, 2)], ["person"]);
    expect(outranked.source).toBe("tx-comptroller");
    expect(outranked.found.person).toEqual({ name: "Dana Reyes", source: "tx-comptroller" });
    expect(outranked.tries).toEqual([
      { source: "roll", outcome: "hit", note: "Pat Accountant" },
      { source: "tx-comptroller", outcome: "hit", note: "Names Dana Reyes instead, and outranks the earlier source" },
      { source: "permits", outcome: "hit", note: "Names Sam Other instead" },
    ]);
    // A free source with nothing: a miss in the ledger, no confirmation.
    const [alone] = await waterfall(company, [source("roll", "Dana Reyes", true), source("tx-comptroller", undefined, true)], ["person"]);
    expect(alone.found.person!.confirmedBy).toBeUndefined();
    expect(alone.tries[1]).toEqual({ source: "tx-comptroller", outcome: "miss", note: "No match" });
  });

  test("the waterfall skips a source that can't take this owner, with the reason in the ledger, and still asks the next one", async () => {
    const picky = hunter("h-key", async () => json({ data: { email: "x@y.example" } }));
    const asked: string[] = [];
    const other = { name: "other", fields: ["email" as const], connected: true, trace: async () => (asked.push("other"), { emails: [{ email: "o@o.example", source: "other" }] }) };
    const [email] = await waterfall(company, [picky, other], ["email"]);
    expect(email.tries).toEqual([
      { source: "hunter", outcome: "skipped", note: "Needs a named person at a company" },
      { source: "other", outcome: "hit", note: "1 email" },
    ]);
    expect(email.source).toBe("other");
  });

  test("the waterfall says which source it is asking before each turn, with the turns so far, so the page can narrate", async () => {
    const said: Array<[string, string | undefined, number]> = [];
    const miss = { name: "first", fields: ["email" as const], connected: true, trace: async () => ({}) };
    const off = { name: "off", fields: ["email" as const], connected: false, trace: async () => ({}) };
    const hit = { name: "second", fields: ["email" as const], connected: true, trace: async () => ({ emails: [{ email: "o@o.example", source: "second" }] }) };
    const after = { name: "third", fields: ["email" as const], connected: true, trace: async () => ({}) };
    await waterfall(company, [miss, off, hit, after], ["email"], undefined, async (field, tries, asking) => void said.push([field, asking, tries.length]));
    // Only the sources actually asked are announced: not the one without a key, not the one after a hit.
    expect(said).toEqual([
      ["email", "first", 0],
      ["email", "second", 2],
    ]);
    // A narration that fails never stops the lookup.
    const [email] = await waterfall(company, [hit], ["email"], undefined, async () => {
      throw new Error("offline");
    });
    expect(email.source).toBe("second");
  });
});

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

  test("the ask is for the page's county: the assistant is told that county's roll, and the list is of it whatever it wrote", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const t = setup();
    await addParcels(t, ROLL);
    await rebuild(t);
    const co = await proCompany(t);
    const bodies = stubClaude({ kind: "list", title: "Shopping center owners, Ector", explanation: "Owners of commercial buildings.", definition: { county: "Midland", who: "commercial" } });
    const got = await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "shopping center owners", county: "Ector" });
    expect(got).toMatchObject({ ok: true, definition: { county: "Ector", who: "commercial" } });
    const system = (bodies[0] as { system: Array<{ text: string }> }).system[0].text;
    expect(system).toContain("over the Ector County, Texas appraisal roll");
    expect(system).toContain("Only Ector County exists.");
    expect(system).not.toContain("Midland");
    // An unknown county is Midland's.
    stubClaude({ kind: "list", title: "Shopping center owners, Midland", explanation: "Owners of commercial buildings.", definition: { who: "commercial" } });
    expect(await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "shopping center owners", county: "Nowhere" })).toMatchObject({ definition: { county: "Midland" } });
    // Without the assistant, the words alone pick the list, in the county asked.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "apartment owners", county: "Lubbock" })).toMatchObject({ ok: true, definition: { county: "Lubbock", who: "multifamily" } });
  });

  test("the working county is the company's: set on one device, every device reads it; only a known county", async () => {
    const t = setup();
    const co = await proCompany(t);
    const org = co.organizationId;
    expect((await co.as.query(api.outreach.contacts, { organizationId: org })).county).toBe("Midland");
    await co.as.mutation(api.outreach.setCounty, { organizationId: org, county: "Ector" });
    expect((await co.as.query(api.outreach.contacts, { organizationId: org })).county).toBe("Ector");
    await expect(co.as.mutation(api.outreach.setCounty, { organizationId: org, county: "Nowhere" })).rejects.toThrow(/No such county/);
    // An owner sent to Leads from an Ector list has its property in Odessa, the county's city.
    await addParcels(t, [parcel("e1")]);
    const contactId = await t.run(async (ctx) => {
      const [user] = await ctx.db.query("users").collect();
      const listId = await ctx.db.insert("outreachLists", { organizationId: org, title: "Odessa owners", definition: { county: "Ector", who: "commercial" }, rowCount: 1, done: 0, truncated: false, createdBy: user._id, createdAt: "2026-11-01T00:00:00.000Z" });
      const locked = { status: "locked" as const };
      const parcelId = (await ctx.db.query("parcels").first())!._id;
      return ctx.db.insert("outreachContacts", { organizationId: org, key: "k", name: "Grant Ave LLC", mailing: {}, property: { parcelId, address: "400 N Grant Ave", useCode: "F1" }, properties: 1, totalValueCents: 0, why: "", kinds: ["commercial"], listIds: [listId], status: "new", createdAt: "2026-11-01T00:00:00.000Z", enrichment: { phone: locked, email: locked, person: locked } });
    });
    const leadId = await co.as.mutation(api.outreach.sendToLeads, { organizationId: org, contactId });
    expect(await t.run(async (ctx) => ctx.db.get(leadId))).toMatchObject({ address: "400 N Grant Ave", city: "Odessa" });
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
    // The first working list cuts without the assistant: companies holding 3 or more, which is Nuka Hiva alone.
    const slice = await co.as.action(api.outreach.interpret, { organizationId: co.organizationId, request: "Company investors with 3 or more properties" });
    expect(slice).toMatchObject({ ok: true, definition: { county: "Midland", who: "investor", companyOwned: true, minParcels: 3 }, title: "Company investors with 3+ properties, Midland", count: 1 });
    expect(slice.ok && slice.preview.map((r) => r.name)).toEqual(["Nuka Hiva LLC"]);
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
