import { AbsoluteFill, OffthreadVideo } from "remotion";
import { source } from "../Ad";

/**
 * A job site video, as it was shot. It is shown whole: a clip that doesn't fill the frame (shot sideways for a tall
 * ad) sits in the middle over a soft, dark copy of itself, the same way a steady reel shows a photo. Nothing moves
 * it or cuts it. Its sound is the ad's voice (played by the Ad as its audio), so the picture here plays muted.
 */
export const Footage: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <OffthreadVideo
      src={source(src)}
      muted
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(36px) brightness(0.45)", transform: "scale(1.15)" }}
    />
    <OffthreadVideo src={source(src)} muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
  </AbsoluteFill>
);
