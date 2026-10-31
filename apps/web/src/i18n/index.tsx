import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LangContext, useLang, type Lang } from './lang';

export type { Lang };

/**
 * The language of a page a homeowner or client reads (the estimate link,
 * a change order, Terms). `?lang=es` on the link wins, then what they
 * chose last time on this device, then their browser. The contractor's own
 * app is English.
 */

const STORAGE_KEY = 'tolliver.lang';

/** What this device chose last time, if anything. */
function stored(): Lang | undefined {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // Private mode or blocked storage: nothing remembered.
  }
  return undefined;
}

const fromBrowser = (): Lang => (typeof navigator !== 'undefined' && /^es\b/i.test(navigator.language ?? '') ? 'es' : 'en');

export const LangProvider: React.FC<{ children: React.ReactNode; onChange?: (lang: Lang) => void }> = ({ children, onChange }) => {
  const [params, setParams] = useSearchParams();
  const fromLink = params.get('lang');
  // The link or this device's choice beats the language on the record.
  const [explicit] = useState(() => fromLink === 'es' || fromLink === 'en' || stored() !== undefined);
  const [lang, setLangState] = useState<Lang>(() => (fromLink === 'es' || fromLink === 'en' ? fromLink : (stored() ?? fromBrowser())));

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
      /** The language on the person's record, used when nothing more specific was chosen. */
      adopt: (next: Lang) => {
        if (!explicit) setLangState(next);
      },
    }),
    [lang, explicit, params, setParams, onChange],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

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
