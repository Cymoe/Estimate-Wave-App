import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/** The fonts are files in public/fonts (both under the Open Font License), so a render needs no font server. */
export const display = "Montserrat";
export const body = "Inter";
for (const [family, weight, file] of [
  [display, "700", "montserrat-latin-700-normal.woff2"],
  [display, "800", "montserrat-latin-800-normal.woff2"],
  [body, "500", "inter-latin-500-normal.woff2"],
  [body, "600", "inter-latin-600-normal.woff2"],
] as const)
  void loadFont({ family, weight, url: staticFile(`fonts/${file}`) });

export const INK = "#0b121c";
export const PAPER = "#ffffff";

/** Where each part of the frame sits, top and height in pixels. The tall size keeps clear of the app's own buttons. */
export const ZONES = {
  "9x16": { chip: 84, head: { top: 180, height: 290 }, card: { top: 510, height: 900 }, captions: { top: 1440, height: 220 } },
  "4x5": { chip: 40, head: { top: 104, height: 190 }, card: { top: 312, height: 640 }, captions: { top: 972, height: 230 } },
} as const;

/** The widest a photo card or a block of words may be. */
export const WIDE = 960;
