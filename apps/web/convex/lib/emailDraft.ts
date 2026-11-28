// The first email to an owner, and its two short follow-ups, written by
// Claude from what's already known (no web search: drafts are free), for
// the contractor to read and approve. Without ANTHROPIC_API_KEY, or when the
// call fails, a plain template stands in. Nothing here touches the database.

import { callClaude } from "./claude";
import { subject as subjectOf } from "./research";
import type { TraceInput } from "./skipTrace";

export type DraftInput = {
  owner: TraceInput;
  /** Why they're on the list ("Owns 3 Midland properties, $900K on the roll"). */
  why: string;
  /** The newest public records on the property ("Code violation, Roof in disrepair, Oct 2026"). */
  signals: string[];
  /** The research column's answer, when there is one. */
  research?: string;
  /** Who writes: the person, their company, its trades and phone. */
  sender: { name: string; company: string; trades: string[]; phone?: string; city: string };
  /** How many follow-ups to write (0 when the company turned them off). */
  followUps: number;
};
export type Draft = { subject: string; body: string; followUps: string[]; by: "claude" | "template" };

const SYSTEM = `You write a contractor's first email to a property owner they don't know yet, plus short follow-ups. The contractor approves every email before it goes.
Rules:
- Plain, short and specific: 60 to 120 words for the first email, 25 to 60 for each follow-up. No fluff, no hype, no exclamation marks.
- Greet the person by first name when a person is named; otherwise "Hi there".
- Say who is writing and why this owner: the property by street address, and the most relevant public fact you're given (a code violation, a permit, a recent purchase, how many buildings they own). Never invent facts, prices, discounts, deadlines or past work.
- One clear, easy ask: a short call or a free look at the property.
- Sign off with the sender's name, company and phone (when given) on separate lines. No postal address or unsubscribe line: the app adds those.
- The subject is 3 to 7 words, specific to the property, never "Re:" or "Fwd:", no clickbait.
- A follow-up is a brief, polite nudge in the same thread that adds nothing new it can't back up; the last one may say it's the last note.`;

const SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    follow_ups: { type: "array", items: { type: "string" } },
  },
  required: ["subject", "body", "follow_ups"],
  additionalProperties: false,
};

const firstName = (input: TraceInput) => {
  const full = input.person?.name ?? (input.company ? undefined : input.name);
  // The roll writes people surname first ("Vance Robert"); the person found by a lookup is first name first.
  if (input.person?.name) return full?.split(/\s+/)[0];
  const words = full?.split(/\s+/) ?? [];
  return words.length >= 2 ? words[1] : undefined;
};
const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

function prompt(d: DraftInput): string {
  return [
    subjectOf(d.owner),
    `Why they're on the list: ${d.why}`,
    d.signals.length ? `Public records on the property: ${d.signals.join("; ")}` : "",
    d.research ? `What a web search found about them: ${d.research}` : "",
    `Sender: ${d.sender.name}, ${d.sender.company}${d.sender.trades.length ? ` (${d.sender.trades.join(", ")})` : ""}, ${d.sender.city}, Texas${d.sender.phone ? `, phone ${d.sender.phone}` : ""}`,
    `Write the first email and ${d.followUps} follow-up${d.followUps === 1 ? "" : "s"}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The template: used without the assistant, and whenever its answer can't be used. */
export function templateDraft(d: DraftInput): Draft {
  const hi = cap(firstName(d.owner)) ?? "there";
  const where = d.owner.property?.address ? ` at ${d.owner.property.address}` : "";
  const fact = d.signals[0] ? ` I saw the public record on it (${d.signals[0]}).` : "";
  const work = d.sender.trades.length ? `${d.sender.trades.slice(0, 2).join(" and ").toLowerCase()} work` : "work";
  const sign = [d.sender.name, d.sender.company, d.sender.phone].filter(Boolean).join("\n");
  const body = `Hi ${hi},\n\nI'm ${d.sender.name.split(" ")[0]} with ${d.sender.company}. I'm reaching out about your property${where}.${fact} We do ${work} around ${d.sender.city}, and I'd be glad to take a look if anything's on your list this year.\n\nWould a quick call this week work?\n\n${sign}`;
  const nudges = [
    `Hi ${hi},\n\nJust following up on my note about${where ? ` the property${where}` : " your property"}. Happy to take a quick look whenever it suits you.\n\n${d.sender.name.split(" ")[0]}`,
    `Hi ${hi},\n\nI'll leave it here so I'm not filling your inbox. If anything comes up${where ? ` at${where.replace(/^ at/, "")}` : ""}, you can reach me at ${d.sender.phone ?? "this address"}.\n\n${d.sender.name.split(" ")[0]}`,
  ];
  return { subject: d.owner.property?.address ? `About ${d.owner.property.address}` : `About your property`, body, followUps: nudges.slice(0, d.followUps), by: "template" };
}

/** Claude's draft, or the template when there's no key or the answer isn't usable. */
export async function writeDraft(d: DraftInput, ask: typeof callClaude = callClaude, env: Record<string, string | undefined> = process.env): Promise<Draft> {
  if (!env.ANTHROPIC_API_KEY) return templateDraft(d);
  try {
    const { content, stop_reason } = await ask({
      max_tokens: 1500,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt(d) }],
    });
    if (stop_reason === "refusal") return templateDraft(d);
    const text = content.find((b) => b.type === "text")?.text;
    const parsed = typeof text === "string" ? (JSON.parse(text) as { subject?: string; body?: string; follow_ups?: string[] }) : {};
    const subject = parsed.subject?.trim().replace(/^(re|fwd?):\s*/i, "");
    const body = parsed.body?.trim();
    if (!subject || !body) return templateDraft(d);
    const fallback = templateDraft(d).followUps;
    const followUps = Array.from({ length: d.followUps }, (_, i) => parsed.follow_ups?.[i]?.trim() || fallback[i]);
    return { subject: subject.slice(0, 120), body: body.slice(0, 4000), followUps, by: "claude" };
  } catch {
    return templateDraft(d);
  }
}
