import { AbsoluteFill, Img, staticFile } from "remotion";
import { source } from "../Ad";
import { body, display, INK } from "../theme";
import type { Photo, StillProps } from "../types";

/**
 * A still image ad. The photo fills the frame and darkens toward the bottom,
 * where the line, what backs it up and the button sit. With no photo the
 * brand's colours fill the frame instead.
 */
export const Still: React.FC<StillProps> = (props) =>
  props.grid?.length ? <Grid {...props} grid={props.grid} /> : props.pair ? <Pair {...props} pair={props.pair} marks={["Before", "After"]} /> : <Single {...props} />;

/**
 * A before and its after, edge to edge like a showcase: side by side when both stand upright, else one above the
 * other. Each is marked, the brand's mark sits on the line between them, the headline is on the photos, no bars.
 */
const Pair: React.FC<StillProps & { pair: [Photo, Photo]; marks: string[] }> = ({ ratio, brand, headline, sub, pair, marks }) => {
  const tall = ratio === "9x16";
  const W = 1080;
  const H = tall ? 1920 : 1350;
  const gap = 8;
  const side = pair[0].height > pair[0].width && pair[1].height > pair[1].width;
  const half = Math.floor(((side ? W : H) - gap) / 2);
  const cells = pair.map((ph, i) => (side ? { ph, left: i * (half + gap), top: 0, width: half, height: H } : { ph, left: 0, top: i * (half + gap), width: W, height: half }));
  const size = headline.length <= 22 ? 104 : headline.length <= 34 ? 88 : 74;
  const safeTop = tall ? 170 : 0;
  const safeBottom = tall ? 300 : 0;
  // The words sit low, over the after, so both photos' tops (and their marks) stay clear.
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff" }}>
      {cells.map((c, i) => (
        <div key={i} style={{ position: "absolute", left: c.left, top: c.top, width: c.width, height: c.height, overflow: "hidden", backgroundColor: INK }}>
          <Img src={source(c.ph.src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${c.ph.focus?.[0]?.x ?? 50}% ${c.ph.focus?.[0]?.y ?? 50}%` }} />
          <div style={{ position: "absolute", left: 28, top: (i === 0 || side ? safeTop : 0) + 28, fontFamily: display, fontWeight: 800, fontSize: 40, letterSpacing: 1, textTransform: "uppercase", color: i === 0 ? NAVY : "#fff", backgroundColor: i === 0 ? "#fff" : TEAL, padding: "10px 24px", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
            {marks[i]}
          </div>
        </div>
      ))}
      <div style={{ position: "absolute", left: 0, bottom: 0, width: W, height: safeBottom + 560, background: "linear-gradient(to top, rgba(6,20,46,0.94) 0%, rgba(6,20,46,0.7) 50%, rgba(6,20,46,0) 100%)" }} />
      <Mark size={180} left={side ? half + gap / 2 : W / 2} top={side ? H * 0.42 : half + gap / 2} />
      <div style={{ position: "absolute", left: 56, right: 56, bottom: safeBottom + 150 }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 1.03, letterSpacing: -2.5, color: "#fff", textShadow: "0 4px 22px rgba(0,0,0,0.55)" }}>{headline}</div>
        <div style={{ width: 132, height: 12, borderRadius: 6, backgroundColor: TEAL, marginTop: 20 }} />
        {sub ? <div style={{ fontFamily: body, fontWeight: 600, fontSize: 38, lineHeight: 1.22, color: "#fff", marginTop: 16, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>{sub}</div> : null}
      </div>
      <div style={{ position: "absolute", left: 56, right: 56, bottom: safeBottom + 40, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 44, color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>{brand.name}</div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 40, color: "#fff", backgroundColor: TEAL, padding: "20px 44px", borderRadius: 60, boxShadow: "0 8px 26px rgba(0,0,0,0.35)" }}>Get a free quote</div>
      </div>
    </AbsoluteFill>
  );
};

/** The brand's mark (the house and tick), a file the renderer carries. */
const MARK = "brand/mark.png";
/** The logo's own colours: the words and button are set in these, whatever the settings say. */
const NAVY = "#0a2757";
const TEAL = "#17a2a4";

/** The mark on a white disc, to sit where photos meet. */
const Mark: React.FC<{ size: number; left: number; top: number }> = ({ size, left, top }) => (
  <div
    style={{
      position: "absolute",
      left: left - size / 2,
      top: top - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: "#fff",
      boxShadow: "0 10px 34px rgba(0,0,0,0.38)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Img src={staticFile(MARK)} style={{ width: size * 0.74, height: size * 0.74, objectFit: "contain" }} />
  </div>
);

/**
 * A showcase: three or four finished jobs from different homes, edge to edge, with nothing boxed around them. Four
 * make a two-by-two; three put the first across the top and two beneath it. Thin white lines keep them apart, the
 * brand's mark sits where they meet, the headline is set on the top photo and the ask on the bottom ones, each over
 * a soft shade of the photo itself. No bars, so it reads as photos, not a web page.
 */
const Grid: React.FC<StillProps & { grid: Photo[]; marks?: string[] }> = ({ ratio, brand, headline, sub, grid, marks }) => {
  const tall = ratio === "9x16";
  const W = 1080;
  const H = tall ? 1920 : 1350;
  const gap = 8;
  const photos = grid.slice(0, 4);
  // A before and its after: side by side when both stand upright, else one above the other, sharing the frame evenly.
  if (marks && photos.length === 2) return <Pair ratio={ratio} brand={brand} headline={headline} sub={sub} pair={[photos[0], photos[1]]} marks={marks} />;
  const four = photos.length >= 4;
  // Three: the top photo is a little taller, since the headline sits on it.
  const topH = four ? Math.floor((H - gap) / 2) : Math.round(H * 0.54);
  const lowH = H - topH - gap;
  const half = Math.floor((W - gap) / 2);
  const cells = four
    ? photos.map((ph, i) => ({ ph, left: (i % 2) * (half + gap), top: i < 2 ? 0 : topH + gap, width: half, height: i < 2 ? topH : lowH }))
    : [
        { ph: photos[0], left: 0, top: 0, width: W, height: topH },
        ...photos.slice(1, 3).map((ph, i) => ({ ph, left: i * (half + gap), top: topH + gap, width: photos.length === 2 ? W : half, height: lowH })),
      ];
  const size = headline.length <= 22 ? 104 : headline.length <= 34 ? 88 : 74;
  const safeTop = tall ? 170 : 0;
  const safeBottom = tall ? 300 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff" }}>
      {cells.map((c, i) => (
        <div key={i} style={{ position: "absolute", left: c.left, top: c.top, width: c.width, height: c.height, overflow: "hidden", backgroundColor: INK }}>
          <Img src={source(c.ph.src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${c.ph.focus?.[0]?.x ?? 50}% ${c.ph.focus?.[0]?.y ?? 50}%` }} />
        </div>
      ))}
      {/* The shade under the headline, and the one under the ask: part of the photos, not a bar. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: safeTop + 430, background: "linear-gradient(to bottom, rgba(6,20,46,0.9) 0%, rgba(6,20,46,0.62) 55%, rgba(6,20,46,0) 100%)" }} />
      <div style={{ position: "absolute", left: 0, bottom: 0, width: W, height: safeBottom + 250, background: "linear-gradient(to top, rgba(6,20,46,0.88) 0%, rgba(6,20,46,0) 100%)" }} />
      <div style={{ position: "absolute", left: 56, right: 56, top: safeTop + 44 }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 1.03, letterSpacing: -2.5, color: "#fff", textShadow: "0 4px 22px rgba(0,0,0,0.55)" }}>{headline}</div>
        <div style={{ width: 132, height: 12, borderRadius: 6, backgroundColor: TEAL, marginTop: 22 }} />
        {sub ? <div style={{ fontFamily: body, fontWeight: 600, fontSize: 38, lineHeight: 1.22, color: "#fff", marginTop: 18, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>{sub}</div> : null}
      </div>
      <Mark size={196} left={W / 2} top={topH + gap / 2} />
      <div style={{ position: "absolute", left: 56, right: 56, bottom: safeBottom + 44, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 44, color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>{brand.name}</div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 40, color: "#fff", backgroundColor: TEAL, padding: "22px 44px", borderRadius: 60, boxShadow: "0 8px 26px rgba(0,0,0,0.35)" }}>Get a free quote</div>
      </div>
    </AbsoluteFill>
  );
};

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
 * A before and its after, under a headline that names the job: one above the other, or side by side when the
 * photos stand upright, so each is cut as little as possible. Nothing moves and nothing
 * needs sound: it reads at a glance in a muted feed. The tall size keeps its words clear of the app's own buttons.
 */
const Split: React.FC<StillProps & { pair: [Photo, Photo] }> = ({ ratio, brand, headline, sub, pair }) => {
  const tall = ratio === "9x16";
  const W = 1080;
  const H = tall ? 1920 : 1350;
  const head = tall ? { top: 180, height: 290 } : { top: 0, height: 250 };
  // The tall size leaves its last fifth to the app's own buttons and caption.
  const foot = tall ? 440 : 150;
  const gap = 10;
  const side = pair[0].height > pair[0].width && pair[1].height > pair[1].width;
  const area = H - head.top - head.height - foot;
  const each = side ? area : Math.floor((area - gap) / 2);
  const wide = side ? Math.floor((W - gap) / 2) : W;
  const size = headline.length <= 24 ? (tall ? 96 : 84) : headline.length <= 36 ? (tall ? 80 : 70) : tall ? 68 : 60;
  const photoAt = (top: number, left: number, ph: Photo, label: string, color: string, ink: string) => (
    <div style={{ position: "absolute", left, top, width: wide, height: each, overflow: "hidden" }}>
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
      {photoAt(top, 0, pair[0], "Before", "#ffffff", INK)}
      {side ? (
        <div style={{ position: "absolute", left: wide, top, width: gap, height: each, backgroundColor: brand.accentColor }} />
      ) : (
        <div style={{ position: "absolute", left: 0, top: top + each, width: W, height: gap, backgroundColor: brand.accentColor }} />
      )}
      {side ? photoAt(top, wide + gap, pair[1], "After", brand.accentColor, INK) : photoAt(top + each + gap, 0, pair[1], "After", brand.accentColor, INK)}
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: side ? top + each : top + 2 * each + gap,
          height: tall ? 150 : foot,
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
