/** The question a new chat starts with when an alert's "Open it in Claude / ChatGPT" is tapped. */
export const leadQuestion = (leadId: string) => `Use FieldQuote to show me my lead ${leadId}, then help me call the homeowner.`;

/** A new Claude or ChatGPT chat with the question typed in; null for any other app. */
export function assistantChatUrl(app: string | undefined, leadId: string): string | null {
  const q = encodeURIComponent(leadQuestion(leadId));
  if (app === 'claude') return `https://claude.ai/new?q=${q}`;
  if (app === 'chatgpt') return `https://chatgpt.com/?q=${q}`;
  return null;
}
