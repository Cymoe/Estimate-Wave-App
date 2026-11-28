import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { body, display } from "../theme";
import { askAt } from "../timing";
import type { AdProps } from "../types";

/** The one bright colour every move is keyed to. */
const SIGNAL = "#3d8bff";
const NO_PREP = "#ff4d3d";
const BOARD = "#0f0f10";

/** Where things sit, in pixels, for each size: a strict grid with a 60px margin. */
const GRID = {
  "9x16": { meta: 150, head: 205, headH: 290, box: 520, boxH: 860, title: 104, index: 190, label: 62 },
  "4x5": { meta: 92, head: 128, headH: 175, box: 322, boxH: 628, title: 74, index: 128, label: 44 },
} as const;

const ease = Easing.bezier(0.7, 0, 0.2, 1);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A checklist in the Swiss style: a dark board ruled into a grid, heavy
 * left-aligned type, one signal colour, and every move a hard, quick wipe.
 * Each line's photo wipes into the same grid box over the last; a point opens
 * on a huge step number and its name, with the corner a no-prep quote cuts
 * struck through on the photo. Words only come from the ad; the photos are
 * the job's own.
 */
export const Swiss: React.FC<AdProps & { tag?: string }> = ({ lines, ratio, headline, tag, photos }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const g = GRID[ratio];
  const closeAt = askAt(lines);
  const isPoint = (i: number) => i > 0 && i < lines.length - 1 && !!lines[i].label;
  const points = lines.map((_, i) => i).filter(isPoint);
  let now = 0;
  lines.forEach((l, i) => {
    if (t >= (i === 0 ? 0 : l.start - 0.05)) now = i;
  });
  const wipe = (at: number, frames = 10) => interpolate(frame - Math.round(at * fps), [0, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const step = points.indexOf(now) + 1;
  const firstPointAt = points.length ? lines[points[0]].start - 0.05 : closeAt;

  // The rule under the meta row draws across at the start and again on every new step.
  const rule = wipe(now === 0 ? 0 : lines[now].start - 0.05, 14);

  return (
    <AbsoluteFill style={{ backgroundColor: BOARD }}>
      {/* The grid: six columns and a baseline every 120px, faint. */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "160px 100%, 100% 120px",
          backgroundPosition: "60px 0, 0 0",
        }}
      />

      {/* Meta row: brand, subject, step count. */}
      <div style={{ position: "absolute", left: 60, right: 60, top: g.meta, display: "flex", justifyContent: "space-between", fontFamily: body, fontWeight: 600, fontSize: ratio === "9x16" ? 26 : 22, letterSpacing: 3, color: "rgba(255,255,255,0.75)" }}>
        <span>{(tag ?? "").toUpperCase()}</span>
        <span style={{ color: step ? SIGNAL : "rgba(255,255,255,0.75)" }}>
          {pad(step)} / {pad(points.length)}
        </span>
      </div>
      <div style={{ position: "absolute", left: 60, top: g.meta + (ratio === "9x16" ? 44 : 36), height: 3, width: 960 * rule, backgroundColor: step ? SIGNAL : "#fff" }} />

      {/* The photos: each wipes into the same box over the one before. */}
      {lines.map((line, i) => {
        const at = i === 0 ? 0 : line.start - 0.05;
        if (t < at || i > now) return null;
        // Only the one being covered and the one covering it need drawing.
        if (i < now - 1) return null;
        const p = photos[Math.min(i, photos.length - 1)];
        if (!p) return null;
        const reveal = i === 0 ? wipe(0.05, 12) : wipe(at);
        const until = lines[i + 1]?.start ?? closeAt + 0.6;
        const zoom = interpolate(t, [at, until], [1.0, 1.05], { extrapolateRight: "clamp" });
        const focus = p.focus?.[0] ?? { x: 50, y: 50 };
        return (
          <div key={i} style={{ position: "absolute", left: 60, top: g.box, width: 960, height: g.boxH, overflow: "hidden", clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)` }}>
            <Img
              src={source(p.src)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focus.x}% ${focus.y}%`, transform: `scale(${zoom})`, transformOrigin: `${focus.x}% ${focus.y}%` }}
            />
            {/* The signal edge that leads the wipe. */}
            {reveal < 1 ? <div style={{ position: "absolute", top: 0, bottom: 0, left: `${reveal * 100}%`, width: 14, marginLeft: -14, backgroundColor: SIGNAL }} /> : null}
          </div>
        );
      })}

      {/* The title: heavy, left-aligned, each word rising out of its own line; gone when the first step comes. */}
      {t < firstPointAt + 0.3 ? (
        <div
          style={{
            position: "absolute",
            left: 60,
            width: 960,
            top: g.head,
            display: "flex",
            flexWrap: "wrap",
            columnGap: g.title * 0.26,
            clipPath: `inset(0 0 0 ${wipe(firstPointAt, 8) * 100}%)`,
          }}
        >
          {headline
            .split(/\s+/)
            .filter(Boolean)
            .map((w, k, all) => {
              const up = interpolate(frame - k * 2, [0, 9], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
              return (
                <span key={k} style={{ display: "inline-block", overflow: "hidden", lineHeight: 1.02, paddingBottom: 6 }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontFamily: display,
                      fontWeight: 800,
                      fontSize: g.title,
                      letterSpacing: -3,
                      color: k === all.length - 1 || /\d/.test(w) ? SIGNAL : "#fff",
                      transform: `translateY(${up * 110}%)`,
                    }}
                  >
                    {w}
                  </span>
                </span>
              );
            })}
        </div>
      ) : null}

      {/* A step: the huge number, the prepped way, ticked once said; the no-prep corner struck through on the photo. */}
      {points.map((i, k) => {
        const line = lines[i];
        const at = line.start - 0.05;
        const until = lines[i + 1]?.start ?? closeAt;
        if (t < at || t >= until) return null;
        const num = wipe(at, 9);
        // With a no-prep corner up first, the prepped way comes in a beat later.
        const labelAt = line.skip ? line.start + Math.min(1.2, (line.end - line.start) * 0.4) : at + 0.15;
        const label = wipe(labelAt, 9);
        const doneAt = until - 0.6;
        const tick = wipe(doneAt, 7);
        const skipIn = wipe(at + 0.25, 8);
        const strike = wipe(at + 0.7, 8);
        return (
          <div key={i}>
            <div style={{ position: "absolute", left: 50, top: g.head + (g.headH - g.index) / 2 - g.index * 0.05, height: g.index * 1.02, overflow: "hidden" }}>
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: g.index,
                  lineHeight: 1,
                  letterSpacing: -10,
                  color: SIGNAL,
                  transform: `translateY(${(1 - num) * 100}%)`,
                }}
              >
                {pad(k + 1)}
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                left: 60 + g.index * 1.3,
                right: 60,
                top: g.head + g.headH * 0.1,
                height: g.headH * 0.8,
                display: "flex",
                alignItems: "center",
                gap: 22,
                clipPath: `inset(0 ${(1 - label) * 100}% 0 0)`,
              }}
            >
              <div
                style={{
                  width: g.label * 0.9,
                  height: g.label * 0.9,
                  flexShrink: 0,
                  border: `5px solid ${SIGNAL}`,
                  backgroundColor: tick > 0 ? SIGNAL : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                }}
              >
                {tick > 0 ? (
                  <svg width="70%" height="70%" viewBox="0 0 40 40">
                    <path d="M7 21 L16 30 L33 10" stroke={BOARD} strokeWidth="7" fill="none" strokeLinecap="square" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - tick)} />
                  </svg>
                ) : null}
              </div>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: g.label, lineHeight: 1.02, letterSpacing: -1.5, color: "#fff" }}>{line.label}</div>
            </div>
            {line.skip ? (
              <div
                style={{
                  position: "absolute",
                  left: 60,
                  top: g.box + g.boxH - (ratio === "9x16" ? 150 : 120),
                  backgroundColor: BOARD,
                  padding: ratio === "9x16" ? "18px 28px 20px" : "12px 22px 14px",
                  clipPath: `inset(0 ${(1 - skipIn) * 100}% 0 0)`,
                  maxWidth: 900,
                }}
              >
                <div style={{ fontFamily: body, fontWeight: 600, fontSize: ratio === "9x16" ? 24 : 19, letterSpacing: 4, color: NO_PREP }}>NO PREP</div>
                <div style={{ position: "relative", fontFamily: display, fontWeight: 800, fontSize: g.label * 0.72, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>
                  {line.skip}
                  <div style={{ position: "absolute", left: -4, top: "52%", height: 6, width: `calc(${strike * 100}% + 8px)`, backgroundColor: NO_PREP }} />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
