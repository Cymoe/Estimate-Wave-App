import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  STARTER_COST_CODES,
  STARTER_INDUSTRIES,
  STARTER_ITEMS,
} from "./catalog/starterCatalog";
import { setup, signUp } from "./test.setup";
import { cityFromSearch, cityFromText } from "./lib/leadCity";
import { fillTimeMs, priceAt, pricingFor } from "./lib/auction";
import { TEXAS_COUNTIES, countyForTown, normalizeCounty } from "./lib/counties";

describe("auth and tenancy", () => {
  test("signed-out callers are rejected", async () => {
    const t = setup();
    const { organizationId } = await signUp(t, "a@example.com");
    await expect(t.query(api.clients.list, { organizationId })).rejects.toThrow(
      /signed in/,
    );
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  test("me returns the user with their organization", async () => {
    const t = setup();
    const { as, userId, organizationId } = await signUp(t, "a@example.com");
    expect(await as.query(api.users.me, {})).toMatchObject({
      id: userId,
      email: "a@example.com",
      name: "a",
      organizationId,
      role: "user",
    });
  });

  test("users only see and touch their own organization's data", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");

    const client = await alice.as.mutation(api.clients.create, {
      organizationId: alice.organizationId,
      data: { name: "Smith Residence" },
    });

    expect(await alice.as.query(api.organizations.list, {})).toHaveLength(1);
    expect((await bob.as.query(api.organizations.list, {}))[0]._id).toBe(
      bob.organizationId,
    );

    await expect(
      bob.as.query(api.clients.list, { organizationId: alice.organizationId }),
    ).rejects.toThrow(/access/);
    // Other tenants' records read as "not found" rather than "forbidden".
    await expect(
      bob.as.query(api.clients.get, { id: client!._id }),
    ).rejects.toThrow(/Not found/);
    await expect(
      bob.as.mutation(api.clients.update, {
        id: client!._id,
        data: { name: "x" },
      }),
    ).rejects.toThrow(/Not found/);
    await expect(
      bob.as.mutation(api.clients.remove, { id: client!._id }),
    ).rejects.toThrow(/Not found/);
    expect(
      (await alice.as.query(api.clients.get, { id: client!._id })).name,
    ).toBe("Smith Residence");
  });

  test("callers can't spoof ownership or link another tenant's records", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const bobsClient = await bob.as.mutation(api.clients.create, {
      organizationId: bob.organizationId,
      data: { name: "Bob's client" },
    });

    const created = await alice.as.mutation(api.clients.create, {
      organizationId: alice.organizationId,
      data: {
        name: "Mine",
        userId: bob.userId,
        organizationId: bob.organizationId,
        hacked: true,
      },
    });
    expect(created).toMatchObject({
      userId: alice.userId,
      organizationId: alice.organizationId,
    });
    expect(created).not.toHaveProperty("hacked");

    await expect(
      alice.as.mutation(api.estimates.create, {
        organizationId: alice.organizationId,
        data: { clientId: bobsClient!._id, items: [] },
      }),
    ).rejects.toThrow(/Client not found/);
  });

  test("only owners can deactivate an organization", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", {
        organizationId: alice.organizationId,
        userId: bob.userId,
        role: "member",
        createdAt: new Date().toISOString(),
      });
    });
    await expect(
      bob.as.mutation(api.organizations.remove, { id: alice.organizationId }),
    ).rejects.toThrow(/access/);
    await alice.as.mutation(api.organizations.remove, {
      id: alice.organizationId,
    });
    expect(await alice.as.query(api.organizations.list, {})).toHaveLength(0);
  });
});

describe("staff", () => {
  test("staff run the Lead Market but not the money; others are kept out", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@fieldquote.example", { role: "super_admin" });
    const member = await signUp(t, "member@example.com");
    // Invite someone who already has an account: staff right away.
    expect(await owner.as.mutation(api.staff.invite, { email: "Member@Example.com " })).toEqual({ status: "staff" });
    expect(await member.as.query(api.users.me, {})).toMatchObject({ role: "staff", isStaff: true });
    expect(await owner.as.query(api.users.me, {})).toMatchObject({ role: "super_admin", isStaff: true });

    // Staff see the inbox and can list and confirm leads...
    expect(await member.as.query(api.marketplace.listInbox, {})).toMatchObject({ available: [] });
    const lead = await member.as.mutation(api.marketplace.createLead, {
      data: { name: "Staff Listed", phone: "4325550199", city: "Midland", county: "Midland", jobType: "painting" },
    });
    await member.as.mutation(api.marketplace.verifyLead, { id: lead!._id, note: "Wants it next week" });
    // ...but money, prices and companies stay with the owner.
    await expect(member.as.mutation(api.marketplace.setLeadPrice, { jobType: "painting", price: 300 })).rejects.toThrow(/admins/);
    await expect(member.as.query(api.staff.list, {})).rejects.toThrow(/admins/);
    await expect(member.as.mutation(api.staff.invite, { email: "x@example.com" })).rejects.toThrow(/admins/);

    // An ordinary user is kept out of all of it.
    const other = await signUp(t, "other@example.com");
    await expect(other.as.query(api.marketplace.listInbox, {})).rejects.toThrow(/staff/);
    await expect(other.as.mutation(api.marketplace.verifyLead, { id: lead!._id })).rejects.toThrow(/staff/);

    // Removing staff turns them back into an ordinary account; the owner can't remove themselves.
    await owner.as.mutation(api.staff.remove, { id: member.userId });
    expect(await member.as.query(api.users.me, {})).toMatchObject({ role: "user", isStaff: false });
    await expect(owner.as.mutation(api.staff.remove, { id: owner.userId })).rejects.toThrow(/yourself/);
  });

  test("an invited email becomes staff on sign-up, with no company of its own", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@fieldquote.example", { role: "super_admin" });
    expect(await owner.as.mutation(api.staff.invite, { email: "va@fieldquote.example" })).toEqual({ status: "invited" });
    // Inviting twice doesn't stack invites.
    expect(await owner.as.mutation(api.staff.invite, { email: "va@fieldquote.example" })).toEqual({ status: "invited" });
    expect((await owner.as.query(api.staff.list, {})).invites).toHaveLength(1);
    await expect(owner.as.mutation(api.staff.invite, { email: "nope" })).rejects.toThrow(/email/);

    // What the auth callback does when that email signs up.
    const { acceptStaffInvite } = await import("./lib/staff");
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "va@fieldquote.example", name: "VA" });
      expect(await acceptStaffInvite(ctx, id, "va@fieldquote.example")).toBe(true);
      // A second account with the same email isn't made staff by a used invite.
      const again = await ctx.db.insert("users", { email: "va@fieldquote.example", name: "dup" });
      expect(await acceptStaffInvite(ctx, again, "va@fieldquote.example")).toBe(false);
      return id;
    });
    const va = t.withIdentity({ subject: `${userId}|session-${userId}` });
    expect(await va.query(api.users.me, {})).toMatchObject({ role: "staff", isStaff: true });
    expect((await va.query(api.users.me, {}))!.organizationId).toBeUndefined();
    expect(await va.query(api.organizations.list, {})).toEqual([]);
    expect((await owner.as.query(api.staff.list, {})).staff.map((s) => s.email)).toEqual(["va@fieldquote.example"]);
    expect((await owner.as.query(api.staff.list, {})).invites).toEqual([]);

    // An open invite can be taken back.
    await owner.as.mutation(api.staff.invite, { email: "later@fieldquote.example" });
    const [open] = (await owner.as.query(api.staff.list, {})).invites;
    await owner.as.mutation(api.staff.removeInvite, { id: open.id });
    expect((await owner.as.query(api.staff.list, {})).invites).toEqual([]);
  });
});

describe("intake", () => {
  async function ops() {
    const t = setup();
    const owner = await signUp(t, "owner@fieldquote.example", { role: "super_admin" });
    const va = await signUp(t, "va@fieldquote.example", { role: "staff" });
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      for (const [slug, name] of [["roofing", "Roofing"], ["painting", "Painting"], ["general-construction", "General Construction"]]) {
        await ctx.db.insert("industries", { slug, name, display_order: 1, is_active: true, created_at: now, updated_at: now });
      }
    });
    return { t, owner, va };
  }

  test("reads connector payloads, campaign names and phone numbers", async () => {
    const { fieldsFromPayload, normalizePhone, parseCampaign } = await import("./lib/intake");
    expect(normalizePhone("(432) 555-0133")).toBe("4325550133");
    expect(normalizePhone("+1 432 555 0133")).toBe("4325550133");
    expect(normalizePhone("555-0133")).toBeUndefined();

    const trades = ["roofing", "general-construction", "painting"];
    expect(parseCampaign("TX_MIDLAND_ROOFING_LG_202610", trades)).toEqual({ county: "Midland", jobType: "roofing" });
    expect(parseCampaign("tx_tom_green_general_construction_lg", trades)).toEqual({ county: "Tom Green", jobType: "general-construction" });
    expect(parseCampaign("Spring promo", trades)).toEqual({});

    // Zapier's flattened shape.
    expect(
      fieldsFromPayload({
        full_name: "Dana Reyes", phone_number: "+14325550133", email: "dana@example.com", city: "Midland", zip_code: "79701",
        "which county is the home in?": "Midland County", "when do you want this done?": "Within a month",
        "do you own this home?": "Yes", campaign_name: "TX_MIDLAND_ROOFING_LG_202610", adset_name: "TX_MIDLAND_ROOFING_hail", ad_name: "video1",
        form_id: "1234", id: "9876543210123456", created_time: "2026-10-22T03:00:00+0000",
        "I agree to be contacted by FieldQuote and one contractor": "true",
      }),
    ).toEqual({
      name: "Dana Reyes", phone: "+14325550133", email: "dana@example.com", city: "Midland", zip: "79701", county: "Midland",
      timeline: "Within a month", isOwner: true, campaignName: "TX_MIDLAND_ROOFING_LG_202610", adsetName: "TX_MIDLAND_ROOFING_hail", adName: "video1",
      formId: "1234", externalId: "9876543210123456", createdTime: "2026-10-22T03:00:00+0000",
      consent: { text: "iagreetobecontactedbyfieldquoteandonecontractor", value: "true", at: "2026-10-22T03:00:00+0000" },
    });
    // Meta's raw lead read, with field_data and custom disclaimer responses.
    expect(
      fieldsFromPayload({
        id: "111", created_time: "2026-10-22T03:00:00+0000",
        field_data: [{ name: "first_name", values: ["Sam"] }, { name: "last_name", values: ["Lee"] }, { name: "phone_number", values: ["4325550100"] }],
        custom_disclaimer_responses: [{ checkbox_key: "contact_consent", is_checked: "1" }],
      }),
    ).toMatchObject({ name: "Sam Lee", phone: "4325550100", externalId: "111", consent: { text: "contact_consent", value: "1" } });
  });

  test("the webhook needs the key, queues the lead, reads county and trade from the campaign, and ignores retries", async () => {
    const { t, va } = await ops();
    vi.stubEnv("INTAKE_KEY", "s3cret");
    try {
      const body = JSON.stringify({ full_name: "Dana Reyes", phone_number: "432-555-0133", campaign_name: "TX_MIDLAND_ROOFING_LG_202610", id: "L1", "do you own this home?": "Yes" });
      expect((await t.fetch("/intake/lead", { method: "POST", body })).status).toBe(401);
      expect((await t.fetch("/intake/lead?key=wrong", { method: "POST", body })).status).toBe(401);
      const first = await t.fetch("/intake/lead?key=s3cret", { method: "POST", body });
      expect(first.status).toBe(201);
      const { id, duplicate } = await first.json();
      expect(duplicate).toBe(false);
      // The same leadgen id again (Zapier retried) doesn't make a second row.
      const again = await t.fetch("/intake/lead", { method: "POST", body, headers: { "x-intake-key": "s3cret" } });
      expect(again.status).toBe(200);
      expect((await again.json()).id).toBe(id);
      expect((await t.fetch("/intake/lead?key=s3cret", { method: "POST", body: "not json" })).status).toBe(400);

      // Every hit left a row in the log, newest first, so a form that "fired and nothing showed up" can be traced.
      const log = await va.as.query(api.intake.recentLog, {});
      expect(log.map((l) => [l.outcome, l.reason ?? null])).toEqual([
        ["rejected", "Send JSON"],
        ["repeat", "Same outside id as a lead already in"],
        ["accepted", null],
        ["rejected", "Wrong key"],
        ["rejected", "Wrong key"],
      ]);
      expect(log[0].summary).toBe("not json");
      expect(log[2]).toMatchObject({ intakeLeadId: id, externalId: "L1", summary: "Dana Reyes · 432-555-0133 · Midland County · roofing · TX_MIDLAND_ROOFING_LG_202610" });
      expect(log[1].intakeLeadId).toBe(id);
      await expect(t.query(api.intake.recentLog, {})).rejects.toThrow(/signed in/);

      const [row] = await va.as.query(api.intake.queue, {});
      expect(row).toMatchObject({
        source: "meta", status: "new", name: "Dana Reyes", phone: "432-555-0133", county: "Midland", countyFromCampaign: "Midland",
        jobType: "roofing", tradeName: "Roofing", isOwner: true, attempts: [], lastAttempt: null,
      });
      expect(row.duplicateOf).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
    // With no key configured the endpoint says so instead of accepting anything.
    expect((await t.fetch("/intake/lead?key=s3cret", { method: "POST", body: "{}" })).status).toBe(503);
  });

  test("staff get an email for a new lead, and for a rejected webhook hit at most once an hour", async () => {
    const { t } = await ops();
    const emails: Array<{ to: string[]; subject: string; text: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        emails.push(JSON.parse(init.body as string));
        return { ok: true, status: 200, json: async () => ({ id: `em_${emails.length}` }) };
      }),
    );
    vi.stubEnv("INTAKE_KEY", "s3cret");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("SITE_URL", "https://app.example");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-22T16:00:00Z"));
      const post = async (path: string, body: string) => {
        const res = await t.fetch(path, { method: "POST", body });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
        return res.status;
      };
      // A new lead: one email to the owner and staff, pointing at Intake.
      expect(await post("/intake/lead?key=s3cret&source=meta", JSON.stringify({ full_name: "Dana Reyes", phone_number: "432-555-0133", campaign_name: "TX_MIDLAND_ROOFING_LG_202610", id: "L1" }))).toBe(201);
      expect(emails).toHaveLength(1);
      expect(emails[0].to.sort()).toEqual(["owner@fieldquote.example", "va@fieldquote.example"]);
      expect(emails[0].subject).toBe("FieldQuote Ops: New lead to confirm: Dana Reyes · 432-555-0133 · Midland County · roofing · TX_MIDLAND_ROOFING_LG_202610");
      expect(emails[0].text).toContain("A lead just came in from meta");
      expect(emails[0].text).toContain("https://app.example/ops?tab=intake");
      // Zapier retrying the same lead is not news.
      expect(await post("/intake/lead?key=s3cret", JSON.stringify({ full_name: "Dana Reyes", phone_number: "432-555-0133", id: "L1" }))).toBe(200);
      expect(emails).toHaveLength(1);
      // A rejected hit: one email, and the retries in the next hour stay quiet.
      expect(await post("/intake/lead?key=wrong", "{}")).toBe(401);
      expect(emails).toHaveLength(2);
      expect(emails[1].subject).toBe("FieldQuote Ops: The intake webhook turned a lead away: Wrong key");
      expect(emails[1].text).toContain("check the key and that the body is JSON");
      expect(await post("/intake/lead?key=wrong", "{}")).toBe(401);
      expect(await post("/intake/lead?key=s3cret", "not json")).toBe(400);
      expect(emails).toHaveLength(2);
      // An hour on, the next rejection is worth a word again.
      vi.setSystemTime(new Date("2026-10-22T17:01:00Z"));
      expect(await post("/intake/lead?key=s3cret", "still not json")).toBe(400);
      expect(emails).toHaveLength(3);
      expect(emails[2].subject).toBe("FieldQuote Ops: The intake webhook turned a lead away: Send JSON");
      expect(emails[2].text).toContain("What it sent: still not json");
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  test("staff add, correct, log attempts on and close leads; a repeat phone within 45 days is flagged", async () => {
    const { t, va } = await ops();
    const other = await signUp(t, "other@example.com");
    await expect(other.as.mutation(api.intake.create, { source: "call", name: "X" })).rejects.toThrow(/staff/);
    await expect(va.as.mutation(api.intake.create, { source: "call" })).rejects.toThrow(/name or a phone/);
    await expect(va.as.mutation(api.intake.create, { source: "call", name: "X", county: "Narnia" })).rejects.toThrow(/Texas county/);
    await expect(va.as.mutation(api.intake.create, { source: "call", name: "X", jobType: "plumbing" })).rejects.toThrow(/trade/);

    const { id, duplicate } = await va.as.mutation(api.intake.create, {
      source: "call", name: "Pat Cole", phone: "(432) 555-0101", city: "Odessa", county: "ector county", jobType: "painting", notes: "Two bedrooms",
    });
    expect(duplicate).toBe(false);
    // Same number through the webhook: flagged, not dropped.
    const repeat = await t.mutation(internal.intake.receive, { payload: { name: "P. Cole", phone: "+1 432 555 0101" }, source: "api" });
    expect(repeat.duplicate).toBe(true);
    const dup = await va.as.query(api.intake.get, { id: repeat.id });
    expect(dup.duplicate).toMatchObject({ id, label: "Pat Cole" });

    await va.as.mutation(api.intake.update, { id, address: "12 Elm St", notes: "" });
    await va.as.mutation(api.intake.logAttempt, { id, outcome: "voicemail" });
    await va.as.mutation(api.intake.logAttempt, { id, outcome: "reached", note: "Call back after 5" });
    const row = await va.as.query(api.intake.get, { id });
    expect(row).toMatchObject({ status: "working", county: "Ector", address: "12 Elm St", attempts: [{ outcome: "voicemail" }, { outcome: "reached", note: "Call back after 5" }] });
    expect(row.notes).toBeUndefined();
    expect(row.lastAttempt).toMatchObject({ outcome: "reached" });

    // Open queue: newest first; closing takes one out and reopening brings it back.
    expect((await va.as.query(api.intake.queue, {})).map((r) => r.label)).toEqual(["P. Cole", "Pat Cole"]);
    await va.as.mutation(api.intake.close, { id: repeat.id, disposition: "duplicate" });
    expect((await va.as.query(api.intake.queue, {})).map((r) => r.label)).toEqual(["Pat Cole"]);
    expect((await va.as.query(api.intake.queue, { status: "closed" })).map((r) => r.disposition)).toEqual(["duplicate"]);
    await va.as.mutation(api.intake.reopen, { id: repeat.id });
    expect((await va.as.query(api.intake.queue, {})).length).toBe(2);
  });

  test("the owner can fill the queue with demo leads, once, and Remove demo data takes them out again", async () => {
    const { owner, va } = await ops();
    await expect(va.as.mutation(api.intake.addDemoLeads, {})).rejects.toThrow(/admins/);
    const real = await va.as.mutation(api.intake.create, { source: "call", name: "Real Lead", phone: "4325550999" });
    expect(await owner.as.mutation(api.intake.addDemoLeads, {})).toEqual({ added: 6 });
    expect(await owner.as.mutation(api.intake.addDemoLeads, {})).toEqual({ added: 0 });
    const queue = await va.as.query(api.intake.queue, {});
    expect(queue).toHaveLength(7);
    expect(queue.filter((r) => r.isSample)).toHaveLength(6);
    const dup = queue.find((r) => r.label === "D. Reyes")!;
    expect(dup.duplicateOf).toBe(queue.find((r) => r.label === "Dana Reyes")!.id);
    expect(queue.find((r) => r.label === "Pat Cole")!.attempts).toHaveLength(2);
    expect(queue.find((r) => r.label === "Dana Reyes")!.consent?.value).toBe("true");
    await owner.as.mutation(api.marketplace.removeDemoData, {});
    expect((await va.as.query(api.intake.queue, {})).map((r) => r.id)).toEqual([real.id]);
  });

  test("nothing is listed until all six checks are ticked; then the auction runs and the lead carries the confirmation", async () => {
    const { t, owner, va } = await ops();
    // A funded painting bidder in Ector County.
    const co = await signUp(t, "painter@example.com");
    await t.run(async (ctx) => {
      await ctx.db.patch(co.organizationId, { leadTrades: ["painting"], walletBalanceCents: 100000 });
    });
    await co.as.mutation(api.bids.setStanding, { organizationId: co.organizationId, county: "Ector", jobType: "painting", amount: 250 });

    const { id } = await va.as.mutation(api.intake.create, { source: "call", name: "Pat Cole", phone: "432-555-0101", city: "Odessa", jobType: "painting", scope: "repair", timeline: "month", notes: "Two bedrooms" });
    // Before confirming, staff see where it goes: to the funded bid in Ector; to the Marketplace in Midland
    // (the painter buys painting but has no bid there); nowhere for roofing, which no company buys.
    expect(await va.as.query(api.intake.destination, { county: "Ector", jobType: "painting" })).toMatchObject({ kind: "sold", companyName: "painter@example.com Co", priceCents: 25000 });
    expect(await va.as.query(api.intake.destination, { county: "Midland", jobType: "painting" })).toMatchObject({ kind: "marketplace", buyers: 1, tradeName: "Painting" });
    expect((await va.as.query(api.intake.destination, { county: "Midland", jobType: "painting" }))).toHaveProperty("priceCents");
    expect(await va.as.query(api.intake.destination, { county: "Midland", jobType: "roofing" })).toMatchObject({ kind: "nobody", tradeName: "Roofing" });
    expect(await va.as.query(api.intake.destination, { county: "", jobType: "roofing" })).toBeNull();
    const all = { reached: true, phoneOwner: true, addressInCounty: true, trade: true, owner: true, consent: true };
    await expect(va.as.mutation(api.intake.confirm, { id, checks: { ...all, consent: false } })).rejects.toThrow(/consent read/);
    await expect(va.as.mutation(api.intake.confirm, { id, checks: all })).rejects.toThrow(/county/);
    expect(await va.as.query(api.marketplace.listInbox, {})).toMatchObject({ available: [] });

    const result = await va.as.mutation(api.intake.confirm, { id, checks: all, county: "Ector", address: "12 Elm St", note: "Wants it done before Thanksgiving" });
    expect(result).toMatchObject({ outcome: "sold", companyName: "painter@example.com Co", priceCents: 25000 });
    const row = await va.as.query(api.intake.get, { id });
    expect(row).toMatchObject({ status: "confirmed", confirmedLeadId: result.leadId, county: "Ector", address: "12 Elm St" });
    expect(row.attempts[row.attempts.length - 1]).toMatchObject({ outcome: "reached", note: "Wants it done before Thanksgiving" });
    expect((await va.as.query(api.intake.queue, { status: "confirmed" })).map((r) => r.id)).toEqual([id]);
    await expect(va.as.mutation(api.intake.confirm, { id, checks: all })).rejects.toThrow(/already confirmed/);

    // The company got it with the confirmation and the answers on the card.
    const [lead] = await co.as.query(api.leads.list, { organizationId: co.organizationId });
    expect(lead).toMatchObject({ name: "Pat Cole", county: "Ector", pricePaidCents: 25000, verified: { note: "Wants it done before Thanksgiving" } });
    expect(lead.notes).toBe("What kind of work? Repair\nWhen do they want it done? Within a month\nTwo bedrooms");
    const sold = (await owner.as.query(api.marketplace.listInbox, {})).sold;
    expect(sold.map((l: { source?: string }) => l.source)).toEqual(["Call"]);

    // A duplicate needs an explicit "list it anyway".
    const dup = await t.mutation(internal.intake.receive, { payload: { name: "Pat again", phone: "4325550101", county: "Ector", trade: "painting" }, source: "api" });
    await expect(va.as.mutation(api.intake.confirm, { id: dup.id, checks: all })).rejects.toThrow(/Same number/);
    const again = await va.as.mutation(api.intake.confirm, { id: dup.id, checks: all, allowDuplicate: true });
    expect(again.outcome).toBe("sold");
  });
});

