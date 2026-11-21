import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { auctionDay, isAuctionDay, nextAuction, parseAddresses, recentAuctions, saleLabel } from "./lib/foreclosures";

afterEach(() => vi.useRealTimers());

/** Monday Oct 26, 2026, mid-morning in Midland. */
const NOW = Date.parse("2026-10-26T15:00:00.000Z");

async function addParcel(t: ReturnType<typeof setup>, address: string, owner = "COLE JANE") {
  return await t.run(async (ctx) =>
    ctx.db.insert("parcels", {
      county: "Midland",
      cadId: `R-${address}`,
      useCode: "A1",
      siteAddress: address,
      addressKey: address,
      street: address.replace(/^\d+\s+/, ""),
      owner,
      mailing: { address },
      ownerOccupied: true,
      companyOwned: false,
      marketValueCents: 24_000_000,
      importedAt: "2026-10-25T07:20:00.000Z",
    }),
  );
}

describe("the auction calendar", () => {
  test("the first Tuesday, or the Wednesday after when it falls on January 1 or July 4", () => {
    expect(auctionDay(2026, 11)).toBe("2026-11-03");
    expect(auctionDay(2026, 12)).toBe("2026-12-01");
    expect(auctionDay(2030, 1)).toBe("2030-01-02"); // Jan 1, 2030 is a Tuesday
    expect(auctionDay(2028, 7)).toBe("2028-07-05"); // Jul 4, 2028 is a Tuesday
    expect(isAuctionDay("2026-11-03")).toBe(true);
    expect(isAuctionDay("2026-11-04")).toBe(false);
    expect(isAuctionDay("Nov 3")).toBe(false);
    expect(nextAuction(NOW)).toBe("2026-11-03");
    expect(nextAuction(Date.parse("2026-10-06T20:00:00.000Z"))).toBe("2026-10-06"); // the day of a sale
    expect(recentAuctions(NOW, 3)).toEqual(["2026-11-03", "2026-10-06", "2026-09-01"]);
    expect(parseAddresses(" 2709 Howdy Dr \n\n2709 HOWDY DR\n112 W Spruce Av")).toEqual(["2709 Howdy Dr", "112 W Spruce Av"]);
    expect(saleLabel("2026-11-03")).toBe("Nov 3");
  });
});

describe("the auction list in Ops", () => {
  test("staff paste a sale's homes; they match the roll, repeats are skipped, a wrong date is refused", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const company = await signUp(t, "owner@roof.example");
    await addParcel(t, "2709 HOWDY DR");
    await expect(company.as.mutation(api.foreclosures.addMany, { saleDate: "2026-11-03", kind: "mortgage", addresses: "1 A St" })).rejects.toThrow(/staff/);
    await expect(staff.as.mutation(api.foreclosures.addMany, { saleDate: "2026-11-04", kind: "mortgage", addresses: "1 A St" })).rejects.toThrow(/first Tuesday/);

    expect(
      await staff.as.mutation(api.foreclosures.addMany, { saleDate: "2026-11-03", kind: "mortgage", addresses: "2709 Howdy Drive\n410 Elm St" }),
    ).toEqual({ added: 2, skipped: 0, unmatched: ["410 Elm St"] });
    expect(
      await staff.as.mutation(api.foreclosures.addMany, { saleDate: "2026-11-03", kind: "tax", addresses: "2709 HOWDY DR" }),
    ).toEqual({ added: 0, skipped: 1, unmatched: [] });

    const sale = await staff.as.query(api.foreclosures.sale, {});
    expect(sale.saleDate).toBe("2026-11-03");
    expect(sale.saleDates[0]).toBe("2026-11-03");
    expect(sale.homes.map((h) => [h.address, h.status, h.matched, h.ownerOnRoll])).toEqual([
      ["2709 Howdy Drive", "posted", true, "Cole Jane"],
      ["410 Elm St", "posted", false, undefined],
    ]);
    await expect(company.as.query(api.foreclosures.sale, {})).rejects.toThrow(/staff/);
  });

  test("after the sale: sold with a buyer, back to the lender clears it, and a home can be taken off", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    await staff.as.mutation(api.foreclosures.addMany, { saleDate: "2026-10-06", kind: "mortgage", addresses: "2709 Howdy Dr\n410 Elm St" });
    const [elm, howdy] = (await staff.as.query(api.foreclosures.sale, { saleDate: "2026-10-06" })).homes;

    await expect(staff.as.mutation(api.foreclosures.update, { id: howdy.id, status: "sold", buyer: { name: "Basin Flips", company: true, phone: "555" } })).rejects.toThrow(/10-digit/);
    await staff.as.mutation(api.foreclosures.update, {
      id: howdy.id,
      status: "sold",
      buyer: { name: " Basin Flips LLC ", company: true, phone: "(432) 555-0142" },
      salePriceCents: 14_500_000,
    });
    let homes = (await staff.as.query(api.foreclosures.sale, { saleDate: "2026-10-06" })).homes;
    expect(homes.find((h) => h.id === howdy.id)).toMatchObject({
      status: "sold",
      buyer: { name: "Basin Flips LLC", company: true, phone: "4325550142" },
      salePriceCents: 14_500_000,
    });

    // Changed to back to the lender: the buyer and price go.
    await staff.as.mutation(api.foreclosures.update, { id: howdy.id, status: "back_to_lender" });
    homes = (await staff.as.query(api.foreclosures.sale, { saleDate: "2026-10-06" })).homes;
    const back = homes.find((h) => h.id === howdy.id)!;
    expect(back.status).toBe("back_to_lender");
    expect(back.buyer).toBeUndefined();
    expect(back.salePriceCents).toBeUndefined();

    await staff.as.mutation(api.foreclosures.remove, { id: elm.id });
    expect((await staff.as.query(api.foreclosures.sale, { saleDate: "2026-10-06" })).homes).toHaveLength(1);
  });
});

