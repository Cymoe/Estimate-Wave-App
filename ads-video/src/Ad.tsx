import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import { Backdrop } from "./parts/Backdrop";
import { BrandChip, ProgressBar } from "./parts/Chrome";
import { Captions } from "./parts/Captions";
import { EndCard } from "./parts/EndCard";
import { Headline } from "./parts/Headline";
import { BeforeAfter } from "./styles/BeforeAfter";
import { Counter } from "./styles/Counter";
import { LightUp } from "./styles/LightUp";
import { INK } from "./theme";
import { askAt, runsOf } from "./timing";
import type { AdProps } from "./types";

/** A link stays a link; anything else is a file under public/. */
export const source = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));

/**
 * One ad. The voice sets the clock: the headline is up from the start, the
 * style's own scene plays through the spoken lines, the captions follow the
 * voice word by word, and the ask takes over when the last line starts.
 */
export const Ad: React.FC<AdProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const total = durationInFrames / fps;
  const closeAt = askAt(props.lines);
  const runs = runsOf(props.photos, props.lines, total);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Backdrop runs={runs} sharper={props.style.kind === "counter"} />
      <Headline text={props.headline} ratio={props.ratio} accent={props.brand.accentColor} />
      {props.style.kind === "beforeAfter" ? (
        <BeforeAfter {...props} crossOn={props.style.crossOn} />
      ) : props.style.kind === "counter" ? (
        <Counter {...props} stats={props.style.stats} />
      ) : (
        <LightUp {...props} runs={runs} />
      )}
      <BrandChip brand={props.brand} ratio={props.ratio} />
      <EndCard brand={props.brand} ratio={props.ratio} from={closeAt} />
      <Captions lines={props.lines} ratio={props.ratio} accent={props.brand.accentColor} />
      <ProgressBar color={props.brand.accentColor} />
      {props.audio ? <Audio src={source(props.audio)} /> : null}
    </AbsoluteFill>
  );
};
