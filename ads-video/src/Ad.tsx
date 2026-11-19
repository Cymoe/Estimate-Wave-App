import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import { Backdrop } from "./parts/Backdrop";
import { BrandChip, ProgressBar } from "./parts/Chrome";
import { Captions } from "./parts/Captions";
import { EndCard } from "./parts/EndCard";
import { Headline } from "./parts/Headline";
import { Canvas } from "./formats/Canvas";
import { Chat } from "./formats/Chat";
import { KineticText } from "./formats/KineticText";
import { StockMix } from "./formats/StockMix";
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
  const { style } = props;
  const closeAt = style.kind === "chat" ? style.askAt : askAt(props.lines);
  // Made of words alone: no photo behind, and the words on screen are the captions.
  const wordsOnly = style.kind === "kineticText" || style.kind === "chat";
  // In a mix the clip has the first line, so the photos run from the second.
  const runs =
    style.kind === "stockMix"
      ? runsOf(props.photos.slice(1), props.lines.slice(1), total).map((r, i) => (i === 0 ? { ...r, start: props.lines[1]?.start ?? 0 } : r))
      : wordsOnly
        ? []
        : runsOf(props.photos, props.lines, total);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {wordsOnly ? <Canvas brand={props.brand} /> : <Backdrop runs={runs} sharper={style.kind === "counter"} />}
      {style.kind === "stockMix" ? <StockMix {...props} clip={style.clip} runs={runs} /> : null}
      {style.kind === "chat" ? null : <Headline text={props.headline} ratio={props.ratio} accent={props.brand.accentColor} />}
      {style.kind === "beforeAfter" ? (
        <BeforeAfter {...props} crossOn={style.crossOn} crossAt={style.crossAt} />
      ) : style.kind === "counter" ? (
        <Counter {...props} stats={style.stats} />
      ) : style.kind === "kineticText" ? (
        <KineticText {...props} />
      ) : style.kind === "chat" ? (
        <Chat messages={style.messages} brand={props.brand} ratio={props.ratio} />
      ) : style.kind === "stockMix" ? null : (
        <LightUp {...props} runs={runs} />
      )}
      {style.kind === "chat" ? null : <BrandChip brand={props.brand} ratio={props.ratio} />}
      <EndCard brand={props.brand} ratio={props.ratio} from={closeAt} />
      {wordsOnly ? null : <Captions lines={props.lines} ratio={props.ratio} accent={props.brand.accentColor} />}
      <ProgressBar color={props.brand.accentColor} />
      {props.audio ? <Audio src={source(props.audio)} /> : null}
    </AbsoluteFill>
  );
};
