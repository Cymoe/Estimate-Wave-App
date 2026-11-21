import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Lang } from '../../../convex/lib/i18n';
import { PORTAL } from '../../i18n/portal';

/** Back to the client's portal from a page they were sent, when the company has made them one. */
export const PortalBackLink: React.FC<{ token?: string; company?: string; lang: Lang }> = ({ token, company, lang }) => {
  if (!token) return null;
  const t = PORTAL[lang];
  return (
    <a
      href={`/portal/${token}`}
      className="flex items-center justify-between gap-3 bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 text-sm text-blue-600 hover:bg-gray-50 print:hidden"
      data-testid="portal-link"
    >
      {t.backLink(company || t.theCompany)}
      <ChevronRight className="w-4 h-4" />
    </a>
  );
};
