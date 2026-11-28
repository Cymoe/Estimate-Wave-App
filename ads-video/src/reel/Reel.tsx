import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { display, INK, WIDE, ZONES } from "../theme";
import type { AdProps, Photo, Ratio } from "../types";
import { hidden, onBefore, photosOf, revealOf, type Shot } from "./shots";
import { thump } from "../parts/motion";

/** How long a new photo takes to arrive, and the old one to get out of its way. */
const MOVE_SEC = 0.24;
/** The opening: this long on each of the other photos before the first one lands. */
const FLASH_SEC = 0.26;
/** A photo is never blown up past this many times its own size, so it stays sharp enough. */
const SHARP = 2.3;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const focusOf = (photo: Photo, turn = 0) => photo.focus?.[turn % (photo.focus.length || 1)] ?? { x: 50, y: 45 };

/** How a photo sits in the frame at one moment of a shot: where it is held, and how far in. */
function framed(shot: Shot, p: number, frameW: number, frameH: number) {
  const { photo, framing, turn } = shot;
  const fill = Math.max(frameW / photo.width, frameH / photo.height);
  // How far in a close shot may go before the photo turns soft; closer when the line said what to look at.
  const close = clamp(SHARP / fill, 1.14, photo.focus?.length ? 1.55 : 1.38);
  // What the frame cuts off, as a share of the photo, side to side and top to bottom.
  const spareX = 1 - frameW / (photo.width * fill);
  const spareY = 1 - frameH / (photo.height * fill);
  const at = focusOf(photo, turn);
  const flip = turn % 2 === 1;
  if (framing === "punch") return { x: at.x, y: at.y, scale: interpolate(p, [0, 1], [close * 0.92, close]), originX: at.x, originY: at.y, turn: flip ? 0.7 : -0.7 };
  if (framing === "pull") return { x: at.x, y: at.y, scale: interpolate(p, [0, 1], [Math.max(1.16, close * 0.9), 1.05]), originX: at.x, originY: at.y };
  if (framing === "pan") {
    // Across whatever the frame hides; a photo that fits is moved across a little closer in instead.
    const [a, b] = flip ? [1, 0] : [0, 1];
    const across = clamp(SHARP / fill, 1.04, 1.2);
    const from = clamp(at.x - 30, 0, 100);
    const to = clamp(at.x + 30, 0, 100);
    if (spareX > 0.18) return { x: interpolate(p, [0, 1], flip ? [to, from] : [from, to]), y: at.y, scale: across, originX: 50, originY: 50 };
    if (spareY > 0.18) return { x: at.x, y: interpolate(p, [0, 1], flip ? [clamp(at.y + 30, 0, 100), clamp(at.y - 30, 0, 100)] : [clamp(at.y - 30, 0, 100), clamp(at.y + 30, 0, 100)]), scale: across, originX: 50, originY: 50 };
    const wide = Math.min(1.26, close);
    return { x: at.x, y: at.y, scale: wide, originX: interpolate(p, [0, 1], [a ? 82 : 18, b ? 82 : 18]), originY: at.y };
  }
  // The wide shot, drawing in.
  return { x: at.x, y: 50, scale: interpolate(p, [0, 1], [1.0, 1.1]), originX: at.x, originY: at.y };
}

