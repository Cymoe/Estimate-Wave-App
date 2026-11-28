// What both voices share: the lines an ad reads, and putting a timed read on an ad's sizes (ads.ts `voice` for
// ElevenLabs, voiceActors.ts for a real voice actor).

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { shotTimings, wordTimings, type Alignment, type Script } from "./ads";

/** The script as the validator takes it (only the stored fields). */
export const stripSystem = (s: Script) =>
  ({
    voice: s.voice,
    onScreen: s.onScreen,
    headline: s.headline,
    primaryText: s.primaryText,
    ...(s.shots
      ? { shots: s.shots.map((x) => ({ assetId: x.assetId, voice: x.voice, onScreen: x.onScreen, start: x.start, end: x.end, ...(x.words ? { words: x.words } : {}) })) }
      : {}),
  }) as never;

/** The lines an ad's voice reads, in order. */
export const linesOf = (c: Pick<Doc<"adCreatives">, "script">) => {
  const shots = c.script.shots ?? [];
  return shots.length ? shots.map((s) => s.voice) : [c.script.voice];
};

/**
 * Puts a read on an ad's sizes and sends them to be drawn: each line's start and end, and when each word is said,
 * from the read's character timing. Shared by the ElevenLabs voice and a voice actor's read (voiceActors.ts).
 */
export async function useRead(
  ctx: ActionCtx,
  ids: Id<"adCreatives">[],
  first: Pick<Doc<"adCreatives">, "script">,
  audioStorageId: Id<"_storage">,
  alignment: Alignment | null,
) {
  const shots = first.script.shots ?? [];
  const lines = linesOf(first);
  const estimate = Math.max(8, lines.join(" ").split(/\s+/).length / 2.6);
  const timed = shotTimings(lines, alignment, estimate);
  // When each word is said, so the captions can follow the voice; without it the renderer estimates from the line.
  const words = wordTimings(lines, alignment);
  const script = shots.length ? { ...first.script, shots: shots.map((s, i) => ({ ...s, ...timed.shots[i], ...(words ? { words: words[i] } : {}) })) } : first.script;
  // Voiced is the end of what happens here: the ads now wait for the renderer.
  for (const id of ids)
    await ctx.runMutation(internal.ads.patchCreative, {
      id,
      status: "voiced",
      audioStorageId,
      audioDurationSec: timed.durationSec,
      script: stripSystem(script as Script),
    });
  await ctx.scheduler.runAfter(0, internal.ads.startRenders, {});
}

