import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.setup";
import { DEED_PACE } from "./parcels";
import { DISTRICT_FILE, FILE_COLUMNS, dbfEach, fileFind, fileLink, zipEntry } from "./lib/districtFile";
import { findParcel } from "./lib/parcels";

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

const bytes = (s: string) => new TextEncoder().encode(s);
const le = (n: number, size: number) => Uint8Array.from({ length: size }, (_, i) => (n >>> (8 * i)) & 0xff);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** A dBase table as ArcGIS writes one: a header, a 32-byte entry per column, then fixed-width rows. */
function dbf(columns: Array<[string, number]>, rows: Array<Record<string, string>>, deleted: number[] = []): Uint8Array {
  const headerLength = 32 + columns.length * 32 + 1;
  const rowLength = 1 + columns.reduce((n, [, l]) => n + l, 0);
  const header = join(Uint8Array.of(3, 126, 8, 10), le(rows.length, 4), le(headerLength, 2), le(rowLength, 2), new Uint8Array(20));
  const fields = columns.map(([name, length]) => join(bytes(name.padEnd(11, "\0")), bytes("C"), new Uint8Array(4), Uint8Array.of(length), new Uint8Array(15)));
  const body = rows.map((row, i) => bytes((deleted.includes(i) ? "*" : " ") + columns.map(([name, length]) => (row[name] ?? "").padEnd(length, " ").slice(0, length)).join("")));
  return join(header, ...fields, Uint8Array.of(0x0d), ...body);
}

/** A zip of files stored as they are (no packing), the way any unzip reads one. */
function zip(files: Record<string, Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let at = 0;
  for (const [name, data] of Object.entries(files)) {
    const local = join(le(0x04034b50, 4), le(20, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), bytes(name), data);
    directory.push(join(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(at, 4), bytes(name)));
    locals.push(local);
    at += local.length;
  }
  const dir = join(...directory);
  return join(...locals, dir, le(0x06054b50, 4), le(0, 2), le(0, 2), le(directory.length, 2), le(directory.length, 2), le(dir.length, 4), le(at, 4), le(0, 2));
}

const COLUMNS: Array<[string, number]> = [["propidtxt", 8], ["file_as_na", 30], ["imprv_val", 10], ["market", 10], ["map_id", 12], ["situs_full", 30], ["addr_city", 12]];
const ROWS = [
  // A house the app has.
  { map_id: "R000000001", file_as_na: "CHAVEZ MARIELA C", imprv_val: "103210", market: "113180", situs_full: "4407 ERIE DR" },
  // A house out on a farm road the city files as farm land, and the app lacks.
  { map_id: "R000000002", file_as_na: "HAUT TROY D", imprv_val: "250000", market: "300000", situs_full: "9708 FM RD 00307" },
  // A storage place the city's map has blank: no house number at the district either.
  { map_id: "R000000003", file_as_na: "KOSF II MIDLAND LLC", imprv_val: "136650", market: "148420", situs_full: "0 S  NORMAN" },
  // Bare land: nothing built.
  { map_id: "R000000004", file_as_na: "LAND CO", imprv_val: "0", market: "5000", situs_full: "0 S COUNTY RD 01115" },
  // A barn on a ranch: something built, but no house or shop.
  { map_id: "R000000005", file_as_na: "RANCH LLC", imprv_val: "9000", market: "90000", situs_full: "500 E COUNTY RD 00140" },
  // A house the district gives no number.
  { map_id: "R000000006", file_as_na: "NOWHERE JOE", imprv_val: "80000", market: "95000", situs_full: "0 W COUNTY RD 00120" },
  // Minerals and equipment have ids of their own kind.
  { map_id: "P000000007", file_as_na: "RIG CO", imprv_val: "50000", market: "50000", situs_full: "1 MAIN ST" },
];
const TABLE = dbf(COLUMNS, ROWS);

