"use node";
// Reads the appraisal district's parcel file (lib/districtFile.ts) for the properties the app lacks: in the Node
// runtime, since the file is a 20 MB zip of a 220 MB table. Each parcel with a building that the app has no record of
// is noted (parcels.ts noteFinds) for the owner refresh to read at the district's site: what is built there, and who
// owns it today. The file is fetched only when the link or its size has changed since the last read.
//
//   npx convex run districtFile:importFile '{}'
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { DISTRICT_FILE, FILE_COLUMNS, dbfEach, fileFind, fileLink, zipEntry, type FileFind } from "./lib/districtFile";

/** The entry's bytes unpacked, a piece at a time. */
async function* unpacked(entry: { method: number; data: Uint8Array }): AsyncGenerator<Uint8Array> {
  if (entry.method === 0) {
    yield entry.data;
    return;
  }
  if (entry.method !== 8) throw new Error(`the file is packed a way this can't read (method ${entry.method})`);
  const { createInflateRaw } = await import("node:zlib");
  const { Readable } = await import("node:stream");
  for await (const piece of Readable.from([Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength)]).pipe(createInflateRaw())) yield piece as Uint8Array;
}

const BATCH = 400;

export const importFile = internalAction({
  args: { again: v.optional(v.boolean()) },
  handler: async (ctx, { again }): Promise<{ skipped?: true; parcels?: number; withBuilding?: number; lacking?: number; noted?: number; file?: string; error?: string }> => {
    let file: string | undefined;
    let parcels = 0;
    let noted = 0;
    const out: { withBuilding?: number; lacking?: number } = {};
    let error: string | undefined;
    try {
      const page = await fetch(DISTRICT_FILE.page);
      if (!page.ok) throw new Error(`the district's mapping page answered HTTP ${page.status}`);
      const url = fileLink(await page.text());
      if (!url) throw new Error("the district's mapping page has no MidlandCAD file linked");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`the district's file answered HTTP ${response.status}`);
      const zip = new Uint8Array(await response.arrayBuffer());
      // The same file as last time (its link and its size): nothing new to find in it.
      file = `${url} (${zip.length} bytes)`;
      const last = await ctx.runQuery(internal.permits.sourceState, { source: DISTRICT_FILE.source });
      if (!again && last && !last.error && last.lastAppliedAt === file) return { skipped: true, file };
      const entry = zipEntry(zip, DISTRICT_FILE.entry);
      if (!entry) throw new Error(`the district's file has no ${DISTRICT_FILE.entry} in it`);
      const finds: FileFind[] = [];
      parcels = await dbfEach(unpacked(entry), FILE_COLUMNS, (row) => {
        const find = fileFind(row);
        if (find) finds.push(find);
      });
      out.withBuilding = finds.length;
      // Which of them the app has no record of.
      const lacking: FileFind[] = [];
      for (let i = 0; i < finds.length; i += BATCH) {
        const batch = finds.slice(i, i + BATCH);
        const have = new Set<string>(await ctx.runQuery(internal.parcels.haveParcels, { cadIds: batch.map((f) => f.cadId) }));
        lacking.push(...batch.filter((f) => !have.has(f.cadId)));
      }
      out.lacking = lacking.length;
      for (let i = 0; i < lacking.length; i += BATCH) noted += await ctx.runMutation(internal.parcels.noteFinds, { rows: lacking.slice(i, i + BATCH) });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await ctx.runMutation(internal.permits.recordSync, { source: DISTRICT_FILE.source, fetched: parcels, added: noted, updated: 0, lastAppliedAt: error ? undefined : file, error });
    // The owner refresh reads each find at the district's site (it does nothing if a pass is already under way: that one takes them).
    if (!error) await ctx.scheduler.runAfter(0, internal.parcels.refreshOwners, {});
    return { parcels, ...out, noted, ...(file ? { file } : {}), ...(error ? { error } : {}) };
  },
});
