import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, WIDE, ZONES } from "../theme";
import type { Ratio } from "../types";

/** The ad's headline: each word rises into place in turn, then a line draws in under it. */
export const Headline: React.FC<{ text: string; ratio: Ratio; accent: string }> = ({ text, ratio, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = ZONES[ratio].head;
  const words = text.trim().split(/\s+/);
  const base = text.length <= 16 ? 104 : text.length <= 24 ? 90 : text.length <= 34 ? 76 : 64;
  const size = Math.round(base * (ratio === "9x16" ? 1 : 0.78));
  const rule = spring({ frame: frame - 6 - words.length * 4, fps, config: { damping: 200 } });
  return (
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
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.26, rowGap: 0 }}>
        {words.map((word, i) => {
          const rise = spring({ frame: frame - 4 - i * 4, fps, config: { damping: 14, mass: 0.7 } });
          return (
            <span
              key={i}
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: size,
                lineHeight: 1.08,
                color: "#fff",
                letterSpacing: -1,
                opacity: rise,
                transform: `translateY(${interpolate(rise, [0, 1], [46, 0])}px)`,
                textShadow: "0 6px 30px rgba(0,0,0,0.45)",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
      <div style={{ marginTop: size * 0.22, height: 10, borderRadius: 5, width: 180 * rule, backgroundColor: accent }} />
    </div>
  );
};
