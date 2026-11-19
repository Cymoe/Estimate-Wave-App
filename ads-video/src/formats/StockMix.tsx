import { AbsoluteFill, Img, interpolate, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import { LabelPills } from "../parts/Labels";
import { cardBox, cover, PhotoCard } from "../parts/PhotoCard";
import { INK } from "../theme";
import type { Run } from "../timing";
import type { AdProps, Clip } from "../types";

/**
 * A moving clip opens the ad, filling the frame while the first line is
 * said. Then the job's own photos take over, one to a line, as cards. The
 * clip sets the scene and nothing more: it is gone before any claim about
 * the work is made. `runs` are the photos from the second line on.
 */
export const StockMix: React.FC<AdProps & { clip: Clip; runs: Run[] }> = ({ clip, runs, lines, ratio, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const until = lines[1]?.start ?? 3;
  const out = interpolate(t, [until - 0.15, until + 0.35], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const push = interpolate(t, [0, until + 0.4], [1.04, 1.16], { extrapolateRight: "clamp" });
  const now = runs.filter((r) => t >= r.start).pop() ?? runs[0];
  const box = now ? cardBox(now.photo, ratio) : null;
  return (
    <>
      {runs.map((run, i) => (
        <PhotoCard key={i} run={run} first={false} last={i === runs.length - 1} ratio={ratio}>
          {() => <Img src={source(run.photo.src)} style={cover(interpolate(frame, [run.start * fps, run.end * fps], [1.03, 1.12], { extrapolateRight: "clamp" }))} />}
        </PhotoCard>
      ))}
      {box ? <LabelPills lines={lines} brand={brand} edge={box.top + box.height} /> : null}
      {out > 0 ? (
        <AbsoluteFill style={{ opacity: out, overflow: "hidden", backgroundColor: INK }}>
          <OffthreadVideo
            src={source(clip.src)}
            trimBefore={Math.round((clip.from ?? 0) * fps)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${clip.focusX ?? 50}% 50%`, transform: `scale(${push})` }}
          />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK}e6 0%, ${INK}59 30%, ${INK}26 55%, ${INK}d9 100%)` }} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};