/** One shot, filling the frame. It runs a little past its end so the next photo has something to push out. */
const ShotLayer: React.FC<{ shot: Shot; leaves: boolean; seed: number; punch?: boolean; beats?: number[] }> = ({ shot, leaves, seed, punch = false, beats = [] }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const length = shot.end - shot.start;
  // Punch: a speed ramp, most of the move in the first moments, then a slow drift; and a kick on each beat.
  const p = punch ? Easing.out(Easing.cubic)(Math.min(1, t / length)) * 0.7 + (t / length) * 0.3 : t / length;
  const view = framed(shot, p, width, height);
  const kick = punch ? 1 + 0.03 * thump(shot.start + t, beats, 0.2) : 1;
  // Arriving: a new photo comes across fast and settles; a cut on the same photo lands with a small bump.
  const arrive = shot.opens && shot.start > 0 ? interpolate(t, [0, MOVE_SEC], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 1;
  const bump = shot.opens ? 1 : interpolate(t, [0, 0.16], [1.045, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  // Leaving: pushed part of the way off and dimmed while the next photo covers it.
  const gone = leaves ? interpolate(t - length, [0, MOVE_SEC], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 0;
  // Held in the hand: never quite still.
  const sway = Math.sin((frame + seed * 40) / 23) * 5;
  const bob = Math.cos((frame + seed * 40) / 31) * 4;
  const media: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: `${view.x}% ${view.y}%`,
    transformOrigin: `${view.originX}% ${view.originY}%`,
    transform: `translate(${sway}px, ${bob}px) rotate(${("turn" in view ? (view.turn ?? 0) : 0) * (p - 0.5)}deg) scale(${view.scale * bump * 1.02 * kick})`,
  };
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: INK,
        transform: `translateX(${(1 - arrive) * 100 - gone * 26}%) scale(${1 + (1 - arrive) * 0.08})`,
        filter: arrive < 1 ? `blur(${(1 - arrive) * 10}px)` : gone > 0 ? `brightness(${1 - gone * 0.45})` : undefined,
      }}
    >
      {shot.framing === "clip" && shot.photo.motion ? (
        <OffthreadVideo src={source(shot.photo.motion.src)} muted style={{ ...media, objectPosition: "50% 50%", transformOrigin: "50% 50%", transform: `scale(${1.03 * bump})` }} />
      ) : (
        <Img src={source(shot.photo.src)} style={media} />
      )}
    </AbsoluteFill>
  );
};

/** How long one photo takes to fade into the next in the steady reel. */
const FADE_SEC = 0.35;
/** How far a steady shot drifts in over its whole time: barely, so the photo never softens. */
const DRIFT = 0.035;

/**
 * One steady shot: the whole photo, over a dark, soft copy of itself that fills the frame, drifting in slowly.
 * A photo shaped close to the frame fills it instead, the same slow drift. It fades in over the shot before.
 */
const SteadyLayer: React.FC<{ shot: Shot; first: boolean }> = ({ shot, first }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const length = shot.end - shot.start;
  const p = Math.min(1, t / Math.max(length, 0.1));
  const fills = hidden(shot.photo, { width, height }) < 0.12;
  const at = focusOf(shot.photo);
  const scale = 1 + DRIFT * Easing.inOut(Easing.quad)(p);
  const show = first ? 1 : interpolate(t, [0, FADE_SEC], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const src = source(shot.photo.src);
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: INK, opacity: show }}>
      {fills ? null : (
        <Img
          src={src}
          style={{ position: "absolute", inset: -60, width: width + 120, height: height + 120, objectFit: "cover", filter: "blur(36px) brightness(0.5) saturate(1.1)" }}
        />
      )}
      <Img
        src={src}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: fills ? "cover" : "contain",
          objectPosition: fills ? `${at.x}% ${at.y}%` : "50% 50%",
          transformOrigin: fills ? `${at.x}% ${at.y}%` : "50% 50%",
          transform: `scale(${scale})`,
          filter: fills ? undefined : "drop-shadow(0 24px 48px rgba(0,0,0,0.55))",
        }}
      />
    </AbsoluteFill>
  );
};

