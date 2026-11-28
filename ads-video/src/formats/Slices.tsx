import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { HARD, jolt, pop, quick, snap, SNAP, thump, turnOf } from "../parts/motion";
import { body, display, INK } from "../theme";
import { askAt, wordsOf } from "../timing";
import type { AdProps, Photo } from "../types";

const NO_PREP = "#ff4d3d";
const STRIPS = 6;

/** One photo, cut into strips that fly in from above and below in turn and lock together. */
const Strips: React.FC<{ p: Photo; at: number; kick: number }> = ({ p, at, kick }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const focus = p.focus?.[0] ?? { x: 50, y: 50 };
  const sw = W / STRIPS;
  return (
    <AbsoluteFill>
      {Array.from({ length: STRIPS }, (_, k) => {
        const land = quick(frame, fps, at + k * 0.03, 11, SNAP);
        const from = k % 2 ? -H : H;
        const y = from * (1 - land) + (k % 2 ? -1 : 1) * kick * 6;
        return (
          <div key={k} style={{ position: "absolute", left: k * sw, top: 0, width: Math.ceil(sw) + 1, height: H, overflow: "hidden", transform: `translateY(${y}px)` }}>
            <Img
              src={source(p.src)}
              style={{ position: "absolute", left: -k * sw, top: 0, width: W, height: H, objectFit: "cover", objectPosition: `${focus.x}% ${focus.y}%` }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Slice and stack: hard, graphic and fast. Each line's photo arrives cut into
 * strips that fly in from above and below and lock together on the beat.
 * The headline's words come in on bars from alternate sides. A point opens on
 * its no-prep corner on a red bar; when the voice turns to the prepped way, a
 * white cut runs through the bar and its halves fly apart, and the point's
 * name slides in on a bar in the accent colour, ticked once said.
 */
export const Slices: React.FC<AdProps & { tag?: string }> = ({ lines, ratio, headline, tag, photos, brand, sound }) => {
  const frame = useCurrentFrame();
  const { fps, width: W } = useVideoConfig();
  const t = frame / fps;
  const tall = ratio === "9x16";
  const beats = sound?.beats ?? [];
  const closeAt = askAt(lines);
  const words = wordsOf(lines);
  const accent = brand.accentColor;
  let now = 0;
  lines.forEach((l, i) => {
    if (t >= (i === 0 ? 0 : snap(l.start - 0.05, beats, 0.12))) now = i;
  });
  const line = lines[now];
  const lineAt = now === 0 ? -0.5 : snap(line.start - 0.05, beats, 0.12);
  const until = lines[now + 1]?.start ?? closeAt;
  const isPoint = now > 0 && now < lines.length - 1 && !!line.label;
  const points = lines.map((_, i) => i).filter((i) => i > 0 && i < lines.length - 1 && !!lines[i].label);
  const step = points.indexOf(now) + 1;
  const kick = thump(t, beats);
  const turn = isPoint ? turnOf(words, lines, now) : 0;
  const top = tall ? 250 : 150;
  const barH = tall ? 118 : 88;

  // The no-prep bar is cut at the turn and its halves fly apart.
  const cut = quick(frame, fps, turn - 0.12, 5);
  const apart = quick(frame, fps, turn, 10, HARD);
  const skipIn = quick(frame, fps, lineAt + 0.2, 9);
  const labelAt = line.skip ? turn + 0.08 : lineAt + 0.25;
  const labelIn = quick(frame, fps, labelAt, 10);
  const doneAt = until - 0.6;
  const tick = pop(frame, fps, doneAt);
  const shake = jolt(frame, fps, doneAt, 10);
  const prev = now > 0 ? photos[Math.min(now - 1, photos.length - 1)] : undefined;
  const p = photos[Math.min(now, photos.length - 1)];

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {prev ? <Strips p={prev} at={-10} kick={0} /> : null}
      {p ? <Strips p={p} at={lineAt} kick={kick} /> : null}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}d0 0%, ${INK}40 30%, ${INK}00 45%, ${INK}00 66%, ${INK}cc 100%)` }} />

      {/* The step number, huge and hollow, sliding in with the strips. */}
      {isPoint ? (
        <div
          style={{
            position: "absolute",
            right: 40,
            top: tall ? 470 : 300,
            fontFamily: display,
            fontWeight: 800,
            fontSize: tall ? 300 : 210,
            lineHeight: 1,
            color: accent,
            opacity: 0.92,
            textShadow: "0 10px 40px rgba(0,0,0,0.4)",
            transform: `translateX(${(1 - quick(frame, fps, lineAt + 0.12, 10)) * 500}px)`,
          }}
        >
          {String(step).padStart(2, "0")}
        </div>
      ) : null}

      {/* The headline on bars, each word from alternate sides. */}
      {now === 0 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: top - (tall ? 60 : 40), display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ width: "100%", fontFamily: body, fontWeight: 600, fontSize: tall ? 26 : 20, letterSpacing: 5, color: accent }}>{(tag ?? "").toUpperCase()}</div>
          {headline.split(/\s+/).map((w, k) => {
            const inn = quick(frame, fps, -0.3 + k * 0.045, 9);
            const dir = k % 2 ? 1 : -1;
            const key = /\d/.test(w) || k === headline.split(/\s+/).length - 1;
            return (
              <div
                key={k}
                style={{
                  padding: tall ? "6px 18px" : "4px 14px",
                  backgroundColor: key ? accent : "#fff",
                  color: INK,
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: tall ? 78 : 58,
                  lineHeight: 1.1,
                  transform: `translateX(${dir * (1 - inn) * W}px)`,
                }}
              >
                {w}
              </div>
            );
          })}
        </div>
      ) : null}

      {isPoint ? (
        <>
          {line.skip && t < turn + 0.5 ? (
            <div style={{ position: "absolute", left: 0, top, height: barH, maxWidth: W - 40 }}>
              {/* Sizes the bar to its words; the two drawn halves cover it. */}
              <div style={{ visibility: "hidden", height: barH, display: "flex", alignItems: "center", paddingLeft: 60, paddingRight: 40, gap: 22 }}>
                <span style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 24 : 18, letterSpacing: 4 }}>NO PREP</span>
                <span style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 52 : 38, whiteSpace: "nowrap" }}>{line.skip}</span>
              </div>
              {[0, 1].map((half) => (
                <div
                  key={half}
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: NO_PREP,
                    clipPath: half ? "polygon(0 52%, 100% 40%, 100% 100%, 0 100%)" : "polygon(0 0, 100% 0, 100% 40%, 0 52%)",
                    transform: `translateX(${-(1 - skipIn) * W}px) translate(${apart * (half ? 80 : -60)}px, ${apart * (half ? 180 : -180)}px) rotate(${apart * (half ? 6 : -5)}deg)`,
                    opacity: 1 - apart,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 60,
                    gap: 22,
                  }}
                >
                  <span style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 24 : 18, letterSpacing: 4, color: INK }}>NO PREP</span>
                  <span style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 52 : 38, color: "#fff", whiteSpace: "nowrap" }}>{line.skip}</span>
                </div>
              ))}
              {/* The cut. */}
              {cut > 0 && apart < 1 ? (
                <div style={{ position: "absolute", left: -20, width: `${cut * 110}%`, top: "44%", height: 6, backgroundColor: "#fff", transform: "rotate(-1.2deg)", transformOrigin: "left", boxShadow: "0 0 18px #fff" }} />
              ) : null}
            </div>
          ) : null}

          {t >= labelAt ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: top + (tall ? 0 : 0),
                minHeight: barH,
                maxWidth: W - 120,
                backgroundColor: accent,
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: tall ? "10px 34px 10px 60px" : "8px 26px 8px 60px",
                transform: `translateX(${-(1 - labelIn) * W}px) translate(${shake.x}px, ${shake.y}px)`,
                filter: labelIn < 0.85 ? `blur(${((1 - labelIn) * 12).toFixed(1)}px)` : undefined,
              }}
            >
              <div style={{ width: tall ? 62 : 48, height: tall ? 62 : 48, flexShrink: 0, backgroundColor: INK, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${t >= doneAt ? interpolate(tick, [0, 1], [1.5, 1]) : 1})` }}>
                {t >= doneAt ? (
                  <svg width="70%" height="70%" viewBox="0 0 40 40">
                    <path d="M6 21 L16 31 L34 9" stroke={accent} strokeWidth="7" fill="none" strokeLinecap="square" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - Math.min(1, tick))} />
                  </svg>
                ) : null}
              </div>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 58 : 42, lineHeight: 1.04, color: INK }}>{line.label}</div>
            </div>
          ) : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};
