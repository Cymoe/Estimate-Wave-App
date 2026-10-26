import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signUp } from "./test.setup";
import { addressKey, deedIso, isCompanyOwner, ownerName, ownerOccupied, rowsToParcels, siteAddress, streetKey } from "./lib/parcels";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A roll row as the city's layer returns it. */
const roll = (over: Record<string, unknown> = {}) => ({
  attributes: {
    SU_NUM: "R000029279",
    PIN_1: "560000320062",
    GOV_USE_CO: "A1",
    SITE_NO: 112,
    STREET_DIR: "W",
    STREET: "SPRUCE AV",
    OWNER: "LOZANO ZUNIGA CESAR E",
    OWNER2: " ",
    ADDRESS_1: "112 W SPRUCE AV",
    CITY_1: "MIDLAND",
    STATE_1: "TX",
    ZIP: "79705",
    MKT_VALUE: 357830,
    BLDG_VALUE: 340940,
    DEED_DATE: "10/11/2021",
    ...over,
  },
});

describe("Midland owners (the appraisal roll)", () => {
  test("a permit address and the roll's address for the same house get the same key", () => {
    expect(addressKey("4729 COUNTRY CLUB Drive")).toBe("4729 COUNTRY CLUB DR");
    expect(addressKey("4729 COUNTRY CLUB DR")).toBe("4729 COUNTRY CLUB DR");
    expect(addressKey("2510 Storey Avenue, Midland, TX")).toBe("2510 STOREY AV");
    expect(addressKey("3107 S COUNTY RD 01109 Apt 2")).toBe("3107 S COUNTY RD 1109");
    expect(addressKey("7105 Cactus Trail")).toBe(addressKey("7105 CACTUS TRL"));
    expect(siteAddress({ SITE_NO: 3107, STREET_DIR: "S", STREET: "COUNTY RD 01109" })).toBe("3107 S COUNTY RD 1109");
    expect(siteAddress({ SITE_NO: 0, STREET: "COUNTY RD 01127" })).toBeUndefined();
    expect(streetKey("112 W Spruce Avenue")).toBe("W SPRUCE AV");
    expect(streetKey("2705 HOWDY DR")).toBe("HOWDY DR");
    expect(streetKey("")).toBeUndefined();
  });

  test("who lives there, who is a business, and when they bought", () => {
    expect(ownerOccupied("112 W SPRUCE AV", "112 W SPRUCE AV")).toBe(true);
    expect(ownerOccupied("2510 STOREY AV", "2510 STOREY AVE")).toBe(true);
    // The roll's mailing line often drops the direction.
    expect(ownerOccupied("112 W SPRUCE AV", "112 SPRUCE AV")).toBe(true);
    expect(ownerOccupied("4309 COUNTRY CLUB DR", "255 ASSAY ST APT")).toBe(false);
    expect(ownerOccupied("1606 COUNTRY CLUB DR", "P. O. BOX 51138")).toBe(false);
    expect(isCompanyOwner("NUKA HIVA ALPHA 1-54 LLC")).toBe(true);
    expect(isCompanyOwner("BETENBOUGH HOMES")).toBe(true);
    expect(isCompanyOwner("YANGJA JOHNSON REV LIV TRUST")).toBe(false);
    expect(isCompanyOwner("AMERIHOME MORTGAGE COMPANY LLC")).toBe(true);
    expect(isCompanyOwner("HERNANDEZ CONRAD JR")).toBe(false);
    expect(deedIso("6/7/2010")).toBe("2010-06-07");
    expect(deedIso("")).toBeUndefined();
    expect(ownerName("LOZANO ZUNIGA CESAR E")).toBe("Lozano Zuniga Cesar E");
  });

  test("keeps homes with an owner and an address, and reads the money in cents", () => {
    const rows = rowsToParcels([
      roll(),
      roll({ SU_NUM: "R2", OWNER: "MATHES JOE &", ADDRESS_1: "6305 E COUNTY RD 62", SITE_NO: 410, STREET_DIR: " ", STREET: "ELM ST" }),
      roll({ SU_NUM: "R3", GOV_USE_CO: "F1" }),
      roll({ SU_NUM: "R4", SITE_NO: 0 }),
      roll({ SU_NUM: "R5", OWNER: " " }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      cadId: "R000029279",
      siteAddress: "112 W SPRUCE AV",
      addressKey: "112 W SPRUCE AV",
      street: "W SPRUCE AV",
      ownerOccupied: true,
      companyOwned: false,
      marketValueCents: 35_783_000,
      deedDate: "2021-10-11",
      mailing: { address: "112 W SPRUCE AV", city: "MIDLAND", state: "TX", zip: "79705" },
    });
    expect(rows[0].owner2).toBeUndefined();
    expect(rows[1]).toMatchObject({ owner: "MATHES JOE", ownerOccupied: false });
  });

  test("the weekly pull pages through the roll, adds, updates and records how it went", async () => {
    const t = setup();
    const pages = [
      { features: [roll(), roll({ SU_NUM: "R2", SITE_NO: 9 })], exceededTransferLimit: true },
      { features: [roll({ SU_NUM: "R3", SITE_NO: 11, DEED_DATE: "11/20/2025" })] },
    ];
    const urls: string[] = [];
    const landlordAsks: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      // The landlord count is its own group-by query.
      if (url.includes("groupByFieldsForStatistics")) {
        landlordAsks.push(url);
        return new Response(JSON.stringify({ features: [{ attributes: { OWNER: "NUKA HIVA LLC &", homes: 7 } }] }), { status: 200 });
      }
      urls.push(url);
      return new Response(JSON.stringify(pages[urls.length - 1] ?? { features: [] }), { status: 200 });
    }));
    expect(await t.action(internal.parcels.syncMidland, {})).toEqual({ fetched: 3, added: 3, updated: 0, error: undefined });
    expect(urls).toHaveLength(2);
    expect(new URL(landlordAsks[0]).searchParams.get("having")).toBe("COUNT(OBJECTID) >= 5");
    await t.run(async (ctx) => {
      expect((await ctx.db.query("landlords").collect()).map((l) => [l.owner, l.homes])).toEqual([["NUKA HIVA LLC", 7]]);
    });
    expect(new URL(urls[0]).searchParams.get("where")).toBe("GOV_USE_CO IN ('A1','A2','A3','A4','A5')");
    expect(urls[1]).toContain("resultOffset=2");

    // Run again with one owner changed: only that row is written.
    pages[0].features[0] = roll({ OWNER: "NEW OWNER JANE" });
    urls.length = 0;
    expect(await t.action(internal.parcels.syncMidland, {})).toMatchObject({ fetched: 3, added: 0, updated: 1 });
    await t.run(async (ctx) => {
      const all = await ctx.db.query("parcels").collect();
      expect(all).toHaveLength(3);
      expect(all.find((p) => p.cadId === "R000029279")!.owner).toBe("NEW OWNER JANE");
      const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", "midland-parcels")).unique();
      expect(sync).toMatchObject({ fetched: 3, lastAppliedAt: "2025-11-20" });
    });

    // The deploy's run skips a roll read cleanly this week.
    urls.length = 0;
    expect(await t.action(internal.parcels.syncMidland, { ifStale: true })).toEqual({ skipped: true });
    expect(urls).toHaveLength(0);

    // The Permits card shows it to staff.
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const status = await staff.as.query(api.permits.status, {});
    expect(status.owners).toMatchObject({ fetched: 3, lastAppliedAt: "2025-11-20" });
  });

  test("a failed read says why and doesn't count as this week's", async () => {
    const t = setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect(await t.action(internal.parcels.syncMidland, { ifStale: true })).toMatchObject({ fetched: 0, error: "Midland owners: HTTP 503" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [roll()] }), { status: 200 })));
    expect(await t.action(internal.parcels.syncMidland, { ifStale: true })).toMatchObject({ fetched: 1, added: 1 });
  });

  test("only staff can start a read", async () => {
    const t = setup();
    const company = await signUp(t, "owner@roof.example");
    await expect(company.as.action(api.parcels.syncNow, {})).rejects.toThrow();
  });
});

