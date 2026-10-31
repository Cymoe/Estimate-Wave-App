// Working out which town a lead is in from what we already have: a city the
// form sent, a town named in the address, or the zip code.

/** Towns around the Permian Basin, longest names first so "Big Spring" wins over "Spring". */
const TOWNS = [
  "Big Spring",
  "Gardendale",
  "Greenwood",
  "Monahans",
  "Seminole",
  "Andrews",
  "Midland",
  "Odessa",
  "Stanton",
  "Lamesa",
  "Kermit",
  "Del Rio",
  "Pecos",
  "Crane",
  "Jal",
].sort((a, b) => b.length - a.length);

/** Zip codes (by first five digits) for the towns above. */
const ZIP_TOWNS: Array<[RegExp, string]> = [
  [/^797(0\d|1[0-2])$/, "Midland"],
  [/^7976\d$/, "Odessa"],
  [/^79714$/, "Andrews"],
  [/^7972[01]$/, "Big Spring"],
  [/^79772$/, "Pecos"],
  [/^79756$/, "Monahans"],
  [/^79745$/, "Kermit"],
  [/^79782$/, "Stanton"],
  [/^79758$/, "Gardendale"],
  [/^79360$/, "Seminole"],
  [/^79331$/, "Lamesa"],
  [/^79731$/, "Crane"],
];

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** A town named in a city field, as a whole word ("116 Midland" → Midland). */
function townIn(text: string): string | undefined {
  const lower = text.toLowerCase();
  return TOWNS.find((town) => new RegExp(`(^|[^a-z])${town.toLowerCase()}([^a-z]|$)`).test(lower));
}

/**
 * A town at the end of an address ("1658 n Tripp Odessa", "12 Main St, Midland, TX 79705").
 * Only the end counts, so a street like "Crane Ave" isn't taken for the town.
 */
function townAtEnd(address: string): string | undefined {
  const parts = address
    .toLowerCase()
    .split(",")
    .map((part) => part.replace(/\b(tx|texas)\b/g, "").replace(/\b\d{5}(-\d{4})?\b/g, "").trim())
    .filter(Boolean);
  for (const part of parts.reverse()) {
    const town = TOWNS.find((t) => new RegExp(`(^|[^a-z])${t.toLowerCase()}$`).test(part));
    if (town) return town;
    if (parts.length > 1) break; // with commas, the town is its own last part
  }
  return undefined;
}

/**
 * The lead's town from the form's city, the address text or a zip code in the
 * address, or undefined when none of them says.
 */
export function cityFromText(address?: string, formCity?: string): string | undefined {
  const city = formCity?.trim();
  if (city) return townIn(city) ?? titleCase(city);
  if (!address) return undefined;
  const named = townAtEnd(address);
  if (named) return named;
  const zip = address.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/)?.[1];
  return zip ? ZIP_TOWNS.find(([pattern]) => pattern.test(zip))?.[1] : undefined;
}

/** The area searched for street-only addresses: Midland, Odessa and the towns around them. */
export const SEARCH_AREA = { west: -103.2, north: 32.6, east: -101.3, south: 31.3 };

/**
 * Picks the town from map search results: only when every result agrees, so a
 * street that exists in both Midland and Odessa stays unset for you to choose.
 */
export function cityFromSearch(results: Array<{ address?: Record<string, string> }>): string | undefined {
  const towns = new Set(
    results
      .map(({ address = {} }) => address.city ?? address.town ?? address.village ?? address.hamlet)
      .filter((town): town is string => Boolean(town))
      .map(titleCase),
  );
  return towns.size === 1 ? [...towns][0] : undefined;
}
