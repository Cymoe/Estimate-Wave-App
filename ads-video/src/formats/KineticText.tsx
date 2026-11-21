import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { body, display, WIDE, ZONES } from "../theme";
import { askAt, wordsOf } from "../timing";
import type { AdProps } from "../types";

const bare = (word: string) => word.toLowerCase().replace(/[^a-z']/g, "");
/** Small words a line never leans on. */
const PLAIN = new Set(["before", "their", "there", "these", "those", "which", "while", "about", "after", "every", "comes", "starts"]);

/**
 * No photos. Each spoken line is the picture: its words land large, one by
 * one, as the voice says them, and the word the line leans on gets a stroke
 * of the brand's colour behind it. The points made so far collect underneath
 * as ticked chips, so the frame always shows where the ad has got to.
 */
export const KineticText: React.FC<AdProps> = ({ lines, ratio, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tall = ratio === "9x16";
  const zone = ZONES[ratio].card;
  const chips = ZONES[ratio].captions;
  const all = wordsOf(lines);
  const closeAt = askAt(lines);
  let index = 0;
  lines.forEach((line, i) => {
    if (t >= line.start - 0.05) index = i;
  });
  const line = lines[index];
  // The last line is cut where the ask takes over: the button says the rest.
  const words = all.filter((w) => w.line === index && (index < lines.length - 1 || w.start < closeAt));
  const letters = words.reduce((n, w) => n + w.text.length + 1, 0);
  const size = Math.round((letters <= 34 ? 156 : letters <= 48 ? 136 : letters <= 62 ? 118 : 102) * (tall ? 1 : 0.76));
  // The word the line leans on: the longest that isn't a plain joining word, from six letters up.
  const lean = words.reduce<string>((best, w) => (bare(w.text).length >= 6 && !PLAIN.has(bare(w.text)) && bare(w.text).length > best.length ? bare(w.text) : best), "");
  const since = frame - Math.round(line.start * fps);
  const next = lines[index + 1]?.start;
  const leaving = next === undefined ? 0 : interpolate(t, [next - 0.2, next - 0.03], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tag = spring({ frame: since - 2, fps, config: { damping: 14, mass: 0.6 } });
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: (1080 - WIDE) / 2,
          width: WIDE,
          top: zone.top,
          height: zone.height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: 1 - leaving,
          transform: `translateY(${-leaving * 50}px)`,
        }}
      >
        {line.label ? (
          <div
            style={{
              alignSelf: "flex-start",
              fontFamily: body,
              fontWeight: 600,
              fontSize: tall ? 40 : 34,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: brand.accentColor,
              marginBottom: size * 0.3,
              opacity: tag,
              transform: `translateX(${interpolate(tag, [0, 1], [-40, 0])}px)`,
            }}
          >
            {String(index).padStart(2, "0")} · {line.label}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.26, rowGap: size * 0.1 }}>
          {words.map((w, i) => {
            const at = frame - Math.round(w.start * fps);
            const land = spring({ frame: at, fps, config: { damping: 12, mass: 0.55 } });
            const leaned = lean !== "" && bare(w.text) === lean;
            const stroke = spring({ frame: at - 2, fps, config: { damping: 200 }, durationInFrames: 9 });
            return (
              <span
                key={i}
                style={{
                  position: "relative",
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: size,
                  lineHeight: 1.06,
                  letterSpacing: -2,
                  color: "#fff",
                  opacity: at < 0 ? 0 : interpolate(land, [0, 0.35], [0, 1], { extrapolateRight: "clamp" }),
                  transform: `translateY(${interpolate(land, [0, 1], [size * 0.5, 0])}px) scale(${interpolate(land, [0, 1], [0.86, 1])})`,
                  textShadow: "0 10px 34px rgba(0,0,0,0.4)",
                }}
              >
                {leaned ? (
                  <span
                    style={{
                      position: "absolute",
                      left: -size * 0.1,
                      right: -size * 0.1,
                      top: size * 0.1,
                      bottom: size * 0.02,
                      backgroundColor: brand.primaryColor,
                      borderRadius: size * 0.12,
                      transform: `scaleX(${stroke}) rotate(-1.5deg)`,
                      transformOrigin: "0 50%",
                      boxShadow: `0 12px 40px ${brand.primaryColor}88`,
                    }}
                  />
                ) : null}
                <span style={{ position: "relative" }}>{w.text}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: (1080 - WIDE) / 2,
          width: WIDE,
          top: chips.top,
          height: chips.height,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          gap: 18,
        }}
      >
        {lines.map((x, i) => {
          if (!x.label || i >= lines.length - 1) return null;
          // A point joins the row once its line has been said.
          const done = frame - Math.round((lines[i + 1]?.start ?? x.end) * fps);
          if (done < 0) return null;
          const land = spring({ frame: done, fps, config: { damping: 13, mass: 0.5 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 26px 14px 16px",
                borderRadius: 50,
                backgroundColor: "rgba(255,255,255,0.12)",
                border: "2px solid rgba(255,255,255,0.28)",
                opacity: land,
                transform: `scale(${interpolate(land, [0, 1], [0.7, 1])})`,
              }}
            >
              <svg width="34" height="34" viewBox="0 0 34 34">
                <circle cx="17" cy="17" r="17" fill={brand.accentColor} />
                <path d="M9 18 L15 24 L26 11" stroke="#0b121c" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: display, fontWeight: 700, fontSize: tall ? 40 : 34, color: "#fff" }}>{x.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
};