// ---- Callers: Do Not Call, the dial check, call lists ----

/** A weekday afternoon in Midland (Tuesday 2:00pm Central). */
const OPEN = Date.parse("2026-10-27T19:00:00.000Z");

async function team(t: ReturnType<typeof setup>) {
  const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
  const caller = await signUp(t, "dana@tolliver.example");
  await t.run(async (ctx) => ctx.db.patch(caller.userId, { role: "caller" }));
  return { staff, caller };
}

/** Uploads both lists through Ops the way the page does: open, chunks, finish. */
async function uploadLists(staff: Awaited<ReturnType<typeof signUp>>, national: string[] = ["4325550100"], texas: string[] = ["4325550101"]) {
  for (const [list, numbers] of [["national", national], ["texas", texas]] as const) {
    const batchId = await staff.as.mutation(api.calls.startDncImport, { list, fileName: `${list}.txt` });
    await staff.as.mutation(api.calls.importDncChunk, { batchId, numbers });
    await staff.as.mutation(api.calls.finishDncImport, { batchId });
  }
}

async function addHome(t: ReturnType<typeof setup>, over: Record<string, unknown> = {}) {
  return await t.run(async (ctx) =>
    ctx.db.insert("parcels", {
      county: "Midland",
      cadId: `R${Math.random()}`,
      useCode: "A1",
      siteAddress: "2709 HOWDY DR",
      addressKey: "2709 HOWDY DR",
      street: "HOWDY DR",
      owner: "COLE JANE",
      mailing: { address: "2709 HOWDY DR", city: "MIDLAND", state: "TX", zip: "79705" },
      ownerOccupied: true,
      companyOwned: false,
      marketValueCents: 31_000_000,
      deedDate: "2019-04-02",
      importedAt: "2026-10-25T07:20:00.000Z",
      ...over,
    }),
  );
}

