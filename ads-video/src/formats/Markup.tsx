import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { HARD, jolt, pop, quick, turnOf } from "../parts/motion";
import { body, display, INK } from "../theme";
import { askAt, wordsOf } from "../timing";
import type { AdProps, Photo } from "../types";

/** The marker: a warm yellow that reads on any photo. */
const PEN = "#ffd23f";
const NO_PREP = "#ff5a4f";

/** Where a point of the photo lands on screen when the photo covers the frame. */
const onScreen = (p: Photo, W: number, H: number, at: { x: number; y: number }) => {
  const s = Math.max(W / p.width, H / p.height);
  const w = p.width * s;
  const h = p.height * s;
  return { x: (W - w) * (at.x / 100) + (at.x / 100) * w, y: (H - h) * (at.y / 100) + (at.y / 100) * h };
};

/**
 * The photo, marked up like a pro pointing things out: focus brackets snap in
 * from the frame's corners onto the detail the point is about, a marker circle
 * draws round it, and a line runs out to the point's name, typed on. A
 * no-prep corner first slaps on as a note, gets scribbled out and drops away.
 * Once said, the name gets a drawn tick. Everything pointed at is in the photo;
 * nothing is added to it.
 */
export const Markup: React.FC<AdProps & { tag?: string }> = ({ lines, ratio, headline, tag, photos }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = frame / fps;
  const tall = ratio === "9x16";
  const closeAt = askAt(lines);
  const words = wordsOf(lines);
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
  const focus = p?.focus?.[0] ?? { x: 50, y: 55 };
  const spot = p ? onScreen(p, W, H, focus) : { x: W / 2, y: H / 2 };
  const zoom = interpolate(t, [lineAt, until], [1, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // A point with a no-prep corner shows the note first; the marking starts when the voice turns to the prepped way.
  const turn = isPoint ? turnOf(words, lines, now) : 0;
  const markAt = isPoint ? (line.skip ? turn - 0.1 : lineAt + 0.2) : 0;
  const box = tall ? 320 : 260;
  const snapIn = quick(frame, fps, markAt, 11, HARD);
  const bx = interpolate(snapIn, [0, 1], [40, spot.x - box / 2]);
  const by = interpolate(snapIn, [0, 1], [tall ? 300 : 200, spot.y - box / 2]);
  const bw = interpolate(snapIn, [0, 1], [W - 80, box]);
  const bh = interpolate(snapIn, [0, 1], [H - (tall ? 700 : 480), box]);
  const ring = quick(frame, fps, markAt + 0.4, 14);
  const lead = quick(frame, fps, markAt + 0.75, 8);
  const typeAt = markAt + 0.9;
  const label = line.label ?? "";
  const typed = Math.max(0, Math.min(label.length, Math.floor((t - typeAt) * 34)));
  const doneAt = until - 0.6;
  const tick = quick(frame, fps, doneAt, 8);
  const shake = jolt(frame, fps, doneAt, 9);

  // The label sits above the detail when the detail is low, below when high; inside the frame either way.
  const above = spot.y > H * 0.46;
  // Kept clear of the step line at the top and the captions at the bottom, wherever the detail is.
  const ly = Math.max(tall ? 240 : 150, Math.min(tall ? 1300 : 860, above ? spot.y - box / 2 - (tall ? 250 : 190) : spot.y + box / 2 + (tall ? 130 : 100)));
  const cross = line.mark === "cross";
  const lx = Math.max(60, Math.min(W - 60 - (tall ? 640 : 560), spot.x - (tall ? 320 : 280)));
  const leadFrom = { x: spot.x, y: above ? spot.y - box / 2 + 10 : spot.y + box / 2 - 10 };
  const leadTo = { x: lx + 40, y: above ? ly + (tall ? 110 : 84) : ly };

  // The no-prep note: slaps on, is scribbled out at the turn, then drops away.
  const noteIn = pop(frame, fps, lineAt + 0.15, 0.9);
  const scribble = quick(frame, fps, turn - 0.35, 10);
  const drop = quick(frame, fps, turn + 0.25, 12, HARD);
  const noteShake = jolt(frame, fps, lineAt + 0.15, 8);

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {p ? (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <Img
            src={source(p.src)}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focus.x}% ${focus.y}%`, transform: `scale(${zoom})`, transformOrigin: `${spot.x}px ${spot.y}px` }}
          />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}b0 0%, ${INK}00 22%, ${INK}00 66%, ${INK}cc 100%)` }} />

      {/* The opening: the headline, underlined in marker. */}
      {now === 0 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: tall ? 200 : 120 }}>
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 28 : 22, letterSpacing: 4, color: PEN, opacity: quick(frame, fps, 0, 6) }}>{(tag ?? "").toUpperCase()}</div>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 84 : 64, lineHeight: 1.04, color: "#fff", marginTop: 8, textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
            {headline.split(/\s+/).map((w, k) => (
              <span key={k} style={{ display: "inline-block", marginRight: "0.24em", transform: `translateY(${(1 - pop(frame, fps, k * 0.06 - 0.1)) * 40}px)`, opacity: Math.min(1, pop(frame, fps, k * 0.06 - 0.1) * 2) }}>
                {w}
              </span>
            ))}
          </div>
          <svg width="100%" height="40" viewBox="0 0 960 40" preserveAspectRatio="none" style={{ marginTop: 6 }}>
            <path d="M4 26 C 220 10, 520 34, 956 14" stroke={PEN} strokeWidth="10" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - quick(frame, fps, 0.7, 14))} />
          </svg>
        </div>
      ) : null}

      {isPoint ? (
        <>
          <div style={{ position: "absolute", left: 60, top: tall ? 170 : 96, fontFamily: display, fontWeight: 800, fontSize: tall ? 34 : 28, color: PEN, letterSpacing: 2 }}>
            STEP {step} OF {points.length}
          </div>

          {/* Focus brackets, snapping from the frame onto the detail. */}
          {t >= markAt
            ? [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ].map(([cx, cy], k) => {
                const L = tall ? 54 : 44;
                return (
                  <div
                    key={k}
                    style={{
                      position: "absolute",
                      left: bx + cx * bw - (cx ? L : 0),
                      top: by + cy * bh - (cy ? L : 0),
                      width: L,
                      height: L,
                      borderColor: "#fff",
                      borderStyle: "solid",
                      borderWidth: 0,
                      [cy ? "borderBottomWidth" : "borderTopWidth"]: 6,
                      [cx ? "borderRightWidth" : "borderLeftWidth"]: 6,
                      opacity: 1 - 0.65 * ring,
                    }}
                  />
                );
              })
            : null}

          {/* The marker ring round the detail, and the line out to its name. */}
          <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
            {t >= markAt + 0.4 ? (
              <path
                d={`M ${spot.x + box * 0.52} ${spot.y - box * 0.08} C ${spot.x + box * 0.5} ${spot.y - box * 0.62}, ${spot.x - box * 0.6} ${spot.y - box * 0.55}, ${spot.x - box * 0.55} ${spot.y + box * 0.05} C ${spot.x - box * 0.5} ${spot.y + box * 0.6}, ${spot.x + box * 0.55} ${spot.y + box * 0.55}, ${spot.x + box * 0.48} ${spot.y - box * 0.18}`}
                stroke={PEN}
                strokeWidth={tall ? 11 : 9}
                fill="none"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={100 * (1 - ring)}
                style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
              />
            ) : null}
            {lead > 0 ? (
              <line
                x1={leadFrom.x}
                y1={leadFrom.y}
                x2={leadFrom.x + (leadTo.x - leadFrom.x) * lead}
                y2={leadFrom.y + (leadTo.y - leadFrom.y) * lead}
                stroke={PEN}
                strokeWidth={tall ? 6 : 5}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
              />
            ) : null}
          </svg>

          {/* The name, typed on, then ticked. */}
          {typed > 0 ? (
            <div
              style={{
                position: "absolute",
                left: lx,
                top: ly,
                display: "flex",
                alignItems: "center",
                gap: 18,
                backgroundColor: INK,
                border: `4px solid ${PEN}`,
                borderRadius: 12,
                padding: tall ? "18px 26px" : "12px 20px",
                transform: `translate(${shake.x}px, ${shake.y}px)`,
                maxWidth: tall ? 760 : 640,
              }}
            >
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 56 : 42, lineHeight: 1.05, color: "#fff" }}>
                {label.slice(0, typed)}
                {typed < label.length ? <span style={{ color: PEN }}>|</span> : null}
              </div>
              {tick > 0 ? (
                <svg width={tall ? 64 : 50} height={tall ? 64 : 50} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
                  <path d={cross ? "M8 8 L32 32 M32 8 L8 32" : "M5 22 C 9 25, 13 29, 16 32 C 22 22, 27 15, 36 6"} stroke={cross ? NO_PREP : PEN} strokeWidth="6" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - tick)} />
                </svg>
              ) : null}
            </div>
          ) : null}

          {/* The no-prep note. */}
          {line.skip && t < turn + 0.7 ? (
            <div
              style={{
                position: "absolute",
                left: 60,
                top: tall ? 250 : 150,
                padding: tall ? "20px 28px 24px" : "14px 22px 18px",
                backgroundColor: "#fff",
                borderRadius: 6,
                boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
                transform: `translate(${noteShake.x}px, ${noteShake.y + drop * H * 0.6}px) rotate(${-4 + drop * 22}deg) scale(${interpolate(noteIn, [0, 1], [1.5, 1])})`,
                opacity: Math.min(1, noteIn * 3) * (1 - drop * 0.4),
              }}
            >
              <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 26 : 20, letterSpacing: 4, color: NO_PREP }}>NO PREP</div>
              <div style={{ position: "relative", fontFamily: display, fontWeight: 800, fontSize: tall ? 54 : 40, color: INK, whiteSpace: "nowrap" }}>
                {line.skip}
                {/* Two quick marker strokes through it. */}
                <div style={{ position: "absolute", left: -10, top: "40%", height: tall ? 9 : 7, borderRadius: 5, backgroundColor: NO_PREP, width: `calc(${Math.min(1, scribble * 1.6) * 100}% + 20px)`, transform: "rotate(-3deg)", transformOrigin: "left" }} />
                <div style={{ position: "absolute", left: -10, top: "58%", height: tall ? 9 : 7, borderRadius: 5, backgroundColor: NO_PREP, width: `calc(${Math.max(0, scribble * 1.6 - 0.6) * 100}% + 20px)`, transform: "rotate(2deg)", transformOrigin: "left" }} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};
