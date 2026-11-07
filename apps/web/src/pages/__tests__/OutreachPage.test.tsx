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
const money = { balanceCents: 0, unlockCents: 100, researchCents: 25, researchQuestion: 'Who is this owner, what do they do, and is there any sign of planned construction?' };
const list = {
  id: 'l1',
  title: 'Shopping center owners',
  who: 'commercial',
  definition: { county: 'Midland', who: 'commercial' },
  rowCount: 2,
  done: 0,
  truncated: false,
  createdAt: '2026-11-05T15:00:00Z',
};
let lists: Array<Record<string, unknown>> = [];
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
const remove = jest.fn(async () => null);
const extend = jest.fn(async () => ({ loaded: 500, added: 500, rowCount: 1000, total: 2340, truncated: false }));
const enrich = jest.fn(async () => ({ queued: 1, costCents: 100, at: '2026-11-05T15:00:00Z' }));
const sources = jest.fn(async () => []);
const getContacts = jest.fn(async () => contacts);
// The live feed: a test can push what the server would send.
let pushContacts: ((c: unknown) => void) | null = null;
const watchContacts = jest.fn((_o: string, _l: string | undefined, onUpdate: (c: unknown) => void) => {
  pushContacts = onUpdate;
  return () => {
    pushContacts = null;
  };
});
let ownersState: Record<string, unknown> | null = null;
const rebuild = jest.fn(async () => ({ fetched: 58_418, added: 44_120, updated: 0 }));
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
    remove: (...args: unknown[]) => remove(...(args as [])),
    extend: (...args: unknown[]) => extend(...(args as [])),
    enrich: (...args: unknown[]) => enrich(...(args as [])),
    watchContacts: (...args: unknown[]) => watchContacts(...(args as [string, string | undefined, (c: unknown) => void])),
    watchLists: () => () => {},
    sources: (...args: unknown[]) => sources(...(args as [])),
    status: async () => ownersState,
    rebuild: () => rebuild(),
  },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: jest.requireActual<typeof import('react')>('react').createContext({ selectedOrg: { id: 'o1', name: 'Peak Roofing' } }),
}));

