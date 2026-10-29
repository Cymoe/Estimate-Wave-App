// How a company reaches Webb Leads about a lead: one place, read by the app
// (the bad-lead line, Contact Support) and by the emails it sends. Add a
// phone number here and every one of them shows it.

export const SUPPORT_EMAIL = "leads@webbleads.com";
/**
 * The name a homeowner sees: on the ads, the lead form, the consent line
 * and the text after a sale. Webb Leads is the name contractors see. Set
 * CONSUMER_BRAND on the deployment once the consumer brand is named; until
 * then, and in the browser, it falls back to Webb Leads.
 */
export function consumerBrand(): string {
  const env = typeof process !== "undefined" ? process.env : undefined;
  return env?.CONSUMER_BRAND?.trim() || "Webb Leads";
}
/** A number companies can call or text, e.g. "(432) 555-0100". Empty: email only. */
export const SUPPORT_PHONE = "";
/** How long after a sale a bad lead can be reported for a credit. */
export const CREDIT_WINDOW_DAYS = 3;

/** "Wrong number or not a real job? Tell Webb Leads within 3 days: (432) 555-0100 · leads@webbleads.com" */
export function badLeadLine(): string {
  const how = [SUPPORT_PHONE, SUPPORT_EMAIL].filter(Boolean).join(" · ");
  return `Wrong number or not a real job? Tell Webb Leads within ${CREDIT_WINDOW_DAYS} days: ${how}`;
}
