import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { HARD, jolt, pop, quick, SNAP, turnOf } from "../parts/motion";
import { body, display, INK } from "../theme";
import { askAt, wordsOf } from "../timing";
import type { AdProps } from "../types";

const RED = "#c8322b";

/**
 * Split screen: each point is a face-off. The no-prep corner slams down and
 * fills the screen in red. When the voice turns to the prepped way, the real
 * prep photo pushes up from below and shoves the red into a band at the top,
 * a VS badge spins in on the seam, and the red words get struck. Once said,
 * the photo shoves the red off entirely and the point's name is ticked.
 * The red side is words only: we never show a photo as the no-prep way.
 */
export const Versus: React.FC<AdProps & { tag?: string }> = ({ lines, ratio, headline, tag, photos, brand }) => {
  const frame = useCurrentFrame();
  const { fps, height: H } = useVideoConfig();
  const t = frame / fps;
  const tall = ratio === "9x16";
  const closeAt = askAt(lines);
  const words = wordsOf(lines);
  const accent = brand.accentColor;
  let now = 0;
  lines.forEach((l, i) => {
    if (t >= (i === 0 ? 0 : l.start - 0.05)) now = i;
  });
  const line = lines[now];
  const lineAt = now === 0 ? 0 : line.start - 0.05;
  const until = lines[now + 1]?.start ?? closeAt;
  const isPoint = now > 0 && now < lines.length - 1 && !!line.label;
  const points = lines.map((_, i) => i).filter((i) => i > 0 && i < lines.length - 1 && !!lines[i].label);
  const step = points.indexOf(now) + 1;
  const p = photos[Math.min(now, photos.length - 1)];
  const focus = p?.focus?.[0] ?? { x: 50, y: 50 };
  const turn = isPoint ? (line.skip ? turnOf(words, lines, now) : lineAt) : 0;
  const doneAt = until - 0.6;

  // Where the seam is: the red covers the screen down to it, the photo fills below.
  const slam = quick(frame, fps, lineAt, 9, SNAP);
  const push = quick(frame, fps, turn - 0.1, 12, SNAP);
  const shove = quick(frame, fps, doneAt, 10, HARD);
  const band = tall ? 0.34 : 0.36;
  const seam = !isPoint || !line.skip ? 0 : H * (slam * interpolate(push, [0, 1], [1, band]) * (1 - shove));
  const redText = pop(frame, fps, lineAt + 0.12);
  const strike = quick(frame, fps, turn + 0.45, 8);
  const vs = pop(frame, fps, turn + 0.05, 0.9);
  const labelIn = quick(frame, fps, turn + 0.3, 10);
  const tick = pop(frame, fps, doneAt);
  const shake = jolt(frame, fps, turn - 0.02, 14);
  const tickShake = jolt(frame, fps, doneAt, 9);
  // Once squeezed into the band, the red words sit on one line so the strike runs through all of them.
  const redSize = Math.round(Math.min(interpolate(push, [0, 1], [tall ? 128 : 96, tall ? 66 : 52]), push > 0.5 ? (tall ? 1600 : 1480) / Math.max(10, (line.skip ?? "").length) : 999));
  // While the red holds the screen it creeps in, so it never sits still.
  const creep = interpolate(t, [lineAt, Math.max(turn, lineAt + 0.1)], [1, 1.06], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {/* The photo, below the seam. */}
      {p ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: seam, bottom: 0, overflow: "hidden", transform: `translate(${shake.x}px, ${shake.y}px)` }}>
          <Img
            src={source(p.src)}
            style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: H, objectFit: "cover", objectPosition: `${focus.x}% ${focus.y}%`, transform: `scale(${1.08 - 0.06 * quick(frame, fps, lineAt, 20)})` }}
          />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${INK}${now === 0 ? "b0" : "60"} 0%, ${INK}00 30%, ${INK}00 62%, ${INK}cc 100%)` }} />
        </div>
      ) : null}

      {/* The opening: the headline, slammed in with the photo behind. */}
      {now === 0 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: tall ? 200 : 120 }}>
          <div style={{ display: "inline-block", fontFamily: body, fontWeight: 600, fontSize: tall ? 26 : 20, letterSpacing: 5, color: INK, backgroundColor: accent, padding: "8px 16px", transform: `scaleX(${quick(frame, fps, 0, 7)})`, transformOrigin: "left" }}>
            {(tag ?? "").toUpperCase()}
          </div>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 92 : 70, lineHeight: 1.02, color: "#fff", marginTop: 14, textShadow: "0 6px 30px rgba(0,0,0,0.5)" }}>
            {headline.split(/\s+/).map((w, k) => {
              const s = pop(frame, fps, k * 0.035 - 0.3);
              return (
                <span key={k} style={{ display: "inline-block", marginRight: "0.22em", transform: `scale(${interpolate(s, [0, 1], [1.8, 1])})`, opacity: Math.min(1, s * 3), color: /\d/.test(w) ? accent : "#fff" }}>
                  {w}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {isPoint ? (
        <>
          {/* The red: no prep, words only. */}
          {seam > 1 ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: seam, backgroundColor: RED, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 60, right: 60, top: 0, height: Math.min(seam, H * 0.62), display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: tall ? 100 : 78, boxSizing: "border-box" }}>
              <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 28 : 22, letterSpacing: 6, color: "rgba(255,255,255,0.75)" }}>NO PREP</div>
              <div style={{ position: "relative", alignSelf: "flex-start", fontFamily: display, fontWeight: 800, fontSize: redSize, lineHeight: 1.04, color: "#fff", whiteSpace: push > 0.5 ? "nowrap" : undefined, transform: `scale(${interpolate(redText, [0, 1], [1.15, 1]) * (push > 0 ? 1 : creep)})`, transformOrigin: "left bottom", opacity: Math.min(1, redText * 3) }}>
                {line.skip}
                <div style={{ position: "absolute", left: -6, top: "50%", height: tall ? 10 : 8, width: `calc(${strike * 100}% + 12px)`, backgroundColor: INK }} />
              </div>
              </div>
            </div>
          ) : null}

          {/* The seam and its VS badge. */}
          {seam > 1 && push > 0 ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: seam,
                width: tall ? 150 : 120,
                height: tall ? 150 : 120,
                marginLeft: tall ? -75 : -60,
                marginTop: tall ? -75 : -60,
                borderRadius: "50%",
                backgroundColor: "#fff",
                border: `8px solid ${INK}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: display,
                fontWeight: 800,
                fontSize: tall ? 60 : 48,
                color: INK,
                transform: `scale(${vs * (1 - shove)}) rotate(${(1 - vs) * -200}deg)`,
              }}
            >
              VS
            </div>
          ) : null}

          {/* The prepped way, on the photo, ticked once said. */}
          {t >= turn + 0.3 ? (
            <div
              style={{
                position: "absolute",
                left: 60,
                right: 60,
                top: Math.max(seam + (tall ? 110 : 84), tall ? 300 : 180),
                transform: `translateY(${(1 - labelIn) * 120}px) translate(${tickShake.x}px, ${tickShake.y}px)`,
                opacity: Math.min(1, labelIn * 2),
              }}
            >
              <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 28 : 22, letterSpacing: 6, color: accent, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
                PREP · STEP {step} OF {points.length}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8 }}>
                <div style={{ width: tall ? 76 : 58, height: tall ? 76 : 58, flexShrink: 0, borderRadius: "50%", backgroundColor: t >= doneAt ? (line.mark === "cross" ? RED : accent) : "rgba(255,255,255,0.2)", border: `5px solid ${line.mark === "cross" ? RED : accent}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${t >= doneAt ? interpolate(tick, [0, 1], [1.6, 1]) : 1})` }}>
                  {t >= doneAt ? (
                    <svg width="62%" height="62%" viewBox="0 0 40 40">
                      <path d={line.mark === "cross" ? "M10 10 L30 30 M30 10 L10 30" : "M6 21 L16 31 L34 9"} stroke={line.mark === "cross" ? "#fff" : INK} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - Math.min(1, tick))} />
                    </svg>
                  ) : null}
                </div>
                <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 74 : 54, lineHeight: 1.02, color: "#fff", textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}>{line.label}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};
