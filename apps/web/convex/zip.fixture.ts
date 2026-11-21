// For tests: builds a zip the way any unzip reads one, its files stored as they are (no packing).

export const bytes = (s: string) => new TextEncoder().encode(s);
const le = (n: number, size: number) => Uint8Array.from({ length: size }, (_, i) => (n >>> (8 * i)) & 0xff);
export const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** `date` ("2026-08-06") is written as each file's last-changed day. */
export function zip(files: Record<string, Uint8Array>, date?: string): Uint8Array {
  const [y, m, d] = (date ?? "1980-00-00").split("-").map(Number);
  const dos = date ? ((y - 1980) << 9) | (m << 5) | d : 0;
  const locals: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let at = 0;
  for (const [name, data] of Object.entries(files)) {
    const local = join(le(0x04034b50, 4), le(20, 2), le(0, 2), le(0, 2), le(0, 2), le(dos, 2), le(0, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), bytes(name), data);
    directory.push(join(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(0, 2), le(0, 2), le(dos, 2), le(0, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(at, 4), bytes(name)));
    locals.push(local);
    at += local.length;
  }
  const dir = join(...directory);
  return join(...locals, dir, le(0x06054b50, 4), le(0, 2), le(0, 2), le(directory.length, 2), le(directory.length, 2), le(dir.length, 4), le(at, 4), le(0, 2));
}
