import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let wallet: unknown = undefined;
jest.mock('../../lib/live', () => ({ useWallet: () => wallet }));
jest.mock('../../lib/api', () => ({
  leadsAPI: { list: jest.fn(async () => []), watch: () => () => {}, fillMissingCities: async () => ({}) },
  industriesAPI: { list: jest.fn(async () => []) },
  walletAPI: { get: jest.fn(async () => null) },
  fundingAPI: { createLink: jest.fn(async () => 'tok'), url: (t: string) => `/fund/${t}` },
}));
jest.mock('../../services/EstimateService', () => ({ EstimateService: {} }));
jest.mock('../../services/LeadExportService', () => ({ LeadExportService: {} }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../components/estimates/CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../components/layouts/DashboardLayout', () => {
  const ReactActual = jest.requireActual('react');
  return { OrganizationContext: ReactActual.createContext({ selectedOrg: { id: 'org1' } }) };
});

import LeadsPage from '../LeadsPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
  await flush();
  return container;
}
const base = { balanceCents: 0, typicalLeadCents: 25000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, transactions: [], standingBids: 0 };

afterEach(() => {
  document.body.innerHTML = '';
  wallet = undefined;
});

describe('an empty Leads page', () => {
  it('tells a company in the Lead Market where its leads come from, with Add funds and Set your bids', async () => {
    wallet = { ...base, leadTrades: ['roofing'] };
    const container = await render();
    expect(container.textContent).toContain('Leads you buy from FieldQuote land here. Add funds, then set your bids.');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['Add funds', 'Set your bids', 'Add your first lead']));
  });

  it('keeps the plain empty state once bids are set', async () => {
    wallet = { ...base, leadTrades: ['roofing'], standingBids: 2 };
    const container = await render();
    expect(container.textContent).not.toContain('Leads you buy from FieldQuote land here');
    expect(container.textContent).toContain('Log every call or message asking for a quote');
  });
});
