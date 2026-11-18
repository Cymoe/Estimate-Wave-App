import { Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { cardBox, cover, PhotoCard } from "../parts/PhotoCard";
import { display } from "../theme";
import type { Run } from "../timing";
import type { AdProps } from "../types";

/**
 * A finished room starts dim and grey. Then light crosses it at a slant and
 * the colour comes up behind the light, as if the paint had just gone on.
 * Later photos arrive already lit.
 */
export const LightUp: React.FC<AdProps & { runs: Run[] }> = ({ runs, ratio, lines, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const now = runs.filter((r) => t >= r.start).pop() ?? runs[0];
  const box = cardBox(now.photo, ratio);
  return (
    <>
      {runs.map((run, i) => (
        <PhotoCard key={i} run={run} first={i === 0} last={i === runs.length - 1} ratio={ratio}>
          {(_size, since) => {
            const zoom = interpolate(frame, [run.start * fps, run.end * fps], [1.03, 1.12], { extrapolateRight: "clamp" });
            const src = source(run.photo.src);
            if (i > 0) return <Img src={src} style={cover(zoom)} />;
            // The light crosses in a second and a half, starting once the card has landed.
            const sweep = interpolate(since, [0.9 * fps, 2.4 * fps], [-25, 135], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
            const glow = interpolate(since, [2.2 * fps, 2.5 * fps, 3.1 * fps], [1, 1.16, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const lit = `linear-gradient(105deg, #000 ${sweep - 14}%, transparent ${sweep}%)`;
            return (
              <>
                <Img src={src} style={{ ...cover(zoom), filter: "grayscale(1) brightness(0.42) contrast(0.92)" }} />
                <Img src={src} style={{ ...cover(zoom), filter: `brightness(${glow}) saturate(1.08)`, WebkitMaskImage: lit, maskImage: lit }} />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(105deg, transparent ${sweep - 16}%, rgba(255,255,255,0.75) ${sweep - 3}%, rgba(255,255,255,0.0) ${sweep + 5}%)`,
                    mixBlendMode: "screen",
                  }}
                />
              </>
            );
          }}
        </PhotoCard>
      ))}
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
              top: box.top + box.height - 52,
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
