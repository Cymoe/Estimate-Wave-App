import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { body, display, INK, ZONES } from "../theme";
import type { Brand, Ratio } from "../types";
import { jolt } from "./motion";

/** The ask. The brand's colour opens out from the middle, the button lands, and a ring keeps pulsing from it. */
export const EndCard: React.FC<{ brand: Brand; ratio: Ratio; from: number; punch?: boolean }> = ({ brand, ratio, from, punch = false }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const at = frame - Math.round(from * fps);
  if (at < 0) return null;
  // Punch: it opens in a third of a second and the button slams in with a shake, on the music's return.
  const open = spring({ frame: at, fps, config: { damping: 200 }, durationInFrames: punch ? 10 : 18 });
  const land = spring({ frame: at - (punch ? 5 : 8), fps, config: punch ? { damping: 8, mass: 0.6, stiffness: 220 } : { damping: 11, mass: 0.8 } });
  const hit = punch ? jolt(frame, fps, from + 0.3, 12) : { x: 0, y: 0 };
  const words = spring({ frame: at - 14, fps, config: { damping: 200 } });
  const beat = (at - 20) % 40;
  const ring = at > 20 ? interpolate(beat, [0, 40], [0, 1]) : 0;
  const markets = brand.markets.slice(0, 2).filter(Boolean).join(" and ");
  // The captions keep their place under the button, so the button sits above the middle.
  const middle = (ZONES[ratio].card.top + ZONES[ratio].card.height / 2) / height;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% ${middle * 100}%, ${brand.primaryColor} 0%, ${INK} 130%)`,
        clipPath: `circle(${open * 150}% at 50% ${middle * 100}%)`,
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: `${middle * 100}%`, transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 76, color: "#fff", opacity: words, transform: `translateY(${interpolate(words, [0, 1], [24, 0])}px)` }}>
          {brand.name}
        </div>
        {markets ? (
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: 40, color: brand.accentColor, marginTop: 10, opacity: words }}>{markets}</div>
        ) : null}
        <div style={{ position: "relative", marginTop: 70, transform: `translate(${hit.x}px, ${hit.y}px) scale(${land})` }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 80,
              border: "6px solid #fff",
              opacity: (1 - ring) * 0.6,
              transform: `scale(${1 + ring * 0.35})`,
            }}
          />
          <div
            style={{
              fontFamily: display,
              fontWeight: 800,
              fontSize: 68,
              color: brand.primaryColor,
              backgroundColor: "#fff",
              padding: "34px 84px",
              borderRadius: 80,
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
            }}
          >
            Get a quote
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
