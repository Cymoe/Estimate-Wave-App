// Bundles screener-brief.md into convex/lib/brief.ts. Convex functions can't
// read files at runtime, so the brief ships inside the code; the .md file
// stays the one place to edit it. Runs before dev, deploy, test and typecheck.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "screener-brief.md");
if (!existsSync(source)) {
  console.error("screener-brief.md is missing: put the brief at screener/screener-brief.md");
  process.exit(1);
}
const brief = readFileSync(source, "utf8");
writeFileSync(
  join(root, "convex/lib/brief.ts"),
  `// Generated from screener-brief.md by \`npm run brief\`. Edit the .md file, not this one.\nexport const BRIEF = ${JSON.stringify(brief)};\n`,
);
console.log(`Brief bundled (${brief.length} characters).`);