describe("delivery", () => {
  test("email and text contents, and the hours the clock runs", async () => {
    const { emailBody, leadLink, smsText, withinHours } = await import("./delivery");
    // 11:00 and 19:59 Central are inside; 20:00 and 07:59 are not (CDT in October).
    expect(withinHours("2026-10-22T16:00:00Z")).toBe(true);
    expect(withinHours("2026-10-23T00:59:00Z")).toBe(true);
    expect(withinHours("2026-10-23T01:00:00Z")).toBe(false);
    expect(withinHours("2026-10-22T12:59:00Z")).toBe(false);
    const r = {
      lead: { id: "l1" as any, marketplaceLeadId: "m1" as any, name: "Dana Reyes", phone: "432-555-0133", address: "12 Elm St", city: "Midland", county: "Midland", notes: "Hail damage", verified: { at: "2026-10-22T15:00:00Z", note: "Wants it this month" }, pricePaidCents: 25000 },
      tradeName: "Roofing",
      company: { id: "o1" as any, name: "Peak Roofing", email: "office@peak.example", phone: "432-555-0100" },
      emails: ["office@peak.example"],
      mobiles: ["+14325550177"],
      homeownerConsent: true,
    };
    const link = leadLink("l1" as any, "https://app.example");
    expect(link).toBe("https://app.example/leads?lead=l1&ack=1");
    const sms = smsText(r, link);
    expect(sms).toBe("FieldQuote: new roofing lead in Midland. Dana 432-555-0133. Details: https://app.example/leads?lead=l1&ack=1 Reply STOP to opt out");
    expect(sms.length).toBeLessThanOrEqual(160);
    const email = emailBody(r, link);
    expect(email.subject).toBe("New roofing lead: Dana Reyes in Midland");
    expect(email.text).toContain("12 Elm St, Midland, Midland County");
    expect(email.text).toContain("Confirmed with the homeowner by FieldQuote: Wants it this month");
    expect(email.text).toContain("Yours exclusively for $250.00.");
    expect(email.html).toContain('href="tel:4325550133"');
    expect(email.html).toContain("Got it, calling now");
  });

  test("a sale alerts the company: skipped without keys, sent with them, and Got it stamps the lead", async () => {
    const t = setup();
    const va = await signUp(t, "va@fieldquote.example", { role: "staff" });
    const co = await signUp(t, "owner@peak.example");
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", { slug: "roofing", name: "Roofing", display_order: 1, is_active: true, created_at: now, updated_at: now });
      await ctx.db.patch(co.organizationId, { name: "Peak Roofing", email: "office@peak.example", phone: "432-555-0100", leadTrades: ["roofing"], walletBalanceCents: 100000 });
    });
    expect(await co.as.mutation(api.users.setMobile, { mobile: "(432) 555-0177" })).toBe("+14325550177");
    await expect(co.as.mutation(api.users.setMobile, { mobile: "555" })).rejects.toThrow(/10-digit/);
    expect((await co.as.query(api.users.me, {}))!.mobile).toBe("+14325550177");
    await co.as.mutation(api.bids.setStanding, { organizationId: co.organizationId, county: "Midland", jobType: "roofing", amount: 250 });

    const all = { reached: true, phoneOwner: true, addressInCounty: true, trade: true, owner: true, consent: true };
    const list = async () => {
      const { id } = await va.as.mutation(api.intake.create, { source: "call", name: "Dana Reyes", phone: "432-555-0133", city: "Midland", county: "Midland", jobType: "roofing" });
      vi.useFakeTimers();
      try {
        // The second listing reuses the number on purpose: list it anyway.
        const result = await va.as.mutation(api.intake.confirm, { id, checks: all, note: "Hail damage", allowDuplicate: true });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
        return result;
      } finally {
        vi.useRealTimers();
      }
    };

    // No keys on the deployment: both channels recorded as skipped, the sale untouched.
    const first = await list();
    expect(first.outcome).toBe("sold");
    let rows = await va.as.query(api.delivery.recent, {});
    expect(rows[0]).toMatchObject({ name: "Dana Reyes", companyName: "Peak Roofing", priceCents: 25000, wonVia: "bid", credited: false });
    expect(rows[0].acknowledgedAt).toBeUndefined();
    expect(rows[0].deliveries.map((d) => [d.channel, d.status])).toEqual([
      ["email", "skipped"],
      ["sms", "skipped"],
    ]);
    expect(rows[0].deliveries[0].to).toBe("office@peak.example, owner@peak.example");

    // With keys, both go out over HTTPS; a provider error is recorded as failed.
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("resend")) return { ok: true, status: 200, json: async () => ({ id: "em_1" }) };
        return { ok: false, status: 400, json: async () => ({ message: "Unverified number" }) };
      }),
    );
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_FROM", "+14320000000");
    vi.stubEnv("SITE_URL", "https://app.example/");
    try {
      await list();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
    rows = await va.as.query(api.delivery.recent, {});
    const sent = rows[0].deliveries;
    expect(sent.map((d) => [d.channel, d.status])).toEqual([
      ["email", "sent"],
      ["sms", "failed"],
    ]);
    expect(sent[1].error).toBe("Unverified number");
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const email = JSON.parse(calls[0].init.body as string);
    expect(email.to).toEqual(["office@peak.example", "owner@peak.example"]);
    expect(email.text).toContain(`https://app.example/leads?lead=${rows[0].orgLeadId}&ack=1`);
    expect(calls[1].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(String(calls[1].init.body)).toContain("To=%2B14325550177");
    // The failed text is a person's problem now: staff hear about it, with the company's number to call.
    expect(calls).toHaveLength(3);
    const toStaff = JSON.parse(calls[2].init.body as string);
    expect(toStaff.to).toEqual(["va@fieldquote.example"]);
    expect(toStaff.subject).toBe("FieldQuote Ops: The alert to Peak Roofing failed: Unverified number");
    expect(toStaff.text).toContain("Text to +14325550177: Unverified number");
    expect(toStaff.text).toContain("Call them on 432-555-0100");
    expect(toStaff.text).toContain("https://app.example/ops?tab=sold");

    // "Got it" from the company stamps both rows; the Delivered tab shows it.
    const leads = await co.as.query(api.leads.list, { organizationId: co.organizationId });
    const mine = leads.find((l) => l._id === rows[0].orgLeadId)!;
    const at = await co.as.mutation(api.leads.acknowledge, { id: mine._id });
    expect(at).toBeTruthy();
    expect(await co.as.mutation(api.leads.acknowledge, { id: mine._id })).toBe(at);
    rows = await va.as.query(api.delivery.recent, {});
    expect(rows[0]).toMatchObject({ acknowledgedAt: at, overdue: false });
    expect((await co.as.query(api.leads.list, { organizationId: co.organizationId })).find((l) => l._id === mine._id)!.acknowledgedAt).toBe(at);
    // Staff can send the alerts again.
    await va.as.mutation(api.delivery.resend, { orgLeadId: mine._id });
    const other = await signUp(t, "other@example.com");
    await expect(other.as.query(api.delivery.recent, {})).rejects.toThrow(/staff/);
  });

  test("an unacknowledged lead turns overdue after 15 minutes during hours, never after hours", async () => {
    const t = setup();
    const va = await signUp(t, "va@fieldquote.example", { role: "staff" });
    const co = await signUp(t, "co@example.com");
    const make = async (assignedAt: string) =>
      t.run(async (ctx) => {
        const now = assignedAt;
        const orgLeadId = await ctx.db.insert("leads", { name: "X", status: "new", organizationId: co.organizationId, userId: co.userId, createdAt: now, updatedAt: now });
        const id = await ctx.db.insert("marketplaceLeads", {
          name: "X", status: "assigned", assignedOrganizationId: co.organizationId, assignedAt, orgLeadId, createdBy: va.userId, createdAt: now, updatedAt: now,
        });
        await ctx.db.patch(orgLeadId, { marketplaceLeadId: id });
        return id;
      });
    vi.useFakeTimers();
    try {
      // 11:20 Central: a lead from 11:00 is overdue, one from 11:10 is not, one from 7:30 (before hours) is not.
      vi.setSystemTime(new Date("2026-10-22T16:20:00Z"));
      const late = await make("2026-10-22T16:00:00Z");
      const fresh = await make("2026-10-22T16:10:00Z");
      const early = await make("2026-10-22T12:30:00Z");
      const rows = await va.as.query(api.delivery.recent, {});
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(byId.get(late)).toMatchObject({ overdue: true, minutesOpen: 20, afterHours: false });
      expect(byId.get(fresh)).toMatchObject({ overdue: false, minutesOpen: 10 });
      expect(byId.get(early)).toMatchObject({ overdue: false, afterHours: true });

      // The five-minute chase emails staff about the late one, once; the others are left alone.
      const emails: Array<{ to: string[]; subject: string; text: string }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          emails.push(JSON.parse(init.body as string));
          return { ok: true, status: 200, json: async () => ({ id: "em_1" }) };
        }),
      );
      vi.stubEnv("RESEND_API_KEY", "re_test");
      vi.stubEnv("SITE_URL", "https://app.example");
      await t.run(async (ctx) => {
        await ctx.db.patch(co.organizationId, { name: "Cole Roofing", phone: "432-555-0100" });
      });
      expect(await t.mutation(internal.delivery.escalateOverdue, {})).toEqual({ escalated: 1 });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toEqual(["va@fieldquote.example"]);
      expect(emails[0].subject).toBe('FieldQuote Ops: No "Got it" from Cole Roofing after 20 min: X');
      expect(emails[0].text).toContain("Call them on 432-555-0100");
      expect(emails[0].text).toContain("https://app.example/ops?tab=sold");
      expect(await t.mutation(internal.delivery.escalateOverdue, {})).toEqual({ escalated: 0 });
      // Ten minutes on, the fresh one is overdue too and gets its own email; the late one stays at one.
      vi.setSystemTime(new Date("2026-10-22T16:30:00Z"));
      expect(await t.mutation(internal.delivery.escalateOverdue, {})).toEqual({ escalated: 1 });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(emails).toHaveLength(2);
      expect(emails[1].subject).toContain("after 20 min");
      // A "Got it" ends the chase: an acknowledged lead that has not been chased yet never is.
      const quiet = await make("2026-10-22T16:00:00Z");
      await t.run(async (ctx) => {
        await ctx.db.patch(quiet, { acknowledgedAt: "2026-10-22T16:03:00Z" });
      });
      expect(await t.mutation(internal.delivery.escalateOverdue, {})).toEqual({ escalated: 0 });
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

describe("demand board", () => {
  test("adds up funded bids, depth and leads per county and trade, with a margin against the planned cost", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@fieldquote.example", { role: "super_admin" });
    const va = await signUp(t, "va@fieldquote.example", { role: "staff" });
    const rich = await signUp(t, "rich@example.com");
    const poor = await signUp(t, "poor@example.com");
    const mid = await signUp(t, "mid@example.com");
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", { slug: "roofing", name: "Roofing", display_order: 1, is_active: true, created_at: now, updated_at: now });
      await ctx.db.insert("industries", { slug: "painting", name: "Painting", display_order: 2, is_active: true, created_at: now, updated_at: now });
      await ctx.db.patch(rich.organizationId, { name: "Rich Roofing", leadTrades: ["roofing", "painting"], walletBalanceCents: 100000 });
      await ctx.db.patch(mid.organizationId, { name: "Mid Roofing", leadTrades: ["roofing"], walletBalanceCents: 30000 });
      await ctx.db.patch(poor.organizationId, { name: "Poor Roofing", leadTrades: ["roofing"], walletBalanceCents: 100 });
    });
    for (const [who, amount] of [[rich, 300], [mid, 250], [poor, 400]] as const) {
      await t.run(async (ctx) => { await ctx.db.patch(who.organizationId, { walletBalanceCents: 100000 }); });
      await who.as.mutation(api.bids.setStanding, { organizationId: who.organizationId, county: "Midland", jobType: "roofing", amount });
    }
    await rich.as.mutation(api.bids.setStanding, { organizationId: rich.organizationId, county: "Ector", jobType: "painting", amount: 200 });
    // Balances as they really are: Poor can't pay its $400 bid.
    await t.run(async (ctx) => {
      await ctx.db.patch(mid.organizationId, { walletBalanceCents: 30000 });
      await ctx.db.patch(poor.organizationId, { walletBalanceCents: 100 });
    });
    // Two roofing leads in Midland sold at award, one painting lead sitting in the Marketplace in Ector.
    for (const name of ["A", "B"]) {
      await va.as.mutation(api.marketplace.createLead, { data: { name, phone: "4325550100", county: "Midland", jobType: "roofing" } });
    }
    await va.as.mutation(api.marketplace.createLead, { data: { name: "C", county: "Ector", jobType: "painting" } });
    await t.run(async (ctx) => { await ctx.db.patch(rich.organizationId, { walletBalanceCents: 0 }); });
    await va.as.mutation(api.marketplace.createLead, { data: { name: "D", county: "Ector", jobType: "painting" } });
    await t.run(async (ctx) => { await ctx.db.patch(rich.organizationId, { walletBalanceCents: 100000 - 60000 }); });
    // A flooring lead in Midland, a trade no company buys: red for a different reason.
    await va.as.mutation(api.marketplace.createLead, { data: { name: "E", county: "Midland", jobType: "flooring" } });

    // Before a cost per lead is typed, a square with buyers is "unknown", never green: nobody should run ads on it.
    const slotOf = async () => (await va.as.query(api.demand.board, {})).slots.find((s) => s.county === "Midland" && s.jobType === "roofing")!;
    expect(await slotOf()).toMatchObject({ marginCents: null, state: "unknown" });
    // A cost above the biggest bid is a loss, labelled as such rather than as "nobody can pay".
    await owner.as.mutation(api.demand.setPlanCpl, { jobType: "roofing", cents: 40000 });
    expect(await slotOf()).toMatchObject({ marginCents: 30000 - 40000 - 500, state: "loss" });

    // No snapshot to build: the board reads live.
    await owner.as.mutation(api.demand.setPlanCpl, { jobType: "roofing", cents: 6000 });
    await expect(va.as.mutation(api.demand.setPlanCpl, { jobType: "roofing", cents: 6000 })).rejects.toThrow(/admins/);
    const board = await va.as.query(api.demand.board, {});
    expect(board.vaCostCents).toBe(500);
    expect(board.demoLeads).toBe(false);
    const midland = board.slots.find((s) => s.county === "Midland" && s.jobType === "roofing")!;
    // Rich ($400 left after two $300 leads? no: balance is $400 now) and Mid can pay; Poor can't.
    expect(midland).toMatchObject({
      tradeName: "Roofing", bidders: 3, fundedBidders: 2, topFundedCents: 30000, secondFundedCents: 25000,
      depthLeads: Math.floor(40000 / 30000) + Math.floor(30000 / 25000), listed7: 2, listed30: 2, soldAtAward30: 2, inMarketplace: 0, inVault: 0,
      sold30: 2, avgSoldCents: 30000, minSoldCents: 30000, maxSoldCents: 30000, lastSoldCents: 30000, sellThrough: 1,
      planCplCents: 6000, marginCents: 30000 - 6000 - 500, marginBasis: "bid", state: "open",
    });
    const ector = board.slots.find((s) => s.county === "Ector" && s.jobType === "painting")!;
    expect(ector).toMatchObject({ bidders: 1, fundedBidders: 1, topFundedCents: 20000, listed30: 2, soldAtAward30: 1, sold30: 1, avgSoldCents: 20000, sellThrough: 0.5, inMarketplace: 1, state: "oversupplied" });
    expect(ector.marginCents).toBeNull();
    expect(ector.buyers).toBe(1);
    expect(board.slots[0]).toBe(midland);
    const flooring = board.slots.find((s) => s.county === "Midland" && s.jobType === "flooring")!;
    expect(flooring).toMatchObject({ bidders: 0, buyers: 0, inMarketplace: 1, state: "nobuyers" });
    expect((await va.as.query(api.demand.slot, { county: "Midland", jobType: "flooring" })).buyers).toEqual([]);

    const detail = await va.as.query(api.demand.slot, { county: "Midland", jobType: "roofing" });
    expect(detail.buyers.sort()).toEqual(["Mid Roofing", "Poor Roofing", "Rich Roofing"]);
    expect(detail.bidders.map((b) => [b.companyName, b.amountCents, b.funded])).toEqual([
      ["Poor Roofing", 40000, false],
      ["Rich Roofing", 30000, true],
      ["Mid Roofing", 25000, true],
    ]);
    expect(detail.leads.map((l) => [l.name, l.status, l.companyName])).toEqual([
      ["B", "assigned", "Rich Roofing"],
      ["A", "assigned", "Rich Roofing"],
    ]);
    expect((await va.as.mutation(api.demand.refresh, {})).slots).toBe(3);
    // A bid raised just now shows on the board at once, no refresh in between.
    await t.run(async (ctx) => {
      const bid = (await ctx.db.query("standingBids").collect()).find((b) => b.organizationId === rich.organizationId && b.jobType === "roofing")!;
      await ctx.db.patch(bid._id, { amountCents: 35000 });
    });
    expect((await va.as.query(api.demand.board, {})).slots.find((s) => s.county === "Midland" && s.jobType === "roofing")?.topFundedCents).toBe(35000);
    // A third sale, at the raised bid: from here the margin is on what leads actually fetched, not the top bid.
    await va.as.mutation(api.marketplace.createLead, { data: { name: "F", phone: "4325550101", county: "Midland", jobType: "roofing" } });
    const after = (await va.as.query(api.demand.board, {})).slots.find((s) => s.county === "Midland" && s.jobType === "roofing")!;
    expect(after).toMatchObject({ sold30: 3, minSoldCents: 30000, maxSoldCents: 35000, lastSoldCents: 35000, avgSoldCents: Math.round((30000 + 30000 + 35000) / 3), marginBasis: "sold" });
    expect(after.marginCents).toBe(Math.round((30000 + 30000 + 35000) / 3) - 6000 - 500);
    const other = await signUp(t, "other@example.com");
    await expect(other.as.query(api.demand.board, {})).rejects.toThrow(/staff/);
  });

  test("demo leads fill the board only until the first real lead exists", async () => {
    const t = setup();
    const va = await signUp(t, "va@fieldquote.example", { role: "staff" });
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", { slug: "painting", name: "Painting", display_order: 1, is_active: true, created_at: now, updated_at: now });
      await ctx.db.insert("marketplaceLeads", { name: "Demo A", county: "Ector", jobType: "painting", status: "available", isSample: true, createdBy: va.userId, createdAt: now, updatedAt: now } as any);
    });
    const demo = await va.as.query(api.demand.board, {});
    expect(demo.demoLeads).toBe(true);
    expect(demo.slots.find((s) => s.county === "Ector" && s.jobType === "painting")).toMatchObject({ listed30: 1, inMarketplace: 1 });
    await va.as.mutation(api.marketplace.createLead, { data: { name: "Real", county: "Midland", jobType: "painting" } });
    const real = await va.as.query(api.demand.board, {});
    expect(real.demoLeads).toBe(false);
    expect(real.slots.find((s) => s.county === "Ector" && s.jobType === "painting")).toBeUndefined();
    expect(real.slots.find((s) => s.county === "Midland" && s.jobType === "painting")).toMatchObject({ listed30: 1 });
  });
});

