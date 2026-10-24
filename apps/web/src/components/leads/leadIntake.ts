/**
 * Lead notes that came off an intake form look like
 *   "What are you looking to get done to your home? Irrigation
 *    When do you want to get started? This month"
 * The questions are noise on a card; the answers are the lead. This pulls
 * the answers out, along with "Sub:" lines and the day-stamped notes added
 * from the card.
 */
export function intakeAnswers(notes?: string): string[] {
  if (!notes) return [];
  const answers: string[] = [];
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const qa = /^.*?\?\s*(.+)$/.exec(line);
    const stamped = /^[A-Z][a-z]{2} \d{1,2}:\s*(.+)$/.exec(line);
    if (qa) answers.push(qa[1].trim());
    else if (stamped) answers.push(stamped[1].trim());
    else if (/^Sub:\s*/i.test(line)) answers.push(line.replace(/^Sub:\s*/i, ''));
  }
  return answers;
}

/** One line for the card: the intake answers, else the first line of the notes. */
export function leadSummary(notes?: string): string | undefined {
  const answers = intakeAnswers(notes);
  if (answers.length) return answers.join(' · ');
  const first = notes?.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return first || undefined;
}

const MINUTE = 60_000;
/** "just now", "35m ago", "3h ago", "2d ago". */
export function ago(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  if (ms < MINUTE) return 'just now';
  if (ms < 60 * MINUTE) return `${Math.floor(ms / MINUTE)}m ago`;
  if (ms < 24 * 60 * MINUTE) return `${Math.floor(ms / (60 * MINUTE))}h ago`;
  return `${Math.floor(ms / (24 * 60 * MINUTE))}d ago`;
}