describe("the appraisal district's own parcel file", () => {
  test("the newest file's link is found on the district's mapping page", () => {
    const page = `<a href="https://midcad.org/wp-content/uploads/2023/09/MidlandCAD2023.zip">2023</a> <p><a href="https://midcad.org/wp-content/uploads/2026/08/MidlandCAD2026.zip" data-type="link">MidlandCAD2026.zip</a></p>`;
    expect(fileLink(page)).toBe("https://midcad.org/wp-content/uploads/2026/08/MidlandCAD2026.zip");
    expect(fileLink("<p>Maps</p>")).toBeUndefined();
  });

  test("a zip gives up the file asked for; a table is read a piece at a time, however the pieces fall", async () => {
    const packed = zip({ "Ownership.cpg": bytes("UTF-8"), "Ownership.dbf": TABLE, "Ownership.prj": bytes("PROJCS") });
    const entry = zipEntry(packed, "Ownership.dbf")!;
    expect(entry).toMatchObject({ method: 0, size: TABLE.length });
    expect(entry.data).toEqual(TABLE);
    expect(zipEntry(packed, "Parcels.dbf")).toBeUndefined();
    expect(zipEntry(bytes("not a zip at all, just words"), "Ownership.dbf")).toBeUndefined();

    const read = async (size: number, table = TABLE) => {
      const rows: Array<Record<string, string>> = [];
      const pieces = Array.from({ length: Math.ceil(table.length / size) }, (_, i) => table.subarray(i * size, (i + 1) * size));
      const count = await dbfEach(pieces, FILE_COLUMNS, (row) => rows.push(row));
      return { count, rows };
    };
    const whole = await read(TABLE.length);
    expect(whole.count).toBe(7);
    expect(whole.rows[1]).toEqual({ map_id: "R000000002", file_as_na: "HAUT TROY D", imprv_val: "250000", market: "300000", situs_full: "9708 FM RD 00307" });
    // In pieces smaller than a row, and smaller than the header: the same rows.
    for (const size of [7, 50, 113, 1000]) expect((await read(size)).rows).toEqual(whole.rows);
    // A row marked deleted isn't in the table.
    expect((await read(64, dbf(COLUMNS, ROWS, [1]))).rows.map((r) => r.map_id)).not.toContain("R000000002");
  });

  test("a find is a parcel with something built on it, its address written the app's way", () => {
    expect(ROWS.map((r) => fileFind(r))).toEqual([
      { cadId: "R000000001", siteAddress: "4407 ERIE DR", marketValueCents: 11_318_000 },
      { cadId: "R000000002", siteAddress: "9708 FM RD 307", marketValueCents: 30_000_000 },
      { cadId: "R000000003", siteAddress: "S NORMAN", marketValueCents: 14_842_000 },
      undefined,
      { cadId: "R000000005", siteAddress: "500 E COUNTY RD 140", marketValueCents: 9_000_000 },
      { cadId: "R000000006", siteAddress: "W COUNTY RD 120", marketValueCents: 9_500_000 },
      undefined,
    ]);
    const page = (buildings: string[]) => ({ owner: "HAUT TROY D", mailing: { address: "9708 FM 307", city: "MIDLAND", state: "TX", zip: "79706-1234" }, buildings, buildingValueCents: 25_000_000, deeds: [{ seller: "SELLER BEFORE", date: "2019-05-14" }] });
    expect(findParcel({ cadId: "R000000002", siteAddress: "9708 FM RD 307", marketValueCents: 30_000_000 }, page(["RES", "GAR"]))).toMatchObject({
      cadId: "R000000002", useCode: "A1", siteAddress: "9708 FM RD 307", owner: "HAUT TROY D", mailing: { address: "9708 FM 307", zip: "79706" }, ownerOccupied: true, companyOwned: false, marketValueCents: 30_000_000, deedDate: "2019-05-14",
    });
    expect(findParcel({ cadId: "R000000005", siteAddress: "500 E COUNTY RD 140" }, page(["BARN"]))).toBe("land");
    expect(findParcel({ cadId: "R000000006", siteAddress: "W COUNTY RD 120" }, page(["RES"]))).toBe("unnumbered");
    // A commercial building is kept by its street alone, as on the roll.
    expect(findParcel({ cadId: "R000000003", siteAddress: "S NORMAN" }, page(["COMM"]))).toMatchObject({ useCode: "F1", siteAddress: "S NORMAN", ownerOccupied: false });
  });

  test("the file is read for what the app lacks; the owner refresh reads each find at the district and keeps the buildings", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("parcels", { county: "Midland", cadId: "R000000001", useCode: "A1", siteAddress: "4407 ERIE DR", addressKey: "4407 ERIE DR", owner: "CHAVEZ MARIELA C", mailing: {}, ownerOccupied: true, companyOwned: false, districtAt: "2026-11-12T11:00:00.000Z", importedAt: "2026-11-01T00:00:00.000Z" });
    });
    const packed = zip({ "Ownership.dbf": TABLE });
    const page = (owner: string, mail: string, built: string[], deeds: Array<[string, string]>) =>
      new Response(
        `<html><body><table><tr><td id="webprop_name">${owner}</td></tr><tr><td id="webprop_mailaddress">${mail}</td></tr></table>
         <table><tbody id="tableBld">${built.map((b) => `<tr><td>101</td><td>${b}</td><td>BUILDING</td></tr>`).join("")}</tbody></table>
         <table><tbody id="tableSale">${deeds.map(([who, date]) => `<tr><td align='left'>${who}</td><td></td><td></td><td align='right'>${date}</td><td>2026-1</td></tr>`).join("")}</tbody></table></body></html>`,
        { status: 200 },
      );
    const pages: Record<string, () => Response> = {
      R000000002: () => page("HAUT TROY D", "9708 FM 307<br/>MIDLAND, TX 79706", ["RES"], [["SELLER BEFORE", "5/14/2019"]]),
      // Sold since the file was made: the page has today's owner, and who they bought from.
      R000000003: () => page("KOSF II MIDLAND LLC", "10301 WAYZATA BLVD<br/>MINNETONKA, MN 55305", ["COMM", "PKLT"], [["PROPERTY RENEGADES LLC", "6/1/2023"], ["HEJL BETTY TR", "3/31/2022"]]),
      R000000005: () => page("RANCH LLC", "PO BOX 1<br/>MIDLAND, TX 79702", ["BARN"], []),
      R000000006: () => page("NOWHERE JOE", "PO BOX 2<br/>MIDLAND, TX 79702", ["RES"], []),
    };
    const asked: string[] = [];
    let link = "https://midcad.org/wp-content/uploads/2026/08/MidlandCAD2026.zip";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked.push(url);
        if (url === DISTRICT_FILE.page) return new Response(`<a href="${link}">MidlandCAD2026.zip</a>`, { status: 200 });
        if (url.endsWith(".zip")) return new Response(packed, { status: 200 });
        return (pages[new URL(url).searchParams.get("id")!] ?? (() => new Response("gone", { status: 404 })))();
      }),
    );
    const imported = await t.action(internal.districtFile.importFile, {});
    expect(imported).toEqual({ parcels: 7, withBuilding: 5, lacking: 4, noted: 4, file: `${link} (${packed.length} bytes)` });
    expect(asked).toEqual([DISTRICT_FILE.page, link]);
    expect(await t.query(internal.parcels.findCoverage, {})).toEqual({ waiting: 4, kept: 0, land: 0, unnumbered: 0, unreadable: 0 });

    // The refresh the import set going: every find's page is read once, before anything else.
    await t.finishAllScheduledFunctions(() => {});
    expect(asked.slice(2).map((u) => new URL(u).searchParams.get("id")).sort()).toEqual(["R000000002", "R000000003", "R000000005", "R000000006"]);
    expect(await t.query(internal.parcels.findCoverage, {})).toEqual({ waiting: 0, kept: 2, land: 1, unnumbered: 1, unreadable: 0 });
    const parcels = await t.run(async (ctx) => Object.fromEntries((await ctx.db.query("parcels").collect()).map((p) => [p.cadId, p])));
    expect(Object.keys(parcels).sort()).toEqual(["R000000001", "R000000002", "R000000003"]);
    expect(parcels.R000000002).toMatchObject({ county: "Midland", useCode: "A1", siteAddress: "9708 FM RD 307", owner: "HAUT TROY D", source: "district", marketValueCents: 30_000_000, deedDate: "2019-05-14", districtAt: expect.any(String) });
    // KO Storage's by its owner, with the owners before.
    expect(parcels.R000000003).toMatchObject({ useCode: "F1", kind: "storage", siteAddress: "S NORMAN", owner: "KOSF II MIDLAND LLC", deedDate: "2023-06-01", deeds: [{ seller: "PROPERTY RENEGADES LLC", date: "2023-06-01" }, { seller: "HEJL BETTY TR", date: "2022-03-31" }] });
    const record = await t.query(internal.permits.sourceState, { source: DISTRICT_FILE.source });
    expect(record).toMatchObject({ fetched: 7, added: 4, lastAppliedAt: `${link} (${packed.length} bytes)` });

    // The same file next week: fetched, seen to be the same, and not read again.
    asked.length = 0;
    expect(await t.action(internal.districtFile.importFile, {})).toEqual({ skipped: true, file: `${link} (${packed.length} bytes)` });
    // Next year's file: read, and nothing already noted or kept is noted twice.
    link = "https://midcad.org/wp-content/uploads/2027/08/MidlandCAD2027.zip";
    expect(await t.action(internal.districtFile.importFile, {})).toMatchObject({ parcels: 7, withBuilding: 5, lacking: 2, noted: 0 });

    // The page without the file's link, or a file with no table in it, is recorded as it went.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<p>Maps</p>", { status: 200 })));
    expect(await t.action(internal.districtFile.importFile, {})).toMatchObject({ error: "the district's mapping page has no MidlandCAD file linked" });
    expect((await t.query(internal.permits.sourceState, { source: DISTRICT_FILE.source }))?.error).toContain("no MidlandCAD file");
  });
});
