
/** Words and small helpers shared by the Recruiting tabs. */

export const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');

export const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  texted: 'Texted',
  screening: 'Screening',
  qualified: 'Qualified',
  booked: 'Booked',
  interviewed: 'Showed',
  no_show: 'No-show',
  ghosted: 'Ghosted',
  rejected: 'Not a fit',
  opted_out: 'Opted out',
  flagged: 'Needs a person',
};

export const KIND_LABEL: Record<string, string> = { hook: 'Hooks', meta_primary: 'Meta primary texts', video_script: 'Video scripts', indeed: 'Indeed postings' };

export const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The apply page an ad links to; the ad's source id rides along so applicants trace back to it. */
export const applyLink = (slug: string, sourceAdId?: string) => `${window.location.origin}/jobs/${slug}${sourceAdId ? `?ad=${encodeURIComponent(sourceAdId)}` : ''}`;
/** A client's private page for marking who they hired (also in their weekly report). */
export const hiresLink = (token: string) => `${window.location.origin}/hires/${token}`;
/** "$1,250" from cents. */
export const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
