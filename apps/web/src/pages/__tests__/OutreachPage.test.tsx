import { createRoot } from 'react-dom/client';
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
  preview: [contact('r1'), contact('r2', { name: 'City Of Midland' })],
};
const interpret = jest.fn(async () => interpreted);
const preview = jest.fn(async () => ({ count: 1, truncated: false, limited: false, rows: [contact('r1', { name: 'Vance Robert & Linda' })] }));
const create = jest.fn(async () => ({ listId: 'l9', rowCount: 2, added: 2, truncated: false }));
const setStatus = jest.fn(async () => null);
const remove = jest.fn(async () => null);
const enrich = jest.fn(async () => ({ queued: 1, costCents: 100 }));
const sources = jest.fn(async () => []);
const getContacts = jest.fn(async () => contacts);
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
    enrich: (...args: unknown[]) => enrich(...(args as [])),
    sources: (...args: unknown[]) => sources(...(args as [])),
    status: async () => ownersState,
    rebuild: () => rebuild(),
  },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: jest.requireActual<typeof import('react')>('react').createContext({ selectedOrg: { id: 'o1', name: 'Peak Roofing' } }),
}));

import OutreachPage from '../OutreachPage';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
let path = '';
const Where = () => {
  path = useLocation().pathname + useLocation().search;
  return null;
};

async function render(at = '/outreach') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
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
      signals: [{ kind: 'code_violation', date: '2026-09-14', detail: 'High weeds' }],
    }),
  ],
  coverage: coverage(),
  ...money,
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  lists = [];
  contacts = { rows: [], coverage: coverage(0, 0, 0, 0), ...money };
  authUser = { id: 'u1', role: 'user' };
  ownersState = null;
  localStorage.clear();
});

