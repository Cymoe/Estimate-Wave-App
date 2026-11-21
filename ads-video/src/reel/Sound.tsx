import { Audio, interpolate, Sequence, useVideoConfig } from "remotion";
import { source } from "../Ad";
import type { Sound as SoundPlan } from "../types";

/** How loud the music is under the voice, and once the voice has finished. */
const UNDER = 0.15;
const OPEN = 0.55;
const hold = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Everything heard besides the voice. The music comes up quickly, sits low
 * while the voice talks, lifts on the ask and fades with the last frames.
 * Effects are few: one as the finished work is revealed, and one on the ask.
 * A cut is not an event; a whoosh on every one makes the ad sound like a template.
 */
export const Sound: React.FC<{ sound: SoundPlan; moves: number[]; lands: number[]; askAt: number; voiceEnd: number; punch?: boolean }> = ({ sound, moves, lands, askAt, voiceEnd, punch = false }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const total = durationInFrames / fps;
  const bed = (f: number) => {
    const t = f / fps;
    // Punch: the music drops out for a moment just before the ask, and comes back as it lands.
    const drop = punch ? interpolate(t, [askAt - 0.55, askAt - 0.42, askAt - 0.02, askAt + 0.06], [1, 0, 0, 1.6], hold) : 1;
    return interpolate(t, [0, 0.3], [0, 1], hold) * interpolate(t, [voiceEnd - 0.15, voiceEnd + 0.45], [UNDER, OPEN], hold) * interpolate(t, [total - 0.6, total], [1, 0], hold) * drop;
  };
  const cue = (file: string | undefined, times: number[], volume: number, early = 0) =>
    file
      ? times.map((t, i) => (
          <Sequence key={`${file}${i}`} from={Math.max(0, Math.round((t - early) * fps))} layout="none">
            <Audio src={source(file)} volume={volume} />
          </Sequence>
        ))
      : null;
  return (
    <>
      {sound.music ? <Audio src={source(sound.music)} trimBefore={Math.round((sound.musicFrom ?? 0) * fps)} volume={bed} /> : null}
      {/* A move is heard a touch before it is seen, as a cut is. */}
      {cue(sound.move, moves, 0.3, 0.06)}
      {cue(sound.land, lands, 0.5)}
      {cue(sound.ask, [askAt + 0.25], 0.36)}
    </>
  );
};
