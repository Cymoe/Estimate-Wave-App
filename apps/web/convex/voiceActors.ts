// A real voice actor reads the ad (lib/voiceActors.ts says how, and what Bunny Studio's API looks like).
//
// When Settings says a voice actor reads the ads, the voice step (ads.ts `voice`) sends each idea's lines here
// instead of to ElevenLabs. `order` creates a Bunny Studio project and the ad waits as "recording". Every half hour
// `checkOrders` asks Bunny Studio for each project's reads. When one is in, it is downloaded and kept, ElevenLabs
// writes down when each word was said, and if the read follows the script the ad is timed to it and sent to be
// drawn, exactly as an ElevenLabs read is (ads.ts `useRead`), and the read is accepted at Bunny Studio. A read that
// doesn't follow the script is held back: the ad says so, and a redo asked for in Bunny Studio comes in as a new read.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { consumerBrand } from "./lib/support";
import { BUNNY_API, READ_MATCH_MIN, actorProjectBody, alignmentFromWords, creatorBrief as briefFor, readyRead, type Deliverable, type HeardWord } from "./lib/voiceActors";
import { linesOf, useRead } from "./lib/adVoice";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function readJson(res: Response, what: string): Promise<any> {
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new Error(`${what}: ${res.status} ${body?.message ?? body?.type ?? text.slice(0, 200)}`);
  return body;
}

/** Bunny Studio's token: the one set on the deployment, or one signed in for with the account's email and password. */
async function bunnyToken(): Promise<string> {
  if (process.env.BUNNY_STUDIO_TOKEN) return process.env.BUNNY_STUDIO_TOKEN;
  const email = process.env.BUNNY_STUDIO_EMAIL;
  const password = process.env.BUNNY_STUDIO_PASSWORD;
  if (!email || !password) throw new Error("Bunny Studio isn't set up: set BUNNY_STUDIO_TOKEN on the deployment");
  const body = await readJson(
    await fetch(`${BUNNY_API}/users/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }),
    "Bunny Studio sign-in",
  );
  if (!body?.token) throw new Error("Bunny Studio sign-in gave no token");
  return String(body.token);
}

const bunny = async (token: string, path: string, what: string, init: { method?: string; body?: unknown } = {}) =>
  await readJson(
    await fetch(`${BUNNY_API}${path}`, {
      method: init.method ?? "GET",
      headers: { "x-access-token": token, ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
    what,
  );

// ----------------------------------------------------------------- Ordering

export const markOrdered = internalMutation({
  args: { ids: v.array(v.id("adCreatives")), projectId: v.string(), price: v.optional(v.number()), test: v.boolean() },
  handler: async (ctx, { ids, projectId, price, test }) => {
    for (const id of ids)
      await ctx.db.patch(id, { status: "recording", error: undefined, actor: { projectId, orderedAt: nowIso(), price, test } });
  },
});

/** Sends one idea's lines to Bunny Studio to be read; its sizes wait as "recording" until the read is in. */
export const order = internalAction({
  args: { ids: v.array(v.id("adCreatives")) },
  handler: async (ctx, { ids }) => {
    if (ids.length === 0) return;
    const first = await ctx.runQuery(internal.ads.creativeInput, { id: ids[0] });
    if (!first) return;
    const cfg = await ctx.runQuery(internal.ads.config, {});
    try {
      const token = await bunnyToken();
      const test = process.env.BUNNY_STUDIO_TEST === "1";
      const project = await bunny(token, "/projects", "Bunny Studio order", {
        method: "POST",
        body: actorProjectBody({
          title: `${cfg.brand.name} ad ${first.name.replace(/_(916|45)_/, "_")}`,
          lines: linesOf(first),
          genderAndAge: cfg.actorVoice,
          language: cfg.actorLanguage,
          notes: cfg.actorNotes,
          test,
        }),
      });
      if (!project?.id) throw new Error("Bunny Studio took the order but sent no project id");
      await ctx.runMutation(internal.voiceActors.markOrdered, {
        ids,
        projectId: String(project.id),
        price: typeof project.price === "number" ? project.price : undefined,
        test,
      });
    } catch (e) {
      for (const id of ids) await ctx.runMutation(internal.ads.patchCreative, { id, status: "failed", error: `The voice actor couldn't be ordered: ${errText(e)}` });
      await ctx.runMutation(internal.ads.finishIfDone, { batchId: first.batchId });
    }
  },
});

// ----------------------------------------------------- Waiting for the read

/** The orders still out, one per project, with the ads waiting on each. */
export const outstanding = internalQuery({
  args: {},
  handler: async (ctx) => {
    const waiting = await ctx.db
      .query("adCreatives")
      .withIndex("by_status", (q) => q.eq("status", "recording"))
      .take(200);
    const byProject = new Map<string, Order>();
    for (const c of waiting) {
      if (!c.actor) continue;
      const group = byProject.get(c.actor.projectId) ?? { projectId: c.actor.projectId, ids: [], heldBack: c.actor.heldBack ?? [] };
      group.ids.push(c._id);
      byProject.set(c.actor.projectId, group);
    }
    return [...byProject.values()];
  },
});

const patchActor = async (
  ctx: { db: { get: (id: Id<"adCreatives">) => Promise<Doc<"adCreatives"> | null>; patch: (id: Id<"adCreatives">, v: Partial<Doc<"adCreatives">>) => Promise<void> } },
  ids: Id<"adCreatives">[],
  change: Partial<NonNullable<Doc<"adCreatives">["actor"]>>,
  extra: Partial<Doc<"adCreatives">> = {},
) => {
  for (const id of ids) {
    const c = await ctx.db.get(id);
    if (c?.actor) await ctx.db.patch(id, { ...extra, actor: { ...c.actor, ...change } });
  }
};

