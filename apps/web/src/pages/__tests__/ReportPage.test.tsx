import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let report: unknown = null;
const get = jest.fn<Promise<unknown>, [string, { county?: string; trade?: string }]>(async () => report);
const permitsNear = {
  county: 'Midland',
  syncedAt: '2026-10-21T06:10:00Z',
  locked: false,
  summary: { days: 30, total: 128, residentialBuilding: 60, singleFamily: 41, inMyTrades: 1 },
  permits: [
    {
      id: 'p1',
      permitNumber: 'RES-1',
      name: 'Residential - Building',
      workClass: 'Alteration & Repair',
      address: '2705 HOWDY DR',
      status: 'Issued',
      appliedAt: '2026-10-16T16:57:14Z',
      residential: true,
      trades: ['roofing'],
      matchesTrades: true,
      builder: 'Betenbough Homes',
      valuationCents: 26_695_000,
      squareFeet: 2422,
      contacts: [
        { role: 'Contractor', company: 'Betenbough Homes', phone: '(806) 891-1607', email: 'permitting@betenbough.com' },
        { role: 'Electrical Contractor', company: 'AEC Electrical', phone: '(432) 555-0123' },
      ],
    },
    { id: 'p2', permitNumber: 'MEC-1', name: 'Mechanical - Replacement', workClass: 'Heating, A/C', address: '301 SHARP LN', status: 'Issued', appliedAt: '2026-10-15T16:57:14Z', residential: false, trades: ['hvac'], matchesTrades: false },
  ],
};
jest.mock('../../lib/api', () => ({
  reportAPI: { get: (id: string, opts: { county?: string; trade?: string }) => get(id, opts) },
  permitsAPI: { near: async () => permitsNear },
  applicationsAPI: { options: async () => ({ trades: [], counties: [], westTexas: ['Ector', 'Midland'] }) },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: jest.requireActual<typeof import('react')>('react').createContext({ selectedOrg: { id: 'o1', name: 'Peak Roofing' } }),
}));

import ReportPage from '../ReportPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter><ReportPage /></MemoryRouter>));
  await flush();
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

const base = {
  county: 'Midland',
  week: { from: '2026-10-18T20:00:00Z', to: '2026-10-25T20:00:00Z' },
  permits: {
    feed: true,
    syncedAt: '2026-10-25T06:10:00Z',
    total: 42,
    prior: 35,
    newHomes: 18,
    newHomesPrior: 12,
    byTrade: [{ slug: 'roofing', name: 'Roofing', count: 18, prior: 12, mine: true }],
    inMyTrades: 18,
    hotStreetCount: 2,
    builderCount: 12,
  },
  demand: [{ slug: 'roofing', name: 'Roofing', mine: true, winningBidCents: 32000, fundedBidders: 2, inMarketplace: 1, inVault: 0, listed7: 3, sold30: 6, avgSoldCents: 27500, buyers: 3 }],
  sold: { count: 2, prior: 1, byTrade: [{ name: 'Roofing', count: 2, avgCents: 30000, topCents: 32000 }], medianHoursToSell: 0.5 },
};

