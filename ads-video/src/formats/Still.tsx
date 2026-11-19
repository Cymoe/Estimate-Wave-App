import { AbsoluteFill, Img } from "remotion";
import { source } from "../Ad";
import { body, display, INK } from "../theme";
import type { StillProps } from "../types";

/**
 * A still image ad. The photo fills the frame and darkens toward the bottom,
 * where the line, what backs it up and the button sit. With no photo the
 * brand's colours fill the frame instead.
 */
export const Still: React.FC<StillProps> = ({ ratio, brand, headline, sub, photo }) => {
  const tall = ratio === "9x16";
  const size = headline.length <= 26 ? 118 : headline.length <= 40 ? 100 : 86;
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {photo ? (
        <Img src={source(photo.src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <AbsoluteFill style={{ background: `radial-gradient(circle at 24% 20%, ${brand.primaryColor} 0%, transparent 60%), radial-gradient(circle at 84% 80%, ${brand.accentColor}66 0%, transparent 50%)` }} />
      )}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}99 0%, transparent 18%, transparent 36%, ${INK}cc 62%, ${INK}f7 100%)` }} />
      <div style={{ position: "absolute", left: 64, top: tall ? 110 : 56, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: brand.accentColor }} />
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 38, color: "#fff", textShadow: "0 4px 18px rgba(0,0,0,0.6)" }}>{brand.name}</div>
      </div>
      <div style={{ position: "absolute", left: 64, right: 64, bottom: tall ? 300 : 84 }}>
        <div style={{ width: 150, height: 14, borderRadius: 7, backgroundColor: brand.accentColor, marginBottom: 34 }} />
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: -2.5, color: "#fff", textShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>{headline}</div>
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 46, lineHeight: 1.25, color: "rgba(255,255,255,0.9)", marginTop: 30 }}>{sub}</div>
        <div
          style={{
            display: "inline-block",
            marginTop: 50,
            fontFamily: display,
            fontWeight: 800,
            fontSize: 58,
            color: brand.primaryColor,
            backgroundColor: "#fff",
            padding: "30px 76px",
            borderRadius: 80,
            boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
          }}
        >
          Get a quote
        </div>
      </div>
    </AbsoluteFill>
  );
};
