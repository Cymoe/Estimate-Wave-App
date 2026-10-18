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
let olderLeads = 0;

jest.mock('../../lib/api', () => ({
  walletAPI: {
    get: async () => ({ balanceCents, typicalLeadCents: 5000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, openBids: 0, olderLeads, transactions: [] }),
    feed: async () => feed,
    bids: async () => bids,
    buy: (...a: unknown[]) => buy(...(a as [])),
    placeBid: (...a: unknown[]) => placeBid(...(a as [])),
    cancelBid: (...a: unknown[]) => cancelBid(...(a as [])),
  },
  fundingAPI: { createLink: (id: string) => createLink(id), url: (t: string) => `/fund/${t}` },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o2', name: 'Mio Homes', industry: 'Landscaping' } }),
}));

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
  olderLeads = 0;
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

  it('points to the Vault when leads are waiting there', async () => {
    olderLeads = 3;
    await render();
    const link = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent?.includes('3 leads in the Vault'))!;
    expect(link.getAttribute('href')).toBe('/vault');
    expect(document.body.querySelector('[role="tab"]')).toBeNull();
  });
});
