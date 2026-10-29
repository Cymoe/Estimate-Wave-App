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

/** The emails and texts a homeowner or client gets, in their language. */
const en = {
  hi: (first?: string) => (first ? `Hi ${first},` : "Hi,"),
  estimateWhat: (number: string, title?: string) => (title ? `${title} (${number})` : `estimate ${number}`),
  estimateSubject: (company: string) => `Your estimate from ${company}`,
  estimateBody: (what: string, company: string, total: string) =>
    `Here's your ${what} from ${company}, for ${total}. You can look it over, and accept and sign it, here:`,
  estimateButton: "View your estimate",
  questions: (company: string) => `Questions? Reply to this email and ${company} will get back to you.`,
  reminderBody: (what: string, company: string, total: string) => `Just checking in on your ${what} from ${company}, for ${total}.`,
  reminderOpened: "When you're ready, you can accept and sign it here:",
  reminderUnopened: "You can look it over and sign it here:",
  matched: (trade: string, company: string, phone?: string) =>
    `Webb Leads: your ${trade} request was matched. ${company} will call you${phone ? ` from ${phone}` : " shortly"}. Reply STOP to opt out`,
};

const es: typeof en = {
  hi: (first) => (first ? `Hola ${first}:` : "Hola:"),
  estimateWhat: (number, title) => (title ? `${title} (${number})` : `presupuesto ${number}`),
  estimateSubject: (company) => `Tu presupuesto de ${company}`,
  estimateBody: (what, company, total) => `Aquí está tu ${what} de ${company}, por ${total}. Puedes revisarlo, aceptarlo y firmarlo aquí:`,
  estimateButton: "Ver tu presupuesto",
  questions: (company) => `¿Preguntas? Responde a este correo y ${company} te contestará.`,
  reminderBody: (what, company, total) => `Solo para dar seguimiento a tu ${what} de ${company}, por ${total}.`,
  reminderOpened: "Cuando estés listo, puedes aceptarlo y firmarlo aquí:",
  reminderUnopened: "Puedes revisarlo y firmarlo aquí:",
  matched: (trade, company, phone) =>
    `Webb Leads: tu solicitud de ${trade} fue asignada. ${company} te llamará${phone ? ` desde el ${phone}` : " pronto"}. Responde STOP para no recibir más mensajes`,
};

export const MESSAGES: Record<Lang, typeof en> = { en, es };

/** "$9,000.00", the same in both languages. */
export const money = (amount: number) => `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
