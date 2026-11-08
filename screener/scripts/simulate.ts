// Plays an applicant against the screener on your Convex dev deployment, end
// to end, with no real texts: real Claude, real brief, real tools; Twilio and
// Cal.com stubbed. Use it to test the brief.
//
// The dev deployment needs SMS_MODE=simulate and CAL_MODE=stub set (README).
//
//   npm run simulate -- --script happy        a strong rep who books
//   npm run simulate -- --script c            no experience, out of town
//   npm run simulate -- --script stop         asks one thing, then STOP
//   npm run simulate -- --script flag         wants a person
//   npm run simulate -- --interactive         you type the rep's side
//
// Options: --client <id> (else a test client is made), --name, --phone, --ad.
// Reads SCREENER_SITE_URL (https://<deployment>.convex.site) and APPLY_SECRET
// from the environment or screener/.env.local.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPTS: Record<string, string[]> = {
  happy: [
    "Yeah I'm interested!",
    "About 3 years selling solar door to door. I close around 8 deals a month.",
    "Yes, I live in Midland.",
    "I could start next Monday.",
    "Commission is fine with me, I'd like to clear 6k a month.",
    "The first time you have works for me.",
    "dana.reyes@example.com",
  ],
  c: ["Sure", "I've never done sales, I work at a restaurant right now", "I live in Dallas, can't move", "Ok thanks"],
  stop: ["What's the pay like?", "STOP", "hello?"],
  flag: ["Is this legit? I heard this company doesn't pay its reps.", "I want to talk to a real person please."],
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fromEnvFile(key: string): string | undefined {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}
const setting = (key: string) => process.env[key] ?? fromEnvFile(key);

const site = setting("SCREENER_SITE_URL") ?? setting("CONVEX_SITE_URL") ?? setting("CONVEX_URL")?.replace(".convex.cloud", ".convex.site");
const secret = setting("APPLY_SECRET");
if (!site || !secret) {
  console.error("Set SCREENER_SITE_URL (https://<deployment>.convex.site) and APPLY_SECRET, in your shell or screener/.env.local.");
  process.exit(1);
}

const headers = { "content-type": "application/json", authorization: `Bearer ${secret}` };

type Thread = {
  applicant: { id: string; name: string; status: string; score?: string; answers: Record<string, string>; notes?: string; sourceAdId: string; interviewAt?: string; replying: boolean };
  messages: Array<{ direction: "in" | "out"; body: string; at: string }>;
} | null;

async function thread(phone: string): Promise<Thread> {
  const res = await fetch(`${site}/simulate/thread?phone=${encodeURIComponent(phone)}`, { headers });
  if (res.status === 404) throw new Error("The deployment isn't in simulate mode: set SMS_MODE=simulate on it (README).");
  if (!res.ok) throw new Error(`thread: ${res.status} ${await res.text()}`);
  return (await res.json()) as Thread;
}