describe("calling rules", () => {
  test("Texas hours: 9 to 9 Monday to Saturday, noon to 9 on Sunday, Central", async () => {
    const { callingHours, centralMidnight, numbersIn, consentLine, listDue } = await import("./lib/calls");
    expect(callingHours(Date.parse("2026-10-27T14:00:00.000Z")).open).toBe(true); // Tue 9:00am
    expect(callingHours(Date.parse("2026-10-27T13:59:00.000Z")).open).toBe(false); // Tue 8:59am
    expect(callingHours(Date.parse("2026-10-28T02:30:00.000Z"))).toEqual({ open: false, reason: "Calls are allowed 9am to 9pm, Central time." }); // Tue 9:30pm
    expect(callingHours(Date.parse("2026-11-01T16:00:00.000Z"))).toEqual({ open: false, reason: "Calls are allowed noon to 9pm on Sundays, Central time." }); // Sun 10am (CST)
    expect(callingHours(Date.parse("2026-11-01T18:30:00.000Z")).open).toBe(true); // Sun 12:30pm
    expect(new Date(centralMidnight(OPEN)).toISOString()).toBe("2026-10-27T05:00:00.000Z");
    expect(numbersIn("432,5550123\n1-432-555-0124\r\nheader line\n4325550123\n555")).toEqual(["4325550123", "4325550124"]);
    expect(consentLine("Roofing")).toBe("Is it okay if one local roofing company from the Tolliver network calls or texts you at this number about this job?");
    expect(listDue("national", "2026-10-01T00:00:00.000Z", OPEN)).toEqual({ current: true, dueAt: "2026-11-01T00:00:00.000Z" });
    expect(listDue("national", "2026-09-01T00:00:00.000Z", OPEN).current).toBe(false);
  });

  test("no number is dialable until both lists are current; listed and asked numbers never are", async () => {
    vi.useFakeTimers({ now: OPEN, toFake: ["Date"] });
    const t = setup();
    const { staff, caller } = await team(t);
    expect(await caller.as.query(api.calls.check, { phone: "432-555-0199" })).toEqual({
      ok: false,
      reason: "Staff need to upload the National Do Not Call list in Ops, Calls, before anyone calls.",
    });
    // Callers can't upload; staff can.
    await expect(caller.as.mutation(api.calls.startDncImport, { list: "national" })).rejects.toThrow(/staff/);
    await uploadLists(staff, ["4325550100"], ["4325550101"]);
    expect(await caller.as.query(api.calls.check, { phone: "(432) 555-0199" })).toEqual({ ok: true, phone: "4325550199" });
    expect(await caller.as.query(api.calls.check, { phone: "4325550100" })).toEqual({ ok: false, reason: "This number is on the National Do Not Call list." });
    expect(await caller.as.query(api.calls.check, { phone: "4325550101" })).toEqual({ ok: false, reason: "This number is on the Texas no-call list." });
    expect((await caller.as.query(api.calls.check, { phone: "555" })).ok).toBe(false);

    // Someone who says "don't call again" is on our own list for good.
    await caller.as.mutation(api.calls.log, { phone: "4325550199", outcome: "do_not_call", address: "2709 Howdy Dr" });
    expect(await caller.as.query(api.calls.check, { phone: "4325550199" })).toEqual({ ok: false, reason: "This number asked not to be called again." });
    await staff.as.mutation(api.calls.addDoNotCall, { phone: "4325550188", note: "Called in to complain" });
    expect((await caller.as.query(api.calls.check, { phone: "4325550188" })).ok).toBe(false);

    // Outside hours, nothing is dialable.
    vi.setSystemTime(Date.parse("2026-10-28T02:30:00.000Z"));
    expect(await caller.as.query(api.calls.check, { phone: "4325550177" })).toEqual({ ok: false, reason: "Calls are allowed 9am to 9pm, Central time." });

    // A month later the national list is out of date until this month's is uploaded.
    vi.setSystemTime(OPEN + 32 * 24 * 60 * 60 * 1000);
    expect(await caller.as.query(api.calls.check, { phone: "4325550177" })).toEqual({
      ok: false,
      reason: "The National Do Not Call list is out of date. Staff upload this month's in Ops, Calls.",
    });
    const status = await caller.as.query(api.calls.dncStatus, {});
    expect(status.map((s) => [s.list, s.count, s.current])).toEqual([["national", 1, false], ["texas", 1, true]]);
  });

  test("a new upload replaces the last one, and the old numbers are cleared out", async () => {
    vi.useFakeTimers({ now: OPEN, toFake: ["Date"] });
    const t = setup();
    const { staff, caller } = await team(t);
    await uploadLists(staff, ["4325550100", "4325550102"], ["4325550101"]);
    const batchId = await staff.as.mutation(api.calls.startDncImport, { list: "national" });
    await staff.as.mutation(api.calls.importDncChunk, { batchId, numbers: ["4325550103", "junk"] });
    // Until it's finished, the old list still counts and the new one doesn't.
    expect((await caller.as.query(api.calls.check, { phone: "4325550100" })).ok).toBe(false);
    expect((await caller.as.query(api.calls.check, { phone: "4325550103" })).ok).toBe(true);
    expect(await staff.as.mutation(api.calls.finishDncImport, { batchId })).toEqual({ count: 1 });
    await t.finishAllScheduledFunctions(() => {});
    expect((await caller.as.query(api.calls.check, { phone: "4325550100" })).ok).toBe(true);
    expect((await caller.as.query(api.calls.check, { phone: "4325550103" })).ok).toBe(false);
    await t.run(async (ctx) => {
      const national = (await ctx.db.query("doNotCall").collect()).filter((r) => r.list === "national");
      expect(national.map((r) => r.phone)).toEqual(["4325550103"]);
      expect((await ctx.db.query("dncLists").collect()).length).toBe(2);
    });
    // An empty file isn't a list.
    const empty = await staff.as.mutation(api.calls.startDncImport, { list: "texas" });
    await expect(staff.as.mutation(api.calls.finishDncImport, { batchId: empty })).rejects.toThrow(/No 10-digit numbers/);
  });

  test("three unanswered calls in 30 days rest a number", async () => {
    vi.useFakeTimers({ now: OPEN, toFake: ["Date"] });
    const t = setup();
    const { staff, caller } = await team(t);
    await uploadLists(staff);
    for (const outcome of ["no_answer", "voicemail"] as const)
      await caller.as.mutation(api.calls.log, { phone: "4325550150", outcome, address: "2709 Howdy Dr" });
    expect((await caller.as.query(api.calls.check, { phone: "4325550150" })).ok).toBe(true);
    await caller.as.mutation(api.calls.log, { phone: "4325550150", outcome: "no_answer", address: "2709 Howdy Dr" });
    expect(await caller.as.query(api.calls.check, { phone: "4325550150" })).toEqual({
      ok: false,
      reason: "Called 3 times in the last 30 days without an answer. Leave it for now.",
    });
    // A number that picked up once isn't rested.
    for (const outcome of ["callback", "no_answer", "no_answer", "no_answer"] as const)
      await caller.as.mutation(api.calls.log, { phone: "4325550151", outcome, address: "2711 Howdy Dr", ...(outcome === "callback" ? { callbackAt: "2026-10-28T20:00:00.000Z" } : {}) });
    expect((await caller.as.query(api.calls.check, { phone: "4325550151" })).ok).toBe(true);
    await expect(caller.as.mutation(api.calls.log, { phone: "4325550152", outcome: "callback", address: "x" })).rejects.toThrow(/call back/);
  });

  test("call lists: neighbors of a trade's permits, recent buyers and a street; only owners who live there", async () => {
    vi.useFakeTimers({ now: OPEN, toFake: ["Date"] });
    const t = setup();
    const { staff, caller } = await team(t);
    await uploadLists(staff);
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", { slug: "roofing", name: "Roofing", display_order: 1, is_active: true, created_at: now, updated_at: now });
      const permit = (n: string, address: string, trades: string[], appliedAt = "2026-10-20T15:00:00.000Z") =>
        ctx.db.insert("permits", { source: "midland", permitNumber: n, name: "Residential - Building", address, county: "Midland", city: "Midland", appliedAt, residential: true, trades, importedAt: now });
      await permit("R1", "2705 HOWDY DR", ["roofing"]);
      await permit("R2", "2713 Howdy Drive", ["roofing"]);
      await permit("R3", "900 ELM ST", ["roofing"]);
      await permit("R4", "910 ELM ST", ["roofing"], "2026-08-01T15:00:00.000Z"); // too old
      await permit("H1", "500 OAK AV", ["hvac"]);
    });
    const jane = await addHome(t);
    await addHome(t, { siteAddress: "2711 HOWDY DR", addressKey: "2711 HOWDY DR", owner: "NUKA HIVA LLC", companyOwned: true });
    await addHome(t, { siteAddress: "2715 HOWDY DR", addressKey: "2715 HOWDY DR", owner: "AWAY LANDLORD", ownerOccupied: false });
    const elm = await addHome(t, { siteAddress: "902 ELM ST", addressKey: "902 ELM ST", street: "ELM ST", owner: "REYES SAMUEL", deedDate: "2025-11-03" });
    await addHome(t, { siteAddress: "502 OAK AV", addressKey: "502 OAK AV", street: "OAK AV", owner: "HALL JAMES EDWARD" });

    const roofing = await caller.as.query(api.calls.list, { kind: "trade_permits", trade: "roofing" });
    expect(roofing.streets).toEqual([{ street: "Howdy Dr", permits: 2 }, { street: "Elm St", permits: 1 }]);
    expect(roofing.homes.map((h) => [h.owner, h.address, h.why])).toEqual([
      ["Cole Jane", "2709 Howdy Dr", "2 roofing permits on Howdy Dr in the last 30 days"],
      ["Reyes Samuel", "902 Elm St", "1 roofing permit on Elm St in the last 30 days"],
    ]);

    const buyers = await caller.as.query(api.calls.list, { kind: "recent_buyers" });
    expect(buyers.homes.map((h) => [h.parcelId, h.why])).toEqual([[elm, "Bought Nov 2025: new owners often have work done"]]);

    const street = await caller.as.query(api.calls.list, { kind: "street", street: "oak avenue" });
    expect(street.homes.map((h) => h.owner)).toEqual(["Hall James Edward"]);

    // A home just called drops off every list for 30 days.
    await caller.as.mutation(api.calls.log, { phone: "4325550160", outcome: "not_interested", parcelId: jane, address: "2709 Howdy Dr" });
    expect((await caller.as.query(api.calls.list, { kind: "trade_permits", trade: "roofing" })).homes.map((h) => h.owner)).toEqual(["Reyes Samuel"]);

    // Companies never see any of it.
    const company = await signUp(t, "owner@roof.example");
    await expect(company.as.query(api.calls.list, { kind: "recent_buyers" })).rejects.toThrow(/callers/);
  });

  test("my day and the Ops tally count calls, answers and callbacks", async () => {
    vi.useFakeTimers({ now: OPEN, toFake: ["Date"] });
    const t = setup();
    const { staff, caller } = await team(t);
    await uploadLists(staff);
    await caller.as.mutation(api.calls.log, { phone: "4325550170", outcome: "no_answer", address: "1 A St" });
    await caller.as.mutation(api.calls.log, { phone: "4325550171", outcome: "callback", address: "2 A St", owner: "Cole Jane", callbackAt: "2026-10-28T15:00:00.000Z", note: "After work" });
    const day = await caller.as.query(api.calls.myDay, {});
    expect(day).toMatchObject({ calls: 2, answered: 1, leads: 0, hours: { open: true } });
    expect(day.callbacks).toEqual([expect.objectContaining({ phone: "4325550171", owner: "Cole Jane", callbackAt: "2026-10-28T15:00:00.000Z", note: "After work" })]);
    // Called back: no longer due.
    await caller.as.mutation(api.calls.log, { phone: "4325550171", outcome: "not_interested", address: "2 A St" });
    expect((await caller.as.query(api.calls.myDay, {})).callbacks).toEqual([]);

    const tally = await staff.as.query(api.calls.tally, {});
    expect(tally).toEqual([expect.objectContaining({ email: "dana@tolliver.example", calls: 3, answered: 2, leads: 0 })]);
    await expect(caller.as.query(api.calls.tally, {})).rejects.toThrow(/staff/);
  });
});