describe("estimates", () => {
  test("totals are derived from items and tax, and recalculated on update", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        title: "Roof replacement",
        taxRate: 10,
        items: [
          { description: "Tear-off", quantity: 20, unitPrice: 85 },
          {
            description: "Shingles",
            quantity: "20",
            unitPrice: 120,
            totalPrice: 999999,
          },
        ],
      },
    });
    expect(estimate).toMatchObject({
      status: "draft",
      subtotal: 4100,
      taxAmount: 410,
      totalAmount: 4510,
    });
    expect(estimate!.estimateNumber).toMatch(/^EST-\d{4}-\d{6}$/);
    expect(estimate!.items.map((i) => i.totalPrice)).toEqual([1700, 2400]);
    expect(estimate!.items[0]._id).toEqual(expect.any(String));

    const updated = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { taxRate: 0, status: "sent" },
    });
    expect(updated).toMatchObject({
      status: "sent",
      subtotal: 4100,
      taxAmount: 0,
      totalAmount: 4100,
    });

    const signed = await as.mutation(api.estimates.sign, {
      id: estimate!._id,
      signature: "J. Smith",
    });
    expect(signed).toMatchObject({
      status: "accepted",
      clientSignature: "J. Smith",
    });
    expect(signed!.signedAt).toEqual(expect.any(String));

    const log = await as.query(api.activityLogs.list, {
      organizationId,
      resourceType: "estimate",
    });
    expect(log.map((entry) => entry.action)).toEqual([
      "signed",
      "status_changed",
      "created",
    ]);
  });

  test("an item's price never goes below its red line", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        items: [
          {
            description: "Wire",
            quantity: 2,
            unitPrice: 187.5,
            redLinePrice: 87.5,
            capPrice: 187.5,
          },
          { description: "Custom", quantity: 1, unitPrice: 10 },
        ],
      },
    });
    expect(estimate!.items[0]).toMatchObject({
      unitPrice: 187.5,
      redLinePrice: 87.5,
      capPrice: 187.5,
      totalPrice: 375,
    });

    const updated = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: {
        items: [{ ...estimate!.items[0], unitPrice: 50 }, estimate!.items[1]],
      },
    });
    expect(updated!.items[0]).toMatchObject({
      unitPrice: 87.5,
      totalPrice: 175,
    });
    expect(updated!.items[1]).toMatchObject({ unitPrice: 10 });
    expect(updated!.subtotal).toBe(185);
  });

  test("the contract follows the estimate until it is accepted, then stays as agreed", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const client = await as.mutation(api.clients.create, {
      organizationId,
      data: {
        name: "Dan Shah",
        email: "dan@example.com",
        address: "1 Main St",
        city: "Austin",
        state: "TX",
      },
    });
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        clientId: client!._id,
        items: [{ description: "Vanity", quantity: 1, unitPrice: 900 }],
      },
    });
    const terms = {
      startDate: "2026-11-01",
      paymentTerms: "50% deposit, 50% on completion",
    };
    const withTerms = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { contractTerms: terms },
    });
    expect(withTerms!.contractTerms).toEqual(terms);
    expect(withTerms).not.toHaveProperty("contractLockedAt");

    const accepted = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { status: "accepted" },
    });
    expect(accepted!.contractLockedAt).toEqual(expect.any(String));
    expect(accepted!.contractSnapshot).toMatchObject({
      client: {
        name: "Dan Shah",
        email: "dan@example.com",
        address: "1 Main St, Austin, TX",
      },
      totalAmount: 900,
      terms,
    });

    // Later estimate changes don't touch the agreed contract.
    const changed = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { items: [{ ...accepted!.items[0], unitPrice: 1200 }] },
    });
    expect(changed!.totalAmount).toBe(1200);
    expect(changed!.contractSnapshot!.totalAmount).toBe(900);
    expect(changed!.contractLockedAt).toBe(accepted!.contractLockedAt);
    await expect(
      as.mutation(api.estimates.update, {
        id: estimate!._id,
        data: { contractTerms: { startDate: "2027-01-01" } },
      }),
    ).rejects.toThrow(/change order/);
  });

  test("signing locks the contract, and the lock can't be set or cleared directly", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        contractLockedAt: "2020-01-01",
        contractSnapshot: {
          items: [],
          subtotal: 0,
          taxAmount: 0,
          totalAmount: 0,
        },
      },
    });
    expect(estimate).not.toHaveProperty("contractLockedAt");
    expect(estimate).not.toHaveProperty("contractSnapshot");
    const signed = await as.mutation(api.estimates.sign, {
      id: estimate!._id,
      signature: "J. Smith",
    });
    expect(signed!.contractLockedAt).toEqual(expect.any(String));
    const cleared = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { contractLockedAt: null, contractSnapshot: null },
    });
    expect(cleared!.contractLockedAt).toBe(signed!.contractLockedAt);
  });

  test("a design file is attached, replaced and removed; the signed contract keeps its copy", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {},
    });
    const store = (type: string, body = "x") =>
      t.run((ctx) => ctx.storage.store(new Blob([body], { type })));
    const exists = (id: Id<"_storage">) =>
      t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);

    expect(
      await as.mutation(api.estimates.designUploadUrl, { id: estimate!._id }),
    ).toEqual(expect.any(String));
    const first = await store("image/png");
    const withDesign = await as.mutation(api.estimates.setDesign, {
      id: estimate!._id,
      storageId: first,
      name: "plan.png",
    });
    expect(withDesign!.design).toMatchObject({
      storageId: first,
      name: "plan.png",
    });
    expect(withDesign!.design!.contentType).toMatch(/^image\//);
    expect(withDesign!.design!.url).toEqual(expect.any(String));

    // Replacing deletes the old file.
    const second = await store("application/pdf");
    await as.mutation(api.estimates.setDesign, {
      id: estimate!._id,
      storageId: second,
      name: "plan.pdf",
    });
    expect(await exists(first)).toBe(false);

    // Other file types are refused.
    const text = await store("text/plain");
    await expect(
      as.mutation(api.estimates.setDesign, {
        id: estimate!._id,
        storageId: text,
        name: "notes.txt",
      }),
    ).rejects.toThrow(/image or PDF/);

    // The design can't be set through update.
    const updated = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { design: null },
    });
    expect(updated!.design!.storageId).toBe(second);

    // Once accepted, removing the design leaves the signed contract's copy.
    const accepted = await as.mutation(api.estimates.update, {
      id: estimate!._id,
      data: { status: "accepted" },
    });
    expect(accepted!.contractSnapshot!.design!.storageId).toBe(second);
    const removed = await as.mutation(api.estimates.removeDesign, {
      id: estimate!._id,
    });
    expect(removed).not.toHaveProperty("design");
    expect(await exists(second)).toBe(true);

    // Deleting the estimate deletes its files.
    await as.mutation(api.estimates.remove, { id: estimate!._id });
    expect(await exists(second)).toBe(false);
  });

  test("signature can only be set through sign", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: { clientSignature: "forged", signedAt: "2020-01-01" },
    });
    expect(estimate).not.toHaveProperty("clientSignature");
    expect(estimate).not.toHaveProperty("signedAt");
  });

  test("filters by client and status", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const client = await as.mutation(api.clients.create, {
      organizationId,
      data: { name: "C" },
    });
    await as.mutation(api.estimates.create, {
      organizationId,
      data: { clientId: client!._id },
    });
    await as.mutation(api.estimates.create, {
      organizationId,
      data: { status: "sent" },
    });
    expect(await as.query(api.estimates.list, { organizationId })).toHaveLength(
      2,
    );
    expect(
      await as.query(api.estimates.list, {
        organizationId,
        clientId: client!._id,
      }),
    ).toHaveLength(1);
    expect(
      await as.query(api.estimates.list, { organizationId, status: "sent" }),
    ).toHaveLength(1);
  });
});

describe("price book", () => {
  test("seed creates every trade's shared catalog once", async () => {
    const t = setup();
    expect(await t.action(internal.seed.catalog, {})).toEqual({
      pricingModes: 3,
      industries: STARTER_INDUSTRIES.length,
      legacyRoofingCodesRemoved: 0,
      costCodes: STARTER_COST_CODES.length,
      lineItems: STARTER_ITEMS.length,
    });
    expect(await t.action(internal.seed.catalog, {})).toEqual({
      pricingModes: 0,
      industries: 0,
      legacyRoofingCodesRemoved: 0,
      costCodes: 0,
      lineItems: 0,
    });
  });

  test("seed replaces the first roofing seed but keeps codes a company uses", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const now = new Date().toISOString();
    const [unused, used] = await t.run(async (ctx) => {
      const ids = [];
      for (const code of ["ROOF-VENT", "ROOF-LAB"]) {
        const id = await ctx.db.insert("costCodes", {
          code,
          name: code,
          industry_id: "roofing",
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        await ctx.db.insert("lineItems", {
          name: `${code} item`,
          base_price: 1,
          unit: "each",
          cost_code_id: id,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        ids.push(id);
      }
      await ctx.db.insert("lineItems", {
        name: "Alice's roofing labor",
        base_price: 1,
        unit: "hour",
        cost_code_id: ids[1],
        organization_id: alice.organizationId,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      return ids;
    });
    expect(await t.action(internal.seed.catalog, {})).toMatchObject({
      legacyRoofingCodesRemoved: 1,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(unused)).toBeNull();
      expect(await ctx.db.get(used)).not.toBeNull();
    });
  });

  test("orgs see shared items plus their own, never another org's", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const total = STARTER_ITEMS.length;

    const shared = await alice.as.query(api.lineItems.list, {
      organizationId: alice.organizationId,
    });
    expect(shared).toHaveLength(total);
    const shingles = shared.find((item) => item.name === "Designer Shingles")!;
    expect(shingles).toMatchObject({
      base_price: 300,
      red_line_price: 240,
      cap_price: 360,
    });
    expect(shingles.cost_code).toMatchObject({
      code: "RF500",
      name: "Roofing Materials",
      industry_id: "roofing",
    });
    expect(shingles.service_category).toBe("Roofing Materials");
    // Items without their own range get the old default: 70% to 150% of base.
    const dripEdge = shared.find((item) => item.name === "Drip Edge")!;
    expect(dripEdge).toMatchObject({
      base_price: 4.5,
      red_line_price: 3.15,
      cap_price: 6.75,
    });

    const costCodeId = shingles.cost_code_id;
    const own = await alice.as.mutation(api.lineItems.create, {
      data: {
        name: "Alice's special",
        organization_id: alice.organizationId,
        cost_code_id: costCodeId,
        base_price: 10,
        unit: "each",
      },
    });
    expect(own.user_id).toBe(alice.userId);

    expect(
      await alice.as.query(api.lineItems.list, {
        organizationId: alice.organizationId,
      }),
    ).toHaveLength(total + 1);
    expect(
      await alice.as.query(api.lineItems.list, {
        organizationId: alice.organizationId,
        includeShared: false,
      }),
    ).toHaveLength(1);
    expect(
      await bob.as.query(api.lineItems.list, {
        organizationId: bob.organizationId,
      }),
    ).toHaveLength(total);
    await expect(
      bob.as.query(api.lineItems.get, { id: own._id }),
    ).rejects.toThrow(/access/);

    const searched = await alice.as.query(api.lineItems.list, {
      organizationId: alice.organizationId,
      search: "tear-off",
    });
    expect(searched.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "Double Layer Tear-off",
        "Single Layer Tear-off",
      ]),
    );

    await alice.as.mutation(api.lineItems.remove, { id: own._id });
    expect(
      await alice.as.query(api.lineItems.list, {
        organizationId: alice.organizationId,
      }),
    ).toHaveLength(total);
  });

  test("only admins change prices on their organization's items", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", {
        organizationId: alice.organizationId,
        userId: bob.userId,
        role: "member",
        createdAt: new Date().toISOString(),
      });
    });
    expect(
      await alice.as.query(api.organizations.myRole, {
        id: alice.organizationId,
      }),
    ).toBe("owner");
    expect(
      await bob.as.query(api.organizations.myRole, {
        id: alice.organizationId,
      }),
    ).toBe("member");

    const [shared] = await alice.as.query(api.lineItems.list, {
      organizationId: alice.organizationId,
    });
    const item = await alice.as.mutation(api.lineItems.create, {
      data: {
        name: "Service call",
        organization_id: alice.organizationId,
        cost_code_id: shared.cost_code_id,
        red_line_price: 80,
        cap_price: 150,
        unit: "each",
      },
    });
    expect(item).toMatchObject({
      base_price: 80,
      red_line_price: 80,
      cap_price: 150,
    });

    await expect(
      bob.as.mutation(api.lineItems.update, {
        id: item._id,
        data: { red_line_price: 50 },
      }),
    ).rejects.toThrow(/access/);
    const renamed = await bob.as.mutation(api.lineItems.update, {
      id: item._id,
      data: { name: "Service visit" },
    });
    expect(renamed).toMatchObject({
      name: "Service visit",
      red_line_price: 80,
    });

    await expect(
      alice.as.mutation(api.lineItems.update, {
        id: item._id,
        data: { cap_price: 60 },
      }),
    ).rejects.toThrow(/below the red line/);
    const repriced = await alice.as.mutation(api.lineItems.update, {
      id: item._id,
      data: { red_line_price: 90 },
    });
    expect(repriced).toMatchObject({
      base_price: 90,
      red_line_price: 90,
      cap_price: 150,
    });
  });

  test("cost codes carry their trade, and every trade is listed", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const { as, organizationId } = await signUp(t, "a@example.com");

    const industries = await as.query(api.industries.list, {});
    expect(industries).toHaveLength(STARTER_INDUSTRIES.length);
    expect(industries.find((i) => i.id === "hvac")).toMatchObject({
      slug: "hvac",
      name: "HVAC",
    });

    const hvacCodes = await as.query(api.costCodes.list, {
      industryId: "hvac",
    });
    expect(hvacCodes.map((cc) => cc.code)).toContain("HV500");
    expect(hvacCodes[0].industry).toMatchObject({ id: "hvac", name: "HVAC" });

    const items = await as.query(api.lineItems.list, { organizationId });
    const trades = new Set(items.map((item) => item.cost_code?.industry_id));
    for (const slug of [
      "roofing",
      "hvac",
      "electrical",
      "plumbing",
      "concrete",
      "drywall",
      "handyman",
      "window-door",
    ]) {
      expect(trades).toContain(slug);
    }
  });

  test("organizations choose their trades; only admins can change them", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");

    await alice.as.mutation(api.industries.setForOrganization, {
      organizationId: alice.organizationId,
      industryIds: ["roofing", "painting", "not-a-trade"],
    });
    const chosen = await alice.as.query(api.industries.forOrganization, {
      organizationId: alice.organizationId,
    });
    expect(chosen.map((i) => i.id).sort()).toEqual(["painting", "roofing"]);

    await alice.as.mutation(api.industries.setForOrganization, {
      organizationId: alice.organizationId,
      industryIds: ["roofing", "hvac"],
    });
    expect(
      (
        await alice.as.query(api.industries.forOrganization, {
          organizationId: alice.organizationId,
        })
      )
        .map((i) => i.id)
        .sort(),
    ).toEqual(["hvac", "roofing"]);
    // One list: the same trades drive leads and bids (the wallet reads them too).
    expect(
      (
        await alice.as.query(api.marketplace.wallet, {
          organizationId: alice.organizationId,
        })
      ).leadTrades,
    ).toEqual(["roofing", "hvac"]);

    await expect(
      bob.as.query(api.industries.forOrganization, {
        organizationId: alice.organizationId,
      }),
    ).rejects.toThrow(/access/);
    await expect(
      bob.as.mutation(api.industries.setForOrganization, {
        organizationId: alice.organizationId,
        industryIds: [],
      }),
    ).rejects.toThrow(/access/);
  });

  test("old Price Book trade picks fold into the company's trades, once", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    await alice.as.mutation(api.industries.setForOrganization, {
      organizationId: alice.organizationId,
      industryIds: ["concrete"],
    });
    // Rows the old picker wrote, including a duplicate and a trade that no longer exists.
    await t.run(async (ctx) => {
      for (const industrySlug of ["handyman", "concrete", "gone-trade"])
        await ctx.db.insert("organizationIndustries", {
          organizationId: alice.organizationId,
          industrySlug,
          createdAt: "2026-01-01T00:00:00Z",
        });
    });
    expect(await t.mutation(internal.industries.mergeChosenTrades, {})).toEqual({ companies: 1, rows: 3 });
    expect(
      (
        await alice.as.query(api.industries.forOrganization, {
          organizationId: alice.organizationId,
        })
      )
        .map((i) => i.id)
        .sort(),
    ).toEqual(["concrete", "handyman"]);
    expect(await t.run((ctx) => ctx.db.query("organizationIndustries").collect())).toEqual([]);
    // Running it again does nothing.
    expect(await t.mutation(internal.industries.mergeChosenTrades, {})).toEqual({ companies: 0, rows: 0 });
  });

  test("only super admins can change the shared catalog", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const alice = await signUp(t, "alice@example.com");
    const admin = await signUp(t, "admin@example.com", { role: "super_admin" });
    const [item] = await alice.as.query(api.lineItems.list, {
      organizationId: alice.organizationId,
    });

    await expect(
      alice.as.mutation(api.lineItems.update, {
        id: item._id,
        data: { base_price: 1 },
      }),
    ).rejects.toThrow(/administrators/);
    await expect(
      alice.as.mutation(api.costCodes.create, {
        data: { code: "X", name: "Shared" },
      }),
    ).rejects.toThrow(/administrators/);

    const updated = await admin.as.mutation(api.lineItems.update, {
      id: item._id,
      data: { base_price: 1 },
    });
    expect(updated.base_price).toBe(1);
  });

  test("org cost codes stay private and can't be used by other orgs", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const code = await alice.as.mutation(api.costCodes.create, {
      data: {
        code: "AL100",
        name: "Alice Labor",
        organization_id: alice.organizationId,
      },
    });
    expect(
      (await alice.as.query(api.costCodes.list, {})).map((cc) => cc.code),
    ).toEqual(["AL100"]);
    expect(await bob.as.query(api.costCodes.list, {})).toHaveLength(0);
    await expect(
      bob.as.mutation(api.lineItems.create, {
        data: {
          name: "x",
          organization_id: bob.organizationId,
          cost_code_id: code!._id,
          base_price: 1,
          unit: "each",
        },
      }),
    ).rejects.toThrow(/Cost code not found/);
  });

  test("pricing modes: presets plus the org's own", async () => {
    const t = setup();
    await t.action(internal.seed.catalog, {});
    const { as, organizationId } = await signUp(t, "a@example.com");
    await as.mutation(api.pricingModes.create, {
      organizationId,
      data: {
        name: "Storm Season",
        adjustments: { all: 1.25 },
        is_preset: true,
      },
    });
    const modes = await as.query(api.pricingModes.list, { organizationId });
    // Presets first, then the organization's own modes.
    expect(modes.map((m) => m.is_preset)).toEqual([true, true, true, false]);
    expect(modes[3]).toMatchObject({
      name: "Storm Season",
      is_preset: false,
      id: modes[3]._id,
    });
    expect(
      (await as.query(api.pricingModes.presets, {})).map((m) => m.name),
    ).toEqual(["Busy Season", "Competitive", "Need This Job"]);
  });
});

describe("leads", () => {
  test("create, list in priority order and stay inside the organization", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const organizationId = alice.organizationId;

    const later = await alice.as.mutation(api.leads.create, {
      organizationId,
      data: {
        name: " Jones ",
        followUpDate: "2026-11-01",
        jobType: "roofing",
        source: "Referral",
      },
    });
    expect(later).toMatchObject({
      name: "Jones",
      status: "new",
      userId: alice.userId,
    });
    await alice.as.mutation(api.leads.create, {
      organizationId,
      data: { name: "Soon", followUpDate: "2026-10-10" },
    });
    // No follow-up date: the appointment's day is what it sorts by.
    await alice.as.mutation(api.leads.create, {
      organizationId,
      data: { name: "Booked", appointmentAt: "2026-10-20T15:00:00.000Z" },
    });
    const lost = await alice.as.mutation(api.leads.create, {
      organizationId,
      data: { name: "Gone" },
    });
    await alice.as.mutation(api.leads.update, {
      id: lost!._id,
      data: { status: "lost", lostReason: "Too pricey" },
    });

    const names = (
      await alice.as.query(api.leads.list, { organizationId })
    ).map((lead) => lead.name);
    expect(names).toEqual(["Soon", "Booked", "Jones", "Gone"]);

    await expect(
      alice.as.mutation(api.leads.create, {
        organizationId,
        data: { name: "  " },
      }),
    ).rejects.toThrow(/name/);
    await expect(
      bob.as.query(api.leads.list, { organizationId }),
    ).rejects.toThrow(/access/);
    await expect(
      bob.as.mutation(api.leads.update, {
        id: later!._id,
        data: { name: "x" },
      }),
    ).rejects.toThrow(/Not found/);
    await expect(
      bob.as.mutation(api.leads.remove, { id: later!._id }),
    ).rejects.toThrow(/Not found/);
  });

  test("importLeads adds leads to the user's organization once", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const rows = [
      {
        name: "Pat Lee",
        phone: "(555) 010-2000",
        status: "quoted",
        estimatedValue: 4200,
        createdAt: "2025-03-01T00:00:00.000Z",
      },
      {
        name: "Sam Ortiz",
        email: "sam@example.com",
        status: "won",
        lostReason: "ignored",
      },
      { name: "Pat Lee", phone: "555-010-2000" },
    ];

    const first = await t.mutation(internal.leads.importLeads, {
      email: "alice@example.com",
      leads: rows,
    });
    expect(first).toEqual({ inserted: 2, updated: 0, skipped: 1 });
    const again = await t.mutation(internal.leads.importLeads, {
      email: "alice@example.com",
      leads: rows,
    });
    expect(again).toEqual({ inserted: 0, updated: 0, skipped: 3 });
    const refreshed = await t.mutation(internal.leads.importLeads, {
      email: "alice@example.com",
      leads: [
        {
          name: "Sam Ortiz",
          email: "sam@example.com",
          status: "scheduled",
          appointmentAt: "2026-10-08T19:00:00.000Z",
        },
      ],
      updateExisting: true,
    });
    expect(refreshed).toEqual({ inserted: 0, updated: 1, skipped: 0 });

    const leads = await alice.as.query(api.leads.list, {
      organizationId: alice.organizationId,
    });
    expect(leads).toHaveLength(2);
    expect(leads.find((lead) => lead.name === "Pat Lee")).toMatchObject({
      status: "quoted",
      estimatedValue: 4200,
      createdAt: "2025-03-01T00:00:00.000Z",
    });
    expect(leads.find((lead) => lead.name === "Sam Ortiz")).toMatchObject({
      status: "scheduled",
      appointmentAt: "2026-10-08T19:00:00.000Z",
    });
    expect(
      await bob.as.query(api.leads.list, {
        organizationId: bob.organizationId,
      }),
    ).toHaveLength(0);
    await expect(
      t.mutation(internal.leads.importLeads, {
        email: "nobody@example.com",
        leads: rows,
      }),
    ).rejects.toThrow(/No user/);
  });

  test("a lead's city comes from the form, the address or the zip", () => {
    expect(cityFromText("3809 Crestline Ave", "midland")).toBe("Midland");
    expect(cityFromText("123 Elm", "116 Midland")).toBe("Midland");
    expect(cityFromText("1658 n Tripp Odessa")).toBe("Odessa");
    expect(cityFromText("12 Main St, Big Spring, TX 79720")).toBe("Big Spring");
    expect(cityFromText("4500 E University Blvd TX 79762")).toBe("Odessa");
    expect(cityFromText("2811 Cimmaron Ave 79705")).toBe("Midland");
    // A street named after a town isn't the town.
    expect(cityFromText("500 Crane Ave")).toBeUndefined();
    expect(cityFromText("3809 Crestline Ave")).toBeUndefined();
    expect(cityFromText(undefined)).toBeUndefined();
    // A map search only counts when every match agrees.
    expect(
      cityFromSearch([
        { address: { city: "Midland" } },
        { address: { city: "Midland" } },
      ]),
    ).toBe("Midland");
    expect(
      cityFromSearch([
        { address: { city: "Midland" } },
        { address: { city: "Odessa" } },
      ]),
    ).toBeUndefined();
    expect(cityFromSearch([])).toBeUndefined();
  });

  test("street-only addresses get their city from a map lookup", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        decodeURIComponent(url).includes("Crestline")
          ? [{ address: { city: "Midland" } }]
          : [],
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const t = setup();
      const { as, organizationId } = await signUp(t, "a@example.com");
      const named = await as.mutation(api.leads.create, {
        organizationId,
        data: { name: "Ann", address: "1658 n Tripp Odessa" },
      });
      expect(named!.city).toBe("Odessa");
      const street = await as.mutation(api.leads.create, {
        organizationId,
        data: { name: "Bo", address: "3809 Crestline Ave" },
      });
      expect(street!.city).toBeUndefined();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const list = await as.query(api.leads.list, { organizationId });
      expect(list.find((lead) => lead.name === "Bo")!.city).toBe("Midland");

      // A new address is looked up again; a city picked by hand is kept.
      const moved = await as.mutation(api.leads.update, {
        id: street!._id,
        data: { address: "9 Nowhere Ln" },
      });
      expect(moved!.city).toBeUndefined();
      const picked = await as.mutation(api.leads.update, {
        id: street!._id,
        data: { address: "10 Nowhere Ln", city: "Odessa" },
      });
      expect(picked!.city).toBe("Odessa");

      // Leads from before (no city, never checked) are filled in once.
      await t.run(async (ctx) => {
        await ctx.db.patch(named!._id, {
          city: undefined,
          cityCheckedAt: undefined,
        });
      });
      expect(
        await as.mutation(api.leadCity.fillMissing, { organizationId }),
      ).toEqual({ set: 1, queued: 0, none: 0 });
      expect(
        await as.mutation(api.leadCity.fillMissing, { organizationId }),
      ).toEqual({ set: 0, queued: 0, none: 0 });
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  test("lost keeps its reason only while lost", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const lead = await as.mutation(api.leads.create, {
      organizationId,
      data: { name: "Smith" },
    });
    const lost = await as.mutation(api.leads.update, {
      id: lead!._id,
      data: { status: "lost", lostReason: "Went with another contractor" },
    });
    expect(lost).toMatchObject({
      status: "lost",
      lostReason: "Went with another contractor",
    });
    const reopened = await as.mutation(api.leads.update, {
      id: lead!._id,
      data: { status: "contacted" },
    });
    expect(reopened!.status).toBe("contacted");
    expect(reopened!.lostReason).toBeUndefined();
  });

  test("ensureClient creates one client; estimates must be the organization's own", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const lead = await alice.as.mutation(api.leads.create, {
      organizationId: alice.organizationId,
      data: { name: "Garcia", phone: "555-0100", email: "g@example.com" },
    });

    const clientId = await alice.as.mutation(api.leads.ensureClient, {
      id: lead!._id,
    });
    expect(
      await alice.as.mutation(api.leads.ensureClient, { id: lead!._id }),
    ).toBe(clientId);
    const clients = await alice.as.query(api.clients.list, {
      organizationId: alice.organizationId,
    });
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      name: "Garcia",
      phone: "555-0100",
      email: "g@example.com",
    });

    const bobsEstimate = await bob.as.mutation(api.estimates.create, {
      organizationId: bob.organizationId,
      data: {
        estimateNumber: "EST-1",
        status: "draft",
        issueDate: "2026-10-01",
        items: [],
      },
    });
    await expect(
      alice.as.mutation(api.leads.update, {
        id: lead!._id,
        data: { estimateId: bobsEstimate!._id },
      }),
    ).rejects.toThrow(/Estimate not found/);

    const estimate = await alice.as.mutation(api.estimates.create, {
      organizationId: alice.organizationId,
      data: {
        estimateNumber: "EST-2",
        status: "draft",
        issueDate: "2026-10-01",
        clientId,
        items: [{ description: "Roof", quantity: 1, unitPrice: 9000 }],
      },
    });
    await alice.as.mutation(api.leads.update, {
      id: lead!._id,
      data: { estimateId: estimate!._id, status: "quoted" },
    });
    const [listed] = await alice.as.query(api.leads.list, {
      organizationId: alice.organizationId,
    });
    expect(listed).toMatchObject({ status: "quoted", clientId });
    expect(listed.estimate).toMatchObject({
      estimateNumber: "EST-2",
      status: "draft",
      totalAmount: 9000,
    });
  });
});

