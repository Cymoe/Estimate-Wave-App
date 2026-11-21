// Midland's properties from the appraisal district's own files, posted on its Open Records page
// (https://midcad.org/open-records/): the certified roll, one row for every account with its owner, where the tax
// bill goes, the state's property-type code, values and deed; and the "web file", the tables behind the district's
// website (every building with its type, every sale with who conveyed it). They are the district's records whole,
// keyed by its account number ("R000004331"), where the city's map (lib/parcels.ts MIDLAND_PARCELS) is a copy about a
// year behind with one parcel in twenty blank. Posted about twice a year, so the live page (parcels.ts refreshOwners)
// still says who bought since. Pure: finding the files, reading their rows, and what makes an account a parcel.
//
// The roll also carries each owner's date of birth. It is never read here.
import { addressKey, codeFromBuildings, isCommercialUse, isCompanyOwner, isMultifamilyUse, isResidentialUse, looseKey, ownerOccupied, ownerOf, streetKey, type DeedRow, type ParcelRow } from "./parcels";

export const DISTRICT_ROLL = {
  source: "midland-district-roll",
  /** Where the files are linked from; the links change with each posting. */
  page: "https://midcad.org/open-records/",
} as const;

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * The newest certified real-property roll and the newest web file linked on the Open Records page, by the year in
 * each link's words ("2026 Midland Certified Real Property Roll", "2026 MCAD Web File").
 */
export function rollLinks(html: string): { roll?: string; web?: string } {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+\.zip)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ url: m[1], words: plain(m[2]) }));
  const newest = (is: (words: string) => boolean) =>
    links
      .filter((l) => is(l.words) && /\b20\d\d\b/.test(l.words))
      .sort((a, b) => Number(b.words.match(/\b20\d\d\b/)![0]) - Number(a.words.match(/\b20\d\d\b/)![0]))[0]?.url;
  return {
    roll: newest((w) => /certified/i.test(w) && /\breal\b/i.test(w) && !/mineral|personal|preliminary|bpp/i.test(w)),
    web: newest((w) => /\bweb file\b/i.test(w)),
  };
}

/** The roll's own table inside its zip: "… CERTIFIED COLLECTORS.txt", beside its agent, entity and layout files. */
export const isRollTable = (name: string) => /COLLECTORS\.txt$/i.test(name);
export const WEB_BUILDINGS = "export_webbld.txt";
export const WEB_SALES = "export_websale.txt";

/**
 * A string of its own. A piece cut from a line of a file keeps the whole stretch of the file it was cut from in
 * memory with it; kept by the hundred thousand, that is the file itself (350 MB of roll). Copied, it is only its
 * own few letters.
 */
const own = (s: string) => (s.length < 2 ? s : Array.from(s).join(""));
const squash = (s: string | undefined) => own((s ?? "").replace(/\s+/g, " ").trim());
const cents = (dollars: number) => (dollars > 0 ? Math.round(dollars * 100) : undefined);
const COMPASS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

