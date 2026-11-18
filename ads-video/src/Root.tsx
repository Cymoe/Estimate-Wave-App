import { Composition } from "remotion";
import { Ad } from "./Ad";
import { FPS, HOLD_SEC, SIZES, type AdProps } from "./types";

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

export const Root: React.FC = () => (
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
);