describe("sample leads", () => {
  test("added only to an empty list, removed without touching real leads", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    expect(await as.mutation(api.leads.addSamples, { organizationId })).toBe(8);
    const leads = await as.query(api.leads.list, { organizationId });
    expect(new Set(leads.map((lead) => lead.status))).toEqual(
      new Set(["new", "contacted", "quoted", "won", "lost"]),
    );
    await expect(
      as.mutation(api.leads.addSamples, { organizationId }),
    ).rejects.toThrow(/empty/);
    // Samples past New carry the contact history their stage implies; new ones carry none.
    const dental = leads.find((lead) => lead.name === "Oak Street Dental")!;
    expect(dental).toMatchObject({ status: "contacted", contacts: 1 });
    expect(dental.lastContactAt! > dental.createdAt).toBe(true);
    expect(dental.lastContactAt! <= new Date().toISOString()).toBe(true);
    expect(leads.find((lead) => lead.name === "Tom Becker")).toMatchObject({
      contacts: 1,
      texts: 1,
    });
    const maria = leads.find((lead) => lead.name === "Maria Lopez")!;
    expect(maria.status).toBe("new");
    expect(maria.lastContactAt).toBeUndefined();
    expect(maria.contacts).toBeUndefined();
    // The timeline holds together: New leads came in hours ago with no
    // reminder; worked leads came in days ago, and only those carry follow-ups.
    const nowMs = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    for (const name of ["Maria Lopez", "Dan & Priya Shah"]) {
      const fresh = leads.find((lead) => lead.name === name)!;
      expect(fresh.followUpDate).toBeUndefined();
      expect(nowMs - Date.parse(fresh.createdAt)).toBeLessThan(6 * 3_600_000);
    }
    const tom = leads.find((lead) => lead.name === "Tom Becker")!;
    expect(Math.round((nowMs - Date.parse(tom.createdAt)) / 86_400_000)).toBe(
      3,
    );
    expect(tom.followUpDate! < today).toBe(true);
    expect(
      tom.lastContactAt! > tom.createdAt &&
        tom.lastContactAt! <= new Date().toISOString(),
    ).toBe(true);
    expect(dental.followUpDate! > today).toBe(true);

    await as.mutation(api.leads.create, {
      organizationId,
      data: { name: "Real customer" },
    });
    expect(await as.mutation(api.leads.removeSamples, { organizationId })).toBe(
      8,
    );
    expect(
      (await as.query(api.leads.list, { organizationId })).map(
        (lead) => lead.name,
      ),
    ).toEqual(["Real customer"]);
  });
});

describe("expenses", () => {
  test("track spending per project, with status changes, tenancy and cleanup", async () => {
    const t = setup();
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const project = await alice.as.mutation(api.projects.create, {
      organizationId: alice.organizationId,
      data: { name: "Kitchen", budget: 10000 },
    });

    const lumber = await alice.as.mutation(api.expenses.create, {
      organizationId: alice.organizationId,
      data: {
        projectId: project!._id,
        description: "Lumber",
        amount: 1200.5,
        category: "Materials",
        vendor: "Home Depot",
        date: "2026-10-01",
      },
    });
    expect(lumber).toMatchObject({
      status: "pending",
      category: "Materials",
      vendor: "Home Depot",
    });
    await alice.as.mutation(api.expenses.create, {
      organizationId: alice.organizationId,
      data: {
        projectId: project!._id,
        description: "Dumpster",
        amount: 450,
        date: "2026-10-03",
        status: "paid",
      },
    });
    // An expense without a project belongs to the business only.
    await alice.as.mutation(api.expenses.create, {
      organizationId: alice.organizationId,
      data: { description: "Truck fuel", amount: 80 },
    });

    const forProject = await alice.as.query(api.expenses.list, {
      organizationId: alice.organizationId,
      projectId: project!._id,
    });
    expect(forProject.map((e) => e.description)).toEqual([
      "Dumpster",
      "Lumber",
    ]);
    expect(
      await alice.as.query(api.expenses.list, {
        organizationId: alice.organizationId,
      }),
    ).toHaveLength(3);

    const paid = await alice.as.mutation(api.expenses.update, {
      id: lumber!._id,
      data: { status: "paid", vendor: null },
    });
    expect(paid).toMatchObject({ status: "paid" });
    expect(paid!.vendor).toBeUndefined();

    await expect(
      alice.as.mutation(api.expenses.create, {
        organizationId: alice.organizationId,
        data: { description: " ", amount: 5 },
      }),
    ).rejects.toThrow(/what the expense/);
    await expect(
      alice.as.mutation(api.expenses.create, {
        organizationId: alice.organizationId,
        data: { description: "x", amount: -5 },
      }),
    ).rejects.toThrow(/zero or more/);
    await expect(
      alice.as.mutation(api.expenses.update, {
        id: lumber!._id,
        data: { amount: null },
      }),
    ).rejects.toThrow(/cleared/);

    // Another company can't see, change or attach to it.
    await expect(
      bob.as.query(api.expenses.list, { organizationId: alice.organizationId }),
    ).rejects.toThrow(/access/);
    await expect(
      bob.as.mutation(api.expenses.update, {
        id: lumber!._id,
        data: { amount: 1 },
      }),
    ).rejects.toThrow(/Not found/);
    await expect(
      bob.as.mutation(api.expenses.create, {
        organizationId: bob.organizationId,
        data: { projectId: project!._id, description: "x", amount: 1 },
      }),
    ).rejects.toThrow(/Project not found/);

    // Deleting the project deletes its expenses, not the business ones.
    await alice.as.mutation(api.projects.remove, { id: project!._id });
    const left = await alice.as.query(api.expenses.list, {
      organizationId: alice.organizationId,
    });
    expect(left.map((e) => e.description)).toEqual(["Truck fuel"]);
  });
});

describe("estimate item categories", () => {
  async function priceBookItem() {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", {
        slug: "painting",
        name: "Painting",
        display_order: 1,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    });
    const product = async (code: string, name: string) => {
      const costCode = await as.mutation(api.costCodes.create, {
        data: {
          code,
          name,
          industry_id: "painting",
          organization_id: organizationId,
        },
      });
      const lineItem = await as.mutation(api.lineItems.create, {
        data: {
          name,
          organization_id: organizationId,
          cost_code_id: costCode!._id,
          base_price: 3,
          unit: "sqft",
        },
      });
      return lineItem._id as string;
    };
    return {
      t,
      as,
      organizationId,
      productId: await product("PT100", "Painting Labor"),
      materialsId: await product("PT500", "Painting Materials"),
    };
  }

  test("an item from the price book is categorised by its trade, so labor and materials group together", async () => {
    const { as, organizationId, productId, materialsId } =
      await priceBookItem();
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        items: [
          {
            description: "Paint walls",
            quantity: 100,
            unitPrice: 3,
            productId,
          },
          {
            description: "Paint",
            quantity: 5,
            unitPrice: 40,
            productId: materialsId,
          },
          { description: "Custom work", quantity: 1, unitPrice: 50 },
          {
            description: "Bad link",
            quantity: 1,
            unitPrice: 5,
            productId: "not-an-id",
          },
        ],
      },
    });
    expect(estimate!.items.map((i) => i.category)).toEqual([
      "Painting",
      "Painting",
      undefined,
      undefined,
    ]);
  });

  test("older items get their category when read, and the signed contract keeps it", async () => {
    const { t, as, organizationId, productId } = await priceBookItem();
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        items: [
          { description: "Paint walls", quantity: 1, unitPrice: 3, productId },
        ],
      },
    });
    const id = estimate!._id;
    // As if saved before categories were trades.
    await t.run(async (ctx) => {
      const doc = (await ctx.db.get(id))!;
      await ctx.db.patch(id, {
        items: doc.items.map((item) => ({
          ...item,
          category: "Painting Labor",
        })),
      });
    });
    expect((await as.query(api.estimates.get, { id }))!.items[0].category).toBe(
      "Painting",
    );
    const token = await as.mutation(api.estimates.shareLink, { id });
    expect(
      (await t.query(api.publicEstimates.get, { token }))!.items[0].category,
    ).toBe("Painting");
    await as.mutation(api.estimates.update, {
      id,
      data: { status: "accepted" },
    });
    const accepted = await t.run(async (ctx) => ctx.db.get(id));
    expect(accepted!.contractSnapshot!.items[0].category).toBe("Painting");
  });
});

describe("client link", () => {
  async function sharedEstimate() {
    const t = setup();
    const { as, organizationId } = await signUp(t, "a@example.com");
    const client = await as.mutation(api.clients.create, {
      organizationId,
      data: { name: "Dan Shah" },
    });
    const estimate = await as.mutation(api.estimates.create, {
      organizationId,
      data: {
        clientId: client!._id,
        items: [
          {
            description: "Vanity",
            quantity: 1,
            unitPrice: 900,
            redLinePrice: 600,
            capPrice: 900,
          },
        ],
      },
    });
    const token = await as.mutation(api.estimates.shareLink, {
      id: estimate!._id,
    });
    return { t, as, id: estimate!._id, token };
  }

  test("each estimate gets one secret link, and the token can't be set directly", async () => {
    const { as, id, token } = await sharedEstimate();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await as.mutation(api.estimates.shareLink, { id })).toBe(token);
    const updated = await as.mutation(api.estimates.update, {
      id,
      data: { shareToken: "guess" },
    });
    expect(updated!.shareToken).toBe(token);
  });

  test("anyone with the link sees a client-safe view without logging in", async () => {
    const { t, token } = await sharedEstimate();
    expect(
      await t.query(api.publicEstimates.get, { token: "nope" }),
    ).toBeNull();
    const view = await t.query(api.publicEstimates.get, { token });
    expect(view).toMatchObject({
      totalAmount: 900,
      client: { name: "Dan Shah" },
      business: { name: "a@example.com Co" },
    });
    expect(view!.items).toEqual([
      { description: "Vanity", quantity: 1, unitPrice: 900, totalPrice: 900 },
    ]);
    expect(JSON.stringify(view)).not.toMatch(
      /redLine|capPrice|organizationId|shareToken|contract/,
    );
  });

  test("opening a sent estimate marks it opened, once", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await as.mutation(api.estimates.update, { id, data: { status: "sent" } });
    await t.mutation(api.publicEstimates.markOpened, { token });
    const opened = await as.query(api.estimates.get, { id });
    expect(opened).toMatchObject({ status: "opened" });
    expect(opened!.firstOpenedAt).toEqual(expect.any(String));
  });

  test("the client accepts with a signature, which locks the contract; it can't be answered twice", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await expect(
      t.mutation(api.publicEstimates.accept, { token, signature: " " }),
    ).rejects.toThrow(/sign/);
    await t.mutation(api.publicEstimates.accept, {
      token,
      signature: "data:image/png;base64,abc",
    });
    const accepted = await as.query(api.estimates.get, { id });
    expect(accepted).toMatchObject({
      status: "accepted",
      clientSignature: "data:image/png;base64,abc",
    });
    expect(accepted!.contractSnapshot!.totalAmount).toBe(900);
    await expect(
      t.mutation(api.publicEstimates.decline, { token }),
    ).rejects.toThrow(/no longer/);
    await expect(
      t.mutation(api.publicEstimates.accept, { token, signature: "x" }),
    ).rejects.toThrow(/no longer/);
  });

  test("the client sees the agreement terms they're signing", async () => {
    const { t, as, id, token } = await sharedEstimate();
    let view = await t.query(api.publicEstimates.get, { token });
    expect(view!.agreement).toMatchObject({
      paymentTerms: "50% deposit upon signing, 50% upon completion",
      warrantyPeriod: "1 year",
    });
    await as.mutation(api.estimates.update, {
      id,
      data: {
        contractTerms: {
          startDate: "2026-11-02",
          paymentTerms: "Net 15",
          propertyAddress: "12 Elm St",
        },
      },
    });
    view = await t.query(api.publicEstimates.get, { token });
    expect(view!.agreement).toMatchObject({
      startDate: "2026-11-02",
      paymentTerms: "Net 15",
      propertyAddress: "12 Elm St",
    });
    expect(view!.lockedAt).toBeUndefined();
  });

  test("after signing, the link shows what was signed, not later edits", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await t.mutation(api.publicEstimates.accept, {
      token,
      signature: "data:image/png;base64,abc",
    });
    await as.mutation(api.estimates.update, {
      id,
      data: {
        items: [
          {
            description: "Bigger vanity",
            quantity: 1,
            unitPrice: 1500,
            redLinePrice: 600,
            capPrice: 1500,
          },
        ],
      },
    });
    const view = await t.query(api.publicEstimates.get, { token });
    expect(view!.items).toEqual([
      { description: "Vanity", quantity: 1, unitPrice: 900, totalPrice: 900 },
    ]);
    expect(view!.totalAmount).toBe(900);
    expect(view!.lockedAt).toEqual(expect.any(String));
  });

  test("the client can decline", async () => {
    const { t, as, id, token } = await sharedEstimate();
    await t.mutation(api.publicEstimates.decline, { token });
    expect(await as.query(api.estimates.get, { id })).toMatchObject({
      status: "rejected",
    });
    await expect(
      t.mutation(api.publicEstimates.decline, { token: "nope" }),
    ).rejects.toThrow(/isn't valid/);
  });
});

describe("lead market", () => {
  async function market() {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const roofer = await signUp(t, "roofer@example.com");
    const painter = await signUp(t, "painter@example.com");
    await admin.as.mutation(api.marketplace.setLeadPrice, {
      jobType: "roofing",
      price: 285,
    });
    await admin.as.mutation(api.marketplace.setLeadPrice, {
      jobType: "default",
      price: 240,
    });
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: {
        name: "  Jane Cole ",
        phone: "555-0101",
        jobType: "roofing",
        address: "1 Oak St",
      },
    });
    return { t, admin, roofer, painter, leadId: lead!._id };
  }

  test("only FieldQuote staff run the market, and only the owner touches money", async () => {
    const { roofer, leadId } = await market();
    await expect(
      roofer.as.query(api.marketplace.listInbox, {}),
    ).rejects.toThrow(/staff/);
    await expect(
      roofer.as.mutation(api.marketplace.assign, {
        leadId,
        organizationId: roofer.organizationId,
      }),
    ).rejects.toThrow(/staff/);
    await expect(
      roofer.as.mutation(api.marketplace.recordTopUp, {
        organizationId: roofer.organizationId,
        amount: 1000,
      }),
    ).rejects.toThrow(/admins/);
  });

  test("a top-up and its bonus are recorded, and companies can't set their own balance", async () => {
    const { admin, roofer } = await market();
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: roofer.organizationId,
      amount: 500,
      bonus: 25,
      method: "Zelle",
    });
    await roofer.as.mutation(api.organizations.update, {
      id: roofer.organizationId,
      data: { walletBalanceCents: 999999 },
    });
    const wallet = await roofer.as.query(api.marketplace.wallet, {
      organizationId: roofer.organizationId,
    });
    expect(wallet.balanceCents).toBe(52500);
    expect(
      wallet.transactions.map((t) => [
        t.type,
        t.amountCents,
        t.balanceAfterCents,
      ]),
    ).toEqual([
      ["bonus", 2500, 52500],
      ["top_up", 50000, 50000],
    ]);
  });

  test("selling a lead charges its trade price once, and it goes to one company only", async () => {
    const { admin, roofer, painter, leadId } = await market();
    await expect(
      admin.as.mutation(api.marketplace.assign, {
        leadId,
        organizationId: roofer.organizationId,
      }),
    ).rejects.toThrow(/Balance too low/);
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: roofer.organizationId,
      amount: 300,
    });
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: painter.organizationId,
      amount: 300,
    });
    await admin.as.mutation(api.marketplace.assign, {
      leadId,
      organizationId: roofer.organizationId,
    });
    await expect(
      admin.as.mutation(api.marketplace.assign, {
        leadId,
        organizationId: painter.organizationId,
      }),
    ).rejects.toThrow(/already sent/);

    const leads = await roofer.as.query(api.leads.list, {
      organizationId: roofer.organizationId,
    });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      name: "Jane Cole",
      source: "FieldQuote Lead",
      status: "new",
      pricePaidCents: 28500,
      wonVia: "sent",
    });
    expect(
      (
        await roofer.as.query(api.marketplace.wallet, {
          organizationId: roofer.organizationId,
        })
      ).balanceCents,
    ).toBe(1500);
    expect(
      await painter.as.query(api.leads.list, {
        organizationId: painter.organizationId,
      }),
    ).toHaveLength(0);
    // The other company can't see the buyer's wallet.
    await expect(
      painter.as.query(api.marketplace.wallet, {
        organizationId: roofer.organizationId,
      }),
    ).rejects.toThrow(/access/);

    const overview = await admin.as.query(
      api.marketplace.companiesOverview,
      {},
    );
    expect(overview.find((c) => c.id === roofer.organizationId)).toMatchObject({
      balanceCents: 1500,
      leads30d: 1,
      spent30dCents: 28500,
    });
  });

  test("a bad lead can be credited back once, within three days", async () => {
    const { t, admin, roofer, leadId } = await market();
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: roofer.organizationId,
      amount: 300,
    });
    const { orgLeadId } = await admin.as.mutation(api.marketplace.assign, {
      leadId,
      organizationId: roofer.organizationId,
    });
    await expect(
      roofer.as.mutation(api.marketplace.requestCredit, {
        leadId: orgLeadId,
        reason: "made_up",
      }),
    ).rejects.toThrow(/reason/);
    await roofer.as.mutation(api.marketplace.requestCredit, {
      leadId: orgLeadId,
      reason: "wrong_number",
    });
    await expect(
      roofer.as.mutation(api.marketplace.requestCredit, {
        leadId: orgLeadId,
        reason: "duplicate",
      }),
    ).rejects.toThrow(/already/);
    // Companies can't approve their own credits or edit what they paid.
    await expect(
      roofer.as.mutation(api.marketplace.reviewCredit, {
        orgLeadId,
        approve: true,
      }),
    ).rejects.toThrow(/admins/);
    await roofer.as.mutation(api.leads.update, {
      id: orgLeadId,
      data: { pricePaidCents: 1 },
    });

    expect(
      await admin.as.query(api.marketplace.pendingCredits, {}),
    ).toHaveLength(1);
    await admin.as.mutation(api.marketplace.reviewCredit, {
      orgLeadId,
      approve: true,
    });
    await expect(
      admin.as.mutation(api.marketplace.reviewCredit, {
        orgLeadId,
        approve: true,
      }),
    ).rejects.toThrow(/no open credit/);
    const wallet = await roofer.as.query(api.marketplace.wallet, {
      organizationId: roofer.organizationId,
    });
    expect(wallet.balanceCents).toBe(30000);
    expect(wallet.transactions[0]).toMatchObject({
      type: "credit",
      amountCents: 28500,
    });

    // A lead older than three days can't be credited.
    const old = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Old lead" },
    });
    const { orgLeadId: oldLead } = await admin.as.mutation(
      api.marketplace.assign,
      { leadId: old!._id, organizationId: roofer.organizationId },
    );
    await t.run(async (ctx) =>
      ctx.db.patch(oldLead, {
        assignedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
      }),
    );
    await expect(
      roofer.as.mutation(api.marketplace.requestCredit, {
        leadId: oldLead,
        reason: "duplicate",
      }),
    ).rejects.toThrow(/3 days/);

    // The owner can credit it anyway: the company told FieldQuote by phone. Once.
    await expect(roofer.as.mutation(api.marketplace.creditLead, { orgLeadId: oldLead, reason: "duplicate" })).rejects.toThrow(/admins/);
    const before = (await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId })).balanceCents;
    // "Old lead" has no trade, so it sold at the default $240: that is what comes back.
    expect(await admin.as.mutation(api.marketplace.creditLead, { orgLeadId: oldLead, reason: "wrong_number", note: "Called, number dead" })).toEqual({ amountCents: 24000 });
    const after = await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId });
    expect(after.balanceCents).toBe(before + 24000);
    expect(after.transactions[0]).toMatchObject({ type: "credit", amountCents: 24000 });
    const creditedLead = (await t.run((ctx) => ctx.db.get(oldLead)))!;
    expect(creditedLead.creditRequest).toMatchObject({ reason: "wrong_number", note: "Called, number dead", status: "approved" });
    expect((await t.run((ctx) => ctx.db.get(old!._id)))?.status).toBe("credited");
    await expect(admin.as.mutation(api.marketplace.creditLead, { orgLeadId: oldLead, reason: "duplicate" })).rejects.toThrow(/already credited/);
  });

  test("a company set up for a new contractor becomes theirs when they sign up", async () => {
    const { t, admin } = await market();
    const company = await admin.as.mutation(api.marketplace.createCompany, {
      data: {
        name: "Peak Roofing",
        ownerEmail: "Owner@Peak.example",
        leadTrades: ["roofing"],
      },
    });
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "owner@peak.example" });
      const { acceptInvites } = await import("./lib/organizations");
      await acceptInvites(ctx, id, "owner@peak.example");
      return id;
    });
    const owner = t.withIdentity({ subject: `${userId}|session-x` });
    const orgs = await owner.query(api.organizations.list, {});
    expect(orgs.map((o) => o._id)).toEqual([company!._id]);
    expect(
      await owner.query(api.organizations.myRole, { id: company!._id }),
    ).toBe("owner");
  });

  test("a company name can't be used twice, and only empty companies can be removed", async () => {
    const { t, admin, roofer } = await market();
    const first = await admin.as.mutation(api.marketplace.createCompany, {
      data: { name: "Picante Painting" },
    });
    await expect(
      admin.as.mutation(api.marketplace.createCompany, {
        data: { name: "  picante   PAINTING " },
      }),
    ).rejects.toThrow(/already exists/);

    // A company with leads or money stays.
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: roofer.organizationId,
      amount: 1000,
    });
    await expect(
      admin.as.mutation(api.marketplace.removeCompany, {
        organizationId: roofer.organizationId,
      }),
    ).rejects.toThrow(/Only empty companies/);
    await expect(
      roofer.as.mutation(api.marketplace.removeCompany, {
        organizationId: first!._id,
      }),
    ).rejects.toThrow(/admins/);

    const overview = await admin.as.query(
      api.marketplace.companiesOverview,
      {},
    );
    expect(overview.find((c) => c.id === first!._id)?.isEmpty).toBe(true);
    expect(overview.find((c) => c.id === roofer.organizationId)?.isEmpty).toBe(
      false,
    );

    await admin.as.mutation(api.marketplace.removeCompany, {
      organizationId: first!._id,
    });
    const ids = (await admin.as.query(api.organizations.list, {})).map(
      (o) => o._id,
    );
    expect(ids).not.toContain(first!._id);
    expect(ids).toContain(roofer.organizationId);
    // The name is free again once the empty copy is gone.
    await admin.as.mutation(api.marketplace.createCompany, {
      data: { name: "Picante Painting" },
    });
    expect(
      await t.run(async (ctx) => (await ctx.db.get(first!._id))?.isActive),
    ).toBe(false);
  });
});

