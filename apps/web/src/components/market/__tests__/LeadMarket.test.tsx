import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const assign = jest.fn(async () => ({ orgLeadId: 'ol1', priceCents: 8500 }));
const requestCredit = jest.fn(async () => undefined);
let wallet: Record<string, unknown> | null = null;
let role = 'super_admin';

jest.mock('../../../lib/api', () => ({
  marketplaceAPI: {
    inbox: async () => ({
      available: [{ id: 'm1', name: 'Jane Cole', jobType: 'roofing', city: 'Midland', status: 'available', price: 8500, createdAt: '2026-10-16' }],
      sold: [],
    }),
    companies: async () => [
      { id: 'o1', name: 'Broke Roofing', leadTrades: ['roofing'], balanceCents: 1000, leads30d: 0, spent30dCents: 0, leadsTotal: 0, wonCents: 0, wonCount: 0, pendingCredits: 0 },
      { id: 'o2', name: 'Peak Roofing', leadTrades: ['roofing'], balanceCents: 50000, leads30d: 2, spent30dCents: 17000, leadsTotal: 2, wonCents: 1200000, wonCount: 1, pendingCredits: 0 },
      { id: 'o3', name: 'Ace Painting', leadTrades: ['painting'], balanceCents: 90000, leads30d: 0, spent30dCents: 0, leadsTotal: 0, wonCents: 0, wonCount: 0, pendingCredits: 0 },
    ],
    pendingCredits: async () => [],
    assign: (...args: unknown[]) => assign(...(args as [])),
  },
  walletAPI: {
    get: async () => wallet,
    requestCredit: (...args: unknown[]) => requestCredit(...(args as [])),
  },
  industriesAPI: { list: async () => [{ id: 'roofing', name: 'Roofing' }, { id: 'painting', name: 'Painting' }] },
  leadsAPI: { list: async () => [] },
}));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }));

import LeadMarketPage from '../../../pages/LeadMarketPage';
import { WalletBar } from '../WalletBar';
import { LeadCredit } from '../LeadCredit';
import { suggestedBonus } from '../wallet';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.includes(text));

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter>{node}</MemoryRouter>));
  await flush();
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  role = 'super_admin';
  wallet = null;
});

describe('Lead Market', () => {
  it('is only for platform admins', async () => {
    role = 'user';
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('only for FieldQuote admins');
  });

  it('sends a lead to one company, listing ones that buy the trade first and greying out ones that can’t afford it', async () => {
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('Jane Cole');
    await act(async () => byText('Send to')!.click());
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const options = Array.from(dialog.querySelectorAll('li button')) as HTMLButtonElement[];
    expect(options.map((b) => b.textContent?.split('Buys')[0].split('Other')[0])).toEqual(['Peak Roofing', 'Broke Roofing', 'Ace Painting']);
    expect(options[1].disabled).toBe(true);
    await act(async () => options[0].click());
    await flush();
    expect(assign).toHaveBeenCalledWith('m1', 'o2');
    expect(document.body.textContent).toContain('Jane Cole sent to Peak Roofing');
  });

  it('suggests a bonus for bigger payments', () => {
    expect([suggestedBonus(250), suggestedBonus(500), suggestedBonus(1000)]).toEqual([0, 25, 100]);
  });
});

describe("a company's lead balance", () => {
  it('stays hidden for companies that don’t buy leads', async () => {
    wallet = { balanceCents: 0, typicalLeadCents: 4500, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, transactions: [] };
    const container = await render(<WalletBar organizationId="o1" />);
    expect(container.textContent).toBe('');
  });

  it('shows the balance in dollars, what leads turned into, and warns when it is running low', async () => {
    wallet = {
      balanceCents: 6000,
      typicalLeadCents: 4500,
      spentCents: 17000,
      leadsBought: 2,
      wonCents: 1200000,
      wonCount: 1,
      transactions: [{ id: 't1', type: 'top_up', amountCents: 23000, balanceAfterCents: 23000, method: 'Zelle', createdAt: '2026-10-10' }],
    };
    const container = await render(<WalletBar organizationId="o2" />);
    expect(container.textContent).toContain('$60.00');
    expect(container.textContent).toContain('about 1 lead');
    expect(container.textContent).toContain('$170.00 in leads → $12,000.00 won');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('covers about 1 more lead');
    await act(async () => byText('$60.00')!.click());
    expect(document.body.querySelector('[aria-label="Lead balance"][role="dialog"]')?.textContent).toContain('Funds added · Zelle');
  });

  it('lets a company ask for a credit on a bought lead within 3 days', async () => {
    const onRequested = jest.fn();
    const lead = {
      id: 'l1',
      name: 'Jane Cole',
      status: 'new' as const,
      estimate: null,
      marketplaceLeadId: 'm1',
      pricePaidCents: 8500,
      assignedAt: new Date().toISOString(),
    };
    await render(<LeadCredit lead={lead} onRequested={onRequested} />);
    expect(document.body.textContent).toContain('FieldQuote lead · $85.00');
    await act(async () => byText('Request credit')!.click());
    await act(async () => byText('Send request')!.click());
    await flush();
    expect(requestCredit).toHaveBeenCalledWith('l1', 'wrong_number', undefined);
    expect(onRequested).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));

    document.body.innerHTML = '';
    await render(<LeadCredit lead={{ ...lead, assignedAt: '2026-01-01T00:00:00Z' }} onRequested={onRequested} />);
    expect(byText('Request credit')).toBeUndefined();
  });
});
