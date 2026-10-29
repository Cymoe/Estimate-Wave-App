import { describe, expect, test } from "vitest";
import { homeownerText } from "./delivery";
import { estimateEmail } from "./estimateEmail";
import { reminderEmail } from "./followUps";

describe("what a homeowner or client is sent, in their language", () => {
  const base = {
    clientName: "Ana Ruiz",
    company: "Peak Roofing",
    number: "EST-1",
    title: "Re-roof",
    total: 9000,
    link: "https://app.example/share/estimate/abc",
  };

  test("the estimate email", () => {
    const en = estimateEmail(base);
    expect(en.subject).toBe("Your estimate from Peak Roofing");
    expect(en.text).toContain("Hi Ana,\n\nHere's your Re-roof (EST-1) from Peak Roofing, for $9,000.00.");
    expect(en.text).toContain("https://app.example/share/estimate/abc\n\n");
    expect(en.html).toContain(">View your estimate<");
    const es = estimateEmail({ ...base, lang: "es", message: "Gracias por recibirnos." });
    expect(es.subject).toBe("Tu presupuesto de Peak Roofing");
    expect(es.text).toBe(
      [
        "Hola Ana:",
        "Gracias por recibirnos.",
        "Aquí está tu Re-roof (EST-1) de Peak Roofing, por $9,000.00. Puedes revisarlo, aceptarlo y firmarlo aquí:",
        "https://app.example/share/estimate/abc?lang=es",
        "¿Preguntas? Responde a este correo y Peak Roofing te contestará.",
      ].join("\n\n"),
    );
    expect(es.html).toContain('href="https://app.example/share/estimate/abc?lang=es"');
    expect(es.html).toContain(">Ver tu presupuesto<");
  });

  test("the reminder", () => {
    expect(reminderEmail({ ...base, opened: true }).text).toContain("When you're ready, you can accept and sign it here:");
    const es = reminderEmail({ ...base, opened: false, lang: "es" });
    expect(es.subject).toBe("Tu presupuesto de Peak Roofing");
    expect(es.text).toContain("Puedes revisarlo y firmarlo aquí:\n\nhttps://app.example/share/estimate/abc?lang=es");
  });

  test("the text once a company has their request, under 160 characters either way", () => {
    const r = { tradeName: "Roofing", company: { name: "Peak Roofing", phone: "432-555-0100" } };
    const en = homeownerText({ ...r, lead: {} });
    expect(en).toBe("Webb Leads: your roofing request was matched. Peak Roofing will call you from 432-555-0100. Reply STOP to opt out");
    const es = homeownerText({ ...r, lead: { language: "es" } });
    expect(es).toBe(
      "Webb Leads: tu solicitud de roofing fue asignada. Peak Roofing te llamará desde el 432-555-0100. Responde STOP para no recibir más mensajes",
    );
    expect(en.length).toBeLessThanOrEqual(160);
    expect(es.length).toBeLessThanOrEqual(160);
    expect(homeownerText({ ...r, company: { name: "Peak Roofing" }, lead: { language: "es" } })).toContain("te llamará pronto.");
  });
});
