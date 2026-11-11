import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const contact = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  key: `k-${id}`,
  name: 'Oak Plaza LLC',
  company: 'Oak Plaza LLC',
  mailing: { address: '1 MAIN ST', city: 'DALLAS', state: 'TX', zip: '75201' },
  property: { parcelId: 'p1', address: '12 Midkiff Rd', useCode: 'F1', valueCents: 300_000_000 },
  properties: 1,
  totalValueCents: 300_000_000,
  why: 'Commercial building worth $3M',
  kinds: ['commercial'],
  listIds: ['l1'],
  status: 'new',
  phones: [],
  emails: [],
  enrichment: { phone: { status: 'locked' }, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'locked' } },
  signals: [],
  createdAt: '2026-11-05T15:00:00Z',
  ...over,
});
const coverage = (phone = 0, email = 0, person = 0, total = 2) => ({
  phone: { found: phone, total, sources: phone ? 1 : 0 },
  email: { found: email, total, sources: email ? 1 : 0 },
  person: { found: person, total, sources: person ? 1 : 0 },
  research: { found: 0, total, sources: 0 },
});
const money = { asOf: '2026-11-05T15:00:00.000Z', balanceCents: 0, unlockCents: 100, researchCents: 25, researchQuestion: 'Who is this owner, what do they do, and is there any sign of planned construction?' };
const list = {
  id: 'l1',
  title: 'Shopping center owners',
  who: 'commercial',
  definition: { county: 'Midland', who: 'commercial' },
  rowCount: 2,
  done: 0,
  truncated: false,
  createdAt: '2026-11-05T15:00:00Z',
  deletable: true,
};
let lists: Array<Record<string, unknown>> = [];
const organizeList = jest.fn(async (_org: string, id: string, change: Record<string, unknown>) => {
  lists = lists.map((l) => (l.id === id ? { ...l, ...change, ...(change.archived ? { pinned: false } : {}) } : l));
  return null;
});
let contacts: Record<string, unknown> = { rows: [], coverage: coverage(0, 0, 0, 0), ...money };
let interpreted: Record<string, unknown> = {
  ok: true,
  definition: { county: 'Midland', who: 'commercial' },
  title: 'Shopping center owners, Midland',
  explanation: 'Owners of commercial buildings on the roll; no phone numbers.',
  count: 2,
  truncated: false,
  limited: false,
  preview: [contact('r1'), contact('r2', { name: 'City Of Midland', properties: 4, totalValueCents: 30_000_000, why: '4 commercial buildings worth $300K' })],
};
const interpret = jest.fn(async () => interpreted);
const preview = jest.fn(async () => ({ count: 1, truncated: false, limited: false, rows: [contact('r1', { name: 'Vance Robert & Linda' })] }));
const create = jest.fn(async () => ({ listId: 'l9', rowCount: 2, added: 2, truncated: false }));
const setStatus = jest.fn(async () => null);
const sendToLeads = jest.fn(async () => 'lead1');
const sendManyToLeads = jest.fn(async () => ({ sent: 2, leads: 1, joined: 1 }));
const undoSend = jest.fn(async () => ({ removed: 120, kept: 5 }));
const remove = jest.fn(async () => null);
const removeUnlisted = jest.fn(async () => ({ removed: 2, kept: 0 }));
const extend = jest.fn(async () => ({ loaded: 500, added: 500, rowCount: 1000, total: 2340, truncated: false }));
const enrich = jest.fn(async () => ({ queued: 1, costCents: 100, at: '2026-11-05T15:00:00Z' }));
const sources = jest.fn(async () => []);
const getContacts = jest.fn(async () => contacts);
// The live feed: a test can push what the server would send. The page reads its view once, then hears only of owners
// that changed; pushContacts takes a whole view (as the tests have them) and sends its owners and balance down that feed.
type Feed = { rows: unknown[]; balanceCents: number; freeLookups: number; removedAt?: string; reload: boolean; upTo: string };
let pushChanges: ((c: Feed) => void) | null = null;
const pushContacts = (c: { rows: unknown[]; balanceCents?: number; freeLookups?: number }) =>
  pushChanges!({ rows: c.rows, balanceCents: c.balanceCents ?? 0, freeLookups: c.freeLookups ?? 0, reload: false, upTo: '2026-11-05T15:00:01.000Z' });
// What the server already has in hand for a feed: answered the instant the feed is asked for, before the call returns
// (as the real client does for a query it has just been listening to).
let syncFeed: Feed | null = null;
const watchChanges = jest.fn((_o: string, _since: string, onUpdate: (c: Feed) => void) => {
  pushChanges = onUpdate;
  if (syncFeed) onUpdate(syncFeed);
  let stopped = false;
  return () => {
    // As the real client: stopping a feed twice throws.
    if (stopped) throw new Error("undefined is not an object (evaluating 'u.delete')");
    stopped = true;
    if (pushChanges === onUpdate) pushChanges = null;
  };
});
// The lists as the server has them, pushed when their numbers are counted again; and the page's ask for that count.
let pushLists: ((l: unknown[]) => void) | null = null;
const watchLists = jest.fn((_o: string, onUpdate: (l: unknown[]) => void) => {
  pushLists = onUpdate;
  return () => {
    pushLists = null;
  };
});
const tally = jest.fn(async () => ({ counting: 0 }));
// Today's calls, as the server would answer; null is a backend with nothing to say (the page shows no line about it).
let todaySheet: Record<string, unknown> | null = null;
const getToday = jest.fn(async () => todaySheet);
const logContact = jest.fn(async () => null);
const updateLead = jest.fn(async () => null);
// The lookups' narration feed, apart from the owners.
let pushProgress: ((p: unknown) => void) | null = null;
const watchProgress = jest.fn((_o: string, onUpdate: (p: unknown) => void) => {
  pushProgress = onUpdate;
  return () => {
    pushProgress = null;
  };
});
let ownersState: Record<string, unknown> | null = null;
const rebuild = jest.fn(async () => ({ fetched: 58_418, added: 44_120, updated: 0 }));
const refresh = jest.fn(async () => ({ fetched: 1_240, added: 3, updated: 17 }));
let authUser: Record<string, unknown> = { id: 'u1', role: 'user' };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }));
jest.mock('../../components/market/WalletBar', () => ({ openFundingPage: jest.fn(async () => undefined), fundErrorText: (e: unknown) => String(e) }));
jest.mock('../../lib/api', () => ({
  leadsAPI: {
    logContact: (...args: unknown[]) => logContact(...(args as [])),
    update: (...args: unknown[]) => updateLead(...(args as [])),
  },
  outreachAPI: {
    today: (...args: unknown[]) => getToday(...(args as [])),
    lists: async () => lists,
    contacts: (...args: unknown[]) => getContacts(...(args as [])),
    interpret: (...args: unknown[]) => interpret(...(args as [])),
    preview: (...args: unknown[]) => preview(...(args as [])),
    create: (...args: unknown[]) => create(...(args as [])),
    setStatus: (...args: unknown[]) => setStatus(...(args as [])),
    sendToLeads: (...args: unknown[]) => sendToLeads(...(args as [])),
    sendManyToLeads: (...args: unknown[]) => sendManyToLeads(...(args as [])),
    undoSend: (...args: unknown[]) => undoSend(...(args as [])),
    remove: (...args: unknown[]) => remove(...(args as [])),
    removeUnlisted: (...args: unknown[]) => removeUnlisted(...(args as [])),
    organizeList: (...args: unknown[]) => organizeList(...(args as [])),
    extend: (...args: unknown[]) => extend(...(args as [])),
    enrich: (...args: unknown[]) => enrich(...(args as [])),
    watchChanges: (...args: unknown[]) => watchChanges(...(args as [string, string, (c: Feed) => void])),
    watchLists: (...args: unknown[]) => watchLists(...(args as [string, (l: unknown[]) => void])),
    tally: (...args: unknown[]) => tally(...(args as [])),
    watchProgress: (...args: unknown[]) => watchProgress(...(args as [string, (p: unknown) => void])),
    sources: (...args: unknown[]) => sources(...(args as [])),
    status: async () => ownersState,
    rebuild: () => rebuild(),
    refresh: () => refresh(),
  },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: jest.requireActual<typeof import('react')>('react').createContext({ selectedOrg: { id: 'o1', name: 'Peak Roofing' } }),
}));

import OutreachPage from '../OutreachPage';
import { openFundingPage } from '../../components/market/WalletBar';
import { ContactsTable, Live } from '../../components/outreach/ContactsTable';
import { localDay } from '../../components/outreach/TodaySheet';

// The screen width the page asks about: a laptop unless a test says it's a phone.
let narrowScreen = false;
// A finger rather than a mouse (an iPad): asked about on its own, whatever the width.
let touchScreen = false;
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: query.includes('pointer: coarse') ? touchScreen : narrowScreen, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
});

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
let path = '';
const Where = () => {
  path = useLocation().pathname + useLocation().search;
  return null;
};

