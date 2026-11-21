import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { body, display, INK, ZONES } from "../theme";
import { askAt } from "../timing";
import type { AdProps, Photo } from "../types";

const CROSS = "#e5484d";
const PAPER = "#f4efe4";

/** A small tilt per card, so the pile looks laid by hand; the same every render. */
const TILTS = [-3.5, 2.8, -2.2, 3.4, -1.6];

/**
 * A collage over the job's own photos, like a magazine cut-out: each line's
 * photo is a printed card dropped onto a dark board, with a hand-drawn circle
 * round the part the line is about and a sticker naming it. A point opens on
 * a big step number; where the idea sets prep against no prep, the corner a
 * no-prep quote cuts is a red sticker crossed out before the prepped way is
 * stuck on. Earlier cards stay in the pile behind, so the story builds up.
 */
export const Collage: React.FC<AdProps & { tag?: string }> = ({ lines, ratio, brand, headline, tag, photos }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tall = ratio === "9x16";
  const zone = ZONES[ratio].card;
  const closeAt = askAt(lines);
  const pointIndex = (i: number) => lines.slice(1, i + 1).filter((l, k) => k + 1 < lines.length - 1 && l.label).length;

  // The board: dark, with a fine grain and two torn strips of the brand's colour that drift.
  const drift = Math.sin(frame / 90) * 12;

  // The card size: wide, and never taller than the middle band.
  const cardW = tall ? 860 : 800;
  const card = (p: Photo) => {
    const h = Math.min(zone.height - 60, (cardW * (p.height || 3)) / (p.width || 4));
    return { w: cardW, h };
  };

  // The title, as cut-out words on the first card's edge while the first line is said.
  const titleOut = interpolate(t, [lines[1]?.start ?? closeAt, (lines[1]?.start ?? closeAt) + 0.3], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const words = headline.split(/\s+/).filter(Boolean);

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "7px 7px, 13px 13px",
          backgroundPosition: "0 0, 3px 5px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -80,
          top: zone.top - 120 + drift,
          width: 1300,
          height: 150,
          backgroundColor: brand.primaryColor,
          transform: "rotate(-7deg)",
          clipPath: "polygon(0 8%, 6% 0, 14% 10%, 25% 2%, 38% 9%, 52% 1%, 66% 8%, 79% 0, 91% 9%, 100% 3%, 100% 92%, 88% 100%, 73% 91%, 58% 99%, 44% 90%, 30% 100%, 16% 92%, 5% 100%, 0 93%)",
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -60,
          top: zone.top + zone.height - 60 - drift,
          width: 1250,
          height: 110,
          backgroundColor: brand.accentColor,
          transform: "rotate(5deg)",
          clipPath: "polygon(0 6%, 9% 0, 21% 9%, 34% 1%, 47% 10%, 61% 2%, 74% 9%, 87% 0, 100% 7%, 100% 95%, 85% 100%, 70% 92%, 55% 100%, 41% 91%, 27% 99%, 13% 91%, 0 100%)",
          opacity: 0.35,
        }}
      />

      {/* The pile: every card up to the current line, the newest on top. */}
      {lines.map((line, i) => {
        const p = photos[Math.min(i, photos.length - 1)];
        if (!p || t < (i === 0 ? 0 : line.start) - 0.05) return null;
        // A photo used again later is not stacked twice: the later line shows it on top.
        if (lines.slice(i + 1).some((l, k) => photos[i + 1 + k]?.src === p.src && t >= l.start - 0.05)) return null;
        const at = i === 0 ? 0 : line.start - 0.05;
        // A point's card waits for its step number.
        const isPoint = i > 0 && i < lines.length - 1 && !!line.label;
        const dropAt = at + (isPoint ? 0.45 : 0);
        const drop = spring({ frame: frame - Math.round(dropAt * fps), fps, config: { damping: 13, mass: 0.7 } });
        if (t < dropAt - 0.02) return null;
        const { w, h } = card(p);
        const later = lines.filter((l, k) => k > i && t >= l.start).length;
        const tilt = TILTS[i % TILTS.length];
        const cx = 540 + (later ? (i % 2 ? 40 : -40) * Math.min(later, 2) : 0);
        const cy = zone.top + zone.height / 2 - (later ? 30 * Math.min(later, 2) : 0);
        const focus = p.focus?.[0] ?? { x: 50, y: 50 };
        const nextStart = lines[i + 1]?.start ?? closeAt;
        const circle = spring({ frame: frame - Math.round((dropAt + 0.35) * fps), fps, config: { damping: 200 }, durationInFrames: 14 });
        const sticker = spring({ frame: frame - Math.round((dropAt + 0.55) * fps), fps, config: { damping: 11, mass: 0.6 } });
        const doneAt = nextStart - 0.1;
        const ticked = t >= doneAt;
        const showSkip = isPoint && line.skip && t < nextStart;
        const skipIn = spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 12, mass: 0.6 } });
        const strike = spring({ frame: frame - Math.round((at + 0.3) * fps), fps, config: { damping: 200 }, durationInFrames: 10 });
        // Older cards sink back so the newest reads.
        const dim = later ? 0.55 : 1;
        const zoom = interpolate(t, [dropAt, nextStart], [1, 1.05], { extrapolateRight: "clamp" });
        return (
          <div key={i}>
            <div
              style={{
                position: "absolute",
                left: cx - w / 2,
                top: cy - h / 2,
                width: w,
                height: h,
                padding: 16,
                backgroundColor: PAPER,
                boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
                transform: `translateY(${interpolate(drop, [0, 1], [-260, 0])}px) rotate(${tilt + interpolate(drop, [0, 1], [8, 0])}deg) scale(${interpolate(drop, [0, 1], [1.12, 1])})`,
                opacity: interpolate(drop, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }) * dim,
                boxSizing: "border-box",
              }}
            >
              <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
                <Img
                  src={source(p.src)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focus.x}% ${focus.y}%`, transform: `scale(${zoom})`, transformOrigin: `${focus.x}% ${focus.y}%` }}
                />
                {/* A hand-drawn ring round what the line is about. */}
                {isPoint && !later ? (
                  <svg width={w - 32} height={h - 32} viewBox={`0 0 ${w - 32} ${h - 32}`} style={{ position: "absolute", inset: 0 }}>
                    <ellipse
                      cx={((w - 32) * focus.x) / 100}
                      cy={((h - 32) * focus.y) / 100}
                      rx={(w - 32) * 0.2}
                      ry={(w - 32) * 0.15}
                      fill="none"
                      stroke={brand.accentColor}
                      strokeWidth={9}
                      strokeLinecap="round"
                      pathLength={100}
                      strokeDasharray={100}
                      strokeDashoffset={100 * (1 - circle)}
                      transform={`rotate(-8 ${((w - 32) * focus.x) / 100} ${((h - 32) * focus.y) / 100})`}
                    />
                  </svg>
                ) : null}
              </div>
            </div>

            {/* The step number, big, before the card lands. */}
            {isPoint && !later ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: zone.top - (tall ? 170 : 120),
                  display: "flex",
                  justifyContent: "center",
                  opacity: interpolate(t, [at, at + 0.15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <div
                  style={{
                    fontFamily: display,
                    fontWeight: 800,
                    fontSize: tall ? 64 : 50,
                    color: INK,
                    backgroundColor: brand.accentColor,
                    padding: "10px 34px",
                    transform: `rotate(-2deg) scale(${interpolate(spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 9, mass: 0.5 } }), [0, 1], [1.6, 1])})`,
                    letterSpacing: 2,
                  }}
                >
                  STEP {pointIndex(i)}
                </div>
              </div>
            ) : null}

            {/* The corner a no-prep quote cuts: a red sticker, crossed out. */}
            {showSkip ? (
              <div
                style={{
                  position: "absolute",
                  left: cx - w / 2 - 20,
                  top: cy - h / 2 - (tall ? 70 : 56),
                  transform: `rotate(-5deg) scale(${interpolate(skipIn, [0, 1], [1.4, 1])})`,
                  opacity: interpolate(skipIn, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                  backgroundColor: CROSS,
                  padding: tall ? "14px 26px" : "10px 20px",
                  boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
                }}
              >
                <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 26 : 20, letterSpacing: 3, color: "#fff", opacity: 0.85 }}>NO PREP</div>
                <div style={{ position: "relative", fontFamily: display, fontWeight: 800, fontSize: tall ? 50 : 38, color: "#fff", whiteSpace: "nowrap" }}>
                  {line.skip}
                  <div style={{ position: "absolute", left: -6, top: "50%", height: 7, width: `calc(${strike * 100}% + 12px)`, backgroundColor: INK, borderRadius: 4 }} />
                </div>
              </div>
            ) : null}

            {/* The prepped way: a sticker on the card's lower edge, ticked once said. */}
            {isPoint && !later ? (
              <div
                style={{
                  position: "absolute",
                  right: 1080 - (cx + w / 2) - 24,
                  top: cy + h / 2 - (tall ? 44 : 36),
                  transform: `rotate(3deg) scale(${interpolate(sticker, [0, 1], [0.4, 1])})`,
                  opacity: interpolate(sticker, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  backgroundColor: PAPER,
                  padding: tall ? "16px 28px 16px 18px" : "12px 22px 12px 14px",
                  boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
                  border: `4px solid ${brand.accentColor}`,
                }}
              >
                <div
                  style={{
                    width: tall ? 56 : 44,
                    height: tall ? 56 : 44,
                    borderRadius: 10,
                    backgroundColor: ticked ? brand.primaryColor : "transparent",
                    border: `4px solid ${brand.primaryColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                  }}
                >
                  {ticked ? (
                    <svg width="70%" height="70%" viewBox="0 0 40 40">
                      <path d="M8 21 L17 30 L33 11" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>
                <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 50 : 38, color: INK, whiteSpace: "nowrap" }}>{line.label}</div>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* The title: cut-out words, black on paper, while the first line is said. */}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: ZONES[ratio].head.top - (tall ? 20 : 40),
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 14,
          opacity: titleOut,
        }}
      >
        {tag ? (
          <div style={{ width: "100%", textAlign: "center", fontFamily: body, fontWeight: 600, fontSize: tall ? 34 : 28, letterSpacing: 4, color: brand.accentColor, marginBottom: 6 }}>
            {tag.toUpperCase()}
          </div>
        ) : null}
        {words.map((w, i) => {
          const at = frame - i * 3 + 6;
          const pop = spring({ frame: at, fps, config: { damping: 11, mass: 0.5 } });
          const lit = i === words.length - 1;
          return (
            <span
              key={i}
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: tall ? 84 : 66,
                lineHeight: 1.05,
                color: lit ? "#fff" : INK,
                backgroundColor: lit ? brand.primaryColor : PAPER,
                padding: "4px 18px 8px",
                transform: `rotate(${(i % 2 ? 1.5 : -1.5)}deg) scale(${interpolate(pop, [0, 1], [1.5, 1])})`,
                opacity: at < 0 ? 0 : interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                boxShadow: "0 10px 24px rgba(0,0,0,0.4)",
                display: "inline-block",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
