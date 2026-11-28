import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { isKey, jolt, keyWords, pop, quick, thump, turnOf } from "../parts/motion";
import { body, display, INK } from "../theme";
import { askAt, chunksOf, wordsOf } from "../timing";
import type { AdProps } from "../types";

const NO_PREP = "#ff5a4f";

/**
 * Kinetic type: the words are the picture. Each word hits the screen the
 * moment it is said, one to three at a time, stacked big, with the words that
 * name the point in the accent colour on a highlighter. The line's own photo
 * sits dark behind and kicks on every beat. A point's no-prep half is in red
 * under a NO PREP tag; once the line is done, its name lands up top with a tick.
 * There are no captions: these words are the captions.
 */
export const Kinetic: React.FC<AdProps & { tag?: string }> = ({ lines, ratio, headline, tag, photos, brand, sound }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const tall = ratio === "9x16";
  const beats = sound?.beats ?? [];
  const closeAt = askAt(lines);
  const words = wordsOf(lines);
  const chunks = chunksOf(words, 13, 3);
  const accent = brand.accentColor;

  let now = 0;
  lines.forEach((l, i) => {
    if (t >= (i === 0 ? 0 : l.start - 0.05)) now = i;
  });
  const line = lines[now];
  const isPoint = now > 0 && now < lines.length - 1 && !!line.label;
  const points = lines.map((_, i) => i).filter((i) => i > 0 && i < lines.length - 1 && !!lines[i].label);
  const step = points.indexOf(now) + 1;
  const turn = isPoint ? turnOf(words, lines, now) : 0;
  const until = lines[now + 1]?.start ?? closeAt;
  const lineAt = now === 0 ? 0 : line.start - 0.05;

  // The photo: dark, cut in hard on the line with a white flash, kicking on each beat.
  const p = photos[Math.min(now, photos.length - 1)];
  const enter = quick(frame, fps, lineAt, 10);
  const kick = thump(t, beats);
  const flash = now === 0 ? 0 : 1 - quick(frame, fps, lineAt, 5);
  const focus = p?.focus?.[0] ?? { x: 50, y: 50 };

  // The words said now: the chunk whose first word has started, until the next one starts.
  const ci = chunks.findIndex((c, i) => t >= c[0].start - 0.06 && t < (chunks[i + 1]?.[0].start ?? c[c.length - 1].end + 0.6) - 0.06);
  // A chunk shows only while its own line is on: a new line starts clean.
  const chunk = ci >= 0 && chunks[ci][0].line < lines.length - 1 && chunks[ci][0].line === now ? chunks[ci] : null;
  const keys = keyWords(line);
  const red = isPoint && !!line.skip && chunk !== null && chunk[0].start < turn - 0.02;
  const longest = chunk ? Math.max(...chunk.map((w) => w.text.length)) : 1;
  const size = Math.round(Math.min(tall ? 180 : 150, 1240 / Math.max(5, longest)));

  // Once the line has been said, its name lands up top with a tick.
  const doneAt = until - 0.6;
  const done = isPoint && t >= doneAt ? pop(frame, fps, doneAt) : 0;
  const shake = jolt(frame, fps, doneAt, 12);

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {p ? (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <Img
            src={source(p.src)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: `${focus.x}% ${focus.y}%`,
              transform: `scale(${1.14 - 0.12 * enter + 0.03 * kick})`,
              filter: `brightness(${chunk ? 0.5 : 0.75}) saturate(0.95)`,
            }}
          />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash * 0.55 }} />

      {/* Top: the subject and the headline at the start; the step count after. */}
      <div style={{ position: "absolute", left: 60, right: 60, top: tall ? 170 : 96, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 28 : 22, letterSpacing: 4, color: "rgba(255,255,255,0.8)" }}>{(tag ?? "").toUpperCase()}</div>
        {step ? (
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 40 : 32, color: accent, transform: `scale(${0.6 + 0.4 * pop(frame, fps, lineAt)})` }}>
            {step}/{points.length}
          </div>
        ) : null}
      </div>
      {now === 0 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: tall ? 220 : 134, fontFamily: display, fontWeight: 800, fontSize: tall ? 58 : 44, lineHeight: 1.05, color: "#fff", opacity: quick(frame, fps, 0, 6) }}>
          {headline}
        </div>
      ) : null}

      {/* The words, hitting as they are said. */}
      {chunk ? (
        <div
          style={{
            position: "absolute",
            left: 50,
            right: 50,
            top: height * (tall ? 0.5 : 0.52),
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {red ? <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 30 : 24, letterSpacing: 6, color: NO_PREP, marginBottom: 10 }}>NO PREP</div> : null}
          {isPoint && !red && line.skip && chunk[0].line === now ? (
            <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 30 : 24, letterSpacing: 6, color: accent, marginBottom: 10 }}>PREP</div>
          ) : null}
          {chunk.map((w, k) => {
            const at = w.start - 0.04;
            if (t < at) return <div key={k} style={{ height: size * 1.02 }} />;
            const land = pop(frame, fps, at, 0.9);
            const blur = Math.max(0, (1 - quick(frame, fps, at, 4)) * 10);
            const key = !red && isKey(keys, w.text);
            const mark = quick(frame, fps, at + 0.06, 6);
            return (
              <div key={k} style={{ position: "relative", height: size * 1.02, display: "flex", alignItems: "center" }}>
                {key ? <div style={{ position: "absolute", left: -14, right: -14, top: "16%", bottom: "8%", backgroundColor: accent, transform: `scaleX(${mark})`, transformOrigin: "left", borderRadius: 6 }} /> : null}
                <div
                  style={{
                    position: "relative",
                    fontFamily: display,
                    fontWeight: 800,
                    fontSize: size,
                    letterSpacing: -2,
                    textTransform: "uppercase",
                    color: red ? NO_PREP : key ? INK : "#fff",
                    transform: `scale(${interpolate(land, [0, 1], [1.3, 1])}) translateY(${(1 - land) * 30}px)`,
                    filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined,
                    textShadow: key ? undefined : "0 6px 30px rgba(0,0,0,0.45)",
                  }}
                >
                  {w.text.replace(/[.,!?]$/, "")}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Done: the point's name and a tick, slammed in up top. */}
      {done > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: tall ? 260 : 150,
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: tall ? "22px 30px" : "16px 24px",
            backgroundColor: accent,
            borderRadius: 10,
            transform: `translate(${shake.x}px, ${shake.y}px) scale(${interpolate(done, [0, 1], [1.4, 1])})`,
            opacity: Math.min(1, done * 3),
          }}
        >
          <svg width={tall ? 70 : 54} height={tall ? 70 : 54} viewBox="0 0 40 40">
            <path d="M6 21 L16 31 L34 9" stroke={INK} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - Math.min(1, done))} />
          </svg>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 62 : 46, lineHeight: 1, color: INK }}>{line.label}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
