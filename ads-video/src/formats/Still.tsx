import { AbsoluteFill, Img, staticFile } from "remotion";
import { source } from "../Ad";
import { body, INK, kicker, poster } from "../theme";
import type { Photo, StillProps } from "../types";

/**
 * A still image ad: the job's photos edge to edge, never boxed in bars (the owner: it mustn't look like a web page,
 * Nov 2026), in the brand's navy and gold with its house mark. Where the words sit changes from ad to ad (`variant`),
 * so a set doesn't look stamped from one mould. The lettering follows Goodyear's: heavy condensed capitals for the
 * headline, the name and the button; an italic serif in gold for the first sentence of the line under it:
 *   0 top     the headline on the top of the picture, the ask along the bottom
 *   1 band    a navy band across the middle carries the words, photos above and below it
 *   2 bottom  the picture is clean on top; the headline sits low, above the ask
 *   3 card    a navy card in the middle carries the words, the photos showing all round it
 */
export const Still: React.FC<StillProps> = (props) => {
  const photos = props.grid?.length ? props.grid.slice(0, 4) : props.pair ? [props.pair[0], props.pair[1]] : props.photo ? [props.photo] : [];
  return <Layout {...props} photos={photos} isPair={Boolean(props.pair && !props.grid?.length)} />;
};

/** The logo's own colours (the owner moved the brand to navy and gold, Nov 2026). */
const NAVY = "#0f1c42";
const GOLD = "#f2c043";
const SHADE = "15,28,66";

/** The mark (the gold house and tick on navy) as a disc with a white rim, to sit where photos meet or beside the name. */
const Mark: React.FC<{ size: number; left: number; top: number }> = ({ size, left, top }) => (
  <div
    style={{
      position: "absolute",
      left: left - size / 2,
      top: top - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: "hidden",
      border: "6px solid #fff",
      boxSizing: "border-box",
      backgroundColor: NAVY,
      boxShadow: "0 10px 34px rgba(0,0,0,0.4)",
    }}
  >
    <Img src={staticFile("brand/mark-navy.png")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.08)" }} />
  </div>
);

/** The brand's name as its logo sets it: the first word gold, the rest white. */
const Name: React.FC<{ name: string; size: number }> = ({ name, size }) => {
  const [first, ...rest] = name.split(" ");
  return (
    <div style={{ fontFamily: poster, fontWeight: 400, fontSize: size, letterSpacing: 1, textTransform: "uppercase", textShadow: "0 2px 14px rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}>
      <span style={{ color: GOLD }}>{first}</span>
      {rest.length ? <span style={{ color: "#fff" }}> {rest.join(" ")}</span> : null}
    </div>
  );
};

const Button: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <div style={{ fontFamily: poster, fontWeight: 400, fontSize: size, letterSpacing: 1.5, textTransform: "uppercase", color: NAVY, backgroundColor: GOLD, padding: `${Math.round(size * 0.4)}px ${Math.round(size * 0.9)}px`, borderRadius: 10, boxShadow: "0 8px 26px rgba(0,0,0,0.38)", whiteSpace: "nowrap" }}>
    Get a free quote
  </div>
);

/** The line under the headline in two parts: its first sentence (set as the italic kicker) and whatever follows it. */
function partsOf(sub: string): [string, string] {
  const m = sub.trim().match(/^(.+?[.!?])\s+(.+)$/s);
  return m ? [m[1], m[2]] : [sub.trim(), ""];
}

/** The headline in heavy condensed capitals, a gold rule under it, then the offer line: its first sentence in gold italic, the rest plain. */
const Words: React.FC<{ headline: string; sub: string; center?: boolean; max?: number }> = ({ headline, sub, center = false, max = 150 }) => {
  // Condensed letters: about a third narrower than the old ones, so the same words stand taller on fewer lines.
  const size = Math.min(max, headline.length <= 16 ? 150 : headline.length <= 26 ? 128 : headline.length <= 38 ? 110 : 94);
  const [first, rest] = partsOf(sub);
  const shadow = "0 2px 12px rgba(0,0,0,0.6)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start", textAlign: center ? "center" : "left" }}>
      <div style={{ fontFamily: poster, fontWeight: 400, fontSize: size, lineHeight: 1.06, letterSpacing: 0.5, textTransform: "uppercase", color: "#fff", textShadow: "0 4px 22px rgba(0,0,0,0.55)" }}>{headline}</div>
      <div style={{ width: 132, height: 10, backgroundColor: GOLD, marginTop: 22 }} />
      {first ? <div style={{ fontFamily: kicker, fontStyle: "italic", fontWeight: 600, fontSize: 44, lineHeight: 1.18, color: GOLD, marginTop: 18, textShadow: shadow }}>{first}</div> : null}
      {rest ? <div style={{ fontFamily: body, fontWeight: 600, fontSize: 36, lineHeight: 1.24, color: "#fff", marginTop: 10, textShadow: shadow }}>{rest}</div> : null}
    </div>
  );
};

type Cell = { ph: Photo; left: number; top: number; width: number; height: number };

