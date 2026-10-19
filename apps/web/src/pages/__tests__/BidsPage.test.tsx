import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let balanceCents = 100_000;
let standing: unknown[] = [];
let results: unknown[] = [];
const setStanding = jest.fn(async (_org: string, _county: string, _jobType: string, _amount: number) => 'sb1');
const removeStanding = jest.fn(async (_id: string) => undefined);
const createLink = jest.fn(async (_id: string) => 'tok');

jest.mock('../../lib/api', () => ({
  walletAPI: {
    get: async () => ({ balanceCents, typicalLeadCents: 20000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, leadTrades: ['landscaping'], transactions: [] }),
    feed: async () => [],
    bids: async () => [],
  },
  bidsAPI: {
    listStanding: async () => standing,
    setStanding: (...a: unknown[]) => setStanding(...(a as [string, string, string, number])),
    removeStanding: (id: string) => removeStanding(id),
    results: async () => results,
  },
  industriesAPI: { list: async () => [{ id: 'roofing', name: 'Roofing' }, { id: 'landscaping', name: 'Landscaping' }] },
  fundingAPI: { createLink: (id: string) => createLink(id), url: (t: string) => `/fund/${t}` },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o2', name: 'Mio Homes', industry: 'Landscaping' } }),
}));

import BidsPage from '../BidsPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const input = (label: string) => document.body.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const dialog = () => document.body.querySelector('[role="dialog"]');

async function render(path = '/bids') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter initialEntries={[path]}><BidsPage /></MemoryRouter>));
  await flush();
  return container;
}