describe("smoke tests and demo data", () => {
  test("super admins don't see deactivated companies", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const gone = await signUp(t, "gone@example.com");
    await gone.as.mutation(api.organizations.remove, {
      id: gone.organizationId,
    });
    const ids = (await admin.as.query(api.organizations.list, {})).map(
      (o) => o._id,
    );
    expect(ids).toContain(admin.organizationId);
    expect(ids).not.toContain(gone.organizationId);
  });

  test("smoke-test accounts and their companies are removed; real ones are kept", async () => {
    const t = setup();
    const real = await signUp(t, "real@example.com");
    const smoke = await signUp(t, "smoke-test+1@fieldquote.test");
    const shared = await signUp(t, "smoke-test+2@fieldquote.test");
    await smoke.as.mutation(api.clients.create, {
      organizationId: smoke.organizationId,
      data: { name: "Smoke Test Customer" },
    });
    // A real person joined the second smoke company, so it stays.
    await t.run(async (ctx) =>
      ctx.db.insert("memberships", {
        organizationId: shared.organizationId,
        userId: real.userId,
        role: "member",
        createdAt: "x",
      }),
    );
    const result = await t.mutation(internal.seed.removeSmokeTests, {});
    expect(result).toMatchObject({ users: 2, companies: 1 });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(smoke.organizationId)).toBeNull();
      expect(await ctx.db.get(smoke.userId)).toBeNull();
      expect(await ctx.db.get(shared.organizationId)).not.toBeNull();
      expect(await ctx.db.get(real.userId)).not.toBeNull();
      expect(await ctx.db.query("clients").collect()).toHaveLength(0);
    });
  });

  test("demo companies and leads can be added once and removed in one go", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const contractor = await signUp(t, "roofer@example.com");
    await expect(
      contractor.as.mutation(api.marketplace.addDemoData, {}),
    ).rejects.toThrow(/admins/);
    expect(await admin.as.mutation(api.marketplace.addDemoData, {})).toEqual({
      companies: 6,
      leads: 10,
    });
    // Half the demo companies are on the plan, half let it lapse, so both looks show.
    const planStatuses = (
      await admin.as.query(api.marketplace.companiesOverview, {})
    )
      .filter((c) => c.isSample)
      .map((c) => `${c.plan?.status}:${c.plan?.active}`)
      .sort();
    expect(planStatuses).toEqual([
      "active:true",
      "active:true",
      "active:true",
      "cancelled:false",
      "cancelled:false",
      "cancelled:false",
    ]);
    await expect(
      admin.as.mutation(api.marketplace.addDemoData, {}),
    ).rejects.toThrow(/already/);

    const companies = await admin.as.query(
      api.marketplace.companiesOverview,
      {},
    );
    const roofing = companies.find(
      (c) => c.name === "Permian Roofing & Exteriors",
    )!;
    expect(roofing).toMatchObject({
      isSample: true,
      balanceCents: 110000 - 28500,
      leadsTotal: 1,
      wonCents: 1850000,
    });
    const inbox = await admin.as.query(api.marketplace.listInbox, {});
    expect(inbox.available).toHaveLength(6);
    expect(inbox.sold).toHaveLength(4);

    expect(await admin.as.mutation(api.marketplace.removeDemoData, {})).toEqual(
      { companies: 6, leads: 10, standingBids: 0 },
    );
    const left = await admin.as.query(api.marketplace.companiesOverview, {});
    expect(left.map((c) => c.name).sort()).toEqual([
      `admin@fieldquote.example Co`,
      `roofer@example.com Co`,
    ]);
    expect(
      (await admin.as.query(api.marketplace.listInbox, {})).available,
    ).toHaveLength(0);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("walletTransactions").collect()).toHaveLength(
        0,
      );
    });
  });

  test("sample leads fill the market at different points on their schedules", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const company = await signUp(t, "mio@example.com");
    await admin.as.mutation(api.marketplace.setCompanyTrades, {
      organizationId: company.organizationId,
      leadTrades: ["landscaping"],
    });
    await expect(
      company.as.mutation(api.marketplace.addSampleLeads, {}),
    ).rejects.toThrow(/admins/);
    expect(await admin.as.mutation(api.marketplace.addSampleLeads, {})).toEqual(
      { added: 20 },
    );
    const feed = await company.as.query(api.marketplace.feed, {
      organizationId: company.organizationId,
    });
    expect(feed).toHaveLength(20);
    // Confirmed on arrival, like a lead that came through Intake.
    expect(feed.every((l) => l.verified?.at && l.verified.note)).toBe(true);
    expect(feed.filter((l) => l.matchesTrades)).toHaveLength(12);
    const prices = new Set(
      feed.map((l) => priceAt(l.auction, Date.now()).priceCents),
    );
    expect(prices.size).toBeGreaterThan(1);
    expect(JSON.stringify(feed)).not.toMatch(/555-03|Humble Ave/);
    expect(await admin.as.mutation(api.marketplace.removeDemoData, {})).toEqual(
      { companies: 0, leads: 20, standingBids: 0 },
    );
  });

  test("seed:demo fills the market from the command line, as the owner, and seed:resetDemo takes it back", async () => {
    const t = setup();
    await expect(t.mutation(internal.seed.demo, {})).rejects.toThrow(/No platform owner/);
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const first = await t.mutation(internal.seed.demo, {});
    expect(first.companies).not.toBe("already here");
    expect(first.bids).not.toBe("already here");
    expect(first.money).toMatchObject({ amountCents: 500000 });
    const companies = await admin.as.query(api.marketplace.companiesOverview, {});
    expect(companies.filter((c) => c.isSample).length).toBeGreaterThan(0);
    expect(companies.every((c) => c.balanceCents >= 500000)).toBe(true);
    expect((await admin.as.query(api.intake.queue, { status: "open" })).length).toBeGreaterThan(0);
    // Running it again adds no second set of companies or bids.
    const again = await t.mutation(internal.seed.demo, {});
    expect(again).toMatchObject({ companies: "already here", bids: "already here", intake: { added: 0 } });
    expect((await admin.as.query(api.marketplace.companiesOverview, {})).length).toBe(companies.length);
    await t.mutation(internal.seed.resetDemo, {});
    expect((await admin.as.query(api.marketplace.companiesOverview, {})).filter((c) => c.isSample)).toEqual([]);
  });

  test("play money lands on every active company as a top-up, and only the owner can hand it out", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", { role: "super_admin" });
    const mio = await signUp(t, "mio@example.com");
    const soco = await signUp(t, "soco@example.com");
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: mio.organizationId, amount: 300 });
    await t.run(async (ctx) => { await ctx.db.patch(soco.organizationId, { isActive: false }); });
    await expect(mio.as.mutation(api.marketplace.fundEveryCompany, {})).rejects.toThrow(/admins/);
    // Admin's own company and Mio are active; Soco is not.
    expect(await admin.as.mutation(api.marketplace.fundEveryCompany, {})).toEqual({ companies: 2, amountCents: 500000 });
    const wallet = await mio.as.query(api.marketplace.wallet, { organizationId: mio.organizationId });
    expect(wallet.balanceCents).toBe(30000 + 500000);
    expect(wallet.transactions[0]).toMatchObject({ type: "top_up", amountCents: 500000, note: "Play money", method: "Demo" });
    expect((await t.run(async (ctx) => ctx.db.get(soco.organizationId)))?.walletBalanceCents ?? 0).toBe(0);
  });

  test("demo bids give every company funds, standing bids and awarded leads, and come back out cleanly", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const mio = await signUp(t, "mio@example.com");
    const soco = await signUp(t, "soco@example.com");
    const picante = await signUp(t, "picante@example.com");
    for (const [who, trades] of [
      [mio, ["landscaping"]],
      [soco, ["landscaping"]],
      [picante, ["painting"]],
    ] as const)
      await admin.as.mutation(api.marketplace.setCompanyTrades, {
        organizationId: who.organizationId,
        leadTrades: [...trades],
      });
    // Mio already has real money and a real lead, which must survive.
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: mio.organizationId,
      amount: 300,
    });
    await mio.as.mutation(api.leads.create, {
      organizationId: mio.organizationId,
      data: { name: "Real Customer", jobType: "landscaping" },
    });
    const balanceOf = async (who: { as: any; organizationId: any }) =>
      (
        await who.as.query(api.marketplace.wallet, {
          organizationId: who.organizationId,
        })
      ).balanceCents;

    await expect(
      mio.as.mutation(api.marketplace.addDemoBids, {}),
    ).rejects.toThrow(/admins/);
    const added = await admin.as.mutation(api.marketplace.addDemoBids, {});
    // Four companies (the admin's own has no trades, so general construction), 14 leads; the Stanton one has
    // no bidder here (that pattern belongs to a third landscaper), so 10 are awarded.
    expect(added).toEqual({
      companies: 4,
      standingBids: 4 + 3 + 3 + 2,
      leads: 14,
      sold: 10,
    });
    // The admin's company had no trades: it now lists the one its demo bids are in.
    expect(
      (await admin.as.query(api.marketplace.wallet, { organizationId: admin.organizationId })).leadTrades,
    ).toEqual(["general-construction"]);
    await expect(
      admin.as.mutation(api.marketplace.addDemoBids, {}),
    ).rejects.toThrow(/already/);

    // Mio (first landscaper by name) leads Midland at $275 against Soco's $250; Soco leads Ector at $260.
    const mioBids = await mio.as.query(api.bids.listStanding, {
      organizationId: mio.organizationId,
    });
    expect(
      mioBids.map((b) => [b.county, b.amountCents, b.funded, b.leading]),
    ).toEqual([
      ["Andrews", 21500, true, true],
      ["Ector", 22500, true, false],
      ["Howard", 21000, true, true],
      ["Midland", 27500, true, true],
    ]);
    const socoBids = await soco.as.query(api.bids.listStanding, {
      organizationId: soco.organizationId,
    });
    expect(socoBids.find((b) => b.county === "Andrews")).toMatchObject({
      amountCents: 90000,
      funded: false,
      leading: false,
    });
    expect(socoBids.find((b) => b.county === "Ector")).toMatchObject({
      leading: true,
    });

    // Results: Mio won Midland leads and lost Ector ones; Soco's Andrews bid was too much for its funds.
    const mioResults = await mio.as.query(api.bids.results, {
      organizationId: mio.organizationId,
    });
    expect(mioResults.some((r) => r.won && r.county === "Midland")).toBe(true);
    expect(
      mioResults.some(
        (r) =>
          !r.won &&
          r.county === "Ector" &&
          r.outcome === "Outbid: a higher bid won it",
      ),
    ).toBe(true);
    const socoResults = await soco.as.query(api.bids.results, {
      organizationId: soco.organizationId,
    });
    expect(socoResults.find((r) => r.county === "Andrews")?.outcome).toMatch(
      /Balance too low/,
    );
    expect(
      (
        await picante.as.query(api.bids.results, {
          organizationId: picante.organizationId,
        })
      ).filter((r) => r.won),
    ).toHaveLength(3);
    // Money moved: demo funds in, won leads out.
    expect(await balanceOf(picante)).toBe(150000 - 22000 - 24000 - 22000); // Odessa, Midland, Odessa
    expect(await balanceOf(soco)).toBeLessThan(60000);
    const inbox = await admin.as.query(api.marketplace.listInbox, {});
    expect(inbox.available.map((l) => l.jobType).sort()).toEqual([
      "hvac",
      "landscaping",
      "landscaping",
      "roofing",
    ]);
    expect(inbox.sold.every((l) => l.wonBy === "bid")).toBe(true);
    expect(
      (await admin.as.query(api.marketplace.companiesOverview, {})).find(
        (c) => c.id === mio.organizationId,
      ),
    ).toMatchObject({ sampleBids: 4 });
    expect(
      await mio.as.query(api.leads.list, {
        organizationId: mio.organizationId,
      }),
    ).toHaveLength(1 + mioResults.filter((r) => r.won).length);

    // Everything comes back out, and balances are what they were.
    expect(await admin.as.mutation(api.marketplace.removeDemoData, {})).toEqual(
      { companies: 0, leads: 16, standingBids: 12 },
    );
    expect(
      await mio.as.query(api.bids.listStanding, {
        organizationId: mio.organizationId,
      }),
    ).toHaveLength(0);
    expect(
      await mio.as.query(api.bids.results, {
        organizationId: mio.organizationId,
      }),
    ).toHaveLength(0);
    expect(await balanceOf(mio)).toBe(30000);
    expect(await balanceOf(soco)).toBe(0);
    expect(await balanceOf(picante)).toBe(0);
    expect(
      (
        await mio.as.query(api.leads.list, {
          organizationId: mio.organizationId,
        })
      ).map((l) => l.name),
    ).toEqual(["Real Customer"]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("marketplaceLeads").collect()).toHaveLength(0);
      expect(await ctx.db.query("leadBids").collect()).toHaveLength(0);
      expect(
        (await ctx.db.query("walletTransactions").collect()).map(
          (t) => t.amountCents,
        ),
      ).toEqual([30000]);
    });
  });

  test("the real companies replace the demo data, without duplicating ones that exist", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    await admin.as.mutation(api.marketplace.addDemoData, {});
    // Picante Painting is already here, with its own leads and no trades yet.
    const picante = await signUp(t, "owner@picante.example");
    await picante.as.mutation(api.organizations.update, {
      id: picante.organizationId,
      data: { name: "Picante Painting" },
    });
    await picante.as.mutation(api.leads.create, {
      organizationId: picante.organizationId,
      data: { name: "Their lead" },
    });

    const first = await t.mutation(internal.seed.realCompanies, {});
    expect(first).toMatchObject({
      demoRemoved: { companies: 6, leads: 10 },
      created: ["Mio Homes", "Soco Outdoor", "Buried Stone", "A&E Landscaping"],
      updated: ["Picante Painting"],
    });
    expect(await t.mutation(internal.seed.realCompanies, {})).toMatchObject({
      created: [],
      updated: [],
    });

    const companies = await admin.as.query(
      api.marketplace.companiesOverview,
      {},
    );
    const names = companies.map((c) => c.name);
    expect(names.filter((n) => n === "Picante Painting")).toHaveLength(1);
    expect(names.some((n) => n.includes("Permian"))).toBe(false);
    expect(companies.find((c) => c.name === "Picante Painting")).toMatchObject({
      id: picante.organizationId,
      leadTrades: ["painting"],
      owners: ["owner@picante.example"],
    });
    expect(companies.find((c) => c.name === "Mio Homes")?.leadTrades).toEqual([
      "landscaping",
    ]);

    // A removed company isn't brought back.
    const mio = companies.find((c) => c.name === "Mio Homes")!;
    await admin.as.mutation(api.marketplace.removeCompany, {
      organizationId: mio.id,
    });
    expect((await t.mutation(internal.seed.realCompanies, {})).created).toEqual(
      [],
    );
  });

  test("empty duplicate companies are switched off, keeping the one with data", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const real = await signUp(t, "owner@picante.example");
    await real.as.mutation(api.organizations.update, {
      id: real.organizationId,
      data: { name: "Picante Painting" },
    });
    await real.as.mutation(api.leads.create, {
      organizationId: real.organizationId,
      data: { name: "Their lead" },
    });
    // The empty copy, made later from the Lead Market, has the trades.
    const copy = await t.run(async (ctx) => {
      const { createOrganization } = await import("./lib/organizations");
      return await createOrganization(ctx, {
        name: "picante painting",
        leadTrades: ["painting"],
      });
    });
    const solo = await admin.as.mutation(api.marketplace.createCompany, {
      data: { name: "Mio Homes" },
    });

    expect(await t.mutation(internal.seed.removeEmptyDuplicates, {})).toEqual({
      removed: ["picante painting"],
    });
    expect(await t.mutation(internal.seed.removeEmptyDuplicates, {})).toEqual({
      removed: [],
    });
    const ids = (await admin.as.query(api.organizations.list, {})).map(
      (o) => o._id,
    );
    expect(ids).toContain(real.organizationId);
    expect(ids).toContain(solo!._id);
    expect(ids).not.toContain(copy);
    const kept = await t.run(async (ctx) => ctx.db.get(real.organizationId));
    expect(kept?.leadTrades).toEqual(["painting"]);
  });

  test("the real leads move from Picante Painting to Mio Homes", async () => {
    const t = setup();
    const picante = await signUp(t, "owner@picante.example");
    await picante.as.mutation(api.organizations.update, {
      id: picante.organizationId,
      data: { name: "Picante Painting" },
    });
    const client = await picante.as.mutation(api.clients.create, {
      organizationId: picante.organizationId,
      data: { name: "Ann" },
    });
    const lead = await picante.as.mutation(api.leads.create, {
      organizationId: picante.organizationId,
      data: { name: "Backyard redo", clientId: client!._id },
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(lead!._id, { clientId: client!._id });
    });
    const sample = await t.run(async (ctx) =>
      ctx.db.insert("leads", {
        name: "Example",
        status: "new",
        isSample: true,
        organizationId: picante.organizationId,
        userId: picante.userId,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      } as any),
    );
    await t.mutation(internal.seed.realCompanies, {});

    const result = await t.mutation(internal.seed.moveLeadsToMioHomes, {});
    expect(result).toMatchObject({ moved: 1 });
    const mio = await t.run(async (ctx) =>
      (await ctx.db.query("organizations").collect()).find(
        (o) => o.name === "Mio Homes",
      )!,
    );
    expect(mio.leadTrades).toEqual(["landscaping"]);
    const moved = await t.run(async (ctx) => ctx.db.get(lead!._id));
    expect(moved).toMatchObject({
      organizationId: mio._id,
      name: "Backyard redo",
    });
    expect(moved?.clientId).toBeUndefined();
    expect(
      (await t.run(async (ctx) => ctx.db.get(sample)))?.organizationId,
    ).toBe(picante.organizationId);
    // Picante keeps its client and company.
    expect(result.picante).toEqual([
      {
        active: true,
        clients: 1,
        estimates: 0,
        fundingLinks: 0,
        walletEntries: 0,
      },
    ]);
  });

  test("the small test Picante Painting becomes the Myles Webb workspace", async () => {
    const t = setup();
    const real = await signUp(t, "owner@picante.example");
    const test = await signUp(t, "test@picante.example");
    for (const c of [real, test])
      await c.as.mutation(api.organizations.update, {
        id: c.organizationId,
        data: { name: "Picante Painting" },
      });
    const client = await real.as.mutation(api.clients.create, {
      organizationId: real.organizationId,
      data: { name: "Ann" },
    });
    await real.as.mutation(api.estimates.create, {
      organizationId: real.organizationId,
      data: { clientId: client!._id, items: [] },
    });

    expect(await t.mutation(internal.seed.renameTestPicante, {})).toMatchObject(
      { renamed: true },
    );
    const [kept, renamed] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get(real.organizationId),
        ctx.db.get(test.organizationId),
      ]),
    );
    expect(kept?.name).toBe("Picante Painting");
    expect(renamed).toMatchObject({
      name: "Myles Webb",
      industryId: "general-construction",
      isActive: true,
    });
    // Only one Picante left, so running it again does nothing.
    expect(await t.mutation(internal.seed.renameTestPicante, {})).toEqual({
      renamed: false,
      picantes: 1,
    });
  });

  test("an owner can be set on a company: invited, or added if they have an account", async () => {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const company = await admin.as.mutation(api.marketplace.createCompany, {
      data: { name: "Soco Outdoor" },
    });
    await expect(
      admin.as.mutation(api.marketplace.setCompanyOwner, {
        organizationId: company!._id,
        email: "nope",
      }),
    ).rejects.toThrow(/valid owner email/);
    expect(
      await admin.as.mutation(api.marketplace.setCompanyOwner, {
        organizationId: company!._id,
        email: "Old@Soco.example",
      }),
    ).toBe("invited");
    expect(
      await admin.as.mutation(api.marketplace.setCompanyOwner, {
        organizationId: company!._id,
        email: "owner@soco.example",
      }),
    ).toBe("invited");
    let row = (
      await admin.as.query(api.marketplace.companiesOverview, {})
    ).find((c) => c.id === company!._id)!;
    expect(row.invitePending).toBe("owner@soco.example");

    const existing = await signUp(t, "boss@soco.example");
    await expect(
      existing.as.mutation(api.marketplace.setCompanyOwner, {
        organizationId: company!._id,
        email: "boss@soco.example",
      }),
    ).rejects.toThrow(/admins/);
    expect(
      await admin.as.mutation(api.marketplace.setCompanyOwner, {
        organizationId: company!._id,
        email: "boss@soco.example",
      }),
    ).toBe("added");
    row = (await admin.as.query(api.marketplace.companiesOverview, {})).find(
      (c) => c.id === company!._id,
    )!;
    expect(row.owners).toEqual(["boss@soco.example"]);
    expect(row.invitePending).toBeUndefined();
    expect(
      await existing.as.query(api.organizations.myRole, { id: company!._id }),
    ).toBe("owner");
  });
});