import OutreachPage from '../OutreachPage';
import { ContactsTable } from '../../components/outreach/ContactsTable';

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
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  document.body.innerHTML = '';
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
    expect(watchContacts).toHaveBeenLastCalledWith('o1', 'l1', expect.any(Function));
    const reads = getContacts.mock.calls.length;
    // The server's push: City Of Midland's person found elsewhere, shown with no new read.
    await act(async () => pushContacts!({ ...twoContacts(), rows: [contact('r1'), contact('r2', { name: 'City Of Midland', person: { name: 'Sam Ortiz', source: 'tx-comptroller' } })] }));
    expect(document.body.textContent).toContain('Sam Ortiz');
    expect(getContacts.mock.calls.length).toBe(reads);

    // A lookup the server is slow to accept: the cells run the moment it's asked.
    let accept: (v: unknown) => void = () => {};
    enrich.mockImplementationOnce(() => new Promise((resolve) => (accept = resolve)) as never);
    contacts = { ...twoContacts(), balanceCents: 500 };
    await act(async () => pushContacts!(contacts));
    await click('Look up 2');
    await click('Look them up');
    const first = document.body.querySelectorAll('[data-testid="contact-row"]')[0];
    expect(first.querySelectorAll('[data-testid="live"]').length).toBeGreaterThan(0);
    expect(document.body.querySelector('[data-testid="lookup-progress"]')!.textContent).toContain('Looking up 2 owners · 0 done');
    await act(async () => accept({ queued: 2, costCents: 200, at: new Date().toISOString() }));
    await flush();

    // Done that the server refuses: shown at once, then put back.
    setStatus.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    await act(async () => (document.body.querySelectorAll('[data-testid="contact-row"]')[1] as HTMLTableRowElement).click());
    await flush();
    await click('Done');
    await flush();
    const statusOf = () => document.body.querySelectorAll('[data-testid="contact-row"]')[1].querySelectorAll('td')[5].textContent;
    expect(statusOf()).toBe('New');
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
    await act(async () => pushContacts!({ ...contacts, rows: [contacts.rows[0], contact('r2', { name: 'City Of Midland', enrichment: { ...before, research: { status: 'none', at } } })] }));
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
    document.body.innerHTML = '';
    const box = document.createElement('div');
    document.body.appendChild(box);
    const root = createRoot(box);
    const table = (rows: ReturnType<typeof contact>[]) => (
      <ContactsTable rows={rows as never} coverage={coverage() as never} selected={new Set()} onSelect={() => {}} onSelectAll={() => {}} onOpen={() => {}} onRetry={() => {}} />
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

  it('shows cards on a phone: the decision maker, the best number with Call and Text, the signal, Done and Skip; the table is a tap away and remembered', async () => {
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
    const reach = cards[0].querySelector('[data-testid="card-reach"]')!;
    expect(Array.from(reach.querySelectorAll('a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Call', 'tel:4325550100'],
      ['Text', 'sms:4325550100'],
    ]);
    const city = cards[1].textContent!;
    expect(city).toContain('4 properties · $1.2M');
    expect(city).toContain('Code violation Sep 2026');
    expect(city).toContain('Decision maker: not looked up');
    expect(city).toContain('Phone: not looked up');
    expect(cards[1].querySelector('[data-testid="card-reach"]')).toBeNull();
    // Done saves the status, keeping the note; tapping it again puts the owner back to New.
    await act(async () => (Array.from(cards[0].querySelectorAll('button')).find((b) => b.textContent === 'Mark done') as HTMLButtonElement).click());
    await flush();
    expect(setStatus).toHaveBeenLastCalledWith('o1', 'r1', 'done', undefined);
    const doneCard = document.body.querySelectorAll('[data-testid="contact-card"]')[0];
    await act(async () => (Array.from(doneCard.querySelectorAll('button')).find((b) => b.textContent === 'Done ✓') as HTMLButtonElement).click());
    await flush();
    expect(setStatus).toHaveBeenLastCalledWith('o1', 'r1', 'new', undefined);
    // The table, a tap away; the choice sticks on this device.
    // The switch is just an icon, named for screen readers.
    const viewSwitch = async (name: string) => {
      await act(async () => (document.body.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement).click());
      await flush();
    };
    expect(document.body.querySelector('button[aria-label="Show as a table"]')!.textContent).toBe('');
    await viewSwitch('Show as a table');
    expect(document.body.querySelector('[data-testid="contacts-table"]')).not.toBeNull();
    expect(localStorage.getItem('outreach.view')).toBe('table');
    await viewSwitch('Show as cards');
    expect(document.body.querySelector('[data-testid="contact-cards"]')).not.toBeNull();
  });

  it('shows the contacts table with a chip per list, or says to tap + when there are none', async () => {
    await render();
    expect(document.body.querySelector('[data-testid="outreach-empty"]')!.textContent).toBe('No contacts yet. Tap + and say who you want to reach.');
    // Just the title: no paragraph of explanation under it.
    expect(document.body.querySelector('header')!.textContent).toBe('Outreach');
    document.body.innerHTML = '';
    lists = [list];
    contacts = twoContacts();
    // A table wider than its box, as on a laptop.
    Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', { configurable: true, get: () => 1400 });
    Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
    await render();
    const chips = Array.from(document.body.querySelectorAll('[aria-label="Lists"] button')).map((b) => b.textContent?.trim());
    expect(chips).toEqual(['All', 'Shopping center owners 2']);
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    expect(rows).toHaveLength(2);
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => c.textContent?.trim());
    // What the row has comes first; the roll's columns follow, with the name pinned as they scroll.
    // The mailing address is one column: street, then city, state and zip under it.
    expect(cells(0)).toEqual(['Oak Plaza LLC', '—', '—', '—', '—', 'New', '1 MAIN STDALLAS, TX 75201', '12 Midkiff Rd', '$3M', 'Commercial', '—']);
    expect(cells(1)[7]).toBe('12 Midkiff Rd +3');
    // An owner with several properties shows what they hold in all, the number the list is sorted on.
    expect(cells(1)[8]).toBe('$1.2M');
    expect(cells(1)[10]).toBe('Code violation Sep 2026');
    expect(rows[0].querySelectorAll('td')[0].className).toContain('sticky');
    expect(document.body.querySelector('[data-testid="more-columns"]')).not.toBeNull();
    const heads = Array.from(document.body.querySelectorAll('thead th')).map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
    expect(heads).toEqual(['Name', 'Decision maker0 / 2 companies', 'Phone0 / 2', 'Email0 / 2', 'Research0 / 2', 'Status', 'Mailing address', 'Property', 'Value', 'Type', 'Signals']);
    await click('Shopping center owners');
    expect(path).toBe('/outreach/l1');
    expect(getContacts).toHaveBeenLastCalledWith('o1', 'l1');
    // One quiet line about the list over it; no step cards.
    expect(document.body.querySelector('[data-testid="steps"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="list-line"]')!.textContent).toBe('Commercial owners · highest value first · 0 done · asked Nov 5');
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
    const names = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"] td:nth-child(1)')).map((c) => c.textContent);
    expect(names()).toEqual(['Oak Plaza LLC', 'City Of Midland', 'Vance Robert & Linda']);
    const filters = document.body.querySelector('[aria-label="Filters"]')!;
    expect(Array.from(filters.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['All', 'Has a signal 1', 'Ready to call 1', 'Has email 1', 'Mail only 1', 'Needs you 1', '']);
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
    // Search is just its icon until tapped; an empty box folds back when left.
    const search = document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    expect(search.placeholder).toBe('');
    await act(async () => search.focus());
    expect(search.placeholder).toBe('Search owner, person or street');
    await act(async () => search.blur());
    expect(search.placeholder).toBe('');
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'elm'));
    expect(names()).toEqual(['Vance Robert & Linda']);
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'reyes'));
    expect(names()).toEqual(['City Of Midland']);
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'zzz'));
    expect(document.body.textContent).toContain('Nobody matches those filters.');
  });

  it("the + button's Outreach list asks in plain words, shows the count and a preview, and Save opens the list", async () => {
    await render('/outreach?new=1');
    expect(path).toBe('/outreach');
    const dialog = document.body.querySelector('[role="dialog"][aria-label="Ask for a list"]')!;
    expect(dialog).not.toBeNull();
    expect(Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent)).toContain('Homebuilders');
    const ask = dialog.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => type(ask, 'shopping center owners in Midland'));
    await click('Build');
    expect(interpret).toHaveBeenCalledWith('o1', 'shopping center owners in Midland');
    const built = document.body.querySelector('[data-testid="built"]')!;
    expect(built.textContent).toContain('2 owners');
    expect(built.textContent).toContain('Owners of commercial buildings on the roll; no phone numbers.');
    expect(built.querySelectorAll('[aria-label="Preview"] li')).toHaveLength(2);
    expect(built.textContent).toContain('1 MAIN ST, DALLAS, TX, 75201');
    // Each row shows the owner's holdings, what the list is sorted on: one building's value, or how many properties and their total.
    const previewRows = Array.from(built.querySelectorAll('[aria-label="Preview"] li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(previewRows[0]).toContain('Oak Plaza LLC$3M');
    expect(previewRows[1]).toContain('City Of Midland4 properties · $300K');
    const title = built.querySelector('input#outreach-title') as HTMLInputElement;
    expect(title.value).toBe('Shopping center owners, Midland');
    await act(async () => type(title, 'Strip centers'));
    await click('Save list');
    expect(create).toHaveBeenCalledWith('o1', { county: 'Midland', who: 'commercial' }, 'Strip centers');
    expect(path).toBe('/outreach/l9');
  });

  it('says what it cannot make and builds the closest instead; an example chip fills the ask', async () => {
    interpreted = {
      ok: false,
      explanation: "The roll doesn't say what anyone does for a living.",
      suggestion: { definition: { county: 'Midland', who: 'wealthy', minValueCents: 150_000_000 }, title: 'Homes over $1.5M, Midland' },
    };
    await render('/outreach?new=1');
    // The first working list is one tap: companies holding five or more.
    await click('Company investors with 5 or more properties');
    expect((document.body.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Company investors with 5 or more properties');
    await click('Homes worth over $1M');
    expect((document.body.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Homes worth over $1M');
    await click('Build');
    const cannot = document.body.querySelector('[data-testid="cannot"]')!;
    expect(cannot.textContent).toContain("The roll doesn't say what anyone does for a living.");
    await click('Build the closest instead: Homes over $1.5M, Midland');
    expect(preview).toHaveBeenCalledWith('o1', { county: 'Midland', who: 'wealthy', minValueCents: 150_000_000 });
    expect(document.body.querySelector('[data-testid="built"]')!.textContent).toContain('1 owner');
    expect((document.body.querySelector('input#outreach-title') as HTMLInputElement).value).toBe('Homes over $1.5M, Midland');
    interpreted = { ok: true, definition: { county: 'Midland', who: 'commercial' }, title: 'x', explanation: 'y', count: 2, truncated: false, limited: false, preview: [] };
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
      'https://maps.apple.com/?q=1%20MAIN%20ST%2C%20DALLAS%2C%20TX%2075201',
      'https://maps.apple.com/?q=12%20Midkiff%20Rd%2C%20Midland%2C%20TX',
      'https://midland.tx.publicsearch.us/results?department=RP&limit=50&offset=0&searchOcrText=false&searchType=quickSearch&searchValue=Oak%20Plaza%20LLC',
    ]);
    expect(sheet.querySelector('[data-testid="deeds"]')!.textContent?.trim()).toBe('Deeds at the county clerk');
    // No balance: the unlock waits on funds; the free lookup of the person behind the company doesn't.
    const unlockButton = button('Unlock phone & email · $1');
    expect(unlockButton.disabled).toBe(true);
    expect(sheet.textContent).toContain('Balance $0. Add funds');
    await click('Find the person behind the company · free');
    expect(enrich).toHaveBeenCalledWith('o1', ['r1'], ['person'], undefined);
    await act(async () => type(sheet.querySelector('textarea#outreach-note') as HTMLTextAreaElement, 'Mailed Nov 5'));
    await click('Done');
    expect(setStatus).toHaveBeenCalledWith('o1', 'r1', 'done', 'Mailed Nov 5');
    expect(document.body.textContent).toContain('1 done');
    expect(document.body.querySelector('[data-testid="contact-row"]')!.textContent).toContain('Done');

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
    await act(async () => (document.body.querySelector('button[aria-label="Export CSV"]') as HTMLButtonElement).click());
    expect(made).toEqual(['text/csv']);
    expect(clicks).toEqual(['shopping-center-owners.csv']);
  });

  it('one Look up runs the whole list, $1 a phone from the balance with an estimate; found rows show the person, the ranked phone with its flags, and the email', async () => {
    lists = [list];
    contacts = { ...twoContacts(), balanceCents: 500 };
    await render();
    // No checkboxes: the buttons up top act on everyone the list still needs.
    expect(document.body.querySelector('[data-testid="contact-row"] input[type="checkbox"]')).toBeNull();
    expect(button('Look up 2').title).toBe('up to $2');
    expect(button('Research 2').title).toBe('$0.25 an answer, charged only when the web has something to say');
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
    await click('Look up 2');
    expect(document.body.textContent).toContain('2 phones to find: up to $2.');
    await click('Look them up');
    expect(enrich).toHaveBeenCalledWith('o1', ['r1', 'r2'], undefined, undefined);
    // The bar along the bottom: the lookup started here, owners done, what's been found, what it has cost.
    expect(document.body.querySelector('[data-testid="lookup-progress"]')!.textContent).toBe('Looking up 2 owners · 1 done1 phone · 1 email · 1 person · $1 so far');
    expect(localStorage.getItem('outreach.batch')).toBe('{"at":"2026-11-05T15:00:00Z"}');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(cells(0)[1]).toBe('Dana ReyesManager · 2 sources agree');
    expect(cells(0).slice(2, 4)).toEqual(['(432) 555-0100mobile · verified · +2', 'dana@oakplaza.comverified']);
    // A running cell says what it's doing, and the last thing it found.
    expect(cells(1).slice(1, 4)).toEqual(['Asking the Texas Comptroller…1 source checked', 'Checking the lines…2 numbers', 'Starting…']);
    expect(cells(0)[4]).toBe('—');
    expect(document.body.querySelector('thead')!.textContent).toContain('1 / 2 · 1 source');
    // Nothing left to look up on the list: the top-right button is gone.
    expect(button('Look up')).toBeUndefined();
    await act(async () => (rows[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('Dana Reyes · Manager');
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('From Texas Comptroller · also named by city permits');
    const links = Array.from(sheet.querySelectorAll('[data-testid="contact-details"] a')).map((a) => a.getAttribute('href'));
    // The DNC landline and the litigator's mobile are shown but never dialled from here; Call, Text and Email go to the best clear mobile and the email.
    expect(links).toEqual(['tel:4325550100', 'mailto:dana@oakplaza.com', 'tel:4325550100', 'sms:4325550100', 'mailto:dana@oakplaza.com']);
    expect(sheet.querySelector('[data-testid="reach"]')!.textContent?.replace(/\s+/g, '')).toBe('CallTextEmail');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0100mobile · verifiedline in the name of REYES DANA');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0199landline · DNCon the Do Not Call list');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0177mobile · verified · litigatorknown TCPA litigator');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain("dana@oakplaza.com verified · in the owner's name");
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('From BatchData Nov 5 · $1');
    // The ledger: every source's turn per step, and the owner's cost.
    const how = sheet.querySelector('[data-testid="how-found"]')!.textContent!;
    expect(how).toContain('This owner cost $1.');
    expect(how).toContain('2Person behind the companyFound · freeTexas ComptrollerDana Reyes, Manager');
    expect(how).toContain('3PhoneFound · $1BatchData2 numbersTracerfyNot needed, already found');
    expect(how).toContain('4EmailFound · freeBatchData1 emailTracerfyNot needed, already found');
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
    expect(Array.from(rows[1].querySelectorAll('td'))[4].textContent).toBe('The City of Midland owns the lot; a parks bond passed in 2026.');
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
    const phoneCell = (i: number) => rows[i].querySelectorAll('td')[2];
    expect(phoneCell(0).textContent).toBe('None foundTry again');
    expect(phoneCell(1).textContent).toBe('None found');
    // Only the month-old one is still open to the list's Look up; the fresh "none" isn't asked again.
    expect(button('Look up').textContent).toContain('Look up 1');
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

  it('tells staff when the roll was grouped into owners, or that it failed, with a rebuild; companies see nothing', async () => {
    await render();
    expect(document.body.querySelector('[data-testid="owners-line"]')).toBeNull();
    document.body.innerHTML = '';
    authUser = { id: 'u2', role: 'staff' };
    await render();
    const line = () => document.body.querySelector('[data-testid="owners-line"]')!;
    expect(line().textContent).toContain("The roll hasn't been grouped into owners yet, so every list is empty.");
    await click('Rebuild owners');
    expect(rebuild).toHaveBeenCalled();
    expect(line().textContent).toContain('Grouped 58,418 parcels into owners (44,120 written).');
    document.body.innerHTML = '';
    ownersState = { syncedAt: '2026-11-05T06:40:00Z', parcels: 58_418, owners: 44_120, error: 'JavaScript execution ran out of memory' };
    await render();
    expect(line().textContent).toContain('failed: JavaScript execution ran out of memory');
    // The stack, with this company's numbers.
    sources.mockResolvedValueOnce([
      { name: 'tx-comptroller', fields: ['person'], connected: true, stats: [{ field: 'person', attempts: 4, hits: 3, chargedCents: 0 }] },
      { name: 'batchdata', fields: ['phone', 'email'], connected: false, stats: [{ field: 'phone', attempts: 0, hits: 0, chargedCents: 0 }, { field: 'email', attempts: 0, hits: 0, chargedCents: 0 }] },
      {
        name: 'tracerfy',
        fields: ['phone', 'email'],
        connected: true,
        stats: [
          { field: 'phone', attempts: 2, hits: 1, chargedCents: 100, problem: 'Tracerfy: HTTP 402 (Insufficient credits)', problemAt: '2026-11-05T15:00:00Z' },
          { field: 'email', attempts: 2, hits: 0, chargedCents: 0 },
        ],
      },
    ] as never);
    await click('Data sources');
    const panel = document.body.querySelector('[data-testid="sources-panel"]')!;
    expect(panel.textContent).toContain('1. Texas ComptrollerConnecteddecision maker: 3 / 4 (75%)');
    expect(panel.textContent).toContain('2. BatchDataNot connectedphone: 0 / 0email: 0 / 0');
    // A source whose account needs a hand says so, once, under its numbers.
    const problems = panel.querySelectorAll('[data-testid="source-problem"]');
    expect(problems).toHaveLength(1);
    expect(problems[0].textContent).toBe('Needs attention: Tracerfy: HTTP 402 (Insufficient credits)');
  });

  it('a capped list says how many it reaches and loads the next page on request', async () => {
    lists = [{ ...list, title: 'Real estate investors', who: 'investor', definition: { county: 'Midland', who: 'investor' }, rowCount: 500, total: 2340 }];
    contacts = twoContacts();
    await render('/outreach/l1');
    const total = document.body.querySelector('[data-testid="list-total"]')!;
    expect(total.textContent?.replace(/\s+/g, ' ').trim()).toBe('· 500 of 2,340 loaded Load the next 500');
    await click('Load the next 500');
    expect(extend).toHaveBeenCalledWith('o1', 'l1');
    // The lists and contacts are read again once the page has loaded.
    expect(getContacts).toHaveBeenLastCalledWith('o1', 'l1');
    // A list that already holds everyone it reaches says nothing about a cap.
    document.body.innerHTML = '';
    lists = [{ ...list, rowCount: 2, total: 2 }];
    await render('/outreach/l1');
    expect(document.body.querySelector('[data-testid="list-total"]')).toBeNull();
  });

  it('deletes the open list after asking, and goes back to all contacts', async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    await act(async () => (document.body.querySelector('button[aria-label="Delete list"]') as HTMLButtonElement).click());
    await flush();
    expect(document.body.textContent).toContain('Delete “Shopping center owners”?');
    await click('Delete');
    expect(remove).toHaveBeenCalledWith('o1', 'l1');
    expect(path).toBe('/outreach');
  });
});
