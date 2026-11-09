import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const client = {
  id: 'c1',
  name: 'Acme Roofing',
  role: 'Door-to-door roofing sales rep',
  city: 'Midland, TX',
  compSheet: 'Closers: 10% of contract value.',
  calEventLink: 'https://cal.com/acme/interview',
  timezone: 'America/Chicago',
  active: true,
  adsEnabled: true,
  applicants: 3,
  A: 1,
  hired: 1,
  slug: 'acme',
  hiresToken: 'tok123',
  createdAt: '2026-11-01T00:00:00.000Z',
};

// The live queries: each watcher keeps its callback so a test can push the next value, as Convex would.
const watchers: Record<string, (v: unknown) => void> = {};
const watch = (name: string, first: unknown) => (cb: (v: unknown) => void) => {
  watchers[name] = cb;
  cb(first);
  return () => {};
};
let tryIt: unknown = null;
const tryItStart = jest.fn(async () => 'a1');
const tryItSend = jest.fn(async () => ({}));
const decideAd = jest.fn(async () => 'acme-m1');
const saveClient = jest.fn(async () => 'c2');
const markOutcome = jest.fn(async () => null);
const demoLive = jest.fn(async () => 'a1');
const demoSeed = jest.fn(async () => ({}));
const ads = {
  clients: [
    {
      client: { id: 'c1', name: 'Acme Roofing', adsEnabled: true, slug: 'acme' },
      writing: false,
      latest: { createdAt: '2026-11-09T14:00:00.000Z', learningNotes: 'Money proof brings the A’s.', problems: [], variations: 7, fresh: 18 },
      drafts: [
        { id: 'd1', kind: 'meta_primary', angle: 'money proof', body: 'Closers keep 10%. Earnings vary, commission-based.', variationOf: 'acme-m0', warnings: [] },
        { id: 'd2', kind: 'hook', angle: 'money proof', body: 'Make $250k this summer', warnings: ['Pay number not in the comp sheet or rep stories: $250,000'] },
      ],
      retire: [{ sourceAdId: 'acme-m9', reason: '12 applicants, no A’s' }],
      performance: [{ sourceAdId: 'acme-m0', kind: 'meta_primary', angle: 'money proof', status: 'approved', applicants: 6, A: 3, aRate: 0.5, booked: 2, showRate: null, spendCents: 30000, aPer100: 1, hired: 2, costPerHireCents: 15000 }],
    },
  ],
  approved: [],
};

jest.mock('../../lib/api', () => ({
  recruitingAPI: {
    watchClients: (cb: (v: unknown) => void) => watch('clients', [client])(cb),
    setup: async () => ({ applyUrl: 'https://x.convex.site/recruiting/apply', smsWebhook: 'https://x.convex.site/recruiting/sms', calWebhook: '', spendUrl: '', ready: { claude: true, number: false, applySecret: false, cal: false, flags: false } }),
    watchApplicants: (_f: unknown, cb: (v: unknown) => void) => watch('applicants', [])(cb),
    watchTryIt: (cb: (v: unknown) => void) => watch('tryIt', tryIt)(cb),
    tryItStart: (...a: unknown[]) => tryItStart(...(a as [])),
    tryItSend: (...a: unknown[]) => tryItSend(...(a as [])),
    tryItReset: async () => null,
    watchAds: (cb: (v: unknown) => void) => watch('ads', ads)(cb),
    decideAd: (...a: unknown[]) => decideAd(...(a as [])),
    approveClean: async () => ['acme-m1'],
    saveClient: (...a: unknown[]) => saveClient(...(a as [])),
    watchThread: (_id: string, cb: (v: unknown) => void) =>
      watch('thread', {
        applicant: { id: 'a1', name: 'Dana Cruz', phone: '+14325550100', clientId: 'c1', client: 'Acme Roofing', sourceAdId: 'acme-m1', score: 'A', status: 'interviewed', answers: {}, test: false, replying: false, createdAt: '2026-11-01T00:00:00.000Z', lastText: null },
        messages: [],
      })(cb),
    markOutcome: (...a: unknown[]) => markOutcome(...(a as [])),
    demoLive: () => demoLive(),
    demoSeed: () => demoSeed(),
    demoClear: async () => ({ removed: 0 }),
  },
}));
let role = 'staff';
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }));

import RecruitingOpsPage from '../RecruitingOpsPage';

const flush = () => act(async () => {});
async function render(path: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter initialEntries={[path]}><RecruitingOpsPage /></MemoryRouter>));
  await flush();
  return container;
}
const click = (el: Element) => act(async () => void (el as HTMLElement).click());
const type = (el: Element, value: string) =>
  act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const button = (label: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(label))!;

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  role = 'staff';
  tryIt = null;
});

