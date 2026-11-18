import { Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { cover, PhotoCard } from "../parts/PhotoCard";
import { display } from "../theme";
import { saidAt } from "../timing";
import type { AdProps } from "../types";

const Pill: React.FC<{ text: string; side: "left" | "right"; show: number; color: string }> = ({ text, side, show, color }) => (
  <div
    style={{
      position: "absolute",
      top: 28,
      [side]: 28,
      fontFamily: display,
      fontWeight: 800,
      fontSize: 34,
      letterSpacing: 2,
      color: "#fff",
      backgroundColor: color,
      padding: "12px 26px",
      borderRadius: 40,
      opacity: show,
      transform: `scale(${interpolate(show, [0, 1], [0.8, 1])})`,
    }}
  >
    {text}
  </div>
);

/**
 * A real before and its real after, in one card. The divider nudges in to
 * show there is something behind it, then crosses the photo when the second
 * line starts and leaves the finished room. photos[0] is the before,
 * photos[1] the after; it is only ever used with a true pair.
 */
export const BeforeAfter: React.FC<AdProps & { crossOn?: string }> = ({ photos, lines, ratio, brand, crossOn }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [before, after] = photos;
  const total = durationInFrames / fps;
  const crossAt = ((crossOn ? saidAt(lines, crossOn) : undefined) ?? lines[1]?.start ?? 2.5) * fps;
  const nudge = interpolate(frame, [1.0 * fps, 1.5 * fps, 2.0 * fps], [0, 16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cross = interpolate(frame, [crossAt, crossAt + 1.5 * fps], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const at = Math.max(nudge, cross);
  const zoom = interpolate(frame, [0, durationInFrames], [1.02, 1.08]);
  const handle = spring({ frame: frame - 0.8 * fps, fps, config: { damping: 14 } });
  return (
    <PhotoCard run={{ photo: before, start: 0, end: total }} first last ratio={ratio}>
      {(size) => (
        <>
          <Img src={source(before.src)} style={cover(zoom)} />
          <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - at}% 0 0)` }}>
            <Img src={source(after.src)} style={cover(zoom)} />
          </div>
          <Pill text="BEFORE" side="right" show={interpolate(at, [70, 92], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} color="rgba(11,18,28,0.82)" />
          <Pill text="AFTER" side="left" show={interpolate(at, [22, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} color={brand.primaryColor} />
          {at < 99.5 ? (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${at}%`, width: 8, marginLeft: -4, backgroundColor: "#fff", boxShadow: "0 0 30px rgba(0,0,0,0.5)", opacity: handle }}>
              <div
                style={{
                  position: "absolute",
                  top: size.height / 2 - 46,
                  left: -42,
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  backgroundColor: "#fff",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: 40,
                  color: brand.primaryColor,
                  transform: `scale(${handle})`,
                }}
              >
                ‹ ›
              </div>
            </div>
          ) : null}
        </>
      )}
    </PhotoCard>
  );
};