const proPlan = () => ({
  monthlyCents: 9900,
  claimsIncluded: 10,
  extraClaimCents: 1500,
  status: "active" as const,
  periodStart: "2026-10-01T00:00:00.000Z",
  nextChargeAt: "2026-11-01T00:00:00.000Z",
  claimsThisPeriod: 0,
});

/** Three sales: Nov 3 (next) with 2 posted; Oct 6 with a company buyer, a private buyer and one back to the lender. */
async function auctionMonth(t: ReturnType<typeof setup>, staff: Awaited<ReturnType<typeof signUp>>) {
  const howdy = await addParcel(t, "2709 HOWDY DR", "COLE JANE");
  await addParcel(t, "2711 HOWDY DR", "REYES SAMUEL");
  await staff.as.mutation(api.foreclosures.addMany, { saleDate: "2026-11-03", kind: "mortgage", addresses: "2711 HOWDY DR\n900 Oak Av" });
  await staff.as.mutation(api.foreclosures.addMany, { saleDate: "2026-10-06", kind: "mortgage", addresses: "2709 HOWDY DR\n410 Elm St\n12 Pine St" });
  const homes = (await staff.as.query(api.foreclosures.sale, { saleDate: "2026-10-06" })).homes;
  const id = (address: string) => homes.find((h) => h.address === address)!.id;
  await staff.as.mutation(api.foreclosures.update, { id: id("2709 HOWDY DR"), status: "sold", buyer: { name: "Basin Flips LLC", company: true, phone: "4325550142" }, salePriceCents: 14_500_000 });
  await staff.as.mutation(api.foreclosures.update, { id: id("410 Elm St"), status: "sold", buyer: { name: "Pat Moreno", company: false, phone: "4325550143" } });
  await staff.as.mutation(api.foreclosures.update, { id: id("12 Pine St"), status: "back_to_lender" });
  return { howdy };
}

describe("the auction in the Report and on the call lists", () => {
  test("free sees the counts; Pro sees who bought, with a company's phone but never a private buyer's", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const roofer = await signUp(t, "owner@roof.example");
    await auctionMonth(t, staff);

    const free = await roofer.as.query(api.report.report, { organizationId: roofer.organizationId, county: "Midland" });
    expect(free.auction).toEqual({
      next: { date: "2026-11-03", posted: 2 },
      last: { date: "2026-10-06", posted: 3, sold: 2, backToLender: 1, cancelled: 0 },
      boughtCount: 2,
      bought: undefined,
    });
    const { reportText } = await import("./lib/report");
    const text = reportText(free, { pro: "https://x/vault", web: "https://x/report" });
    expect(text).toContain("COURTHOUSE AUCTION\nNext foreclosure auction Nov 3: 2 homes posted.\nOct 6: 2 sold, 1 back to the lender.");
    expect(text).toContain("2 home(s) were bought at auction in the last 4 months; the Pro report lists them");
    expect(text).not.toContain("Basin Flips");

    await t.run(async (ctx) => ctx.db.patch(roofer.organizationId, { plan: proPlan() }));
    const pro = await roofer.as.query(api.report.report, { organizationId: roofer.organizationId, county: "Midland" });
    expect(pro.auction!.bought).toEqual([
      { address: "2709 HOWDY DR", saleDate: "2026-10-06", priceCents: 14_500_000, buyer: "Basin Flips LLC", phone: "(432) 555-0142" },
      { address: "410 Elm St", saleDate: "2026-10-06", priceCents: undefined, buyer: "a private buyer", phone: undefined },
    ]);
    expect(reportText(pro, { pro: "", web: "" })).toContain("- 2709 HOWDY DR · Oct 6 · $145,000.00 · Basin Flips LLC · (432) 555-0142");

    // Counties without the feed have no auction block.
    expect((await roofer.as.query(api.report.report, { organizationId: roofer.organizationId, county: "Ector" })).auction).toBeUndefined();
  });

  test("callers get the auction buyers to call; the foreclosed homes never show on the other lists", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-27T19:00:00.000Z"), toFake: ["Date"] });
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    await auctionMonth(t, staff);
    const neighbor = await addParcel(t, "2715 HOWDY DR", "HALL JAMES");

    const buyers = await staff.as.query(api.calls.list, { kind: "auction_buyers", trade: "roofing" });
    expect(buyers.homes.map((h) => [h.owner, h.phone, h.address, h.why])).toEqual([
      ["Basin Flips LLC", "4325550142", "2709 Howdy Dr", "Bought at the Oct 6 courthouse auction for $145,000"],
      ["Pat Moreno", "4325550143", "410 Elm St", "Bought at the Oct 6 courthouse auction"],
    ]);

    // The street list leaves off the sold home (2709) and the one posted for Nov 3 (2711): only the neighbor is left.
    const street = await staff.as.query(api.calls.list, { kind: "street", street: "Howdy Dr" });
    expect(street.homes.map((h) => h.parcelId)).toEqual([neighbor]);

    // A buyer called recently drops off the auction list.
    await staff.as.mutation(api.calls.log, { phone: "4325550142", outcome: "not_interested", address: "2709 Howdy Dr" });
    expect((await staff.as.query(api.calls.list, { kind: "auction_buyers", trade: "roofing" })).homes.map((h) => h.owner)).toEqual(["Pat Moreno"]);
  });
});
