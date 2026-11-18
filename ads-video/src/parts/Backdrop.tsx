import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { INK } from "../theme";
import type { Run } from "../timing";

/** Behind everything: the photo that's up, soft and dark and drifting, so the frame is never an empty colour. */
export const Backdrop: React.FC<{ runs: Run[] }> = ({ runs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill>
      {runs.map((run, i) => {
        const opacity = i === 0 ? 1 : interpolate(t, [run.start, run.start + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const drift = interpolate(t, [run.start, run.end], [1.25, 1.4], { extrapolateRight: "clamp" });
        return (
          <AbsoluteFill key={run.photo.src + i} style={{ opacity }}>
            <Img
              src={source(run.photo.src)}
              style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(46px) saturate(1.1) brightness(0.5)", transform: `scale(${drift})` }}
            />
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}f2 0%, ${INK}73 32%, ${INK}66 60%, ${INK}f5 100%)` }} />
    </AbsoluteFill>
  );
};
