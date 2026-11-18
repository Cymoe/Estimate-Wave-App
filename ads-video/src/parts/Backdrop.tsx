import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { INK } from "../theme";
import type { Run } from "../timing";

/**
 * Behind everything: the photo that's up, soft and dark and drifting, so the
 * frame is never an empty colour. `sharper` keeps it readable as a room, for
 * a style with no photo card in front. The photo is drawn at a quarter size
 * and scaled up: a wide blur over a full-size photo makes every frame slow to
 * draw, and the result looks the same.
 */
export const Backdrop: React.FC<{ runs: Run[]; sharper?: boolean }> = ({ runs, sharper }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill>
      {runs.map((run, i) => {
        const opacity = i === 0 ? 1 : interpolate(t, [run.start, run.start + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const drift = interpolate(t, [run.start, run.end], [1.2, 1.34], { extrapolateRight: "clamp" });
        return (
          <AbsoluteFill key={run.photo.src + i} style={{ opacity, overflow: "hidden" }}>
            <div style={{ width: "25%", height: "25%", transform: "scale(4)", transformOrigin: "0 0" }}>
              <Img
                src={source(run.photo.src)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: `blur(${sharper ? 3 : 11}px) saturate(1.1) brightness(${sharper ? 0.42 : 0.5})`,
                  transform: `scale(${drift})`,
                }}
              />
            </div>
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}f2 0%, ${INK}73 32%, ${INK}66 60%, ${INK}f5 100%)` }} />
    </AbsoluteFill>
  );
};
