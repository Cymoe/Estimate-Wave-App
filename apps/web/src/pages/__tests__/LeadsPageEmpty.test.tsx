import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let wallet: unknown = undefined;
let rows: Array<Record<string, unknown>> = [];
const companyOf = jest.fn<Promise<null | { organizationId: string; name: string }>, [string]>(async () => null);
const setSelectedOrg = jest.fn();
jest.mock('../../lib/live', () => ({ useWallet: () => wallet }));
jest.mock('../../lib/api', () => ({
  leadsAPI: { list: jest.fn(async () => rows), watch: () => () => {}, fillMissingCities: async () => ({}), companyOf: (id: string) => companyOf(id) },
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
  return { OrganizationContext: ReactActual.createContext({ selectedOrg: { id: 'org1' }, setSelectedOrg: (o: unknown) => setSelectedOrg(o) }) };
});

import LeadsPage from '../LeadsPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
async function render(path = '/leads') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter initialEntries={[path]}><LeadsPage /></MemoryRouter>));
  await flush();
  return container;
}
const base = { balanceCents: 0, typicalLeadCents: 25000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, transactions: [], standingBids: 0 };

afterEach(() => {
  document.body.innerHTML = '';
  wallet = undefined;
  rows = [];
  jest.clearAllMocks();
});

describe('an alert link for a lead', () => {
  it('switches to the company the lead is in when another of yours is selected', async () => {
    rows = [{ id: 'x1', name: 'Someone else', status: 'new', createdAt: '2026-10-01T00:00:00Z' }];
    companyOf.mockResolvedValueOnce({ organizationId: 'org2', name: 'Peak Roofing' });
    await render('/leads?lead=l9&ack=1');
    expect(companyOf).toHaveBeenCalledWith('l9');
    expect(setSelectedOrg).toHaveBeenCalledWith({ id: 'org2', name: 'Peak Roofing', industry: '' });
  });

  it("says so when the lead isn't in any company of yours", async () => {
    rows = [{ id: 'x1', name: 'Someone else', status: 'new', createdAt: '2026-10-01T00:00:00Z' }];
    const container = await render('/leads?lead=l9');
    expect(setSelectedOrg).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("That lead isn't in any company you belong to");
  });
});

describe('an empty Leads page', () => {
  it('tells a company in the Lead Market where its leads come from, with Add funds and Set your bids', async () => {
    wallet = { ...base, leadTrades: ['roofing'] };
    const container = await render();
    expect(container.textContent).toContain('Leads you buy from Webb Leads land here. Add funds, then set your bids.');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['Add funds', 'Set your bids', 'Add your first lead']));
  });

  it('keeps the plain empty state once bids are set', async () => {
    wallet = { ...base, leadTrades: ['roofing'], standingBids: 2 };
    const container = await render();
    expect(container.textContent).not.toContain('Leads you buy from Webb Leads land here');
    expect(container.textContent).toContain('Log every call or message asking for a quote');
  });
});
