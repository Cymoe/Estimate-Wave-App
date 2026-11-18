import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { cover, PhotoCard } from "../parts/PhotoCard";
import { body, display, WIDE, ZONES } from "../theme";
import type { Run } from "../timing";
import type { AdProps, Stat } from "../types";

/** How much of the photo space the photo keeps; the numbers have the rest. */
const PHOTO_SHARE = 0.62;

/**
 * Numbers that count. The photo keeps the upper part of its space; under it,
 * one tile lands for each spoken line after the first, its number spinning up
 * from nothing and stopping on its value as the line is said.
 */
export const Counter: React.FC<AdProps & { runs: Run[]; stats: Stat[] }> = ({ runs, ratio, lines, stats, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = ZONES[ratio].card;
  const top = zone.top + Math.round(zone.height * PHOTO_SHARE) + 26;
  const height = zone.height - Math.round(zone.height * PHOTO_SHARE) - 26;
  const gap = 22;
  const width = (WIDE - gap * (stats.length - 1)) / stats.length;
  return (
    <>
      {runs.map((run, i) => (
        <PhotoCard key={i} run={run} first={i === 0} last={i === runs.length - 1} ratio={ratio} share={PHOTO_SHARE}>
          {() => <Img src={source(run.photo.src)} style={cover(interpolate(frame, [run.start * fps, run.end * fps], [1.03, 1.12], { extrapolateRight: "clamp" }))} />}
        </PhotoCard>
      ))}
      <div style={{ position: "absolute", left: (1080 - WIDE) / 2, top, width: WIDE, height, display: "flex", gap }}>
        {stats.map((stat, i) => {
          const line = lines[Math.min(i + 1, lines.length - 1)];
          const since = frame - Math.round(line.start * fps);
          const land = spring({ frame: since, fps, config: { damping: 12, mass: 0.7 } });
          // The number runs through the digits for half a second, then stops on its value.
          const spin = interpolate(since, [0, 0.55 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const shown = spin >= 1 ? stat.value : Math.floor((stat.value + 3 + since * 0.9) % 10);
          const settle = spring({ frame: since - Math.round(0.55 * fps), fps, config: { damping: 9, mass: 0.5 } });
          return (
            <div
              key={i}
              style={{
                width,
                height: "100%",
                borderRadius: 30,
                background: `linear-gradient(160deg, ${brand.primaryColor} 0%, #1c3d5e 100%)`,
                boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                opacity: interpolate(land, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                transform: `translateY(${interpolate(land, [0, 1], [120, 0])}px) scale(${interpolate(land, [0, 1], [0.8, 1])})`,
              }}
            >
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: Math.round(height * 0.5),
                  lineHeight: 1,
                  color: "#fff",
                  fontVariantNumeric: "tabular-nums",
                  transform: `scale(${spin >= 1 ? interpolate(settle, [0, 1], [1.35, 1]) : 1})`,
                  filter: spin < 1 ? "blur(3px)" : "none",
                }}
              >
                {shown}
              </div>
              <div style={{ fontFamily: body, fontWeight: 600, fontSize: Math.round(height * 0.13), color: brand.accentColor, textAlign: "center", marginTop: 12, padding: "0 14px", lineHeight: 1.15 }}>
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
