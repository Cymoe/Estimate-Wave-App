import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { OwnerGrouper, familyKey, ownerKey, rekeyOwner, type Condensed } from "./lib/outreach";

const MAIL = { address: "10301 WAYZATA BLVD", city: "MINNETONKA", state: "MN", zip: "55305" };
const parcel = (id: string, owner: string, siteAddress: string): Condensed => ({ id, siteAddress, useCode: "F1", owner, mailing: MAIL, ownerOccupied: false, companyOwned: true, marketValueCents: 100_000_00 });

describe("one owner however the district spells the name", () => {
  test("a hyphen or a slash in a name is read as a space; a company's numbering still makes its family", () => {
    expect(ownerKey("KOSF II-MIDLAND LLC")).toBe(ownerKey("KOSF II MIDLAND LLC"));
    expect(ownerKey("SMITH/JONES PARTNERS")).toBe("SMITH JONES PARTNERS");
    expect(ownerKey("Smith, John &")).toBe("SMITH JOHN");
    expect(familyKey("NUKA HIVA ALPHA 1-54 LLC")).toBe("NUKA HIVA ALPHA");
    expect(familyKey("Nuka Hiva Alpha 55-106, LLC")).toBe("NUKA HIVA ALPHA");
  });

  test("KO Storage's two spellings are one owner with every property", () => {
    const grouper = new OwnerGrouper(new Set());
    grouper.addAll([parcel("a", "KOSF II MIDLAND LLC", "200 S NORMAN"), parcel("b", "KOSF II MIDLAND LLC", "1001 S L ST"), parcel("c", "KOSF II-MIDLAND LLC", "8910 FM RD 307")]);
    const rows = [...grouper.rows()];
    expect(rows).toHaveLength(1);
    expect(rows[0].owner.parcels).toBe(3);
    expect(OwnerGrouper.keyFor({ owner: "KOSF II-MIDLAND LLC", mailing: MAIL })).toBe(OwnerGrouper.keyFor({ owner: "KOSF II MIDLAND LLC", mailing: MAIL }));
  });

  test("a saved key is written as it would be today; keys not made from a name are left alone", () => {
    expect(rekeyOwner("KOSF II-MIDLAND LLC|10301 WAYZATA BLVD 55305")).toBe("KOSF II MIDLAND LLC|10301 WAYZATA BLVD 55305");
    expect(rekeyOwner("seller:SMITH-JONES LLC")).toBe("seller:SMITH JONES LLC");
    for (const k of ["office:10301 WAYZATA BLVD", "contractor:ACME-ROOFING", "occupant:A-1 TIRES", "realtor:0123456", "KOSF II MIDLAND LLC|10301"]) expect(rekeyOwner(k)).toBe(k);
  });

  test("saved contacts take the new key, so a company's notes stay with the owner; one already there is left as it is", async () => {
    const t = setup();
    const co = await signUp(t, "owner@roof.example");
    const other = await signUp(t, "owner@paint.example");
    const contact = (organizationId: typeof co.organizationId, key: string, note?: string) => ({ organizationId, key, name: "Kosf II Midland LLC", mailing: MAIL, properties: 1, totalValueCents: 0, why: "", kinds: [], listIds: [], status: "new" as const, createdAt: "2026-11-01T00:00:00.000Z", ...(note ? { note } : {}) });
    const ids = await t.run(async (ctx) => ({
      hyphen: await ctx.db.insert("outreachContacts", contact(co.organizationId, "KOSF II-MIDLAND LLC|10301 WAYZATA BLVD", "Called Tuesday")),
      office: await ctx.db.insert("outreachContacts", contact(co.organizationId, "office:10301 WAYZATA BLVD")),
      // Another company has both spellings saved: neither is touched.
      both: await ctx.db.insert("outreachContacts", contact(other.organizationId, "KOSF II-MIDLAND LLC|10301 WAYZATA BLVD")),
      already: await ctx.db.insert("outreachContacts", contact(other.organizationId, "KOSF II MIDLAND LLC|10301 WAYZATA BLVD")),
    }));
    expect(await t.mutation(internal.outreach.rekeyContacts, {})).toEqual({ read: 4, rekeyed: 1, kept: 1, done: true });
    const keys = await t.run(async (ctx) => Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, (await ctx.db.get(id))!]))));
    expect(keys.hyphen).toMatchObject({ key: "KOSF II MIDLAND LLC|10301 WAYZATA BLVD", note: "Called Tuesday" });
    expect(keys.office.key).toBe("office:10301 WAYZATA BLVD");
    expect(keys.both.key).toBe("KOSF II-MIDLAND LLC|10301 WAYZATA BLVD");
    // Run again: nothing left to do.
    expect(await t.mutation(internal.outreach.rekeyContacts, {})).toEqual({ read: 4, rekeyed: 0, kept: 1, done: true });
  });
});

describe("one owners rebuild at a time", () => {
  test("a second request while one runs is queued, and the running one goes again when it ends", async () => {
    const t = setup();
    expect(await t.mutation(internal.outreach.claimRebuild, { county: "Midland" })).toBe(true);
    // Asked for twice more while it runs: one more run is owed, not two.
    expect(await t.mutation(internal.outreach.claimRebuild, { county: "Midland" })).toBe(false);
    expect(await t.mutation(internal.outreach.claimRebuild, { county: "Midland" })).toBe(false);
    // Another county isn't held up.
    expect(await t.mutation(internal.outreach.claimRebuild, { county: "Ector" })).toBe(true);
    expect(await t.action(internal.outreachRebuild.rebuild, { county: "Midland" })).toEqual({ queued: true });
    expect(await t.mutation(internal.outreach.releaseRebuild, { county: "Midland" })).toBe(true);
    expect(await t.mutation(internal.outreach.releaseRebuild, { county: "Ector" })).toBe(false);
    // Free again: a rebuild runs, and lets go when it is done.
    const done = await t.action(internal.outreachRebuild.rebuild, { county: "Midland" });
    expect(done.queued).toBeUndefined();
    expect(done.error).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query("rebuildLocks").collect())).toEqual([]);
  });

  test("a claim left by a rebuild that died is taken over after twenty minutes", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("rebuildLocks", { county: "Midland", startedAt: Date.now() - 21 * 60 * 1000, again: true }));
    expect(await t.mutation(internal.outreach.claimRebuild, { county: "Midland" })).toBe(true);
    // The new claim owes nothing from the dead one's requests: it is reading everything afresh.
    expect(await t.mutation(internal.outreach.releaseRebuild, { county: "Midland" })).toBe(false);
  });
});
