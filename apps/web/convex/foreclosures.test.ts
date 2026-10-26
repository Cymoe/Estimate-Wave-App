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
