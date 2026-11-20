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

/** How much of a photo the frame cuts off when the photo fills it, 0 to 1. */
export function hidden(photo: Shape, frame: Shape): number {
  const fill = Math.max(frame.width / photo.width, frame.height / photo.height);
  return 1 - (frame.width * frame.height) / (photo.width * photo.height * fill * fill);
}

/** The framings a photo goes through. One the frame cuts a lot off is shown by moving across it; the others start wide. */
const orderFor = (photo: Photo, frame: Shape): Framing[] => (hidden(photo, frame) > 0.4 ? ["pan", "punch", "pan", "pull"] : ["push", "punch", "pan", "pull"]);

/** A stretch of time cut into shots of about the usual length, a cut moved onto a beat when one is near. */
function cuts(from: number, to: number, beats: number[]): number[] {
  const span = to - from;
  let count = Math.max(1, Math.round(span / SHOT_SEC));
  while (count > 1 && span / count < SHORTEST) count--;
  const out: number[] = [];
  for (let i = 1; i < count; i++) {
    const even = from + (span * i) / count;
    const last = out[out.length - 1] ?? from;
    const beat = beats.filter((b) => Math.abs(b - even) <= 0.3 && b - last >= SHORTEST && to - b >= SHORTEST).sort((a, b) => Math.abs(a - even) - Math.abs(b - even))[0];
    out.push(beat ?? even);
  }
  return out;
}

/**
 * The ad as a list of shots. Each spoken line has its photo, and the time the
 * line is up is cut into a few shots of that photo: wide first, then close,
 * across, and back out. The last line then looks back over the other photos,
 * quickly, ending on the first; a photo labelled as the before is left out of
 * that, so the ad never closes on unfinished work. Nothing is up for long, and
 * nothing is still.
 */
export function shotsOf(photos: Photo[], lines: Line[], until: number, frame: Shape, beats: number[] = []): Shot[] {
  const out: Shot[] = [];
  // Photos a line labels as the before.
  const unfinished = new Set(lines.flatMap((line, i) => (/\bbefore\b/i.test(line.label ?? "") ? [photos[Math.min(i, photos.length - 1)]?.src ?? ""] : [])));
  const count = new Map<string, number>();
  const next = (key: string) => {
    const n = count.get(key) ?? 0;
    count.set(key, n + 1);
    return n;
  };
  lines.forEach((line, i) => {
    const photo = photos[Math.min(i, photos.length - 1)];
    if (!photo) return;
    const from = i === 0 ? 0 : line.start - LEAD;
    const to = i === lines.length - 1 ? until : lines[i + 1].start - LEAD;
    if (to - from < 0.2) return;
    const fresh = out[out.length - 1]?.photo.src !== photo.src;
    let at = from;
    const add = (of: Photo, end: number, framing: Framing, opens = false) => {
      out.push({ photo: of, start: at, end, framing, opens, line: i, turn: next(of.src + framing) });
      at = end;
    };
    // The other photos, in the order they were shown, the first one last; never one shown as a before.
    const others = photos.filter((ph, k) => ph.src !== photo.src && !unfinished.has(ph.src) && photos.findIndex((q) => q.src === ph.src) === k);
    if (others.length > 1) others.push(others.shift() as Photo);
    const span = to - from;
    const room = i === lines.length - 1 && i > 0 && span >= 4.2 ? span * LOOK_BACK_SHARE : 0;
    const glances = others.slice(others.length - Math.min(others.length, Math.floor(room / GLANCE_SEC)));
    const each = glances.length ? Math.min(GLANCE_MAX_SEC, room / glances.length) : 0;
    const own = to - each * glances.length;
    if (photo.motion && fresh) add(photo, own - from - CLIP_SEC < SHORTEST ? own : from + CLIP_SEC, "clip", true);
    if (at < own) {
      const order = orderFor(photo, frame);
      for (const end of [...cuts(at, own, beats), own]) {
        const seen = next(photo.src) + (photo.motion ? 1 : 0);
        // After its first time through, a photo isn't shown wide again.
        add(photo, end, seen < order.length ? order[seen] : order[1 + ((seen - 1) % (order.length - 1))], fresh && at === from);
      }
    }
    glances.forEach((ph, k) => add(ph, k === glances.length - 1 ? to : at + each, k % 2 === 0 ? "punch" : "pull"));
  });
  return out;
}
