// The ad brief's rules, checked in code on every piece before a person sees
// it. A warning doesn't block anything (a person approves every ad); it says
// what to look at.

export type Kind = "hook" | "meta_primary" | "video_script" | "indeed";

/** "$8k", "$8,000", "8000", "150k+", "10%" → numbers as written in dollars or percent. */
export function amounts(text: string): number[] {
  const out: number[] = [];
  const re = /(\$)?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k\b|K\b|%)?/g;
  for (const m of text.matchAll(re)) {
    const [, dollar, digits, suffix] = m;
    // Plain small numbers ("2 summers", "15 seconds", "3 reps") aren't pay.
    if (!dollar && !suffix && Number(digits.replace(/,/g, "")) < 1000) continue;
    let n = Number(digits.replace(/,/g, ""));
    if (suffix?.toLowerCase() === "k") n *= 1000;
    out.push(suffix === "%" ? -n : n); // percentages kept apart from dollars
  }
  return out;
}

const PROTECTED =
  /\b(young|youthful|recent (college )?grads?|college (kids|students)|guys|gals|ladies|gentlemen|men|women|moms?|dads?|mothers?|fathers?|girls|boys|millennials?|gen ?z|boomers?|(under|over) \d\d|years? old|married|single|christians?|church|religious|healthy|able[- ]bodied|native (english )?speakers?|pregnan\w*|kids|children)\b/i;
const GET_RICH = /\b(get rich|rich quick|overnight|guaranteed (income|pay|money|earnings)|easy money|quick cash|passive income|no work|millionaire)\b/i;

/** What a person should look at before approving this piece. */
export function checkPiece(kind: Kind, text: string, allowed: { inputs: string }): string[] {
  const warnings: string[] = [];
  const known = new Set(amounts(allowed.inputs));
  const unknown = [...new Set(amounts(text))].filter((n) => !known.has(n));
  if (unknown.length) warnings.push(`Pay number not in the comp sheet or rep stories: ${unknown.map((n) => (n < 0 ? `${-n}%` : `$${n.toLocaleString("en-US")}`)).join(", ")}`);
  const trait = text.match(PROTECTED);
  if (trait) warnings.push(`Mentions a protected trait ("${trait[0]}"): Meta's Employment category doesn't allow it`);
  const rich = text.match(GET_RICH);
  if (rich) warnings.push(`Sounds like a get-rich-quick promise ("${rich[0]}")`);
  if (kind !== "hook" && !(/\bvar(y|ies)\b/i.test(text) && /\bcommission/i.test(text))) warnings.push(`Doesn't say earnings vary and are commission-based`);
  if (kind === "video_script") {
    // About 2.5 spoken words a second; directions in [brackets] or (parens) aren't spoken.
    const words = text.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").split(/\s+/).filter(Boolean).length;
    if (words > 85) warnings.push(`Likely over 30 seconds (${words} words)`);
  }
  return warnings;
}
