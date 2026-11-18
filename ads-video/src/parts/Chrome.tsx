import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, ZONES } from "../theme";
import type { Brand, Ratio } from "../types";

/** The brand's name, top left, for the whole ad. */
export const BrandChip: React.FC<{ brand: Brand; ratio: Ratio }> = ({ brand, ratio }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        top: ZONES[ratio].chip,
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [-30, 0])}px)`,
      }}
    >
      <div style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: brand.accentColor }} />
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 34, letterSpacing: 0.5, color: "#fff" }}>{brand.name}</div>
    </div>
  );
};

/** A thin line across the top that fills as the ad plays. */
export const ProgressBar: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, height: 8, width: `${(frame / durationInFrames) * 100}%`, backgroundColor: color, opacity: 0.9 }} />
  );
};
