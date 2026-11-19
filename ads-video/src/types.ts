/** What one ad is rendered from. Everything on screen comes from here: the renderer writes no words of its own. */
export type Ratio = "9x16" | "4x5";

export interface Photo {
  /** A link, or a file under public/. */
  src: string;
  width: number;
  height: number;
  /** What to move in on, each 0 to 100 across and down the photo. Without any, a little above the middle. */
  focus?: Array<{ x: number; y: number }>;
  /** A few seconds of this same photo with the camera moving, when one has been made and checked. */
  motion?: { src: string };
}

/** One spoken line, and when ElevenLabs says it. */
export interface Line {
  voice: string;
  start: number;
  end: number;
  /** A few words pinned to the photo while this line is said ("Floors covered"). */
  label?: string;
  /** When the voice says each word of the line, when it is known. */
  words?: Array<{ text: string; start: number; end: number }>;
}

export interface Brand {
  name: string;
  primaryColor: string;
  accentColor: string;
  markets: string[];
}

/** A video clip. It sets a scene; it is never shown as the brand's own finished work. */
export interface Clip {
  src: string;
  width: number;
  height: number;
  /** Seconds into the clip to start from. */
  from?: number;
  /** Where its subject sits across the clip, 0 (left) to 100 (right), so a wide clip is cut to a tall frame around it. */
  focusX?: number;
}

export interface Message {
  from: "them" | "us";
  text: string;
  /** When it arrives, in seconds. */
  at: number;
}

export interface Stat {
  /** The number that counts up to its value and stops. */
  value: number;
  label: string;
}

export type Style =
  /** A real before photo; the after wipes across behind a moving divider. photos[0] is the before, photos[1] the after. */
  | {
      kind: "beforeAfter";
      /** The word the divider crosses on. */
      crossOn?: string;
      /** Otherwise the second it crosses at: where the first line on the after photo starts. */
      crossAt?: number;
    }
  /** A finished room starts dim and grey; light and colour sweep across it. */
  | { kind: "lightUp" }
  /** Numbers that count and snap into place, one per spoken line after the first. */
  | { kind: "counter"; stats: Stat[] }
  /** No photos: each spoken line arrives as large moving words, and the points collect underneath. */
  | { kind: "kineticText" }
  /** No photos and no voice: a homeowner's questions and the brand's answers arrive as message bubbles. */
  | { kind: "chat"; messages: Message[]; /** When the ask takes over, in seconds. */ askAt: number }
  /** A moving clip from outside the Library fills the frame for the first line; the job's own photos carry the rest. */
  | { kind: "stockMix"; clip: Clip }
  /** The photos fill the frame and never sit still: each line is cut into a few shots, close and wide, and a new line arrives with a move. */
  | { kind: "reel" };

/** What plays under the voice. Every part is optional; an ad without any is the voice alone. */
export interface Sound {
  /** The music, kept low under the voice and let up on the ask. */
  music?: string;
  /** Seconds into the track to start from. */
  musicFrom?: number;
  /** Where the track's beats fall, in seconds from where it starts playing here, so a cut inside a line can land on one. */
  beats?: number[];
  /** Short effects: a new line arriving, a label landing, the ask. */
  move?: string;
  land?: string;
  ask?: string;
}

// A type, not an interface: Remotion reads a composition's props as a plain record.
export type AdProps = {
  ratio: Ratio;
  style: Style;
  brand: Brand;
  /** The words at the top for the whole ad. */
  headline: string;
  /** The spoken lines in order. The end card comes up as the last sentence of the last line starts. */
  lines: Line[];
  /** The voice track, and how long it runs. */
  audio: string;
  audioSec: number;
  /** One photo per spoken line; a photo used for lines in a row stays up. */
  photos: Photo[];
  sound?: Sound;
};

export const FPS = 30;
export const SIZES: Record<Ratio, { width: number; height: number }> = {
  "9x16": { width: 1080, height: 1920 },
  "4x5": { width: 1080, height: 1350 },
};
/** How long the end card holds after the voice has finished. */
export const HOLD_SEC = 1.6;

/** A still image ad: one frame, a line, what backs it up and the button. */
export type StillProps = {
  ratio: Ratio;
  brand: Brand;
  headline: string;
  sub: string;
  /** Fills the frame behind the words; without one the brand's colours do. */
  photo?: Photo;
};