describe('the Outreach page', () => {
  it('shows the contacts table with a chip per list, or says to tap + when there are none', async () => {
    await render();
    expect(document.body.querySelector('[data-testid="outreach-empty"]')!.textContent).toBe('No contacts yet. Tap + and say who you want to reach.');
    expect(document.body.textContent).toContain('the person behind each company, then a phone and email for $1.');
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
    expect(cells(0)).toEqual(['', 'Oak Plaza LLC', '—', '—', '—', '—', 'New', '1 MAIN STDALLAS, TX 75201', '12 Midkiff Rd', '$3M', 'Commercial', '—']);
    expect(cells(1)[8]).toBe('12 Midkiff Rd +3');
    expect(cells(1)[11]).toBe('Code violation Sep 2026');
    expect(rows[0].querySelectorAll('td')[1].className).toContain('sticky');
    expect(document.body.querySelector('[data-testid="more-columns"]')).not.toBeNull();
    const heads = Array.from(document.body.querySelectorAll('thead th')).map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
    expect(heads).toEqual(['', 'Name', 'Decision maker0 / 2 companies', 'Phone0 / 2', 'Email0 / 2', 'Research0 / 2', 'Status', 'Mailing address', 'Property', 'Value', 'Type', 'Signals']);
    await click('Shopping center owners');
    expect(path).toBe('/outreach/l1');
    expect(getContacts).toHaveBeenLastCalledWith('o1', 'l1');
    // The steps over the list: nothing looked up yet, so every bar is "not looked up".
    const steps = document.body.querySelector('[data-testid="steps"]')!;
    expect(steps.textContent).toContain('1Owners in this list2');
    expect(steps.textContent).toContain('2 companies go to step 2 for the person');
    expect(steps.textContent).toContain('Commercial owners · 0 done · asked Nov 5');
    expect(steps.textContent).toContain('2Person behind the company · free0 of 2 companies2 not looked up');
    expect(steps.textContent).toContain('3Phone · $1 when found0 of 22 not looked up$0 charged');
    expect(steps.textContent).toContain('4Email · included0 of 22 not looked up');
    // Hidden, it's one line, and stays hidden on the next visit.
    await click('Hide');
    expect(document.body.querySelector('[data-testid="steps"]')!.textContent).toBe('2 owners0 of 2 people found0 phones0 emailsShow steps');
    expect(localStorage.getItem('outreach.steps')).toBe('hidden');
    await click('Show steps');
    expect(localStorage.getItem('outreach.steps')).toBe('shown');
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
        }),
        contact('r3', { name: 'Vance Robert & Linda', company: undefined, mailing: { address: '9 ELM ST', city: 'ODESSA', state: 'TX', zip: '79761' } }),
      ],
    };
    await render('/outreach/l1');
    const names = () => Array.from(document.body.querySelectorAll('[data-testid="contact-row"] td:nth-child(2)')).map((c) => c.textContent);
    expect(names()).toEqual(['Oak Plaza LLC', 'City Of Midland', 'Vance Robert & Linda']);
    const filters = document.body.querySelector('[aria-label="Filters"]')!;
    expect(Array.from(filters.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['All', 'Ready to call 1', 'Has email 1', 'Needs you 1', 'Columns']);
    const steps = document.body.querySelector('[data-testid="steps"]')!.textContent!;
    expect(steps).toContain('2 companies go to step 2 for the person · 1 person or trust skips to step 3');
    expect(steps).toContain('1 of 2 companies1 found1 need a retry');
    expect(steps).toContain('2 of 32 found1 not looked up$2 charged · 1 on Do Not Call only');
    expect(steps).toContain('1 of 31 found1 none1 not looked up1 verified deliverable');
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
    await act(async () => (filters.querySelector('button') as HTMLButtonElement).click());
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'elm'));
    expect(names()).toEqual(['Vance Robert & Linda']);
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'reyes'));
    expect(names()).toEqual(['City Of Midland']);
    await act(async () => type(document.body.querySelector('input[aria-label="Search"]') as HTMLInputElement, 'zzz'));
    expect(document.body.textContent).toContain('Nobody matches those filters.');
  });

  it('the Columns picker hides columns, says how many are left, remembers the choice, and Show all brings them back', async () => {
    lists = [list];
    contacts = twoContacts();
    await render('/outreach/l1');
    const heads = () => Array.from(document.body.querySelectorAll('thead th')).map((h) => h.textContent?.replace(/\s+/g, ' ').trim().split(/\d/)[0].trim());
    expect(document.body.querySelector('[aria-label="Columns"]')).toBeNull();
    await click('Columns');
    const panel = document.body.querySelector('[aria-label="Columns"]')!;
    expect(Array.from(panel.querySelectorAll('label')).map((l) => l.textContent)).toEqual(['Decision maker', 'Phone', 'Email', 'Research', 'Status', 'Mailing address', 'Property', 'Value', 'Type', 'Signals']);
    const box = (label: string) => Array.from(panel.querySelectorAll('label')).find((l) => l.textContent === label)!.querySelector('input') as HTMLInputElement;
    await act(async () => box('Value').click());
    await act(async () => box('Signals').click());
    expect(heads()).toEqual(['', 'Name', 'Decision maker', 'Phone', 'Email', 'Research', 'Status', 'Mailing address', 'Property', 'Type']);
    expect(button('Columns').textContent).toContain('8 of 10');
    expect(localStorage.getItem('outreach.columns')).toBe('["value","signals"]');
    expect(document.body.querySelectorAll('[data-testid="contact-row"]')[0].querySelectorAll('td')).toHaveLength(10);
    await click('Show all');
    expect(heads()).toHaveLength(12);
    expect(localStorage.getItem('outreach.columns')).toBeNull();
    // Escape closes the panel.
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.body.querySelector('[aria-label="Columns"]')).toBeNull();
    // Next visit: the browser's choice applies before anything is clicked.
    document.body.innerHTML = '';
    localStorage.setItem('outreach.columns', '["research","type","bogus"]');
    await render('/outreach/l1');
    expect(heads()).toEqual(['', 'Name', 'Decision maker', 'Phone', 'Email', 'Status', 'Mailing address', 'Property', 'Value', 'Signals']);
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

  it('ticked rows are looked up together, $1 a phone from the balance with an estimate; found rows show the person, the ranked phone with its flags, and the email', async () => {
    lists = [list];
    contacts = { ...twoContacts(), balanceCents: 500 };
    await render();
    const boxes = document.body.querySelectorAll('[data-testid="contact-row"] input[type="checkbox"]');
    await act(async () => (boxes[0] as HTMLInputElement).click());
    await act(async () => (boxes[1] as HTMLInputElement).click());
    const bar = document.body.querySelector('[data-testid="unlock-bar"]')!;
    expect(bar.textContent).toContain('2 selected');
    expect(bar.textContent).toContain('2 phones to find, up to $2. Balance $5.');
    expect(button('Research 2 · $0.50')).not.toBeUndefined();
    const found = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'batchdata' };
    contacts = {
      rows: [
        contact('r1', {
          enrichment: {
            phone: { ...found, chargedCents: 100, tries: [{ source: 'batchdata', outcome: 'hit', note: '2 numbers' }, { source: 'tracerfy', outcome: 'skipped', note: 'Not needed, already found' }] },
            email: { ...found, tries: [{ source: 'batchdata', outcome: 'hit', note: '1 email' }, { source: 'tracerfy', outcome: 'skipped', note: 'Not needed, already found' }] },
            person: { ...found, source: 'tx-comptroller', tries: [{ source: 'tx-comptroller', outcome: 'hit', note: 'Dana Reyes, Manager' }] },
          },
          person: { name: 'Dana Reyes', title: 'Manager', address: '1 MAIN ST STE 400, DALLAS, TX, 75201', source: 'tx-comptroller' },
          phones: [
            { number: '4325550100', type: 'mobile', verified: true, score: 95, source: 'batchdata', name: 'REYES DANA' },
            { number: '4325550199', type: 'landline', dnc: true, source: 'batchdata' },
          ],
          emails: [{ email: 'dana@oakplaza.com', source: 'batchdata', verified: true }],
        }),
        contact('r2', { name: 'City Of Midland', enrichment: { phone: { status: 'running' }, email: { status: 'running' }, person: { status: 'running' } } }),
      ],
      coverage: coverage(1, 1, 1),
      ...money,
      balanceCents: 400,
      phoneHitRate: 0.5,
    };
    // The top-right button looks up everyone still locked on the list; the bar's button only the ticked rows.
    expect(button('Look up 2').title).toBe('up to $2');
    await act(async () => (bar.querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(enrich).toHaveBeenCalledWith('o1', ['r1', 'r2'], undefined, undefined);
    expect(document.body.textContent).toContain('Looking up 1 owner; $1 at most, charged only for phones found.');
    expect(document.body.querySelector('[data-testid="looking"]')!.textContent).toBe('Looking up 1 owner… 1 of 2 done');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(cells(0)[2]).toBe('Dana ReyesManager');
    expect(cells(0).slice(3, 5)).toEqual(['(432) 555-0100mobile · verified · +1', 'dana@oakplaza.comverified']);
    expect(cells(1).slice(3, 5)).toEqual(['Looking…', 'Looking…']);
    expect(cells(0)[5]).toBe('—');
    expect(document.body.querySelector('thead')!.textContent).toContain('1 / 2 · 1 source');
    expect(document.body.querySelector('[data-testid="unlock-bar"]')).toBeNull();
    // Nothing left to look up on the list: the top-right button is gone.
    expect(button('Look up')).toBeUndefined();
    await act(async () => (rows[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('Dana Reyes · Manager');
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('From Texas Comptroller');
    const links = Array.from(sheet.querySelectorAll('[data-testid="contact-details"] a')).map((a) => a.getAttribute('href'));
    // The DNC landline is shown but never dialled from here; Call, Text and Email go to the best mobile and the email.
    expect(links).toEqual(['tel:4325550100', 'mailto:dana@oakplaza.com', 'tel:4325550100', 'sms:4325550100', 'mailto:dana@oakplaza.com']);
    expect(sheet.querySelector('[data-testid="reach"]')!.textContent?.replace(/\s+/g, '')).toBe('CallTextEmail');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0100mobile · verifiedline in the name of REYES DANA');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0199landline · DNCon the Do Not Call list');
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
    ] as never);
    await click('Data sources');
    const panel = document.body.querySelector('[data-testid="sources-panel"]')!;
    expect(panel.textContent).toContain('1. Texas ComptrollerConnecteddecision maker: 3 / 4 (75%)');
    expect(panel.textContent).toContain('2. BatchDataNot connectedphone: 0 / 0email: 0 / 0');
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