describe("funding links and the lead feed", () => {
  async function company() {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const roofer = await signUp(t, "roofer@example.com");
    const rival = await signUp(t, "rival@example.com");
    const token = await roofer.as.mutation(api.funding.createLink, {
      organizationId: roofer.organizationId,
    });
    return { t, admin, roofer, rival, token };
  }
  const balance = async (who: { as: any; organizationId: any }) =>
    (
      await who.as.query(api.marketplace.wallet, {
        organizationId: who.organizationId,
      })
    ).balanceCents;

  test("Add funds goes to Stripe Checkout; Stripe's webhook loads the balance, once; a dropped session reopens the link", async () => {
    const { t, admin, roofer, rival, token } = await company();
    expect(
      await roofer.as.mutation(api.funding.createLink, {
        organizationId: roofer.organizationId,
      }),
    ).toBe(token);
    await expect(
      rival.as.mutation(api.funding.createLink, {
        organizationId: roofer.organizationId,
      }),
    ).rejects.toThrow(/access/);

    const page = await t.query(api.funding.get, { token });
    expect(page).toMatchObject({ companyName: "roofer@example.com Co", status: "open", minimumCents: 500000, paid: false });
    expect(page!.tiers.map((tier) => tier.bonusCents)).toEqual([0, 37500, 100000]);

    // No Stripe key on the deployment: Pay loads play money on the spot, labelled as such.
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(page!.playMoney).toBe(true);
    const rivalToken = await rival.as.mutation(api.funding.createLink, { organizationId: rival.organizationId });
    const rivalBefore = await balance(rival);
    expect(await t.action(api.funding.checkout, { token: rivalToken, amountCents: 1_000_000 })).toEqual({ url: `/fund/${rivalToken}?paid=1` });
    expect(await balance(rival)).toBe(rivalBefore + 1_100_000);
    expect(await t.query(api.funding.get, { token: rivalToken })).toMatchObject({ status: "confirmed", paid: true, amountCents: 1_000_000, bonusCents: 100_000 });
    const rivalWallet = await rival.as.query(api.marketplace.wallet, { organizationId: rival.organizationId });
    expect(rivalWallet.transactions.find((tx: { type: string }) => tx.type === "top_up")).toMatchObject({ method: "Play money", amountCents: 1_000_000 });
    // A used link can't pay twice.
    await expect(t.action(api.funding.checkout, { token: rivalToken, amountCents: 1_000_000 })).rejects.toThrow(/already been used/);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect((await t.query(api.funding.get, { token }))!.playMoney).toBe(false);
    // Ops reads the same switch (staff only), and the company's wallet carries it so Add funds can say "play money".
    expect(await admin.as.query(api.funding.mode, {})).toEqual({ playMoney: false });
    await expect(rival.as.query(api.funding.mode, {})).rejects.toThrow(/staff/);
    expect((await rival.as.query(api.marketplace.wallet, { organizationId: rival.organizationId })).playMoney).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await admin.as.query(api.funding.mode, {})).toEqual({ playMoney: true });
    expect((await rival.as.query(api.marketplace.wallet, { organizationId: rival.organizationId })).playMoney).toBe(true);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("SITE_URL", "https://app.example/");
    await expect(t.action(api.funding.checkout, { token, amountCents: 499999 })).rejects.toThrow(/minimum/);
    const calls: Array<{ url: string; body: string; auth: string | undefined }> = [];
    let sessions = 1;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
        calls.push({ url, body: init.body, auth: init.headers.authorization });
        const id = `cs_test_${sessions++}`;
        return { ok: true, status: 200, json: async () => ({ id, url: `https://checkout.stripe.com/c/${id}` }) };
      }),
    );
    expect(await t.action(api.funding.checkout, { token, amountCents: 1_000_000 })).toEqual({ url: "https://checkout.stripe.com/c/cs_test_1" });
    expect(calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0].auth).toBe("Bearer sk_test_x");
    const form = new URLSearchParams(calls[0].body);
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("1000000");
    expect(form.get("success_url")).toBe(`https://app.example/fund/${token}?paid=1`);
    expect(form.get("cancel_url")).toBe(`https://app.example/fund/${token}?cancelled=1`);
    expect(form.get("client_reference_id")).toBe(token);
    expect(form.get("metadata[bonusCents]")).toBe("100000");
    expect((await t.query(api.funding.get, { token }))!.status).toBe("submitted");
    expect(await balance(roofer)).toBe(0);

    // Stripe calls back. A bad signature is refused; a good one credits the amount and bonus, once.
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const { signStripePayload, verifyStripeSignature } = await import("./lib/stripe");
    const event = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 1_000_000, payment_intent: "pi_1", customer_details: { name: "Pat Roofer", email: "pat@peak.example" } } },
    });
    const nowSec = Math.floor(Date.now() / 1000);
    const post = async (body: string, signature: string) =>
      t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body });
    expect((await post(event, `t=${nowSec},v1=deadbeef`)).status).toBe(400);
    expect((await post(event, await signStripePayload("whsec_other", nowSec, event))).status).toBe(400);
    expect(await verifyStripeSignature("whsec_test", await signStripePayload("whsec_test", nowSec - 600, event), event)).toBe(false);
    const good = await signStripePayload("whsec_test", nowSec, event);
    const first = await post(event, good);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ credited: true, amountCents: 1_000_000, bonusCents: 100000 });
    expect(await balance(roofer)).toBe(1_100_000);
    expect(await (await post(event, good)).json()).toMatchObject({ credited: false });
    expect(await balance(roofer)).toBe(1_100_000);
    expect(await t.query(api.funding.get, { token })).toMatchObject({ status: "confirmed", paid: true });
    const wallet = await roofer.as.query(api.marketplace.wallet, { organizationId: roofer.organizationId });
    expect(wallet.transactions.map((x) => [x.type, x.amountCents, x.method])).toEqual(
      expect.arrayContaining([["top_up", 1_000_000, "Stripe"], ["bonus", 100000, undefined]]),
    );
    expect(wallet).not.toHaveProperty("pendingFunding");

    // A payer who closes Stripe's page: the session expires and the link opens again for another try.
    const second = await rival.as.mutation(api.funding.createLink, { organizationId: rival.organizationId });
    calls.length = 0;
    await t.action(api.funding.checkout, { token: second, amountCents: 500_000 });
    const expired = JSON.stringify({ type: "checkout.session.expired", data: { object: { id: "cs_test_2" } } });
    expect(await (await post(expired, await signStripePayload("whsec_test", nowSec, expired))).json()).toMatchObject({ reopened: true });
    expect((await t.query(api.funding.get, { token: second }))!.status).toBe("open");
    // The roofer's Stripe payments never touched the rival, who only has the play money from above.
    expect(await balance(rival)).toBe(rivalBefore + 1_100_000);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("the balance gets what Stripe charged, once per session, and a payment with no link reaches staff", async () => {
    const { t, rival } = await company();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("SITE_URL", "https://app.example");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const emails: Array<{ to: string[]; subject: string; text: string }> = [];
    let sessions = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        if (url.includes("resend")) {
          emails.push(JSON.parse(init.body));
          return { ok: true, status: 200, json: async () => ({ id: "em_1" }) };
        }
        const id = `cs_two_${++sessions}`;
        return { ok: true, status: 200, json: async () => ({ id, url: `https://checkout.stripe.com/c/${id}` }) };
      }),
    );
    const { signStripePayload } = await import("./lib/stripe");
    const nowSec = Math.floor(Date.now() / 1000);
    const paid = async (object: Record<string, unknown>) => {
      const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { payment_status: "paid", ...object } } });
      const res = await t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": await signStripePayload("whsec_test", nowSec, body) }, body });
      return await res.json();
    };
    try {
      const token = await rival.as.mutation(api.funding.createLink, { organizationId: rival.organizationId });
      const requestId = (await t.run(async (ctx) => (await ctx.db.query("fundingRequests").collect()).find((r) => r.token === token)!))._id;
      const before = await balance(rival);
      // The payer opens checkout at $5,000, then again at $10,000, so the link now shows $10,000.
      await t.action(api.funding.checkout, { token, amountCents: 500_000 });
      await t.action(api.funding.checkout, { token, amountCents: 1_000_000 });
      expect(await t.query(api.funding.get, { token })).toMatchObject({ status: "submitted", amountCents: 1_000_000 });
      // They pay the first session. The balance gets the $5,000 Stripe charged, not the $10,000 the page shows, and no bonus.
      expect(await paid({ id: "cs_two_1", amount_total: 500_000, metadata: { fundingRequestId: requestId } })).toMatchObject({ credited: true, amountCents: 500_000, bonusCents: 0 });
      expect(await balance(rival)).toBe(before + 500_000);
      // Stripe retries: nothing more.
      expect(await paid({ id: "cs_two_1", amount_total: 500_000, metadata: { fundingRequestId: requestId } })).toMatchObject({ credited: false, reason: "already credited" });
      expect(await balance(rival)).toBe(before + 500_000);
      // They pay the second session too (it was open in another tab): that money is theirs as well, with its bonus.
      expect(await paid({ id: "cs_two_2", amount_total: 1_000_000, metadata: { fundingRequestId: requestId } })).toMatchObject({ credited: true, amountCents: 1_000_000, bonusCents: 100_000 });
      expect(await balance(rival)).toBe(before + 500_000 + 1_000_000 + 100_000);
      // A session the link never knew about, found by the token Stripe carries as client_reference_id.
      expect(await paid({ id: "cs_two_9", amount_total: 750_000, client_reference_id: token })).toMatchObject({ credited: true, amountCents: 750_000, bonusCents: 37_500 });
      // A paid session that matches nothing is not swallowed: staff hear about it and credit it by hand.
      vi.useFakeTimers();
      try {
        expect(await paid({ id: "cs_lost", amount_total: 500_000 })).toMatchObject({ credited: false, reason: "unknown session" });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
      } finally {
        vi.useRealTimers();
      }
      expect(emails).toHaveLength(1);
      expect(emails[0].subject).toBe("FieldQuote Ops: A Stripe payment matched no payment link: cs_lost");
      expect(emails[0].text).toContain("$5,000.00");
      expect(emails[0].text).toContain("Record a payment");
      // Every payment is on record, once.
      const payments = await t.run(async (ctx) => (await ctx.db.query("fundingPayments").collect()).filter((p) => p.requestId === requestId));
      expect(payments.map((p) => [p.sessionId, p.amountCents, p.bonusCents]).sort()).toEqual([["cs_two_1", 500_000, 0], ["cs_two_2", 1_000_000, 100_000], ["cs_two_9", 750_000, 37_500]]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  test("the feed hides contact details until a company buys the lead, and only one company can", async () => {
    const { t, admin, roofer, rival } = await company();
    await admin.as.mutation(api.marketplace.setLeadPrice, {
      jobType: "roofing",
      price: 285,
    });
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: {
        name: "Jane Cole",
        phone: "555-0101",
        email: "jane@example.com",
        address: "1 Oak St",
        city: "Midland",
        jobType: "roofing",
        notes: "Hail damage",
      },
    });
    const feed = await roofer.as.query(api.marketplace.feed, {
      organizationId: roofer.organizationId,
    });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      jobType: "roofing",
      city: "Midland",
      summary: "Hail damage",
    });
    expect(feed[0].auction).toMatchObject({
      startCents: 28500,
      floorCents: 5700,
      dropCents: 1000,
      dropEveryMs: 3_600_000,
    });
    expect(JSON.stringify(feed)).not.toMatch(/Jane|555-0101|jane@|Oak St/);

    await expect(
      roofer.as.mutation(api.marketplace.buy, {
        leadId: lead!._id,
        organizationId: roofer.organizationId,
      }),
    ).rejects.toThrow(/Balance too low/);
    await expect(
      rival.as.mutation(api.marketplace.buy, {
        leadId: lead!._id,
        organizationId: roofer.organizationId,
      }),
    ).rejects.toThrow(/access/);
    for (const who of [roofer, rival]) {
      await admin.as.mutation(api.marketplace.recordTopUp, {
        organizationId: who.organizationId,
        amount: 5000,
      });
    }
    await roofer.as.mutation(api.marketplace.buy, {
      leadId: lead!._id,
      organizationId: roofer.organizationId,
    });
    await expect(
      rival.as.mutation(api.marketplace.buy, {
        leadId: lead!._id,
        organizationId: rival.organizationId,
      }),
    ).rejects.toThrow(/just bought/);
    const mine = await roofer.as.query(api.leads.list, {
      organizationId: roofer.organizationId,
    });
    expect(mine[0]).toMatchObject({
      name: "Jane Cole",
      phone: "555-0101",
      pricePaidCents: 28500,
      wonVia: "buy",
    });
    expect(await balance(roofer)).toBe(500000 - 28500);
    expect(
      await rival.as.query(api.marketplace.feed, {
        organizationId: rival.organizationId,
      }),
    ).toHaveLength(0);
    void t;
  });
});