/** Waits until the agent has answered: no reply in progress and something new on the thread. */
async function settle(phone: string, seen: number, timeoutMs = 120_000): Promise<NonNullable<Thread>> {
  const until = Date.now() + timeoutMs;
  let stable = 0;
  for (;;) {
    const t = await thread(phone);
    const done = t && !t.applicant.replying && (t.messages.length > seen || ["flagged", "opted_out"].includes(t.applicant.status));
    stable = done ? stable + 1 : 0;
    // Two quiet polls in a row: the turn (and any follow-on turn) is over.
    if (t && stable >= 2) return t;
    if (Date.now() > until) {
      if (t) return t;
      throw new Error("No applicant showed up: did /apply work?");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

let printed = 0;
function print(t: NonNullable<Thread>) {
  for (const m of t.messages.slice(printed)) console.log(m.direction === "out" ? `\n  AGENT › ${m.body}` : `\n  REP   › ${m.body}`);
  printed = t.messages.length;
}

function testClient(): string {
  const client = {
    name: "Simulation Solar",
    role: "Door-to-door solar sales rep",
    city: "Midland, TX",
    compSheet: "Commission only: $500 per install, paid weekly. Average rep closes 6–10 a month. Top reps clear $8k/month. Leads provided.",
    calEventLink: "https://cal.com/simulation/interview",
    calEventTypeId: 1,
    timezone: "America/Chicago",
  };
  // One test client, reused run to run.
  const list = spawnSync("node", [join(root, "scripts/convex.mjs"), "run", "clients:list"], { cwd: root, encoding: "utf8" });
  const existing = (JSON.parse(list.stdout?.trim() || "[]") as Array<{ clientId: string; name: string }>).find((c) => c.name === client.name);
  if (existing) return existing.clientId;
  const r = spawnSync("node", [join(root, "scripts/convex.mjs"), "run", "clients:create", JSON.stringify(client)], { cwd: root, encoding: "utf8" });
  const match = r.stdout?.match(/"clientId":\s*"([^"]+)"/);
  if (!match) throw new Error(`Couldn't make a test client:\n${r.stdout}\n${r.stderr}`);
  return match[1];
}

async function send(phone: string, body: string) {
  const res = await fetch(`${site}/simulate/inbound`, { method: "POST", headers, body: JSON.stringify({ from: phone, body }) });
  if (!res.ok) throw new Error(`inbound: ${res.status} ${await res.text()}`);
}

async function main() {
  const scriptName = arg("script") ?? (flag("interactive") ? undefined : "happy");
  const lines = scriptName ? SCRIPTS[scriptName] : undefined;
  if (scriptName && !lines) throw new Error(`No script "${scriptName}". Try: ${Object.keys(SCRIPTS).join(", ")}`);
  const clientId = arg("client") ?? testClient();
  // A 555-01xx number, so a real phone can never be texted by mistake.
  const phone = arg("phone") ?? `+1432555${String(100 + Math.floor(Math.random() * 99)).padStart(4, "0")}`;
  const name = arg("name") ?? "Dana Reyes";
  const ad = arg("ad") ?? "sim-ad-1";

  console.log(`Applying ${name} (${phone}) to client ${clientId} from ad ${ad}…`);
  const res = await fetch(`${site}/apply`, { method: "POST", headers, body: JSON.stringify({ name, phone, clientId, sourceAdId: ad }) });
  const applied = await res.json();
  if (!res.ok) throw new Error(`apply: ${res.status} ${JSON.stringify(applied)}`);

  let t = await settle(phone, 0);
  print(t);

  if (lines) {
    for (const line of lines) {
      if (["flagged", "opted_out"].includes(t.applicant.status) && line !== "STOP") console.log("\n  (the agent has stopped texting this rep)");
      console.log(`\n  REP   › ${line}`);
      const before = t.messages.length + 1;
      await send(phone, line);
      printed = before;
      t = await settle(phone, before, ["flagged", "opted_out"].includes(t.applicant.status) ? 4000 : 120_000);
      print(t);
    }
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log("\nType the rep's texts. An empty line ends it.");
    for (;;) {
      const line = (await rl.question("\n  REP   › ")).trim();
      if (!line) break;
      const before = t.messages.length + 1;
      await send(phone, line);
      printed = before;
      t = await settle(phone, before);
      print(t);
    }
    rl.close();
  }

  const a = t.applicant;
  console.log("\n────────────────────────────────────────");
  console.log(`Status:    ${a.status}`);
  console.log(`Score:     ${a.score ?? "-"}`);
  console.log(`Ad:        ${a.sourceAdId}`);
  if (a.interviewAt) console.log(`Interview: ${a.interviewAt}`);
  console.log(`Answers:   ${JSON.stringify(a.answers, null, 2).replace(/\n/g, "\n           ")}`);
  if (a.notes) console.log(`Notes:     ${a.notes.replace(/\n/g, "\n           ")}`);
  if (a.status === "flagged") console.log("Myles was texted a summary (in simulate mode it's in the deployment's logs, not sent).");
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
