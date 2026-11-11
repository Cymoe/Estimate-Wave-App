import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { EmailCampaign, MailboxInfo } from '../../../lib/api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mailbox: MailboxInfo;
let campaign: EmailCampaign | null = null;
let pushCampaign: ((c: EmailCampaign) => void) | null = null;
const api = {
  check: jest.fn(async () => ({ count: 2, sample: 0, skipped: ['1 has no email yet: find phones & emails first'] })),
  start: jest.fn(async () => ({ campaignId: 'c1', count: 2, skipped: [], more: 0 })),
  edit: jest.fn(async () => null),
  removeOwner: jest.fn(async () => null),
  discard: jest.fn(async () => null),
  approve: jest.fn(async () => ({ count: 2, first: Date.parse('2026-11-10T20:10:00Z'), last: Date.parse('2026-11-10T20:14:00Z') })),
  connect: jest.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth?x=1'),
  disconnect: jest.fn(async () => null),
  setDailyCap: jest.fn(async () => null),
};
jest.mock('../../../lib/api', () => ({
  emailAPI: {
    check: (...a: unknown[]) => api.check(...(a as [])),
    start: (...a: unknown[]) => api.start(...(a as [])),
    edit: (...a: unknown[]) => api.edit(...(a as [])),
    removeOwner: (...a: unknown[]) => api.removeOwner(...(a as [])),
    discard: (...a: unknown[]) => api.discard(...(a as [])),
    approve: (...a: unknown[]) => api.approve(...(a as [])),
    connect: (...a: unknown[]) => api.connect(...(a as [])),
    disconnect: (...a: unknown[]) => api.disconnect(...(a as [])),
    setDailyCap: (...a: unknown[]) => api.setDailyCap(...(a as [])),
    watchMailbox: (_o: string, cb: (m: MailboxInfo) => void) => {
      cb(mailbox);
      return () => {};
    },
    watchCampaign: (_o: string, _c: string, cb: (c: EmailCampaign) => void) => {
      pushCampaign = cb;
      if (campaign) cb(campaign);
      return () => {};
    },
  },
}));

import { EmailSheet } from '../EmailSheet';
import { EmailSetting } from '../../settings/EmailSetting';

const draft = (id: string, step: number, over: Record<string, unknown> = {}) => ({ id, step, subject: step ? 'Re: About 12 Midkiff Rd' : 'About 12 Midkiff Rd', body: `Body ${id}`, status: 'draft' as const, writing: false, ...over });
const owners = (writing = false): EmailCampaign['owners'] => [
  { contactId: 'r1', name: 'Robert Vance', company: 'Oak Plaza LLC', property: '12 Midkiff Rd', to: 'a@oakplaza.com', sample: false, replied: false, emails: [draft('e1', 0, { writing }), draft('e2', 1), draft('e3', 2)] },
  { contactId: 'r2', name: 'Dana Reyes', property: '9 Wall St', to: 'dana@x.com', sample: false, replied: false, emails: [draft('e4', 0)] },
];
const connected: MailboxInfo = { connected: { email: 'jo@gmail.com', dailyCap: 30, connectedAt: '2026-11-10T00:00:00Z' }, lost: null, setupMissing: [], postal: '1 Main St, Midland, TX', replies: true, today: 0 };

let root: Root;
let host: HTMLDivElement;
const flush = () => act(async () => {});
async function show(node: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(node));
  await flush();
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  campaign = null;
  jest.clearAllMocks();
});

