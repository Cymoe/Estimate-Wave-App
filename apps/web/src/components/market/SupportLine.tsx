import { CREDIT_WINDOW_DAYS, SUPPORT_EMAIL, SUPPORT_PHONE } from '../../../convex/lib/support';

/** Where a bad lead gets reported: "Wrong number or not a real job? Tell Webb Leads within 3 days: …" with call and email links. */
export function SupportLine({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-gray-400 ${className}`} data-testid="support-line">
      Wrong number or not a real job? Tell Webb Leads within {CREDIT_WINDOW_DAYS} days:{' '}
      {SUPPORT_PHONE && (
        <>
          <a href={`tel:${SUPPORT_PHONE.replace(/[^\d+]/g, '')}`} className="text-[#9cc3ea] underline underline-offset-2">
            {SUPPORT_PHONE}
          </a>
          {' · '}
        </>
      )}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#9cc3ea] underline underline-offset-2">
        {SUPPORT_EMAIL}
      </a>
    </p>
  );
}