export const noteChecked = internalMutation({
  args: { ids: v.array(v.id("adCreatives")) },
  handler: async (ctx, { ids }) => await patchActor(ctx, ids, { checkedAt: nowIso() }),
});

/** A read that doesn't follow the script: the ads say why, and wait for a redo. */
export const holdBack = internalMutation({
  args: { ids: v.array(v.id("adCreatives")), deliverableId: v.string(), why: v.string() },
  handler: async (ctx, { ids, deliverableId, why }) => {
    for (const id of ids) {
      const c = await ctx.db.get(id);
      if (!c?.actor) continue;
      await ctx.db.patch(id, {
        error: why.slice(0, 500),
        actor: { ...c.actor, checkedAt: nowIso(), heldBack: [...new Set([...(c.actor.heldBack ?? []), deliverableId])] },
      });
    }
  },
});

/** The read is in and used: which one, and nothing left to say about the wait. */
export const noteUsed = internalMutation({
  args: { ids: v.array(v.id("adCreatives")), deliverableId: v.string() },
  handler: async (ctx, { ids, deliverableId }) => await patchActor(ctx, ids, { deliverableId, checkedAt: nowIso() }, { error: undefined }),
});

/** When each word of a read was said, from ElevenLabs' speech-to-text. */
async function heardWords(audio: Blob): Promise<HeardWord[]> {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY isn't set, so the read can't be timed");
  const form = new FormData();
  form.set("model_id", "scribe_v2");
  form.set("file", audio, "read.mp3");
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  const body = await readJson(
    await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, body: form }),
    "ElevenLabs",
  );
  return (Array.isArray(body?.words) ? body.words : [])
    .filter((w: { type?: string }) => w.type === undefined || w.type === "word")
    .map((w: { text?: string; start?: number; end?: number }) => ({ text: String(w.text ?? ""), start: Number(w.start) || 0, end: Number(w.end) || 0 }));
}

/** Takes in one project's read, if it has come back: times the ad to it, sends the ad to be drawn and accepts the read. */
type Order = { projectId: string; ids: Id<"adCreatives">[]; heldBack: string[] };

async function takeIn(ctx: ActionCtx, token: string, group: Order) {
  const first = await ctx.runQuery(internal.ads.creativeInput, { id: group.ids[0] });
  if (!first) return;
  try {
    const list = await bunny(token, `/deliverables/project/${encodeURIComponent(group.projectId)}`, "Bunny Studio reads");
    const read = readyRead((Array.isArray(list) ? list : []) as Deliverable[], group.heldBack);
    if (!read) {
      // Still being recorded, unless the order was called off.
      const project = await bunny(token, `/projects/${encodeURIComponent(group.projectId)}`, "Bunny Studio order");
      if (project?.status === "canceled") {
        for (const id of group.ids) await ctx.runMutation(internal.ads.patchCreative, { id, status: "failed", error: "The voice actor order was canceled at Bunny Studio" });
        await ctx.runMutation(internal.ads.finishIfDone, { batchId: first.batchId });
      } else await ctx.runMutation(internal.voiceActors.noteChecked, { ids: group.ids });
      return;
    }
    const res = await fetch(read.url);
    if (!res.ok) throw new Error(`the read couldn't be downloaded (${res.status})`);
    const audio = new Blob([await res.arrayBuffer()], { type: "audio/mpeg" });
    const lines = linesOf(first);
    const { alignment, matched, total } = alignmentFromWords(lines, await heardWords(audio));
    if (total === 0 || matched / total < READ_MATCH_MIN) {
      await ctx.runMutation(internal.voiceActors.holdBack, {
        ids: group.ids,
        deliverableId: read.id,
        why: `The voice actor's read doesn't follow the script (${matched} of ${total} words heard). Ask for a revision in Bunny Studio; the redo comes in here by itself.`,
      });
      return;
    }
    const audioStorageId = await ctx.storage.store(audio);
    await useRead(ctx, group.ids, first, audioStorageId, alignment);
    await ctx.runMutation(internal.voiceActors.noteUsed, { ids: group.ids, deliverableId: read.id });
    // Accepted at Bunny Studio once it is used; the ad itself is still approved by a person before it runs.
    if (read.status === "reviewable") {
      try {
        await bunny(token, `/deliverables/${encodeURIComponent(read.id)}`, "Bunny Studio approval", { method: "PUT", body: { status: "approved" } });
      } catch (e) {
        console.error("approve read", read.id, errText(e));
      }
    }
  } catch (e) {
    // Tried again on the next check; the ad says what went wrong meanwhile.
    for (const id of group.ids) await ctx.runMutation(internal.ads.patchCreative, { id, error: `Waiting on the voice actor: ${errText(e)}` });
  }
}

/** Every half hour (crons.ts), and on "Check now": each order still out, and the reads that have come back. */
export const checkOrders = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const groups: Order[] = await ctx.runQuery(internal.voiceActors.outstanding, {});
    if (groups.length === 0) return 0;
    const token = await bunnyToken();
    for (const group of groups) await takeIn(ctx, token, group);
    return groups.length;
  },
});

export const checkNow = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    await ctx.scheduler.runAfter(0, internal.voiceActors.checkOrders, {});
  },
});

// ------------------------------------------------- An on-camera creator

/**
 * What to send an on-camera creator for one ad: its lines and how to film them in front of a green screen. Copied by
 * hand for now; no creator marketplace takes an order by API.
 */
export const creatorBrief = query({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const c = await ctx.db.get(id);
    if (c === null) fail("NOT_FOUND", "That ad is gone");
    return briefFor({ brand: consumerBrand(), headline: c.script.headline, lines: linesOf(c), ratio: c.ratio });
  },
});
