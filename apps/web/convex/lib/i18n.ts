// The languages a homeowner, client or crew member can be spoken to in.
// The contractor's own app stays English; this is for the pages, emails and
// texts that go to the people they work with and for.

export type Lang = "en" | "es";

export const LANGS: Lang[] = ["en", "es"];

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "es";
}

/** The language on a record, English when none is set. */
export function langOf(doc: { language?: string } | null | undefined): Lang {
  return doc?.language === "es" ? "es" : "en";
}

/**
 * A form answer as a language: "es", "Español", "Spanish", "spa"… read as
 * Spanish; anything else as English; nothing when the answer is empty.
 */
export function langFromText(value: unknown): Lang | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim().toLowerCase();
  if (!s) return undefined;
  return /^(es|esp|spa)/.test(s) || /español|espanol|spanish/.test(s) ? "es" : "en";
}

/** `?lang=es` on a link when the person reads Spanish. */
export function withLang(url: string, lang: Lang): string {
  if (lang === "en") return url;
  return `${url}${url.includes("?") ? "&" : "?"}lang=es`;
}