/** "6/1/2023 12:00:00 AM" → "2023-06-01". The district writes 1/1/1900 for no date; a year past this one is a typo. */
export function rollDate(value: string | undefined, now = Date.now()): string | undefined {
  const m = (value ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  const year = Number(m[3]);
  if (year <= 1900 || year > new Date(now).getUTCFullYear()) return undefined;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** One account as the roll has it, before it's known whether it is a parcel to keep. */
export type RollAccount = {
  cadId: string;
  /** The district's own id for the owner, the same on everything they hold under that name and address. */
  ownerId?: string;
  owner: string;
  owner2?: string;
  mailing: ParcelRow["mailing"];
  /** The property's address as the app writes one; none when the district has no street for it. */
  site?: string;
  /** The address starts with a house number. */
  numbered: boolean;
  /** The state's property-type code ("A1" a house, "F1" commercial, "C1" a vacant lot). */
  stateCode: string;
  marketCents?: number;
  buildingCents?: number;
  deedDate?: string;
  /** The share of the property this account is: under 1 when the ownership is split across accounts. */
  interest: number;
  /** The district's mail to this owner has come back. */
  returnedMail: boolean;
  /** The owner has a homestead exemption here: they live in it. */
  homestead: boolean;
};

/** The roll's columns by name, from its first line ("collector_id|collector_yr|…"). */
export function rollColumns(header: string): Record<string, number> {
  return Object.fromEntries(header.split("|").map((name, i) => [name.trim().replace(/^collector_/, ""), i]));
}

/**
 * One line of the roll as an account. Only real property ("R…" ids; the roll also lists minerals, equipment and
 * mobile homes on rented lots), and not an owner the district keeps confidential. Nothing without an owner.
 */
export function rollAccount(line: string, columns: Record<string, number>, now = Date.now()): RollAccount | undefined {
  const cells = line.split("|");
  const get = (name: string) => squash(cells[columns[name]]);
  const cadId = get("id");
  if (!/^R\d{9}$/.test(cadId) || get("confidential").toUpperCase() === "Y") return undefined;
  const named = ownerOf(get("name").toUpperCase().replace(/\s+AND$/, ""));
  if (!named) return undefined;
  const owner = own(named);
  // Where the bill goes: the street is the last line filled in. A line before it is a suite, a second owner
  // ("& TAMI ROBERTSON") or who it's care of.
  const lines = [get("addr1"), get("addr2"), get("addr3")].map((l) => l.toUpperCase());
  const last = lines.reduce((at, l, i) => (l ? i : at), -1);
  const before = lines.slice(0, Math.max(last, 0)).filter(Boolean);
  const suite = before.find((l) => /^(STE|SUITE|APT|UNIT|BLDG|#)\b/.test(l));
  const also = before.find((l) => l.startsWith("&"))?.replace(/^&\s*/, "");
  const street = last >= 0 ? squash([lines[last], suite].filter(Boolean).join(" ")) : undefined;
  const zip = get("zip").match(/^\d{5}/)?.[0];
  const mailing = Object.fromEntries(Object.entries({ address: street, city: get("city").toUpperCase(), state: get("state").toUpperCase(), zip }).filter(([, v]) => v)) as ParcelRow["mailing"];
  const number = Number(get("strnum")) > 0 ? String(Number(get("strnum"))) : undefined;
  const dir = get("strdir").toUpperCase();
  // A numbered road is zero-padded at the district ("FM RD 00307").
  const road = get("street").toUpperCase().replace(/\b0+(\d)/g, "$1");
  const site = road ? squash([number, COMPASS.has(dir) ? dir : undefined, road].filter(Boolean).join(" ")) : undefined;
  const dollars = (name: string) => Number(get(name)) || 0;
  const building = dollars("imphs") + dollars("impnonhs");
  const second = [ownerOf(get("xname").toUpperCase()) ?? also].map((x) => (x ? own(x) : x))[0];
  const ownerId = get("ownerid");
  return {
    cadId,
    ...(ownerId ? { ownerId } : {}),
    owner,
    // A care-of line ("C/O KO STORAGE") isn't a second owner.
    ...(second && !/^(C\/O|%|ATTN)\b/.test(second) && second !== owner ? { owner2: second } : {}),
    mailing,
    ...(site ? { site } : {}),
    numbered: Boolean(site && number),
    stateCode: [get("ptdimpnonhs"), get("ptdimphs"), get("ptdlndnonhs"), get("ptdlndhs")].find(Boolean)?.toUpperCase() ?? "",
    ...(cents(building + dollars("lndhs") + dollars("lndnonhs") + dollars("prdmkt")) ? { marketCents: cents(building + dollars("lndhs") + dollars("lndnonhs") + dollars("prdmkt")) } : {}),
    ...(cents(building) ? { buildingCents: cents(building) } : {}),
    ...(rollDate(get("deeddate"), now) ? { deedDate: rollDate(get("deeddate"), now) } : {}),
    interest: Number(get("interest")) > 0 ? Number(get("interest")) : 1,
    returnedMail: Boolean(get("undelcd")),
    homestead: Boolean(get("hscode")),
  };
}

/** A building in the web file: whose it is and its type ("RES", "COMM", "WHSE", "MH"). Only the first columns are read: a description further along can hold a comma. */
export function buildingRow(line: string): { cadId: string; code: string } | undefined {
  const cells = line.split(",", 4);
  const code = squash(cells[3]).toUpperCase();
  return /^R\d{9}$/.test(cells[0] ?? "") && code ? { cadId: own(cells[0]), code } : undefined;
}

/**
 * A sale in the web file: who conveyed the property, when, and the deed's number. The name sits between the sixth
 * comma and the last, since a name can hold a comma of its own ("CRYSTAL CABINETS, INC").
 */
export function saleRow(line: string, now = Date.now()): { cadId: string; seq: number; deed: DeedRow } | undefined {
  const cells = line.split(",");
  if (cells.length < 8 || !/^R\d{9}$/.test(cells[0])) return undefined;
  const seller = ownerOf(cells.slice(6, -1).join(",").toUpperCase());
  if (!seller) return undefined;
  const date = rollDate(cells[3], now) ?? rollDate(cells[2], now);
  const instrument = squash(cells[cells.length - 1]);
  return { cadId: own(cells[0]), seq: Number(cells[1]) || 0, deed: { seller: own(seller), ...(date ? { date } : {}), ...(instrument && instrument !== "0" ? { instrument } : {}) } };
}

/** How many earlier owners are kept for a property. */
const DEEDS_KEEP = 12;

/** A property's sales as its deed history: newest first, the same deed once (the file repeats some). */
export function deedsOf(sales: Array<{ seq: number; deed: DeedRow }>): DeedRow[] {
  const sorted = [...sales].sort((a, b) => (b.deed.date ?? "").localeCompare(a.deed.date ?? "") || a.seq - b.seq).map((s) => s.deed);
  return sorted.filter((d, i) => i === 0 || d.seller !== sorted[i - 1].seller || d.date !== sorted[i - 1].date).slice(0, DEEDS_KEEP);
}

/** The building types that are somewhere to live. */
const DWELLINGS = ["RES", "RES2", "MH"];

/**
 * What an account is kept as: its state code when that is a home, apartments or a commercial building; for any other
 * code (a house on farm land is filed as the farm, some accounts have no code), a home when there is a dwelling
 * built on it. Vacant land, and land with only a barn or a shed, isn't kept.
 */
export function keptUse(account: Pick<RollAccount, "stateCode" | "buildingCents">, buildings: string[]): string | undefined {
  const code = account.stateCode;
  if (isResidentialUse(code) || isMultifamilyUse(code) || isCommercialUse(code)) return code;
  if (!account.buildingCents) return undefined;
  return codeFromBuildings(buildings.filter((b) => DWELLINGS.includes(b)).map((b) => (b === "RES2" ? "RES" : b)));
}

export type RollParcel = {
  row: ParcelRow;
  deeds: DeedRow[];
  ownerId?: string;
  /** The types of the buildings on it, each once. */
  buildings: string[];
  returnedMail: boolean;
  /** Every account that is this property: more than one when the ownership is split across accounts. */
  accounts: string[];
};

/** How many building types are kept for a property. */
const BUILDINGS_KEEP = 16;

/**
 * The roll's accounts as parcels: the ones worth keeping (keptUse) that have a street. One owner's accounts at one
 * address, each a share of the property (two half-interest accounts at 200 S Norman), are one parcel under the
 * lowest account number, its values added up.
 */
export function rollParcels(accounts: RollAccount[], buildingsOf: (cadId: string) => string[], deedsFor: (cadId: string) => DeedRow[]): RollParcel[] {
  const out: RollParcel[] = [];
  const shared = new Map<string, RollParcel>();
  for (const a of [...accounts].sort((x, y) => x.cadId.localeCompare(y.cadId))) {
    const buildings = [...new Set(buildingsOf(a.cadId))].sort();
    const useCode = keptUse(a, buildings);
    if (!useCode || !a.site) continue;
    const share = a.interest < 1 ? `${a.ownerId ?? a.owner}|${addressKey(a.site)}` : undefined;
    const first = share ? shared.get(share) : undefined;
    if (first) {
      first.accounts.push(a.cadId);
      first.row.marketValueCents = (first.row.marketValueCents ?? 0) + (a.marketCents ?? 0) || undefined;
      first.row.buildingValueCents = (first.row.buildingValueCents ?? 0) + (a.buildingCents ?? 0) || undefined;
      first.buildings = [...new Set([...first.buildings, ...buildings])].sort().slice(0, BUILDINGS_KEEP);
      continue;
    }
    const parcel: RollParcel = {
      row: {
        cadId: a.cadId,
        useCode,
        siteAddress: a.site,
        addressKey: addressKey(a.site),
        looseKey: looseKey(a.site),
        ...(streetKey(a.site) ? { street: streetKey(a.site) } : {}),
        owner: a.owner,
        ...(a.owner2 ? { owner2: a.owner2 } : {}),
        mailing: a.mailing,
        ownerOccupied: a.homestead || (a.numbered && ownerOccupied(a.site, a.mailing.address)),
        companyOwned: isCompanyOwner(a.owner),
        ...(a.marketCents ? { marketValueCents: a.marketCents } : {}),
        ...(a.buildingCents ? { buildingValueCents: a.buildingCents } : {}),
        ...(a.deedDate ? { deedDate: a.deedDate } : {}),
      },
      deeds: deedsFor(a.cadId),
      ...(a.ownerId ? { ownerId: a.ownerId } : {}),
      buildings: buildings.slice(0, BUILDINGS_KEEP),
      returnedMail: a.returnedMail,
      accounts: [a.cadId],
    };
    out.push(parcel);
    if (share) shared.set(share, parcel);
  }
  return out;
}