describe('the Tolliver Report page', () => {
  it('free: the numbers, with who is building, addresses and your week held back for Pro', async () => {
    report = { ...base, pro: false };
    const page = await render();
    expect(get).toHaveBeenCalledWith('o1', { county: undefined, trade: undefined });
    expect(page.textContent).toContain('Midland County');
    expect(page.textContent).toContain('42filed, up 20% on last week (35)');
    expect(page.textContent).toContain('Leads win at $320.00 (2 funded bids)');
    expect(page.textContent).toContain('2 lead(s) sold, up 100% on last week (1). Half sold within the hour of listing.');
    expect(page.querySelector('[data-testid="report-pro-teaser"]')).not.toBeNull();
    expect(page.textContent).toContain('12 builders and contractors pulled permits; Pro names them, with their phone and email.');
    expect(page.querySelectorAll('[data-testid="report-locked"]').length).toBeGreaterThanOrEqual(3);
    expect(page.querySelector('[data-testid="report-builders"]')).toBeNull();
    expect(page.textContent).toContain('Every permit with its address, builder and value, filterable by trade and 7, 30 or 90 days.');
    expect(page.querySelector('[data-testid="permits-near-you"]')).toBeNull();
  });

  it('Pro: builders with call and email, permit addresses with builder and value, and your week; county and trade can change', async () => {
    report = {
      ...base,
      pro: true,
      permits: {
        ...base.permits,
        hotStreets: [{ street: 'Rolling Plains Ln', newHomes: 17 }],
        builders: [{ name: 'Betenbough Homes', newHomes: 12, valuationCents: 320_000_000, phone: '(806) 891-1607', email: 'permitting@betenbough.com' }],
        tradeContractors: [{ trade: 'Roofing', contractors: [{ name: 'Top Roof LLC', permits: 9, phone: '(432) 555-0199' }] }],
        list: [{ permitNumber: 'RES-1', address: '2837 ROLLING PLAINS LN', kind: 'Residential - Building', appliedAt: '2026-10-24T15:00:00Z', trades: ['Roofing'], newHome: true, url: 'https://permits.example/1', builder: 'Betenbough Homes', valuationCents: 26_695_000 }],
      },
      mine: { permitsInMyTrades: 18, bids: [{ name: 'Roofing', amountCents: 25000, winning: false, paused: false }], newLeads: 2 },
    };
    const page = await render();
    expect(page.querySelector('[data-testid="report-pro-teaser"]')).toBeNull();
    expect(page.textContent).toContain('Rolling Plains Ln (17)');
    const builders = page.querySelector('[data-testid="report-builders"]')!;
    expect(builders.textContent).toContain('Betenbough Homes · 12 new homes · $3,200,000.00 in permits');
    expect(builders.querySelector('a[href="tel:8068911607"]')).not.toBeNull();
    expect(builders.querySelector('a[href="mailto:permitting@betenbough.com"]')).not.toBeNull();
    expect(page.textContent).toContain('Pulling Roofing permits');
    expect(page.textContent).toContain('Top Roof LLC · 9 permits');
    // All permits: the full list with its filters, and the builder to call on each.
    const all = page.querySelector('[data-testid="permits-near-you"]')!;
    expect(all.textContent).toContain('128 permits applied for in Midland in the last 30 days · 41 single-family · 1 in your trades');
    const table = () => all.querySelector('[data-testid="permits-table"]')!;
    expect(table().textContent).toContain('2705 HOWDY DR');
    expect(table().textContent).not.toContain('301 SHARP LN');
    await act(async () => Array.from(all.querySelectorAll('button')).find((b) => b.textContent === 'My trades')!.click());
    expect(table().textContent).toContain('301 SHARP LN');
    const builder = all.querySelector('[data-testid="permit-builder"]')!;
    expect(builder.textContent).toContain('Betenbough Homes');
    expect(builder.textContent).toContain('$266,950 · 2,422 sq ft');
    expect(builder.querySelector('a[href="tel:8068911607"]')!.textContent).toContain('(806) 891-1607');
    expect(builder.querySelector('a[href="mailto:permitting@betenbough.com"]')).not.toBeNull();
    expect(builder.textContent).toContain('Also on it: AEC Electrical (electrical contractor)');
    expect(page.textContent).toContain('Your Roofing bid, $250.00: not winning: another company bids more');

    const countySelect = page.querySelector('select[aria-label="County"]') as HTMLSelectElement;
    expect(Array.from(countySelect.options).map((o) => o.value)).toEqual(['Midland', 'Ector']);
    await act(async () => {
      countySelect.value = 'Ector';
      countySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(get).toHaveBeenLastCalledWith('o1', { county: 'Ector', trade: undefined });
    const tradeSelect = page.querySelector('select[aria-label="Trade"]') as HTMLSelectElement;
    await act(async () => {
      tradeSelect.value = 'roofing';
      tradeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(get).toHaveBeenLastCalledWith('o1', { county: 'Ector', trade: 'roofing' });
  });

  it('a county with no permit feed says so', async () => {
    report = { ...base, county: 'Ector', pro: false, permits: { ...base.permits, feed: false }, demand: [], sold: { count: 0, prior: 0, byTrade: [], medianHoursToSell: null } };
    const page = await render();
    expect(page.textContent).toContain('No public permit feed for Ector County yet.');
    expect(page.textContent).not.toContain("Who's building");
    expect(page.textContent).not.toContain('All permits');
    expect(page.textContent).toContain('No bids or leads in Ector County yet.');
  });
});
