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
const watchChanges = jest.fn((_o: string, _since: string, onUpdate: (c: Feed) => void) => {
  pushChanges = onUpdate;
  return () => {
    pushChanges = null;
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
  outreachAPI: {
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

// The screen width the page asks about: a laptop unless a test says it's a phone.
let narrowScreen = false;
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: narrowScreen, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
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
  narrowScreen = false;
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
    const statusOf = () => document.body.querySelectorAll('[data-testid="contact-row"]')[1].querySelectorAll('td')[1].textContent;
    expect(statusOf()).toBe('New');
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
    expect(more).toEqual(expect.arrayContaining(['Send 1 to Leads', 'Show as a table', 'Export CSV', 'Delete list']));
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
    // The name and where the owner stands come first (both pinned on a tablet), then what the row has; the roll's columns follow.
    // The mailing address is one column: street, then city, state and zip under it, in normal capitals.
    // The name carries what the owner holds, as the cards do.
    expect(cells(0)).toEqual(['Oak Plaza LLC$3M', 'New', '—', '—', '—', '—', '1 Main StDallas, TX 75201', '12 Midkiff Rd', '$3M', 'Commercial', '—']);
    expect(cells(1)[7]).toBe('12 Midkiff Rd +3');
    // An owner with several properties shows what they hold in all, the number the list is sorted on.
    expect(cells(1)[8]).toBe('$1.2M');
    expect(cells(1)[10]).toBe('Code violation Sep 2026');
    expect(rows[0].querySelectorAll('td')[0].className).toContain('sticky');
    expect(rows[0].querySelectorAll('td')[1].className).toContain('md:sticky');
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
    expect(heads).toEqual(['NameNewest first', 'Status', 'Decision maker0 / 2 companies', 'Phone0 / 2', 'Email0 / 2', 'Research0 / 2', 'Mailing address', 'Property', 'Value', 'Type', 'Signals']);
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
    const failedCell = document.body.querySelectorAll('[data-testid="contact-row"]')[0].querySelectorAll('td')[2];
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
    expect(send.textContent?.trim()).toBe('Send 3 to Leads');
    await act(async () => send.click());
    await flush();
    expect(document.body.textContent).toContain('Send 3 owners to Leads?');
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
    expect(cells(0)[2]).toBe('Dana ReyesManager · 2 sources agree');
    expect(cells(0).slice(3, 5)).toEqual(['(432) 555-0100mobile · verified · +2', 'dana@oakplaza.comverified']);
    // A running cell says what it's doing, and the last thing it found.
    // One not picked up yet, asked a while ago, says it's waiting its turn rather than "Starting" forever.
    expect(cells(1).slice(2, 5)).toEqual(['Asking the Texas Comptroller…1 source checked', 'Checking the lines…2 numbers', 'Waiting its turn…']);
    expect(cells(0)[5]).toBe('—');
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
    expect(Array.from(rows[1].querySelectorAll('td'))[5].textContent).toBe('The City of Midland owns the lot; a parks bond passed in 2026.');
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
    const phoneCell = (i: number) => rows[i].querySelectorAll('td')[3];
    expect(phoneCell(0).textContent).toBe('None foundTry again');
    expect(phoneCell(1).textContent).toBe('None found');
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
  it('a new list still adding owners in the background says so, with no Load the next until it is done', async () => {
    lists = [{ ...list, rowCount: 50, total: 2340, filling: true }];
    contacts = twoContacts();
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="list-filling"]')!.textContent).toBe('Adding owners to this list: 2 so far…');
    // In the strip along the page's bottom edge, after everything else: it never sits on top of a row's buttons.
    const strip = document.body.querySelector('[data-testid="outreach-page"] > [data-testid="status-strip"]')!;
    expect(strip.querySelector('[data-testid="list-filling"]')).not.toBeNull();
    expect(strip.className).toContain('sticky bottom-0');
    expect(strip.nextElementSibling).toBeNull();
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
  it('the list picker: search, pin to the top, grouped by kind; Manage lists renames and deletes', async () => {
    localStorage.clear();
    lists = [
      { ...list, id: 'l1', title: 'Shopping center owners', createdAt: '2026-11-05T15:00:00Z' },
      { ...list, id: 'l2', title: 'Real estate investors, Midland', who: 'investor', definition: { county: 'Midland', who: 'investor' }, rowCount: 1000, done: 40, results: { sent: 3, estimates: 1, sold: 1 }, createdAt: '2026-11-06T15:00:00Z' },
    ];
    contacts = twoContacts();
    await render('/outreach/l2');
    const picker = () => document.body.querySelector('[data-testid="list-picker"]') as HTMLButtonElement;
    expect(picker().textContent).toBe('Real estate investors, Midland1,000');
    await act(async () => picker().click());
    const panel = () => document.body.querySelector('[role="dialog"][aria-label="Lists"]')!;
    const headings = () => Array.from(panel().querySelectorAll('h3')).map((h) => h.textContent);
    // A handful of lists: grouped by who they're of (Recent only shows once there are many).
    expect(headings()).toEqual(['Commercial owners', 'Investors']);
    expect(panel().textContent).toContain('1,000 owners · 40 worked · 3 sent · 1 sold');
    // Search narrows the lists.
    await act(async () => type(panel().querySelector('input[aria-label="Find a list"]') as HTMLInputElement, 'shopping'));
    expect(Array.from(panel().querySelectorAll('[data-testid="list-option"]')).map((o) => o.textContent)).toEqual(['Shopping center owners2 owners · 0 worked']);
    await act(async () => type(panel().querySelector('input[aria-label="Find a list"]') as HTMLInputElement, ''));
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
    expect(cards()[1].textContent).toContain('3 sent to Leads · 1 estimate · 1 sold');
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
});
