import { ago, intakeAnswers, leadSummary } from '../leadIntake';

describe('lead intake notes', () => {
  it('pulls the answers out of question-and-answer notes', () => {
    const notes = 'What are you looking to get done to your home? Irrigation\nWhen do you want to get started with the project? This month';
    expect(intakeAnswers(notes)).toEqual(['Irrigation', 'This month']);
    expect(leadSummary(notes)).toBe('Irrigation · This month');
  });

  it('keeps Sub: lines and day-stamped notes, and falls back to the first line', () => {
    expect(intakeAnswers('Sub: Get your render done\nOct 18: called, left VM')).toEqual(['Get your render done', 'called, left VM']);
    expect(intakeAnswers('In and out of the Hospital.')).toEqual([]);
    expect(leadSummary('In and out of the Hospital.\nSecond line')).toBe('In and out of the Hospital.');
    expect(leadSummary('')).toBeUndefined();
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    expect(ago('2026-10-18T11:59:40Z', now)).toBe('just now');
    expect(ago('2026-10-18T11:25:00Z', now)).toBe('35m ago');
    expect(ago('2026-10-18T09:00:00Z', now)).toBe('3h ago');
    expect(ago('2026-10-16T12:00:00Z', now)).toBe('2d ago');
  });
});
