"use node";
// Reads the appraisal district's certified roll and web file (lib/districtRoll.ts) into Midland's parcels: in the
// Node runtime, since they are two zips of about 80 MB each holding tables of hundreds of megabytes. Each is read
// through once, a piece at a time, and let go before the next. Skipped when the district hasn't posted new files.
//
//   npx convex run districtRoll:importRoll '{"background":true}'
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { DISTRICT_ROLL, WEB_BUILDINGS, WEB_SALES, buildingRow, deedsOf, isRollTable, rollAccount, rollColumns, rollLinks, rollParcels, saleRow, type RollAccount, type RollParcel } from "./lib/districtRoll";
import type { DeedRow } from "./lib/parcels";
import { linesEach, zipEntries, zipEntry, type ZipEntry } from "./lib/zip";

/** The entry's bytes unpacked, a piece at a time. */
async function* unpacked(entry: Pick<ZipEntry, "method" | "data">): AsyncGenerator<Uint8Array> {
  if (entry.method === 0) {
    yield entry.data;
    return;
  }
  if (entry.method !== 8) throw new Error(`a file is packed a way this can't read (method ${entry.method})`);
  const { createInflateRaw } = await import("node:zlib");
  const { Readable } = await import("node:stream");
  for await (const piece of Readable.from([Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength)]).pipe(createInflateRaw())) yield piece as Uint8Array;
}

