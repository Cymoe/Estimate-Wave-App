import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.setup";
import { MIDLAND_GAPS, atAddress, districtParcel, districtProperty, districtSearchRows, districtStreet, isStorageParcel, nameKey, nameSearch, storageOperator, codeFromBuildings } from "./lib/parcels";
import { DEED_PACE } from "./parcels";

const pace = { ...DEED_PACE };
beforeEach(() => {
  DEED_PACE.waitMs = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  Object.assign(DEED_PACE, pace);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A row of the appraisal district's address search, as its page writes one (copied from the live search for 200 Norman). */
const result = (id: string, owner: string, address: string, value: string) =>
  `<tr>
		<td align="left"><a id="ucResultsGrid_${id}" href="javascript:WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions(&quot;ucResultsGrid$${id}&quot;, &quot;&quot;, false, &quot;&quot;, &quot;webProperty.aspx?dbkey=MIDLANDCAD&amp;id=${id}&quot;, false, true))"><u>View Property</u></a></td><td align="right">${id}</td><td align="right">00003910.033.3700</td><td align="left">${owner}</td><td align="left">${address}</td><td align="left">Acres: 1.080,  SW/4, SEC:  33, BLK:  39-T1S</td><td align="right">${value}</td><td><a name="${id}">&nbsp;</a></td>
	</tr>`;
const searchPage = (rows: string[], n = rows.length) => `<html><body><table><tr><td>
  <span>Your search of ' NORMAN | 200 | ' returned ${n} result(s)</span>
  <div id="dvPrimary"><table width="100%">
	<tr>
		<th align="left">Details</th><th align="right">Property ID</th><th align="right">Geographic ID</th><th align="left">Owner Name</th><th align="left">Address</th><th align="left">Legal</th><th align="right">Market Value</th>
	</tr>${rows.join("")}
  </table></div></td></tr></table></body></html>`;
const NORMAN = searchPage([
  result("R000004331", "KOSF II MIDLAND LLC", "NORMAN   200   S", "$148,420"),
  result("R000207001", "KOSF II MIDLAND LLC", "NORMAN   200   S", "$148,420"),
  result("R000039656", "NEIFING KORBEY", "NORMANDY LN   1700  ", "$446,630"),
  // A business's equipment at an address isn't the property.
  result("P000215548", "CURSHAW SERVICES LLC", "NORMANDY LN   1711  ", "$0"),
  result("R000039663", "WIGGINS LESLIE D", "NORMANDY LN   1711  ", "$409,940"),
]);

/** The district's property page, the parts read (copied from the live pages for 200 S Norman and a home). */
const propertyPage = (o: { owner: string; mail: string; interest?: string; built: Array<[string, string]>; improvements: string; deeds: Array<[string, string, string]> }) => `<html><body>
  <table><tbody>
    <tr> <td id="webprop_name" valign="top">${o.owner}</td> </tr>
    <tr> <td id="webprop_mailaddress" valign="top">${o.mail}</td> </tr>
    <tr> <td id="webprop_interest" valign="top">Ownership Interest: ${o.interest ?? "1.0000000"}</td> </tr>
    <tr> <td id="webprop_situs" valign="top">Situs: NORMAN   200   S</td> </tr>
  </tbody></table>
  <table><tr> <th align="left">Values by Year</th> <th></th> <th id="hist0_yr" class="style1">2026</th> <th id="hist1_yr" class="style1">2025</th> </tr>
    <tr><td>Improvements</td><td>+</td><td>${o.improvements}</td><td>$126,810</td></tr><tr><td>Land</td><td>+</td><td>$23,529</td><td>$23,529</td></tr></table>
  <table><tbody id="tableBld">${o.built.map(([code, what], i) => `<tr><td align='left'>${101 + i}</td><td align='left'>${code}</td><td align='left'>${what}</td><td align='right'>1973</td><td align='right'>4,368</td><td align='right'>412</td></tr>`).join("")}</tbody></table>
  <table><tbody id="tableLnd"><tr><td align='left'>CR00L</td><td align='right'>1.080</td><td align='right'>47,058</td></tr></tbody></table>
  <table class="propertyDetails" summary="Deed History"><tbody id="tableSale">${o.deeds.map(([who, date, inst]) => `<tr><td align='left'>${who}</td><td align='right'></td><td align='right'></td><td align='right'>${date}</td><td align='left'>${inst}</td></tr>`).join("")}</tbody></table>
</body></html>`;
const ATLAS = propertyPage({
  owner: "KOSF II MIDLAND LLC",
  mail: "10301 WAYZATA BLVD<br/>MINNETONKA, MN 55305",
  interest: "0.5000000",
  built: [["COMM", "COMM BLDG"], ["COMM", "COMM BLDG"], ["PKLT", "PARKING LT"]],
  improvements: "$136,650",
  deeds: [["PROPERTY RENEGADES LLC", "6/1/2023", "2023-13086"], ["HEJL BETTY TR", "3/31/2022", "2022-9376"], ["HEJL JEROME C", "4/8/2010", "2010-6398"]],
});
const HOME = propertyPage({ owner: "NEIFING KORBEY", mail: "1700 NORMANDY LN<br/>MIDLAND, TX 79705", built: [["RES", "RESIDENCE"], ["GAR", "ATTACHED GARAGE FINISED"]], improvements: "$416,930", deeds: [["SMITH JOHN &", "6/27/2019", "2019-1"]] });

/** The district's site answering by street searched and by property id; `asked` is every request made, in order. */
function district(searches: Record<string, () => Response>, pages: Record<string, () => Response>) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("webSearchName.aspx")) {
        const name = u.searchParams.get("sdata")!;
        asked.push(`name ${name}`);
        return (searches[`name:${name}`] ?? (() => new Response(searchPage([], 0), { status: 200 })))();
      }
      if (u.pathname.endsWith("webSearchAddress.aspx")) {
        const street = u.searchParams.get("sdata")!.split("|")[0];
        asked.push(`search ${street}`);
        return (searches[street] ?? (() => new Response(searchPage([], 0), { status: 200 })))();
      }
      const id = u.searchParams.get("id")!;
      asked.push(`page ${id}`);
      return (pages[id] ?? (() => new Response("gone", { status: 404 })))();
    }),
  );
  return asked;
}
const ok = (html: string) => () => new Response(html, { status: 200 });
const gap = (number: string, street: string, over: Record<string, unknown> = {}) => ({ county: "Midland", addressKey: `${number} ${street}`, number, street, state: "waiting" as const, seenAt: "2026-11-11T00:00:00.000Z", ...over });

