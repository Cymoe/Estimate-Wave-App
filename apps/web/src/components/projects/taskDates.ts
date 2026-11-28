// Days for tasks and the schedule: yyyy-mm-dd strings, read as local dates.

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (day: string, n: number) => {
  const d = fromIso(day);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
/** The Monday of the week a day is in. */
export const mondayOf = (day: string) => {
  const d = fromIso(day);
  return addDays(day, -((d.getDay() + 6) % 7));
};

type Lang = 'en' | 'es';

/** "Nov 3" (or "3 nov") for a yyyy-mm-dd day, read as a local date. */
export const shortDay = (day: string, lang: Lang = 'en') => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' });
};

/** "Nov 3", "Nov 3 – Nov 5", or nothing for an undated task. */
export const taskDays = (task: { startDate?: string; endDate?: string }, lang: Lang = 'en') =>
  task.startDate ? (task.endDate ? `${shortDay(task.startDate, lang)} – ${shortDay(task.endDate, lang)}` : shortDay(task.startDate, lang)) : '';

/** A text to one crew member about a task, opened in Messages, in their language. */
export const textLink = (phone: string, task: { title: string; startDate?: string; endDate?: string }, place: string, lang: Lang = 'en') => {
  const when = taskDays(task, lang);
  const at = lang === 'es' ? ' en ' : ' at ';
  const body = `${task.title}${place ? `${at}${place}` : ''}${when ? `, ${when}` : ''}.`;
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;
};
