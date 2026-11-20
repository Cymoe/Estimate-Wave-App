import type { Line, Photo } from "../types";

/** How a shot is framed. A clip is the photo with the camera already moving in it. */
export type Framing = "clip" | "push" | "punch" | "pan" | "pull";

export interface Shot {
  photo: Photo;
  /** Seconds. */
  start: number;
  end: number;
  framing: Framing;
  /** The first shot of a spoken line's photo: it arrives with a move. The rest cut straight in. */
  opens: boolean;
  line: number;
  /** Which of its kind this is for the photo, so two close shots of one photo look at different things. */
  turn: number;
}

export interface Shape {
  width: number;
  height: number;
}

/** A cut lands this long before the voice starts the line, as an editor would place it. */
const LEAD = 0.12;
/** About how long a shot stays up. */
const SHOT_SEC = 1.9;
/** The shortest a shot may be. */
const SHORTEST = 1.1;
/** How long a moving clip holds before the cuts start. */
const CLIP_SEC = 3.4;
/** The last line looks back over the other photos: each up for at least this long, and no longer than the second. */
const GLANCE_SEC = 0.8;
const GLANCE_MAX_SEC = 1.2;
/** How much of the last line the look-back may take. */
const LOOK_BACK_SHARE = 0.6;
/** The shortest a photo is up when a line shows several, one after another. */
const TURN_SEC = 0.95;

/** How much of a photo the frame cuts off when the photo fills it, 0 to 1. */
export function hidden(photo: Shape, frame: Shape): number {
  const fill = Math.max(frame.width / photo.width, frame.height / photo.height);
  return 1 - (frame.width * frame.height) / (photo.width * photo.height * fill * fill);
}

/** The framings a photo goes through. One the frame cuts a lot off is shown by moving across it; the others start wide. */
const orderFor = (photo: Photo, frame: Shape): Framing[] => (hidden(photo, frame) > 0.4 ? ["pan", "punch", "pan", "pull"] : ["push", "punch", "pan", "pull"]);

/**
 * A stretch of time cut into shots of about the usual length, a cut moved onto a beat when one is near.
 * `atLeast` asks for that many shots when there is time for them, each no shorter than `shortest`.
 */
function cuts(from: number, to: number, beats: number[], atLeast = 1, shortest = SHORTEST): number[] {
  const span = to - from;
  let count = Math.max(1, Math.round(span / SHOT_SEC), atLeast);
  while (count > 1 && span / count < shortest) count--;
  const out: number[] = [];
  for (let i = 1; i < count; i++) {
    const even = from + (span * i) / count;
    const last = out[out.length - 1] ?? from;
    const beat = beats.filter((b) => Math.abs(b - even) <= 0.3 && b - last >= shortest && to - b >= shortest).sort((a, b) => Math.abs(a - even) - Math.abs(b - even))[0];
    out.push(beat ?? even);
  }
  return out;
}

const unique = (photos: Photo[]) => photos.filter((ph, k) => photos.findIndex((q) => q.src === ph.src) === k);

/** The photos a line is said over, its own first. */
export const photosOf = (photos: Photo[], lines: Line[], i: number): Photo[] => {
  const own = lines[i]?.photos?.length ? lines[i].photos! : [photos[Math.min(i, photos.length - 1)]];
  return unique(own.filter(Boolean));
};

/**
 * The ad as a list of shots. Each spoken line has its photos, and the time the
 * line is up is cut into a few shots. A line with several photos shows them one
 * after another, each wide; a line with one is cut wide first, then close,
 * across, and back out. The last line then looks back, quickly: over photos the
 * ad has to spare when it has any, then over ones already shown, ending on the
 * first; a short last line just ends on the first. A photo labelled as the
 * before is left out of that, so the ad never closes on unfinished work.
 * Nothing is up for long, and nothing is still.
 *
 * `covered` is how long before `until` the closing card starts to cover the
 * frame. The look-back is fitted into what can still be seen, so its last
 * photo gets its full time on screen and then stays up under the card.
 */
