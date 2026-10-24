// How a company reaches FieldQuote about a lead: one place, read by the app
// (the bad-lead line, Contact Support) and by the emails it sends. Add a
// phone number here and every one of them shows it.

export const SUPPORT_EMAIL = "leads@fieldquote.app";
/** A number companies can call or text, e.g. "(432) 555-0100". Empty: email only. */
export const SUPPORT_PHONE = "";
/** How long after a sale a bad lead can be reported for a credit. */
export const CREDIT_WINDOW_DAYS = 3;

/** "Wrong number or not a real job? Tell FieldQuote within 3 days: (432) 555-0100 · leads@fieldquote.app" */
export function badLeadLine(): string {
  const how = [SUPPORT_PHONE, SUPPORT_EMAIL].filter(Boolean).join(" · ");
  return `Wrong number or not a real job? Tell FieldQuote within ${CREDIT_WINDOW_DAYS} days: ${how}`;
}