beforeEach(() => {
  balanceCents = 100_000;
  standing = [];
  results = [];
});
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('Bids', () => {
  it('walks a new company through where, what and how much in a dialog, then saves one standing bid per county', async () => {
    await render();
    expect(document.body.textContent).toContain('go to the highest bid the moment they come in');
    expect(document.body.querySelector('[role="tablist"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Recent results');
    expect(dialog()).toBeNull();
    await act(async () => byText('Set your bids')!.click());
    // Everything on one screen: where, what and how much, no steps.
    expect(dialog()?.textContent).toContain('Which counties do you work in?');
    expect(dialog()?.textContent).toContain('What kind of work?');
    expect(dialog()?.textContent).toContain("What's a lead worth to you?");
    expect(dialog()!.querySelector('[aria-label="Steps"]')).toBeNull();
    expect(byText('Next')).toBeUndefined();
    expect(byText('Start bidding')!.disabled).toBe(true);
    // Type a county, or a town and get its county.
    const matches = () => Array.from(dialog()!.querySelectorAll('[aria-label="Counties"] button'));
    await act(async () => type(input('Search counties'), 'Mid'));
    expect(matches().map((b) => b.textContent)).toEqual(['Midland County']);
    await act(async () => (matches()[0] as HTMLButtonElement).click());
    await act(async () => type(input('Search counties'), 'Odessa'));
    expect(matches()[0].textContent).toBe('Ector CountyOdessa is in Ector County');
    await act(async () => (matches()[0] as HTMLButtonElement).click());
    expect(dialog()!.querySelector('[aria-label="Chosen counties"]')?.textContent).toBe('Midland CountyEctor County');
    expect(input('Search counties').value).toBe('');
    // Their own trade is already lit; the rest are a tap away. No drop-down.
    const chips = () => Array.from(dialog()!.querySelectorAll('[role="group"][aria-label="Services"] button')) as HTMLButtonElement[];
    const pressed = () => chips().filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent);
    expect(chips().map((c) => c.textContent)).toEqual(['Landscaping', 'Roofing']);
    expect(pressed()).toEqual(['Landscaping']);
    expect(dialog()!.querySelector('select')).toBeNull();
    await act(async () => chips().find((c) => c.textContent === 'Roofing')!.click());
    expect(pressed()).toEqual(['Landscaping', 'Roofing']);
    // Tapping a lit chip turns it off, and with none lit there is nothing to save.
    await act(async () => chips().find((c) => c.textContent === 'Landscaping')!.click());
    await act(async () => chips().find((c) => c.textContent === 'Roofing')!.click());
    expect(pressed()).toEqual([]);
    expect(byText('Start bidding')!.disabled).toBe(true);
    await act(async () => chips().find((c) => c.textContent === 'Landscaping')!.click());
    await act(async () => chips().find((c) => c.textContent === 'Roofing')!.click());
    expect(input('Bid amount').value).toBe('200');
    expect(dialog()!.textContent).toContain('covers about 5 leads');
    await act(async () => type(input('Bid amount'), '150'));
    expect(dialog()!.textContent).toContain('Bids start at $200.00');
    expect(byText('Start bidding')!.disabled).toBe(true);
    await act(async () => type(input('Bid amount'), '250'));
    await act(async () => byText('Start bidding')!.click());
    await flush();
    expect(setStanding.mock.calls).toEqual([
      ['o2', 'Midland', 'landscaping', 250],
      ['o2', 'Midland', 'roofing', 250],
      ['o2', 'Ector', 'landscaping', 250],
      ['o2', 'Ector', 'roofing', 250],
    ]);
    expect(dialog()).toBeNull();
    expect(document.body.textContent).toContain("You're set: new Landscaping and Roofing leads in 2 counties go to you the moment they come in, at $250.00, while your bid is the highest.");
  });

  it('shows where each standing bid stands, lets the company edit or remove it, and opens the dialog to add more', async () => {
    standing = [
      { id: 'sb1', county: 'Midland', jobType: 'landscaping', amountCents: 25000, funded: true, leading: true, contested: false },
      { id: 'sb2', county: 'Ector', jobType: 'landscaping', amountCents: 25000, funded: true, leading: false, contested: true },
      { id: 'sb3', county: 'Howard', jobType: 'roofing', amountCents: 150000, funded: false, leading: false, contested: false },
    ];
    await render();
    const rows = Array.from(document.body.querySelectorAll('[aria-label="My standing bids"] tbody tr'));
    expect(rows[0].textContent).toContain('Midland County');
    expect(rows[0].textContent).toContain('Highest here');
    expect(rows[1].textContent).toContain('Outbid here · raise to win the next lead');
    expect(rows[2].textContent).toContain('Add funds to cover this bid');
    await act(async () => (rows[0].querySelector('button') as HTMLButtonElement).click());
    await act(async () => type(input('Bid for Landscaping in Midland'), '275'));
    await act(async () => (document.body.querySelector('button[aria-label="Save bid"]') as HTMLButtonElement).click());
    await flush();
    expect(setStanding).toHaveBeenCalledWith('o2', 'Midland', 'landscaping', 275);
    await act(async () => (document.body.querySelector('button[aria-label="Remove bid for Landscaping in Ector"]') as HTMLButtonElement).click());
    await flush();
    expect(removeStanding).toHaveBeenCalledWith('sb2');
    await act(async () => byText('Add bid')!.click());
    expect(dialog()?.querySelector('#modal-title')?.textContent).toBe('Add a bid');
    await act(async () => (dialog()!.querySelector('button[aria-label="Close modal"]') as HTMLButtonElement).click());
    expect(dialog()).toBeNull();
  });

  it('lists what the bids won and missed under the bids, on the same screen', async () => {
    standing = [{ id: 'sb1', county: 'Midland', jobType: 'landscaping', amountCents: 25000, funded: true, leading: true, contested: false }];
    results = [
      { bidId: 'b1', leadId: 'm1', jobType: 'landscaping', county: 'Midland', city: 'Midland', myBidCents: 25000, won: true, resolvedAt: '2026-10-18T12:00:00Z' },
      { bidId: 'b2', leadId: 'm2', jobType: 'landscaping', county: 'Ector', myBidCents: 25000, won: false, outcome: 'Outbid: a higher bid won it', resolvedAt: '2026-10-17T12:00:00Z' },
    ];
    await render();
    expect(document.body.textContent).toContain('1 standing bid · 1 lead won');
    expect(document.body.querySelector('[aria-label="My standing bids"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Recent results');
    const items = Array.from(document.body.querySelectorAll('[aria-label="Results"] li'));
    expect(items[0].textContent).toContain('Landscaping · Midland County · Midland');
    expect(items[0].textContent).toContain('Won at $250.00 · now in your Leads');
    expect(items[1].textContent).toContain('Outbid: a higher bid won it');
    expect(Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === 'Marketplace')?.getAttribute('href')).toBe('/marketplace');
  });

  it('sends old Marketplace-tab links to the Marketplace page', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter initialEntries={['/bids?tab=marketplace']}>
          <Routes>
            <Route path="/bids" element={<BidsPage />} />
            <Route path="/marketplace" element={<p>Marketplace page</p>} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await flush();
    expect(document.body.textContent).toContain('Marketplace page');
  });
});