/** The first half second: the ad's other photos, one after another, before the first one lands. */
const Opening: React.FC<{ photos: Photo[] }> = ({ photos }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const index = Math.floor(t / FLASH_SEC);
  const photo = photos[index];
  if (!photo) return null;
  const p = (t - index * FLASH_SEC) / FLASH_SEC;
  const at = focusOf(photo);
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: INK }}>
      <Img
        src={source(photo.src)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${at.x}% ${at.y}%`,
          transformOrigin: `${at.x}% ${at.y}%`,
          transform: `scale(${interpolate(p, [0, 1], [1.3, 1.16])})`,
        }}
      />
    </AbsoluteFill>
  );
};

/** A flash of white on a cut to a new photo, gone in a few frames. */
const Flashes: React.FC<{ at: number[] }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const since = Math.min(...at.map((s) => frame - Math.round(s * fps)).filter((n) => n >= 0), 99);
  if (since > 5) return null;
  return <AbsoluteFill style={{ backgroundColor: "#fff", opacity: interpolate(since, [0, 5], [0.42, 0]) }} />;
};

/** The headline, large, while the first line is said: each word lands hard, the last on the brand's colour. */
const Hook: React.FC<{ text: string; ratio: Ratio; accent: string; until: number; now?: boolean }> = ({ text, ratio, accent, until, now = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = ZONES[ratio].head;
  const words = text.trim().split(/\s+/);
  const base = text.length <= 14 ? 138 : text.length <= 22 ? 120 : text.length <= 32 ? 98 : 80;
  const size = Math.round(base * (ratio === "9x16" ? 1 : 0.76));
  const leave = interpolate(frame / fps, [until - 0.22, until], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  if (leave >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: (1080 - WIDE) / 2,
        width: WIDE,
        top: zone.top - 10,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: size * 0.24,
        rowGap: size * 0.1,
        opacity: 1 - leave,
        transform: `translateY(${-leave * 80}px)`,
      }}
    >
      {words.map((word, i) => {
        // Opening on a before, the headline is there from the first frame: it is what stops the scroll.
        const land = now ? 1 : spring({ frame: frame - 3 - i * 5, fps, config: { damping: 11, mass: 0.55, stiffness: 190 } });
        const last = i === words.length - 1;
        return (
          <span
            key={i}
            style={{
              fontFamily: display,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.04,
              letterSpacing: -2,
              textTransform: "uppercase",
              color: last ? INK : "#fff",
              backgroundColor: last ? accent : undefined,
              padding: last ? `${size * 0.02}px ${size * 0.16}px` : undefined,
              borderRadius: last ? size * 0.14 : undefined,
              opacity: interpolate(land, [0, 0.25], [0, 1], { extrapolateRight: "clamp" }),
              transform: `scale(${interpolate(land, [0, 1], [1.7, 1])}) rotate(${last ? interpolate(land, [0, 1], [-9, -2.5]) : 0}deg)`,
              textShadow: last ? undefined : "0 6px 0 rgba(8,13,20,0.55), 0 14px 40px rgba(0,0,0,0.6)",
              boxShadow: last ? "0 14px 40px rgba(0,0,0,0.45)" : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Each scene's headline in a steady band across the top: it fades in as its line starts and gives way to the
 * next. Read with the sound off, the headlines alone tell the story: the problem, the turn, the finished work.
 */
const Scenes: React.FC<Pick<AdProps, "lines" | "brand" | "ratio"> & { until: number }> = ({ lines, brand, ratio, until }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = ZONES[ratio].head;
  const size = ratio === "9x16" ? 60 : 50;
  return (
    <>
      {lines.map((line, i) => {
        if (!line.label) return null;
        const from = Math.round((line.start + 0.05) * fps);
        const to = Math.round((Math.min(lines[i + 1]?.start ?? until, until) - 0.05) * fps);
        if (frame < from || frame > to + 5) return null;
        const show = interpolate(frame - from, [0, 6], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) * interpolate(frame - to, [0, 5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (1080 - WIDE) / 2,
              width: WIDE,
              top: zone.top + (ratio === "9x16" ? 20 : 0),
              display: "flex",
              justifyContent: "center",
              opacity: show,
              transform: `translateY(${(1 - show) * -16}px)`,
            }}
          >
            <div
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: size,
                lineHeight: 1.12,
                letterSpacing: -1,
                textAlign: "center",
                color: "#fff",
                backgroundColor: `${INK}d9`,
                borderLeft: `${size * 0.16}px solid ${brand.accentColor}`,
                padding: `${size * 0.3}px ${size * 0.46}px`,
                borderRadius: size * 0.14,
                boxShadow: "0 18px 50px rgba(0,0,0,0.4)",
              }}
            >
              {line.label}
            </div>
          </div>
        );
      })}
    </>
  );
};

/**
 * The reel. The job's photos fill the whole frame and are cut like footage:
 * a few shots to every spoken line, wide then close, a new photo arriving
 * with a move. The headline is big while the first line is said, then each
 * line's headline sits in a band across the top.
 *
 * An ad that opens on a before starts on it, still, with the headline over it:
 * no quick flashes of finished work first, which would give the story away.
 * The one flash is on the reveal, when the first finished photo lands.
 */
export const Reel: React.FC<AdProps & { shots: Shot[]; until: number }> = ({ shots, photos, lines, headline, brand, ratio, until, punch, sound, steady }) => {
  const { fps } = useVideoConfig();
  if (steady !== false) {
    return (
      <>
        {shots.map((shot, i) => {
          const from = Math.round(shot.start * fps);
          // Each shot stays up a moment past its end, under the next one fading in.
          const length = Math.max(1, Math.round((shot.end + (shots[i + 1] ? FADE_SEC : 0.6)) * fps) - from);
          return (
            <Sequence key={i} from={from} durationInFrames={length} layout="none">
              <SteadyLayer shot={shot} first={i === 0} />
            </Sequence>
          );
        })}
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}d9 0%, ${INK}66 16%, ${INK}00 34%, ${INK}00 62%, ${INK}73 80%, ${INK}cc 100%)` }} />
        <Hook text={headline} ratio={ratio} accent={brand.accentColor} until={(lines[1]?.start ?? until) - 0.1} now={onBefore(photos, lines, 0)} />
        <Scenes lines={lines} brand={brand} ratio={ratio} until={until} />
      </>
    );
  }
  // The opening shows two of the ad's other photos first, so the first thing seen is already moving; never one a line calls the before.
  const before = new Set(lines.flatMap((_, i) => (onBefore(photos, lines, i) ? [photosOf(photos, lines, i)[0]?.src] : [])));
  const others = onBefore(photos, lines, 0) ? [] : photos.filter((ph, i) => ph.src !== photos[0]?.src && !before.has(ph.src) && photos.findIndex((q) => q.src === ph.src) === i).slice(0, 2);
  const openingSec = others.length * FLASH_SEC;
  const reveal = revealOf(photos, lines);
  const flashes = [...others.map((_, i) => (i + 1) * FLASH_SEC), ...(reveal > 0 ? [shots.find((s) => s.line === reveal)?.start ?? lines[reveal].start] : [])];
  return (
    <>
      {shots.map((shot, i) => {
        const leaves = Boolean(shots[i + 1]?.opens);
        const from = Math.round(shot.start * fps);
        const length = Math.max(1, Math.round((shot.end + (leaves ? MOVE_SEC : 0)) * fps) - from);
        return (
          <Sequence key={i} from={from} durationInFrames={length} layout="none">
            <ShotLayer shot={shot} leaves={leaves} seed={i} punch={punch} beats={sound?.beats} />
          </Sequence>
        );
      })}
      {others.length ? (
        <Sequence durationInFrames={Math.round(openingSec * fps)} layout="none">
          <Opening photos={others} />
        </Sequence>
      ) : null}
      {flashes.length ? <Flashes at={flashes} /> : null}
      {/* Dark at the top and bottom so the words read on any photo. */}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}d9 0%, ${INK}66 16%, ${INK}00 34%, ${INK}00 62%, ${INK}73 80%, ${INK}cc 100%)` }} />
      <Hook text={headline} ratio={ratio} accent={brand.accentColor} until={(lines[1]?.start ?? until) - 0.1} now={onBefore(photos, lines, 0)} />
      <Scenes lines={lines} brand={brand} ratio={ratio} until={until} />
    </>
  );
};
