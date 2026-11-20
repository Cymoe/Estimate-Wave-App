import { AbsoluteFill, Img } from "remotion";
import { source } from "../Ad";
import { body, display, INK } from "../theme";
import type { Photo, StillProps } from "../types";

/**
 * A still image ad. The photo fills the frame and darkens toward the bottom,
 * where the line, what backs it up and the button sit. With no photo the
 * brand's colours fill the frame instead.
 */
export const Still: React.FC<StillProps> = (props) => (props.pair ? <Split {...props} pair={props.pair} /> : <Single {...props} />);

/** A small marker on a photo saying which state of the job it shows. */
const Chip: React.FC<{ text: string; color: string; ink: string }> = ({ text, color, ink }) => (
  <div
    style={{
      position: "absolute",
      left: 28,
      top: 24,
      fontFamily: display,
      fontWeight: 800,
      fontSize: 40,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: ink,
      backgroundColor: color,
      padding: "10px 24px",
      borderRadius: 12,
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    }}
  >
    {text}
  </div>
);

/**
 * A before and its after, one above the other, under a headline that names the job. Nothing moves and nothing
 * needs sound: it reads at a glance in a muted feed. The tall size keeps its words clear of the app's own buttons.
 */
const Split: React.FC<StillProps & { pair: [Photo, Photo] }> = ({ ratio, brand, headline, sub, pair }) => {
  const tall = ratio === "9x16";
  const W = 1080;
  const H = tall ? 1920 : 1350;
  const head = tall ? { top: 210, height: 300 } : { top: 0, height: 250 };
  const foot = tall ? 300 : 150;
  const gap = 10;
  const each = Math.floor((H - head.top - head.height - foot - gap) / 2);
  const size = headline.length <= 24 ? (tall ? 96 : 84) : headline.length <= 36 ? (tall ? 80 : 70) : tall ? 68 : 60;
  const photoAt = (top: number, ph: Photo, label: string, color: string, ink: string) => (
    <div style={{ position: "absolute", left: 0, top, width: W, height: each, overflow: "hidden" }}>
      <Img src={source(ph.src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${ph.focus?.[0]?.x ?? 50}% ${ph.focus?.[0]?.y ?? 50}%` }} />
      <Chip text={label} color={color} ink={ink} />
    </div>
  );
  const top = head.top + head.height;
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <div style={{ position: "absolute", left: 56, right: 56, top: head.top, height: head.height, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: -2, color: "#fff" }}>{headline}</div>
        {sub ? <div style={{ fontFamily: body, fontWeight: 600, fontSize: tall ? 40 : 34, lineHeight: 1.25, color: "rgba(255,255,255,0.82)", marginTop: 16 }}>{sub}</div> : null}
      </div>
      {photoAt(top, pair[0], "Before", "#ffffff", INK)}
      <div style={{ position: "absolute", left: 0, top: top + each, width: W, height: gap, backgroundColor: brand.accentColor }} />
      {photoAt(top + each + gap, pair[1], "After", brand.accentColor, INK)}
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: top + 2 * each + gap,
          height: tall ? 170 : foot,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: brand.accentColor }} />
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 40, color: "#fff" }}>{brand.name}</div>
        </div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 40, color: brand.primaryColor, backgroundColor: "#fff", padding: "22px 44px", borderRadius: 60 }}>Get a free quote</div>
      </div>
    </AbsoluteFill>
  );
};

const Single: React.FC<StillProps> = ({ ratio, brand, headline, sub, photo }) => {
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
