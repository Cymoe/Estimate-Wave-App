import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import { Backdrop } from "./parts/Backdrop";
import { BrandChip, ProgressBar } from "./parts/Chrome";
import { Captions } from "./parts/Captions";
import { EndCard } from "./parts/EndCard";
import { Footage } from "./parts/Footage";
import { Headline } from "./parts/Headline";
import { Presenter } from "./parts/Presenter";
import { Canvas } from "./formats/Canvas";
import { Chat } from "./formats/Chat";
import { Collage } from "./formats/Collage";
import { Swiss } from "./formats/Swiss";
import { Kinetic } from "./formats/Kinetic";
import { Markup } from "./formats/Markup";
import { Slices } from "./formats/Slices";
import { Versus } from "./formats/Versus";
import { Explainer } from "./formats/Explainer";
import { KineticText } from "./formats/KineticText";
import { StockMix } from "./formats/StockMix";
import { BeforeAfter } from "./styles/BeforeAfter";
import { Counter } from "./styles/Counter";
import { LightUp } from "./styles/LightUp";
import { Reel } from "./reel/Reel";
import { revealOf, shotsOf, steadyShotsOf } from "./reel/shots";
import { Sound } from "./reel/Sound";
import { INK } from "./theme";
import { askAt, runsOf } from "./timing";
import type { AdProps } from "./types";

/** When a reel's finished work is first revealed: the one moment it marks with a sound. */
const revealAt = (props: AdProps, shots: { line: number; start: number }[]): number[] => {
  const i = revealOf(props.photos, props.lines);
  return i > 0 ? [shots.find((s) => s.line === i)?.start ?? props.lines[i].start] : [];
};

/** How loud the music sits under a job site video nobody talks in: under the sound of the work, not hiding it. */
const FOOTAGE_MUSIC = 0.35;

/** A checklist in the look asked for; the dark-box look when none is. */
const ExplainerLook: React.FC<AdProps & { look?: string; tag?: string; snappy?: boolean }> = ({ look, snappy, ...props }) => {
  if (!look) return <Explainer {...props} snappy={snappy} />;
  const Look = { collage: Collage, swiss: Swiss, kinetic: Kinetic, markup: Markup, slices: Slices, versus: Versus }[look ?? ""] ?? Explainer;
  return <Look {...props} />;
};

/** A link stays a link; anything else is a file under public/. */
export const source = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));

/**
 * One ad. The voice sets the clock: the headline is up from the start, the
 * style's own scene plays through the spoken lines, the captions follow the
 * voice word by word, and the ask takes over when the last line starts.
 */
export const Ad: React.FC<AdProps> = (props) => {
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const total = durationInFrames / fps;
  const { style } = props;
  // A job site video plays to its end, and the ask comes after it.
  const footage = style.kind === "footage";
  const closeAt = style.kind === "chat" ? style.askAt : footage ? props.audioSec : askAt(props.lines);
  // Made of words alone: no photo behind, and the words on screen are the captions.
  const wordsOnly = style.kind === "kineticText" || style.kind === "chat" || style.kind === "explainer";
  // An explainer draws its own title, and its captions read in phrases like a reel's.
  const explainer = style.kind === "explainer";
  // In a mix the clip has the first line, so the photos run from the second.
  const runs =
    style.kind === "stockMix"
      ? runsOf(props.photos.slice(1), props.lines.slice(1), total).map((r, i) => (i === 0 ? { ...r, start: props.lines[1]?.start ?? 0 } : r))
      : wordsOnly || footage
        ? []
        : runsOf(props.photos, props.lines, total);
  // A reel is cut into shots; they run until the ask has covered the frame.
  const reel = style.kind === "reel";
  // Photos no line uses are for the closing look-back. The opening shows the ad's own, which were chosen for it: the first frame matters most.
  const shots = !reel ? [] : props.steady !== false ? steadyShotsOf(props.photos, props.lines, closeAt + 0.6) : shotsOf(props.photos, props.lines, closeAt + 0.6, { width, height }, props.sound?.beats, 0.6, props.spare ?? []);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {footage && props.footage ? <Footage src={props.footage.src} /> : reel ? <Reel {...props} shots={shots} until={closeAt} /> : explainer && props.photos.length ? null : wordsOnly ? <Canvas brand={props.brand} /> : <Backdrop runs={runs} sharper={style.kind === "counter"} />}
      {style.kind === "stockMix" ? <StockMix {...props} clip={style.clip} runs={runs} /> : null}
      {/* A job site video has no title over it: the owner wants the work on screen and nothing written across the top. */}
      {style.kind === "chat" || reel || explainer || footage ? null : <Headline text={props.headline} ratio={props.ratio} accent={props.brand.accentColor} />}
      {style.kind === "beforeAfter" ? (
        <BeforeAfter {...props} crossOn={style.crossOn} crossAt={style.crossAt} />
      ) : style.kind === "counter" ? (
        <Counter {...props} stats={style.stats} />
      ) : style.kind === "explainer" ? (
        <ExplainerLook {...props} look={style.look} tag={style.tag} snappy={style.snappy} />
      ) : style.kind === "kineticText" ? (
        <KineticText {...props} />
      ) : style.kind === "chat" ? (
        <Chat messages={style.messages} brand={props.brand} ratio={props.ratio} />
      ) : style.kind === "stockMix" || reel || footage ? null : (
        <LightUp {...props} runs={runs} />
      )}
      {props.presenter ? <Presenter src={props.presenter.src} ratio={props.ratio} /> : null}
      {style.kind === "chat" ? null : <BrandChip brand={props.brand} ratio={props.ratio} />}
      <EndCard brand={props.brand} ratio={props.ratio} from={closeAt} punch={props.punch} />
      {(wordsOnly && !explainer) || (style.kind === "explainer" && style.look === "kinetic") ? null : <Captions lines={props.lines} ratio={props.ratio} accent={props.brand.accentColor} phrases={reel || explainer || footage} />}
      <ProgressBar color={props.brand.accentColor} />
      {props.audio ? <Audio src={source(props.audio)} /> : null}
      {props.sound ? (
        <Sound
          sound={props.sound}
          moves={reel ? [] : shots.filter((s) => s.opens && s.start > 0).map((s) => s.start)}
          lands={
            reel
              ? revealAt(props, shots)
              : explainer
                ? // A soft knock as each point is ticked.
                  props.lines.flatMap((l, i) => (i > 0 && l.label && l.start < closeAt ? [(props.lines[i + 1]?.start ?? l.end) - 0.1] : []))
                : props.lines.filter((l) => l.label && l.start < closeAt).map((l) => l.start + 0.1)
          }
          askAt={closeAt}
          voiceEnd={props.audioSec}
          punch={props.punch}
          under={footage ? FOOTAGE_MUSIC : undefined}
        />
      ) : null}
    </AbsoluteFill>
  );
};
