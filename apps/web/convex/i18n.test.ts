import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { langFromText, langOf, withLang } from "./lib/i18n";
import { fieldsFromPayload } from "./lib/intake";
import { setup, signUp } from "./test.setup";

const SIG = "data:image/png;base64,AAAA";

describe("the language a homeowner, client or crew member reads", () => {
  test("helpers: a form answer as a language, and links that carry it", () => {
    expect(langFromText("es")).toBe("es");
    expect(langFromText("Español")).toBe("es");
    expect(langFromText("spanish")).toBe("es");
    expect(langFromText("English")).toBe("en");
    expect(langFromText("")).toBeUndefined();
    expect(langFromText(null)).toBeUndefined();
    expect(langOf({ language: "es" })).toBe("es");
    expect(langOf({})).toBe("en");
    expect(langOf(null)).toBe("en");
    expect(withLang("https://x/share/estimate/abc", "es")).toBe("https://x/share/estimate/abc?lang=es");
    expect(withLang("https://x/p?a=1", "es")).toBe("https://x/p?a=1&lang=es");
    expect(withLang("https://x/p", "en")).toBe("https://x/p");
    expect(fieldsFromPayload({ full_name: "Ana", "What language do you prefer?": "Español" })).toMatchObject({ name: "Ana", language: "Español" });
    expect(fieldsFromPayload({ full_name: "Ana", idioma: "es" })).toMatchObject({ language: "es" });
  });

  test("a client's language rides on their record, into the estimate link's view, and can be flipped from the link", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "owner@peak.example");
    const client = (await as.mutation(api.clients.create, { organizationId, data: { name: "Ana Ruiz", language: "es" } }))!;
    expect(client.language).toBe("es");
    const estimate = (await as.mutation(api.estimates.create, {
      organizationId,
      data: { clientId: client._id, items: [{ description: "Paint", quantity: 1, unitPrice: 900, totalPrice: 900 }] },
    }))!;
    const token = await as.mutation(api.estimates.shareLink, { id: estimate._id });
    expect((await t.query(api.publicEstimates.get, { token }))!.client).toEqual({ name: "Ana Ruiz", language: "es" });

    // The homeowner flips the page to English: remembered for their emails and texts.
    await t.mutation(api.publicEstimates.setLanguage, { token, language: "en" });
    expect((await as.query(api.clients.get, { id: client._id }))!.language).toBe("en");
    await expect(t.mutation(api.publicEstimates.setLanguage, { token, language: "fr" })).rejects.toThrow(/English or Spanish/);
    await expect(t.mutation(api.publicEstimates.setLanguage, { token: "nope", language: "es" })).rejects.toThrow(/valid/);

    // The same from a change order's link, once the estimate is signed.
    await t.mutation(api.publicEstimates.accept, { token, signature: SIG });
    await as.mutation(api.estimates.update, {
      id: estimate._id,
      data: { items: [{ description: "Paint", quantity: 1, unitPrice: 950, totalPrice: 950 }] },
    });
    const order = await as.mutation(api.signoffs.request, { estimateId: estimate._id, kind: "change_order" });
    const view = (await t.query(api.signoffs.get, { token: order.token }))!;
    expect(view.clientLanguage).toBe("en");
    await t.mutation(api.signoffs.setLanguage, { token: order.token, language: "es" });
    expect((await t.query(api.signoffs.get, { token: order.token }))!.clientLanguage).toBe("es");
    expect((await as.query(api.clients.get, { id: client._id }))!.language).toBe("es");
  });

  test("refusals on the public pages carry a stable reason the page can show in Spanish", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "owner@peak.example");
    const estimate = (await as.mutation(api.estimates.create, {
      organizationId,
      data: { items: [{ description: "Paint", quantity: 1, unitPrice: 1, totalPrice: 1 }] },
    }))!;
    const token = await as.mutation(api.estimates.shareLink, { id: estimate._id });
    const reasonOf = async (work: Promise<unknown>) => {
      try {
        await work;
      } catch (err) {
        return err instanceof ConvexError ? (err.data as { reason?: string }).reason : undefined;
      }
      return "none";
    };
    expect(await reasonOf(t.mutation(api.publicEstimates.accept, { token: "nope", signature: SIG }))).toBe("link_invalid");
    expect(await reasonOf(t.mutation(api.publicEstimates.accept, { token, signature: " " }))).toBe("signature_required");
    await t.mutation(api.publicEstimates.accept, { token, signature: SIG });
    expect(await reasonOf(t.mutation(api.publicEstimates.decline, { token }))).toBe("estimate_closed");
    const affidavit = await as.mutation(api.signoffs.request, { estimateId: estimate._id, kind: "affidavit", completionDate: "2026-11-20" });
    expect(await reasonOf(t.mutation(api.signoffs.sign, { token: affidavit.token, signerName: "", signature: SIG }))).toBe("name_required");
    expect(await reasonOf(t.mutation(api.signoffs.sign, { token: affidavit.token, signerName: "Ana", signature: "" }))).toBe("signature_required");
    await t.mutation(api.signoffs.sign, { token: affidavit.token, signerName: "Ana", signature: SIG });
    expect(await reasonOf(t.mutation(api.signoffs.sign, { token: affidavit.token, signerName: "Ana", signature: SIG }))).toBe("already_signed");
    expect(await reasonOf(t.mutation(api.signoffs.sign, { token: "0".repeat(32), signerName: "Ana", signature: SIG }))).toBe("link_invalid");
  });

  test("crew carry a language; a lead's language reaches the company that buys it", async () => {
    const t = setup();
    const { as, organizationId } = await signUp(t, "owner@peak.example");
    const id = await as.mutation(api.crew.add, { organizationId, name: "Luis Ortega", language: "es" });
    expect((await as.query(api.crew.list, { organizationId }))[0]).toMatchObject({ name: "Luis Ortega", language: "es" });
    await as.mutation(api.crew.update, { id, name: "Luis Ortega", language: "en" });
    expect((await as.query(api.crew.list, { organizationId }))[0].language).toBe("en");
    const lead = (await as.mutation(api.leads.create, { organizationId, data: { name: "Ana Ruiz", language: "es" } }))!;
    expect(lead.language).toBe("es");
  });
});
