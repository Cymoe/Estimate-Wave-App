import { useCallback, useRef } from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import { source } from "../Ad";
import type { Ratio } from "../types";

/**
 * How green a pixel has to be (green over the larger of red and blue, 0 to 255) to start fading, and to be gone.
 * In between it is see-through by degrees, so hair and edges stay soft.
 */
export const KEY_SOFT = 40;
export const KEY_HARD = 90;

/**
 * Takes the green screen out of one frame, in place: a pixel the green dominates is made see-through, and the
 * green that spills onto the person (a green rim on the hair, a green cast on the skin) is pulled back down to the
 * level of the other two colours. No key colour has to be picked: any green backdrop works, lit evenly or not.
 */
export function keyGreen(data: Uint8ClampedArray, soft = KEY_SOFT, hard = KEY_HARD) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const other = r > b ? r : b;
    const over = g - other;
    if (over >= hard) {
      data[i + 3] = 0;
      continue;
    }
    if (over > soft) data[i + 3] = Math.round((data[i + 3] * (hard - over)) / (hard - soft));
    if (over > 0) data[i + 1] = other;
  }
}

/** Where the creator stands: low on the right, up to the bottom edge, leaving the top for the headline. */
export const PRESENTER_BOX: Record<Ratio, { width: number; height: number; right: number }> = {
  "9x16": { width: 660, height: 1180, right: -40 },
  "4x5": { width: 560, height: 860, right: -30 },
};

/**
 * An on-camera creator's take, keyed and stood in front of the photos. Their own sound is the ad's voice (played
 * by the Ad as its audio), so this plays the picture alone. The end card covers them when the ask comes.
 */
export const Presenter: React.FC<{ src: string; ratio: Ratio }> = ({ src, ratio }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const box = PRESENTER_BOX[ratio];
  const onVideoFrame = useCallback((image: CanvasImageSource) => {
    const el = canvas.current;
    if (!el) return;
    const w = (image as HTMLVideoElement).videoWidth || (image as HTMLImageElement).naturalWidth || (image as HTMLImageElement).width || 0;
    const h = (image as HTMLVideoElement).videoHeight || (image as HTMLImageElement).naturalHeight || (image as HTMLImageElement).height || 0;
    if (!w || !h) return;
    // Never drawn larger than it will show, so a 4K take keys as fast as a 1080p one.
    const scale = Math.min(1, (box.height * 1.1) / h);
    el.width = Math.round(w * scale);
    el.height = Math.round(h * scale);
    const draw = el.getContext("2d", { willReadFrequently: true });
    if (!draw) return;
    draw.drawImage(image, 0, 0, el.width, el.height);
    const pixels = draw.getImageData(0, 0, el.width, el.height);
    keyGreen(pixels.data);
    draw.putImageData(pixels, 0, 0);
  }, [box.height]);
  // Steps in from the side over the first moments, like the photos settle.
  const enter = interpolate(frame / fps, [0, 0.35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <OffthreadVideo src={source(src)} muted onVideoFrame={onVideoFrame} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      <div
        style={{
          position: "absolute",
          right: box.right,
          bottom: 0,
          width: box.width,
          height: box.height,
          opacity: enter,
          transform: `translateX(${(1 - enter) * 60}px)`,
          // A soft shadow under the person so they sit on the photo rather than float over it.
          filter: "drop-shadow(0 18px 28px rgba(0,0,0,0.45))",
        }}
      >
        <canvas ref={canvas} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom center" }} />
      </div>
    </AbsoluteFill>
  );
};