describe("Midland's blank parcels, looked up at the appraisal district", () => {
  test("the district's search lists a street's properties; a row is at an address by its number and its street's name", () => {
    const rows = districtSearchRows(NORMAN)!;
    // Real property only, each id once.
    expect(rows.map((r) => r.id)).toEqual(["R000004331", "R000207001", "R000039656", "R000039663"]);
    expect(rows[0]).toEqual({ id: "R000004331", owner: "KOSF II MIDLAND LLC", street: "NORMAN", number: "200", dir: "S", marketValueCents: 14_842_000 });
    expect(rows[2]).toEqual({ id: "R000039656", owner: "NEIFING KORBEY", street: "NORMANDY LN", number: "1700", marketValueCents: 44_663_000 });
    // 200 Norman is both of KO's accounts and nothing on Normandy Lane; the street's type is the district's to add.
    expect(rows.filter((r) => atAddress(r, "200", "NORMAN")).map((r) => r.id)).toEqual(["R000004331", "R000207001"]);
    expect(rows.filter((r) => atAddress(r, "1700", "NORMAN"))).toEqual([]);
    expect(rows.filter((r) => atAddress(r, "1700", "Normandy")).map((r) => r.id)).toEqual(["R000039656"]);
    // The direction decides only when both sides give one.
    expect(atAddress(rows[0], "200", "NORMAN", "S")).toBe(true);
    expect(atAddress(rows[0], "200", "NORMAN", "N")).toBe(false);
    expect(atAddress({ ...rows[0], number: "0" }, "0", "NORMAN")).toBe(false);
    // A street with nothing on it is an empty list; a page that isn't a search result is no answer.
    expect(districtSearchRows(searchPage([], 0))).toEqual([]);
    expect(districtSearchRows("<html><body>Welcome</body></html>")).toBeUndefined();
    expect(MIDLAND_GAPS.search("NORMAN", "200")).toBe("https://iswdataclient.azurewebsites.net/webSearchAddress.aspx?dbkey=MIDLANDCAD&stype=situs&sdata=NORMAN%7C200%7C");
  });

  test("the district's page gives the owner, where their bill goes, what's built and the deeds; that makes the parcel", () => {
    const page = districtProperty(ATLAS)!;
    expect(page).toMatchObject({ owner: "KOSF II MIDLAND LLC", mailing: { address: "10301 WAYZATA BLVD", city: "MINNETONKA", state: "MN", zip: "55305" }, buildings: ["COMM", "PKLT"], buildingValueCents: 13_665_000 });
    expect(page.deeds.map((d) => [d.seller, d.date])).toEqual([["PROPERTY RENEGADES LLC", "2023-06-01"], ["HEJL BETTY TR", "2022-03-31"], ["HEJL JEROME C", "2010-04-08"]]);
    expect(districtProperty("<html><body>Property not found</body></html>")).toBeUndefined();
    // What's built says what it is: a commercial building, a house, or land alone (which isn't kept).
    expect(codeFromBuildings(["COMM", "PKLT"])).toBe("F1");
    expect(codeFromBuildings(["RES", "GAR"])).toBe("A1");
    expect(codeFromBuildings(["PKLT"])).toBeUndefined();
    expect(codeFromBuildings([])).toBeUndefined();

    // Two half-interest accounts are one property, valued once.
    const accounts = districtSearchRows(NORMAN)!.slice(0, 2);
    const parcel = districtParcel(accounts, page)!;
    expect(parcel).toMatchObject({ cadId: "R000004331", useCode: "F1", siteAddress: "200 S NORMAN", addressKey: "200 S NORMAN", owner: "KOSF II MIDLAND LLC", companyOwned: true, ownerOccupied: false, marketValueCents: 14_842_000, deedDate: "2023-06-01" });
    // KO's LLC doesn't say "storage" and this land isn't coded mini-storage: the owner being a storage operator does.
    expect(isStorageParcel(parcel)).toBe(true);
    expect(isStorageParcel({ useCode: "A1", owner: "KOSF II MIDLAND LLC" })).toBe(false);
    // The company behind Atlas Self Storage, by the name people knew it.
    expect(storageOperator("PROPERTY RENEGADES LLC")).toBe("Atlas Self Storage");
    // A home is lived in by its owner when the bill goes there.
    expect(districtParcel(districtSearchRows(NORMAN)!.slice(2, 3), districtProperty(HOME)!)).toMatchObject({ cadId: "R000039656", useCode: "A1", siteAddress: "1700 NORMANDY LN", ownerOccupied: true, companyOwned: false, deedDate: "2019-06-27" });
    expect(districtParcel(accounts, { ...page, buildings: ["PKLT"] })).toBeUndefined();
  });

  test("each waiting address is looked up once, a street at a time; what's found becomes a parcel with its deed history", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      for (const g of [gap("12", "ELM"), gap("200", "NORMAN"), gap("999", "NORMAN"), gap("1700", "NORMANDY"), gap("1711", "NORMANDY")]) await ctx.db.insert("parcelGaps", g);
      // The city's own read already has 1711 Normandy Ln: it is left alone.
      await ctx.db.insert("parcels", { county: "Midland", cadId: "R000039663", useCode: "A1", siteAddress: "1711 NORMANDY LN", addressKey: "1711 NORMANDY LN", owner: "WIGGINS LESLIE D", mailing: {}, ownerOccupied: true, companyOwned: false, importedAt: "2026-11-01" });
    });
    const asked = district(
      // Elm's search is broken; the next reads fine, so the trouble is that street's.
      { ELM: () => new Response("oops", { status: 500 }), NORMAN: ok(NORMAN), NORMANDY: ok(NORMAN) },
      { R000004331: ok(ATLAS), R000039656: ok(HOME) },
    );
    expect(await t.action(internal.parcels.fillGaps, {})).toEqual({ waiting: 0, looked: 5, added: 2, none: 3 });
    // One search a street, one page an owner: KO's second account isn't read again, nor the parcel the city has.
    expect(asked).toEqual(["search ELM", "search NORMAN", "page R000004331", "search NORMANDY", "page R000039656"]);
    await t.run(async (ctx) => {
      const by = Object.fromEntries((await ctx.db.query("parcels").collect()).map((p) => [p.cadId, p]));
      expect(Object.keys(by).sort()).toEqual(["R000004331", "R000039656", "R000039663"]);
      expect(by.R000004331).toMatchObject({ county: "Midland", source: "district", owner: "KOSF II MIDLAND LLC", useCode: "F1", kind: "storage", siteAddress: "200 S NORMAN", deedDate: "2023-06-01", deedsReadFor: "2023-06-01", marketValueCents: 14_842_000 });
      expect(by.R000004331.deeds?.map((d) => d.seller)).toEqual(["PROPERTY RENEGADES LLC", "HEJL BETTY TR", "HEJL JEROME C"]);
      // Filed under its owner like any parcel, so the owner's sheet lists it.
      expect(by.R000004331.ownerKey).toBeTruthy();
      expect(by.R000039656).toMatchObject({ source: "district", useCode: "A1", ownerOccupied: true });
      expect(by.R000039656.kind).toBeUndefined();
      expect(by.R000039663.source).toBeUndefined();
      const gaps = Object.fromEntries((await ctx.db.query("parcelGaps").collect()).map((g) => [g.addressKey, [g.state, g.cadIds, g.why ?? null]]));
      // Why nothing was kept is kept too: the district has nothing at 999 Norman; the city already holds 1711 Normandy.
      expect(gaps).toEqual({ "12 ELM": ["none", [], null], "200 NORMAN": ["found", ["R000004331"], null], "999 NORMAN": ["none", [], "absent"], "1700 NORMANDY": ["found", ["R000039656"], null], "1711 NORMANDY": ["none", [], "held"] });
      const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-gaps")).unique();
      expect(sync).toMatchObject({ fetched: 5, added: 2, updated: 3 });
    });
    expect(await t.query(internal.parcels.gapCoverage, {})).toEqual({ waiting: 0, found: 2, none: 3, held: 1, land: 0, absent: 1, storageFilled: 1, industrialFilled: 0 });
    expect(await t.query(internal.parcels.gapSample, { state: "none", every: 2 })).toHaveLength(2);
    // The storage parcel's history was read in the same visit: the deed read has nothing to ask for.
    expect((await t.query(internal.parcels.deedsDue, { limit: 10 })).left).toBe(0);

    // Nothing is asked for twice.
    asked.length = 0;
    expect(await t.action(internal.parcels.fillGaps, {})).toMatchObject({ looked: 0, added: 0 });
    expect(asked).toEqual([]);

    // When the city's read has the parcel after all, its row takes over.
    await t.mutation(internal.parcels.upsert, {
      rows: [{ cadId: "R000004331", useCode: "F1", landUse: "CWH03", siteAddress: "200 S NORMAN AV", addressKey: "200 S NORMAN AV", looseKey: "200 NORMAN", owner: "KOSF II MIDLAND LLC", mailing: { address: "10301 WAYZATA BLVD", city: "MINNETONKA", state: "MN", zip: "55305" }, ownerOccupied: false, companyOwned: true, deedDate: "2023-06-01" }],
    });
    const taken = await t.run(async (ctx) => (await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", "R000004331")).unique())!);
    expect(taken.source).toBeUndefined();
    expect(taken).toMatchObject({ siteAddress: "200 S NORMAN AV", kind: "storage" });
    // The deed history it was given stays.
    expect(taken.deeds).toHaveLength(3);
  });

  test("one address can be looked up at once; a refusal stops everything where it is", async () => {
    const t = setup();
    // The site's first answer is sometimes its front page: the search is asked once more.
    let first = true;
    const frontPageOnce = () => {
      const html = first ? "<html><head><title>Midland CAD</title></head><body>Welcome</body></html>" : NORMAN;
      first = false;
      return new Response(html, { status: 200 });
    };
    let asked = district({ NORMAN: frontPageOnce }, { R000004331: ok(ATLAS) });
    expect(await t.action(internal.parcels.fillAddress, { number: "200", street: "norman" })).toEqual({ added: 1, found: ["R000004331"] });
    expect(asked).toEqual(["search NORMAN", "search NORMAN", "page R000004331"]);
    // The front page twice is no answer, and says what came back.
    asked = district({ NORMAN: ok("<html><head><title>Midland CAD</title></head><body>Welcome</body></html>") }, {});
    expect(await t.action(internal.parcels.fillAddress, { number: "200", street: "NORMAN" })).toMatchObject({ added: 0, error: expect.stringContaining('titled "Midland CAD"') });
    asked = district({ NORMAN: ok(NORMAN) }, { R000004331: ok(ATLAS) });
    expect(await t.action(internal.parcels.fillAddress, { number: "5", street: "NORMAN" })).toEqual({ added: 0, found: [] });

    await t.run(async (ctx) => {
      for (const g of [gap("1", "ASH"), gap("2", "BIRCH"), gap("3", "CEDAR")]) await ctx.db.insert("parcelGaps", g);
    });
    asked = district({ ASH: () => new Response("slow down", { status: 429 }) }, {});
    const refused = await t.action(internal.parcels.fillGaps, {});
    expect(refused.error).toBe("Midland blank parcels: the district's site refused the read (HTTP 429)");
    // One request, and no more: nothing is retried or worked around, and nothing is marked looked up.
    expect(asked).toEqual(["search ASH"]);
    await t.run(async (ctx) => {
      expect((await ctx.db.query("parcelGaps").collect()).every((g) => g.state === "waiting")).toBe(true);
      const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-gaps")).unique();
      expect(sync!.error).toContain("refused");
    });
  });

  test("an owner looked up by name: what else the district shows them holding, however the address is written", async () => {
    // A numbered road as the district writes it, from the city's address point.
    expect(districtStreet("307", "8910 F M 307")).toBe("FM RD 00307");
    expect(districtStreet("116", "4400 W C R 116")).toBe("COUNTY RD 116");
    expect(districtStreet("0080", "9707 E HWY 80")).toBe("HWY 80");
    expect(districtStreet("Marlin", "1120 MARLIN AV")).toBe("MARLIN");
    const fm = { id: "R000231272", owner: "KOSF II-MIDLAND LLC", street: "FM RD 00307", number: "8910" };
    expect(atAddress(fm, "8910", "FM RD 307")).toBe(true);
    expect(atAddress(fm, "8910", "FM RD 00307")).toBe(true);
    expect(atAddress(fm, "8910", "FM RD 3070")).toBe(false);
    // The district's spelling of a name and the roll's are one owner; the search goes by the first words.
    expect(nameKey("KOSF II-MIDLAND LLC")).toBe(nameKey("KOSF II MIDLAND LLC"));
    expect(nameSearch("KOSF II MIDLAND LLC")).toBe("KOSF II");
    expect(nameSearch("MIDLAND LOCK STORAGE LLC")).toBe("MIDLAND LOCK STORAGE");
    expect(MIDLAND_GAPS.byName("KOSF II")).toBe("https://iswdataclient.azurewebsites.net/webSearchName.aspx?dbkey=MIDLANDCAD&stype=name&sdata=KOSF%20II");

    const t = setup();
    await t.run(async (ctx) => {
      // What the app has of KO's: one storage parcel. And an industrial owner with nothing more at the district.
      await ctx.db.insert("parcels", { county: "Midland", cadId: "R000046605", useCode: "F1", landUse: "CWH03", kind: "storage", siteAddress: "1001 S L ST", addressKey: "1001 S L ST", owner: "KOSF II MIDLAND LLC", mailing: {}, ownerOccupied: false, companyOwned: true, importedAt: "2026-11-01" });
      await ctx.db.insert("parcels", { county: "Midland", cadId: "R9", useCode: "F2", kind: "industrial", siteAddress: "5 PIPE RD", addressKey: "5 PIPE RD", owner: "PERMIAN PIPE LLC", mailing: {}, ownerOccupied: false, companyOwned: true, importedAt: "2026-11-01" });
    });
    const KO_NAMES = searchPage([
      result("R000046605", "KOSF II MIDLAND LLC", "L ST   1001   S", "$343,200"),
      // Missing from the app: the city's layer has it blank, and writes the address "8910 F M 307".
      result("R000231272", "KOSF II-MIDLAND LLC", "FM RD 00307   8910  ", "$2,206,550"),
      // A lot with no street number can't be told from the next one: left for the address fill.
      result("R000004273", "KOSF II MIDLAND LLC", "INDUSTRIAL AV   0   W", "$237,930"),
      // Another company whose name starts the same.
      result("R000004545", "KOSF III MIDLAND LLC", "INDUSTRIAL LOOP   60  ", "$395,110"),
      result("P000000121", "KOSF II MIDLAND LLC", "INDUSTRIAL AV   3013   W", "$9,800"),
    ]);
    const FM307 = propertyPage({ owner: "KOSF II-MIDLAND LLC", mail: "10301 WAYZATA BLVD<br/>MINNETONKA, MN 55305", built: [["COMM", "COMM BLDG"]], improvements: "$1,900,000", deeds: [["RIGHT LIGHT SERVICES LLC", "9/12/2025", "2025-1"]] });
    const asked = district({ "name:KOSF II": ok(KO_NAMES) }, { R000231272: ok(FM307) });
    expect(await t.action(internal.parcels.fillOwners, {})).toEqual({ owners: 2, asked: 2, added: 1, skipped: 0, addedTo: ["KOSF II MIDLAND LLC"] });
    // One search an owner, and a page only for what's missing.
    expect(asked).toEqual(["name KOSF II", "page R000231272", "name PERMIAN PIPE LLC"]);
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", "R000231272")).unique())!;
      expect(p).toMatchObject({ source: "district", owner: "KOSF II-MIDLAND LLC", siteAddress: "8910 FM RD 00307", useCode: "F1", kind: "storage", marketValueCents: 220_655_000, deedDate: "2025-09-12" });
      expect(p.deeds?.[0].seller).toBe("RIGHT LIGHT SERVICES LLC");
      expect(await ctx.db.query("parcels").collect()).toHaveLength(3);
      const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-owner-check")).unique();
      expect(sync).toMatchObject({ fetched: 2, added: 1 });
    });
    // Asked again, there is nothing new; one owner can be asked about by name.
    asked.length = 0;
    expect(await t.action(internal.parcels.fillOwners, { names: ["KOSF II MIDLAND LLC"] })).toMatchObject({ owners: 1, asked: 1, added: 0 });
    expect(asked).toEqual(["name KOSF II"]);
  });

  test("the listing: blank shapes on the city's layer, the addresses inside them, and the gaps the city has since filled", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      // Looked up before and found; the city has since filled that shape, so this listing doesn't see it.
      await ctx.db.insert("parcelGaps", gap("7", "OAK", { state: "found", cadIds: ["R7"], seenAt: "2026-11-01T00:00:00.000Z" }));
      // Nothing found long ago: asked again. Nothing found last week: left.
      await ctx.db.insert("parcelGaps", gap("300", "PINE", { addressKey: "300 S PINE ST", dir: "S", state: "none", lookedUpAt: "2026-06-01T00:00:00.000Z" }));
      await ctx.db.insert("parcelGaps", gap("302", "PINE", { addressKey: "302 S PINE ST", dir: "S", state: "none", lookedUpAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() }));
    });
    const square = (x: number, y: number) => ({ geometry: { rings: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]]] } });
    const point = (x: number, y: number, n: string, name: string, type = "ST", dir = "") => ({ attributes: { ADDR_HN: n, ADDR_PD: dir, ADDR_SN: name, ADDRESS: `${n} ${dir ? `${dir} ` : ""}${name} ${type}` }, geometry: { x, y } });
    const asks: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        const params = new URLSearchParams(init?.body ?? new URL(url).search);
        if (url.includes("EsiteAddr")) {
          asks.push("addresses");
          return new Response(
            JSON.stringify({
              features: [
                point(-102.1087, 31.9818, "200", "NORMAN", "AV"),
                // Inside no blank shape.
                point(-102.2, 31.9, "5", "ELM"),
                // A tract with many address points is looked up by three of them.
                ...["300", "302", "304", "306"].map((n) => point(-102.0495, 31.9505, n, "PINE", "ST", "S")),
                // No house number: nothing to look up.
                point(-102.1087, 31.9818, " ", "NORMAN"),
              ],
            }),
            { status: 200 },
          );
        }
        if (params.get("returnIdsOnly")) {
          expect(params.get("where")).toBe("OWNER IS NULL");
          return new Response(JSON.stringify({ objectIds: [11, 12] }), { status: 200 });
        }
        asks.push(`shapes ${params.get("objectIds")}`);
        return new Response(JSON.stringify({ features: [square(-102.109, 31.9815), square(-102.05, 31.95)] }), { status: 200 });
      }),
    );
    expect(await t.action(internal.parcels.findGaps, { thenFill: false })).toEqual({ blank: 2, addresses: 4, added: 2 });
    expect(asks).toEqual(["shapes 11,12", "addresses"]);
    const gaps = await t.run(async (ctx) => Object.fromEntries((await ctx.db.query("parcelGaps").collect()).map((g) => [g.addressKey, [g.state, g.number, g.street, g.dir ?? null]])));
    expect(gaps).toEqual({
      "200 NORMAN AV": ["waiting", "200", "NORMAN", null],
      // Asked again after three months; the one asked last week waits; a third address of the tract is new.
      "300 S PINE ST": ["waiting", "300", "PINE", "S"],
      "302 S PINE ST": ["none", "302", "PINE", "S"],
      "304 S PINE ST": ["waiting", "304", "PINE", "S"],
    });
  });

  test("a spot check of houses: the app's owner and mailing address against the district's page today", async () => {
    const t = setup();
    const home = (cadId: string, siteAddress: string, owner: string, over: Record<string, unknown> = {}) => ({
      county: "Midland", cadId, useCode: "A1", siteAddress, addressKey: siteAddress, owner, mailing: { address: siteAddress, city: "MIDLAND", state: "TX", zip: "79705" },
      ownerOccupied: true, companyOwned: false, importedAt: "2026-01-01T00:00:00.000Z", ...over,
    });
    const page = (owner: string, mail: string) => ok(propertyPage({ owner, mail, built: [["RES", "RESIDENCE"]], improvements: "$200,000", deeds: [] }));
    await t.run(async (ctx) => {
      // The same on both sides, the zip written longer at the district.
      await ctx.db.insert("parcels", home("R000000001", "100 ASH ST", "NEIFING KORBEY"));
      // Two owners the roll splits across its fields.
      await ctx.db.insert("parcels", home("R000000002", "200 BIRCH ST", "MATHES JOE", { owner2: "MATHES MARY" }));
      // Sold since the roll was read.
      await ctx.db.insert("parcels", home("R000000003", "300 CEDAR ST", "OLD OWNER LLC"));
      // The bill goes somewhere new.
      await ctx.db.insert("parcels", home("R000000004", "400 DATE ST", "WIGGINS LESLIE D"));
      // The district's page is gone.
      await ctx.db.insert("parcels", home("R000000005", "500 ELM ST", "NOBODY HOME"));
      // Not a house, and one the gap fill added: neither is sampled.
      await ctx.db.insert("parcels", home("R000000006", "600 FIR ST", "SHOP LLC", { useCode: "F1" }));
      await ctx.db.insert("parcels", home("R000000007", "700 GUM ST", "FILLED IN", { source: "district" }));
    });
    const asked = district({}, {
      R000000001: page("NEIFING KORBEY", "100 ASH ST<br/>MIDLAND, TX 79705-1234"),
      R000000002: page("MATHES JOE & MARY", "200 BIRCH ST<br/>MIDLAND, TX 79705"),
      R000000003: page("NEW BUYER JANE", "300 CEDAR ST<br/>MIDLAND, TX 79705"),
      R000000004: page("WIGGINS LESLIE D", "PO BOX 12<br/>ODESSA, TX 79760"),
    });
    const sample = await t.query(internal.parcels.homeSample, { keys: ["1", "1", "3", "9"], n: 10 });
    // Each key gives the first house at or after it that isn't already taken: four keys, and the last is past them all.
    expect(sample.map((p) => p.cadId)).toEqual(["R000000001", "R000000002", "R000000003"]);
    const result = await t.action(internal.parcels.checkHomes, { n: 200 });
    expect(result.sampled).toBeGreaterThan(0);
    expect(result.checked + result.unreadable).toBe(result.sampled);
    expect(asked.every((a) => /^page R00000000[1-5]$/.test(a))).toBe(true);
    for (const d of result.differences) {
      if (d.id === "R000000003") expect(d).toEqual({ address: "300 CEDAR ST", id: "R000000003", owner: { app: "OLD OWNER LLC", district: "NEW BUYER JANE" } });
      else if (d.id === "R000000004") expect(d).toEqual({ address: "400 DATE ST", id: "R000000004", mailing: { app: "400 DATE ST, MIDLAND, TX, 79705", district: "PO BOX 12, ODESSA, TX, 79760" } });
      else throw new Error(`Not a difference: ${d.id}`);
    }
    expect(result.bothSame).toBe(result.checked - result.differences.length);

    // A refusal stops the check where it is.
    const again = district({}, { R000000001: () => new Response("no", { status: 403 }), R000000002: () => new Response("no", { status: 403 }), R000000003: () => new Response("no", { status: 403 }), R000000004: () => new Response("no", { status: 403 }), R000000005: () => new Response("no", { status: 403 }) });
    const stopped = await t.action(internal.parcels.checkHomes, {});
    expect(stopped).toMatchObject({ checked: 0, refused: "the district's site refused the read (HTTP 403)" });
    expect(again).toHaveLength(1);
  });

  test("a spot check of coverage: of the houses the district has, how many the app has", async () => {
    const t = setup();
    expect(await t.action(internal.parcels.checkCoverage, {})).toEqual({ error: "No Midland parcels to check against" });
    const parcel = (cadId: string, county = "Midland") => ({ county, cadId, useCode: "A1", siteAddress: "1 A ST", addressKey: "1 A ST", owner: "X", mailing: {}, ownerOccupied: true, companyOwned: false, importedAt: "2026-01-01T00:00:00.000Z" });
    await t.run(async (ctx) => {
      await ctx.db.insert("parcels", parcel("R000000001"));
      await ctx.db.insert("parcels", parcel("R000000004"));
      // Another county's ids, and one BatchData gave, don't set the range.
      await ctx.db.insert("parcels", parcel("R999999", "Lubbock"));
      await ctx.db.insert("parcels", parcel("bd:abc"));
    });
    expect(await t.query(internal.parcels.cadRange, {})).toEqual({ low: 1, high: 4 });
    const house = ok(propertyPage({ owner: "SMITH JOHN", mail: "1 A ST<br/>MIDLAND, TX 79705", built: [["RES", "RESIDENCE"]], improvements: "$1", deeds: [] }));
    const lot = ok(propertyPage({ owner: "LAND CO", mail: "1 A ST<br/>MIDLAND, TX 79705", built: [], improvements: "$0", deeds: [] }));
    // 1: a house the app has. 2: a house it lacks. 3: land. 4: no page.
    const asked = district({}, { R000000001: house, R000000002: house, R000000003: lot });
    const result = await t.action(internal.parcels.checkCoverage, { n: 50 });
    expect(asked.slice().sort()).toEqual(["page R000000001", "page R000000002", "page R000000003", "page R000000004"]);
    expect(result).toEqual({ read: 4, noPage: 1, notAHouse: 1, houses: 2, inApp: 1, lacking: [{ id: "R000000002", owner: "SMITH JOHN", city: "MIDLAND" }] });
  });
});
