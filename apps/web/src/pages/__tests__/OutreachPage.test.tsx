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
  createdAt: '2026-11-05T15:00:00Z',
  ...over,
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
let contacts: Record<string, unknown> = { rows: [], balanceCents: 0, unlockCents: 100 };
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
const requestUnlock = jest.fn(async () => ({ queued: 1, costCents: 100 }));
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
    requestUnlock: (...args: unknown[]) => requestUnlock(...(args as [])),
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
  rows: [contact('r1'), contact('r2', { name: 'City Of Midland', company: 'City Of Midland', mailing: { address: '300 N LORAINE ST', city: 'MIDLAND', state: 'TX', zip: '79701' }, why: '4 commercial buildings worth $300K', properties: 4 })],
  balanceCents: 0,
  unlockCents: 100,
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  lists = [];
  contacts = { rows: [], balanceCents: 0, unlockCents: 100 };
  authUser = { id: 'u1', role: 'user' };
  ownersState = null;
});

describe('the Outreach page', () => {
  it('shows the contacts table with a chip per list, or says to tap + when there are none', async () => {
    await render();
    expect(document.body.querySelector('[data-testid="outreach-empty"]')!.textContent).toBe('No contacts yet. Tap + and say who you want to reach.');
    expect(document.body.textContent).toContain('unlock a phone and email for $1.');
    document.body.innerHTML = '';
    lists = [list];
    contacts = twoContacts();
    await render();
    const chips = Array.from(document.body.querySelectorAll('[aria-label="Lists"] button')).map((b) => b.textContent?.trim());
    expect(chips).toEqual(['All', 'Shopping center owners 2']);
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    expect(rows).toHaveLength(2);
    const cells = Array.from(rows[0].querySelectorAll('td')).map((c) => c.textContent?.trim());
    expect(cells).toEqual(['', 'Oak Plaza LLC', '1 MAIN ST', 'DALLAS', 'TX', '75201', '12 Midkiff Rd', '$3M', 'Commercial', 'Locked', 'Locked', 'New']);
    expect(Array.from(rows[1].querySelectorAll('td')).map((c) => c.textContent?.trim())[6]).toBe('12 Midkiff Rd +3');
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

  it('a contact opens to both addresses in Apple Maps, the unlock and a status; CSV exports the table', async () => {
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
    // No balance: the unlock waits on funds.
    const unlockButton = button('Unlock phone & email · $1');
    expect(unlockButton.disabled).toBe(true);
    expect(sheet.textContent).toContain('Balance $0. Add funds');
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

  it('ticked rows unlock together for $1 each from the balance; a found contact shows its phone and email', async () => {
    lists = [list];
    contacts = { ...twoContacts(), balanceCents: 500 };
    await render();
    const boxes = document.body.querySelectorAll('[data-testid="contact-row"] input[type="checkbox"]');
    await act(async () => (boxes[0] as HTMLInputElement).click());
    await act(async () => (boxes[1] as HTMLInputElement).click());
    const bar = document.body.querySelector('[data-testid="unlock-bar"]')!;
    expect(bar.textContent).toContain('2 selected');
    expect(bar.textContent).toContain('Balance $5.');
    contacts = {
      rows: [
        contact('r1', { unlock: { status: 'found', at: '2026-11-05T15:01:00Z', vendor: 'batchdata', chargedCents: 100 }, phones: [{ number: '4325550100', type: 'mobile', source: 'batchdata' }], emails: [{ email: 'owner@oakplaza.com', source: 'batchdata' }] }),
        contact('r2', { name: 'City Of Midland', unlock: { status: 'pending', at: '2026-11-05T15:01:00Z' } }),
      ],
      balanceCents: 400,
      unlockCents: 100,
    };
    await click('Unlock 2 for $2');
    expect(requestUnlock).toHaveBeenCalledWith('o1', ['r1', 'r2']);
    expect(document.body.textContent).toContain('Looking up 1 owner; $1 at most, charged only for phones found.');
    const rows = document.body.querySelectorAll('[data-testid="contact-row"]');
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => c.textContent?.trim());
    expect(cells(0).slice(9, 11)).toEqual(['(432) 555-0100', 'owner@oakplaza.com']);
    expect(cells(1).slice(9, 11)).toEqual(['Looking…', 'Looking…']);
    expect(document.body.querySelector('[data-testid="unlock-bar"]')).toBeNull();
    await act(async () => (rows[0] as HTMLTableRowElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    const links = Array.from(sheet.querySelectorAll('[data-testid="contact-details"] a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['tel:4325550100', 'mailto:owner@oakplaza.com']);
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