describe("dropping prices and buy orders", () => {
  const HOUR = 3_600_000;

  test("a trade's schedule fills in from the start price", () => {
    expect(pricingFor({ priceCents: 28500 })).toEqual({
      startCents: 28500,
      floorCents: 5700,
      dropCents: 1000,
      dropEveryMs: HOUR,
    });
    // Nothing lists for less than $200.
    expect(pricingFor({ priceCents: 1600 })).toEqual({
      startCents: 20000,
      floorCents: 4000,
      dropCents: 700,
      dropEveryMs: HOUR,
    });
    expect(
      pricingFor({
        priceCents: 25000,
        floorCents: 3500,
        dropCents: 500,
        dropEveryMinutes: 30,
      }),
    ).toEqual({
      startCents: 25000,
      floorCents: 3500,
      dropCents: 500,
      dropEveryMs: 30 * 60_000,
    });
    const a = {
      startCents: 15000,
      floorCents: 3500,
      dropCents: 500,
      dropEveryMs: HOUR,
      listedAt: "2026-10-17T00:00:00.000Z",
    };
    const listed = Date.parse(a.listedAt);
    expect(priceAt(a, listed + 59 * 60_000)).toMatchObject({
      priceCents: 15000,
      nextPriceCents: 14500,
      nextDropAtMs: listed + HOUR,
    });
    expect(priceAt(a, listed + 2.5 * HOUR).priceCents).toBe(14000);
    expect(priceAt(a, listed + 23 * HOUR)).toMatchObject({
      priceCents: 3500,
      atFloor: true,
      floorAtMs: listed + 23 * HOUR,
    });
    expect(priceAt(a, listed + 100 * HOUR).priceCents).toBe(3500);
    expect(fillTimeMs(a, 14000)).toBe(listed + 2 * HOUR);
    expect(fillTimeMs(a, 14200)).toBe(listed + 2 * HOUR);
    expect(fillTimeMs(a, 3500)).toBe(listed + 23 * HOUR);
    expect(fillTimeMs(a, 100)).toBe(listed + 23 * HOUR);
  });

  async function market() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const roofer = await signUp(t, "roofer@example.com");
    const rival = await signUp(t, "rival@example.com");
    await expect(
      admin.as.mutation(api.marketplace.setLeadPrice, {
        jobType: "roofing",
        price: 150,
      }),
    ).rejects.toThrow(/start at \$200/);
    await admin.as.mutation(api.marketplace.setLeadPrice, {
      jobType: "roofing",
      price: 285,
      floor: 220,
      drop: 5,
    });
    for (const who of [roofer, rival])
      await admin.as.mutation(api.marketplace.recordTopUp, {
        organizationId: who.organizationId,
        amount: 300,
      });
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Jane Cole", jobType: "roofing" },
    });
    return { t, admin, roofer, rival, leadId: lead!._id };
  }
  const balance = async (who: { as: any; organizationId: any }) =>
    (
      await who.as.query(api.marketplace.wallet, {
        organizationId: who.organizationId,
      })
    ).balanceCents;
  const sold = async (t: any, leadId: any) =>
    t.run(async (ctx: any) => ctx.db.get(leadId));

  test("the price drops on the schedule, and buy now pays what it is at the time", async () => {
    try {
      const { t, admin, roofer, leadId } = await market();
      const feed = await roofer.as.query(api.marketplace.feed, {
        organizationId: roofer.organizationId,
      });
      expect(feed[0].auction).toMatchObject({
        startCents: 28500,
        floorCents: 22000,
        dropCents: 500,
        listedAt: "2026-10-17T12:00:00.000Z",
      });
      const inbox = await admin.as.query(api.marketplace.listInbox, {});
      expect(inbox.available[0]).toMatchObject({
        price: 28500,
        floorCents: 22000,
        openBids: 0,
        floorAt: "2026-10-18T01:00:00.000Z",
      });

      vi.setSystemTime(new Date("2026-10-17T14:30:00.000Z"));
      expect(
        (await admin.as.query(api.marketplace.listInbox, {})).available[0]
          .price,
      ).toBe(27500);
      await roofer.as.mutation(api.marketplace.buy, {
        leadId,
        organizationId: roofer.organizationId,
      });
      expect(await balance(roofer)).toBe(30000 - 27500);
      expect(await sold(t, leadId)).toMatchObject({
        status: "assigned",
        priceCents: 27500,
      });
      // Changing the trade's prices later doesn't move a lead already listed.
      const other = await admin.as.mutation(api.marketplace.createLead, {
        data: { name: "Bo", jobType: "roofing" },
      });
      await admin.as.mutation(api.marketplace.setLeadPrice, {
        jobType: "roofing",
        price: 200,
      });
      expect(
        (
          await roofer.as.query(api.marketplace.feed, {
            organizationId: roofer.organizationId,
          })
        )[0],
      ).toMatchObject({
        id: other!._id,
        auction: { startCents: 28500 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("a buy order fills on its own when the price reaches it; the highest order wins", async () => {
    try {
      const { t, admin, roofer, rival, leadId } = await market();
      const place = (who: any, max: number) =>
        who.as.mutation(api.marketplace.placeBid, {
          leadId,
          organizationId: who.organizationId,
          max,
        });
      await expect(place(roofer, 10)).rejects.toThrow(/won't go below \$220/);
      await expect(place(roofer, 285)).rejects.toThrow(
        /already \$285.00: buy it now/,
      );
      const broke = await signUp(t, "broke@example.com");
      await expect(place(broke, 260)).rejects.toThrow(/Add funds/);
      await expect(
        rival.as.mutation(api.marketplace.placeBid, {
          leadId,
          organizationId: roofer.organizationId,
          max: 60,
        }),
      ).rejects.toThrow(/access/);

      expect(await place(roofer, 260)).toMatchObject({
        fillsAt: "2026-10-17T17:00:00.000Z",
      });
      // A second order from the same company replaces the first.
      const { bidId } = await place(roofer, 255);
      expect(await place(rival, 270)).toMatchObject({
        fillsAt: "2026-10-17T15:00:00.000Z",
      });
      expect(
        (await admin.as.query(api.marketplace.listInbox, {})).available[0]
          .openBids,
      ).toBe(2);
      const mine = await roofer.as.query(api.marketplace.feed, {
        organizationId: roofer.organizationId,
      });
      expect(mine[0].myBid).toMatchObject({ id: bidId, maxCents: 25500 });
      expect(
        (
          await roofer.as.query(api.marketplace.wallet, {
            organizationId: roofer.organizationId,
          })
        ).openBids,
      ).toBe(1);

      // 15:00: the price reaches $270 and the rival's order fills at that price.
      vi.advanceTimersByTime(3 * HOUR);
      await t.finishInProgressScheduledFunctions();
      expect(await sold(t, leadId)).toMatchObject({
        status: "assigned",
        assignedOrganizationId: rival.organizationId,
        priceCents: 27000,
      });
      // 17:00: the roofer's order comes due, but the lead is gone.
      vi.advanceTimersByTime(2 * HOUR);
      await t.finishInProgressScheduledFunctions();
      expect(await balance(rival)).toBe(30000 - 27000);
      expect(await balance(roofer)).toBe(30000);
      const rivals = await rival.as.query(api.marketplace.bids, {
        organizationId: rival.organizationId,
      });
      expect(rivals[0]).toMatchObject({
        status: "filled",
        maxCents: 27000,
        pricePaidCents: 27000,
      });
      // Their Leads board says the buy order brought it in.
      const theirs = await rival.as.query(api.leads.list, {
        organizationId: rival.organizationId,
      });
      expect(theirs[0]).toMatchObject({
        pricePaidCents: 27000,
        wonVia: "order",
      });
      const roofers = await roofer.as.query(api.marketplace.bids, {
        organizationId: roofer.organizationId,
      });
      expect(roofers.map((b) => b.status).sort()).toEqual(["lost"]);
      expect(roofers[0].outcome).toMatch(/Another company/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("buy orders can be cancelled, lose to a buy now, and need the balance when they fill", async () => {
    try {
      const { t, admin, roofer, rival, leadId } = await market();
      const { bidId } = await roofer.as.mutation(api.marketplace.placeBid, {
        leadId,
        organizationId: roofer.organizationId,
        max: 260,
      });
      await expect(
        rival.as.mutation(api.marketplace.cancelBid, { bidId }),
      ).rejects.toThrow(/access/);
      await roofer.as.mutation(api.marketplace.cancelBid, { bidId });
      await expect(
        roofer.as.mutation(api.marketplace.cancelBid, { bidId }),
      ).rejects.toThrow(/already ended/);

      await roofer.as.mutation(api.marketplace.placeBid, {
        leadId,
        organizationId: roofer.organizationId,
        max: 260,
      });
      await rival.as.mutation(api.marketplace.buy, {
        leadId,
        organizationId: rival.organizationId,
      });
      const lost = await roofer.as.query(api.marketplace.bids, {
        organizationId: roofer.organizationId,
      });
      expect(lost.find((b) => b.status === "lost")?.outcome).toMatch(
        /bought it first/,
      );

      // Spending the balance before the order fills loses it.
      const second = await admin.as.mutation(api.marketplace.createLead, {
        data: { name: "Bo", jobType: "roofing" },
      });
      await roofer.as.mutation(api.marketplace.placeBid, {
        leadId: second!._id,
        organizationId: roofer.organizationId,
        max: 260,
      });
      const third = await admin.as.mutation(api.marketplace.createLead, {
        data: { name: "Cy", jobType: "roofing" },
      });
      await roofer.as.mutation(api.marketplace.buy, {
        leadId: third!._id,
        organizationId: roofer.organizationId,
      });
      expect(await balance(roofer)).toBe(30000 - 28500);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await sold(t, second!._id)).toMatchObject({ status: "available" });
      const after = await roofer.as.query(api.marketplace.bids, {
        organizationId: roofer.organizationId,
      });
      expect(after.find((b) => b.leadId === second!._id)?.outcome).toMatch(
        /Balance too low/,
      );

      // The admin sending a lead by hand also closes its orders.
      await admin.as.mutation(api.marketplace.recordTopUp, {
        organizationId: rival.organizationId,
        amount: 300,
      });
      await rival.as.mutation(api.marketplace.placeBid, {
        leadId: second!._id,
        organizationId: rival.organizationId,
        max: 225,
      });
      await admin.as.mutation(api.marketplace.assign, {
        leadId: second!._id,
        organizationId: rival.organizationId,
      });
      const rivals = await rival.as.query(api.marketplace.bids, {
        organizationId: rival.organizationId,
      });
      expect(rivals.find((b) => b.leadId === second!._id)).toMatchObject({
        status: "lost",
        outcome: "You bought this lead",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("standing bids and instant awards", () => {
  test("Texas counties and the towns we know", () => {
    expect(TEXAS_COUNTIES).toHaveLength(254);
    expect(new Set(TEXAS_COUNTIES).size).toBe(254);
    expect(countyForTown("Odessa")).toBe("Ector");
    expect(countyForTown("big spring")).toBe("Howard");
    expect(countyForTown("Nowhere")).toBeUndefined();
    expect(normalizeCounty(" midland county ")).toBe("Midland");
    expect(normalizeCounty("Atlantis")).toBe("Atlantis");
  });

  async function market() {
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const mio = await signUp(t, "mio@example.com");
    const soco = await signUp(t, "soco@example.com");
    const broke = await signUp(t, "broke@example.com");
    for (const who of [mio, soco])
      await admin.as.mutation(api.marketplace.recordTopUp, {
        organizationId: who.organizationId,
        amount: 1000,
      });
    // Bids are only for listed trades. Soco lists no landscaping, so the
    // lead counts below can tell the two apart.
    for (const [who, leadTrades] of [
      [mio, ["landscaping", "painting"]],
      [soco, ["painting"]],
      [broke, ["landscaping", "painting"]],
    ] as const)
      await admin.as.mutation(api.marketplace.setCompanyTrades, {
        organizationId: who.organizationId,
        leadTrades: [...leadTrades],
      });
    return { t, admin, mio, soco, broke };
  }
  const balance = async (who: { as: any; organizationId: any }) =>
    (
      await who.as.query(api.marketplace.wallet, {
        organizationId: who.organizationId,
      })
    ).balanceCents;
  const standing = (
    who: { as: any; organizationId: any },
    county: string,
    jobType: string,
    amount: number,
  ) =>
    who.as.mutation(api.bids.setStanding, {
      organizationId: who.organizationId,
      county,
      jobType,
      amount,
    });
  const results = (who: { as: any; organizationId: any }) =>
    who.as.query(api.bids.results, { organizationId: who.organizationId });

  test("a standing bid needs a real county, a trade, $200 or more and a balance that covers it", async () => {
    const { admin, mio, soco, broke } = await market();
    await expect(standing(mio, "Narnia", "landscaping", 250)).rejects.toThrow(
      /isn't a Texas county/,
    );
    await expect(standing(mio, "Midland", "", 250)).rejects.toThrow(
      /service type/,
    );
    await expect(standing(mio, "Midland", "landscaping", 150)).rejects.toThrow(
      /start at \$200/,
    );
    // No balance: the bid isn't placed at all.
    await expect(standing(broke, "Midland", "landscaping", 250)).rejects.toThrow(
      "Your balance is $0.00. Add funds to bid $250.00.",
    );
    expect(
      await broke.as.query(api.bids.listStanding, {
        organizationId: broke.organizationId,
      }),
    ).toEqual([]);
    await expect(
      soco.as.mutation(api.bids.setStanding, {
        organizationId: mio.organizationId,
        county: "Midland",
        jobType: "landscaping",
        amount: 250,
      }),
    ).rejects.toThrow(/access/);

    await standing(mio, "midland county", "landscaping", 250);
    await standing(mio, "Midland", "landscaping", 275); // replaces, doesn't duplicate
    await standing(mio, "Ector", "landscaping", 225);
    const mine = await mio.as.query(api.bids.listStanding, {
      organizationId: mio.organizationId,
    });
    expect(
      mine.map((b) => [
        b.county,
        b.jobType,
        b.amountCents,
        b.funded,
        b.leading,
        b.contested,
      ]),
    ).toEqual([
      ["Ector", "landscaping", 22500, true, true, false],
      ["Midland", "landscaping", 27500, true, true, false],
    ]);
    await expect(
      soco.as.mutation(api.bids.removeStanding, { id: mine[0].id }),
    ).rejects.toThrow(/access/);
    await mio.as.mutation(api.bids.removeStanding, { id: mine[0].id });
    expect(
      await mio.as.query(api.bids.listStanding, {
        organizationId: mio.organizationId,
      }),
    ).toHaveLength(1);
    const overview = await admin.as.query(
      api.marketplace.companiesOverview,
      {},
    );
    expect(
      overview.find((c) => c.id === mio.organizationId)?.standingBids,
    ).toEqual([
      { county: "Midland", jobType: "landscaping", amountCents: 27500 },
    ]);
  });

  test("a lead with a standing bid is the company's the moment it's listed; one without goes to the Marketplace", async () => {
    const { admin, mio, soco } = await market();
    await standing(mio, "Midland", "landscaping", 250);
    // The town gives the county when the lead has none.
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: {
        name: "Patricia Nguyen",
        city: "Midland",
        jobType: "landscaping",
        notes: "Sod",
      },
    });
    expect(lead).toMatchObject({
      county: "Midland",
      status: "assigned",
      priceCents: 25000,
      assignedOrganizationId: mio.organizationId,
    });
    expect(await balance(mio)).toBe(100000 - 25000);
    const theirs = await mio.as.query(api.leads.list, {
      organizationId: mio.organizationId,
    });
    expect(theirs[0]).toMatchObject({
      name: "Patricia Nguyen",
      pricePaidCents: 25000,
      source: "FieldQuote Lead",
      wonVia: "bid",
      county: "Midland",
    });
    // A lead they add themselves gets its county from the town, so the board can filter by county too.
    await mio.as.mutation(api.leads.create, {
      organizationId: mio.organizationId,
      data: { name: "Walk-in", city: "Odessa" },
    });
    const board = await mio.as.query(api.leads.list, {
      organizationId: mio.organizationId,
    });
    expect(board.find((l) => l.name === "Walk-in")).toMatchObject({
      county: "Ector",
    });
    const won = await results(mio);
    expect(won[0]).toMatchObject({
      leadId: lead!._id,
      county: "Midland",
      won: true,
      myBidCents: 25000,
    });
    expect(JSON.stringify(won)).not.toMatch(/Patricia|Nguyen/);
    expect(await results(soco)).toHaveLength(0);

    const roofing = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Rachel Dunn", city: "Midland", jobType: "roofing" },
    });
    expect(roofing!.status).toBe("available");
    const elsewhere = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Gloria Tran", county: "Martin", jobType: "landscaping" },
    });
    expect(elsewhere!.status).toBe("available");
    const feed = await mio.as.query(api.marketplace.feed, {
      organizationId: mio.organizationId,
    });
    expect(feed.map((l) => l.id).sort()).toEqual(
      [roofing!._id, elsewhere!._id].sort(),
    );

    // The Leads page's "new leads" count only counts leads in a company's trades:
    // mio's landscaping bid covers Gloria, not the roofing lead; soco lists
    // neither, so nothing; give soco roofing and the roofing lead counts.
    const available = async (who: { as: any; organizationId: any }) =>
      (
        await who.as.query(api.marketplace.wallet, {
          organizationId: who.organizationId,
        })
      ).availableLeads;
    expect(await available(mio)).toBe(1);
    expect(await available(soco)).toBe(0);
    await admin.as.mutation(api.marketplace.setCompanyTrades, {
      organizationId: soco.organizationId,
      leadTrades: ["roofing"],
    });
    expect(await available(soco)).toBe(1);

    // The admin sees it sold by bid; the buy-order views ignore award rows.
    const inbox = await admin.as.query(api.marketplace.listInbox, {});
    expect(inbox.available).toHaveLength(2);
    expect(inbox.sold[0]).toMatchObject({
      _id: lead!._id,
      wonBy: "bid",
      companyName: expect.any(String),
    });
    expect(
      await mio.as.query(api.marketplace.bids, {
        organizationId: mio.organizationId,
      }),
    ).toHaveLength(0);
    expect(
      (
        await mio.as.query(api.marketplace.wallet, {
          organizationId: mio.organizationId,
        })
      ).standingBids,
    ).toBe(1);
  });

  test("the highest bid that can pay wins, ties go to the earlier bid, and losers see why", async () => {
    const { admin, mio, soco, broke } = await market();
    await standing(mio, "Ector", "painting", 250);
    await standing(soco, "Ector", "painting", 250);
    // Broke had money when it bid, then spent it.
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: broke.organizationId,
      amount: 400,
    });
    await standing(broke, "Ector", "painting", 400);
    await admin.as.mutation(api.marketplace.recordTopUp, {
      organizationId: broke.organizationId,
      amount: 1,
    });
    const other = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Spend", city: "Midland", jobType: "roofing" },
    });
    await broke.as.mutation(api.marketplace.buy, {
      leadId: other!._id,
      organizationId: broke.organizationId,
    });
    expect(await balance(broke)).toBe(40100 - 20000);

    // Broke's $400 is highest on paper but unfunded, so it doesn't count; Mio and Soco tie at $250 and Mio bid first.
    const mine = await mio.as.query(api.bids.listStanding, {
      organizationId: mio.organizationId,
    });
    expect(mine[0]).toMatchObject({
      funded: true,
      leading: true,
      contested: true,
    });
    const theirs = await soco.as.query(api.bids.listStanding, {
      organizationId: soco.organizationId,
    });
    expect(theirs[0]).toMatchObject({
      funded: true,
      leading: false,
      contested: true,
    });
    expect(
      (
        await broke.as.query(api.bids.listStanding, {
          organizationId: broke.organizationId,
        })
      )[0],
    ).toMatchObject({ funded: false, leading: false });

    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Carlos Benavides", city: "Odessa", jobType: "painting" },
    });
    expect(lead).toMatchObject({
      status: "assigned",
      priceCents: 25000,
      assignedOrganizationId: mio.organizationId,
    });
    expect(await balance(mio)).toBe(75000);
    expect(await balance(soco)).toBe(100000);
    expect((await results(soco))[0]).toMatchObject({
      won: false,
      outcome: "Outbid: a higher bid won it",
    });
    expect((await results(broke))[0].outcome).toMatch(
      /Balance too low: \$400\.00 needed, \$201\.00 available/,
    );

    // Soco raises its standing bid and now leads; the next lead is Soco's.
    await standing(soco, "Ector", "painting", 300);
    expect(
      (
        await soco.as.query(api.bids.listStanding, {
          organizationId: soco.organizationId,
        })
      )[0].leading,
    ).toBe(true);
    expect(
      (
        await mio.as.query(api.bids.listStanding, {
          organizationId: mio.organizationId,
        })
      )[0].leading,
    ).toBe(false);
    const next = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Dana Ruiz", city: "Odessa", jobType: "painting" },
    });
    expect(next).toMatchObject({
      status: "assigned",
      priceCents: 30000,
      assignedOrganizationId: soco.organizationId,
    });
  });

  test("a raise past the balance is refused; a bid the balance fell below is paused and can still be lowered", async () => {
    const { admin, mio } = await market();
    const id = await standing(mio, "Midland", "landscaping", 900);
    const mine = () =>
      mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId });
    expect((await mine()).find((b) => b.id === id)).toMatchObject({
      funded: true,
      leading: true,
    });
    // Raise past the $1,000 balance: refused, the bid is unchanged.
    await expect(standing(mio, "Midland", "landscaping", 1200)).rejects.toThrow(
      "Your balance is $1,000.00. Add funds to bid $1,200.00.",
    );
    expect((await mine()).find((b) => b.id === id)?.amountCents).toBe(90000);
    // Spending drops the balance to $800, under the $900 bid: it's kept but paused.
    const other = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Spend", city: "Midland", jobType: "roofing" },
    });
    await mio.as.mutation(api.marketplace.buy, {
      leadId: other!._id,
      organizationId: mio.organizationId,
    });
    expect(await balance(mio)).toBe(80000);
    expect((await mine()).find((b) => b.id === id)).toMatchObject({
      funded: false,
      leading: false,
    });
    // The wallet counts it as paused, for the Leads page's bid status line.
    const summary = () =>
      mio.as.query(api.marketplace.wallet, { organizationId: mio.organizationId });
    expect(await summary()).toMatchObject({ standingBids: 1, pausedBids: 1 });
    // Lowering is always allowed, even while still above the balance...
    expect(await standing(mio, "Midland", "landscaping", 850)).toBe(id);
    expect((await mine()).find((b) => b.id === id)).toMatchObject({
      amountCents: 85000,
      funded: false,
    });
    // ...and once it's under the balance the bid is live again.
    await standing(mio, "Midland", "landscaping", 750);
    expect((await mine()).find((b) => b.id === id)).toMatchObject({
      amountCents: 75000,
      funded: true,
      leading: true,
    });
    expect(await summary()).toMatchObject({ standingBids: 1, pausedBids: 0 });
  });

  test("a bid is only for a listed trade; dropping the trade drops its bids and moves the next bid up", async () => {
    const { admin, mio, soco } = await market();
    await expect(standing(soco, "Midland", "landscaping", 250)).rejects.toThrow(
      "Add landscaping to your trades in Company settings first.",
    );
    await admin.as.mutation(api.marketplace.setCompanyTrades, {
      organizationId: soco.organizationId,
      leadTrades: ["painting", "landscaping"],
    });
    await standing(soco, "Midland", "landscaping", 300);
    await standing(mio, "Midland", "landscaping", 250);
    await standing(mio, "Ector", "painting", 250);
    const mine = (who: { as: any; organizationId: any }) =>
      who.as.query(api.bids.listStanding, { organizationId: who.organizationId });
    expect((await mine(mio)).find((b) => b.jobType === "landscaping")).toMatchObject({ leading: false });
    // Soco drops landscaping from its own settings: its Midland bid goes, and Mio leads there.
    expect(
      await soco.as.mutation(api.industries.setForOrganization, {
        organizationId: soco.organizationId,
        industryIds: ["painting"],
      }),
    ).toEqual({ removedBids: 1 });
    expect(await mine(soco)).toEqual([]);
    expect((await mine(mio)).find((b) => b.jobType === "landscaping")).toMatchObject({ leading: true });
    // Mio's other bid is untouched by a change to a different trade.
    expect((await mine(mio)).map((b) => b.jobType).sort()).toEqual(["landscaping", "painting"]);
  });

  test("the deploy's sweep removes bids placed outside a company's trades before the rule", async () => {
    const { t, admin, mio, soco } = await market();
    await standing(mio, "Midland", "landscaping", 250);
    // A roofing bid from before the rule, written straight to the table.
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("standingBids", {
        organizationId: soco.organizationId,
        county: "Midland",
        jobType: "roofing",
        amountCents: 30000,
        createdBy: soco.userId,
        createdAt: now,
        updatedAt: now,
      });
    });
    expect(await t.mutation(internal.bids.removeBidsOutsideTrades, {})).toEqual({ companies: 1, bids: 1 });
    expect(await soco.as.query(api.bids.listStanding, { organizationId: soco.organizationId })).toEqual([]);
    expect(await mio.as.query(api.bids.listStanding, { organizationId: mio.organizationId })).toHaveLength(1);
    expect(await t.mutation(internal.bids.removeBidsOutsideTrades, {})).toEqual({ companies: 0, bids: 0 });
    void admin;
  });

  test("an admin confirms a lead with the homeowner; companies see when and what, and the buyer keeps it", async () => {
    const { admin, mio } = await market();
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Dana Reyes", city: "Midland", jobType: "roofing", notes: "Hail damage" },
    });
    await expect(
      mio.as.mutation(api.marketplace.verifyLead, { id: lead!._id, note: "x" }),
    ).rejects.toThrow(/staff/);
    const inFeed = async () =>
      (
        await mio.as.query(api.marketplace.feed, { organizationId: mio.organizationId })
      ).find((l) => l.id === lead!._id);
    expect((await inFeed())?.verified).toBeUndefined();
    const confirmed = await admin.as.mutation(api.marketplace.verifyLead, {
      id: lead!._id,
      note: "  Wants a quote this month, budget about $8K  ",
    });
    const note = "Wants a quote this month, budget about $8K";
    expect(confirmed?.verified).toMatchObject({ note, by: admin.userId });
    const at = confirmed!.verified!.at;
    // Companies see the date and the line, not who called.
    expect((await inFeed())?.verified).toEqual({ at, note });
    expect(
      (await admin.as.query(api.marketplace.listInbox, {})).available.find((l) => l._id === lead!._id)?.verified?.note,
    ).toBe(note);
    // Bought: the confirmation travels with the lead into the company's Leads.
    await mio.as.mutation(api.marketplace.buy, { leadId: lead!._id, organizationId: mio.organizationId });
    const mine = await mio.as.query(api.leads.list, { organizationId: mio.organizationId });
    expect(mine.find((l) => l.name === "Dana Reyes")?.verified).toEqual({ at, note });
    // Once sold it can't be confirmed again.
    await expect(
      admin.as.mutation(api.marketplace.verifyLead, { id: lead!._id }),
    ).rejects.toThrow(/for sale or in the Vault/);
  });

  test("Midland's permits land in the Vault for companies on the plan, mapped to their trades", async () => {
    const { t, mio } = await market();
    const { rowsToPermits, tradesForPermit } = await import("./lib/permits");
    expect(tradesForPermit("Residential - Building", "Single Family")).toEqual(
      expect.arrayContaining(["general-construction", "roofing", "concrete"]),
    );
    expect(tradesForPermit("Residential - Building", "Alteration & Repair")).toContain("painting");
    expect(tradesForPermit("Mechanical - Replacement", "Heating, A/C, Venting, Ductwork or Refridgeration")).toEqual(["hvac"]);
    expect(tradesForPermit("Sign", "Sign")).toEqual([]);
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const applied = (daysAgo: number) => now - daysAgo * day;
    const feature = (PermitNumber: string, Name: string, PermitWorkClass: string, daysAgo: number, extra: Record<string, unknown> = {}) => ({
      attributes: { PermitNumber, PermitStatus: "Issued", Name, PermitWorkClass, Description: `${Name} permit`, Address: "2705 HOWDY DR", ApplyDate: applied(daysAgo), DateIssued: applied(daysAgo), URL: null, ...extra },
      geometry: { x: -102.07, y: 32.0 },
    });
    const rows = rowsToPermits([
      feature("MEC-1", "Mechanical - Replacement", "Heating, A/C, Venting, Ductwork or Refridgeration", 1),
      feature("SGN-1", "Sign", "Sign", 1),
    ]);
    // Signs aren't building work; the rest is mapped, dated and placed.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ permitNumber: "MEC-1", trades: ["hvac"], lat: 32, lng: -102.07, status: "Issued" });
    expect(rows[0].appliedAt).toBe(new Date(applied(1)).toISOString());
    // Upserting is idempotent; a changed status is an update.
    expect(await t.mutation(internal.permits.upsert, { source: "midland", rows })).toEqual({ added: 1, updated: 0 });
    expect(await t.mutation(internal.permits.upsert, { source: "midland", rows })).toEqual({ added: 0, updated: 0 });
    expect(await t.mutation(internal.permits.upsert, { source: "midland", rows: [{ ...rows[0], status: "Finaled" }] })).toEqual({ added: 0, updated: 1 });
    await t.mutation(internal.permits.upsert, {
      source: "midland",
      rows: rowsToPermits([
        feature("RES-1", "Residential - Building", "Single Family", 2),
        feature("RES-2", "Residential - Building", "Alteration & Repair", 3),
        feature("ELC-1", "Electrical - Construction", "Commercial Electrical", 40),
      ]),
    });
    // Without the plan the counts show but not the permits.
    const near = (days: number) => mio.as.query(api.permits.near, { organizationId: mio.organizationId, days });
    expect(await near(30)).toMatchObject({ locked: true, permits: [], summary: { total: 3, singleFamily: 1, inMyTrades: 1 } });
    await mio.as.mutation(api.marketplace.startPlan, { organizationId: mio.organizationId });
    const open = await near(30);
    expect(open.locked).toBe(false);
    expect(open.permits.map((p) => p.permitNumber)).toEqual(["MEC-1", "RES-1", "RES-2"]);
    // Mio paints: the repair permit is in its trades, the HVAC one isn't.
    expect(open.permits.find((p) => p.permitNumber === "RES-2")?.matchesTrades).toBe(true);
    expect(open.permits.find((p) => p.permitNumber === "MEC-1")?.matchesTrades).toBe(false);
    expect((await near(90)).summary.total).toBe(4);
    // The monthly report counts by kind.
    const months = await mio.as.query(api.permits.monthly, {});
    expect(months.reduce((n, m) => n + m.total, 0)).toBe(4);
    expect(months.reduce((n, m) => n + m.singleFamily, 0)).toBe(1);
    expect(months.reduce((n, m) => n + m.trade, 0)).toBe(2);
  });

  test("a company hears it was outbid once, until it looks; leading again or its own moves clear it", async () => {
    const { admin, mio, soco } = await market();
    const wallet = (who: { as: any; organizationId: any }) =>
      who.as.query(api.marketplace.wallet, { organizationId: who.organizationId });
    const mine = (who: { as: any; organizationId: any }) =>
      who.as.query(api.bids.listStanding, { organizationId: who.organizationId });
    await standing(mio, "Midland", "landscaping", 250);
    expect((await wallet(mio)).outbidBids).toBe(0);
    // Soco bids higher: Mio is told, Soco (who made the move) isn't.
    await admin.as.mutation(api.marketplace.setCompanyTrades, {
      organizationId: soco.organizationId,
      leadTrades: ["painting", "landscaping"],
    });
    await standing(soco, "Midland", "landscaping", 300);
    expect((await wallet(mio)).outbidBids).toBe(1);
    expect((await mine(mio))[0]).toMatchObject({ leading: false, outbidNew: true });
    expect((await wallet(soco)).outbidBids).toBe(0);
    // Once Mio has looked at its bids it's no longer news, though the bid is still outbid.
    await mio.as.mutation(api.bids.markOutbidSeen, { organizationId: mio.organizationId });
    expect((await wallet(mio)).outbidBids).toBe(0);
    expect((await mine(mio))[0]).toMatchObject({ leading: false, outbidNew: false });
    // Mio raises and leads again; now Soco is the one outbid.
    await standing(mio, "Midland", "landscaping", 350);
    expect((await mine(mio))[0]).toMatchObject({ leading: true, outbidNew: false });
    expect((await wallet(soco)).outbidBids).toBe(1);
    // Soco lowering its own bid isn't news to Soco; and a bid paused by a falling balance isn't "outbid".
    await soco.as.mutation(api.bids.markOutbidSeen, { organizationId: soco.organizationId });
    await standing(soco, "Midland", "landscaping", 200);
    expect((await wallet(soco)).outbidBids).toBe(0);
    await standing(soco, "Ector", "painting", 900);
    const spend = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Spend", city: "Midland", jobType: "roofing" },
    });
    await soco.as.mutation(api.marketplace.buy, {
      leadId: spend!._id,
      organizationId: soco.organizationId,
    });
    expect(await balance(soco)).toBe(80000);
    expect((await mine(soco)).find((b) => b.county === "Ector")).toMatchObject({ funded: false, outbidNew: false });
    expect((await wallet(soco)).outbidBids).toBe(0);
    // A rival who only becomes covered by topping up can outbid too.
    await admin.as.mutation(api.marketplace.recordTopUp, { organizationId: soco.organizationId, amount: 500 });
    await standing(mio, "Ector", "painting", 950);
    await soco.as.mutation(api.bids.markOutbidSeen, { organizationId: soco.organizationId });
    expect((await wallet(soco)).outbidBids).toBe(0);
  });

  test("a lead nobody can pay for goes to the Marketplace, and a legacy round still closes", async () => {
    const { t, admin, mio, soco } = await market();
    await standing(mio, "Howard", "landscaping", 900);
    // Spend down so the bid can't be paid when the lead arrives.
    const filler = await admin.as.mutation(api.marketplace.createLead, {
      data: { name: "Filler", city: "Midland", jobType: "roofing" },
    });
    await mio.as.mutation(api.marketplace.buy, {
      leadId: filler!._id,
      organizationId: mio.organizationId,
    });
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: {
        name: "Renee Oliver",
        city: "Big Spring",
        jobType: "landscaping",
      },
    });
    expect(lead).toMatchObject({ county: "Howard", status: "available" });
    expect(
      (
        await soco.as.query(api.marketplace.feed, {
          organizationId: soco.organizationId,
        })
      ).map((l) => l.id),
    ).toContain(lead!._id);
    expect((await results(mio))[0]).toMatchObject({
      won: false,
      outcome: expect.stringMatching(/Balance too low/),
    });

    // A round scheduled before awards became instant: the highest payable bid wins when it fires.
    const legacy = await t.run(async (ctx) => {
      const lead = (await ctx.db
        .query("marketplaceLeads")
        .filter((q) => q.eq(q.field("name"), "Renee Oliver"))
        .first())!;
      await ctx.db.patch(lead._id, {
        status: "bidding",
        round: {
          opensAt: "2026-10-18T12:00:00.000Z",
          closesAt: "2026-10-18T13:00:00.000Z",
        },
      });
      const user = (await ctx.db.query("users").first())!;
      for (const [organizationId, maxCents] of [
        [mio.organizationId, 90000],
        [soco.organizationId, 30000],
      ] as const)
        await ctx.db.insert("leadBids", {
          marketplaceLeadId: lead._id,
          organizationId,
          kind: "round",
          maxCents,
          status: "open",
          createdBy: user._id,
          createdAt: "2026-10-18T12:00:00.000Z",
        });
      return lead._id;
    });
    await t.mutation(internal.bids.closeRound, { leadId: legacy });
    const sold = await t.run(async (ctx) => ctx.db.get(legacy));
    expect(sold).toMatchObject({
      status: "assigned",
      priceCents: 30000,
      assignedOrganizationId: soco.organizationId,
    });
    expect((await results(mio))[0]).toMatchObject({
      won: false,
      outcome: expect.stringMatching(/Balance too low/),
    });
    expect((await results(soco))[0]).toMatchObject({
      won: true,
      myBidCents: 30000,
    });
  });
});