async function download(url: string, what: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`the district's ${what} answered HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** How big a file is, asked without fetching it: with its link, that says whether it is the one read last time. */
async function sizeOf(url: string): Promise<string> {
  const response = await fetch(url, { method: "HEAD" }).catch(() => undefined);
  return response?.ok ? (response.headers.get("content-length") ?? "?") : "?";
}

/** Every line but the first (the column names). */
const afterHeader = (each: (line: string) => void) => {
  let first = true;
  return (line: string) => {
    if (first) first = false;
    else each(line);
  };
};

/**
 * A roll with fewer accounts than this isn't the whole roll (a cut-off download, a file of another kind): nothing is
 * retired on its word. Midland has about 78,000. Tests lower it.
 */
export const ROLL_LIMITS = { wholeRoll: 60_000 };
const BATCH = 200;
const PARALLEL = 4;

type Result = { skipped?: true; scheduled?: true; accounts?: number; parcels?: number; added?: number; updated?: number; retired?: number; files?: string; error?: string };

async function run(ctx: ActionCtx, again: boolean): Promise<Result> {
  let files: string | undefined;
  const out: { accounts?: number; parcels?: number; added?: number; updated?: number; retired?: number } = {};
  let error: string | undefined;
  try {
    const page = await fetch(DISTRICT_ROLL.page);
    if (!page.ok) throw new Error(`the district's Open Records page answered HTTP ${page.status}`);
    const links = rollLinks(await page.text());
    if (!links.roll || !links.web) throw new Error(`the district's Open Records page has no ${links.roll ? "web file" : "certified roll"} linked`);
    // The same files as last time (their links and sizes): nothing new in them, and nothing is downloaded.
    files = `${links.roll} (${await sizeOf(links.roll)} bytes) + ${links.web} (${await sizeOf(links.web)} bytes)`;
    const last = await ctx.runQuery(internal.permits.sourceState, { source: DISTRICT_ROLL.source });
    if (!again && last && !last.error && last.lastAppliedAt === files) return { skipped: true, files };
    // The web file first: what is built on each account, and who conveyed it at each sale.
    const buildings = new Map<string, string[]>();
    const sales = new Map<string, Array<{ seq: number; deed: DeedRow }>>();
    let web: Uint8Array | undefined = await download(links.web, "web file");
    const [built, sold] = [zipEntry(web, WEB_BUILDINGS), zipEntry(web, WEB_SALES)];
    if (!built || !sold) throw new Error(`the district's web file has no ${built ? WEB_SALES : WEB_BUILDINGS} in it`);
    await linesEach(
      unpacked(built),
      afterHeader((line) => {
        const b = buildingRow(line);
        if (!b) return;
        const have = buildings.get(b.cadId);
        if (!have) buildings.set(b.cadId, [b.code]);
        else if (!have.includes(b.code)) have.push(b.code);
      }),
    );
    await linesEach(
      unpacked(sold),
      afterHeader((line) => {
        const s = saleRow(line);
        if (!s) return;
        const have = sales.get(s.cadId);
        if (have) have.push(s);
        else sales.set(s.cadId, [s]);
      }),
    );
    web = undefined;
    // Then the roll: every account, with its owner.
    let roll: Uint8Array | undefined = await download(links.roll, "certified roll");
    const table = zipEntries(roll).find((e) => isRollTable(e.name));
    if (!table) throw new Error("the district's certified roll has no roll table in it");
    const accounts: RollAccount[] = [];
    let columns: Record<string, number> | undefined;
    await linesEach(unpacked(table), (line) => {
      if (!columns) columns = rollColumns(line);
      // Real property only: most of the roll's lines are mineral interests.
      else if (line.charCodeAt(0) === 82) {
        const account = rollAccount(line, columns);
        if (account) accounts.push(account);
      }
    });
    roll = undefined;
    out.accounts = accounts.length;
    const parcels: RollParcel[] = rollParcels(
      accounts,
      (id) => buildings.get(id) ?? [],
      (id) => deedsOf(sales.get(id) ?? []),
    );
    out.parcels = parcels.length;
    const stamp = new Date().toISOString();
    const fileDate = table.date ?? stamp.slice(0, 10);
    out.added = 0;
    out.updated = 0;
    for (let i = 0; i < parcels.length; i += BATCH * PARALLEL) {
      const group = Array.from({ length: PARALLEL }, (_, k) => parcels.slice(i + k * BATCH, i + (k + 1) * BATCH)).filter((rows) => rows.length);
      const results: Array<{ added: number; updated: number }> = await Promise.all(group.map((rows) => ctx.runMutation(internal.parcels.upsertRoll, { rows, stamp, fileDate })));
      for (const r of results) {
        out.added += r.added;
        out.updated += r.updated;
      }
    }
    // What the roll no longer has. Only on a whole roll's word.
    if (accounts.length >= ROLL_LIMITS.wholeRoll) {
      out.retired = 0;
      let cursor: string | undefined;
      for (;;) {
        const swept: { retired: number; cursor: string; isDone: boolean } = await ctx.runMutation(internal.parcels.retireSweep, { stamp, cursor });
        out.retired += swept.retired;
        if (swept.isDone) break;
        cursor = swept.cursor;
      }
    } else if (parcels.length > 0) error = `the roll had only ${accounts.length} accounts: kept what it had, retired nothing`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, { source: DISTRICT_ROLL.source, fetched: out.accounts ?? 0, added: out.added ?? 0, updated: out.updated ?? 0, lastAppliedAt: error ? undefined : files, error });
  if ((out.added ?? 0) + (out.updated ?? 0) > 0) {
    // The roll's homestead, over-65 and owner name feed the seller lists: restack Midland's homes (signals.ts),
    // which rebuilds its Outreach owners once done.
    await ctx.scheduler.runAfter(0, internal.signals.recomputePage, { county: "Midland" });
    await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
  }
  return { ...out, ...(files ? { files } : {}), ...(error ? { error } : {}) };
}

export const importRoll = internalAction({
  args: {
    /** Read the files even when they are the ones read last time. */
    again: v.optional(v.boolean()),
    /** Schedule the read and return at once: it takes a few minutes. */
    background: v.optional(v.boolean()),
  },
  handler: async (ctx, { again, background }): Promise<Result> => {
    if (background) {
      await ctx.scheduler.runAfter(0, internal.districtRoll.importRoll, { again });
      return { scheduled: true };
    }
    return await run(ctx, Boolean(again));
  },
});