describe('Ops → Recruiting', () => {
  it('is for staff only', async () => {
    role = 'user';
    const page = await render('/ops/recruiting');
    expect(page.textContent).toContain('only for Webb Leads staff');
  });

  it('lists the clients with their id for the ad forms, and adds one', async () => {
    const page = await render('/ops/recruiting?tab=clients');
    expect(page.querySelector('[data-testid="recruit-client"]')!.textContent).toContain('Acme Roofing');
    expect(page.textContent).toContain('Client id c1');
    expect(page.textContent).toContain(`${window.location.origin}/jobs/acme`);
    expect(page.textContent).toContain(`${window.location.origin}/hires/tok123`);
    await click(button('Add client'));
    await type(document.querySelector('input[aria-label="Company"]')!, 'Storm Pros');
    await type(document.querySelector('input[aria-label="Role"]')!, 'Roofing setter');
    await type(document.querySelector('input[aria-label="City"]')!, 'Odessa, TX');
    await type(document.querySelector('textarea[aria-label="Comp sheet"]')!, '$150 per sit');
    await type(document.querySelector('input[aria-label="Booking link"]')!, 'https://cal.com/storm/interview');
    await type(document.querySelector('textarea[aria-label="Rep stories"]')!, 'Dana was a server.\n\nLee drove for Uber.');
    await click(Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent === 'Add client')!);
    expect(saveClient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Storm Pros', role: 'Roofing setter', repStories: ['Dana was a server.', 'Lee drove for Uber.'], adsEnabled: true, timezone: 'America/Chicago' }));
  });

  it('Try it: apply as a rep, text Jordan, and the reply shows as it arrives', async () => {
    const page = await render('/ops/recruiting?tab=try');
    await click(button('Apply as this rep'));
    expect(tryItStart).toHaveBeenCalledWith('c1', '');
    const convo = (messages: unknown[], extra: Record<string, unknown> = {}) => ({
      applicant: { id: 'a1', name: 'Test Rep', client: 'Acme Roofing', status: 'screening', answers: {}, test: true, replying: false, ...extra },
      messages,
    });
    await act(async () => watchers.tryIt(convo([{ id: 'm1', direction: 'out', body: 'Hey, it’s Jordan. Done sales before? Reply STOP to opt out.', at: '2026-11-09T16:00:00.000Z' }])));
    expect(page.querySelector('[data-testid="thread"]')!.textContent).toContain('Done sales before?');
    await type(page.querySelector('input[aria-label="Your text as the rep"]')!, 'Yeah 2 years roofing');
    await act(async () => void (page.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(tryItSend).toHaveBeenCalledWith('Yeah 2 years roofing');
    await act(async () =>
      watchers.tryIt(
        convo(
          [
            { id: 'm1', direction: 'out', body: 'Done sales before?', at: '2026-11-09T16:00:00.000Z' },
            { id: 'm2', direction: 'in', body: 'Yeah 2 years roofing', at: '2026-11-09T16:01:00.000Z' },
            { id: 'm3', direction: 'out', body: 'Nice. Closer, setter, or both?', at: '2026-11-09T16:01:05.000Z' },
          ],
          { score: 'A', answers: { d2d: '2 years roofing' } },
        ),
      ),
    );
    expect(page.querySelector('[data-testid="thread"]')!.textContent).toContain('Nice. Closer, setter, or both?');
    expect(page.querySelector('[data-testid="answers"]')!.textContent).toContain('2 years roofing');
  });

  it('Ads: drafts with their warnings, approving shows the new source ad id, and the numbers by ad', async () => {
    const page = await render('/ops/recruiting?tab=ads');
    const drafts = page.querySelectorAll('[data-testid="ad-draft"]');
    expect(drafts).toHaveLength(2);
    expect(page.textContent).toContain('Pay number not in the comp sheet or rep stories: $250,000');
    expect(page.textContent).toContain('riff on acme-m0');
    expect(button('Approve the 1 without warnings')).toBeTruthy();
    await click(drafts[1].querySelector('button')!);
    expect(decideAd).toHaveBeenCalledWith('d1', 'approve');
    expect(page.textContent).toContain(`Approved: its source ad id is acme-m1. Its apply link: ${window.location.origin}/jobs/acme?ad=acme-m1`);
    expect(page.textContent).toContain('acme-m9: 12 applicants');
    expect(page.querySelector('[data-testid="ad-performance"]')!.textContent).toContain('1.00');
    expect(page.querySelector('[data-testid="ad-performance"]')!.textContent).toContain('$150');
  });

  it('after the interview, staff mark a rep hired', async () => {
    await render('/ops/recruiting?applicant=a1');
    const box = document.querySelector('[data-testid="outcome"]')!;
    await click(Array.from(box.querySelectorAll('button')).find((b) => b.textContent === 'Hired')!);
    expect(markOutcome).toHaveBeenCalledWith('a1', 'hired');
  });

  it('Setup: load the demo, and Watch opens the live conversation', async () => {
    const page = await render('/ops/recruiting?tab=setup');
    const box = page.querySelector('[data-testid="demo"]')!;
    expect(box.textContent).toContain('nothing is texted, booked or sent to Claude');
    await click(Array.from(box.querySelectorAll('button')).find((b) => b.textContent === 'Load demo data')!);
    expect(demoSeed).toHaveBeenCalled();
    await click(Array.from(box.querySelectorAll('button')).find((b) => b.textContent === 'Watch a live conversation')!);
    await flush();
    expect(demoLive).toHaveBeenCalled();
    expect(page.querySelector('h1')!.textContent).toBe('Applicants');
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Dana Cruz');
  });

  it('Setup says what is connected and where Twilio points', async () => {
    const page = await render('/ops/recruiting?tab=setup');
    const checks = Array.from(page.querySelectorAll('[data-testid="setup-check"]')).map((c) => c.textContent);
    expect(checks[0]).toContain('Claude');
    expect(page.textContent).toContain('https://x.convex.site/recruiting/sms');
  });
});
