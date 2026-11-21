import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LegalLinks } from './Legal';
import { PortalView } from '../components/portal/PortalView';
import { portalAPI, type PortalView as View } from '../lib/api';
import { LightPage } from '../components/common/LightPage';
import { LangProvider, LangToggle } from '../i18n';
import { useLang } from '../i18n/lang';
import { PORTAL } from '../i18n/portal';

/**
 * The client portal: one private link with everything for a client's work
 * with the company. What needs them comes first (only what the company sent
 * or asked for), then each job's signed documents.
 */
function PortalContent() {
  const { token = '' } = useParams();
  const { lang, adopt } = useLang();
  const t = PORTAL[lang];
  const [view, setView] = useState<View | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const next = await portalAPI.get(token);
      setView(next);
      if (next?.client.language) adopt(next.client.language);
    } catch {
      setView(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  if (view === undefined) return <LightPage className="bg-[#F5F6F8] flex items-center justify-center text-gray-500">{t.loading}</LightPage>;
  if (view === null)
    return (
      <LightPage className="bg-[#F5F6F8] flex flex-col items-center justify-center gap-6 px-6 text-center text-gray-700">
        <p>{t.invalid}</p>
        <LangToggle className="text-xs text-gray-400" />
      </LightPage>
    );

  return (
    <LightPage className="bg-[#F5F6F8] text-gray-900">
      <div className="mx-auto max-w-xl px-4 pb-8 pt-8 sm:pt-12">
        <PortalView view={view} lang={lang} token={token} onPicked={load} />
        <footer className="mt-8 flex flex-col items-center gap-3 pb-4">
          <LangToggle className="text-xs text-gray-400" />
          <LegalLinks className="text-xs text-gray-400" />
        </footer>
      </div>
    </LightPage>
  );
}

/** The portal in the client's language; flipping it is remembered on their record. */
export function PortalPage() {
  const { token = '' } = useParams();
  return (
    <LangProvider onChange={(lang) => token && portalAPI.setLanguage(token, lang).catch(() => {})}>
      <PortalContent />
    </LangProvider>
  );
}
