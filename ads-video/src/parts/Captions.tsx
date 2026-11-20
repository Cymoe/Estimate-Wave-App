import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, WIDE, ZONES } from "../theme";
import { chunksOf, wordsOf } from "../timing";
import type { Line, Ratio } from "../types";

/**
 * What the voice is saying, a few words at a time, spelled from the script
 * (never transcribed, so a name can't come out wrong). The word being said
 * is in the accent colour and a touch larger.
 *
 * With `phrases`, it shows a whole short phrase at once (up to six words,
 * broken where the voice pauses), steady and white, so it reads like a
 * subtitle rather than flashing word by word.
 */
export const Captions: React.FC<{ lines: Line[]; ratio: Ratio; accent: string; phrases?: boolean }> = ({ lines, ratio, accent, phrases = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const zone = ZONES[ratio].captions;
  const chunks = phrases ? chunksOf(wordsOf(lines), 30, 6, true) : chunksOf(wordsOf(lines));
  const index = chunks.findIndex((c, i) => t >= c[0].start - 0.04 && t < (chunks[i + 1]?.[0].start ?? c[c.length - 1].end + 0.5) - 0.04);
  if (index < 0) return null;
  const chunk = chunks[index];
  const pop = spring({ frame: frame - Math.round((chunk[0].start - 0.04) * fps), fps, config: { damping: 13, mass: 0.5 } });
  const size = phrases ? (ratio === "9x16" ? 66 : 56) : ratio === "9x16" ? 78 : 66;
  return (
    <div
      style={{
        position: "absolute",
        left: (1080 - WIDE) / 2,
        width: WIDE,
        top: zone.top,
        height: zone.height,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: size * (phrases ? 0.28 : 0.4),
          transform: phrases ? undefined : `scale(${interpolate(pop, [0, 1], [0.86, 1])})`,
          opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        {chunk.map((w, i) => {
          const said = phrases || t >= w.start;
          const saying = !phrases && t >= w.start && t < w.end + 0.05;
          return (
            <span
              key={i}
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: size,
                lineHeight: 1.12,
                textTransform: "uppercase",
                color: saying ? accent : said ? "#ffffff" : "rgba(255,255,255,0.55)",
                transform: `scale(${saying ? 1.05 : 1})`,
                WebkitTextStroke: "6px rgba(8,13,20,0.9)",
                paintOrder: "stroke fill",
                textShadow: "0 8px 24px rgba(0,0,0,0.55)",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
