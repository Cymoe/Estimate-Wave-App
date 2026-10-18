import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOUR = 3_600_000;
const listedAt = new Date(Date.now() - 2.5 * HOUR).toISOString();
const auction = { startCents: 8500, floorCents: 2000, dropCents: 500, dropEveryMs: HOUR, listedAt };
let balanceCents = 10000;
let feed: unknown[] = [];
let bids: unknown[] = [];
const buy = jest.fn(async () => ({ orgLeadId: 'ol1' }));
const placeBid = jest.fn(async () => ({ bidId: 'b1', fillsAt: '' }));
const cancelBid = jest.fn(async () => undefined);
const createLink = jest.fn(async (_id: string) => 'tok');
const trial = { status: 'trial', active: true, monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, claimsLeft: 7, nextClaimCents: 0, periodStart: '2026-10-01T00:00:00Z', nextChargeAt: '2026-10-31T00:00:00Z' };
let older: unknown = { locked: true, count: 2, plan: null, leads: [] };
const claim = jest.fn(async () => ({ orgLeadId: 'ol2', priceCents: 0, claimsLeft: 6 }));
const startPlan = jest.fn(async () => ({ ...trial, status: 'active' }));

jest.mock('../../lib/api', () => ({
  walletAPI: {
    get: async () => ({ balanceCents, typicalLeadCents: 5000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, openBids: 0, transactions: [] }),
    feed: async () => feed,
    bids: async () => bids,
    buy: (...a: unknown[]) => buy(...(a as [])),
    placeBid: (...a: unknown[]) => placeBid(...(a as [])),
    cancelBid: (...a: unknown[]) => cancelBid(...(a as [])),
    olderLeads: async () => older,
    claim: (...a: unknown[]) => claim(...(a as [])),
    startPlan: (...a: unknown[]) => startPlan(...(a as [])),
    cancelPlan: async () => undefined,
  },
  fundingAPI: { createLink: (id: string) => createLink(id), url: (t: string) => `/fund/${t}` },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o2', name: 'Mio Homes', industry: 'Landscaping' } }),
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' } }) }));

import MarketplacePage, { span } from '../MarketplacePage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.trim() === text);

async function render(path = '/marketplace') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter initialEntries={[path]}><MarketplacePage /></MemoryRouter>));
  await flush();
  return container;
}

beforeEach(() => {
  feed = [
    { id: 'm1', jobType: 'landscaping', tradeName: 'Landscaping', city: 'Midland', summary: 'Backyard redo', receivedAt: listedAt, auction, matchesTrades: true },
    { id: 'm2', jobType: 'roofing', tradeName: 'Roofing', city: 'Odessa', receivedAt: listedAt, auction, matchesTrades: false },
  ];
  bids = [];
  balanceCents = 10000;
  older = { locked: true, count: 2, plan: null, leads: [] };
});
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('Marketplace', () => {
  it('formats countdowns', () => {
    expect(span(30_000)).toBe('now');
    expect(span(59 * 60_000)).toBe('59m');
    expect(span(21 * HOUR + 33 * 60_000)).toBe('21h 33m');
  });

  it('shows the current price, next drop and floor, and buys at the current price', async () => {
    await render();
    const table = document.body.querySelector('[data-testid="marketplace-table"]')!;
    // Listed 2.5h ago at $85, dropping $5 an hour: $75 now, $70 in ~30m, floor $20 after 13 drops.
    expect(table.textContent).toContain('Midland');
    expect(table.textContent).toContain('$75.00');
    expect(table.textContent).toMatch(/\$70\.00 ~(29|30)m/);
    expect(table.textContent).toContain('$20.00');
    expect(table.textContent).toMatch(/10h (29|30)m/);
    // "My trades" is on, so the roofing lead is hidden until it's switched off.
    expect(table.textContent).not.toContain('Odessa');
    await act(async () => byText('My trades')!.click());
    expect(document.body.querySelector('[data-testid="marketplace-table"]')!.textContent).toContain('Odessa');

    await act(async () => buttons().find((b) => b.textContent === 'Buy now')!.click());
    expect(document.body.textContent).toContain('Buy for $75.00?');
    await act(async () => byText('Buy')!.click());
    await flush();
    expect(buy).toHaveBeenCalledWith('m1', 'o2');
    expect(document.body.textContent).toContain('Lead bought');
  });

  it('places a buy order at the next drop price, then cancels it', async () => {
    await render();
    await act(async () => buttons().find((b) => b.textContent === 'Place buy order')!.click());
    const price = document.body.querySelector('input[aria-label="Buy order price"]') as HTMLInputElement;
    expect(price.value).toBe('70');
    await act(async () => byText('Place order')!.click());
    await flush();
    expect(placeBid).toHaveBeenCalledWith('m1', 'o2', 70);
    expect(document.body.textContent).toContain('Buy order placed at $70.00');

    feed = [{ ...(feed[0] as object), myBid: { id: 'b1', maxCents: 7000 } }];
    bids = [{ id: 'b1', leadId: 'm1', city: 'Midland', jobType: 'landscaping', maxCents: 7000, status: 'open', createdAt: listedAt }];
    document.body.innerHTML = '';
    await render();
    expect(document.body.textContent).toMatch(/Buy order \$70\.00 · fills in ~(29|30)m/);
    expect(document.body.textContent).toContain('Open at $70.00');
    await act(async () => byText('Cancel')!.click());
    await flush();
    expect(cancelBid).toHaveBeenCalledWith('b1');
  });

  it('asks for funds when the balance is too low', async () => {
    balanceCents = 1000;
    await render();
    expect(byText('Buy now')).toBeUndefined();
    await act(async () => byText('Add funds to buy')!.click());
    await flush();
    expect(createLink).toHaveBeenCalledWith('o2');
  });

  it('keeps Older leads behind the plan: the pitch with the count, and Start the plan', async () => {
    await render('/marketplace?tab=older');
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Older leads · 2');
    expect(document.body.textContent).toContain('2 older leads in your trades are waiting');
    expect(document.body.querySelector('[data-testid="plan-panel"]')?.textContent).toContain('$99.00');
    expect(document.body.querySelector('[data-testid="older-table"]')).toBeNull();
    await act(async () => byText('Start the plan')!.click());
    await flush();
    expect(startPlan).toHaveBeenCalledWith('o2');
    expect(document.body.textContent).toContain("You're on the plan");
  });

  it('lists older leads for a company on the plan and claims one', async () => {
    older = {
      locked: false,
      count: 1,
      plan: trial,
      leads: [{ id: 'm9', jobType: 'landscaping', tradeName: 'Landscaping', city: 'Midland', county: 'Midland', summary: 'Sod and drip', receivedAt: listedAt, ageDays: 9, matchesTrades: true }],
    };
    await render('/marketplace?tab=older');
    expect(document.body.textContent).toContain('7 of 10 claims left this month');
    const table = document.body.querySelector('[data-testid="older-table"]')!;
    expect(table.textContent).toContain('Midland · Midland County');
    expect(table.textContent).toContain('9 days');
    await act(async () => byText('Claim · included')!.click());
    await flush();
    expect(claim).toHaveBeenCalledWith('m9', 'o2');
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Lead claimed');

    // Past the allowance the button carries the price.
    older = { ...(older as object), plan: { ...trial, claimsLeft: 0, nextClaimCents: 1500 } };
    document.body.innerHTML = '';
    await render('/marketplace?tab=older');
    expect(byText('Claim · $15.00')).toBeTruthy();
    expect(document.body.textContent).toContain('$15.00 each after that');
  });
});
