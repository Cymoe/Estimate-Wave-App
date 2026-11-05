import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  key: `k-${id}`,
  name: 'Oak Plaza LLC',
  company: 'Oak Plaza LLC',
  mailing: { address: '1 MAIN ST', city: 'DALLAS', state: 'TX', zip: '75201' },
  property: { parcelId: 'p1', address: '12 Midkiff Rd', useCode: 'F1', valueCents: 300_000_000 },
  properties: 1,
  totalValueCents: 300_000_000,
  why: 'Commercial building worth $3M',
  status: 'new',
  ...over,
});
let lists: Array<Record<string, unknown>> = [];
const list: Record<string, unknown> = {
  id: 'l1',
  title: 'Shopping center owners',
  who: 'commercial',
  definition: { county: 'Midland', who: 'commercial' },
  rowCount: 2,
  done: 0,
  truncated: false,
  createdAt: '2026-11-05T15:00:00Z',
  rows: [row('r1'), row('r2', { name: 'City Of Midland', company: 'City Of Midland', mailing: { address: '300 N LORAINE ST', city: 'MIDLAND', state: 'TX', zip: '79701' }, why: '4 commercial buildings worth $300K', properties: 4 })],
};
let interpreted: Record<string, unknown> = {
  ok: true,
  definition: { county: 'Midland', who: 'commercial' },
  title: 'Shopping center owners, Midland',
  explanation: 'Owners of commercial buildings on the roll; no phone numbers.',
  count: 2,
  truncated: false,
  limited: false,
  preview: [row('r1'), row('r2', { name: 'City Of Midland' })],
};
const interpret = jest.fn(async () => interpreted);
const preview = jest.fn(async () => ({ count: 1, truncated: false, limited: false, rows: [row('r1', { name: 'Vance Robert & Linda' })] }));
const create = jest.fn(async () => ({ listId: 'l9', rowCount: 2, truncated: false }));
const setStatus = jest.fn(async () => null);
const remove = jest.fn(async () => null);
let ownersState: Record<string, unknown> | null = null;
const rebuild = jest.fn(async () => ({ fetched: 58_418, added: 44_120, updated: 0 }));
let authUser: Record<string, unknown> = { id: 'u1', role: 'user' };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }));
jest.mock('../../lib/api', () => ({
  outreachAPI: {
    lists: async () => lists,
    get: async () => list,
    interpret: (...args: unknown[]) => interpret(...(args as [])),
    preview: (...args: unknown[]) => preview(...(args as [])),
    create: (...args: unknown[]) => create(...(args as [])),
    setStatus: (...args: unknown[]) => setStatus(...(args as [])),
    remove: (...args: unknown[]) => remove(...(args as [])),
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

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  lists = [];
  authUser = { id: 'u1', role: 'user' };
  ownersState = null;
});

describe('the Outreach page', () => {
  it('lists the saved lists, or says to tap + when there are none', async () => {
    await render();
    expect(document.body.querySelector('[data-testid="outreach-empty"]')!.textContent).toBe('No lists yet. Tap + and say who you want to reach.');
    expect(document.body.textContent).toContain('Names and mailing addresses; no phone numbers.');
    document.body.innerHTML = '';
    lists = [{ ...list, rows: undefined }];
    await render();
    const item = document.body.querySelector('[aria-label="Lists"] li')!;
    expect(item.textContent).toContain('Shopping center owners');
    expect(item.textContent).toContain('Commercial owners · 2 owners · 0 done');
    await act(async () => (item.querySelector('button') as HTMLButtonElement).click());
    expect(path).toBe('/outreach/l1');
  });

  it("the + button's Outreach list asks in plain words, shows the count and a preview, and Save opens the list", async () => {
    await render('/outreach?new=1');
    expect(path).toBe('/outreach');
    const dialog = document.body.querySelector('[role="dialog"][aria-label="Ask for a list"]')!;
    expect(dialog).not.toBeNull();
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

  it('a list shows its people; one opens to both addresses in Apple Maps and a status; CSV exports it', async () => {
    await render('/outreach/l1');
    const view = document.body.querySelector('[data-testid="outreach-list"]')!;
    expect(view.querySelector('h1')!.textContent).toBe('Shopping center owners');
    expect(view.textContent).toContain('Commercial owners · 2 owners · 0 done');
    const rows = view.querySelectorAll('[data-testid="outreach-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Oak Plaza LLC');
    expect(rows[0].textContent).toContain('1 MAIN ST, DALLAS, TX, 75201');
    expect(rows[0].textContent).toContain('12 Midkiff Rd · $3M · Commercial building worth $3M');

    await act(async () => (rows[0] as HTMLButtonElement).click());
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Oak Plaza LLC"]')!;
    const links = Array.from(sheet.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      'https://maps.apple.com/?q=1%20MAIN%20ST%2C%20DALLAS%2C%20TX%2075201',
      'https://maps.apple.com/?q=12%20Midkiff%20Rd%2C%20Midland%2C%20TX',
    ]);
    await act(async () => type(sheet.querySelector('textarea') as HTMLTextAreaElement, 'Mailed Nov 5'));
    await click('Done');
    expect(setStatus).toHaveBeenCalledWith('o1', 'r1', 'done', 'Mailed Nov 5');
    expect(view.textContent).toContain('1 done');
    expect(document.body.querySelector('[data-testid="outreach-row"]')!.textContent).toContain('Done');

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

  it('deletes a list after asking, and goes back to the lists', async () => {
    await render('/outreach/l1');
    await act(async () => (document.body.querySelector('button[aria-label="Delete list"]') as HTMLButtonElement).click());
    await flush();
    expect(document.body.textContent).toContain('Delete “Shopping center owners”?');
    await click('Delete');
    expect(remove).toHaveBeenCalledWith('o1', 'l1');
    expect(path).toBe('/outreach');
  });
});
