import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display } from "../theme";
import type { Brand, Line } from "../types";

/**
 * A line's label, pinned across the lower edge of the photo card while the
 * line is said: it drops in with a tick and lifts away after. `edge` is the
 * card's bottom, in pixels from the top of the frame.
 */
export const LabelPills: React.FC<{ lines: Line[]; brand: Brand; edge: number }> = ({ lines, brand, edge }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      {lines.map((line, i) => {
        if (!line.label) return null;
        // Pinned across the card's lower edge while its line is said: it drops in with a tick and lifts away after.
        const since = frame - Math.round(line.start * fps);
        const until = Math.round((lines[i + 1]?.start ?? line.end) * fps) - frame;
        if (since < 0 || until < -8) return null;
        const land = spring({ frame: since - 4, fps, config: { damping: 12, mass: 0.6 } });
        const lift = until < 0 ? interpolate(-until, [0, 8], [0, 1]) : 0;
        const tick = spring({ frame: since - 10, fps, config: { damping: 10, mass: 0.4 } });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: edge - 52,
              display: "flex",
              justifyContent: "center",
              opacity: interpolate(land, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }) * (1 - lift),
              transform: `translateY(${interpolate(land, [0, 1], [60, 0]) - lift * 30}px) scale(${interpolate(land, [0, 1], [0.8, 1])})`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                backgroundColor: "#fff",
                borderRadius: 60,
                padding: "20px 40px 20px 22px",
                boxShadow: "0 22px 50px rgba(0,0,0,0.45)",
              }}
            >
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 31,
                  backgroundColor: brand.primaryColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `scale(${tick})`,
                }}
              >
                <svg width="34" height="34" viewBox="0 0 34 34">
                  <path d="M6 18 L14 26 L28 9" stroke="#fff" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 50, color: "#0b121c", letterSpacing: -0.5 }}>{line.label}</div>
            </div>
          </div>
        );
      })}
    </>
  );
};
