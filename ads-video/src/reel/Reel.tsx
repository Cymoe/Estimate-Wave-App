import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { display, INK, WIDE, ZONES } from "../theme";
import type { AdProps, Photo, Ratio } from "../types";
import type { Shot } from "./shots";

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
const ShotLayer: React.FC<{ shot: Shot; leaves: boolean; seed: number }> = ({ shot, leaves, seed }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const length = shot.end - shot.start;
  const p = t / length;
  const view = framed(shot, p, width, height);
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
    transform: `translate(${sway}px, ${bob}px) rotate(${("turn" in view ? (view.turn ?? 0) : 0) * (p - 0.5)}deg) scale(${view.scale * bump * 1.02})`,
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
const Hook: React.FC<{ text: string; ratio: Ratio; accent: string; until: number }> = ({ text, ratio, accent, until }) => {
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
        const land = spring({ frame: frame - 3 - i * 5, fps, config: { damping: 11, mass: 0.55, stiffness: 190 } });
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

/** A line's label as a sticker slapped on the picture: it lands with a bounce, leans a little, and peels off when the line is over. */
const Stickers: React.FC<Pick<AdProps, "lines" | "brand" | "ratio"> & { until: number }> = ({ lines, brand, ratio, until }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = ZONES[ratio].head;
  return (
    <>
      {lines.map((line, i) => {
        if (!line.label) return null;
        const from = Math.round((line.start + 0.1) * fps);
        const to = Math.round((Math.min(lines[i + 1]?.start ?? until, until) - 0.1) * fps);
        if (frame < from || frame > to + 6) return null;
        const land = spring({ frame: frame - from, fps, config: { damping: 9, mass: 0.6, stiffness: 170 } });
        const peel = interpolate(frame - to, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const lean = i % 2 === 0 ? -4 : 3;
        const size = ratio === "9x16" ? 64 : 52;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 60,
              top: zone.top + (ratio === "9x16" ? 30 : 10),
              transformOrigin: "0% 50%",
              opacity: interpolate(land, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }) * (1 - peel),
              transform: `rotate(${lean + (1 - land) * -10 + peel * 8}deg) scale(${interpolate(land, [0, 1], [0.4, 1]) * (1 - peel * 0.3)})`,
            }}
          >
            <div
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: size,
                lineHeight: 1,
                letterSpacing: -1,
                textTransform: "uppercase",
                color: INK,
                backgroundColor: "#fff",
                padding: `${size * 0.34}px ${size * 0.5}px`,
                borderRadius: size * 0.22,
                boxShadow: `${size * 0.16}px ${size * 0.16}px 0 ${brand.primaryColor}, 0 24px 60px rgba(0,0,0,0.5)`,
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
 * with a move and a flash. The headline is big while the first line is said,
 * then each line's label is stuck on the picture.
 */
export const Reel: React.FC<AdProps & { shots: Shot[]; until: number; flash?: Photo[] }> = ({ shots, photos, lines, headline, brand, ratio, until, flash }) => {
  const { fps } = useVideoConfig();
  // The opening shows other photos first, so the first thing seen is already moving: ones the ad has to spare, or else two it shows later.
  const others = flash?.length ? flash.slice(0, 2) : photos.filter((ph, i) => ph.src !== photos[0]?.src && photos.findIndex((q) => q.src === ph.src) === i).slice(0, 2);
  const openingSec = others.length * FLASH_SEC;
  const moves = shots.filter((s) => s.opens && s.start > 0).map((s) => s.start);
  return (
    <>
      {shots.map((shot, i) => {
        const leaves = Boolean(shots[i + 1]?.opens);
        const from = Math.round(shot.start * fps);
        const length = Math.max(1, Math.round((shot.end + (leaves ? MOVE_SEC : 0)) * fps) - from);
        return (
          <Sequence key={i} from={from} durationInFrames={length} layout="none">
            <ShotLayer shot={shot} leaves={leaves} seed={i} />
          </Sequence>
        );
      })}
      {others.length ? (
        <Sequence durationInFrames={Math.round(openingSec * fps)} layout="none">
          <Opening photos={others} />
        </Sequence>
      ) : null}
      <Flashes at={[...others.map((_, i) => (i + 1) * FLASH_SEC), ...moves]} />
      {/* Dark at the top and bottom so the words read on any photo. */}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}d9 0%, ${INK}66 16%, ${INK}00 34%, ${INK}00 62%, ${INK}73 80%, ${INK}cc 100%)` }} />
      <Hook text={headline} ratio={ratio} accent={brand.accentColor} until={(lines[1]?.start ?? until) - 0.1} />
      <Stickers lines={lines} brand={brand} ratio={ratio} until={until} />
    </>
  );
};
