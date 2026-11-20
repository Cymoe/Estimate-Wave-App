import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { body, display, INK, WIDE, ZONES } from "../theme";
import { askAt } from "../timing";
import type { AdProps } from "../types";

/** A cross is for what a quote leaves out: a warm red that reads as "missing" on the dark canvas. */
const CROSS = "#e5484d";

const sec = (frame: number, fps: number) => frame / fps;

/**
 * A short lesson drawn as graphics, with no photo. The headline slams in word
 * by word under a small tag, holds while the first line is said, then rises
 * to the top. Each line after it adds a numbered point; once the voice has
 * said it, the number turns into a tick (or a cross, for what's left out),
 * drawn on with a small burst. The points stay, so the frame always shows
 * the whole list so far.
 */
export const Explainer: React.FC<AdProps & { tag?: string }> = ({ lines, ratio, brand, headline, tag }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = sec(frame, fps);
  const tall = ratio === "9x16";
  const zones = ZONES[ratio];
  const closeAt = askAt(lines);
  // The points: every line between the opening and the ask that has a label.
  const points = lines.map((line, i) => ({ line, i })).filter(({ line, i }) => i > 0 && i < lines.length - 1 && line.label);
  const listAt = points[0]?.line.start ?? closeAt;

  // The title: big and centred in the middle, then up into the top band when the list starts.
  const words = headline.split(/\s+/).filter(Boolean);
  const letters = headline.length;
  const big = Math.round((letters <= 22 ? 150 : letters <= 34 ? 132 : letters <= 46 ? 116 : 100) * (tall ? 1 : 0.8));
  const rise = spring({ frame: frame - Math.round((listAt - 0.15) * fps), fps, config: { damping: 200 }, durationInFrames: 16 });
  const cardMid = zones.card.top + zones.card.height / 2;
  const headMid = zones.head.top + zones.head.height / 2;
  const small = (tall ? 70 : 54) / big;
  const titleY = interpolate(rise, [0, 1], [cardMid, headMid]);
  const titleScale = interpolate(rise, [0, 1], [1, small]);
  const tagIn = spring({ frame: frame + 8, fps, config: { damping: 14, mass: 0.6 } });

  // The points sit in the middle band, as tall as fits.
  const gap = tall ? 34 : 22;
  const rowH = Math.min(tall ? 230 : 176, points.length ? (zones.card.height - gap * (points.length - 1)) / points.length : 0);
  const listTop = zones.card.top + (zones.card.height - (rowH * points.length + gap * Math.max(0, points.length - 1))) / 2;
  const box = Math.round(Math.min(rowH * 0.66, tall ? 130 : 104));
  const labelSize = tall ? 74 : 58;

  return (
    <>
      {/* A faint grid gives the canvas the look of a chart, and drifts so the frame never sits still. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.05) 2px, transparent 2px)",
          backgroundSize: "120px 120px",
          backgroundPosition: `0px ${-(frame * 0.6) % 120}px`,
          maskImage: "radial-gradient(circle at 50% 45%, black 20%, transparent 75%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 540,
          top: titleY,
          width: WIDE,
          transform: `translate(-50%, -50%) scale(${titleScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {tag ? (
          <div
            style={{
              fontFamily: body,
              fontWeight: 600,
              fontSize: tall ? 40 : 34,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: INK,
              backgroundColor: brand.accentColor,
              padding: "12px 30px",
              borderRadius: 60,
              marginBottom: big * 0.32,
              opacity: tagIn * (1 - rise),
              transform: `translateY(${interpolate(tagIn, [0, 1], [-30, 0])}px)`,
            }}
          >
            {tag}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: big * 0.24, rowGap: big * 0.04 }}>
          {words.map((w, i) => {
            // Fast enough that the first frame a scroller stops on already reads.
            const at = frame - i * 2 + 8;
            const slam = spring({ frame: at, fps, config: { damping: 10, mass: 0.5, stiffness: 180 } });
            const lit = /\d/.test(w) || i === words.length - 1;
            return (
              <span
                key={i}
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: big,
                  lineHeight: 1.04,
                  letterSpacing: -2,
                  color: lit ? brand.accentColor : "#fff",
                  opacity: at < 0 ? 0 : interpolate(slam, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                  transform: `scale(${interpolate(slam, [0, 1], [1.7, 1])})`,
                  display: "inline-block",
                  textShadow: "0 12px 40px rgba(0,0,0,0.45)",
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </div>

      {points.map(({ line, i }, k) => {
        if (t < line.start - 0.05) return null;
        const enter = spring({ frame: frame - Math.round((line.start - 0.05) * fps), fps, config: { damping: 15, mass: 0.6 } });
        // Marked once it has been said: as the next line starts.
        const doneAt = (lines[i + 1]?.start ?? line.end) - 0.1;
        const draw = spring({ frame: frame - Math.round(doneAt * fps), fps, config: { damping: 200 }, durationInFrames: 10 });
        const pop = spring({ frame: frame - Math.round(doneAt * fps), fps, config: { damping: 9, mass: 0.5 } });
        const marked = t >= doneAt;
        const cross = line.mark === "cross";
        const fill = cross ? CROSS : brand.accentColor;
        // The point being said is bright; the ones before it step back.
        const current = t < doneAt + 0.1;
        const burst = interpolate(frame - Math.round(doneAt * fps), [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const len = 120;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (1080 - WIDE) / 2,
              width: WIDE,
              top: listTop + k * (rowH + gap),
              height: rowH,
              display: "flex",
              alignItems: "center",
              gap: tall ? 34 : 26,
              padding: `0 ${tall ? 30 : 24}px`,
              borderRadius: 30,
              backgroundColor: current ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
              border: `3px solid ${current ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)"}`,
              opacity: interpolate(enter, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }) * (current ? 1 : 0.62),
              transform: `translateX(${interpolate(enter, [0, 1], [140, 0])}px)`,
              boxSizing: "border-box",
            }}
          >
            <div style={{ position: "relative", width: box, height: box, flexShrink: 0 }}>
              {marked ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: box * 0.24,
                    border: `5px solid ${fill}`,
                    opacity: 1 - burst,
                    transform: `scale(${1 + burst * 0.7})`,
                  }}
                />
              ) : null}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: box * 0.24,
                  backgroundColor: marked ? fill : "transparent",
                  border: `5px solid ${marked ? fill : "rgba(255,255,255,0.45)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `scale(${marked ? interpolate(pop, [0, 1], [0.8, 1]) : 1})`,
                  boxSizing: "border-box",
                }}
              >
                {marked ? (
                  <svg width={box * 0.62} height={box * 0.62} viewBox="0 0 40 40">
                    <path
                      d={cross ? "M10 10 L30 30 M30 10 L10 30" : "M8 21 L17 30 L33 11"}
                      stroke={cross ? "#fff" : INK}
                      strokeWidth="6"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={len}
                      strokeDashoffset={len * (1 - draw)}
                    />
                  </svg>
                ) : (
                  <span style={{ fontFamily: display, fontWeight: 800, fontSize: box * 0.5, color: "#fff" }}>{k + 1}</span>
                )}
              </div>
            </div>
            <div
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: labelSize,
                lineHeight: 1.1,
                color: "#fff",
                textDecoration: cross && marked ? `line-through ${CROSS} 6px` : undefined,
              }}
            >
              {line.label}
            </div>
          </div>
        );
      })}
    </>
  );
};