describe('emailing owners', () => {
  it('says who was left out and why, a tap away under each reason', async () => {
    mailbox = connected;
    api.check.mockResolvedValueOnce({
      count: 1,
      sample: 0,
      skipped: ['1 has no email yet: find phones & emails first', '2 have only an address that failed the check or belongs to someone else'],
      left: [
        { why: '1 has no email yet: find phones & emails first', count: 1, owners: [{ id: 'r2', name: 'City Of Midland' }] },
        {
          why: '2 have only an address that failed the check or belongs to someone else',
          count: 3,
          owners: [
            { id: 'r3', name: 'Garcia Maria', note: 'maria@x.com: belongs to someone else' },
            { id: 'r4', name: 'Oak Plaza LLC', note: 'info@oak.com: failed the check' },
          ],
        },
      ],
    } as never);
    await show(<EmailSheet open organizationId="o1" contactIds={['r1', 'r2', 'r3', 'r4']} returnTo="/outreach/l1?email=1" onClose={jest.fn()} onScheduled={jest.fn()} />);
    const groups = Array.from(document.body.querySelectorAll('[data-testid="left-out-group"]'));
    expect(groups.map((g) => g.firstElementChild!.firstElementChild!.textContent)).toEqual(['1 has no email yet: find phones & emails first', '2 have only an address that failed the check or belongs to someone else']);
    // Folded until asked.
    expect(document.body.querySelector('[data-testid="left-out-owners"]')).toBeNull();
    const show2 = groups[1].querySelector('button')!;
    expect(show2.getAttribute('aria-expanded')).toBe('false');
    await act(async () => show2.click());
    const names = groups[1].querySelector('[data-testid="left-out-owners"]')!;
    expect(Array.from(names.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Garcia Mariamaria@x.com: belongs to someone else', 'Oak Plaza LLCinfo@oak.com: failed the check', 'and 1 more']);
    expect(show2.textContent).toBe('Hide');
  });

  it('counts who can be emailed, writes drafts, shows them as they land, edits, and approves with the schedule said first', async () => {
    mailbox = connected;
    const scheduled = jest.fn();
    const close = jest.fn();
    await show(<EmailSheet open organizationId="o1" contactIds={['r1', 'r2', 'r3']} returnTo="/outreach/l1?email=1" onClose={close} onScheduled={scheduled} />);
    const sheet = document.body.querySelector('[data-testid="email-sheet"]')!;
    expect(sheet.textContent).toContain('2 owners can be emailed');
    expect(sheet.textContent).toContain('1 has no email yet: find phones & emails first');
    expect(api.check).toHaveBeenCalledWith('o1', ['r1', 'r2', 'r3']);
    // Follow-ups on by default; turned off, they're not written.
    const followUps = sheet.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(followUps.checked).toBe(true);
    await act(async () => followUps.click());
    await act(async () => button('Write 2 drafts').click());
    expect(api.start).toHaveBeenCalledWith('o1', ['r1', 'r2', 'r3'], false);
    // The first draft is still being written: a placeholder, and Approve waits.
    await act(async () => pushCampaign!({ id: 'c1', status: 'drafting', followUps: [3, 7], owners: owners(true), writing: 1, mailbox: { email: 'jo@gmail.com', dailyCap: 30 }, postal: '1 Main St, Midland, TX', footer: 'Webb Roofing · 1 Main St, Midland, TX', schedule: null }));
    expect(sheet.textContent).toContain('Writing 1 of 2');
    expect((sheet.querySelector('[data-testid="approve-emails"]') as HTMLButtonElement).disabled).toBe(true);
    // Landed: each owner's email, editable, the footer as it will read, and the follow-ups folded.
    await act(async () =>
      pushCampaign!({ id: 'c1', status: 'review', followUps: [3, 7], owners: owners(), writing: 0, mailbox: { email: 'jo@gmail.com', dailyCap: 30 }, postal: '1 Main St, Midland, TX', footer: 'Webb Roofing · 1 Main St, Midland, TX', schedule: { first: Date.parse('2026-11-10T20:10:00Z'), last: Date.parse('2026-11-10T20:14:00Z'), days: 1 } }),
    );
    const cards = sheet.querySelectorAll('[data-testid="email-draft"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Robert Vance · Oak Plaza LLC');
    expect(cards[0].textContent).toContain('a@oakplaza.com · 12 Midkiff Rd');
    expect(cards[0].textContent).toContain('Webb Roofing · 1 Main St, Midland, TX · Unsubscribe');
    expect(cards[0].textContent).toContain('2 follow-ups');
    const subject = cards[0].querySelector('input[aria-label="Subject"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(subject, 'The roof at 12 Midkiff');
      subject.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => subject.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(api.edit).toHaveBeenCalledWith('o1', 'e1', { subject: 'The roof at 12 Midkiff' });
    // Taking an owner out.
    await act(async () => (cards[1].querySelector('button[aria-label="Take Dana Reyes out"]') as HTMLButtonElement).click());
    expect(api.removeOwner).toHaveBeenCalledWith('o1', 'c1', 'r2');
    // The schedule, then Approve.
    expect(sheet.querySelector('[data-testid="email-schedule"]')!.textContent).toBe('Sends up to 30 a day from jo@gmail.com, weekdays 8 to 5 Central. First Tue 2:10 PM, last Tue 2:14 PM.');
    await act(async () => button('Approve and send 2').click());
    expect(api.approve).toHaveBeenCalledWith('o1', 'c1');
    expect(scheduled).toHaveBeenCalledWith('2 emails are scheduled from jo@gmail.com: the first goes Tue 2:10 PM, the last Tue 2:14 PM.');
    expect(close).toHaveBeenCalled();
  });

  it('without Gmail: Connect comes first, and Approve says what is missing', async () => {
    mailbox = { ...connected, connected: null };
    const assign = jest.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    await show(<EmailSheet open organizationId="o1" contactIds={['r1']} returnTo="/outreach?email=1" onClose={() => {}} onScheduled={() => {}} />);
    expect(document.body.querySelector('[data-testid="email-connect"]')!.textContent).toContain('it never reads your inbox');
    await act(async () => button('Connect Gmail').click());
    expect(api.connect).toHaveBeenCalledWith('o1', '/outreach?email=1');
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('closing before approving throws the drafts away, after asking', async () => {
    mailbox = connected;
    campaign = null;
    const close = jest.fn();
    await show(<EmailSheet open organizationId="o1" contactIds={['r1', 'r2']} returnTo="/outreach?email=1" onClose={close} onScheduled={() => {}} />);
    await act(async () => button('Write 2 drafts').click());
    await act(async () => pushCampaign!({ id: 'c1', status: 'review', followUps: [3, 7], owners: owners(), writing: 0, mailbox: { email: 'jo@gmail.com', dailyCap: 30 }, postal: 'x', footer: 'f', schedule: null }));
    await act(async () => (document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    await new Promise((r) => setTimeout(r, 200));
    await flush();
    expect(document.body.textContent).toContain('Throw away these drafts?');
    await act(async () => button('Throw away').click());
    await flush();
    expect(api.discard).toHaveBeenCalledWith('o1', 'c1');
    expect(close).toHaveBeenCalled();
  });
});

describe('the Email settings', () => {
  it('connected: the address, the daily limit saved, Disconnect; the footer address shown', async () => {
    mailbox = connected;
    await show(<EmailSetting organizationId="o1" result="connected" />);
    const box = document.body.querySelector('[data-testid="email-setting"]')!;
    expect(box.textContent).toContain('Gmail connected. Emails from Outreach go out from it.');
    expect(box.textContent).toContain('Connected as jo@gmail.com');
    expect(box.textContent).toContain('replies come back to Outreach and go to Leads');
    expect(box.textContent).toContain('1 Main St, Midland, TX');
    const cap = box.querySelector('input[aria-label="Emails a day"]') as HTMLInputElement;
    expect(cap.value).toBe('30');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cap, '20');
      cap.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Save').click());
    expect(api.setDailyCap).toHaveBeenCalledWith('o1', 20);
    await act(async () => button('Disconnect').click());
    expect(api.disconnect).toHaveBeenCalledWith('o1');
  });

  it('not connected: Connect Gmail, the street address asked for, and what the server still needs', async () => {
    mailbox = { ...connected, connected: null, postal: null, setupMissing: ['MAILBOX_KEY'] };
    await show(<EmailSetting organizationId="o1" result="no_send" />);
    const box = document.body.querySelector('[data-testid="email-setting"]')!;
    expect(box.textContent).toContain('"Send email on your behalf" was left unchecked');
    expect((box.querySelector('[data-testid="connect-gmail"]') as HTMLButtonElement).disabled).toBe(true);
    expect(box.textContent).toContain("Email isn't switched on for Webb Leads yet (missing MAILBOX_KEY).");
    expect(box.textContent).toContain("Add your company's street address under General before sending");
  });
});
