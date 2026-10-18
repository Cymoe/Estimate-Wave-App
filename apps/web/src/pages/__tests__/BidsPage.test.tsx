import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MINUTE = 60_000;
let balanceCents = 100_000;
let standing: unknown[] = [];
let open: unknown[] = [];
let results: unknown[] = [];
const setStanding = jest.fn(async (_org: string, _county: string, _jobType: string, _amount: number) => 'sb1');
const removeStanding = jest.fn(async (_id: string) => undefined);
const raise = jest.fn(async (_lead: string, _org: string, _amount: number) => ({ bidId: 'b1', amountCents: 26000 }));
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
    rounds: async () => ({ open, results, roundMinutes: 60 }),
    raise: (...a: unknown[]) => raise(...(a as [string, string, number])),
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
  open = [];
  results = [];
});
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('Bids', () => {
  it('walks a new company through where, what and how much, then saves one standing bid per county', async () => {
    await render();
    // No bids yet, so it opens on My bids with the stepped form.
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('My bids');
    expect(document.body.textContent).toContain('Which counties do you work in?');
    const counties = document.body.querySelector('[aria-label="Counties"]')!;
    // West Texas first.
    expect(counties.textContent?.startsWith('MidlandEctorHoward')).toBe(true);
    expect(byText('Next')!.disabled).toBe(true);
    const tick = (name: string) => act(async () => (Array.from(counties.querySelectorAll('label')).find((l) => l.textContent === name)!.querySelector('input') as HTMLInputElement).click());
    await tick('Midland');
    await tick('Ector');
    await act(async () => byText('Next')!.click());
    // Their own trade is preselected.
    const service = document.body.querySelector('select[aria-label="Service type"]') as HTMLSelectElement;
    expect(service.value).toBe('landscaping');
    expect(Array.from(service.options).map((o) => o.textContent)).toEqual(['Choose a service', 'Landscaping', 'Roofing']);
    await act(async () => byText('Next')!.click());
    expect(input('Bid amount').value).toBe('200');
    expect(document.body.textContent).toContain('covers about 5 leads');
    await act(async () => type(input('Bid amount'), '150'));
    expect(document.body.textContent).toContain('Bids start at $200.00');
    expect(byText('Start bidding')!.disabled).toBe(true);
    await act(async () => type(input('Bid amount'), '250'));
    await act(async () => byText('Start bidding')!.click());
    await flush();
    expect(setStanding.mock.calls).toEqual([['o2', 'Midland', 'landscaping', 250], ['o2', 'Ector', 'landscaping', 250]]);
    expect(document.body.textContent).toContain("You're set: new Landscaping leads in 2 counties open a round for you automatically, at $250.00.");
  });

  it('shows the open round with where the company stands and lets it raise by $10 or more', async () => {
    standing = [{ id: 'sb1', county: 'Midland', jobType: 'landscaping', amountCents: 25000 }];
    open = [{
      bidId: 'b1', leadId: 'm1', jobType: 'landscaping', county: 'Midland', city: 'Midland', summary: 'Backyard redo',
      opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 42 * MINUTE).toISOString(), myBidCents: 25000, highest: false, bidders: 2,
    }];
    results = [{ bidId: 'b0', leadId: 'm0', jobType: 'landscaping', county: 'Ector', myBidCents: 25000, won: true, resolvedAt: new Date().toISOString() }];
    await render();
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Open rounds (1)');
    const card = document.body.querySelector('[aria-label="Open rounds"] li')!;
    expect(card.textContent).toContain('Landscaping · Midland County');
    expect(card.textContent).toMatch(/2 bidders · closes in 4[12]m/);
    expect(card.textContent).toContain('Your bid $250.00');
    expect(card.textContent).toContain('Outbid');
    await act(async () => byText('Raise bid')!.click());
    expect(input('Raise to').value).toBe('260');
    await act(async () => type(input('Raise to'), '255'));
    expect(byText('Raise')!.disabled).toBe(true);
    expect(card.textContent).toContain('At least $260.00');
    await act(async () => type(input('Raise to'), '300'));
    await act(async () => byText('Raise')!.click());
    await flush();
    expect(raise).toHaveBeenCalledWith('m1', 'o2', 300);
    expect(document.body.textContent).toContain('Raised to $300.00');
    expect(document.body.querySelector('[aria-label="Recent results"]')?.textContent).toContain('Won at $250.00 · now in your Leads');
  });

  it('lists standing bids with edit and remove, and a one-row form to add more', async () => {
    standing = [{ id: 'sb1', county: 'Midland', jobType: 'landscaping', amountCents: 25000 }];
    await render('/bids?tab=bids');
    const table = document.body.querySelector('[aria-label="My standing bids"]')!;
    expect(table.textContent).toContain('Midland County');
    expect(table.textContent).toContain('$250.00');
    expect(document.body.textContent).toContain('Add a bid');
    expect(document.body.textContent).not.toContain('Which counties do you work in?');
    await act(async () => byText('$250.00')!.click());
    await act(async () => type(input('Bid for Landscaping in Midland'), '275'));
    await act(async () => (document.body.querySelector('button[aria-label="Save bid"]') as HTMLButtonElement).click());
    await flush();
    expect(setStanding).toHaveBeenCalledWith('o2', 'Midland', 'landscaping', 275);
    await act(async () => (document.body.querySelector('button[aria-label="Remove bid for Landscaping in Midland"]') as HTMLButtonElement).click());
    await flush();
    expect(removeStanding).toHaveBeenCalledWith('sb1');
  });

  it('opens the Marketplace tab from the link the wallet bar uses', async () => {
    await render('/bids?tab=marketplace');
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Marketplace');
    expect(document.body.textContent).toContain('My trades');
  });
});
