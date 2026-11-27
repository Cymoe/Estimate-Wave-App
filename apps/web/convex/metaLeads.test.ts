import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Meta form leads into intake", () => {
  test("each new lead from the Page's forms comes into intake once, with its answers; a later look takes only newer ones", async () => {
    const t = setup();
    vi.stubEnv("META_ACCESS_TOKEN", "sys");
    await t.run(async (ctx) => {
      await ctx.db.insert("adSettings", { pageId: "55", weeklyEnabled: false, hooksPerWeek: 2, liveTarget: 6, updatedAt: new Date().toISOString() });
    });
    const seen: string[] = [];
    const lead = {
      id: "lead-1",
      created_time: "2026-11-27T01:00:00+0000",
      ad_name: "WL_49zdf8_916_20261126_2",
      campaign_name: "GoodFit Pros – Leads",
      field_data: [
        { name: "full_name", values: ["Dana Ruiz"] },
        { name: "phone_number", values: ["+14325550101"] },
        { name: "email", values: ["dana@example.com"] },
        { name: "zip_code", values: ["79705"] },
        { name: "work", values: ["Cabinets"] },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        seen.push(url);
        const json = (b: unknown) => new Response(JSON.stringify(b));
        if (url.includes("/me/accounts")) return json({ data: [{ id: "55", access_token: "page" }] });
        if (url.includes("/55/leadgen_forms")) return json({ data: [{ id: "f9", name: "GoodFit Pros – Free painting quote" }] });
        if (url.includes("/f9/leads")) return json({ data: [lead] });
        return new Response("{}", { status: 404 });
      }),
    );
    expect(await t.action(internal.metaLeads.pull, {})).toEqual({ taken: 1, repeats: 0 });
    const rows = await t.run(async (ctx) => await ctx.db.query("intakeLeads").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "meta", name: "Dana Ruiz", email: "dana@example.com", zip: "79705", scope: "Cabinets", externalId: "lead-1", formId: "f9" });
    // The forms are read with the Page's token.
    expect(seen.find((u) => u.includes("/f9/leads"))).toContain("access_token=page");
    // A second look: the same lead is a repeat, not a second lead, and it asks only from about the last one on.
    expect(await t.action(internal.metaLeads.pull, {})).toEqual({ taken: 0, repeats: 1 });
    expect(await t.run(async (ctx) => (await ctx.db.query("intakeLeads").collect()).length)).toBe(1);
    const filter = decodeURIComponent(seen.filter((u) => u.includes("/f9/leads")).at(-1)!);
    expect(filter).toContain(String(Math.floor(Date.parse("2026-11-27T01:00:00Z") / 1000) - 60));
  });

  test("with no token or no Page, nothing is asked", async () => {
    const t = setup();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await t.action(internal.metaLeads.pull, {})).toEqual({ taken: 0, repeats: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
