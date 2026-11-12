// The appraisal district's own parcel file (midcad.org/mapping: "MidlandCAD2026.zip", an ArcGIS shapefile whose
// Ownership.dbf has every parcel with its owner, mailing address, deed date and values). It has an owner for every
// parcel, where the city's layer leaves about one in twenty blank, so it is what finds the properties the app lacks.
// It has no word on what a property is (its state code column is empty) and runs a few months behind, so each find
// is then read at the district's site for what is built on it and who owns it today (parcels.ts refreshOwners).
// Pure: finding the file's link, reading a zip's entry and a dBase table, and what makes a parcel a find.

export const DISTRICT_FILE = {
  source: "midland-district-file",
  /** The page the file is linked from; the link changes with each year's file. */
  page: "https://midcad.org/mapping/",
  entry: "Ownership.dbf",
} as const;

/** The newest "MidlandCAD<year>.zip" linked on the district's mapping page. */
export function fileLink(html: string): string | undefined {
  const links = [...html.matchAll(/href=["'](https:\/\/midcad\.org\/[^"']*\/MidlandCAD(\d{4})\.zip)["']/gi)].map((m) => ({ url: m[1], year: Number(m[2]) }));
  return links.sort((a, b) => b.year - a.year)[0]?.url;
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** One file inside a zip: how it is packed (0 stored as it is, 8 deflated) and its packed bytes. Undefined when the zip has no such file. */
export function zipEntry(zip: Uint8Array, name: string): { method: number; data: Uint8Array; size: number } | undefined {
  // The directory's end record is the last thing in the file, but for a comment after it.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (u32(zip, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return undefined;
  let at = u32(zip, end + 16);
  for (let n = u16(zip, end + 10); n > 0 && u32(zip, at) === 0x02014b50; n--) {
    const [nameLength, extraLength, commentLength] = [u16(zip, at + 28), u16(zip, at + 30), u16(zip, at + 32)];
    const entry = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    if (entry === name || entry.endsWith(`/${name}`)) {
      const local = u32(zip, at + 42);
      const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
      return { method: u16(zip, at + 10), data: zip.subarray(start, start + u32(zip, at + 20)), size: u32(zip, at + 24) };
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return undefined;
}

/**
 * Reads a dBase table as it arrives, a piece at a time (the district's is 220 MB unpacked: never held whole), calling
 * `each` with the wanted columns of every row, trimmed. Returns how many rows it read.
 */
export async function dbfEach(pieces: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, want: readonly string[], each: (row: Record<string, string>) => void): Promise<number> {
  const latin = new TextDecoder("latin1");
  let held = new Uint8Array(0);
  let columns: Array<{ name: string; at: number; length: number }> | undefined;
  let headerLength = 0;
  let rowLength = 0;
  let rows = 0;
  let total = 0;
  for await (const piece of pieces) {
    const joined = new Uint8Array(held.length + piece.length);
    joined.set(held);
    joined.set(piece, held.length);
    let at = 0;
    if (!columns) {
      if (joined.length < 32 || joined.length < u16(joined, 8)) {
        held = joined;
        continue;
      }
      total = u32(joined, 4);
      headerLength = u16(joined, 8);
      rowLength = u16(joined, 10);
      columns = [];
      // Each row starts with a one-byte deleted mark.
      let offset = 1;
      for (let f = 32; f + 32 <= headerLength && joined[f] !== 0x0d; f += 32) {
        const raw = joined.subarray(f, f + 11);
        const name = latin.decode(raw.subarray(0, raw.indexOf(0) < 0 ? 11 : raw.indexOf(0)));
        if (want.includes(name)) columns.push({ name, at: offset, length: joined[f + 16] });
        offset += joined[f + 16];
      }
      at = headerLength;
    }
    while (rows < total && at + rowLength <= joined.length) {
      // A row marked deleted ("*") isn't in the table any more.
      if (joined[at] !== 0x2a) {
        const row: Record<string, string> = {};
        for (const c of columns) row[c.name] = latin.decode(joined.subarray(at + c.at, at + c.at + c.length)).trim();
        each(row);
      }
      rows++;
      at += rowLength;
    }
    held = joined.subarray(at);
  }
  return rows;
}

/** The file's columns that are read. */
export const FILE_COLUMNS = ["map_id", "file_as_na", "situs_full", "imprv_val", "market"] as const;

export type FileFind = { cadId: string; siteAddress: string; marketValueCents?: number };

/**
 * A parcel in the file worth asking the district about: one with something built on it (an improvement value) and a
 * street to its name. Its address as the app writes one: no "0" for a missing house number, no zero-padded road
 * numbers ("FM RD 00307" is "FM RD 307").
 */
export function fileFind(row: Record<string, string>): FileFind | undefined {
  const cadId = row.map_id;
  if (!/^R\d{9}$/.test(cadId ?? "") || !(Number(row.imprv_val) > 0)) return undefined;
  const siteAddress = (row.situs_full ?? "").replace(/\s+/g, " ").trim().replace(/^0+\s+/, "").replace(/\b0+(\d)/g, "$1").toUpperCase();
  if (!siteAddress) return undefined;
  const market = Number(row.market);
  return { cadId, siteAddress, ...(market > 0 ? { marketValueCents: Math.round(market * 100) } : {}) };
}