// Every page a test renders, unmounted after it so its timers and drawers can't reach into the next test.
const roots: Root[] = [];
/** Unmount every page first: what floats at the bottom is drawn outside the page, straight into the body. */
const clearPage = () => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  document.body.innerHTML = '';
};
async function render(at = '/outreach') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <Where />
        <Routes>
          <Route path="/outreach" element={<OutreachPage />} />
          <Route path="/outreach/:listId" element={<OutreachPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
  return container;
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const click = async (text: string) => {
  const b = button(text);
  if (!b) throw new Error(`No button "${text}"`);
  await act(async () => b.click());
  await flush();
};
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const twoContacts = () => ({
  rows: [
    contact('r1'),
    contact('r2', {
      name: 'City Of Midland',
      company: 'City Of Midland',
      mailing: { address: '300 N LORAINE ST', city: 'MIDLAND', state: 'TX', zip: '79701' },
      why: '4 commercial buildings worth $300K',
      properties: 4,
      totalValueCents: 120_000_000,
      signals: [{ kind: 'code_violation', date: '2026-09-14', detail: 'High weeds' }],
    }),
  ],
  coverage: coverage(),
  ...money,
});

afterEach(() => {
  clearPage();
  jest.clearAllMocks();
  lists = [];
  contacts = { rows: [], coverage: coverage(0, 0, 0, 0), ...money };
  authUser = { id: 'u1', role: 'user' };
  ownersState = null;
  todaySheet = null;
  syncFeed = null;
  narrowScreen = false;
  touchScreen = false;
  localStorage.clear();
});

describe('the Outreach page', () => {
  it('answers at once: a change the server sends shows without a re-read, a lookup shows running before the server replies, and a refused status goes back', async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    // Listening starts a little before the moment of the read, so nothing in between is missed.
    expect(watchChanges).toHaveBeenLastCalledWith('o1', '2026-11-05T14:59:50.000Z', expect.any(Function), expect.any(Function));
    const reads = getContacts.mock.calls.length;
    // The server's push: City Of Midland's person found elsewhere, shown with no new read.
    await act(async () => pushContacts({ ...twoContacts(), rows: [contact('r1'), contact('r2', { name: 'City Of Midland', person: { name: 'Sam Ortiz', source: 'tx-comptroller' } })] }));
    expect(document.body.textContent).toContain('Sam Ortiz');
    expect(getContacts.mock.calls.length).toBe(reads);

    // A lookup the server is slow to accept: the cells run the moment it's asked.
    let accept: (v: unknown) => void = () => {};
    enrich.mockImplementationOnce(() => new Promise((resolve) => (accept = resolve)) as never);
    contacts = { ...twoContacts(), balanceCents: 500 };
    await act(async () => pushContacts(contacts));
    await click('Find phones & emails (2)');
    await click('Find them');
    const first = document.body.querySelectorAll('[data-testid="contact-row"]')[0];
    expect(first.querySelectorAll('[data-testid="live"]').length).toBeGreaterThan(0);
    expect(document.body.querySelector('[data-testid="lookup-progress"]')!.textContent).toContain('Looking up 2 owners · 0 done');
    await act(async () => accept({ queued: 2, costCents: 200, at: new Date().toISOString() }));
    await flush();

    // An outcome the server refuses: shown at once, then put back.
    setStatus.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    await act(async () => (document.body.querySelectorAll('[data-testid="contact-row"]')[1] as HTMLTableRowElement).click());
    await flush();
    await click('Skip');
    await flush();
    // Back to New, which is said by no badge at all.
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')[1].querySelector('[data-testid="status-badge"]')).toBeNull();
  });

  it("a lookup's narration comes on its own feed and shows on its running cell, through the owners' own updates, until it lands", async () => {
    lists = [list];
    const cells = (phone: Record<string, unknown>) => ({ phone, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'locked' } });
    contacts = { ...twoContacts(), rows: [contact('r1', { enrichment: cells({ status: 'running', at: '2026-11-05T15:00:00Z' }) })] };
    await render('/outreach/l1');
    expect(watchProgress).toHaveBeenLastCalledWith('o1', expect.any(Function));
    const live = () => document.body.querySelector('[data-testid="contact-row"] [data-testid="live"]')?.textContent ?? '';
    expect(live()).not.toContain('BatchData');
    await act(async () => pushProgress!([{ contactId: 'r1', field: 'phone', asking: 'batchdata', tries: [{ source: 'permits', outcome: 'skipped' }] }]));
    expect(live()).toContain('Asking BatchData…');
    // An update to the owners (another field, a status) keeps the narration on the cell still running.
    await act(async () => pushContacts({ ...contacts, rows: [contact('r1', { note: 'Call after 5', enrichment: cells({ status: 'running', at: '2026-11-05T15:00:00Z' }) })] }));
    expect(live()).toContain('Asking BatchData…');
    // Landed: the answer, and the narration (still on its feed a moment) doesn't cling to a finished cell.
    await act(async () => pushContacts({ ...contacts, rows: [contact('r1', { phones: [{ number: '4325550100', type: 'mobile', source: 'batchdata' }], enrichment: cells({ status: 'found', at: '2026-11-05T15:01:00Z', source: 'batchdata' }) })] }));
    expect(document.body.querySelector('[data-testid="contact-row"] [data-testid="live"]')).toBeNull();
  });

  it('a research run says so on the banner: owners researched and answers found, not phones and emails', async () => {
    lists = [list];
    localStorage.setItem('outreach.batch', JSON.stringify({ at: '2026-11-05T15:00:00Z' }));
    const at = '2026-11-05T15:02:00Z';
    const answer = { question: 'Any plans?', answer: 'A parks bond passed in 2026.', sources: [], at };
    // Phones found last week stay out of it: only cells asked in this run count.
    const before = { phone: { status: 'found', at: '2026-10-01T00:00:00Z', source: 'batchdata', chargedCents: 100 }, email: { status: 'locked' }, person: { status: 'locked' } };
    contacts = {
      ...twoContacts(),
      rows: [
        contact('r1', { research: answer, enrichment: { ...before, research: { status: 'found', at, source: 'claude', chargedCents: 25 } } }),
        contact('r2', { name: 'City Of Midland', enrichment: { ...before, research: { status: 'running', at } } }),
      ],
    };
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="lookup-progress"]')!.textContent).toBe('Researching 2 owners · 1 done1 answer · $0.25 so far');
    await act(async () => pushContacts({ ...contacts, rows: [(contacts.rows as unknown[])[0], contact('r2', { name: 'City Of Midland', enrichment: { ...before, research: { status: 'none', at } } })] }));
    expect(document.body.querySelector('[data-testid="lookup-progress"]')!.textContent).toBe('Done: 2 owners researched1 answer · $0.25 charged');
  });

  it('shows a finished lookup as a summary to dismiss, a new signal with a tag and its own chip, and makes a cell glow the moment its answer lands', async () => {
    lists = [list];
    localStorage.setItem('outreach.batch', JSON.stringify({ at: '2026-11-05T15:00:00Z' }));
    const at = '2026-11-05T15:02:00Z';
    contacts = {
      ...twoContacts(),
      rows: [
        contact('r1', {
          enrichment: { phone: { status: 'found', at, source: 'batchdata', chargedCents: 100 }, email: { status: 'found', at, source: 'batchdata' }, person: { status: 'found', at, source: 'tx-comptroller' }, research: { status: 'locked' } },
          person: { name: 'Dana Reyes', source: 'tx-comptroller' },
          phones: [{ number: '4325550100', type: 'mobile', source: 'batchdata' }],
          emails: [{ email: 'dana@oakplaza.com', source: 'batchdata' }],
        }),
        contact('r2', {
          name: 'City Of Midland',
          enrichment: { phone: { status: 'none', at }, email: { status: 'none', at }, person: { status: 'none', at }, research: { status: 'locked' } },
          signals: [{ kind: 'stalled_permit', date: '2026-10-30', detail: 'Expired', fresh: true }],
        }),
      ],
    };
    await render('/outreach/l1');
    const bar = document.body.querySelector('[data-testid="lookup-progress"]')!;
    expect(bar.textContent).toBe('Done: 2 owners looked up1 phone · 1 email · 1 person · $1 charged');
    await act(async () => (bar.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="lookup-progress"]')).toBeNull();
    expect(localStorage.getItem('outreach.batch')).toBeNull();
    // What changed this week has its own chip, and its tag in the Signals column.
    await click('New this week');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('NewStalled permit Oct 2026');

    // The glow: a cell that was running and now has its answer lights up for a moment.
    clearPage();
    const box = document.createElement('div');
    document.body.appendChild(box);
    const root = createRoot(box);
    const table = (rows: ReturnType<typeof contact>[]) => (
      <ContactsTable rows={rows as never} coverage={coverage() as never} onOpen={() => {}} onRetry={() => {}} />
    );
    const runningRow = contact('r1', { enrichment: { phone: { status: 'running', asking: 'batchdata' }, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'locked' } } });
    await act(async () => root.render(table([runningRow])));
    expect(box.querySelector('td.cell-filled')).toBeNull();
    expect(box.querySelector('[data-testid="live"]')!.textContent).toContain('Asking BatchData…');
    const landed = contact('r1', { phones: [{ number: '4325550100', type: 'mobile', source: 'batchdata' }], enrichment: { phone: { status: 'found', at, source: 'batchdata' }, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'locked' } } });
    await act(async () => root.render(table([landed])));
    expect(box.querySelectorAll('td.cell-filled')).toHaveLength(1);
    expect(box.querySelector('td.cell-filled')!.textContent).toContain('(432) 555-0100');
    await act(async () => root.unmount());
  });

  it('shows cards on a phone: the decision maker, the best number with Call and Text, the signal, what happened on the call; the table is a tap away and remembered', async () => {
    narrowScreen = true;
    lists = [list];
    contacts = {
      ...twoContacts(),
      rows: [
        contact('r1', {
          person: { name: 'Dana Reyes', title: 'Manager', source: 'tx-comptroller' },
          phones: [
            { number: '4325550199', type: 'landline', dnc: true, source: 'batchdata' },
            { number: '4325550100', type: 'mobile', verified: true, source: 'batchdata' },
          ],
          emails: [{ email: 'dana@oakplaza.com', source: 'batchdata' }],
          enrichment: { phone: { status: 'found', source: 'batchdata', chargedCents: 100 }, email: { status: 'found', source: 'batchdata' }, person: { status: 'found', source: 'tx-comptroller' }, research: { status: 'locked' } },
          related: [{ id: 'r9', name: 'Oak Plaza II LP' }],
        }),
        contact('r2', {
          name: 'City Of Midland',
          properties: 4,
          totalValueCents: 120_000_000,
          signals: [{ kind: 'code_violation', date: '2026-09-14', detail: 'High weeds' }],
        }),
      ],
    };
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="contacts-table"]')).toBeNull();
    const cards = Array.from(document.body.querySelectorAll('[data-testid="contact-card"]'));
    expect(cards).toHaveLength(2);
    const oak = cards[0].textContent!;
    expect(oak).toContain('Oak Plaza LLC');
    expect(oak).toContain('+1 related');
    expect(oak).toContain('Dana Reyes · Manager');
    // The best number to call is the one not on the Do Not Call list.
    expect(oak).toContain('(432) 555-0100');
    // One row of actions: Call, Text and Email as icons beside it, then To Leads.
    const reach = cards[0].querySelector('[data-testid="card-actions"]')!;
    expect(Array.from(reach.querySelectorAll('a')).map((a) => [a.textContent?.trim() || a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([
      ['Call', 'tel:4325550100'],
      ['Text', 'sms:4325550100'],
      ['Email', 'mailto:dana@oakplaza.com'],
    ]);
    expect(reach.querySelector('[data-testid="to-leads"]')!.textContent?.trim()).toBe('To Leads');
    const city = cards[1].textContent!;
    expect(city).toContain('4 properties · $1.2M');
    expect(city).toContain('Code violation Sep 2026');
    expect(city).toContain('Decision maker: not looked up');
    expect(city).toContain('Phone: not looked up');
    expect(cards[1].querySelectorAll('[data-testid="card-actions"] a')).toHaveLength(0);
    // Skip, and Skip again puts them back; Send to Leads hands them over, and then the button opens the lead.
    const tapCard = async (text: string) => {
      const card = document.body.querySelectorAll('[data-testid="contact-card"]')[0];
      await act(async () => (Array.from(card.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement).click());
      await flush();
    };
    const cardButtons = () => Array.from(document.body.querySelectorAll('[data-testid="contact-card"]')[0].querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(cardButtons()).toContain('Skip');
    await tapCard('Skip');
    expect(setStatus).toHaveBeenLastCalledWith('o1', 'r1', 'skip', '');
    expect(cardButtons()).toContain('Skipped');
    await tapCard('Skipped');
    expect(setStatus).toHaveBeenLastCalledWith('o1', 'r1', 'new', '');
    await tapCard('To Leads');
    expect(sendToLeads).toHaveBeenCalledWith('o1', 'r1');
    expect(cardButtons().at(-1)).toBe('In Leads');
    // Once in Leads there is nothing to skip.
    expect(cardButtons()).not.toContain('Skip');
    // The table, a tap away under More; the choice sticks on this device.
    const viewSwitch = async (name: string) => {
      await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
      await act(async () => (Array.from(document.body.querySelectorAll('[role="menu"] button')).find((b) => b.textContent?.trim() === name) as HTMLButtonElement).click());
      await flush();
    };
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    await viewSwitch('Show as a table');
    expect(document.body.querySelector('[data-testid="contacts-table"]')).not.toBeNull();
    expect(localStorage.getItem('outreach.view')).toBe('table');
    await viewSwitch('Show as cards');
    expect(document.body.querySelector('[data-testid="contact-cards"]')).not.toBeNull();
    // An owner already in Leads: the button opens their lead.
    await act(async () => (Array.from(document.body.querySelectorAll('[data-testid="contact-card"]')[0].querySelectorAll('button')).find((b) => b.textContent?.trim() === 'In Leads') as HTMLButtonElement).click());
    expect(path).toBe('/leads?lead=lead1');
  });

  it('on a phone the header is one button and a More menu, and the list, search and a status filter share one line', async () => {
    narrowScreen = true;
    lists = [list];
    const two = twoContacts();
    // One with a number to call; one already in Leads, so not looked up again (their number is already there).
    contacts = {
      ...two,
      rows: [
        { ...two.rows[0], phones: [{ number: '4325550100', type: 'mobile', source: 'batchdata' }] },
        { ...two.rows[1], known: { kind: 'lead', id: 'l9', name: 'City Of Midland' } },
      ],
    };
    await render('/outreach/l1');
    const header = document.body.querySelector('[data-testid="actions"]')!;
    // The two buttons (Find says to add funds while the balance is short, and adding them is its tap); the rest waits under More.
    expect(Array.from(header.querySelectorAll('button')).map((b) => b.textContent?.trim() || b.getAttribute('aria-label'))).toEqual(['Add funds to find phones (1)', 'Research with AI (2)', 'More']);
    await act(async () => button('Add funds to find').click());
    expect(openFundingPage).toHaveBeenCalledWith('o1');
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    const more = Array.from(document.body.querySelectorAll('[role="menu"] button')).map((b) => b.textContent?.trim());
    // The owner already a lead isn't sent again: only the one with a number goes.
    expect(more).toEqual(expect.arrayContaining(['Send 1 to Leads1 with a number', 'Show as a table', 'Export CSV', 'Delete list']));
    // A tap elsewhere closes it.
    await act(async () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    // The list picker and the search sit in the sticky bar; the status is a filter menu with a dot when it narrows.
    const bar = document.body.querySelector('[data-testid="filter-bar"]')!;
    expect(bar.querySelector('[data-testid="list-picker"]')).not.toBeNull();
    expect(bar.querySelector('select[aria-label="Status"]')).toBeNull();
    expect(document.body.querySelectorAll('[data-testid="list-picker"]')).toHaveLength(1);
    const filter = () => bar.querySelector('button[aria-label="Filter by status"]') as HTMLButtonElement;
    expect(filter().querySelector('span')).toBeNull();
    await act(async () => filter().click());
    expect(Array.from(document.body.querySelectorAll('[role="menu"] button')).map((b) => b.textContent?.trim())).toEqual(['All statuses', 'New', 'In Leads', 'Skipped']);
    await act(async () => (Array.from(document.body.querySelectorAll('[role="menu"] button')).find((b) => b.textContent?.trim() === 'Skipped') as HTMLButtonElement).click());
    await flush();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(filter().querySelector('span')).not.toBeNull();
    expect(document.body.querySelectorAll('[data-testid="contact-card"]')).toHaveLength(0);
  });

  it("an owner the company already has says so, on the card and the sheet; a lead's See owner link opens that owner here", async () => {
    narrowScreen = true;
    lists = [list];
    const two = twoContacts();
    contacts = {
      ...two,
      rows: [
        { ...two.rows[0], known: { kind: 'client', id: 'c1', name: 'Acme Holdings' } },
        { ...two.rows[1], known: { kind: 'lead', id: 'l9', name: 'City Of Midland' } },
      ],
    };
    await render('/outreach/l1?owner=r2');
    // Opened straight to that owner's sheet, and the address drops the ?owner.
    const sheet = document.body.querySelector('[role="dialog"]') ?? document.body;
    expect(sheet.textContent).toContain('Already in Leads. Sending adds this owner to that lead instead of making another.');
    expect(path).toBe('/outreach/l1');
    const cards = Array.from(document.body.querySelectorAll('[data-testid="contact-card"]'));
    expect(cards[0].querySelector('[data-testid="known"]')!.textContent).toBe('Already a client: Acme Holdings');
    // Same name as the owner: no need to say it twice.
    expect(cards[1].querySelector('[data-testid="known"]')!.textContent).toBe('Already in Leads');
  });

  it('a list says what it has turned into in Leads, and an owner already sent shows where its lead stands', async () => {
    narrowScreen = true;
    lists = [{ ...list, results: { sent: 3, estimates: 1, sold: 1 } }];
    const two = twoContacts();
    contacts = { ...two, rows: [{ ...two.rows[0], status: 'lead', leadId: 'lead1', leadStage: 'quoted' }, two.rows[1]] };
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="list-results"]')!.textContent).toBe(' · 3 sent · 1 estimate · 1 sold');
    const card = document.body.querySelectorAll('[data-testid="contact-card"]')[0];
    expect(card.querySelector('[data-testid="to-leads"]')!.textContent?.trim()).toBe('Estimate sent');
  });

  it('owners kept from deleted lists still show, with a word on why and a way to make a list', async () => {
    lists = [];
    contacts = { ...twoContacts(), unlisted: 2 };
    await render();
    expect(document.body.querySelector('[data-testid="outreach-empty"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="no-lists-hint"]')!.textContent).toBe(
      'No lists right now. These 2 owners stayed from lists you deleted, because you worked them: a status, a note, a paid lookup, or a lead.Make a listRemove them',
    );
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(2);
    // Done with them: Remove them, after a warning that what they hold goes too.
    await click('Remove them');
    expect(document.body.querySelector('[role="alertdialog"]')!.textContent).toContain('Remove the 2 owners not on a list?');
    expect(document.body.querySelector('[role="alertdialog"]')!.textContent).toContain('Owners you sent to Leads or made clients, and any still being looked up, stay.');
    await act(async () => (Array.from(document.body.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === 'Remove') as HTMLButtonElement).click());
    await flush();
    expect(removeUnlisted).toHaveBeenCalledWith('o1');
    await click('Make a list');
    expect(document.body.querySelector('[data-testid="no-lists-hint"]')).not.toBeNull();
  });

  it('with no lists, the page is the ready-made lists as cards: one opens straight to its count and preview; describing your own is left to the + sheet', async () => {
    await render();
    const empty = document.body.querySelector('[data-testid="outreach-empty"]')!;
    const cards = Array.from(empty.querySelectorAll('[data-testid="starter-list"]'));
    expect(cards).toHaveLength(17);
    expect(cards[1].textContent).toBe('Shopping center ownersOwners of commercial buildings, biggest holdings first');
    // A card opens the sheet straight to that list's count and first look.
    await act(async () => (cards[1] as HTMLButtonElement).click());
    await flush();
    expect(preview).toHaveBeenLastCalledWith('o1', { county: 'Midland', who: 'commercial' });
    expect(document.body.querySelector('[data-testid="built"]')!.textContent).toContain('Pick a different list');
    expect(document.body.querySelector('input#outreach-title')).not.toBeNull();
    // Picked, the list takes the sheet at once: its name and empty rows while it counts, never the choices first.
    await act(async () => (document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    await flush();
    let finish: (v: unknown) => void = () => {};
    preview.mockImplementationOnce(() => new Promise((r) => (finish = r)) as never);
    await act(async () => (empty.querySelectorAll('[data-testid="starter-list"]')[0] as HTMLButtonElement).click());
    expect(document.body.querySelector('[aria-label="Ready-made lists"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="building"]')!.textContent).toContain('Owners of 3+ commercial buildings');
    await act(async () => finish({ count: 1, truncated: false, limited: false, rows: [contact('r1')] }));
    await flush();
    expect(document.body.querySelector('[data-testid="building"]')).toBeNull();
    expect(document.body.querySelector('input#outreach-title')).not.toBeNull();
    // No second place to describe a list: that's the + sheet's.
    expect(empty.querySelector('input')).toBeNull();
    // Gone back before the count lands: the late count doesn't pull the sheet back to that list.
    preview.mockImplementationOnce(() => new Promise((r) => (finish = r)) as never);
    await click('Pick a different list');
    await click('Commercial and investors');
    await click('Shopping center owners');
    await click('Pick a different list');
    await act(async () => finish({ count: 1, truncated: false, limited: false, rows: [contact('r1')] }));
    await flush();
    expect(document.body.querySelector('[aria-label="Ready-made lists"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="built"]')).toBeNull();
    expect(document.body.querySelector('[aria-label="Ready-made lists"] button[aria-pressed="true"]')).toBeNull();
  });

  it('shows the contacts table with a list picker, or says to tap + when there are none', async () => {
    await render();
    // Nothing yet: the ready-made lists as cards, and a box for your own words.
    const empty = document.body.querySelector('[data-testid="outreach-empty"]')!;
    // For the company's working county, named in the title and a tap to change: the counties not in yet say so.
    expect(empty.querySelector('h2')!.textContent).toBe('Who do you want to reach in Midland County, TX?');
    await act(async () => (empty.querySelector('[data-testid="county-switch"]') as HTMLButtonElement).click());
    expect(Array.from(document.body.querySelectorAll('[role="option"]')).map((o) => [o.textContent, o.getAttribute('aria-disabled')])).toEqual([
      ['Midland County, TX', 'false'],
      ['Ector County, TX (Odessa)Coming soon', 'true'],
      ['Lubbock County, TXComing soon', 'true'],
      ['Taylor County, TX (Abilene)Coming soon', 'true'],
    ]);
    await act(async () => (empty.querySelector('[data-testid="county-switch"]') as HTMLButtonElement).click());
    expect(empty.querySelectorAll('[data-testid="starter-list"]')).toHaveLength(17);
    // Just the title: no paragraph of explanation under it.
    expect(document.body.querySelector('header')!.textContent).toBe('Outreach');
    clearPage();
    lists = [list];
    contacts = twoContacts();
    // A table wider than its box, as on a laptop.
    Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', { configurable: true, get: () => 1400 });
    Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
    await render();
    // One picker instead of a chip per list.
    expect(document.body.querySelector('[data-testid="list-picker"]')!.textContent).toBe('All owners2');
    // The count beside the name, at a glance.
    expect(document.body.querySelector('[data-testid="list-count"]')!.textContent).toBe('2');
    expect(document.body.querySelector('[aria-label="Lists"]')).toBeNull();
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    expect(rows).toHaveLength(2);
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => c.textContent?.trim());
    // The name comes first, pinned, then what the row has; the roll's columns follow. No Status column (a New owner
    // says nothing) and no Research column while nobody has any, so the mailing address is the fifth column, in reach on a tablet.
    // The mailing address is one column: street, then city, state and zip under it, in normal capitals.
    // The name carries what the owner holds, as the cards do.
    expect(cells(0)).toEqual(['Oak Plaza LLC$3M', '—', '—', '—', '1 Main StDallas, TX 75201', '12 Midkiff Rd', '$3M', 'Commercial', '—']);
    expect(rows[0].querySelector('[data-testid="badges"]')).toBeNull();
    // How many more properties, in words.
    expect(cells(1)[5]).toBe('12 Midkiff Rd +3 more');
    // An owner with several properties shows what they hold in all, the number the list is sorted on.
    expect(cells(1)[6]).toBe('$1.2M');
    expect(cells(1)[8]).toBe('Code violation Sep 2026');
    expect(rows[0].querySelectorAll('td')[0].className).toContain('sticky');
    expect(rows[0].querySelectorAll('td')[1].className).not.toContain('sticky');
    expect(document.body.querySelector('[data-testid="more-columns"]')).not.toBeNull();
    // A tap on Name sorts: most parcels first, then A to Z, then back to the list's own order, remembered on this device.
    const names = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"] td:nth-child(1)')).map((c) => c.firstChild!.textContent);
    const sortBy = async () => {
      await act(async () => (document.body.querySelector('[data-testid="name-sort"]') as HTMLButtonElement).click());
    };
    expect(names()).toEqual(['Oak Plaza LLC', 'City Of Midland']);
    await sortBy();
    expect(document.body.querySelector('[data-testid="name-sort"]')!.textContent).toBe('NameMost parcels first');
    expect(names()).toEqual(['City Of Midland', 'Oak Plaza LLC']);
    expect(localStorage.getItem('outreach.sort')).toBe('parcels');
    await sortBy();
    expect(document.body.querySelector('[data-testid="name-sort"]')!.textContent).toBe('NameA–Z');
    expect(names()).toEqual(['City Of Midland', 'Oak Plaza LLC']);
    await sortBy();
    expect(names()).toEqual(['Oak Plaza LLC', 'City Of Midland']);
    expect(localStorage.getItem('outreach.sort')).toBeNull();
    const heads = Array.from(document.body.querySelectorAll('thead th')).map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
    expect(heads).toEqual(['NameNewest first', 'Decision maker0 / 2 companies', 'Phone0 / 2', 'Email0 / 2', 'Mailing address', 'Property', 'Value', 'Type', 'Signals']);
    // Open the picker and pick the list.
    await act(async () => (document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement).click());
    await click('Shopping center owners');
    expect(path).toBe('/outreach/l1');
    expect((getContacts.mock.lastCall as unknown[] | undefined)?.slice(0, 2)).toEqual(['o1', 'l1']);
    // One quiet line about the list over it; no step cards.
    expect(document.body.querySelector('[data-testid="steps"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="list-line"]')!.textContent).toBe('0 worked · made Nov 5');
    // Two owners and no total: nothing about a cap.
    expect(document.body.querySelector('[data-testid="list-total"]')).toBeNull();
  });

  it('search and the quick filters narrow the table: ready to call, has email, needs you', async () => {
    lists = [list];
    const found = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'tracerfy' };
    contacts = {
      ...twoContacts(),
      rows: [
        contact('r1', {
          enrichment: { phone: { ...found, chargedCents: 100 }, email: { status: 'none' }, person: { status: 'failed', error: 'The state registry timed out' } },
          phones: [{ number: '4325550100', type: 'mobile', dnc: true, source: 'tracerfy' }],
        }),
        contact('r2', {
          name: 'City Of Midland',
          person: { name: 'Dana Reyes', source: 'tx-comptroller' },
          enrichment: { phone: { ...found, chargedCents: 100 }, email: found, person: { ...found, source: 'tx-comptroller' } },
          phones: [{ number: '4325550199', type: 'landline', source: 'tracerfy' }],
          emails: [{ email: 'dana@midlandtx.gov', source: 'tracerfy', verified: true }],
          signals: [{ kind: 'code_violation', date: '2026-09-14', detail: 'High weeds' }],
        }),
        contact('r3', { name: 'Vance Robert & Linda', company: undefined, mailing: { address: '9 ELM ST', city: 'ODESSA', state: 'TX', zip: '79761' } }),
      ],
    };
    await render('/outreach/l1');
    const names = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"] td:nth-child(1)')).map((c) => c.firstChild!.textContent);
    expect(names()).toEqual(['Oak Plaza LLC', 'City Of Midland', 'Vance Robert & Linda']);
    const filters = document.body.querySelector('[aria-label="Filters"]')!;
    expect(Array.from(filters.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['All', 'Has a signal 1', 'Ready to call 1', 'Has email 1', 'Mail only 1', 'Needs you 1', 'Status: All']);
    // The failed cell says why, and Retry runs that field again without opening the sheet.
    const failedCell = document.body.querySelectorAll('[data-testid="contact-row"]')[0].querySelectorAll('td')[1];
    expect(failedCell.textContent?.trim()).toBe('Lookup failedThe state registry timed outRetry');
    await act(async () => (failedCell.querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(enrich).toHaveBeenCalledWith('o1', ['r1'], ['person'], undefined);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    // A DNC-only phone isn't ready to call.
    await click('Ready to call');
    expect(names()).toEqual(['City Of Midland']);
    await click('Needs you');
    expect(names()).toEqual(['Oak Plaza LLC']);
    // Nobody to call (its only number is Do Not Call): it goes out by mail.
    await click('Mail only');
    expect(names()).toEqual(['Oak Plaza LLC']);
    // A code violation, demolition order or stalled permit on the property: the warmest calls.
    await click('Has a signal');
    expect(names()).toEqual(['City Of Midland']);
    await act(async () => (filters.querySelector('button') as HTMLButtonElement).click());
    // On a wide screen search is a box you can see, saying what it finds; no icon to tap first.
    const search = document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    expect(search.placeholder).toBe('Search owner, person or street');
    expect(document.body.querySelector('button[aria-label="Open search"]')).toBeNull();
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'elm'));
    expect(names()).toEqual(['Vance Robert & Linda']);
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'reyes'));
    expect(names()).toEqual(['City Of Midland']);
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'zzz'));
    // Nobody: it says so with what was searched, and one tap clears it; the buttons up top stay put.
    expect(document.body.querySelector('[data-testid="nobody"]')!.textContent).toBe('Nobody matches “zzz”. Show everyone');
    expect(document.body.querySelector('[data-testid="actions"]')).not.toBeNull();
    await click('Show everyone');
    expect(names()).toHaveLength(3);
  });

  it("a number says whose line it is: the badge reads personal or work, the filters for each show up only when a row has one, and the CSV carries it", async () => {
    lists = [list];
    const found = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'batchdata', chargedCents: 100 };
    contacts = {
      ...twoContacts(),
      rows: [
        contact('r1', {
          enrichment: { phone: found, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'locked' } },
          phones: [
            { number: '4325550100', type: 'mobile', line: 'personal', verified: true, score: 100, name: 'REYES DANA', source: 'leadmagic-mobile' },
            { number: '4325550199', type: 'landline', line: 'work', verified: true, score: 60, name: 'OAK PLAZA LLC', source: 'permits' },
          ],
        }),
        contact('r2', {
          name: 'City Of Midland',
          enrichment: { phone: found, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'locked' } },
          phones: [{ number: '4325550300', type: 'landline', line: 'work', dnc: true, source: 'permits' }],
        }),
        contact('r3', { name: 'Vance Robert & Linda', company: undefined, phones: [{ number: '4325550400', type: 'mobile', source: 'tracerfy' }], enrichment: { phone: found, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'locked' } } }),
      ],
    };
    await render('/outreach/l1');
    const names = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"] td:nth-child(1)')).map((c) => c.firstChild!.textContent);
    const filters = document.body.querySelector('[aria-label="Filters"]')!;
    // Only the City's number is work and Do Not Call, so it isn't counted as a work number worth calling; the Vances' line says nothing about whose it is.
    expect(Array.from(filters.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['All', 'Has a signal 0', 'Ready to call 2', 'Personal number 1', 'Work number 1', 'Has email 0', 'Mail only 1', 'Status: All']);
    const first = document.body.querySelector('[data-testid="contact-row"]')!;
    expect(first.textContent).toContain('(432) 555-0100');
    expect(first.textContent).toContain('mobile · personal · verified');
    await click('Personal number');
    expect(names()).toEqual(['Oak Plaza LLC']);
    await click('Work number');
    expect(names()).toEqual(['Oak Plaza LLC']);
    await act(async () => (filters.querySelector('button') as HTMLButtonElement).click());
    // The sheet lists both lines with whose they are.
    await act(async () => (document.body.querySelector('[data-testid="contact-row"]') as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    const lines = Array.from(sheet.querySelectorAll('[data-testid="contact-details"] li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(lines.slice(0, 2)).toEqual(['(432) 555-0100mobile · personal · verifiedline in the name of REYES DANA', '(432) 555-0199landline · work · verifiedline in the name of OAK PLAZA LLC']);
    // The CSV: the first number's line in its own column, the others' in brackets.
    const { outreachCsv } = await import('../../components/outreach/outreachCsv');
    const csv = outreachCsv(contacts.rows as never);
    expect(csv.split('\n')[0]).toContain('Phone,Phone type,Phone line,DNC,Other phones');
    expect(csv.split('\n')[1]).toContain('(432) 555-0100,mobile,personal,,(432) 555-0199 (work)');
    expect(csv.split('\n')[2]).toContain('(432) 555-0300,landline,work,yes,');
  });

  it("the + button's Outreach list asks in plain words, shows the count and a preview, and Save opens the list", async () => {
    await render('/outreach?new=1');
    expect(path).toBe('/outreach');
    const dialog = document.body.querySelector('[role="dialog"][aria-label="New list"]')!;
    expect(dialog).not.toBeNull();
    // Three closed rows, not one pile of chips; a row opens to its lists, one row at a time.
    const headings = () => Array.from(dialog.querySelectorAll('[aria-label="Ready-made lists"] button[aria-expanded]')).map((b) => [b.textContent, b.getAttribute('aria-expanded')]);
    expect(headings()).toEqual([
      ['Commercial and investors6 lists', 'false'],
      ['Homeowners7 lists', 'false'],
      ['People who bring work4 lists', 'false'],
    ]);
    const chips = () => Array.from(dialog.querySelectorAll('[aria-label="Ready-made lists"] [role="group"]')).map((g) => [g.getAttribute('aria-label'), ...Array.from(g.querySelectorAll('button')).map((b) => b.textContent)]);
    expect(chips()).toEqual([]);
    await click('Commercial and investors');
    expect(chips()).toEqual([['Commercial and investors', 'Owners of 3+ commercial buildings', 'Shopping center owners', 'New businesses moving in', 'Apartment owners', 'Company investors with 5+ properties', 'Property managers']]);
    await click('Homeowners');
    expect(chips()).toEqual([['Homeowners', 'Code violations', 'Stalled permits', 'Landlords with 3+ rental homes', 'Owned 20+ years', 'Recent buyers', 'Absentee owners', 'Homes over $1M']]);
    await click('People who bring work');
    expect(chips()).toEqual([['People who bring work', 'Contractors pulling permits', 'Architects & engineers', 'Realtors', 'Homebuilders']]);
    await click('People who bring work');
    expect(chips()).toEqual([]);
    const ask = dialog.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => type(ask, 'shopping center owners in Midland'));
    await click('Build');
    // Asked for the county the sheet is on.
    expect(interpret).toHaveBeenCalledWith('o1', 'shopping center owners in Midland', 'Midland');
    const built = document.body.querySelector('[data-testid="built"]')!;
    expect(built.textContent).toContain('2 owners');
    // Which county, in so many words, before Save.
    expect(built.querySelector('[data-testid="built-county"]')!.textContent).toBe('in Midland County');
    expect(built.textContent).toContain('Owners of commercial buildings on the roll; no phone numbers.');
    expect(built.querySelectorAll('[aria-label="Preview"] li')).toHaveLength(2);
    expect(built.textContent).toContain('1 Main St, Dallas, TX, 75201');
    // Each row shows the owner's holdings, what the list is sorted on: one building's value, or how many properties and their total.
    const previewRows = Array.from(built.querySelectorAll('[aria-label="Preview"] li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(previewRows[0]).toContain('Oak Plaza LLC$3M');
    expect(previewRows[1]).toContain('City Of Midland4 properties · $300K');
    const title = built.querySelector('input#outreach-title') as HTMLInputElement;
    expect(title.value).toBe('Shopping center owners, Midland');
    await act(async () => type(title, 'Strip centers'));
    // Save: the sheet stays open, its button saying Saving…, until the new list is ready.
    let saved: (v: unknown) => void = () => {};
    create.mockImplementationOnce(() => new Promise((r) => (saved = r)) as never);
    await act(async () => button('Save list').click());
    expect(create).toHaveBeenCalledWith('o1', { county: 'Midland', who: 'commercial' }, 'Strip centers');
    expect(button('Saving…')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="built"]')).not.toBeNull();
    // Saved: its name and owners are read, then in one moment the sheet closes and the list is there whole.
    lists = [{ ...list, id: 'l9', title: 'Strip centers' }];
    contacts = twoContacts();
    await act(async () => saved({ listId: 'l9', rowCount: 2, added: 2, truncated: false }));
    expect(getContacts).toHaveBeenCalledWith('o1', 'l9');
    expect(path).toBe('/outreach/l9');
    expect(document.body.querySelector('[data-testid="built"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="list-picker"]')!.textContent).toBe('Strip centers2');
    expect(document.body.querySelectorAll('[data-testid="contact-row"]').length).toBe(2);
  });

  it('sends everyone showing to Leads at once, after asking; skipped owners and ones already in Leads stay out', async () => {
    lists = [list];
    contacts = {
      ...twoContacts(),
      rows: [
        contact('r1', { phones: [{ number: '4325550100', type: 'mobile', source: 'batchdata' }] }),
        contact('r2', { name: 'City Of Midland', emails: [{ email: 'clerk@midland.example', source: 'batchdata' }] }),
        contact('r3', { name: 'Skipped Co', status: 'skip' }),
        contact('r4', { name: 'Sent Co', status: 'lead', leadId: 'lead9' }),
        // Nothing to reach them by yet: waits for a lookup.
        contact('r5', { name: 'Not Looked Up Co' }),
        // Only a Do Not Call number: nothing to call either.
        contact('r6', { name: 'DNC Co', phones: [{ number: '4325550199', type: 'landline', dnc: true, source: 'batchdata' }] }),
        // Already a client: reachable through them.
        contact('r7', { name: 'Client Co', known: { kind: 'client', id: 'c1', name: 'Client Co' } }),
        // Matches a lead you already have (a list made after starting over): already in Leads, so not sent, nor counted as waiting.
        contact('r8', { name: 'City Of Midland', known: { kind: 'lead', id: 'lead1', name: 'City Of Midland' } }),
      ],
    };
    await render('/outreach/l1');
    // With owners still to find, sending waits under More.
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    const send = document.body.querySelector('[data-testid="send-all"]') as HTMLButtonElement;
    // The number is neither the list's size nor "Ready to call": the button says what it's made of.
    expect(send.textContent?.trim()).toBe('Send 3 to Leads1 with a number · 1 email only · 1 already a client');
    expect(send.querySelector('[data-testid="send-basis"]')!.textContent).toBe('1 with a number · 1 email only · 1 already a client');
    await act(async () => send.click());
    await flush();
    expect(document.body.textContent).toContain('Send 3 owners to Leads?');
    expect(document.body.textContent).toContain('Of the owners showing, 1 has a number to call, 1 has an email only, 1 is already your client.');
    expect(document.body.textContent).toContain('2 with no number or email yet stay here; look them up first, or send one from its card.');
    await click('Send to Leads');
    expect(sendManyToLeads).toHaveBeenCalledWith('o1', ['r1', 'r2', 'r7']);
    expect(document.body.querySelector('[data-testid="sent-note"]')!.textContent).toContain("1 new lead in Leads; 1 joined a related company's lead.");
    await click('Open Leads');
    expect(path).toBe('/leads');
  });

  it('a send of many can be taken back in one tap, after asking; leads already worked stay', async () => {
    lists = [list];
    contacts = { ...twoContacts(), lastSend: { at: '2026-11-07T22:58:00.000Z', leads: 125 } };
    await render('/outreach/l1');
    const line = () => document.body.querySelector('[data-testid="sent-note"]')!.textContent!;
    expect(line()).toContain('125 leads sent to Leads at');
    await click('Undo send');
    expect(document.body.textContent).toContain('Take back the 125 leads from this send?');
    await click('Take them back');
    expect(undoSend).toHaveBeenCalledWith('o1', '2026-11-07T22:58:00.000Z');
    expect(line()).toBe("Took back 120 leads; kept 5 you've already started on.");
    // Dismissed, it stays dismissed on this device.
    await act(async () => (document.body.querySelector('[data-testid="sent-note"] button[aria-label="Dismiss"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="sent-note"]')).toBeNull();
    expect(localStorage.getItem('outreach.sendSeen')).toBe('2026-11-07T22:58:00.000Z');

    // Left alone, "Took back…" goes by itself after a few seconds; the line about a send (with its Undo) does not.
    clearPage();
    localStorage.clear();
    jest.useFakeTimers();
    try {
      await render('/outreach/l1');
      await act(async () => void jest.advanceTimersByTime(20_000));
      expect(line()).toContain('125 leads sent to Leads at');
      await click('Undo send');
      await click('Take them back');
      expect(line()).toBe("Took back 120 leads; kept 5 you've already started on.");
      await act(async () => void jest.advanceTimersByTime(7_900));
      expect(line()).toContain('Took back 120 leads');
      await act(async () => void jest.advanceTimersByTime(200));
      expect(document.body.querySelector('[data-testid="sent-note"]')).toBeNull();
      expect(localStorage.getItem('outreach.sendSeen')).toBe('2026-11-07T22:58:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a ready-made list is one tap, run as written with no guessing; the words say what they cannot make and build the closest instead', async () => {
    interpreted = {
      ok: false,
      explanation: "The roll doesn't say what anyone does for a living.",
      suggestion: { definition: { county: 'Midland', who: 'wealthy', minValueCents: 150_000_000 }, title: 'Homes over $1.5M, Midland' },
    };
    await render('/outreach?new=1');
    // The county the lists are of, at the top: one for now, with room for more.
    const county = document.body.querySelector('[data-testid="county-switch"]') as HTMLButtonElement;
    expect(county.textContent).toBe('Midland County, TX');
    await act(async () => county.click());
    const menu = document.body.querySelector('[role="listbox"][aria-label="County"]')!;
    // Odessa's and Lubbock's counties are listed, coming soon: they can't be picked until their owners are in.
    expect(Array.from(menu.querySelectorAll('[role="option"]')).map((o) => [o.textContent, o.getAttribute('aria-selected'), (o as HTMLButtonElement).disabled])).toEqual([
      ['Midland County, TX', 'true', false],
      ['Ector County, TX (Odessa)Coming soon', 'false', true],
      ['Lubbock County, TXComing soon', 'false', true],
      ['Taylor County, TX (Abilene)Coming soon', 'false', true],
    ]);
    await act(async () => (menu.querySelector('[role="option"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[role="listbox"][aria-label="County"]')).toBeNull();
    // Open the row, tap the list: companies holding five or more, straight to the count, the assistant never asked.
    await click('Commercial and investors');
    await click('Company investors with 5+ properties');
    expect(preview).toHaveBeenCalledWith('o1', { county: 'Midland', who: 'investor', companyOwned: true, minParcels: 5 });
    expect(interpret).not.toHaveBeenCalled();
    // Built, the list has the sheet to itself: the count, a first look, the name and Save; the choices step aside.
    expect(document.body.querySelector('[aria-label="Ready-made lists"]')).toBeNull();
    let built = document.body.querySelector('[data-testid="built"]')!;
    expect(built.textContent).toContain('1 owner');
    expect(built.textContent).toContain('Companies holding five or more Midland properties, most first.');
    expect((document.body.querySelector('input#outreach-title') as HTMLInputElement).value).toBe('Company investors with 5+ properties, Midland');
    // Back to the choices with nothing picked: the list just looked at is let go, and its row says how many lists it holds.
    await click('Pick a different list');
    expect(document.body.querySelector('[aria-label="Ready-made lists"] button[aria-pressed="true"]')).toBeNull();
    // Back to the choices as they first were: every row closed, not the one the last list came from.
    expect(document.body.querySelector('[aria-label="Ready-made lists"] button[aria-expanded="true"]')).toBeNull();
    await click('Commercial and investors');
    expect(button('Commercial and investors').textContent).toBe('Commercial and investors6 lists');
    await click('People who bring work');
    await click('Contractors pulling permits');
    expect(preview).toHaveBeenLastCalledWith('o1', { county: 'Midland', who: 'contractor' });
    built = document.body.querySelector('[data-testid="built"]')!;
    expect(built.textContent).toContain('the phone and email on their permits come along free');
    expect((document.body.querySelector('input#outreach-title') as HTMLInputElement).value).toBe('Active contractors, Midland');
    await click('Pick a different list');
    await click('Homeowners');
    await click('Owned 20+ years');
    expect(preview).toHaveBeenLastCalledWith('o1', { county: 'Midland', who: 'long_owned', ownedForDays: 7305 });
    expect((document.body.querySelector('input#outreach-title') as HTMLInputElement).value).toBe('Homes owned 20+ years, Midland');
    // Something not on the chips goes to the assistant.
    await click('Pick a different list');
    await act(async () => type(document.body.querySelector('textarea') as HTMLTextAreaElement, 'dentists'));
    await click('Build');
    expect(document.body.querySelector('[aria-label="Ready-made lists"] button[aria-pressed="true"]')).toBeNull();
    const cannot = document.body.querySelector('[data-testid="cannot"]')!;
    expect(cannot.textContent).toContain("The roll doesn't say what anyone does for a living.");
    await click('Build the closest instead: Homes over $1.5M, Midland');
    expect(preview).toHaveBeenCalledWith('o1', { county: 'Midland', who: 'wealthy', minValueCents: 150_000_000 });
    expect(document.body.querySelector('[data-testid="built"]')!.textContent).toContain('1 owner');
    expect((document.body.querySelector('input#outreach-title') as HTMLInputElement).value).toBe('Homes over $1.5M, Midland');
    interpreted = { ok: true, definition: { county: 'Midland', who: 'commercial' }, title: 'x', explanation: 'y', count: 2, truncated: false, limited: false, preview: [] };
  });

  it('owners in two counties: All owners can be narrowed by county, each says where it is, and the lists are grouped by county', async () => {
    localStorage.removeItem('outreach.countyFilter');
    lists = [list, { ...list, id: 'l2', title: 'Odessa investors', definition: { county: 'Ector', who: 'investor' } }];
    contacts = {
      rows: [contact('r1'), contact('r2', { name: 'Permian Rentals LLC', company: 'Permian Rentals LLC', listIds: ['l2'] }), contact('r3', { name: 'Both Counties LP', company: 'Both Counties LP', listIds: ['l1', 'l2'] })],
      coverage: coverage(0, 0, 0, 3),
      ...money,
    };
    await render('/outreach');
    const names = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"]')).map((r) => r.querySelector('td')!.textContent);
    expect(names()).toHaveLength(3);
    // Each owner says where its property is: an owner on lists in both, both.
    expect(Array.from(document.body.querySelectorAll('[data-testid="place"]')).map((p) => p.textContent)).toEqual(['Midland', 'Odessa', 'Midland, Odessa']);
    // The county filter, with how many owners in each.
    const menu = document.body.querySelector('button[aria-label="County"]') as HTMLButtonElement;
    expect(menu.textContent).toBe('County: All');
    await act(async () => menu.click());
    expect(Array.from(document.body.querySelectorAll('[data-testid="county-filter-option"]')).map((o) => o.textContent)).toEqual(['All counties3', 'Midland County2', 'Ector County (Odessa)2']);
    await click('Ector County (Odessa)');
    expect(menu.textContent).toBe('County: Ector');
    expect(names().map((n) => n?.includes('Oak Plaza'))).toEqual([false, false]);
    expect(localStorage.getItem('outreach.countyFilter')).toBe('Ector');
    // A list is one county's: the filter isn't offered there, and the place isn't repeated.
    clearPage();
    await render('/outreach/l1');
    expect(document.body.querySelector('button[aria-label="County"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="place"]')).toBeNull();
    // The picker groups the lists by county.
    await act(async () => (document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement).click());
    expect(Array.from(document.body.querySelectorAll('[role="dialog"][aria-label="Lists"] h3')).map((h) => h.textContent)).toEqual(['Ector County (Odessa)', 'Midland County']);
    localStorage.removeItem('outreach.countyFilter');
  });

  it('owners emailed from Outreach: the state under the name, a Replied tab, and Email these in the menu', async () => {
    lists = [list];
    contacts = {
      rows: [
        contact('r1', { emails: [{ email: 'a@oakplaza.com', source: 'batchdata', verified: true }], email: { state: 'replied', at: '2026-11-10T18:00:00Z' } }),
        contact('r2', { name: 'City Of Midland', emails: [{ email: 'b@x.com', source: 'batchdata', verified: true }], email: { state: 'emailed', at: '2026-11-10T18:00:00Z' } }),
        contact('r3', { name: 'Garcia Maria', emails: [{ email: 'c@x.com', source: 'batchdata', verified: true }] }),
      ],
      coverage: coverage(0, 3, 0, 3),
      ...money,
    };
    await render('/outreach/l1');
    expect(Array.from(document.body.querySelectorAll('[data-testid="email-state"]')).map((e) => e.textContent)).toEqual(['Replied Nov 10', 'Emailed Nov 10']);
    expect(button('Replied')!.textContent).toBe('Replied 1');
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    // One of the three can still be emailed.
    expect(document.body.querySelector('[data-testid="email-these"]')!.textContent?.trim()).toBe('Email 1 owner');
  });

  it("an owner on an Odessa list: the property is in Odessa, and the deed link opens Ector's clerk to search the name", async () => {
    lists = [{ ...list, definition: { ...list.definition, county: 'Ector' } }];
    contacts = twoContacts();
    await render('/outreach/l1');
    await act(async () => (document.body.querySelectorAll('[data-testid="contact-row"]')[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    expect(Array.from(sheet.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'https://maps.apple.com/?q=1%20Main%20St%2C%20Dallas%2C%20TX%2075201',
      'https://maps.apple.com/?q=12%20Midkiff%20Rd%2C%20Odessa%2C%20TX',
      'https://ectorcountytx-web.tylerhost.net/web/',
    ]);
    expect(sheet.querySelector('[data-testid="deeds"]')!.textContent?.trim()).toBe('Deeds at the county clerk · search Oak Plaza LLC');
  });

  it('a contact opens to the decision-maker lookup, both addresses in Apple Maps, the unlock and a status; CSV exports the table', async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    await act(async () => (rows[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    const links = Array.from(sheet.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      'https://maps.apple.com/?q=1%20Main%20St%2C%20Dallas%2C%20TX%2075201',
      'https://maps.apple.com/?q=12%20Midkiff%20Rd%2C%20Midland%2C%20TX',
      'https://midland.tx.publicsearch.us/results?department=RP&limit=50&offset=0&searchOcrText=false&searchType=quickSearch&searchValue=Oak%20Plaza%20LLC',
    ]);
    expect(sheet.querySelector('[data-testid="deeds"]')!.textContent?.trim()).toBe('Deeds at the county clerk');
    // No balance: the unlock button adds funds (its tap opens the funding page); the free lookup of the person behind the company doesn't wait.
    expect(sheet.textContent).toContain('Balance $0.');
    await click('Add funds to unlock · $1');
    expect(openFundingPage).toHaveBeenCalledWith('o1');
    expect(enrich).not.toHaveBeenCalled();
    // The thing to do with the owner is in reach at the bottom of the sheet, however far it scrolls.
    expect(sheet.querySelector('[data-testid="sheet-actions"]')!.className).toContain('sticky bottom-0');
    expect(sheet.querySelector('[data-testid="sheet-actions"] [data-testid="to-leads"]')).not.toBeNull();
    await click('Find the person behind the company · free');
    expect(enrich).toHaveBeenCalledWith('o1', ['r1'], ['person'], undefined);
    await act(async () => type(sheet.querySelector('textarea#outreach-note') as HTMLTextAreaElement, 'Mailed Nov 5'));
    await click('Skip');
    expect(setStatus).toHaveBeenCalledWith('o1', 'r1', 'skip', 'Mailed Nov 5');
    expect(document.body.textContent).toContain('1 worked');
    expect(document.body.querySelector('[data-testid="contact-row"]')!.textContent).toContain('Skipped');
    // The status picker: New, In Leads, Skipped; nothing to track calls with here.
    await act(async () => (document.body.querySelector('button[aria-label="Status"]') as HTMLButtonElement).click());
    expect(Array.from(document.body.querySelectorAll('[role="menu"][aria-label="Status"] [role="menuitemradio"]')).map((o) => o.textContent)).toEqual(['All statuses', 'New', 'In Leads', 'Skipped']);
    // Picking one filters and says so on the button.
    await act(async () => (Array.from(document.body.querySelectorAll('[role="menuitemradio"]')).find((o) => o.textContent === 'Skipped') as HTMLButtonElement).click());
    expect((document.body.querySelector('button[aria-label="Status"]') as HTMLButtonElement).textContent).toBe('Status: Skipped');
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(1);
    await act(async () => (document.body.querySelector('button[aria-label="Status"]') as HTMLButtonElement).click());
    await act(async () => (Array.from(document.body.querySelectorAll('[role="menuitemradio"]')).find((o) => o.textContent === 'All statuses') as HTMLButtonElement).click());
    // The lists are one picker: All owners, then each list with how far it's got.
    await act(async () => (document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement).click());
    expect(Array.from(document.body.querySelectorAll('[data-testid="list-option"]')).map((o) => o.textContent)).toEqual(['Shopping center owners2 owners · 1 worked']);
    await act(async () => (document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement).click());

    // The CSV, for a mail merge.
    const made: string[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
      made.push(b.type);
      return 'blob:x';
    };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    const clicks: string[] = [];
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await click('Export CSV');
    expect(made).toEqual(['text/csv']);
    expect(clicks).toEqual(['shopping-center-owners.csv']);
  });

  it('a realtor has no property: the table shows the brokerage in its place, the sheet says so, the card and the CSV cope, and search finds the brokerage', async () => {
    lists = [{ ...list, id: 'l2', title: 'Realtors', who: 'realtor', definition: { county: 'Midland', who: 'realtor' }, rowCount: 1 }];
    const realtor = contact('r3', {
      name: 'Elena Rivera',
      company: 'Fathom Realty, LLC',
      mailing: { city: 'Midland', state: 'TX' },
      property: undefined,
      properties: 0,
      totalValueCents: 0,
      why: 'Sales agent with Fathom Realty, LLC since Mar 2021, licensed since 2016; license through Sep 2027',
      kinds: ['realtor'],
      listIds: ['l2'],
      person: { name: 'Elena Rivera', title: 'Sales agent, TREC license 700001', source: 'trec' },
      enrichment: { phone: { status: 'locked' }, email: { status: 'locked' }, person: { status: 'found', source: 'trec' }, research: { status: 'locked' } },
    });
    contacts = { rows: [realtor], coverage: coverage(0, 0, 1, 1), ...money };
    await render('/outreach/l2');
    const row = document.body.querySelector('[data-testid="contact-row"]')!;
    expect(row.textContent).toContain('Elena Rivera');
    expect(row.textContent).toContain('Fathom Realty, LLC');
    expect(row.textContent).toContain('Realtor');
    await act(async () => (row as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Elena Rivera"]')!;
    expect(sheet.textContent).toContain('Owns nothing on the roll; works with Fathom Realty, LLC.');
    expect(sheet.querySelector('[data-testid="deeds"]')).toBeNull();
    // No street to map: the state withholds it, so there is no Apple Maps link at all.
    expect(sheet.textContent).toContain('The state withholds addresses for license holders');
    expect(Array.from(sheet.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([]);
    // The CSV leaves the property columns blank rather than failing.
    const made: string[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
      made.push(b.type);
      return 'blob:x';
    };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await click('Export CSV');
    expect(made).toEqual(['text/csv']);
    // Search by the brokerage.
    await act(async () => type(document.body.querySelector('input[type="search"]') as HTMLInputElement, 'fathom'));
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(1);
    await act(async () => type(document.body.querySelector('input[type="search"]') as HTMLInputElement, 'midkiff'));
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(0);
  });

  it('one Look up runs the whole list, $1 a phone from the balance with an estimate; found rows show the person, the ranked phone with its flags, and the email', async () => {
    lists = [list];
    contacts = { ...twoContacts(), balanceCents: 500 };
    await render();
    // No checkboxes: the buttons up top act on everyone the list still needs.
    expect(document.body.querySelector('[data-testid="contact-row"] input[type="checkbox"]')).toBeNull();
    expect(button('Find phones & emails (2)').title).toBe('up to $2');
    // Up top, two buttons told apart by color (blue to find, violet for AI) and More; the list's name is the title beside them.
    const actions = document.body.querySelector('[data-testid="actions"]')!;
    expect(Array.from(actions.querySelectorAll(':scope > button, :scope > div > button')).map((b) => b.textContent?.trim() || b.getAttribute('aria-label'))).toEqual(['Find phones & emails (2)', 'Research with AI (2)', 'More']);
    expect(button('Find phones & emails (2)').className).toContain('bg-[#336699]');
    expect(button('Research with AI (2)').className).toContain('violet');
    expect(button('Research with AI (2)').title).toBe('AI reads the web for what each owner does and any plans to build or sell · $0.25 an answer, charged only when it finds something');
    const found = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'batchdata' };
    contacts = {
      rows: [
        contact('r1', {
          enrichment: {
            phone: { ...found, chargedCents: 100, tries: [{ source: 'batchdata', outcome: 'hit', note: '2 numbers' }, { source: 'tracerfy', outcome: 'skipped', note: 'Not needed, already found' }] },
            email: { ...found, tries: [{ source: 'batchdata', outcome: 'hit', note: '1 email' }, { source: 'tracerfy', outcome: 'skipped', note: 'Not needed, already found' }] },
            person: { ...found, source: 'tx-comptroller', tries: [{ source: 'tx-comptroller', outcome: 'hit', note: 'Dana Reyes, Manager' }] },
          },
          person: { name: 'Dana Reyes', title: 'Manager', address: '1 MAIN ST STE 400, DALLAS, TX, 75201', source: 'tx-comptroller', confirmedBy: ['permits'] },
          phones: [
            { number: '4325550100', type: 'mobile', verified: true, score: 95, source: 'batchdata', name: 'REYES DANA' },
            { number: '4325550199', type: 'landline', dnc: true, source: 'batchdata' },
            { number: '4325550177', type: 'mobile', verified: true, grade: 'C', litigator: true, source: 'batchdata' },
          ],
          emails: [{ email: 'dana@oakplaza.com', source: 'batchdata', verified: true, nameMatch: true, grade: 'B' }],
        }),
        contact('r2', {
          name: 'City Of Midland',
          enrichment: {
            // Mid-lookup: the person step is asking the Comptroller; the phone step already has a hit and is checking the lines.
            phone: { status: 'running', at: '2026-11-05T15:00:00Z', asking: 'trestle', tries: [{ source: 'permits', outcome: 'skipped', note: 'No permits' }, { source: 'batchdata', outcome: 'hit', note: '2 numbers' }] },
            email: { status: 'running', at: '2026-11-05T15:00:00Z' },
            person: { status: 'running', at: '2026-11-05T15:00:00Z', asking: 'tx-comptroller', tries: [{ source: 'roll', outcome: 'miss', note: 'No match' }] },
          },
        }),
      ],
      coverage: coverage(1, 1, 1),
      ...money,
      balanceCents: 400,
      phoneHitRate: 0.5,
    };
    // After a word on the cost, everyone still locked on the list.
    await click('Find phones & emails (2)');
    expect(document.body.textContent).toContain('2 phones to find: up to $2.');
    await click('Find them');
    expect(enrich).toHaveBeenCalledWith('o1', ['r1', 'r2'], undefined, undefined);
    // The bar along the bottom: the lookup started here, owners done, what's been found, what it has cost.
    expect(document.body.querySelector('[data-testid="lookup-progress"]')!.textContent).toBe('Looking up 2 owners · 1 done1 phone · 1 email · 1 person · $1 so far');
    expect(localStorage.getItem('outreach.batch')).toBe('{"at":"2026-11-05T15:00:00Z"}');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(cells(0)[1]).toBe('Dana ReyesManager · 2 sources agree');
    // The other numbers are counted in words, and a tap on the count shows them in the row, without opening the sheet.
    expect(cells(0).slice(2, 4)).toEqual(['(432) 555-0100+2 moremobile · verified', 'dana@oakplaza.comverified']);
    const morePhones = rows[0].querySelector('[data-testid="more-phones"]') as HTMLButtonElement;
    expect(morePhones.getAttribute('aria-expanded')).toBe('false');
    await act(async () => morePhones.click());
    expect(Array.from(rows[0].querySelectorAll('[data-testid="other-phone"]')).map((x) => x.textContent)).toEqual(['(432) 555-0199landline · DNC', '(432) 555-0177mobile · verified · litigator']);
    expect(morePhones.textContent).toBe('show less');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => morePhones.click());
    expect(rows[0].querySelectorAll('[data-testid="other-phone"]')).toHaveLength(0);
    // A running cell says what it's doing, and the last thing it found.
    // One not picked up yet, asked a while ago, says it's waiting its turn rather than "Starting" forever.
    expect(cells(1).slice(1, 4)).toEqual(['Asking the Texas Comptroller…1 source checked', 'Checking the lines…2 numbers', 'Waiting its turn…']);
    // Nobody here has research, so it takes no column.
    expect(cells(0)).toHaveLength(9);
    expect(document.body.querySelector('thead')!.textContent).toContain('1 / 2 · 1 source');
    // Nothing left to look up on the list: the top-right button is gone.
    expect(button('Find phones & emails')).toBeUndefined();
    await act(async () => (rows[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('Dana Reyes · Manager');
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('From Texas Comptroller · also named by city permits');
    const links = Array.from(sheet.querySelectorAll('[data-testid="contact-details"] a')).map((a) => a.getAttribute('href'));
    // The DNC landline and the litigator's mobile are shown but never dialled from here; Call, Text and Email go to the best clear mobile and the email.
    // Email drafts one from Outreach (the AI writes, you approve, it goes from your Gmail) rather than opening the mail app.
    expect(links).toEqual(['tel:4325550100', 'mailto:dana@oakplaza.com', 'tel:4325550100', 'sms:4325550100']);
    expect(sheet.querySelector('[data-testid="email-owner"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="reach"]')!.textContent?.replace(/\s+/g, '')).toBe('CallTextEmail');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0100mobile · verifiedline in the name of REYES DANA');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0199landline · DNCon the Do Not Call list');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0177mobile · verified · litigatorknown TCPA litigator');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain("dana@oakplaza.com verified · in the owner's name");
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('From BatchData Nov 5 · $1');
    // The ledger: every source's turn per step, and the owner's cost.
    const how = sheet.querySelector('[data-testid="how-found"]')!.textContent!;
    expect(how).toContain('This owner cost $1.');
    expect(how).toContain('1Person behind the companyFound · freeTexas ComptrollerDana Reyes, Manager');
    expect(how).toContain('2PhoneFound · $1BatchData2 numbersTracerfyNot needed, already found');
    expect(how).toContain('3EmailFound · freeBatchData1 emailTracerfyNot needed, already found');
  });

  it('research: the sheet asks a question for 25¢, and a found answer shows with its sources', async () => {
    lists = [list];
    contacts = {
      ...twoContacts(),
      balanceCents: 300,
      rows: [
        contact('r1'),
        contact('r2', {
          name: 'City Of Midland',
          enrichment: { phone: { status: 'locked' }, email: { status: 'locked' }, person: { status: 'locked' }, research: { status: 'found', at: '2026-11-05T15:01:00Z', source: 'claude', chargedCents: 25 } },
          research: { question: 'Who is this owner?', answer: 'The City of Midland owns the lot; a parks bond passed in 2026.', sources: [{ title: 'Midland parks bond', url: 'https://example.com/bond' }], at: '2026-11-05T15:01:00Z' },
        }),
      ],
    };
    await render();
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    // Research is a badge on the owner that has some, and with any in the view it gets a column again, last, to read down.
    expect(rows[1].querySelector('[data-testid="research-badge"]')!.textContent).toBe('Research');
    expect(rows[0].querySelector('[data-testid="research-badge"]')).toBeNull();
    expect(Array.from(document.body.querySelectorAll('thead th')).at(-1)!.textContent).toContain('Research');
    expect(Array.from(rows[1].querySelectorAll('td')).at(-1)!.textContent).toBe('The City of Midland owns the lot; a parks bond passed in 2026.');
    await act(async () => (rows[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    const box = sheet.querySelector('textarea[aria-label="Research question"]') as HTMLTextAreaElement;
    expect(box.value).toBe(money.researchQuestion);
    await act(async () => type(box, 'Any renovation planned?'));
    await click('Research · $0.25');
    expect(enrich).toHaveBeenCalledWith('o1', ['r1'], ['research'], 'Any renovation planned?');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement | null)?.click());
    await act(async () => (rows[1] as HTMLTableRowElement).click());
    const city = document.body.querySelector('[role="dialog"][aria-label="City Of Midland"]')!;
    const research = city.querySelector('[data-testid="research"]')!;
    expect(research.textContent).toContain('Who is this owner?');
    expect(research.textContent).toContain('a parks bond passed in 2026.');
    expect(research.querySelector('a')!.getAttribute('href')).toBe('https://example.com/bond');
    expect(research.textContent).toContain('Read Nov 5 · $0.25');
  });

  it('a simulated lookup says so on the row and in How we found it, and costs nothing', async () => {
    lists = [list];
    const sim = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'tracerfy', simulated: true, tries: [{ source: 'batchdata', outcome: 'miss', note: 'No match' }, { source: 'tracerfy', outcome: 'hit', note: '1 number' }] };
    contacts = {
      ...twoContacts(),
      rows: [contact('r1', { phones: [{ number: '4325550142', type: 'mobile', source: 'tracerfy' }], enrichment: { phone: sim, email: { status: 'none', simulated: true }, person: { status: 'locked' }, research: { status: 'locked' } } }), contact('r2', { name: 'City Of Midland' })],
    };
    await render('/outreach/l1');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    // Every result on the page is simulated: said once over the table, with a word on what real sources will do, not on each row.
    expect(document.body.querySelector('[data-testid="sample-note"]')!.textContent).toContain('Expect real sources to find fewer.');
    expect(document.body.querySelector('[data-testid="simulated"]')).toBeNull();
    // Once some results are real, each simulated row says which it is.
    const real = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'tx-comptroller' };
    await act(async () => pushContacts({ rows: [(contacts.rows as unknown[])[0], contact('r2', { name: 'City Of Midland', person: { name: 'Sam Ortiz', source: 'tx-comptroller' }, enrichment: { phone: { status: 'locked' }, email: { status: 'locked' }, person: real, research: { status: 'locked' } } })] }));
    expect(rows[0].querySelector('[data-testid="simulated"]')!.textContent).toBe('Simulated');
    expect(rows[1].querySelector('[data-testid="simulated"]')).toBeNull();
    await act(async () => (rows[0] as HTMLElement).click());
    await flush();
    const how = document.body.querySelector('[data-testid="how-found"]')!;
    expect(how.querySelector('[data-testid="simulated-note"]')!.textContent).toContain('Nothing was charged.');
    expect(how.textContent).toContain('Found · simulated');
    expect(how.textContent).toContain('This owner cost $0.');
  });

  it('a "none found" can be tried again once a month has passed, from the table, and any time from the sheet; the bulk lookup leaves recent ones alone', async () => {
    lists = [list];
    const none = (at: string) => ({ status: 'none', at, source: undefined, tries: [{ source: 'batchdata', outcome: 'miss', note: 'No match' }] });
    const old = '2026-01-05T15:00:00Z';
    const recent = new Date().toISOString();
    const looked = (at: string) => ({ phone: none(at), email: none(at), person: { status: 'found', at, source: 'tx-comptroller' }, research: { status: 'locked' } });
    contacts = { ...twoContacts(), balanceCents: 500, rows: [contact('r1', { enrichment: looked(old) }), contact('r2', { name: 'City Of Midland', enrichment: looked(recent) })] };
    await render('/outreach/l1');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    const phoneCell = (i: number) => rows[i].querySelectorAll('td')[2];
    // A miss is a quiet dash (read out as "None found"), with Try again beside it once a month has passed.
    expect(phoneCell(0).textContent).toBe('—Try again');
    expect(phoneCell(1).textContent).toBe('—');
    expect(phoneCell(1).querySelector('[data-testid="nothing"]')!.getAttribute('aria-label')).toBe('None found');
    // Only the month-old one is still open to the list's Look up; the fresh "none" isn't asked again.
    expect(button('Find phones & emails').textContent).toContain('Find phones & emails (1)');
    await act(async () => (phoneCell(0).querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r1'], ['phone'], undefined);
    // The sheet offers it any time, and says when the sources will have refreshed.
    await act(async () => (rows[1] as HTMLElement).click());
    await flush();
    const again = document.body.querySelector('[data-testid="try-again"]') as HTMLButtonElement;
    expect(again.textContent?.trim()).toBe('Try again · $1 only if a phone is found');
    expect(document.body.textContent).toContain('a new try is most likely to turn something up after');
    await act(async () => again.click());
    await flush();
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r2'], ['phone', 'email'], undefined);
  });

  it('a capped list says how many it reaches and loads the next page on request', async () => {
    lists = [{ ...list, title: 'Real estate investors', who: 'investor', definition: { county: 'Midland', who: 'investor' }, rowCount: 500, total: 2340 }];
    contacts = twoContacts();
    await render('/outreach/l1');
    const total = document.body.querySelector('[data-testid="list-total"]')!;
    expect(total.textContent?.replace(/\s+/g, ' ').trim()).toBe('· 500 of 2,340 loaded Load the next 500');
    // An investor list is already most parcels first, so a tap on Name goes straight to A to Z and back.
    const sortLine = () => document.body.querySelector('[data-testid="name-sort"]')!.textContent;
    expect(sortLine()).toBe('NameMost parcels first');
    await act(async () => (document.body.querySelector('[data-testid="name-sort"]') as HTMLButtonElement).click());
    expect(sortLine()).toBe('NameA–Z');
    await act(async () => (document.body.querySelector('[data-testid="name-sort"]') as HTMLButtonElement).click());
    expect(sortLine()).toBe('NameMost parcels first');
    await click('Load the next 500');
    expect(extend).toHaveBeenCalledWith('o1', 'l1');
    // The lists and contacts are read again once the page has loaded.
    expect((getContacts.mock.lastCall as unknown[] | undefined)?.slice(0, 2)).toEqual(['o1', 'l1']);
    // A list that already holds everyone it reaches says nothing about a cap.
    clearPage();
    lists = [{ ...list, rowCount: 2, total: 2 }];
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="list-total"]')).toBeNull();
  });

  it('a list that picked up owners on its own says how many are new and since when; a tap shows just them, another shows all', async () => {
    // Two owners joined on Nov 9 (one already among the company's owners since October); one was there from the start.
    lists = [{ ...list, rowCount: 3, fresh: { since: '2026-11-09T09:15:00.000Z', count: 2 } }];
    contacts = {
      ...twoContacts(),
      rows: [
        contact('r1', { joinedAt: '2026-11-05T15:00:00.000Z', createdAt: '2026-11-05T15:00:00.000Z' }),
        contact('r2', { name: 'Loop Plaza LP', joinedAt: '2026-11-09T09:15:02.000Z', createdAt: '2026-11-09T09:15:02.000Z' }),
        contact('r3', { name: 'Wadley Center LLC', joinedAt: '2026-11-09T09:15:03.000Z', createdAt: '2026-10-01T10:00:00.000Z' }),
      ],
    };
    await render('/outreach/l1');
    const names = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"]')).map((r) => r.querySelector('td')!.textContent);
    expect(names()).toHaveLength(3);
    const chip = () => document.body.querySelector('[data-testid="new-owners"]') as HTMLButtonElement;
    expect(chip().textContent).toBe('2 new since Nov 9');
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    await act(async () => chip().click());
    expect(names().join('|')).toContain('Loop Plaza LP');
    expect(names().join('|')).toContain('Wadley Center LLC');
    expect(names()).toHaveLength(2);
    expect(chip().textContent).toBe('Showing the 2 new since Nov 9 · show all');
    await act(async () => chip().click());
    expect(names()).toHaveLength(3);
    // The picker says so too.
    await act(async () => (document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement).click());
    expect(document.body.textContent).toContain('3 owners · 2 new · 0 worked');
    // A list that picked up nobody lately has no such line.
    clearPage();
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="new-owners"]')).toBeNull();
  });

  it("a list's numbers: the page asks for a count when it opens and after owners change, and shows the numbers as they land on the list", async () => {
    jest.useFakeTimers();
    try {
      lists = [list];
      contacts = twoContacts();
      tally.mockClear();
      await render('/outreach/l1');
      expect(tally).toHaveBeenCalledTimes(1);
      expect(tally).toHaveBeenCalledWith('o1');
      expect(document.body.textContent).toContain('0 worked');
      // An owner changed (skipped on another device): a few seconds on, the page asks for the count again.
      await act(async () => pushChanges!({ rows: [contact('r1', { status: 'skip' })], balanceCents: 0, freeLookups: 0, reload: false, upTo: '2026-11-05T15:00:05.000Z' }));
      expect(tally).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(tally).toHaveBeenCalledTimes(2);
      // The count lands on the list, and the page shows it.
      await act(async () => pushLists!([{ ...list, done: 1 }]));
      expect(document.body.textContent).toContain('1 worked');
    } finally {
      jest.useRealTimers();
    }
  });

  it('while the owners are being read the page shows the shape of the table to come, not a bare "Loading"', async () => {
    lists = [list];
    let finish: (c: unknown) => void = () => {};
    getContacts.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await render('/outreach/l1');
    const waiting = document.body.querySelector('[data-testid="loading-rows"]')!;
    expect(waiting.getAttribute('role')).toBe('status');
    expect(waiting.getAttribute('aria-label')).toBe('Loading owners');
    expect(document.body.textContent).not.toContain('Loading…Loading');
    await act(async () => finish(twoContacts()));
    await flush();
    expect(document.body.querySelector('[data-testid="loading-rows"]')).toBeNull();
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(2);
  });

  it('a long view arrives a page at a time: its first owners show while the rest are read, and the find button waits for all of them', async () => {
    lists = [list];
    const full = twoContacts();
    let finish: (c: unknown) => void = () => {};
    getContacts.mockImplementationOnce(async (...args: unknown[]) => {
      // The first page: one owner so far.
      (args[2] as (c: unknown) => void)({ ...full, rows: [full.rows[0]], partial: true });
      return await new Promise((resolve) => (finish = resolve));
    });
    await render('/outreach/l1');
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(1);
    const find = () => document.body.querySelector('[data-testid="find-all"]') as HTMLButtonElement;
    expect(find().textContent).toBe('Loading owners…');
    expect(find().disabled).toBe(true);
    // The rest arrive: everyone shows, and the button covers them all.
    await act(async () => finish(full));
    await flush();
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(2);
    expect(find().disabled).toBe(false);
    expect(find().textContent).not.toBe('Loading owners…');
    // Opened again with the view already there: it stays whole while it's read again (no first-owners-only flash).
    await act(async () => pushChanges!({ rows: [], balanceCents: 0, freeLookups: 0, removedAt: 'later', reload: true, upTo: '2026-11-05T15:00:05.000Z' }));
    await flush();
    expect((getContacts.mock.lastCall as unknown[])[2]).toBeUndefined();
  });

  it('the live feed: owners removed elsewhere, or more changed than one answer carries, and the page reads its view again and listens from there', async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    const reads = getContacts.mock.calls.length;
    const listens = watchChanges.mock.calls.length;
    // An ordinary change: put in place, no read.
    await act(async () => pushChanges!({ rows: [contact('r1', { note: 'Gate code 4411' })], balanceCents: 0, freeLookups: 0, reload: false, upTo: '2026-11-05T15:00:05.000Z' }));
    expect(getContacts.mock.calls.length).toBe(reads);
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(2);
    // A list deleted on another device took an owner: the feed only says owners were removed, so the view is read again.
    contacts = { ...twoContacts(), rows: [contact('r1')], asOf: '2026-11-05T15:10:00.000Z', removedAt: '2026-11-05T15:09:00.000Z' };
    await act(async () => pushChanges!({ rows: [], balanceCents: 0, freeLookups: 0, removedAt: '2026-11-05T15:09:00.000Z', reload: false, upTo: '2026-11-05T15:00:05.000Z' }));
    await flush();
    expect(getContacts.mock.calls.length).toBe(reads + 1);
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(1);
    expect(watchChanges).toHaveBeenLastCalledWith('o1', '2026-11-05T15:09:50.000Z', expect.any(Function), expect.any(Function));
    // The same stamp again changes nothing.
    await act(async () => pushChanges!({ rows: [], balanceCents: 0, freeLookups: 0, removedAt: '2026-11-05T15:09:00.000Z', reload: false, upTo: '2026-11-05T15:10:00.000Z' }));
    await flush();
    expect(getContacts.mock.calls.length).toBe(reads + 1);
    // Too much changed for one answer: read again.
    await act(async () => pushChanges!({ rows: [], balanceCents: 0, freeLookups: 0, removedAt: '2026-11-05T15:09:00.000Z', reload: true, upTo: '2026-11-05T15:10:00.000Z' }));
    await flush();
    expect(getContacts.mock.calls.length).toBe(reads + 2);
    expect(watchChanges.mock.calls.length).toBe(listens + 2);
  });

  it("a new company's first phones are free: the fresh list says what is there and what phones cost, and with no balance the button finds the free ones", async () => {
    lists = [{ ...list, rowCount: 2, total: 2 }];
    contacts = { ...twoContacts(), balanceCents: 0, freeLookups: 5 };
    await render('/outreach/l1');
    // Nobody looked up yet: the note in place of a wall of padlocks with no word.
    expect(document.body.querySelector('[data-testid="fresh-note"]')!.textContent).toBe(
      'Every owner comes with their name, mailing address and property. Phone numbers are looked up when you ask: $1 each, only when one is found, and your first 5 are free. Emails and the person behind a company are free.',
    );
    // No balance, but not "Add funds": the free ones cover both owners.
    const find = document.body.querySelector('[data-testid="find-all"]') as HTMLButtonElement;
    expect(find.textContent).toBe('Find phones & emails (2)');
    await act(async () => find.click());
    expect(document.body.textContent).toContain('2 phones to find: free (2 of your 5 free lookups).');
    await click('Find them');
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r1', 'r2'], undefined, undefined);

    // One free lookup left, two owners, no balance: the button offers the one, and looks up the first owner only.
    clearPage();
    jest.clearAllMocks();
    contacts = { ...twoContacts(), balanceCents: 0, freeLookups: 1 };
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="fresh-note"]')!.textContent).toContain('and you have 1 free one left.');
    expect(document.body.querySelector('[data-testid="find-all"]')!.textContent).toBe('Find 1 phone free');
    await act(async () => (document.body.querySelector('[data-testid="find-all"]') as HTMLButtonElement).click());
    expect(document.body.textContent).toContain('Find a phone free?');
    await click('Find them');
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r1'], undefined, undefined);
    // The owner's own sheet says its lookup is free too.
    await act(async () => (document.body.querySelectorAll('[data-testid="contact-row"]')[1] as HTMLElement).click());
    await flush();
    expect(document.body.querySelector('[data-testid="unlock-terms"]')!.textContent).toBe('Your last free lookup, used only if a phone is found. After it, $1 a phone.');

    // None left and no balance: add funds, as before; and the note says only the price.
    clearPage();
    contacts = { ...twoContacts(), balanceCents: 0, freeLookups: 0 };
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="find-all"]')!.textContent).toBe('Add funds to find phones & emails (2)');
    expect(document.body.querySelector('[data-testid="fresh-note"]')!.textContent).toContain('$1 each, only when one is found. Emails');
  });

  it('finding phones & emails on a list with owners not loaded yet asks to load them first, or covers just the loaded ones', async () => {
    lists = [{ ...list, rowCount: 2, total: 3 }];
    contacts = { ...twoContacts(), balanceCents: 1000 };
    await render('/outreach/l1');
    // Load all first: the list's next page, read again, then the cost covers all three.
    extend.mockImplementationOnce(async () => {
      contacts = { ...contacts, rows: [...contacts.rows, contact('r3', { key: 'k-3', name: 'Third Owner LLC' })] };
      lists = [{ ...list, rowCount: 3, total: 3 }];
      return { loaded: 1, added: 1, rowCount: 3, total: 3, truncated: false };
    });
    await click('Find phones & emails (2)');
    expect(document.body.textContent).toContain("1 owner on “Shopping center owners” isn't loaded yet");
    expect(document.body.textContent).toContain('Finding phones & emails now covers the 2 loaded.');
    await click('Load all 3 first');
    expect(extend).toHaveBeenCalledTimes(1);
    expect((getContacts.mock.lastCall as unknown[] | undefined)?.slice(0, 2)).toEqual(['o1', 'l1']);
    expect(document.body.textContent).toContain('Find phones & emails for the 3 owners on “Shopping center owners”?');
    await click('Find them');
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r1', 'r2', 'r3'], undefined, undefined);

    // Just these: no loading, straight to the cost for the ones on screen.
    clearPage();
    jest.clearAllMocks();
    lists = [{ ...list, rowCount: 2, total: 40 }];
    contacts = { ...twoContacts(), balanceCents: 1000 };
    await render('/outreach/l1');
    await click('Find phones & emails (2)');
    expect(document.body.textContent).toContain("38 owners on “Shopping center owners” aren't loaded yet");
    await click('Just these 2');
    expect(extend).not.toHaveBeenCalled();
    await click('Find them');
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r1', 'r2'], undefined, undefined);

    // A list holding everyone it reaches: no extra question.
    clearPage();
    jest.clearAllMocks();
    lists = [{ ...list, rowCount: 2, total: 2 }];
    await render('/outreach/l1');
    await click('Find phones & emails (2)');
    expect(document.body.textContent).toContain('Find phones & emails for the 2 owners on “Shopping center owners”?');
  });

  it('the bulk buttons cover what the page is showing: with a tab or a search on, Find phones and Research act on just those owners and say so', async () => {
    const three = () => ({
      ...twoContacts(),
      rows: [...twoContacts().rows, contact('r3', { name: 'Vance Robert & Linda', company: undefined, mailing: { address: '9 ELM ST', city: 'ODESSA', state: 'TX', zip: '79761' } })],
      balanceCents: 1000,
    });
    // A list with more owners than are loaded: without a filter the button would first ask about loading the rest.
    lists = [{ ...list, rowCount: 3, total: 40 }];
    contacts = three();
    await render('/outreach/l1');
    expect(button('Find phones & emails').textContent).toBe('Find phones & emails (3)');
    expect(button('Research with AI').textContent).toBe('Research with AI (3)');

    // A tab: the one owner with a signal. Both buttons count just that owner and say "showing".
    await click('Has a signal');
    expect(button('Find phones & emails').textContent).toBe('Find phones & emails (1 showing)');
    expect(button('Find phones & emails').title).toBe('up to $1');
    expect(button('Research with AI').textContent).toBe('Research with AI (1 showing)');
    // The ask names who it covers and who it leaves out, with no question about owners not loaded yet.
    await click('Find phones & emails (1 showing)');
    expect(document.body.textContent).not.toContain('loaded yet');
    expect(document.body.textContent).toContain('Find phones & emails for the 1 owner showing?');
    expect(document.body.textContent).toContain('Only the owners the page is showing now (1 of 3 on this list). 1 phone to find');
    await click('Find them');
    expect(extend).not.toHaveBeenCalled();
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r2'], undefined, undefined);

    // Research, the same way.
    clearPage();
    jest.clearAllMocks();
    contacts = three();
    await render('/outreach/l1');
    await click('Has a signal');
    await click('Research with AI (1 showing)');
    expect(document.body.textContent).toContain('Research the 1 owner showing with AI?');
    expect(document.body.textContent).toContain('Only the owners the page is showing now (1 of 3 on this list). AI reads the web');
    expect(document.body.textContent).toContain('$0.25 at most');
    await click('Research them');
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r2'], ['research'], undefined);

    // A search narrows them too; clearing it puts the buttons back on the whole list, with its question about the rest.
    clearPage();
    jest.clearAllMocks();
    contacts = three();
    await render('/outreach/l1');
    const search = () => document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    await act(async () => type(search(), 'elm'));
    expect(button('Find phones & emails').textContent).toBe('Find phones & emails (1 showing)');
    await click('Find phones & emails (1 showing)');
    await click('Find them');
    expect(enrich).toHaveBeenLastCalledWith('o1', ['r3'], undefined, undefined);
    clearPage();
    jest.clearAllMocks();
    contacts = three();
    await render('/outreach/l1');
    await act(async () => type(search(), 'elm'));
    await act(async () => type(search(), ''));
    expect(button('Find phones & emails').textContent).toBe('Find phones & emails (3)');
    await click('Find phones & emails (3)');
    expect(document.body.textContent).toContain("37 owners on “Shopping center owners” aren't loaded yet");
  });

  it("today's calls: the page says how many there are, and the sheet lists follow-ups due, leads not called yet and new numbers, each worked from its card", async () => {
    const found = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'tracerfy' };
    const ready = (id: string, name: string, over: Record<string, unknown> = {}) =>
      contact(id, { name, company: name, phones: [{ number: '4325550100', type: 'mobile', source: 'tracerfy' }], enrichment: { phone: found, email: { status: 'none' }, person: { status: 'none' }, research: { status: 'locked' } }, ...over });
    const sheet = () => ({
      day: localDay(),
      followUps: [
        { id: 'L1', name: 'Dana Reyes', company: 'Reyes Roofing', phone: '4325550111', place: '12 Main St, Midland', status: 'contacted', followUpDate: localDay(-3), calls: 2, lastContactAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), note: 'Nov 8: wants metal, call back', source: 'Outreach', createdAt: '2026-11-01T15:00:00Z' },
        { id: 'L2', name: 'Sam Ortiz', phone: '+14325550112', status: 'quoted', followUpDate: localDay(), calls: 0, createdAt: '2026-11-02T15:00:00Z' },
      ],
      followUpCount: 2,
      uncalled: [{ id: 'L3', name: 'Pat New', email: 'pat@example.com', phone: '4325550113', status: 'new', calls: 0, source: 'Website', createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString() }],
      uncalledCount: 1,
      fresh: [ready('r1', 'Oak Plaza LLC', { signals: [{ kind: 'code_violation', date: '2026-09-14', detail: 'High weeds', fresh: true }] }), ready('r2', 'City Of Midland')],
      freshCount: 2,
      freshCapped: false,
      days: 7,
      simulating: false,
    });
    lists = [list];
    contacts = twoContacts();
    todaySheet = sheet();
    await render('/outreach/l1');
    // The page's own line, read with the device's date; a tap opens the sheet, remembering the list it came from.
    expect(getToday).toHaveBeenCalledWith('o1', localDay());
    const banner = document.body.querySelector('[data-testid="today-banner"]') as HTMLButtonElement;
    expect(banner.textContent).toBe('5 to call today · 2 follow-ups due · 1 new lead · 2 new numbersOpen ');
    await act(async () => banner.click());
    await flush();
    expect(path).toBe('/outreach?today=1&from=l1');
    expect(document.body.querySelector('h1')!.textContent).toBe("Today's calls");
    expect(document.body.querySelector('[data-testid="today-summary"]')!.textContent).toContain(' · 5 to call');
    expect(Array.from(document.body.querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['Follow-ups due 2', 'New leads, not called yet 1', 'New numbers 2']);

    // Each lead says why it's on today's sheet, with what was last noted and how many calls so far.
    const leadCards = () => Array.from(document.body.querySelectorAll('[data-testid="today-lead"]'));
    const whys = () => leadCards().map((c) => c.querySelector('[data-testid="today-why"]')!.textContent);
    expect(whys()[0]).toMatch(/^Follow-up was due [A-Z][a-z]{2} \d+ · from Outreach$/);
    expect(whys().slice(1)).toEqual(['Follow-up due today', 'New lead · came in 2h ago · from Website']);
    expect(leadCards()[0].textContent).toContain('Reyes Roofing · 12 Main St, Midland');
    expect(leadCards()[0].textContent).toContain('2 calls so far · last 3d ago');
    expect(leadCards()[0].textContent).toContain('Nov 8: wants metal, call back');
    expect(leadCards()[0].textContent).toContain('(432) 555-0111');
    // Call dials and counts the call on the lead, as Leads does; the card says so.
    const call = leadCards()[1].querySelector('[data-testid="today-call"]') as HTMLAnchorElement;
    expect(call.getAttribute('href')).toBe('tel:+14325550112');
    call.addEventListener('click', (e) => e.preventDefault());
    // A click event of its own: earlier tests stand in for a link's click() to catch the CSV download.
    await act(async () => void call.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(logContact).toHaveBeenCalledWith('L2', 'call');
    expect(leadCards()[1].textContent).toContain('Called just now');
    // Later moves the follow-up: the lead leaves today's sheet, and the count with it.
    const later = leadCards()[0].querySelector('[data-testid="today-later"]') as HTMLSelectElement;
    expect(Array.from(later.options).map((o) => o.textContent)).toEqual(['Later…', 'Tomorrow', 'In 3 days', 'Next week']);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(later, '7');
    await act(async () => void later.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(updateLead).toHaveBeenCalledWith('L1', { followUpDate: localDay(7) });
    expect(leadCards().map((c) => c.querySelector('button')!.textContent)).not.toContain('Dana Reyes');
    expect(document.body.querySelector('h2')!.textContent).toBe('Follow-ups due 1');
    expect(document.body.querySelector('[data-testid="today-summary"]')!.textContent).toContain(' · 4 to call');

    // New numbers are the owners' own cards: Call, then To Leads or Skip, shown at once.
    const fresh = document.body.querySelector('[data-testid="today-fresh"]')!;
    expect(fresh.textContent).toContain('Owners whose phone was found in the last 7 days. After the call, send them to Leads or skip them.');
    const ownerCards = () => Array.from(fresh.querySelectorAll('[data-testid="contact-card"]'));
    expect(ownerCards().map((c) => c.querySelector('[data-testid="card-call"]')!.getAttribute('href'))).toEqual(['tel:4325550100', 'tel:4325550100']);
    await act(async () => (ownerCards()[0].querySelector('[data-testid="to-leads"]') as HTMLButtonElement).click());
    await flush();
    expect(sendToLeads).toHaveBeenCalledWith('o1', 'r1');
    expect(ownerCards()[0].querySelector('[data-testid="to-leads"]')!.textContent).toContain('In Leads');
    await act(async () => (Array.from(ownerCards()[1].querySelectorAll('button')).find((b) => b.textContent === 'Skip') as HTMLButtonElement).click());
    await flush();
    expect(setStatus).toHaveBeenCalledWith('o1', 'r2', 'skip', '');
    expect(ownerCards()[1].textContent).toContain('Skipped');

    // A lead's name opens it in Leads.
    await act(async () => (leadCards()[0].querySelector('button') as HTMLButtonElement).click());
    expect(path).toBe('/leads?lead=L2');
    // Back to owners returns to the list it was opened from.
    clearPage();
    todaySheet = sheet();
    await render('/outreach?today=1&from=l1');
    await click('Back to owners');
    expect(path).toBe('/outreach/l1');
  });

  it("today's calls with nobody to call: no line on the page, the picker still opens the sheet, and it says what will show up there; a sheet that can't be read says so", async () => {
    lists = [list];
    contacts = twoContacts();
    todaySheet = { day: localDay(), followUps: [], followUpCount: 0, uncalled: [], uncalledCount: 0, fresh: [], freshCount: 0, freshCapped: false, days: 7, simulating: false };
    await render('/outreach');
    expect(document.body.querySelector('[data-testid="today-banner"]')).toBeNull();
    await act(async () => (document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement).click());
    const option = document.body.querySelector('[data-testid="today-option"]') as HTMLButtonElement;
    expect(option.textContent).toBe("Today's callsFollow-ups due and new numbers");
    await act(async () => option.click());
    await flush();
    expect(path).toBe('/outreach?today=1');
    expect(document.body.querySelector('[data-testid="today-summary"]')!.textContent).toContain(' · nobody to call');
    expect(document.body.querySelector('[data-testid="today-empty"]')!.textContent).toBe(
      "Nobody to call today. Follow-ups you set in Leads show up here the day they're due, and so do owners the day their phone is found.",
    );
    await click('Back to owners');
    expect(path).toBe('/outreach');

    // The read fails: the owners page carries on with no line about today, and the sheet offers another try.
    clearPage();
    getToday.mockRejectedValue(new Error('down'));
    await render('/outreach?today=1');
    expect(document.body.querySelector('[data-testid="today-failed"]')!.textContent).toBe("Today's calls couldn't be read. Try again · Back to owners");
    getToday.mockImplementation(async () => todaySheet);
    await click('Try again');
    expect(document.body.querySelector('[data-testid="today-empty"]')).not.toBeNull();
  });

  it('draws a long list 200 owners at a time, with Show more for the rest', async () => {
    contacts = { ...twoContacts(), rows: Array.from({ length: 450 }, (_, i) => contact(`r${i}`, { key: `k-${i}`, name: `Owner ${String(i).padStart(3, '0')} LLC` })) };
    await render('/outreach');
    const table = () => document.body.querySelectorAll('[data-testid="contacts-table"] table[aria-label="Contacts"] tbody tr').length;
    const more = () => document.body.querySelector('[data-testid="contacts-table"] [data-testid="draw-more"]') as HTMLButtonElement | null;
    expect(table()).toBe(200);
    expect(more()!.textContent).toBe('Show 200 more of 250');
    await act(async () => more()!.click());
    expect(table()).toBe(400);
    expect(more()!.textContent).toBe('Show 50 more of 50');
    await act(async () => more()!.click());
    expect(table()).toBe(450);
    expect(more()).toBeNull();
  });
  it('a hundred owners changed in one moment (a send of many) restarts the live feed once, not round and round, and never stops a feed twice', async () => {
    const sixty = (over: Record<string, unknown> = {}) => Array.from({ length: 60 }, (_, i) => contact(`r${i}`, { key: `k-${i}`, name: `Owner ${String(i).padStart(2, '0')} LLC`, ...over }));
    lists = [{ ...list, rowCount: 60 }];
    contacts = { ...twoContacts(), rows: sixty() };
    await render('/outreach/l1');
    expect(watchChanges).toHaveBeenCalledTimes(1);
    // All sixty went to Leads in the same instant. The page asks for a feed from just before that moment; the server
    // has that answer in hand already (the same sixty, all still "the latest"), and gives it at once.
    const sent: Feed = { rows: sixty({ status: 'lead', leadId: 'lead1' }), balanceCents: 0, freeLookups: 0, reload: false, upTo: '2026-11-05T15:05:00.000Z' };
    syncFeed = sent;
    await act(async () => pushChanges!(sent));
    await flush();
    // One new feed, from a second before the change, and no more: asking for the same feed again would never end.
    expect(watchChanges).toHaveBeenCalledTimes(2);
    expect((watchChanges.mock.calls[1] as unknown[])[1]).toBe('2026-11-05T15:04:59.000Z');
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="list-picker"]')).not.toBeNull();
    // The page is still listening: the next change shows.
    syncFeed = null;
    await act(async () => pushChanges!({ ...sent, rows: [contact('r0', { key: 'k-0', name: 'Renamed Owner LLC', status: 'lead', leadId: 'lead1' })], upTo: '2026-11-05T15:06:00.000Z' }));
    expect(document.body.textContent).toContain('Renamed Owner LLC');
    // Leaving the page stops the feed it has, once.
    expect(() => clearPage()).not.toThrow();
  });

  it("a lookup's toast never stays in the way: it can be closed while the lookup runs, comes back for the next one, and the finished summary goes by itself", async () => {
    const progress = () => document.body.querySelector('[data-testid="lookup-progress"]') as HTMLElement | null;
    const running = { status: 'running', at: '2026-11-05T15:00:30Z' };
    const runningRows = () => ({
      ...twoContacts(),
      balanceCents: 1000,
      rows: [contact('r1', { enrichment: { phone: running, email: running, person: running, research: { status: 'locked' } } }), contact('r2', { name: 'City Of Midland' })],
    });
    lists = [list];
    contacts = runningRows();
    localStorage.setItem('outreach.batch', JSON.stringify({ at: '2026-11-05T15:00:00Z' }));
    await render('/outreach/l1');
    // A toast, not a bar: rounded, floating in the stack at the bottom of the screen.
    expect(progress()!.textContent).toContain('Looking up 1 owner · 0 done');
    expect(progress()!.className).toContain('rounded-2xl');
    expect(progress()!.parentElement!.getAttribute('data-testid')).toBe('status-toasts');
    // Closed mid-lookup: the toast goes, the lookup doesn't. The row still shows its own progress.
    const x = progress()!.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement;
    expect(x.title).toBe('Hide this; the lookup carries on');
    await act(async () => x.click());
    expect(progress()).toBeNull();
    expect(document.body.querySelector('[data-testid="contact-row"]')!.textContent).toContain('Waiting its turn');
    // More of the same lookup landing doesn't bring it back.
    await act(async () => pushContacts(runningRows()));
    expect(progress()).toBeNull();
    // The next lookup started here has its toast.
    await click('Find phones & emails');
    await click('Find them');
    expect(progress()).not.toBeNull();
    clearPage();

    // Finished: the summary stays a few seconds, fades, and is gone for good.
    jest.useFakeTimers();
    try {
      const at = '2026-11-05T15:01:00Z';
      const none = { status: 'none', at };
      localStorage.setItem('outreach.batch', JSON.stringify({ at: '2026-11-05T15:00:00Z' }));
      contacts = { ...twoContacts(), rows: [contact('r1', { enrichment: { phone: none, email: none, person: none, research: { status: 'locked' } } }), contact('r2', { name: 'City Of Midland' })] };
      await render('/outreach/l1');
      expect(progress()!.textContent).toBe('Done: 1 owner looked up0 phones · 0 emails · $0 charged');
      expect(progress()!.className).toContain('opacity-100');
      await act(async () => void jest.advanceTimersByTime(7900));
      expect(progress()!.className).toContain('opacity-100');
      await act(async () => void jest.advanceTimersByTime(200));
      expect(progress()!.className).toContain('opacity-0');
      await act(async () => void jest.advanceTimersByTime(400));
      expect(progress()).toBeNull();
      expect(localStorage.getItem('outreach.batch')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a new list still adding owners in the background says so, with no Load the next until it is done', async () => {
    lists = [{ ...list, rowCount: 50, total: 2340, filling: true }];
    contacts = twoContacts();
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="list-filling"]')!.textContent).toBe('Adding owners to this list: 2 so far…');
    // A toast floating at the bottom of the screen, outside the page's layout: taps go through the space around it.
    const toasts = document.body.querySelector('[data-testid="status-toasts"]')!;
    expect(toasts.querySelector('[data-testid="list-filling"]')).not.toBeNull();
    expect(toasts.parentElement).toBe(document.body);
    expect(toasts.className).toContain('fixed bottom-');
    expect(toasts.className).toContain('pointer-events-none');
    expect(document.body.querySelector('[data-testid="status-strip"]')).toBeNull();
    // The page keeps room after its last row, so one can always be scrolled clear of the toast.
    expect(document.body.querySelector('[data-testid="outreach-page"]')!.className).toContain('pb-24');
    expect(document.body.querySelector('[data-testid="list-total"]')).toBeNull();
    lists = [{ ...list, filling: false }];
    clearPage();
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="list-filling"]')).toBeNull();
  });
  it('deletes the open list after asking, and goes back to all contacts', async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await click('Delete list');
    await flush();
    expect(document.body.textContent).toContain('Delete “Shopping center owners”?');
    await click('Delete');
    expect(remove).toHaveBeenCalledWith('o1', 'l1');
    expect(path).toBe('/outreach');
  });
  it('deleting the last list lands on the ready-made lists, even when a read from before the delete still has it', async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    // The server, slow to delete: reads still return the list for now, and its owners go once it's done.
    let done: () => void = () => {};
    remove.mockImplementationOnce(() => new Promise<void>((r) => (done = r)) as never);
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await click('Delete list');
    await click('Delete');
    expect(path).toBe('/outreach');
    // The page went to All owners and read the lists while the list was still there: it stays gone.
    expect(document.body.querySelector('[data-testid="list-picker"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Nobody matched');
    // Its owners, still in that early read, don't flash back as owners kept with no list (and a Make a list): the ready-made lists are there at once.
    await flush();
    expect(document.body.querySelector('[data-testid="no-lists-hint"]')).toBeNull();
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')).toHaveLength(0);
    expect(document.body.querySelector('[data-testid="outreach-empty"]')).not.toBeNull();
    // A live update from before the delete landed changes nothing either.
    await act(async () => pushContacts(contacts));
    expect(document.body.querySelector('[data-testid="no-lists-hint"]')).toBeNull();
    // Done: the server's lists no longer have it, and its owners' update arrives live.
    lists = [];
    contacts = { ...contacts, rows: [] };
    await act(async () => done());
    await act(async () => pushContacts(contacts));
    await flush();
    expect(document.body.querySelector('[data-testid="outreach-empty"]')).not.toBeNull();
  });
  it('deleting a list whose lookups were only simulated says they were simulated and go with it', async () => {
    lists = [list];
    const two = twoContacts();
    contacts = { ...two, rows: [{ ...two.rows[0], enrichment: { ...two.rows[0].enrichment, phone: { status: 'found', simulated: true } } }, two.rows[1]] };
    await render('/outreach/l1');
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await click('Delete list');
    expect(document.body.querySelector('[role="alertdialog"]')!.textContent).toContain('Its lookups were simulated (no phone source is connected yet), so nothing real or paid is lost');
  });
  it("a note typed in an owner's sheet is kept however the sheet is closed, Escape included", async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    await act(async () => (document.body.querySelectorAll('[data-testid="contact-row"]')[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    await act(async () => type(sheet.querySelector('textarea#outreach-note') as HTMLTextAreaElement, 'Call after 3'));
    // No blur: Escape closes it straight away, as a tap outside does on an iPad.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((r) => setTimeout(r, 200));
    });
    await flush();
    expect(setStatus).toHaveBeenCalledWith('o1', 'r1', 'new', 'Call after 3');
    expect(document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')).toBeNull();
  });

  it('on a phone the list, search and tabs come first, then the buttons', async () => {
    narrowScreen = true;
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="outreach-page"]')!.className).toContain('flex flex-col');
    expect(document.body.querySelector('[data-testid="filter-bar"]')!.className).toContain('max-md:order-first');
  });

  it('a lookup not picked up yet says it is waiting its turn once it has waited 20 seconds, on its own', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-10T08:00:00Z') });
    try {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      await act(async () => root.render(<Live cell={{ status: 'running', at: '2026-11-10T07:59:45Z' }} />));
      expect(host.textContent?.trim()).toBe('Starting…');
      await act(async () => jest.advanceTimersByTime(6000));
      expect(host.textContent?.trim()).toBe('Waiting its turn…');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a list with nobody on it says so, and can still be deleted from its page', async () => {
    lists = [list];
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="nobody"]')!.textContent).toBe('Nobody on this list. Make another list');
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    expect(button('Delete list')).toBeTruthy();
  });

  it('going ahead with a paid step asks with the blue button; only taking something away is red', async () => {
    lists = [list];
    contacts = { ...twoContacts(), balanceCents: 1000 };
    await render('/outreach/l1');
    await click('Research with AI');
    const yes = Array.from(document.body.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === 'Research them')!;
    expect(yes.className).toContain('bg-[#336699]');
    expect(yes.className).not.toContain('bg-red');
  });

  it('a worked list can be deleted too: its worked owners stay under Not on a list, or go with it', async () => {
    lists = [{ ...list, deletable: false, worked: 2 }];
    contacts = twoContacts();
    await render('/outreach/l1');
    expect(document.body.querySelector('button[aria-label="Archive list"]')).toBeNull();
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await click('Delete list');
    await flush();
    const dialog = () => document.body.querySelector('[role="alertdialog"]')!;
    expect(dialog().textContent).toContain('2 owners on it were worked (a status, a note, a paid lookup or a lead) and are on no other list.');
    expect(Array.from(dialog().querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Delete, keep the worked owners', 'Delete them too', 'Cancel']);
    await click('Delete, keep the worked owners');
    expect(remove).toHaveBeenCalledWith('o1', 'l1');
    expect(path).toBe('/outreach');
    // Another worked list, and this time its worked owners go too.
    clearPage();
    lists = [{ ...list, deletable: false, worked: 1 }];
    await render('/outreach/l1');
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await click('Delete list');
    expect(dialog().textContent).toContain('1 owner on it was worked');
    await click('Delete them too');
    expect(remove).toHaveBeenLastCalledWith('o1', 'l1', true);
  });

  it('owners on no list have a place in the picker: Not on a list shows them, says why, and can let them all go', async () => {
    lists = [list];
    contacts = { ...twoContacts(), unlisted: 2 };
    await render('/outreach/l1');
    await act(async () => (document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="unlisted-option"]')!.textContent).toBe('Not on a list2 owners kept from deleted lists');
    await act(async () => (document.body.querySelector('[data-testid="unlisted-option"]') as HTMLButtonElement).click());
    await flush();
    expect(path).toBe('/outreach/unlisted');
    expect((getContacts.mock.lastCall as unknown[] | undefined)?.slice(0, 2)).toEqual(['o1', 'unlisted']);
    expect(document.body.querySelector('[data-testid="list-picker"]')!.textContent).toBe('Not on a list2');
    expect(document.body.querySelector('[data-testid="unlisted-line"]')!.textContent).toContain('Kept from lists you deleted, because you worked them.');
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    expect(button('Delete list')).toBeUndefined();
    await click('Remove these owners');
    await act(async () => (Array.from(document.body.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === 'Remove') as HTMLButtonElement).click());
    await flush();
    expect(removeUnlisted).toHaveBeenCalledWith('o1');
    expect(path).toBe('/outreach');
  });
  it('the list dropdown is one size whatever the list is called; its search comes with many lists, and takes the cursor only where there is a keyboard', async () => {
    const six = () => [
      { ...list, id: 'l1', title: 'Shops' },
      { ...list, id: 'l2', title: 'Company investors with 5+ properties, Midland', who: 'investor', definition: { county: 'Midland', who: 'investor' } },
      ...['l3', 'l4', 'l5', 'l6'].map((id, i) => ({ ...list, id, title: `Apartments ${i + 1}`, who: 'multifamily', definition: { county: 'Midland', who: 'multifamily' } })),
    ];
    const picker = () => document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement;
    const panel = () => document.body.querySelector('[role="dialog"][aria-label="Lists"]') as HTMLElement;
    const search = () => panel().querySelector('input[aria-label="Find a list"]') as HTMLInputElement | null;
    // A short name and a long one: the same box, the same width, the name cut short rather than the box stretched.
    const boxes: string[] = [];
    for (const id of ['l1', 'l2']) {
      lists = six();
      contacts = twoContacts();
      await render(`/outreach/${id}`);
      expect(picker().parentElement!.className).toContain('w-[26rem] max-w-full');
      expect(picker().className).toContain('w-full');
      expect(picker().querySelector('span')!.className).toContain('truncate');
      // The arrow sits at the box's right edge, wherever the name ends.
      expect(picker().querySelector('svg')!.getAttribute('class')).toContain('ml-auto');
      boxes.push(`${picker().parentElement!.className} | ${picker().className}`);
      clearPage();
    }
    expect(boxes[0]).toBe(boxes[1]);

    // Many lists, a mouse and keyboard: the panel is the box's width, and typing finds a list straight away.
    lists = six();
    contacts = twoContacts();
    await render('/outreach/l2');
    await act(async () => picker().click());
    expect(panel().className).toContain('w-[26rem]');
    expect(document.activeElement).toBe(search());
    await act(async () => type(search()!, 'shops'));
    expect(Array.from(panel().querySelectorAll('[data-testid="list-option"]')).map((o) => o.textContent)).toEqual(['Shops2 owners · 0 worked']);
    clearPage();

    // The same on a touch screen: the search is there to tap, but opening the panel doesn't put the cursor in it, so no keyboard comes up.
    touchScreen = true;
    lists = six();
    contacts = twoContacts();
    await render('/outreach/l2');
    await act(async () => picker().click());
    expect(search()).not.toBeNull();
    expect(document.activeElement).not.toBe(search());
    clearPage();

    // One list: nothing to find, so no search box at all.
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    await act(async () => picker().click());
    expect(search()).toBeNull();
    expect(panel().textContent).toContain('All owners');
    expect(panel().textContent).toContain('Manage lists');
  });

  it('the list picker: pin to the top, grouped by kind; Manage lists renames and deletes', async () => {
    localStorage.clear();
    lists = [
      { ...list, id: 'l1', title: 'Shopping center owners', createdAt: '2026-11-05T15:00:00Z' },
      // One estimate out for $12,400, and it sold; looking the list's owners up has cost $112 so far.
      { ...list, id: 'l2', title: 'Real estate investors, Midland', who: 'investor', definition: { county: 'Midland', who: 'investor' }, rowCount: 1000, done: 40, results: { sent: 3, estimates: 1, sold: 1, estimateCents: 1_240_000, soldCents: 1_240_000 }, spentCents: 11_200, createdAt: '2026-11-06T15:00:00Z' },
    ];
    contacts = twoContacts();
    await render('/outreach/l2');
    const picker = () => document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement;
    expect(picker().textContent).toBe('Real estate investors, Midland1,000');
    // The list's own line says it in dollars too.
    expect(document.body.querySelector('[data-testid="list-results"]')!.textContent).toBe(' · 3 sent · 1 estimate ($12,400) · 1 sold ($12,400)');
    await act(async () => picker().click());
    const panel = () => document.body.querySelector('[role="dialog"][aria-label="Lists"]')!;
    const headings = () => Array.from(panel().querySelectorAll('h3')).map((h) => h.textContent);
    // A handful of lists: grouped by who they're of (Recent only shows once there are many).
    expect(headings()).toEqual(['Commercial owners', 'Investors']);
    expect(panel().textContent).toContain('1,000 owners · 40 worked · 3 sent · 1 sold ($12,400)');
    // Two lists fit on the panel: no search box to find one with.
    expect(panel().querySelector('input[aria-label="Find a list"]')).toBeNull();
    // Pin the shopping center list: it moves to Pinned.
    await act(async () => (panel().querySelector('button[aria-label="Pin Shopping center owners"]') as HTMLButtonElement).click());
    await flush();
    expect(organizeList).toHaveBeenCalledWith('o1', 'l1', { pinned: true });
    expect(headings()[0]).toBe('Pinned');
    // Manage lists: a card per list, with progress and results.
    await click('Manage lists');
    expect(path).toBe('/outreach/l2?lists=1');
    const cards = () => Array.from(document.body.querySelectorAll('[data-testid="list-card"]'));
    expect(cards().map((c) => c.querySelector('span')!.textContent)).toEqual(['Shopping center owners', 'Real estate investors, Midland']);
    expect(cards()[1].textContent).toContain('40 of 1,000 worked');
    expect(cards()[1].textContent).toContain('3 sent to Leads · 1 estimate ($12,400) · 1 sold ($12,400)');
    // What it sold beside what its lookups cost; a list with nothing spent says nothing about cost.
    expect(cards()[1].querySelector('[data-testid="list-cost"]')!.textContent).toBe('$12,400 sold for $112 in lookups');
    expect(cards()[0].querySelector('[data-testid="list-cost"]')).toBeNull();
    // Rename, then delete.
    await act(async () => (cards()[1].querySelector('button[aria-label="Rename Real estate investors, Midland"]') as HTMLButtonElement).click());
    await act(async () => type(document.body.querySelector('input[aria-label="List name"]') as HTMLInputElement, 'Midland investors'));
    await act(async () => (document.body.querySelector('[data-testid="lists-overview"] form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(organizeList).toHaveBeenCalledWith('o1', 'l2', { title: 'Midland investors' });
    await act(async () => (cards()[1].querySelector('button[aria-label="Delete Midland investors"]') as HTMLButtonElement).click());
    await flush();
    const confirmDelete = Array.from(document.body.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent?.trim() === 'Delete') as HTMLButtonElement;
    await act(async () => confirmDelete.click());
    await flush();
    expect(remove).toHaveBeenLastCalledWith('o1', 'l2');
    expect(cards()).toHaveLength(1);
    expect(path).toBe('/outreach/l2?lists=1');
  });

  // Seven owners that come down to two people and two on their own: Karen Holt is general partner of three companies
  // (billed at three addresses), Luis Ortega's number answers for two, one was looked up and has nothing, one hasn't been.
  const peopleRows = () => {
    const at = '2026-11-05T15:01:00Z';
    const found = { status: 'found', at, source: 'tx-comptroller' };
    const none = { status: 'none', at: new Date().toISOString(), tries: [{ source: 'batchdata', outcome: 'miss', note: 'No match' }] };
    const locked = { status: 'locked' };
    const karen = { name: 'Karen Holt', title: 'General partner', source: 'tx-comptroller' };
    const hers = { person: karen, enrichment: { person: found, phone: locked, email: locked, research: locked } };
    const line = { number: '4325557104', type: 'mobile', verified: true, source: 'batchdata' };
    const mail = (address: string) => ({ mailing: { address, city: 'MIDLAND', state: 'TX', zip: '79701' } });
    return [
      contact('r1', { name: 'Bluebonnet Holdings LLC', company: 'Bluebonnet Holdings LLC', properties: 60, totalValueCents: 2_000_000_000, ...mail('100 W WALL ST'), ...hers }),
      contact('r2', { name: 'City Of Midland', company: 'City Of Midland', properties: 4, totalValueCents: 120_000_000, ...mail('300 N LORAINE ST') }),
      contact('r3', { name: 'Permian Storage LP', company: 'Permian Storage LP', properties: 40, totalValueCents: 1_500_000_000, ...mail('200 N BIG SPRING ST'), ...hers }),
      contact('r4', {
        name: 'Ortega Rentals LLC',
        company: 'Ortega Rentals LLC',
        properties: 3,
        totalValueCents: 90_000_000,
        ...mail('400 ANDREWS HWY'),
        person: { name: 'Luis Ortega', title: 'Manager', source: 'tx-comptroller' },
        phones: [line, { number: '4325557105', type: 'landline', source: 'batchdata' }],
        emails: [{ email: 'luis@ortega.example', source: 'batchdata', verified: true }],
        enrichment: { person: found, phone: { ...found, source: 'batchdata', chargedCents: 100 }, email: { ...found, source: 'batchdata' }, research: locked },
      }),
      contact('r5', { name: 'Wall Street Lofts LLC', company: 'Wall Street Lofts LLC', properties: 28, totalValueCents: 620_000_000, ...mail('300 W WALL ST'), ...hers }),
      contact('r6', { name: 'Caddo Plaza LLC', company: 'Caddo Plaza LLC', ...mail('500 GARFIELD ST'), phones: [line], enrichment: { person: none, phone: { ...found, source: 'batchdata', chargedCents: 100 }, email: none, research: locked } }),
      contact('r7', { name: 'Tall City Towers LLC', company: 'Tall City Towers LLC', ...mail('600 ILLINOIS AVE'), enrichment: { person: none, phone: none, email: none, research: locked } }),
    ];
  };

  it('companies run by one person are one line: what they hold in all, their companies a tap away, and sending or skipping them is one decision', async () => {
    lists = [list];
    contacts = { ...twoContacts(), rows: peopleRows(), coverage: coverage(2, 1, 4, 7) };
    await render('/outreach/l1');
    const people = () => Array.from(document.body.querySelectorAll('[data-testid="operator-row"]'));
    const owners = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"]'));
    const first = (el: Element) => el.querySelector('td')!.firstChild!.textContent;
    // Seven owners are four lines: each person once, where the first of their companies stood, then the owners on their own.
    expect(people().map((p) => p.querySelector('[data-testid="operator-name"]')!.textContent)).toEqual(['Karen Holt', 'Luis Ortega']);
    expect(owners().map(first)).toEqual(['City Of Midland', 'Tall City Towers LLC']);
    expect(Array.from(document.body.querySelectorAll('tbody tr')).map((r) => r.getAttribute('data-testid'))).toEqual(['operator-row', 'contact-row', 'operator-row', 'contact-row']);
    // What she controls across her companies, and why they are shown as hers.
    expect(people()[0].querySelector('[data-testid="operator-holding"]')!.textContent).toBe('3 entities · 128 properties · $41.2M');
    expect(people()[0].querySelector('[data-testid="operator-basis"]')!.textContent).toBe('Same decision makerGeneral partner');
    // He is named on one of the two, and the other answers the same number: the best number is on his line, once.
    expect(people()[1].querySelector('[data-testid="operator-basis"]')!.textContent).toBe('Same phone numberManager');
    const cells = (row: Element) => Array.from(row.querySelectorAll('td')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(cells(people()[1]).slice(2, 4)).toEqual(['(432) 555-7104+1 moremobile · verified', 'luis@ortega.example']);
    expect(cells(people()[0]).slice(4, 7)).toEqual(['3 mailing addresses', '128 properties', '$41.2M']);
    expect(document.body.querySelector('[data-testid="operators-line"]')!.textContent).toBe(
      '5 of these 7 owners are run by 2 people, each shown once with their companies under them. Biggest: Karen Holt, 3 entities · 128 properties · $41.2M.',
    );
    // Looked up, and nobody to call or write to: the row goes quiet, each miss a dash, the mailing address what it has.
    const quiet = owners()[1];
    expect(quiet.getAttribute('data-quiet')).toBe('true');
    expect(cells(quiet).slice(1, 5)).toEqual(['—', '—', '—', '600 Illinois AveMidland, TX 79701']);
    expect(quiet.querySelectorAll('td')[4].className).toContain('text-gray-100');
    // Not looked up is not the same as nothing found: it keeps its padlock.
    expect(owners()[0].getAttribute('data-quiet')).toBeNull();
    expect(owners()[0].querySelectorAll('td')[2].querySelector('svg')).not.toBeNull();

    // Most parcels first ranks a person by all they hold, not company by company: his two companies' four properties
    // are worth more than the city's four, so he comes before it, though neither of his companies would alone.
    await act(async () => (document.body.querySelector('[data-testid="name-sort"]') as HTMLButtonElement).click());
    expect(Array.from(document.body.querySelectorAll('tbody tr')).map((r) => r.querySelector('[data-testid="operator-name"]')?.textContent ?? first(r))).toEqual(['Karen Holt', 'Luis Ortega', 'City Of Midland', 'Tall City Towers LLC']);

    // A tap opens her line to her companies, set in under it, with the two things to do about all of them.
    const toggle = (i: number) => people()[i].querySelector('[data-testid="operator-toggle"]') as HTMLButtonElement;
    expect(toggle(0).getAttribute('aria-expanded')).toBe('false');
    expect(people()[0].querySelector('[data-testid="operator-actions"]')).toBeNull();
    await act(async () => toggle(0).click());
    expect(toggle(0).getAttribute('aria-expanded')).toBe('true');
    const nested = () => owners().filter((r) => r.getAttribute('data-nested'));
    expect(nested().map(first)).toEqual(['Bluebonnet Holdings LLC', 'Permian Storage LP', 'Wall Street Lofts LLC']);
    expect(Array.from(people()[0].querySelectorAll('[data-testid="operator-actions"] button')).map((b) => b.textContent)).toEqual(['Send all to Leads', 'Skip all']);

    // One of her companies opens to its own sheet, which says whose it is and lists the others; a tap goes to one of them.
    await act(async () => (nested()[1] as HTMLElement).click());
    const sheet = () => document.body.querySelector('[data-testid="operator-sheet"]')!;
    expect(sheet().textContent).toContain('Karen Holt · 3 entities · 128 properties · $41.2M');
    expect(sheet().textContent).toContain('Same decision maker. One person to call: sent to Leads, these become one lead.');
    expect(Array.from(sheet().querySelectorAll('[data-testid="operator-sibling"]')).map((b) => b.textContent)).toEqual(['Bluebonnet Holdings LLC · 60 properties', 'Wall Street Lofts LLC · 28 properties']);
    await act(async () => (sheet().querySelector('[data-testid="operator-sibling"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[role="dialog"][aria-label="Bluebonnet Holdings LLC"]')).not.toBeNull();
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    await flush();

    // Skip all: one decision, said once. Each of her companies is skipped, and again puts them back.
    await act(async () => (people()[0].querySelector('[data-testid="operator-skip"]') as HTMLButtonElement).click());
    await flush();
    expect(setStatus.mock.calls.map((c) => (c as unknown[]).slice(1, 3))).toEqual([['r1', 'skip'], ['r3', 'skip'], ['r5', 'skip']]);
    expect(people()[0].querySelector('[data-testid="status-badge"]')!.textContent).toBe('Skipped');
    expect(people()[0].querySelector('[data-testid="operator-skip"]')!.textContent).toBe('Skipped · undo');
    expect(people()[0].querySelector('[data-testid="operator-lead"]')).toBeNull();
    setStatus.mockClear();
    await act(async () => (people()[0].querySelector('[data-testid="operator-skip"]') as HTMLButtonElement).click());
    await flush();
    expect(setStatus.mock.calls.map((c) => (c as unknown[]).slice(1, 3))).toEqual([['r1', 'new'], ['r3', 'new'], ['r5', 'new']]);

    // Send all: after a word on what they become, his two companies go as one send, to be one lead.
    await act(async () => toggle(1).click());
    await act(async () => (people()[1].querySelector('[data-testid="operator-lead"]') as HTMLButtonElement).click());
    await flush();
    expect(document.body.textContent).toContain('Send Luis Ortega’s 2 entities to Leads?');
    expect(document.body.textContent).toContain('They become one lead: one person to call');
    sendManyToLeads.mockImplementationOnce(async () => ({ sent: 2, leads: 1, joined: 1 }));
    await act(async () => (Array.from(document.body.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === 'Send to Leads') as HTMLButtonElement).click());
    await flush();
    expect(sendManyToLeads).toHaveBeenLastCalledWith('o1', ['r4', 'r6']);
    expect(document.body.querySelector('[data-testid="sent-note"]')!.textContent).toContain('Luis Ortega: 2 entities sent as 1 lead.');

    // A search opens every line it finds something under, and the person's line says how many of theirs are showing.
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'permian'));
    expect(people()).toHaveLength(1);
    expect(people()[0].querySelector('[data-testid="operator-showing"]')!.textContent).toBe('1 of 3 showing');
    expect(people()[0].querySelector('[data-testid="operator-holding"]')!.textContent).toBe('3 entities · 128 properties · $41.2M');
    expect(owners().map(first)).toEqual(['Permian Storage LP']);
  });

  it("a person's company sent on its own joins the lead another of theirs already made; the send-all button counts leads by person", async () => {
    lists = [list];
    const rows = peopleRows().map((r) => (r.id === 'r4' ? { ...r, status: 'lead', leadId: 'lead4', leadStage: 'contacted' } : r));
    contacts = { ...twoContacts(), rows, coverage: coverage(2, 1, 4, 7) };
    await render('/outreach/l1');
    const luis = () => document.body.querySelectorAll('[data-testid="operator-row"]')[1];
    // One of his two is in Leads: his line says so.
    expect(luis().querySelector('[data-testid="status-badge"]')!.textContent).toBe('1 of 2 in Leads');
    await act(async () => (luis().querySelector('[data-testid="operator-toggle"]') as HTMLButtonElement).click());
    expect(luis().querySelector('[data-testid="operator-lead"]')!.textContent).toBe('Send 1 to Leads');
    const caddo = Array.from(document.body.querySelectorAll('[data-testid="contact-row"]')).find((r) => r.textContent?.includes('Caddo Plaza'))!;
    // The entity in Leads says where it stands in a badge; the one still New says nothing.
    const ortega = Array.from(document.body.querySelectorAll('[data-testid="contact-row"]')).find((r) => r.textContent?.includes('Ortega Rentals'))!;
    expect(ortega.querySelector('[data-testid="status-badge"]')!.textContent).toBe('In Leads · Contacted');
    expect(caddo.querySelector('[data-testid="badges"]')).toBeNull();
    // From its sheet, the other company goes to Leads naming the one already there, so the server joins that lead.
    await act(async () => (caddo as HTMLElement).click());
    await click('Send to Leads');
    expect(sendToLeads).toHaveBeenLastCalledWith('o1', 'r6', ['r4']);
  });

  it('on a phone a person is one card: the best number among their companies to call, the companies inside it; an owner with nobody to reach is one quiet line and where to mail', async () => {
    narrowScreen = true;
    lists = [list];
    contacts = { ...twoContacts(), rows: peopleRows(), coverage: coverage(2, 1, 4, 7) };
    await render('/outreach/l1');
    const people = () => Array.from(document.body.querySelectorAll('[data-testid="operator-card"]'));
    const top = () => Array.from(document.body.querySelectorAll('[data-testid="contact-cards"] > li')).map((li) => li.querySelector('[data-testid="operator-name"]')?.textContent ?? li.querySelector('button span')!.textContent);
    expect(top()).toEqual(['Karen Holt', 'City Of Midland', 'Luis Ortega', 'Tall City Towers LLC']);
    expect(people()[0].textContent).toContain('3 entities · 128 properties · $41.2M');
    expect(people()[0].textContent).toContain('Same decision maker');
    expect(people()[0].textContent).toContain('No number for any of them yet');
    // One Call for the two companies his number answers for, not one each.
    expect(Array.from(people()[1].querySelectorAll(':scope > [data-testid="card-actions"] a')).map((a) => [a.textContent?.trim() || a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([
      ['Call', 'tel:4325557104'],
      ['Text', 'sms:4325557104'],
      ['Email', 'mailto:luis@ortega.example'],
    ]);
    expect(document.body.querySelectorAll('[data-testid="card-call"]')).toHaveLength(1);
    expect(people()[1].textContent).toContain('(432) 555-7104 mobile · verified · +1 more');
    // His companies are inside the card, a tap away.
    expect(people()[1].querySelector('[data-testid="operator-entities"]')).toBeNull();
    await act(async () => (people()[1].querySelector('[data-testid="operator-toggle"]') as HTMLButtonElement).click());
    expect(Array.from(people()[1].querySelectorAll('[data-testid="operator-entities"] [data-testid="contact-card"]')).map((c) => c.querySelector('button + button span')!.textContent)).toEqual(['Ortega Rentals LLC', 'Caddo Plaza LLC']);
    // Looked up and nothing found: one line and the mailing address, in place of a line per miss.
    const quiet = Array.from(document.body.querySelectorAll('[data-testid="contact-card"]')).find((c) => c.textContent?.includes('Tall City Towers'))!;
    expect(quiet.getAttribute('data-quiet')).toBe('true');
    expect(quiet.querySelector('[data-testid="nobody-to-reach"]')!.textContent).toBe('No number or email foundMail to 600 Illinois Ave, Midland, TX, 79701');
    expect(quiet.textContent).not.toContain('none found');
    // Skip all, from the card's corner.
    await act(async () => (people()[0].querySelector('[data-testid="operator-skip"]') as HTMLButtonElement).click());
    await flush();
    expect(setStatus.mock.calls.map((c) => (c as unknown[]).slice(1, 3))).toEqual([['r1', 'skip'], ['r3', 'skip'], ['r5', 'skip']]);
  });

  it('simulated lookups show who they tie but never promise one lead: the send keeps each company apart', async () => {
    lists = [list];
    const sim = (cell: Record<string, unknown>) => (cell.status === 'locked' ? cell : { ...cell, simulated: true });
    const rows = peopleRows().map((r) => ({ ...r, enrichment: Object.fromEntries(Object.entries(r.enrichment as Record<string, Record<string, unknown>>).map(([k, c]) => [k, sim(c)])) }));
    contacts = { ...twoContacts(), rows, coverage: coverage(2, 1, 4, 7) };
    await render('/outreach/l1');
    // Still shown as two people, with a word that the simulated chain makes groups bigger than real ones.
    expect(document.body.querySelectorAll('[data-testid="operator-row"]')).toHaveLength(2);
    expect(document.body.querySelector('[data-testid="operators-line"]')!.textContent).toContain('Simulated lookups reuse a few made-up people, so these groups are bigger than real ones will be.');
    expect(document.body.querySelector('[data-testid="sample-note"]')!.textContent).toContain('Sample results: no phone source is connected yet');
    const luis = document.body.querySelectorAll('[data-testid="operator-row"]')[1];
    await act(async () => (luis.querySelector('[data-testid="operator-toggle"]') as HTMLButtonElement).click());
    await act(async () => (luis.querySelector('[data-testid="operator-lead"]') as HTMLButtonElement).click());
    await flush();
    expect(document.body.textContent).toContain('What ties them is from a simulated lookup, so each goes to Leads as its own lead with the made-up details left out.');
  });
});
