import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.setup";
import { ROLL_LIMITS } from "./districtRoll";
import { DISTRICT_ROLL, buildingRow, deedsOf, keptUse, rollAccount, rollColumns, rollDate, rollLinks, rollParcels, saleRow } from "./lib/districtRoll";
import { rowsToParcels } from "./lib/parcels";
import { linesEach, zipEntries, zipEntry } from "./lib/zip";
import { bytes, zip } from "./zip.fixture";

const limits = { ...ROLL_LIMITS };
beforeEach(() => {
  ROLL_LIMITS.wholeRoll = 5;
  vi.useFakeTimers({ now: Date.parse("2026-11-16T12:00:00Z"), toFake: ["Date"] });
});
afterEach(() => {
  Object.assign(ROLL_LIMITS, limits);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// The roll's columns that are read, as the district names them, and one it has that never is.
const COLUMNS = ["id", "ownerid", "name", "xname", "addr1", "addr2", "addr3", "city", "state", "zip", "confidential", "undelcd", "birthdate", "street", "strdir", "strnum", "lndhs", "lndnonhs", "imphs", "impnonhs", "prdmkt", "ptdlndhs", "ptdlndnonhs", "ptdimphs", "ptdimpnonhs", "hscode", "interest", "deeddate"];
const HEADER = COLUMNS.map((c) => `collector_${c}`).join("|");
const line = (o: Record<string, string>) => COLUMNS.map((c) => o[c] ?? "").join("|");
const KO = { ownerid: "GMNI2023", name: "KOSF II MIDLAND LLC", addr3: "10301 WAYZATA BLVD", city: "MINNETONKA", state: "MN", zip: "55305", ptdlndnonhs: "F1", ptdimpnonhs: "F1" };
const ACCOUNTS = [
  // 200 S Norman: one property, two half-interest accounts (copied from the 2026 roll).
  line({ ...KO, id: "R000004331", street: "NORMAN", strdir: "S", strnum: "200", lndnonhs: "11770", impnonhs: "125720", interest: "0.500000000", deeddate: "6/1/2023 12:00:00 AM" }),
  line({ ...KO, id: "R000207001", street: "NORMAN", strdir: "S", strnum: "200", lndnonhs: "11770", impnonhs: "125720", interest: "0.500000000", deeddate: "6/1/2023 12:00:00 AM" }),
  // KO's largest, under the other spelling of its name, care of the name on the sign.
  line({ ...KO, id: "R000231272", ownerid: "GMNI2024", name: "KOSF II-MIDLAND LLC", xname: "C/O KO STORAGE", street: "FM RD 00307", strnum: "8910", lndhs: "276000", impnonhs: "1930550", interest: "1.000000000", deeddate: "5/1/2023 12:00:00 AM" }),
  // A homestead.
  line({ id: "R000054065", ownerid: "GMNI2012", name: "CHAVEZ MARIELA C", addr3: "4407 ERIE DR", city: "MIDLAND", state: "TX", zip: "79703", birthdate: "2/16/1969 12:00:00 AM", street: "ERIE DR", strnum: "4407", lndhs: "9970", imphs: "88280", ptdlndhs: "A1", ptdimphs: "A1", hscode: "H", interest: "1.000000000", deeddate: "2/9/2012 12:00:00 AM" }),
  // A house on a farm road, filed as the farm.
  line({ id: "R000218159", ownerid: "GMNI2019", name: "HAUT TROY D", addr3: "9708 FM 307", city: "MIDLAND", state: "TX", zip: "79706", street: "FM RD 00307", strnum: "9708", lndnonhs: "67000", impnonhs: "267350", ptdlndnonhs: "E1", ptdimpnonhs: "E1", interest: "1.000000000", deeddate: "5/14/2019 12:00:00 AM" }),
  // A mobile home on a county road, with no number and no state code.
  line({ id: "R000000010", name: "NOWHERE JOE AND", xname: "NOWHERE JANE", addr1: "PO BOX 2", city: "MIDLAND", state: "TX", zip: "79702-1234", street: "COUNTY RD 00120", strdir: "W", strnum: "0", lndnonhs: "5000", impnonhs: "40000", interest: "1.000000000", deeddate: "1/1/1900 12:00:00 AM" }),
  // A vacant lot; an owner the district keeps confidential; a barn on a ranch; a house with no street at all.
  line({ id: "R000000011", name: "LAND CO", addr3: "1 A ST", street: "B ST", strnum: "2", lndnonhs: "5000", ptdlndnonhs: "C1", interest: "1.000000000" }),
  line({ id: "R000000012", name: "JUDGE SOMEONE", confidential: "Y", addr3: "3 C ST", street: "C ST", strnum: "3", imphs: "200000", ptdimphs: "A1", interest: "1.000000000" }),
  line({ id: "R000000013", name: "RANCH LLC", addr3: "PO BOX 1", street: "COUNTY RD 00140", strdir: "E", strnum: "500", lndnonhs: "80000", impnonhs: "9000", ptdlndnonhs: "E4", ptdimpnonhs: "E4", interest: "1.000000000" }),
  line({ id: "R000000014", name: "LOST HOUSE LLC", addr3: "PO BOX 3", imphs: "90000", ptdimphs: "A1", interest: "1.000000000" }),
  // Mail that came back, a second owner on the line before the street, and a suite.
  line({ id: "R000000015", name: "ROBERTSON KEN", addr1: "& TAMI ROBERTSON", addr2: "STE 210", addr3: "1121 S CARROLL AV", city: "MIDLAND", state: "TX", zip: "79701", undelcd: "RTN", street: "CARROLL AV", strdir: "S", strnum: "1121", impnonhs: "300000", ptdimpnonhs: "F3", interest: "1.000000000", deeddate: "9/9/2020 12:00:00 AM" }),
  // Equipment and minerals are on the roll too.
  line({ id: "I000000008", name: "QES DIRECTIONAL DRILLING CO", addr3: "13000 W HWY 80 E" }),
  line({ id: "N000000001", name: "MINERAL OWNER", addr3: "PO BOX 9" }),
];
const ROLL = [HEADER, ...ACCOUNTS].join("\r\n") + "\r\n";
const BUILDINGS = ["webbld_id,webbld_impseq,webbld_seq,webbld_code,webbld_constyr,webbld_desc", "R000004331,1,1,COMM,1973,COMM BLDG", "R000004331,1,2,PKLT,1973,PARKING LT", "R000207001,1,1,COMM,1973,COMM BLDG", "R000231272,1,1,COMM,2013,COMM BLDG", "R000231272,1,2,OFC,2013,OFFICE, FRONT", "R000054065,1,1,RES,1955,RESIDENCE", "R000054065,1,2,GAR,1955,ATTACHED GARAGE", "R000218159,1,1,RES,1950,RESIDENCE", "R000218159,1,16,MH,2011,MOBILE HOME", "R000000010,1,1,MH,1999,MOBILE HOME", "R000000013,1,1,BARN,1980,BARN", "I000000008,1,1,COMM,2000,SHOP"].join("\r\n") + "\r\n";
const SALES = [
  "websale_id,websale_seq,websale_dt,websale_deeddate,websale_deedpage,websale_deedvol,websale_grantor,websale_instrument",
  "R000004331,9991452,6/1/2023 12:00:00 AM,6/1/2023 12:00:00 AM,,,PROPERTY RENEGADES LLC,2023-13086",
  "R000004331,9991453,3/31/2022 12:00:00 AM,3/31/2022 12:00:00 AM,,,HEJL BETTY TR,2022-9376",
  "R000004331,9991454,4/8/2010 12:00:00 AM,4/8/2010 12:00:00 AM,,,HEJL JEROME C,2010-6398",
  // A name with a comma of its own, the same deed twice, a row with nobody named, and one dated by its other column.
  "R000054065,9832321,2/9/2012 12:00:00 AM,2/9/2012 12:00:00 AM,,,CRYSTAL CABINETS, INC,2012-2449",
  "R000054065,9832322,2/9/2012 12:00:00 AM,2/9/2012 12:00:00 AM,,,CRYSTAL CABINETS, INC,2012-2449",
  "R000054065,9832323,9/21/2005 12:00:00 AM,1/1/1900 12:00:00 AM,,,,",
  "R000054065,9832324,6/7/2001 12:00:00 AM,1/1/1900 12:00:00 AM,0,0,SIMS CARMEN M TRUST &,0",
  "I000000240,9999998,1/1/1900 12:00:00 AM,1/1/1900 12:00:00 AM,,,GERONIMO HOLDING CORP,",
].join("\r\n") + "\r\n";
const PAGE = `<p><a href="https://midcad.org/wp-content/uploads/2025/08/2025-Certified-Real-Property-Roll.zip">2025 Midland Certified Real Property Roll</a></p>
  <p><a href="https://midcad.org/wp-content/uploads/2026/08/2026-MIDLAND-CERTIFIED-COLLECTORS-3.zip">2026 Midland Certified Real Property Roll</a></p>
  <p><a href="https://midcad.org/wp-content/uploads/2026/05/2026-MIDLAND-COLLECTORS-REAL-MH.zip">2026 Preliminary Real Property Roll</a></p>
  <p><a href="https://midcad.org/wp-content/uploads/2026/07/MINERAL.zip">2026 Midland Certified Mineral Roll</a></p>
  <p><a data-type="link" href="https://midcad.org/wp-content/uploads/2026/08/2026-MIDLAND-CERTIFIED-WEB-3.zip"><strong>2026 MCAD Web File</strong></a> <a href="https://midcad.org/wp-content/uploads/2025/11/2025-MCAD-Web-File.zip">2025 MCAD Web File</a></p>`;
const ROLL_URL = "https://midcad.org/wp-content/uploads/2026/08/2026-MIDLAND-CERTIFIED-COLLECTORS-3.zip";
const WEB_URL = "https://midcad.org/wp-content/uploads/2026/08/2026-MIDLAND-CERTIFIED-WEB-3.zip";

describe("the appraisal district's certified roll and web file", () => {
  test("the newest roll and web file are found on the Open Records page", () => {
    expect(rollLinks(PAGE)).toEqual({ roll: ROLL_URL, web: WEB_URL });
    expect(rollLinks("<p>Closed for the holiday</p>")).toEqual({});
  });

  test("a zip lists its files with the day each was made; text is read a line at a time, however the pieces fall", async () => {
    const packed = zip({ "2026 MIDLAND CERTIFIED COLLECTORS.txt": bytes(ROLL), "2026 MIDLAND CERTIFIED COLLECTORS_matrix.txt": bytes("layout") }, "2026-08-06");
    expect(zipEntries(packed).map((e) => [e.name, e.date, e.size])).toEqual([["2026 MIDLAND CERTIFIED COLLECTORS.txt", "2026-08-06", bytes(ROLL).length], ["2026 MIDLAND CERTIFIED COLLECTORS_matrix.txt", "2026-08-06", 6]]);
    expect(zipEntry(packed, "nothing.txt")).toBeUndefined();
    expect(zipEntries(bytes("not a zip"))).toEqual([]);
    const text = bytes("one\r\ntwo\nthree, with a café\r\n\r\nlast");
    text[text.indexOf(0xc3)] = 0xe9; // the é as Latin-1 writes it, one byte
    const latin = text.filter((b, i) => !(b === 0xa9 && text[i - 1] === 0xe9));
    for (const size of [1, 3, 7, 100]) {
      const got: string[] = [];
      const count = await linesEach(Array.from({ length: Math.ceil(latin.length / size) }, (_, i) => latin.subarray(i * size, (i + 1) * size)), (l) => got.push(l));
      expect(got).toEqual(["one", "two", "three, with a café", "", "last"]);
      expect(count).toBe(5);
    }
  });

  test("a line of the roll is an account: its owner, where the bill goes, the address, the state's code, the values", () => {
    const columns = rollColumns(HEADER);
    const now = Date.parse("2026-11-16");
    expect(rollAccount(ACCOUNTS[0], columns, now)).toEqual({
      cadId: "R000004331", ownerId: "GMNI2023", owner: "KOSF II MIDLAND LLC", mailing: { address: "10301 WAYZATA BLVD", city: "MINNETONKA", state: "MN", zip: "55305" },
      site: "200 S NORMAN", numbered: true, stateCode: "F1", marketCents: 13_749_000, buildingCents: 12_572_000, deedDate: "2023-06-01", interest: 0.5, returnedMail: false, homestead: false,
    });
    // A care-of line isn't a second owner; a farm road's number loses its padding.
    expect(rollAccount(ACCOUNTS[2], columns, now)).toMatchObject({ owner: "KOSF II-MIDLAND LLC", site: "8910 FM RD 307", marketCents: 220_655_000 });
    expect(rollAccount(ACCOUNTS[2], columns, now)?.owner2).toBeUndefined();
    // A homestead says the owner lives there. Their date of birth, on the same line, is never read.
    const home = rollAccount(ACCOUNTS[3], columns, now)!;
    expect(home).toMatchObject({ owner: "CHAVEZ MARIELA C", stateCode: "A1", homestead: true, site: "4407 ERIE DR" });
    expect(JSON.stringify(home)).not.toContain("1969");
    // No number, no state code, no deed (the district writes 1/1/1900); "AND" joins the second owner's line.
    expect(rollAccount(ACCOUNTS[5], columns, now)).toMatchObject({ owner: "NOWHERE JOE", owner2: "NOWHERE JANE", site: "W COUNTY RD 120", numbered: false, stateCode: "", mailing: { address: "PO BOX 2", zip: "79702" } });
    expect(rollAccount(ACCOUNTS[5], columns, now)?.deedDate).toBeUndefined();
    // A second owner on the line before the street, a suite, and mail that came back.
    expect(rollAccount(ACCOUNTS[10], columns, now)).toMatchObject({ owner: "ROBERTSON KEN", owner2: "TAMI ROBERTSON", mailing: { address: "1121 S CARROLL AV STE 210" }, returnedMail: true, stateCode: "F3" });
    // Confidential owners, equipment and minerals aren't accounts to keep.
    expect([ACCOUNTS[7], ACCOUNTS[11], ACCOUNTS[12]].map((l) => rollAccount(l, columns, now))).toEqual([undefined, undefined, undefined]);
    expect(rollAccount(ACCOUNTS[9], columns, now)?.site).toBeUndefined();
    expect(rollDate("1/1/1900 12:00:00 AM")).toBeUndefined();
    expect(rollDate("12/5/2031 12:00:00 AM", now)).toBeUndefined();
  });

  test("buildings and sales are read from the web file, commas in names and all", () => {
    expect(buildingRow("R000231272,1,2,OFC,2013,OFFICE, FRONT")).toEqual({ cadId: "R000231272", code: "OFC" });
    expect(buildingRow("I000000008,1,1,COMM,2000,SHOP")).toBeUndefined();
    expect(saleRow("R000054065,9832321,2/9/2012 12:00:00 AM,2/9/2012 12:00:00 AM,,,CRYSTAL CABINETS, INC,2012-2449")).toEqual({ cadId: "R000054065", seq: 9832321, deed: { seller: "CRYSTAL CABINETS, INC", date: "2012-02-09", instrument: "2012-2449" } });
    expect(saleRow("R000054065,9832323,9/21/2005 12:00:00 AM,1/1/1900 12:00:00 AM,,,,")).toBeUndefined();
    const sales = SALES.split("\r\n").slice(1).flatMap((l) => saleRow(l) ?? []);
    // Newest first, the same deed once, dated by the sale when the deed has no date.
    expect(deedsOf(sales.filter((s) => s.cadId === "R000054065"))).toEqual([{ seller: "CRYSTAL CABINETS, INC", date: "2012-02-09", instrument: "2012-2449" }, { seller: "SIMS CARMEN M TRUST", date: "2001-06-07" }]);
  });

  test("what is kept: homes, apartments and commercial by the state's code; a dwelling on anything else; one parcel for one owner's shares", () => {
    expect(keptUse({ stateCode: "A1" }, [])).toBe("A1");
    expect(keptUse({ stateCode: "F3", buildingCents: 1 }, ["OFC"])).toBe("F3");
    expect(keptUse({ stateCode: "C1" }, [])).toBeUndefined();
    expect(keptUse({ stateCode: "E1", buildingCents: 1 }, ["RES", "GAR"])).toBe("A1");
    expect(keptUse({ stateCode: "", buildingCents: 1 }, ["MH"])).toBe("A2");
    expect(keptUse({ stateCode: "E4", buildingCents: 1 }, ["BARN", "STG"])).toBeUndefined();
    // A dwelling the district puts no value on isn't one to keep.
    expect(keptUse({ stateCode: "E1" }, ["RES"])).toBeUndefined();
    const columns = rollColumns(HEADER);
    const accounts = ACCOUNTS.flatMap((l) => rollAccount(l, columns, Date.parse("2026-11-16")) ?? []);
    const built: Record<string, string[]> = { R000004331: ["COMM", "PKLT"], R000207001: ["COMM"], R000231272: ["COMM", "OFC"], R000054065: ["RES", "GAR"], R000218159: ["RES", "MH"], R000000010: ["MH"], R000000013: ["BARN"] };
    const parcels = rollParcels(accounts, (id) => built[id] ?? [], () => []);
    expect(parcels.map((p) => [p.row.cadId, p.row.useCode, p.row.siteAddress])).toEqual([
      ["R000000010", "A2", "W COUNTY RD 120"],
      ["R000000015", "F3", "1121 S CARROLL AV"],
      ["R000004331", "F1", "200 S NORMAN"],
      ["R000054065", "A1", "4407 ERIE DR"],
      ["R000218159", "A1", "9708 FM RD 307"],
      ["R000231272", "F1", "8910 FM RD 307"],
    ]);
    const norman = parcels.find((p) => p.row.cadId === "R000004331")!;
    expect(norman).toMatchObject({ accounts: ["R000004331", "R000207001"], buildings: ["COMM", "PKLT"], row: { marketValueCents: 27_498_000, buildingValueCents: 25_144_000 } });
    expect(parcels.find((p) => p.row.cadId === "R000054065")!.row).toMatchObject({ ownerOccupied: true, companyOwned: false });
    expect(parcels.find((p) => p.row.cadId === "R000000010")!.row).toMatchObject({ ownerOccupied: false, owner2: "NOWHERE JANE" });
  });
});

describe("Midland's parcels from the district's roll", () => {
  const parcel = (cadId: string, siteAddress: string, owner: string, over: Record<string, unknown> = {}) => ({
    county: "Midland", cadId, useCode: "A1", siteAddress, addressKey: siteAddress, owner, mailing: { address: siteAddress, city: "MIDLAND", state: "TX", zip: "79703" }, ownerOccupied: false, companyOwned: false, importedAt: "2026-11-01T00:00:00.000Z", ...over,
  });
  /** The district's site: its Open Records page, and the two files, asked their size or fetched. */
  function district(over: { roll?: Uint8Array; page?: string } = {}) {
    const files: Record<string, Uint8Array> = {
      [ROLL_URL]: over.roll ?? zip({ "2026 MIDLAND CERTIFIED COLLECTORS.txt": bytes(ROLL), "2026 MIDLAND CERTIFIED COLLECTORS_Agent.txt": bytes("agents") }, "2026-08-06"),
      [WEB_URL]: zip({ "export_webbld.txt": bytes(BUILDINGS), "export_websale.txt": bytes(SALES), "export_webprop.txt": bytes("unused") }, "2026-08-06"),
    };
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push(`${init?.method ?? "GET"} ${url}`);
        if (url === DISTRICT_ROLL.page) return new Response(over.page ?? PAGE, { status: 200 });
        const file = files[url];
        if (!file) return new Response("gone", { status: 404 });
        return init?.method === "HEAD" ? new Response(null, { status: 200, headers: { "content-length": String(file.length) } }) : new Response(file, { status: 200 });
      }),
    );
    return asked;
  }
  const parcels = (t: ReturnType<typeof setup>) => t.run(async (ctx) => Object.fromEntries((await ctx.db.query("parcels").collect()).map((p) => [p.cadId, p])));

  test("the roll is the base: owners, types, values and deed history for every account; what it no longer has is retired", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      // From the city's map: last year's owner, and the district's land code that only the city's map has.
      await ctx.db.insert("parcels", parcel("R000054065", "4407 ERIE DR", "OWNER BEFORE", { landUse: "RSF01", pin: "88600" }));
      // Read at the district's site last week: it had sold since the roll was made.
      await ctx.db.insert("parcels", parcel("R000218159", "9708 FM RD 307", "NEW BUYER JANE", { deedDate: "2026-10-02", districtAt: "2026-11-10T08:00:00.000Z", mailing: { address: "9 ELM ST", city: "ODESSA", state: "TX", zip: "79760" } }));
      // An account the district has closed; one that is land on the roll; and a parcel only BatchData has.
      await ctx.db.insert("parcels", parcel("R000999999", "1 GONE ST", "CLOSED ACCOUNT", { ownerKey: "CLOSED ACCOUNT|1 GONE ST", mailKey: "1 GONE ST", kind: "industrial", useCode: "F2" }));
      await ctx.db.insert("parcels", parcel("R000000011", "2 B ST", "LAND CO"));
      await ctx.db.insert("parcels", parcel("bd:abc", "5 E ST", "VENDOR ONLY", { source: "batchdata" }));
    });
    const asked = district();
    const result = await t.action(internal.districtRoll.importRoll, {});
    expect(result).toMatchObject({ accounts: 10, parcels: 6, added: 4, updated: 2, retired: 2 });
    expect(result.error).toBeUndefined();
    expect(asked).toEqual([`GET ${DISTRICT_ROLL.page}`, `HEAD ${ROLL_URL}`, `HEAD ${WEB_URL}`, `GET ${WEB_URL}`, `GET ${ROLL_URL}`]);
    const now = await parcels(t);
    // KO Storage's two half-interest accounts are one property, with who it was bought from.
    expect(now.R000004331).toMatchObject({
      county: "Midland", useCode: "F1", kind: "storage", siteAddress: "200 S NORMAN", owner: "KOSF II MIDLAND LLC", ownerId: "GMNI2023", marketValueCents: 27_498_000, accounts: ["R000004331", "R000207001"], buildings: ["COMM", "PKLT"],
      deedDate: "2023-06-01", deedsReadFor: "2023-06-01", deeds: [{ seller: "PROPERTY RENEGADES LLC", date: "2023-06-01", instrument: "2023-13086" }, { seller: "HEJL BETTY TR", date: "2022-03-31", instrument: "2022-9376" }, { seller: "HEJL JEROME C", date: "2010-04-08", instrument: "2010-6398" }],
    });
    expect(now.R000207001).toBeUndefined();
    expect(now.R000231272).toMatchObject({ owner: "KOSF II-MIDLAND LLC", siteAddress: "8910 FM RD 307", kind: "storage" });
    // The city's owner gives way to the roll's; its land code and PIN stay.
    expect(now.R000054065).toMatchObject({ owner: "CHAVEZ MARIELA C", ownerOccupied: true, landUse: "RSF01", pin: "88600", marketValueCents: 9_825_000, deeds: [{ seller: "CRYSTAL CABINETS, INC", date: "2012-02-09", instrument: "2012-2449" }, { seller: "SIMS CARMEN M TRUST", date: "2001-06-07" }] });
    expect(now.R000054065.returnedMail).toBeUndefined();
    // Read live since the roll was made: today's owner stays, and the roll's owner is who sold to them.
    expect(now.R000218159).toMatchObject({ owner: "NEW BUYER JANE", deedDate: "2026-10-02", mailing: { address: "9 ELM ST", city: "ODESSA" }, useCode: "A1", marketValueCents: 33_435_000, deeds: [{ seller: "HAUT TROY D", date: "2026-10-02" }], buildings: ["MH", "RES"] });
    // A mobile home with no number is kept by its road; mail that came back is flagged.
    expect(now.R000000010).toMatchObject({ useCode: "A2", siteAddress: "W COUNTY RD 120", owner: "NOWHERE JOE", owner2: "NOWHERE JANE" });
    expect(now.R000000015).toMatchObject({ useCode: "F3", returnedMail: true, owner2: "TAMI ROBERTSON" });
    // Closed, and land now: retired, filed under no owner, in no kind. BatchData's own is left alone.
    expect(now.R000999999).toMatchObject({ retiredAt: "2026-11-16T12:00:00.000Z", ownerKey: "", mailKey: "" });
    expect(now.R000999999.kind).toBeUndefined();
    expect(now.R000000011.retiredAt).toBeDefined();
    expect(now["bd:abc"].retiredAt).toBeUndefined();
    for (const id of ["R000000012", "R000000013", "R000000014", "I000000008"]) expect(now[id]).toBeUndefined();
    // Retired parcels are nobody's holding when the owners are built.
    const page = await t.query(internal.outreach.parcelPage, {});
    expect(page.rows.map((r) => r.siteAddress).sort()).toEqual(["1121 S CARROLL AV", "200 S NORMAN", "4407 ERIE DR", "5 E ST", "8910 FM RD 307", "9708 FM RD 307", "W COUNTY RD 120"]);
    expect(await t.query(internal.parcels.rollCoverage, {})).toMatchObject({ onRoll: 6, retired: 2, other: 1, returnedMail: 1, merged: 1, isDone: true });
    expect(await t.query(internal.permits.sourceState, { source: DISTRICT_ROLL.source })).toMatchObject({ fetched: 10, added: 4, updated: 2, lastAppliedAt: expect.stringContaining("2026-MIDLAND-CERTIFIED-WEB-3.zip") });

    // Next week the same files are posted: asked their size, and not fetched.
    asked.length = 0;
    expect(await t.action(internal.districtRoll.importRoll, {})).toMatchObject({ skipped: true });
    expect(asked).toEqual([`GET ${DISTRICT_ROLL.page}`, `HEAD ${ROLL_URL}`, `HEAD ${WEB_URL}`]);

    // The city's weekly read after that: only its land code and PIN are taken; a retired parcel stays retired.
    const city = (over: Record<string, unknown>) => rowsToParcels([{ attributes: { SU_NUM: "R000054065", PIN_1: "88601", GOV_USE_CO: "A1", LAND_USE: "RSF02", SITE_NO: 4407, STREET_DIR: " ", STREET: "ERIE DR", OWNER: "OWNER BEFORE", OWNER2: " ", ADDRESS_1: "PO BOX 1", CITY_1: "MIDLAND", STATE_1: "TX", ZIP: "79702", MKT_VALUE: 1, BLDG_VALUE: 1, DEED_DATE: "1/1/2009", ...over } }]);
    expect(await t.mutation(internal.parcels.upsert, { rows: [...city({}), ...city({ SU_NUM: "R000999999", SITE_NO: 1, STREET: "GONE ST", LAND_USE: "CWH05" })] })).toEqual({ added: 0, updated: 2 });
    const after = await parcels(t);
    expect(after.R000054065).toMatchObject({ owner: "CHAVEZ MARIELA C", landUse: "RSF02", pin: "88601", marketValueCents: 9_825_000, deedDate: "2012-02-09" });
    expect(after.R000999999).toMatchObject({ owner: "CLOSED ACCOUNT", landUse: "CWH05", retiredAt: expect.any(String) });
    expect(after.R000999999.kind).toBeUndefined();
    expect(await t.mutation(internal.parcels.upsert, { rows: city({}) })).toEqual({ added: 0, updated: 0 });
  });

  test("a roll cut short retires nothing; a page without the files is recorded as it went", async () => {
    const t = setup();
    ROLL_LIMITS.wholeRoll = 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("parcels", parcel("R000999999", "1 GONE ST", "CLOSED ACCOUNT"));
    });
    district();
    const short = await t.action(internal.districtRoll.importRoll, {});
    expect(short).toMatchObject({ accounts: 10, parcels: 6, error: "the roll had only 10 accounts: kept what it had, retired nothing" });
    expect(short.retired).toBeUndefined();
    expect((await parcels(t)).R000999999.retiredAt).toBeUndefined();
    // Not marked as read: the next run reads the files again.
    expect((await t.query(internal.permits.sourceState, { source: DISTRICT_ROLL.source }))?.lastAppliedAt).toBeUndefined();

    district({ page: "<p>Closed for the holiday</p>" });
    expect(await t.action(internal.districtRoll.importRoll, {})).toEqual({ error: "the district's Open Records page has no certified roll linked" });
    district({ roll: zip({ "readme.txt": bytes("nothing here") }) });
    expect(await t.action(internal.districtRoll.importRoll, { again: true })).toMatchObject({ error: "the district's certified roll has no roll table in it" });
    expect(await t.action(internal.districtRoll.importRoll, { background: true })).toEqual({ scheduled: true });
  });
});
