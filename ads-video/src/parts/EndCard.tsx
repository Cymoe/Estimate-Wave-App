import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { INK, kicker, poster, ZONES } from "../theme";
import type { Brand, Ratio } from "../types";
import { jolt } from "./motion";

/**
 * The ask. The brand's colour opens out from the middle, the button lands, and a ring keeps pulsing from it.
 * It matches the still ads (the owner, Nov 2026): the spray gun mark, the name in heavy condensed capitals with its
 * first word in the accent colour, the area in italic serif, and the gold squared button that says GET A FREE QUOTE.
 */
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
        <div
          style={{
            width: 190,
            height: 190,
            borderRadius: 95,
            overflow: "hidden",
            border: "6px solid #fff",
            boxSizing: "border-box",
            backgroundColor: brand.primaryColor,
            boxShadow: "0 14px 40px rgba(0,0,0,0.4)",
            marginBottom: 34,
            opacity: words,
            transform: `scale(${interpolate(words, [0, 1], [0.8, 1])})`,
          }}
        >
          <Img src={staticFile("brand/mark-navy.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ fontFamily: poster, fontWeight: 400, fontSize: 104, letterSpacing: 1.5, textTransform: "uppercase", whiteSpace: "nowrap", opacity: words, transform: `translateY(${interpolate(words, [0, 1], [24, 0])}px)` }}>
          <span style={{ color: brand.accentColor }}>{brand.name.split(" ")[0]}</span>
          <span style={{ color: "#fff" }}> {brand.name.split(" ").slice(1).join(" ")}</span>
        </div>
        {markets ? (
          <div style={{ fontFamily: kicker, fontStyle: "italic", fontWeight: 600, fontSize: 46, color: brand.accentColor, marginTop: 12, opacity: words }}>{markets}</div>
        ) : null}
        <div style={{ position: "relative", marginTop: 70, transform: `translate(${hit.x}px, ${hit.y}px) scale(${land})` }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              border: `6px solid ${brand.accentColor}`,
              opacity: (1 - ring) * 0.6,
              transform: `scale(${1 + ring * 0.25})`,
            }}
          />
          <div
            style={{
              fontFamily: poster,
              fontWeight: 400,
              fontSize: 76,
              letterSpacing: 2,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              color: brand.primaryColor,
              backgroundColor: brand.accentColor,
              padding: "30px 70px",
              borderRadius: 14,
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
            }}
          >
            Get a free quote
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