export function shotsOf(photos: Photo[], lines: Line[], until: number, frame: Shape, beats: number[] = [], covered = 0, spare: Photo[] = []): Shot[] {
  const out: Shot[] = [];
  // Photos that are a before: marked as one, or shown under a label that says so.
  const unfinished = new Set(
    lines.flatMap((line, i) =>
      photosOf(photos, lines, i)
        .filter((ph) => ph.before || /\bbefore\b/i.test(line.label ?? ""))
        .map((ph) => ph.src),
    ),
  );
  const count = new Map<string, number>();
  const next = (key: string) => {
    const n = count.get(key) ?? 0;
    count.set(key, n + 1);
    return n;
  };
  // Every photo a line shows, in the order shown.
  const shown = unique(lines.flatMap((_, i) => photosOf(photos, lines, i)));
  lines.forEach((line, i) => {
    const set = photosOf(photos, lines, i);
    const photo = set[0];
    if (!photo) return;
    const from = i === 0 ? 0 : line.start - LEAD;
    const to = i === lines.length - 1 ? until : lines[i + 1].start - LEAD;
    if (to - from < 0.2) return;
    // What of this line can be seen: the closing card takes the end of the last one.
    const seen = i === lines.length - 1 ? Math.max(from, to - covered) : to;
    const fresh = out[out.length - 1]?.photo.src !== photo.src;
    let at = from;
    const add = (of: Photo, end: number, framing: Framing, opens = false) => {
      out.push({ photo: of, start: at, end, framing, opens, line: i, turn: next(of.src + framing) });
      at = end;
    };
    // What the last line looks back over: spare photos nobody has seen, then the ones shown, and last of all the first.
    const mine = new Set(set.map((ph) => ph.src));
    const back = shown.filter((ph) => !mine.has(ph.src) && !unfinished.has(ph.src));
    const first = back[0];
    const unseen = unique(spare).filter((ph) => !shown.some((q) => q.src === ph.src) && !unfinished.has(ph.src));
    const pool = [...unseen, ...back.slice(1)];
    const span = seen - from;
    // A last line too short to look back over everything still closes on the first photo, so the ad ends on the picture it opened with.
    const closing = i === lines.length - 1 && i > 0;
    const room = !closing ? 0 : span >= 4.2 ? span * LOOK_BACK_SHARE : span >= 2.6 && first ? Math.min(GLANCE_MAX_SEC, Math.max(GLANCE_SEC, span * 0.35)) : 0;
    const fit = Math.min(pool.length + (first ? 1 : 0), Math.floor(room / GLANCE_SEC));
    const glances = fit > 0 ? (first ? [...pool.slice(0, fit - 1), first] : pool.slice(0, fit)) : [];
    const each = glances.length ? Math.min(GLANCE_MAX_SEC, room / glances.length) : 0;
    const own = glances.length ? seen - each * glances.length : to;
    if (set.length === 1 && photo.motion && fresh) add(photo, own - from - CLIP_SEC < SHORTEST ? own : from + CLIP_SEC, "clip", true);
    if (at < own) {
      const several = set.length > 1;
      const ends = [...cuts(at, own, beats, several ? set.length : 1, several ? TURN_SEC : SHORTEST), own];
      ends.forEach((end, k) => {
        const of = set[k % set.length];
        const order = orderFor(of, frame);
        const times = next(of.src) + (of.motion ? 1 : 0);
        // After its first time through, a photo isn't shown wide again.
        add(of, end, times < order.length ? order[times] : order[1 + ((times - 1) % (order.length - 1))], fresh && k === 0);
      });
    }
    glances.forEach((ph, k) => add(ph, k === glances.length - 1 ? to : at + each, k % 2 === 0 ? "punch" : "pull"));
  });
  return out;
}
