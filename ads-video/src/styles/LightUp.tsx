import { Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { LabelPills } from "../parts/Labels";
import { cardBox, cover, PhotoCard } from "../parts/PhotoCard";
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
      <LabelPills lines={lines} brand={brand} edge={box.top + box.height} />
    </>
  );
};
