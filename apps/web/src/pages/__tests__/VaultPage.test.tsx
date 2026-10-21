import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const trial = { status: 'trial', active: true, monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, claimsLeft: 7, nextClaimCents: 0, periodStart: '2026-10-01T00:00:00Z', nextChargeAt: '2026-10-31T00:00:00Z' };
let pool: unknown = { locked: true, count: 2, plan: null, leads: [] };
const claim = jest.fn(async () => ({ orgLeadId: 'ol2', priceCents: 0, claimsLeft: 6 }));
const startPlan = jest.fn(async () => ({ ...trial, status: 'active' }));
const createLink = jest.fn(async (_id: string) => 'tok');
let permitsNear: unknown = {
  county: 'Midland',
  syncedAt: '2026-10-21T06:10:00Z',
  locked: false,
  summary: { days: 30, total: 128, residentialBuilding: 60, singleFamily: 41, inMyTrades: 2 },
  permits: [
    { id: 'p1', permitNumber: 'RES-1', name: 'Residential - Building', workClass: 'Alteration & Repair', address: '2705 HOWDY DR', status: 'Issued', appliedAt: '2026-10-16T16:57:14Z', residential: true, trades: ['painting'], matchesTrades: true },
    { id: 'p2', permitNumber: 'MEC-1', name: 'Mechanical - Replacement', workClass: 'Heating, A/C', address: '301 SHARP LN', status: 'Issued', appliedAt: '2026-10-15T16:57:14Z', residential: false, trades: ['hvac'], matchesTrades: false },
  ],
};

jest.mock('../../lib/api', () => ({
  walletAPI: {
    get: async () => ({ balanceCents: 10000, typicalLeadCents: 5000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, transactions: [] }),
    olderLeads: async () => pool,
    claim: (...a: unknown[]) => claim(...(a as [])),
    startPlan: (...a: unknown[]) => startPlan(...(a as [])),
    cancelPlan: async () => undefined,
  },
  fundingAPI: { createLink: (id: string) => createLink(id), url: (t: string) => `/fund/${t}` },
  permitsAPI: { near: async () => permitsNear },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o2', name: 'Mio Homes', industry: 'Landscaping' } }),
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' } }) }));

import VaultPage from '../VaultPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const byText = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter><VaultPage /></MemoryRouter>));
  await flush();
  return container;
}
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  pool = { locked: true, count: 2, plan: null, leads: [] };
});

describe('The Vault', () => {
  it('stays locked without the plan: the count, the pitch and Start the plan', async () => {
    await render();
    expect(document.body.textContent).toContain('Unlock the Vault');
    expect(document.body.textContent).toContain('2 leads in your trades are waiting in the Vault');
    expect(document.body.querySelector('[data-testid="plan-panel"]')?.textContent).toContain('$99.00');
    expect(document.body.querySelector('[data-testid="vault-table"]')).toBeNull();
    await act(async () => byText('Start the plan')!.click());
    await flush();
    expect(startPlan).toHaveBeenCalledWith('o2');
    expect(document.body.textContent).toContain("You're on the plan");
  });

  it('lists the leads for a company on the plan and claims one', async () => {
    pool = {
      locked: false,
      count: 1,
      plan: trial,
      leads: [{ id: 'm9', jobType: 'landscaping', tradeName: 'Landscaping', city: 'Midland', county: 'Midland', summary: 'Sod and drip', receivedAt: '2026-10-01T00:00:00Z', ageDays: 9, matchesTrades: true, verified: { at: '2026-10-18T15:00:00Z', note: 'Still wants it done' } }],
    };
    await render();
    expect(document.body.textContent).toContain('7 of 10 claims left this month');
    const table = document.body.querySelector('[data-testid="vault-table"]')!;
    expect(table.textContent).toContain('Midland · Midland County');
    expect(table.textContent).toContain('Confirmed Oct 18 · Still wants it done');
    expect(table.textContent).toContain('9 days');
    await act(async () => byText('Claim · included')!.click());
    await flush();
    expect(claim).toHaveBeenCalledWith('m9', 'o2');
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Lead claimed');

    // Past the allowance the button carries the price.
    pool = { ...(pool as object), plan: { ...trial, claimsLeft: 0, nextClaimCents: 1500 } };
    document.body.innerHTML = '';
    await render();
    expect(byText('Claim · $15.00')).toBeTruthy();
    expect(document.body.textContent).toContain('$15.00 each after that');
  });

  it('shows the permits applied for nearby, in the company\'s trades first, as a second tab on the plan', async () => {
    pool = { locked: false, count: 0, plan: trial, leads: [] };
    await render();
    expect(document.body.querySelector('[data-testid="permits-near-you"]')).toBeNull();
    await act(async () => byText('Permits near you')!.click());
    await flush();
    const panel = document.body.querySelector('[data-testid="permits-near-you"]')!;
    expect(panel.textContent).toContain('128 permits applied for in Midland in the last 30 days · 41 single-family · 2 in your trades');
    expect(panel.textContent).toContain('no contact details');
    // "My trades" is on, so only the repair permit shows; off, the HVAC one too.
    const table = () => panel.querySelector('[data-testid="permits-table"]')!;
    expect(table().textContent).toContain('Residential - Building · Alteration & Repair');
    expect(table().textContent).toContain('2705 HOWDY DR');
    expect(table().textContent).not.toContain('301 SHARP LN');
    await act(async () => Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === 'My trades')!.click());
    expect(table().textContent).toContain('301 SHARP LN');
    // Back to the leads.
    await act(async () => byText('Older leads')!.click());
    expect(document.body.querySelector('[data-testid="permits-near-you"]')).toBeNull();
  });
});
