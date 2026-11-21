import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ZONES, WIDE } from "../theme";
import { fit, type Run } from "../timing";
import type { Ratio } from "../types";

/** A box in the photo's own shape, centred in the space the frame gives photos (or a part of it). */
export function cardBox(photo: { width: number; height: number }, ratio: Ratio, share = 1) {
  const zone = ZONES[ratio].card;
  const height = Math.round(zone.height * share);
  const size = fit(photo, WIDE, height);
  return { ...size, left: Math.round((1080 - size.width) / 2), top: Math.round(zone.top + (height - size.height) / 2) };
}

/**
 * A photo as a card: its own shape, never stretched or cut. It springs in
 * from the right, floats a little while it's up, and leaves to the left when
 * the next one comes. `children` draws the photo itself, so a style can do
 * what it likes inside the card.
 */
export const PhotoCard: React.FC<{
  run: Run;
  first: boolean;
  last: boolean;
  ratio: Ratio;
  share?: number;
  children: (size: { width: number; height: number }, since: number) => React.ReactNode;
}> = ({ run, first, last, ratio, share = 1, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const since = frame - Math.round(run.start * fps);
  const until = Math.round(run.end * fps) - frame;
  if (since < -2 || (!last && until < -14)) return null;
  const box = cardBox(run.photo, ratio, share);
  const enter = spring({ frame: since - (first ? 6 : 0), fps, config: { damping: 15, mass: 0.9 } });
  const leave = last ? 0 : spring({ frame: -until, fps, config: { damping: 200 }, durationInFrames: 12 });
  const float = Math.sin(frame / 38) * 7;
  const tilt = Math.sin(frame / 61) * 0.45;
  const x = (first ? 0 : interpolate(enter, [0, 1], [1100, 0])) - leave * 1100;
  const y = (first ? interpolate(enter, [0, 1], [90, 0]) : 0) + float;
  return (
    <div
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        borderRadius: 38,
        overflow: "hidden",
        boxShadow: "0 40px 90px rgba(0,0,0,0.55), 0 0 0 5px rgba(255,255,255,0.92)",
        opacity: first ? enter : 1,
        transform: `translate(${x}px, ${y}px) rotate(${tilt + (1 - enter) * (first ? 0 : 5) - leave * 5}deg) scale(${first ? interpolate(enter, [0, 1], [0.9, 1]) : 1})`,
      }}
    >
      {children({ width: box.width, height: box.height }, since)}
    </div>
  );
};

/** The photo filling its card, drawing slowly closer for as long as it's up. */
export const cover = (zoom: number): React.CSSProperties => ({ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` });
