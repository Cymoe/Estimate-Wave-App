import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { isEstateOwner } from "./lib/parcels";
import { rollAccount, rollColumns } from "./lib/districtRoll";
import { homesteadChange } from "./parcels";
import { setup } from "./test.setup";

describe("what the rolls say about an owner likely to sell", () => {
  test("an estate or heirs on the roll; a real estate business or a name with EST in it isn't one", () => {
    for (const owner of ["ESTATE OF MARY JONES", "JONES MARY EST", "HEIRS OF R L SMITH", "SMITH R L HEIRS", "JONES MARY DECD", "JONES MARY DEC'D", "JONES MARY LIFE ESTATE", "JONES M EST."])
      expect(isEstateOwner(owner), owner).toBe(true);
    for (const owner of ["WESTERN JOHN", "ESTRADA MARIA", "PERMIAN REAL ESTATE", "JONES MARY", "ESTES ROBERT", undefined])
      expect(isEstateOwner(owner), String(owner)).toBe(false);
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
