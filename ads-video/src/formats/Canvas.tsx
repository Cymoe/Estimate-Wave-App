import { AbsoluteFill, useCurrentFrame } from "remotion";
import { INK } from "../theme";
import type { Brand } from "../types";

/**
 * The backdrop for an ad with no photo: the brand's two colours as soft
 * lights that drift, and slanted bands that slide across like a wet roller's
 * track. Drawn with gradients only, so a frame costs nothing to draw.
 */
export const Canvas: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const a = { x: 22 + Math.sin(frame / 70) * 10, y: 24 + Math.cos(frame / 90) * 8 };
  const b = { x: 80 + Math.cos(frame / 85) * 9, y: 74 + Math.sin(frame / 60) * 10 };
  const slide = (frame * 1.6) % 320;
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${a.x}% ${a.y}%, ${brand.primaryColor}cc 0%, transparent 46%), radial-gradient(circle at ${b.x}% ${b.y}%, ${brand.accentColor}55 0%, transparent 42%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "repeating-linear-gradient(118deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 90px, transparent 90px, transparent 320px)",
          backgroundPosition: `${slide}px 0px`,
        }}
      />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}d9 0%, transparent 26%, transparent 70%, ${INK}e6 100%)` }} />
    </AbsoluteFill>
  );
};
