import { createContext, useContext } from 'react';
import type { Lang } from '../../convex/lib/i18n';

export type { Lang };

export const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; adopt: (lang: Lang) => void }>({
  lang: 'en',
  setLang: () => undefined,
  adopt: () => undefined,
});

export const useLang = () => useContext(LangContext);

const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-US' };

/** "Nov 3, 2026" / "3 nov 2026" for a yyyy-mm-dd day, read as a local date. */
export function formatDay(
  iso: string | undefined,
  lang: Lang,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE[lang], options);
}

/** "November 20, 2026" / "20 de noviembre de 2026". */
export const formatLongDate = (iso: string | undefined, lang: Lang) => formatDay(iso, lang, { month: 'long', day: 'numeric', year: 'numeric' });

/** A moment ("Nov 3, 2026, 2:15 PM") in the reader's language. */
export function formatMoment(iso: string | undefined, lang: Lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(LOCALE[lang], { dateStyle: 'long', timeStyle: 'short' });
}

/** The two choices, for a Language select on a client, lead or crew member. */
export const LANGUAGE_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];
