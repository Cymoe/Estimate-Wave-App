/** A US mobile as the sheet, a form or Meta wrote it, normalised to E.164 (+1XXXXXXXXXX); undefined when it isn't ten US digits. */
export function usMobile(raw: string | undefined | null): string | undefined {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? `+1${digits}` : undefined;
}

/** "+14325550177" the way people write it: "(432) 555-0177". Anything else comes back as given. */
export function prettyPhone(stored: string | undefined | null): string {
  const d = (stored ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (stored ?? "");
}