/** Where each photo goes in a frame `H` tall starting at `top`: one fills it; two share it; three put one across and two beneath; four make a two-by-two. */
function cellsOf(photos: Photo[], pair: boolean, W: number, top: number, H: number, gap: number, split?: number): { cells: Cell[]; joinX: number; joinY: number } {
  const half = Math.floor((W - gap) / 2);
  if (photos.length <= 1) return { cells: photos.map((ph) => ({ ph, left: 0, top, width: W, height: H })), joinX: W / 2, joinY: top + H / 2 };
  if (photos.length === 2) {
    // A before and its after stand side by side when both are upright; otherwise one above the other.
    const side = pair && photos[0].height > photos[0].width && photos[1].height > photos[1].width;
    if (side) return { cells: photos.map((ph, i) => ({ ph, left: i * (half + gap), top, width: half, height: H })), joinX: half + gap / 2, joinY: top + H * 0.42 };
    const h = split ?? Math.floor((H - gap) / 2);
    return {
      cells: [
        { ph: photos[0], left: 0, top, width: W, height: h },
        { ph: photos[1], left: 0, top: top + h + gap, width: W, height: H - h - gap },
      ],
      joinX: W / 2,
      joinY: top + h + gap / 2,
    };
  }
  const four = photos.length >= 4;
  const topH = split ?? (four ? Math.floor((H - gap) / 2) : Math.round(H * 0.54));
  const lowH = H - topH - gap;
  const cells: Cell[] = four
    ? photos.map((ph, i) => ({ ph, left: (i % 2) * (half + gap), top: top + (i < 2 ? 0 : topH + gap), width: half, height: i < 2 ? topH : lowH }))
    : [{ ph: photos[0], left: 0, top, width: W, height: topH }, ...photos.slice(1, 3).map((ph, i) => ({ ph, left: i * (half + gap), top: top + topH + gap, width: half, height: lowH }))];
  return { cells, joinX: W / 2, joinY: top + topH + gap / 2 };
}

const Layout: React.FC<StillProps & { photos: Photo[]; isPair: boolean }> = ({ ratio, brand, headline, sub, photos, isPair, variant = 0 }) => {
  const tall = ratio === "9x16";
  const W = 1080;
  const H = tall ? 1920 : 1350;
  const gap = 8;
  const safeTop = tall ? 170 : 0;
  const safeBottom = tall ? 300 : 0;
  // A lone photo has no join for a band to sit on, so it keeps to the looks that suit it.
  const look = photos.length <= 1 && variant % 4 === 1 ? 2 : variant % 4;
  // Every look fills the frame with the photos; a band or a card is laid over where they meet, as tall as its words.
  const frames = cellsOf(photos, isPair, W, 0, H, gap);
  const { cells, joinX, joinY } = frames;
  const foot = (
    <div style={{ position: "absolute", left: 56, right: 56, bottom: safeBottom + 44, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Name name={brand.name} size={50} />
      <Button />
    </div>
  );
  const shadeUp = (h: number, strong = 0.9) => (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: W, height: h, background: `linear-gradient(to top, rgba(${SHADE},${strong}) 0%, rgba(${SHADE},${strong * 0.7}) 50%, rgba(${SHADE},0) 100%)` }} />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: photos.length ? "#fff" : NAVY }}>
      {cells.map((c, i) => (
        <div key={i} style={{ position: "absolute", left: c.left, top: c.top, width: c.width, height: c.height, overflow: "hidden", backgroundColor: INK }}>
          <Img src={source(c.ph.src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${c.ph.focus?.[0]?.x ?? 50}% ${c.ph.focus?.[0]?.y ?? 50}%` }} />
        </div>
      ))}
      {look === 0 ? (
        <>
          {/* Deep enough for a three-line headline and both lines under it to read on a bright photo. */}
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: safeTop + 700, background: `linear-gradient(to bottom, rgba(${SHADE},0.94) 0%, rgba(${SHADE},0.8) 45%, rgba(${SHADE},0.5) 68%, rgba(${SHADE},0) 100%)` }} />
          {shadeUp(safeBottom + 250, 0.88)}
          <div style={{ position: "absolute", left: 56, right: 56, top: safeTop + 44 }}>
            <Words headline={headline} sub={sub} />
          </div>
          {photos.length > 1 ? <Mark size={196} left={joinX} top={joinY} /> : null}
          {foot}
        </>
      ) : look === 1 ? (
        <>
          <div style={{ position: "absolute", left: 0, top: Math.min(joinY, H * 0.52), transform: "translateY(-50%)", width: W, minHeight: 300, backgroundColor: NAVY, display: "flex", alignItems: "center", padding: "44px 56px", boxSizing: "border-box", gap: 36, borderTop: `6px solid ${GOLD}`, borderBottom: `6px solid ${GOLD}` }}>
            <div style={{ flex: 1 }}>
              <Words headline={headline} sub={sub} max={104} />
            </div>
            <div style={{ position: "relative", width: 170, height: 170, flex: "none" }}>
              <Mark size={170} left={85} top={85} />
            </div>
          </div>
          {shadeUp(safeBottom + 230, 0.85)}
          {foot}
        </>
      ) : look === 2 ? (
        <>
          {shadeUp(safeBottom + 680, 0.94)}
          {/* In a top corner: where the photos meet is where a long headline stands. */}
          <Mark size={150} left={56 + 75} top={safeTop + 56 + 75} />
          <div style={{ position: "absolute", left: 56, right: 56, bottom: safeBottom + 160 }}>
            <Words headline={headline} sub={sub} />
          </div>
          {foot}
        </>
      ) : (
        <>
          {shadeUp(safeBottom + 230, 0.85)}
          <div style={{ position: "absolute", left: 48, right: 48, top: Math.max(joinY, H * 0.5), transform: "translateY(-50%)", backgroundColor: NAVY, borderRadius: 28, padding: "84px 40px 36px", boxShadow: "0 18px 50px rgba(0,0,0,0.45)", border: `4px solid ${GOLD}` }}>
            <div style={{ position: "absolute", left: "50%", top: 0 }}>
              <Mark size={150} left={0} top={0} />
            </div>
            <Words headline={headline} sub={sub} center max={92} />
          </div>
          {foot}
        </>
      )}
    </AbsoluteFill>
  );
};