describe("older leads and the monthly plan", () => {
  const DAY = 24 * 3_600_000;
  async function market() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const t = setup();
    const admin = await signUp(t, "admin@fieldquote.example", {
      role: "super_admin",
    });
    const roofer = await signUp(t, "roofer@example.com");
    const rival = await signUp(t, "rival@example.com");
    await admin.as.mutation(api.marketplace.setCompanyTrades, {
      organizationId: roofer.organizationId,
      leadTrades: ["roofing"],
    });
    await admin.as.mutation(api.marketplace.setCompanyTrades, {
      organizationId: rival.organizationId,
      leadTrades: ["roofing"],
    });
    for (const who of [roofer, rival])
      await admin.as.mutation(api.marketplace.recordTopUp, {
        organizationId: who.organizationId,
        amount: 300,
      });
    const lead = await admin.as.mutation(api.marketplace.createLead, {
      data: {
        name: "Jane Cole",
        city: "Midland",
        jobType: "roofing",
        notes: "Hail damage",
      },
    });
    return { t, admin, roofer, rival, leadId: lead!._id };
  }
  const wallet = (who: { as: any; organizationId: any }) =>
    who.as.query(api.marketplace.wallet, {
      organizationId: who.organizationId,
    });
  const older = (who: { as: any; organizationId: any }) =>
    who.as.query(api.marketplace.olderLeads, {
      organizationId: who.organizationId,
    });
  const status = async (t: any, leadId: any) =>
    (await t.run(async (ctx: any) => ctx.db.get(leadId))).status;

  test("a lead nobody buys moves to Older leads after a week and is archived after a month", async () => {
    try {
      const { t, admin, roofer, rival, leadId } = await market();
      await rival.as.mutation(api.marketplace.placeBid, {
        leadId,
        organizationId: rival.organizationId,
        max: 100,
      });
      vi.setSystemTime(new Date("2026-10-07T12:00:00.000Z"));
      expect(await t.mutation(internal.marketplace.ageLeads, {})).toEqual({
        moved: 0,
        archived: 0,
      });
      vi.setSystemTime(new Date("2026-10-08T13:00:00.000Z"));
      expect(await t.mutation(internal.marketplace.ageLeads, {})).toEqual({
        moved: 1,
        archived: 0,
      });
      expect(await status(t, leadId)).toBe("older");
      // Gone from the Marketplace, and the rival's order on it has lost.
      expect(
        await roofer.as.query(api.marketplace.feed, {
          organizationId: roofer.organizationId,
        }),
      ).toHaveLength(0);
      expect((await wallet(roofer)).availableLeads).toBe(0);
      expect((await wallet(roofer)).olderLeads).toBe(1);
      const orders = await rival.as.query(api.marketplace.bids, {
        organizationId: rival.organizationId,
      });
      expect(orders[0]).toMatchObject({
        status: "lost",
        outcome: "Lead moved to the Vault",
      });
      const inbox = await admin.as.query(api.marketplace.listInbox, {});
      expect(inbox.older.map((l) => l.name)).toEqual(["Jane Cole"]);
      expect(inbox.available).toHaveLength(0);

      vi.setSystemTime(new Date("2026-11-01T13:00:00.000Z"));
      expect(await t.mutation(internal.marketplace.ageLeads, {})).toEqual({
        moved: 0,
        archived: 1,
      });
      expect(await status(t, leadId)).toBe("archived");
      expect(
        (await admin.as.query(api.marketplace.listInbox, {})).archivedCount,
      ).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the pool is locked without the plan; the trial opens it; claims are exclusive, included, then $15", async () => {
    try {
      const { t, admin, roofer, rival, leadId } = await market();
      vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
      await t.mutation(internal.marketplace.ageLeads, {});
      // No plan yet: just the count.
      expect(await older(roofer)).toMatchObject({
        locked: true,
        count: 1,
        plan: null,
        leads: [],
      });
      await expect(
        roofer.as.mutation(api.marketplace.claim, {
          leadId,
          organizationId: roofer.organizationId,
        }),
      ).rejects.toThrow(/Pro plan/);

      // Opening a plan area starts the 30-day trial.
      expect(
        await roofer.as.mutation(api.marketplace.ensurePlan, {
          organizationId: roofer.organizationId,
        }),
      ).toMatchObject({
        status: "trial",
        active: true,
        claimsLeft: 10,
        nextClaimCents: 0,
        nextChargeAt: "2026-11-08T12:00:00.000Z",
      });
      const pool = await older(roofer);
      expect(pool.locked).toBe(false);
      expect(pool.leads[0]).toMatchObject({
        id: leadId,
        city: "Midland",
        summary: "Hail damage",
        ageDays: 8,
        matchesTrades: true,
      });
      expect(JSON.stringify(pool)).not.toMatch(/Jane|Cole/);

      // Claiming is free while the allowance lasts, and the lead is theirs alone.
      expect(
        await roofer.as.mutation(api.marketplace.claim, {
          leadId,
          organizationId: roofer.organizationId,
        }),
      ).toMatchObject({ priceCents: 0, claimsLeft: 9 });
      expect((await wallet(roofer)).balanceCents).toBe(30000);
      const mine = await roofer.as.query(api.leads.list, {
        organizationId: roofer.organizationId,
      });
      expect(mine[0]).toMatchObject({
        name: "Jane Cole",
        pricePaidCents: 0,
        wonVia: "claim",
      });
      await rival.as.mutation(api.marketplace.ensurePlan, {
        organizationId: rival.organizationId,
      });
      await expect(
        rival.as.mutation(api.marketplace.claim, {
          leadId,
          organizationId: rival.organizationId,
        }),
      ).rejects.toThrow(/just claimed/);

      // Past the allowance each claim costs the extra price.
      await admin.as.mutation(api.marketplace.setPlan, {
        organizationId: roofer.organizationId,
        claimsIncluded: 1,
      });
      const another = await admin.as.mutation(api.marketplace.createLead, {
        data: { name: "Omar Haddad", city: "Odessa", jobType: "roofing" },
      });
      vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
      await t.mutation(internal.marketplace.ageLeads, {});
      expect((await older(roofer)).plan).toMatchObject({
        claimsLeft: 0,
        nextClaimCents: 1500,
      });
      expect(
        await roofer.as.mutation(api.marketplace.claim, {
          leadId: another!._id,
          organizationId: roofer.organizationId,
        }),
      ).toMatchObject({ priceCents: 1500 });
      expect((await wallet(roofer)).balanceCents).toBe(30000 - 1500);

      // When the trial runs out the pool locks again.
      vi.setSystemTime(new Date("2026-11-09T12:00:00.000Z"));
      expect(await older(roofer)).toMatchObject({
        locked: true,
        plan: { status: "trial", active: false },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("starting the plan charges the month from the balance, and the fee recurs until the balance runs dry", async () => {
    try {
      const { t, admin, roofer, rival } = await market();
      // $300 covers a $120 fee twice; a company that can't cover it can't start.
      await admin.as.mutation(api.marketplace.setPlan, {
        organizationId: roofer.organizationId,
        monthlyCents: 12000,
      });
      expect(
        await roofer.as.mutation(api.marketplace.startPlan, {
          organizationId: roofer.organizationId,
        }),
      ).toMatchObject({
        status: "active",
        active: true,
        monthlyCents: 12000,
        nextChargeAt: "2026-11-01T12:00:00.000Z",
      });
      expect((await wallet(roofer)).balanceCents).toBe(30000 - 12000);
      expect((await wallet(roofer)).transactions[0]).toMatchObject({
        type: "plan",
        amountCents: -12000,
        note: "Pro plan",
      });
      await admin.as.mutation(api.marketplace.setPlan, {
        organizationId: rival.organizationId,
        monthlyCents: 40000,
      });
      await expect(
        rival.as.mutation(api.marketplace.startPlan, {
          organizationId: rival.organizationId,
        }),
      ).rejects.toThrow(/Balance too low/);

      // Not due yet, then due: the daily charge posts and resets the allowance.
      await admin.as.mutation(api.marketplace.setPlan, {
        organizationId: roofer.organizationId,
        claimsIncluded: 10,
      });
      vi.setSystemTime(new Date("2026-10-31T12:00:00.000Z"));
      expect(await t.mutation(internal.marketplace.chargePlans, {})).toEqual({
        charged: 0,
        pastDue: 0,
      });
      vi.setSystemTime(new Date("2026-11-01T12:30:00.000Z"));
      expect(await t.mutation(internal.marketplace.chargePlans, {})).toEqual({
        charged: 1,
        pastDue: 0,
      });
      expect((await wallet(roofer)).balanceCents).toBe(30000 - 2 * 12000);
      expect((await wallet(roofer)).plan).toMatchObject({
        status: "active",
        nextChargeAt: "2026-12-01T12:30:00.000Z",
      });

      // The third month can't be covered: past due, locked, and it retries daily.
      vi.setSystemTime(new Date("2026-12-01T13:00:00.000Z"));
      expect(await t.mutation(internal.marketplace.chargePlans, {})).toEqual({
        charged: 0,
        pastDue: 1,
      });
      expect((await wallet(roofer)).balanceCents).toBe(30000 - 2 * 12000);
      expect((await older(roofer)).locked).toBe(true);
      await admin.as.mutation(api.marketplace.recordTopUp, {
        organizationId: roofer.organizationId,
        amount: 100,
      });
      expect(await t.mutation(internal.marketplace.chargePlans, {})).toEqual({
        charged: 1,
        pastDue: 0,
      });
      expect((await wallet(roofer)).plan).toMatchObject({ status: "active" });

      // Cancelling keeps the plan to the end of the paid month.
      expect(
        await roofer.as.mutation(api.marketplace.cancelPlan, {
          organizationId: roofer.organizationId,
        }),
      ).toMatchObject({ status: "cancelled", active: true });
      vi.setSystemTime(new Date("2027-01-02T12:00:00.000Z"));
      expect(await t.mutation(internal.marketplace.chargePlans, {})).toEqual({
        charged: 0,
        pastDue: 0,
      });
      expect((await wallet(roofer)).plan).toMatchObject({
        status: "cancelled",
        active: false,
      });

      // The admin can comp a company: active at $0, no charge ever.
      expect(
        await admin.as.mutation(api.marketplace.setPlan, {
          organizationId: rival.organizationId,
          status: "active",
          monthlyCents: 0,
        }),
      ).toMatchObject({ status: "active", active: true });
      const companies = await admin.as.query(
        api.marketplace.companiesOverview,
        {},
      );
      expect(
        companies.find((c) => c.id === rival.organizationId)?.plan,
      ).toMatchObject({ status: "active", monthlyCents: 0 });
      vi.setSystemTime(new Date("2027-02-03T12:00:00.000Z"));
      expect(await t.mutation(internal.marketplace.chargePlans, {})).toEqual({
        charged: 1,
        pastDue: 0,
      });
      expect((await wallet(rival)).balanceCents).toBe(30000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("working a lead from the card", () => {
  test("calls and texts are counted, and a note is stamped with the day and kept with the notes", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@example.com");
    const lead = await owner.as.mutation(api.leads.create, {
      organizationId: owner.organizationId,
      data: {
        name: "Cari Doguet",
        phone: "(432) 260-0076",
        notes: "What do you need? Irrigation",
      },
    });
    expect(lead!.contacts).toBeUndefined();
    expect(lead!.lastContactAt).toBeUndefined();
    const called = await owner.as.mutation(api.leads.logContact, {
      id: lead!._id,
      kind: "call",
    });
    expect(called).toMatchObject({
      contacts: 1,
      lastContactAt: expect.any(String),
    });
    const texted = await owner.as.mutation(api.leads.logContact, {
      id: lead!._id,
      kind: "text",
    });
    expect(texted).toMatchObject({ contacts: 1, texts: 1 });
    const noted = await owner.as.mutation(api.leads.logContact, {
      id: lead!._id,
      kind: "note",
      note: "left VM",
    });
    expect(noted).toMatchObject({ contacts: 1, texts: 1 });
    expect(noted!.notes).toMatch(
      /^What do you need\? Irrigation\n[A-Z][a-z]{2} \d{1,2}: left VM$/,
    );
    await expect(
      owner.as.mutation(api.leads.logContact, {
        id: lead!._id,
        kind: "note",
        note: "  ",
      }),
    ).rejects.toThrow(/Type a note/);
    // Someone outside the company can't touch it.
    const stranger = await signUp(t, "stranger@example.com");
    await expect(
      stranger.as.mutation(api.leads.logContact, {
        id: lead!._id,
        kind: "call",
      }),
    ).rejects.toThrow();
  });

  test("moving a lead past No Answer stamps its first contact when none was logged", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@example.com");
    const lead = await owner.as.mutation(api.leads.create, {
      organizationId: owner.organizationId,
      data: { name: "Pat Lee" },
    });
    const noAnswer = await owner.as.mutation(api.leads.update, {
      id: lead!._id,
      data: { status: "no_answer" },
    });
    expect(noAnswer!.lastContactAt).toBeUndefined();
    const contacted = await owner.as.mutation(api.leads.update, {
      id: lead!._id,
      data: { status: "contacted" },
    });
    expect(contacted!.lastContactAt).toEqual(expect.any(String));
    expect(contacted!.contacts).toBeUndefined();
    // A later stage change keeps the original stamp.
    const quoted = await owner.as.mutation(api.leads.update, {
      id: lead!._id,
      data: { status: "quoted" },
    });
    expect(quoted!.lastContactAt).toBe(contacted!.lastContactAt);
    // A logged call before the move is the stamp that stays.
    const other = await owner.as.mutation(api.leads.create, {
      organizationId: owner.organizationId,
      data: { name: "Sam Ro" },
    });
    const called = await owner.as.mutation(api.leads.logContact, {
      id: other!._id,
      kind: "call",
    });
    const moved = await owner.as.mutation(api.leads.update, {
      id: other!._id,
      data: { status: "scheduled" },
    });
    expect(moved!.lastContactAt).toBe(called!.lastContactAt);
  });
});

describe("landing page applications", () => {
  test("a company applies once; the owner approves it into a company with an invite, or declines", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@fieldquote.example", { role: "super_admin" });
    const staff = await signUp(t, "va@fieldquote.example", { role: "staff" });
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      await ctx.db.insert("industries", { slug: "painting", name: "Painting", display_order: 2, is_active: true, created_at: now, updated_at: now });
      await ctx.db.insert("industries", { slug: "concrete", name: "Concrete", display_order: 3, is_active: true, created_at: now, updated_at: now });
    });
    const options = await t.query(api.applications.options, {});
    expect(options.trades.map((x) => x.slug)).toEqual(["painting", "concrete"]);
    expect(options.counties.slice(0, 2)).toEqual(["Midland", "Ector"]);
    expect(options.westTexas).toContain("Howard");

    const form = { companyName: "Basin Paint Co.", contactName: "Ana Ruiz", email: "Ana@BasinPaint.example", phone: "(432) 555-0199", trades: ["painting", "bogus"], county: "Midland County" };
    await expect(t.mutation(api.applications.submit, { ...form, phone: "555" })).rejects.toThrow(/10-digit/);
    await expect(t.mutation(api.applications.submit, { ...form, county: "Nowhere" })).rejects.toThrow(/Texas county/);
    await expect(t.mutation(api.applications.submit, { ...form, trades: ["bogus"] })).rejects.toThrow(/one trade/);
    const first = await t.mutation(api.applications.submit, form);
    expect(first.duplicate).toBe(false);
    // Same phone or email while it waits: no second row.
    expect(await t.mutation(api.applications.submit, { ...form, email: "other@example.com" })).toEqual({ duplicate: true });
    expect(await t.mutation(api.applications.submit, { ...form, phone: "432-555-0100" })).toEqual({ duplicate: true });

    const waiting = await staff.as.query(api.applications.list, {});
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ companyName: "Basin Paint Co.", email: "ana@basinpaint.example", phone: "4325550199", trades: ["painting"], county: "Midland", status: "new" });
    await expect(t.query(api.applications.list, {})).rejects.toThrow(/signed in/);

    // Only the owner decides. Approving emails the applicant: sign in with that email and the company is waiting.
    await expect(staff.as.mutation(api.applications.approve, { id: waiting[0].id })).rejects.toThrow(/access|owner|admin/i);
    const emails: Array<{ to: string[]; subject: string; text: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        emails.push(JSON.parse(init.body as string));
        return { ok: true, status: 200, json: async () => ({ id: "em_1" }) };
      }),
    );
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("SITE_URL", "https://app.example");
    vi.useFakeTimers();
    let organizationId: Id<"organizations">;
    try {
      ({ organizationId } = await owner.as.mutation(api.applications.approve, { id: waiting[0].id }));
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
    // Two emails went out: the owner's "someone applied" from the submit, and the applicant's approval.
    expect(emails.map((e) => e.subject).sort()).toEqual(["Basin Paint Co. is approved on FieldQuote", "New lead buyer: Basin Paint Co. · Midland"]);
    const toOwner = emails.find((e) => e.subject.startsWith("New lead buyer"))!;
    expect(toOwner.to).toEqual(["owner@fieldquote.example"]);
    expect(toOwner.text).toContain("Approve or decline it: https://app.example/ops?tab=companies");
    const toAna = emails.find((e) => e.subject.startsWith("Basin Paint Co. is approved"))!;
    expect(toAna.to).toEqual(["ana@basinpaint.example"]);
    expect(toAna.text).toContain("Ana, Basin Paint Co. is approved to buy painting leads in Midland County.");
    expect(toAna.text).toContain("Sign in with this email (ana@basinpaint.example) at https://app.example");
    const company = await t.run((ctx) => ctx.db.get(organizationId));
    expect(company).toMatchObject({ name: "Basin Paint Co.", phone: "4325550199", email: "ana@basinpaint.example", leadTrades: ["painting"] });
    const invite = await t.run(async (ctx) => (await ctx.db.query("companyInvites").collect()).find((i) => i.organizationId === organizationId));
    expect(invite?.email).toBe("ana@basinpaint.example");
    expect(await staff.as.query(api.applications.list, {})).toHaveLength(0);
    await expect(owner.as.mutation(api.applications.approve, { id: waiting[0].id })).rejects.toThrow(/already decided/);

    // Applying again after a decision is allowed (a declined company can try later).
    const second = await t.mutation(api.applications.submit, { ...form, companyName: "Basin Paint Two" });
    expect(second.duplicate).toBe(false);
    await owner.as.mutation(api.applications.decline, { id: (second as { id: any }).id });
    expect(await staff.as.query(api.applications.list, {})).toHaveLength(0);
  });
});
