import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { body, display, INK, ZONES } from "../theme";
import { phrasesOf, wordsOf } from "../timing";
import type { AdProps, Photo } from "../types";

/** A link stays a link; anything else is a file under public/. */
const src = (s: string) => (/^https?:\/\//.test(s) ? s : staticFile(s));

export type PlainLook = "cuts" | "drift" | "line";

/**
 * The plain looks (samples for the owner, Nov 2026): the job's photos and the voice, and almost nothing else.
 * No title, no labels, no checklist, no sound effects, no flashes.
 *
 * - cuts: each photo fills the frame and is cut to hard as its line starts; small subtitles; nothing moves.
 * - drift: each photo moves in very slowly and the next one fades over it; small subtitles.
 * - line: no subtitles; each photo holds with its one line of text along the bottom.
 *
 * All three end the same way: the picture fades to the brand's colour with its name and "Get a free quote".
 */
export const Plain: React.FC<AdProps & { look: PlainLook }> = ({ look, lines, photos, brand, ratio, audio, audioSec }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  // The last line is the ask: the end card comes up as it starts.
  const closeAt = lines[lines.length - 1]?.start ?? audioSec;
  const shown = lines.slice(0, -1).map((l, i) => ({ line: l, photo: photos[i] ?? photos[photos.length - 1], from: i === 0 ? 0 : l.start, to: lines[i + 1].start }));
  const FADE = look === "drift" ? 0.5 : 0;
  const zone = ZONES[ratio].captions;
  const end = interpolate(t, [closeAt - 0.1, closeAt + 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chunks = phrasesOf(wordsOf(lines));
  const chunk = chunks.find((c, i) => t >= c[0].start - 0.04 && t < (chunks[i + 1]?.[0].start ?? c[c.length - 1].end + 0.4) - 0.04);
  const now = shown.find((s) => t >= s.from && t < s.to);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {shown.map((s, i) => {
        if (!s.photo || t < s.from - 0.01 || t >= s.to + FADE) return null;
        const opacity = FADE && i > 0 ? interpolate(t, [s.from, s.from + FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
        const scale = look === "drift" ? interpolate(t, [s.from, s.to + FADE], [1, 1.05]) : 1;
        return <Fill key={i} photo={s.photo} width={width} height={height} opacity={opacity} scale={scale} />;
      })}
      {/* A soft shade under the words, so they read on any photo. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.42, background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))" }} />
      <div style={{ position: "absolute", left: 60, top: ZONES[ratio].chip, fontFamily: body, fontWeight: 600, fontSize: 38, color: "#fff", opacity: 0.95, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
        {brand.name}
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, top: zone.top, height: zone.height, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        {look === "line" ? (
          now ? <span style={{ fontFamily: display, fontWeight: 700, fontSize: ratio === "9x16" ? 58 : 50, lineHeight: 1.18, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>{now.line.label ?? now.line.voice}</span> : null
        ) : chunk && chunk[0].line < lines.length - 1 ? (
          <span style={{ fontFamily: body, fontWeight: 600, fontSize: ratio === "9x16" ? 48 : 42, lineHeight: 1.25, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.75)" }}>{chunk.map((w) => w.text).join(" ")}</span>
        ) : null}
      </div>
      {/* The ask: a plain fade to the brand's colour. Nothing bounces. */}
      <AbsoluteFill style={{ backgroundColor: brand.primaryColor, opacity: end, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 84, color: "#fff" }}>{brand.name}</div>
        <div style={{ marginTop: 56, padding: "26px 64px", borderRadius: 70, backgroundColor: "#fff", color: brand.primaryColor, fontFamily: display, fontWeight: 800, fontSize: 52 }}>Get a free quote</div>
      </AbsoluteFill>
      {audio ? <Audio src={src(audio)} /> : null}
    </AbsoluteFill>
  );
};

/**
 * A photo filling the frame. One about the frame's shape is cut to fit; a wide or square one in a tall frame is shown
 * whole over a soft, dark copy of itself, so half the kitchen isn't cut away.
 */
const Fill: React.FC<{ photo: Photo; width: number; height: number; opacity: number; scale: number }> = ({ photo, width, height, opacity, scale }) => {
  const fits = photo.height / photo.width >= (height / width) * 0.72;
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      {fits ? (
        <Img src={src(photo.src)} style={{ width, height, objectFit: "cover", transform: `scale(${scale})` }} />
      ) : (
        <>
          <Img src={src(photo.src)} style={{ width, height, objectFit: "cover", filter: "blur(40px) brightness(0.45)", transform: "scale(1.15)" }} />
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            {/* Cut a little at the sides so it stands taller: a 4:5 window at most, never less than the photo's own shape. */}
            <Img src={src(photo.src)} style={{ width, height: Math.min(height, Math.max((width * photo.height) / photo.width, width * 1.25)), objectFit: "cover", transform: `scale(${scale})` }} />
          </AbsoluteFill>
        </>
      )}
    </AbsoluteFill>
  );
};
