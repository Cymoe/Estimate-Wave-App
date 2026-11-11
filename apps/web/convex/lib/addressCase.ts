/**
 * The county rolls write addresses in capitals ("100 BIG SPRING ST",
 * "DALLAS"); people read "100 Big Spring St", "Dallas". Only text with no
 * lowercase letters is changed, so anything already written properly stays.
 * Directions, road prefixes (FM, IH, US…) and words with digits keep their
 * capitals; ordinals come out "1st", "22nd".
 */
const KEEP = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "PO", "FM", "IH", "US", "SH", "CR", "RR", "LP", "TX"]);

const word = (w: string) => {
  if (/^\d+(ST|ND|RD|TH)$/.test(w)) return w.toLowerCase();
  if (/\d/.test(w) || KEEP.has(w) || w.length === 1) return w;
  // "O'DONNELL" → "O'Donnell", "WINSTON-SALEM" → "Winston-Salem".
  return w.toLowerCase().replace(/(^|[-'])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
};

export function tidyCase(s: string): string;
export function tidyCase(s: string | undefined): string | undefined;
export function tidyCase(s: string | undefined): string | undefined {
  if (!s || /[a-z]/.test(s)) return s;
  return s.replace(/[A-Z0-9'-]+/g, word);
}
