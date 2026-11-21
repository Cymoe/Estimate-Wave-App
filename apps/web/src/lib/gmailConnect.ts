import { emailAPI } from './api';

/** What Google's return (?gmail=…) means, in words. */
export const GMAIL_RESULT: Record<string, { text: string; good: boolean }> = {
  connected: { text: 'Gmail connected. Emails from Outreach go out from it.', good: true },
  denied: { text: 'Gmail wasn’t connected: the permission was turned down.', good: false },
  no_send: { text: 'Gmail wasn’t connected: "Send email on your behalf" was left unchecked. Connect again and leave it checked.', good: false },
  failed: { text: 'Gmail couldn’t be connected. Try again in a minute.', good: false },
};

/** Sends to Google's consent screen, then back to `returnTo` with ?gmail=…. */
export async function connectGmail(organizationId: string, returnTo: string) {
  const url = await emailAPI.connect(organizationId, returnTo);
  window.location.assign(url);
}
