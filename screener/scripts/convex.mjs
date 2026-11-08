// Runs the Convex CLI for the screener only. A CONVEX_DEPLOY_KEY already in
// the shell may belong to another project (Estimate Wave sets one), and
// `convex deploy` would push the screener over it. So it's dropped here;
// set SCREENER_DEPLOY_KEY to deploy the screener with a key.
import { spawnSync } from "node:child_process";

const env = { ...process.env };
delete env.CONVEX_DEPLOY_KEY;
if (process.env.SCREENER_DEPLOY_KEY) env.CONVEX_DEPLOY_KEY = process.env.SCREENER_DEPLOY_KEY;
const r = spawnSync("npx", ["convex", ...process.argv.slice(2)], { stdio: "inherit", env });
process.exit(r.status ?? 1);
