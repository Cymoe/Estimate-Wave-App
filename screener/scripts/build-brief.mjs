// Bundles the briefs into the code: screener-brief.md → convex/lib/brief.ts
// (BRIEF, Jordan's system prompt) and ad-brief.md → convex/lib/adBrief.ts
// (AD_BRIEF, the ad agent's). Convex functions can't read files at runtime,
// so the briefs ship inside the code; the .md files stay the one place to
// edit them. Runs before dev, deploy, test and typecheck.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const [file, out, name] of [
  ["screener-brief.md", "convex/lib/brief.ts", "BRIEF"],
  ["ad-brief.md", "convex/lib/adBrief.ts", "AD_BRIEF"],
]) {
  const source = join(root, file);
  if (!existsSync(source)) {
    console.error(`${file} is missing: put it at screener/${file}`);
    process.exit(1);
  }
  const text = readFileSync(source, "utf8");
  writeFileSync(join(root, out), `// Generated from ${file} by \`npm run brief\`. Edit the .md file, not this one.\nexport const ${name} = ${JSON.stringify(text)};\n`);
  console.log(`${file} bundled (${text.length} characters).`);
}
