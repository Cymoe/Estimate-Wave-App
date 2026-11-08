// Bundles recruiting's two briefs into convex/recruiting/lib/briefs.ts:
// screener-brief.md (Jordan's system prompt) and ad-brief.md (the ad
// agent's). Convex functions can't read files, so the briefs ship inside
// the code. Edit the .md files, then run `npm run recruiting:briefs` and
// commit both; a test fails if they disagree, so a stale brief can't deploy.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../convex/recruiting");
const brief = readFileSync(join(dir, "screener-brief.md"), "utf8");
const adBrief = readFileSync(join(dir, "ad-brief.md"), "utf8");
writeFileSync(
  join(dir, "lib/briefs.ts"),
  `// Generated from screener-brief.md and ad-brief.md by \`npm run recruiting:briefs\`. Edit the .md files, not this one.\nexport const BRIEF = ${JSON.stringify(brief)};\nexport const AD_BRIEF = ${JSON.stringify(adBrief)};\n`,
);
console.log(`Briefs bundled: screener ${brief.length} characters, ads ${adBrief.length}.`);
