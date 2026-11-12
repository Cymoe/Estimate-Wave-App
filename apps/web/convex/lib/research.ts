// The research column: Claude reads the web about one property owner and
// answers a question in a few sentences, with where it read it. Nothing
// here touches the database or the wallet; the Node action runs it and
// outreach.ts charges an answer.
import { callClaude, type Block } from "./claude";
import type { TraceInput } from "./skipTrace";

export type Research = { answer: string; sources: Array<{ title: string; url: string }>; found: boolean };

/** What the answer starts with when the web had nothing specific; the cell is then free. */
export const NOTHING = "NOTHING FOUND";

const SYSTEM = `You research property owners in Midland, Texas for a contractor who wants to reach them about work on their buildings. You are given one owner from the county appraisal roll (a person or a company, sometimes the person behind the company), their mailing address and the property they own, and a question. Search the web and answer the question in two to four plain sentences a contractor can read in a glance: what the owner is, what they do, and anything that bears on the question. Prefer specific, recent facts (a business at the address, a permit, a news item, a listing, a sale) over generalities. Name the owner's business if there is one.
If the web has nothing specific about this owner or property, answer with exactly "${NOTHING}" followed by one short sentence on what you checked. Never guess at a phone number or email, never describe a different person with the same name, and never repeat the roll's own facts as if they were findings.`;

const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);

/** The owner and property as the question's subject. */
export function subject(input: TraceInput): string {
  // A realtor: the person is the row, from their license, and the company is the brokerage they work with.
  if (input.person?.source === "trec") {
    return [`Licensed real estate ${/broker/i.test(input.person.title ?? "") ? "broker" : "agent"} in ${input.mailing.city ?? "Midland"}, ${input.mailing.state ?? "TX"}: ${input.person.name}${input.person.title ? ` (${input.person.title})` : ""}`, input.company ? `Brokerage: ${input.company}` : ""].filter(Boolean).join("\n");
  }
  const lines = [
    input.company ? `Company owner on the roll: ${input.company}` : `Owner on the roll: ${input.name}`,
    input.person ? `Person behind the company (state records): ${input.person.name}${input.person.title ? `, ${input.person.title}` : ""}${input.person.address ? `, ${input.person.address}` : ""}` : "",
    input.property ? `Property: ${input.property.address}, ${input.property.city}, ${input.property.state}${input.property.zip ? ` ${input.property.zip}` : ""}` : "",
    input.mailing.address ? `Mailing address: ${[input.mailing.address, input.mailing.city, input.mailing.state, input.mailing.zip?.slice(0, 5)].filter(Boolean).join(", ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Asks Claude, with web search, one question about one owner. */
export async function researchOwner(input: TraceInput, question: string, ask: typeof callClaude = callClaude): Promise<Research> {
  const { content } = await ask({
    max_tokens: 2048,
    output_config: { effort: "low" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: `${subject(input)}\n\nQuestion: ${question}` }],
  });
  return readResearch(content);
}

/** The answer's text and every page it cited, from the response's blocks. */
export function readResearch(content: Block[]): Research {
  const parts: string[] = [];
  const sources = new Map<string, { title: string; url: string }>();
  for (const block of content) {
    if (block.type !== "text") continue;
    const text = str(block.text);
    if (text) parts.push(text);
    for (const c of Array.isArray(block.citations) ? (block.citations as Array<Record<string, unknown>>) : []) {
      const url = str(c.url);
      if (url && !sources.has(url)) sources.set(url, { title: str(c.title) ?? url.replace(/^https?:\/\//, "").slice(0, 60), url });
    }
  }
  const answer = parts.join(" ").replace(/\s+/g, " ").trim();
  return { answer, sources: [...sources.values()], found: answer.length > 0 && !answer.toUpperCase().startsWith(NOTHING) };
}
