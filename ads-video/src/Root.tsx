import { Composition } from "remotion";
import { Ad } from "./Ad";
import { Still } from "./formats/Still";
import { FPS, HOLD_SEC, SIZES, type AdProps, type StillProps } from "./types";

/** Stands in until an ad's own props are passed with --props. */
const placeholder: AdProps = {
  ratio: "9x16",
  style: { kind: "lightUp" },
  brand: { name: "Webb Leads", primaryColor: "#336699", accentColor: "#8fb6e0", markets: ["Midland", "Odessa"] },
  headline: "Fresh paint, one call",
  lines: [
    { voice: "Thinking about painting this year?", start: 0, end: 2.4 },
    { voice: "We match you with one vetted local painter.", start: 2.6, end: 5.6 },
    { voice: "Get a quote from Webb Leads today.", start: 5.8, end: 8.2 },
  ],
  audio: "",
  audioSec: 8.4,
  photos: [],
};

/** Stands in until a still's own props are passed with --props. */
const stillPlaceholder: StillProps = {
  ratio: "4x5",
  brand: placeholder.brand,
  headline: "Fresh paint, one call",
  sub: "One vetted local painter. One free quote.",
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="Ad"
      component={Ad}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={300}
      defaultProps={placeholder}
      calculateMetadata={({ props }) => ({ ...SIZES[props.ratio], durationInFrames: Math.ceil((props.audioSec + HOLD_SEC) * FPS) })}
    />
    <Composition
      id="Still"
      component={Still}
      fps={FPS}
      width={1080}
      height={1350}
      durationInFrames={1}
      defaultProps={stillPlaceholder}
      calculateMetadata={({ props }) => ({ ...SIZES[props.ratio] })}
    />
  </>
);
