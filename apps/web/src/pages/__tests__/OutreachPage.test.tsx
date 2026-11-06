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
  enrichment: { phone: { status: 'locked' }, email: { status: 'locked' }, person: { status: 'locked' } },
  signals: [],
  createdAt: '2026-11-05T15:00:00Z',
  ...over,
});
const coverage = (phone = 0, email = 0, person = 0, total = 2) => ({
  phone: { found: phone, total, sources: phone ? 1 : 0 },
  email: { found: email, total, sources: email ? 1 : 0 },
  person: { found: person, total, sources: person ? 1 : 0 },
});
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
let contacts: Record<string, unknown> = { rows: [], coverage: coverage(0, 0, 0, 0), balanceCents: 0, unlockCents: 100 };
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
  balanceCents: 0,
  unlockCents: 100,
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  lists = [];
  contacts = { rows: [], coverage: coverage(0, 0, 0, 0), balanceCents: 0, unlockCents: 100 };
  authUser = { id: 'u1', role: 'user' };
  ownersState = null;
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
    expect(cells(0)).toEqual(['', 'Oak Plaza LLC', '—', '—', '—', 'New', '1 MAIN ST', 'DALLAS', 'TX', '75201', '12 Midkiff Rd', '$3M', 'Commercial', '—']);
    expect(cells(1)[10]).toBe('12 Midkiff Rd +3');
    expect(cells(1)[13]).toBe('Code violation Sep 2026');
    expect(rows[0].querySelectorAll('td')[1].className).toContain('sticky');
    expect(document.body.querySelector('[data-testid="more-columns"]')).not.toBeNull();
    const heads = Array.from(document.body.querySelectorAll('thead th')).map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
    expect(heads).toEqual(['', 'Name', 'Decision maker0 / 2 companies', 'Phone0 / 2', 'Email0 / 2', 'Status', 'Mailing address', 'City', 'State', 'Zip', 'Property', 'Value', 'Type', 'Signals']);
    await click('Shopping center owners');
    expect(path).toBe('/outreach/l1');
    expect(getContacts).toHaveBeenLastCalledWith('o1', 'l1');
    expect(document.body.textContent).toContain('Commercial owners · 2 owners · 0 done');
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
    ]);
    // No balance: the unlock waits on funds; the free lookup of the person behind the company doesn't.
    const unlockButton = button('Unlock phone & email · $1');
    expect(unlockButton.disabled).toBe(true);
    expect(sheet.textContent).toContain('Balance $0. Add funds');
    await click('Find the person behind the company · free');
    expect(enrich).toHaveBeenCalledWith('o1', ['r1'], ['person']);
    await act(async () => type(sheet.querySelector('textarea') as HTMLTextAreaElement, 'Mailed Nov 5'));
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
    const found = { status: 'found', at: '2026-11-05T15:01:00Z', source: 'batchdata' };
    contacts = {
      rows: [
        contact('r1', {
          enrichment: { phone: { ...found, chargedCents: 100 }, email: found, person: { ...found, source: 'tx-comptroller' } },
          person: { name: 'Dana Reyes', title: 'Manager', address: '1 MAIN ST STE 400, DALLAS, TX, 75201', source: 'tx-comptroller' },
          phones: [
            { number: '4325550100', type: 'mobile', verified: true, score: 95, source: 'batchdata' },
            { number: '4325550199', type: 'landline', dnc: true, source: 'batchdata' },
          ],
          emails: [{ email: 'dana@oakplaza.com', source: 'batchdata', verified: true }],
        }),
        contact('r2', { name: 'City Of Midland', enrichment: { phone: { status: 'running' }, email: { status: 'running' }, person: { status: 'running' } } }),
      ],
      coverage: coverage(1, 1, 1),
      balanceCents: 400,
      unlockCents: 100,
      phoneHitRate: 0.5,
    };
    // The top-right button looks up everyone still locked on the list; the bar's button only the ticked rows.
    expect(button('Look up 2').title).toBe('up to $2');
    await act(async () => (bar.querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(enrich).toHaveBeenCalledWith('o1', ['r1', 'r2'], undefined);
    expect(document.body.textContent).toContain('Looking up 1 owner; $1 at most, charged only for phones found.');
    expect(document.body.querySelector('[data-testid="looking"]')!.textContent).toBe('Looking up 1 owner…');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(cells(0)[2]).toBe('Dana ReyesManager');
    expect(cells(0).slice(3, 5)).toEqual(['(432) 555-0100mobile · verified · +1', 'dana@oakplaza.comverified']);
    expect(cells(1).slice(3, 5)).toEqual(['Looking…', 'Looking…']);
    expect(document.body.querySelector('thead')!.textContent).toContain('1 / 2 · 1 source');
    expect(document.body.querySelector('[data-testid="unlock-bar"]')).toBeNull();
    // Nothing left to look up on the list: the top-right button is gone.
    expect(button('Look up')).toBeUndefined();
    await act(async () => (rows[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('Dana Reyes · Manager');
    expect(sheet.querySelector('[data-testid="decision-maker"]')!.textContent).toContain('From Texas Comptroller');
    const links = Array.from(sheet.querySelectorAll('[data-testid="contact-details"] a')).map((a) => a.getAttribute('href'));
    // The DNC landline is shown but never dialled from here.
    expect(links).toEqual(['tel:4325550100', 'mailto:dana@oakplaza.com']);
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('(432) 555-0199landline · DNCon the Do Not Call list');
    expect(sheet.querySelector('[data-testid="contact-details"]')!.textContent).toContain('From BatchData Nov 5 · $1');
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
