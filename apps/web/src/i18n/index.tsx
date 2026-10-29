import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Lang } from '../../convex/lib/i18n';

export type { Lang };

/**
 * The language of a page a homeowner or client reads (the estimate link,
 * a change order, Terms). `?lang=es` on the link wins, then what they
 * chose last time on this device, then their browser. The contractor's own
 * app is English.
 */

const STORAGE_KEY = 'tolliver.lang';

function fromBrowser(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // Private mode or blocked storage: fall through to the browser language.
  }
  return typeof navigator !== 'undefined' && /^es\b/i.test(navigator.language ?? '') ? 'es' : 'en';
}

const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({ lang: 'en', setLang: () => undefined });

export const LangProvider: React.FC<{ children: React.ReactNode; onChange?: (lang: Lang) => void }> = ({ children, onChange }) => {
  const [params, setParams] = useSearchParams();
  const fromLink = params.get('lang');
  const [lang, setLangState] = useState<Lang>(() => (fromLink === 'es' || fromLink === 'en' ? fromLink : fromBrowser()));

  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = 'en';
    };
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang: (next: Lang) => {
        if (next === lang) return;
        setLangState(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Nothing to do: the page still switches.
        }
        const nextParams = new URLSearchParams(params);
        if (next === 'es') nextParams.set('lang', 'es');
        else nextParams.delete('lang');
        setParams(nextParams, { replace: true });
        onChange?.(next);
      },
    }),
    [lang, params, setParams, onChange],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);

/** "English · Español", for the foot of a public page. */
export const LangToggle: React.FC<{ className?: string }> = ({ className = 'text-xs text-gray-500' }) => {
  const { lang, setLang } = useLang();
  const link = (value: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(value)}
      aria-pressed={lang === value}
      lang={value}
      className={lang === value ? 'font-medium text-gray-800' : 'underline underline-offset-2 hover:text-gray-700'}
    >
      {label}
    </button>
  );
  return (
    <p className={`${className} text-center`} aria-label="Language">
      {link('en', 'English')}
      {' · '}
      {link('es', 'Español')}
    </p>
  );
};

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
  return new Date(iso).toLocaleString(LOCALE[lang], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The two choices, for a Language select on a client, lead or crew member. */
export const LANGUAGE_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];
