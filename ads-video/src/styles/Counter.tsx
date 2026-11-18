import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { body, display, WIDE, ZONES } from "../theme";
import type { AdProps, Stat } from "../types";

/**
 * Numbers that count. The photo stays behind, soft; in front, one wide row
 * lands for each spoken line after the first. Its number spins through the
 * digits and stops on its value as the line is said, with what it counts
 * beside it.
 */
export const Counter: React.FC<AdProps & { stats: Stat[] }> = ({ ratio, lines, stats, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = ZONES[ratio].card;
  const gap = 26;
  const height = Math.min(250, Math.round((zone.height - gap * (stats.length - 1)) / stats.length));
  const block = height * stats.length + gap * (stats.length - 1);
  const top = zone.top + Math.round((zone.height - block) / 2);
  return (
    <div style={{ position: "absolute", left: (1080 - WIDE) / 2, top, width: WIDE, display: "flex", flexDirection: "column", gap }}>
      {stats.map((stat, i) => {
        const line = lines[Math.min(i + 1, lines.length - 1)];
        const since = frame - Math.round(line.start * fps);
        const land = spring({ frame: since, fps, config: { damping: 13, mass: 0.8 } });
        // The number runs through the digits for half a second, then stops on its value.
        const spinning = since < 0.55 * fps;
        const shown = spinning ? Math.floor((stat.value + 3 + Math.max(0, since) * 0.9) % 10) : stat.value;
        const settle = spring({ frame: since - Math.round(0.55 * fps), fps, config: { damping: 9, mass: 0.5 } });
        const words = spring({ frame: since - 6, fps, config: { damping: 200 } });
        return (
          <div
            key={i}
            style={{
              height,
              borderRadius: 34,
              backgroundColor: "rgba(255,255,255,0.97)",
              boxShadow: "0 30px 70px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              opacity: interpolate(land, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateX(${interpolate(land, [0, 1], [i % 2 === 0 ? -520 : 520, 0])}px) rotate(${interpolate(land, [0, 1], [i % 2 === 0 ? -4 : 4, 0])}deg)`,
            }}
          >
            <div
              style={{
                width: height,
                height,
                flexShrink: 0,
                background: `linear-gradient(150deg, ${brand.primaryColor} 0%, #1d3f61 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: Math.round(height * 0.72),
                  lineHeight: 1,
                  color: "#fff",
                  fontVariantNumeric: "tabular-nums",
                  transform: `scale(${spinning ? 1 : interpolate(settle, [0, 1], [1.4, 1])})`,
                  filter: spinning ? "blur(4px)" : "none",
                }}
              >
                {shown}
              </div>
            </div>
            <div
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: stat.label.length > 26 ? 50 : 58,
                lineHeight: 1.1,
                letterSpacing: -0.5,
                color: "#0b121c",
                padding: "0 40px",
                opacity: words,
                transform: `translateX(${interpolate(words, [0, 1], [30, 0])}px)`,
              }}
            >
              {stat.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