describe("leads taken on a call", () => {
  test("a yes goes to intake with the consent line; someone else confirms it and it lists as a Tolliver Call", async () => {
    vi.useFakeTimers({ now: OPEN, toFake: ["Date"] });
    const t = setup();
    const { staff, caller } = await team(t);
    await uploadLists(staff);
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", { slug: "roofing", name: "Roofing", display_order: 1, is_active: true, created_at: now, updated_at: now });
    });
    const home = await addHome(t);
    const lead = { parcelId: home, phone: "(432) 555-0123", name: "Jane Cole", address: "2709 Howdy Dr", zip: "79705", jobType: "roofing", scope: "replacement", timeline: "month", notes: "Hail last spring", isOwner: true };
    await expect(caller.as.mutation(api.calls.takeLead, { ...lead, consented: false })).rejects.toThrow(/consent line/);
    await expect(caller.as.mutation(api.calls.takeLead, { ...lead, isOwner: false, consented: true })).rejects.toThrow(/owner/);
    await expect(caller.as.mutation(api.calls.takeLead, { ...lead, phone: "4325550100", consented: true })).rejects.toThrow(/National Do Not Call/);

    const { id, duplicate } = await caller.as.mutation(api.calls.takeLead, { ...lead, consented: true });
    expect(duplicate).toBe(false);
    const row = await staff.as.query(api.intake.get, { id });
    expect(row).toMatchObject({
      source: "outbound",
      status: "new",
      name: "Jane Cole",
      phone: "4325550123",
      county: "Midland",
      city: "Midland",
      isOwner: true,
      takenBy: "dana",
      consent: {
        text: "Is it okay if one local roofing company from the Tolliver network calls or texts you at this number about this job?",
        value: "Said yes on the call",
      },
    });
    // The call is logged as a lead, and the home leaves the lists.
    expect(await caller.as.query(api.calls.myDay, {})).toMatchObject({ calls: 1, answered: 1, leads: 1 });
    expect((await caller.as.query(api.calls.list, { kind: "street", street: "Howdy Dr" })).homes).toEqual([]);

    const checks = { reached: true, phoneOwner: true, addressInCounty: true, trade: true, owner: true, consent: true };
    // The caller who took it can't confirm it (callers can't open intake at all; a staff member who took one can't either).
    await expect(caller.as.mutation(api.intake.confirm, { id, checks })).rejects.toThrow(/staff/);
    await t.run(async (ctx) => ctx.db.patch(id, { createdBy: staff.userId }));
    await expect(staff.as.mutation(api.intake.confirm, { id, checks })).rejects.toThrow(/someone else confirms/);
    await t.run(async (ctx) => ctx.db.patch(id, { createdBy: caller.userId }));
    const confirmed = await staff.as.mutation(api.intake.confirm, { id, checks });
    await t.run(async (ctx) => {
      const listed = (await ctx.db.get(confirmed.leadId as never)) as { source?: string } | null;
      expect(listed?.source).toBe("Tolliver Call");
    });
    expect((await staff.as.query(api.calls.tally, {}))[0]).toMatchObject({ leads: 1, confirmed: 1 });

    // The same number again is flagged as a duplicate, not dropped.
    expect((await caller.as.mutation(api.calls.takeLead, { ...lead, consented: true })).duplicate).toBe(true);
  });
});
