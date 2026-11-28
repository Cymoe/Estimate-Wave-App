// Reading a zip without unpacking all of it: its directory, and one file's packed bytes. Pure (the unpacking itself is
// Node's, in the action that asks). The district's files are zips of very large tables.

export const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
export const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

export type ZipEntry = {
  name: string;
  /** How it is packed: 0 stored as it is, 8 deflated. */
  method: number;
  /** Its packed bytes. */
  data: Uint8Array;
  /** Its size unpacked. */
  size: number;
  /** When the file inside was last changed ("2026-08-06"), as the zip records it. */
  date?: string;
};

/** Every file in a zip, from its directory. Nothing when it isn't a zip. */
export function zipEntries(zip: Uint8Array): ZipEntry[] {
  // The directory's end record is the last thing in the file, but for a comment after it.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (u32(zip, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const out: ZipEntry[] = [];
  let at = u32(zip, end + 16);
  for (let n = u16(zip, end + 10); n > 0 && u32(zip, at) === 0x02014b50; n--) {
    const [nameLength, extraLength, commentLength] = [u16(zip, at + 28), u16(zip, at + 30), u16(zip, at + 32)];
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const local = u32(zip, at + 42);
    const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
    // The date is packed into 16 bits: years since 1980, month, day.
    const d = u16(zip, at + 14);
    const date = d ? `${1980 + (d >> 9)}-${String((d >> 5) & 15).padStart(2, "0")}-${String(d & 31).padStart(2, "0")}` : undefined;
    out.push({ name, method: u16(zip, at + 10), data: zip.subarray(start, start + u32(zip, at + 20)), size: u32(zip, at + 24), ...(date ? { date } : {}) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** One file inside a zip, by its name (whatever folder it is in). Undefined when the zip has no such file. */
export function zipEntry(zip: Uint8Array, name: string): ZipEntry | undefined {
  return zipEntries(zip).find((e) => e.name === name || e.name.endsWith(`/${name}`));
}

/**
 * Text as it arrives, a piece at a time, as lines (the district's roll is 350 MB unpacked: never held whole).
 * Calls `each` with every line, its line ending gone. Latin-1, as the district's exports are.
 */
export async function linesEach(pieces: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, each: (line: string) => void): Promise<number> {
  const latin = new TextDecoder("latin1");
  let held = "";
  let lines = 0;
  const give = (line: string) => {
    each(line.endsWith("\r") ? line.slice(0, -1) : line);
    lines++;
  };
  for await (const piece of pieces) {
    const text = held + latin.decode(piece, { stream: true });
    let from = 0;
    for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", from)) {
      give(text.slice(from, at));
      from = at + 1;
    }
    held = text.slice(from);
  }
  if (held) give(held);
  return lines;
}
