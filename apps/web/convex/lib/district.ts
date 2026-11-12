// Asking the appraisal district's public site about one Midland property (lib/parcels.ts MIDLAND_DEEDS): the page
// behind a property id, and who it says the owner is today. Kept apart from parcels.ts so the lookup (skipTrace.ts,
// in the Node runtime) can ask too.
import { MIDLAND_DEEDS, MIDLAND_PARCELS, districtProperty, nameKey, type DistrictProperty } from "./parcels";

export type Got = { html: string } | { none: string } | { refused: string };

/** One page from the district's site. `refused` when the site says to stop asking: nothing works around that. */
export async function districtGet(url: string): Promise<Got> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    return { none: e instanceof Error ? e.message : String(e) };
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) return { refused: `HTTP ${response.status}` };
  if (!response.ok) return { none: `HTTP ${response.status}` };
  return { html: await response.text() };
}

/** The same owner, however the roll splits two owners across its two fields or shortens the second. */
export function sameOwnerName(app: { owner: string; owner2?: string }, district: string): boolean {
  const [a, b, both] = [nameKey(app.owner), nameKey(district), nameKey(`${app.owner} ${app.owner2 ?? ""}`)];
  return a === b || both === b || (a.length >= 5 && b.startsWith(a)) || (b.length >= 5 && a.startsWith(b));
}

/** A property the district keeps a page for under this id: Midland's own numbering ("R000004331"). */
export const hasDistrictPage = (p: { county: string; cadId: string }) => p.county === MIDLAND_PARCELS.county && /^R\d{9}$/.test(p.cadId);

/**
 * Who the appraisal district says owns a Midland property today, where their bill goes, and when they bought it: the
 * city's layer the roll is read from runs about a year behind. Undefined when the page can't be read or the site says
 * no: whoever asked carries on with what they have, and nothing is tried again.
 */
export async function districtOwnerNow(cadId: string): Promise<{ owner: string; mailing: DistrictProperty["mailing"]; boughtOn?: string } | undefined> {
  const got = await districtGet(MIDLAND_DEEDS.page(cadId));
  const page = "html" in got ? districtProperty(got.html) : undefined;
  if (!page?.owner) return undefined;
  return { owner: page.owner, mailing: page.mailing, ...(page.deeds[0]?.date ? { boughtOn: page.deeds[0].date } : {}) };
}
