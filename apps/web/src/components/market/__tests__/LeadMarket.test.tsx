import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const assign = jest.fn(async () => ({ orgLeadId: 'ol1', priceCents: 8500 }));
const requestCredit = jest.fn(async () => undefined);
let wallet: Record<string, unknown> | null = null;
let role = 'super_admin';
let emptyMarket = false;
let pendingPayments: unknown[] = [];
const confirmFunding = jest.fn(async (_id: string) => { pendingPayments = []; });
let feedLeads: unknown[] = [];
let soldLeads: unknown[] = [];
const buyLead = jest.fn(async () => ({ orgLeadId: 'ol9' }));
let demoCompanies = false;
const addDemoData = jest.fn(async () => { demoCompanies = true; });
const removeDemoData = jest.fn(async () => { demoCompanies = false; });
const addSampleLeads = jest.fn(async () => ({ added: 20 }));
let demoBids = false;
const addDemoBids = jest.fn(async () => { demoBids = true; return { companies: 3, standingBids: 8, leads: 14, sold: 11 }; });
const removeCompany = jest.fn(async (_id: string) => undefined);
const setCompanyOwner = jest.fn(async (_id: string, _email: string) => 'invited');
const setPlan = jest.fn(async () => undefined);

jest.mock('../../../lib/api', () => ({
  marketplaceAPI: {
    inbox: async () => ({
      available: emptyMarket ? [] : [{ id: 'm1', name: 'Jane Cole', jobType: 'roofing', city: 'Midland', status: 'available', price: 8500, createdAt: '2026-10-16' }],
      sold: soldLeads,
    }),
    companies: async () => demoCompanies
      ? [{ id: 'd1', name: 'Permian Roofing & Exteriors', leadTrades: ['roofing'], balanceCents: 101500, leads30d: 1, spent30dCents: 8500, leadsTotal: 1, wonCents: 1850000, wonCount: 1, pendingCredits: 0, isSample: true, sampleBids: demoBids ? 3 : 0 }]
      : [
      { id: 'o1', name: 'Broke Roofing', leadTrades: ['roofing'], balanceCents: 1000, leads30d: 0, spent30dCents: 0, leadsTotal: 0, wonCents: 0, wonCount: 0, pendingCredits: 0, sampleBids: demoBids ? 3 : 0 },
      { id: 'o2', name: 'Peak Roofing', owners: ['pat@peak.example'], leadTrades: ['roofing'], balanceCents: 50000, leads30d: 2, spent30dCents: 17000, leadsTotal: 2, wonCents: 1200000, wonCount: 1, pendingCredits: 0,
        plan: { status: 'active', active: true, monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, claimsLeft: 8, nextClaimCents: 0, periodStart: '2026-10-01T00:00:00Z', nextChargeAt: '2026-11-01T00:00:00Z' } },
      { id: 'o3', name: 'Ace Painting', leadTrades: [], balanceCents: 0, isEmpty: true, leads30d: 0, spent30dCents: 0, leadsTotal: 0, wonCents: 0, wonCount: 0, pendingCredits: 0 },
    ],
    pendingCredits: async () => [],
    prices: async () => ({ defaultCents: 20000, prices: [] }),
    assign: (...args: unknown[]) => assign(...(args as [])),
    addDemoData: () => addDemoData(),
    removeDemoData: () => removeDemoData(),
    addSampleLeads: () => addSampleLeads(),
    addDemoBids: () => addDemoBids(),
    removeCompany: (id: string) => removeCompany(id),
    setCompanyOwner: (id: string, email: string) => setCompanyOwner(id, email),
    setPlan: (id: string, changes: unknown) => setPlan(id, changes),
    archiveLead: async () => undefined,
  },
  fundingAPI: {
    pending: async () => pendingPayments,
    confirm: (id: string) => confirmFunding(id),
    cancel: async () => undefined,
    createLink: async () => 'tok',
    url: (token: string) => `https://app.example/fund/${token}`,
  },
  walletAPI: {
    get: async () => wallet,
    feed: async () => feedLeads,
    buy: (...args: unknown[]) => buyLead(...(args as [])),
    requestCredit: (...args: unknown[]) => requestCredit(...(args as [])),
  },
  industriesAPI: { list: async () => [{ id: 'roofing', name: 'Roofing' }, { id: 'painting', name: 'Painting' }] },
  leadsAPI: { list: async () => [] },
}));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }));

import LeadMarketPage from '../../../pages/LeadMarketPage';
import { WalletBar } from '../WalletBar';
import { WalletTile } from '../WalletTile';
import { LeadCredit } from '../LeadCredit';
import { suggestedBonus } from '../wallet';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
/** Types into a controlled input the way a person would. */
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const byText = (text: string) => buttons().find((b) => b.textContent?.includes(text));

async function render(node: React.ReactNode, wrap = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(wrap ? <MemoryRouter>{node}</MemoryRouter> : node));
  await flush();
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  role = 'super_admin';
  wallet = null;
  emptyMarket = false;
  demoCompanies = false;
  demoBids = false;
  pendingPayments = [];
  feedLeads = [];
  soldLeads = [];
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
    await act(async () => (document.body.querySelector('button[aria-label^="Send "]') as HTMLButtonElement).click());
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const options = Array.from(dialog.querySelectorAll('li button')) as HTMLButtonElement[];
    expect(options.map((b) => b.textContent?.split('Buys')[0].split('Other')[0])).toEqual(['Peak Roofing', 'Broke Roofing', 'Ace Painting']);
    expect(options[1].disabled).toBe(true);
    await act(async () => options[0].click());
    await flush();
    expect(assign).toHaveBeenCalledWith('m1', 'o2');
    expect(document.body.textContent).toContain('Jane Cole sent to Peak Roofing');
  });

  it('fills an empty market with demo companies, and removes them in one tap', async () => {
    emptyMarket = true;
    await render(<LeadMarketPage />);
    await act(async () => byText('Add demo companies and leads')!.click());
    await flush();
    expect(addDemoData).toHaveBeenCalled();
    expect(document.body.textContent).toContain("You're looking at demo companies and leads.");
    expect(byText('Add demo companies and leads')).toBeUndefined();
    await act(async () => byText('Remove demo data')!.click());
    await flush();
    expect(removeDemoData).toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("You're looking at demo companies");
    await act(async () => byText('Add 20 sample leads')!.click());
    await flush();
    expect(addSampleLeads).toHaveBeenCalled();
    expect(document.body.textContent).toContain('20 sample leads added');
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

  it('warns when the balance is low and never shows a won-from-leads figure; the navigation tile shows the balance and opens the panel', async () => {
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
    // The balance itself lives in the navigation, not here.
    expect(container.textContent).not.toContain('$60.00');
    expect(container.textContent).not.toContain('$12,000.00');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('covers about 1 more lead');

    document.body.innerHTML = '';
    const tile = await render(<WalletTile organizationId="o2" />);
    expect(tile.textContent).toContain('$60.00');
    expect(tile.textContent).toContain('about 1 lead');
    await act(async () => (tile.querySelector('button[aria-label="Lead balance"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[aria-label="Lead balance"][role="dialog"]')?.textContent).toContain('Funds added · Zelle');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    // It slides out first, then unmounts.
    expect(document.body.querySelector('[role="dialog"]')?.className).toContain('translate-x-full');
    await act(async () => new Promise((r) => setTimeout(r, 200)));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows what a bought lead cost, with no way to ask for a credit from the drawer', async () => {
    const lead = {
      id: 'l1',
      name: 'Jane Cole',
      status: 'new' as const,
      estimate: null,
      marketplaceLeadId: 'm1',
      pricePaidCents: 8500,
      assignedAt: new Date().toISOString(),
    };
    await render(<LeadCredit lead={lead} />);
    expect(document.body.textContent).toContain('Won · $85.00');
    expect(byText('Request credit')).toBeUndefined();
    expect(requestCredit).not.toHaveBeenCalled();

    // A credit already on file still shows its state.
    document.body.innerHTML = '';
    await render(<LeadCredit lead={{ ...lead, creditRequest: { reason: 'wrong_number', requestedAt: '2026-10-01T00:00:00Z', status: 'approved' } }} />);
    expect(document.body.textContent).toContain('Credited');
  });
});

describe('loading the balance and buying leads', () => {
  it('shows payments waiting to be confirmed, and confirms one from the company panel', async () => {
    pendingPayments = [
      { id: 'f1', organizationId: 'o2', companyName: 'Peak Roofing', amountCents: 1_000_000, bonusCents: 100_000, method: 'apple_pay', payerName: 'Pat' },
    ];
    await render(<LeadMarketPage />);
    await act(async () => byText('1 payment waiting to be confirmed')!.click());
    await flush();
    expect(document.body.textContent).toContain('$10,000.00 by Apple Pay · +$1,000.00 bonus');
    await act(async () => byText('Confirm $11,000.00')!.click());
    await flush();
    expect(confirmFunding).toHaveBeenCalledWith('f1');
  });

  it('sets an owner, and removes an empty company (only offered for empty ones)', async () => {
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('Platform owner · only you see this');
    await act(async () => byText('Companies')!.click());
    await flush();
    const row = (name: string) => Array.from(document.body.querySelectorAll('tr')).find((r) => r.textContent?.includes(name))!;
    expect(row('Peak Roofing').textContent).toContain('Pro plan');
    expect(row('Ace Painting').textContent).toContain('Free');
    await act(async () => row('Peak Roofing').click());
    await flush();
    expect(byText('Remove this empty company')).toBeUndefined();
    expect(document.body.querySelector('[data-testid="company-owners"]')?.textContent).toBe('pat@peak.example');
    // The plan section: status, claims left, and a one-tap comp.
    const planSection = document.body.querySelector('[data-testid="plan-section"]')!;
    expect(planSection.textContent).toContain('8 of 10 claims left');
    await act(async () => (planSection.querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(setPlan).toHaveBeenCalledWith('o2', { status: 'active', monthlyCents: 0 });
    await act(async () => (document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    await act(async () => row('Ace Painting').click());
    await flush();
    const email = document.body.querySelector('input[aria-label="Owner\'s email"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(email, 'ann@ace.example');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => byText('Save')!.click());
    await flush();
    expect(setCompanyOwner).toHaveBeenCalledWith('o3', 'ann@ace.example');
    expect(document.body.textContent).toContain("They'll join this company when they sign up");
    await act(async () => byText('Remove this empty company')!.click());
    await act(async () => byText('Remove company')!.click());
    await flush();
    expect(removeCompany).toHaveBeenCalledWith('o3');
  });

  it("tells the company their payment is being confirmed, and points them to the Marketplace for new leads", async () => {
    wallet = {
      balanceCents: 500000, typicalLeadCents: 8500, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0,
      pendingFunding: { amountCents: 750000, bonusCents: 37500 }, availableLeads: 1,
      transactions: [{ id: 't1', type: 'top_up', amountCents: 500000, balanceAfterCents: 500000, createdAt: '2026-10-10' }],
    };
    await render(<WalletBar organizationId="o2" />);
    expect(document.body.textContent).toContain('Your $7,500.00 payment (+$375.00 bonus) is being confirmed');
    const browse = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent?.includes('1 new lead in the Marketplace'))!;
    expect(browse.getAttribute('href')).toBe('/marketplace');
  });
});

describe('standing bids in Admin', () => {
  it('offers to seed demo bids on the Companies tab even while demo companies are around', async () => {
    demoCompanies = true;
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((b) => b.textContent?.startsWith('Companies'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(document.body.textContent).toContain('No bids yet. Seed every company');
    await act(async () => byText('Add demo bids')!.click());
    await flush();
    expect(addDemoBids).toHaveBeenCalled();
  });

  it('seeds demo bids for every company from the inbox, then offers to remove them', async () => {
    await render(<LeadMarketPage />);
    await act(async () => byText('Add demo bids')!.click());
    await flush();
    expect(addDemoBids).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Demo bids added: 8 bids across 3 companies, 14 leads, 11 awarded');
    expect(document.body.textContent).toContain("You're looking at demo bids, funds and leads.");
    expect(byText('Add demo bids')).toBeUndefined();
    expect(byText('Remove demo data')).toBeDefined();
  });

  it('shows which sold leads went to a standing bid', async () => {
    soldLeads = [{ id: 'm2', name: 'Ray Ortiz', jobType: 'painting', city: 'Odessa', county: 'Ector', status: 'assigned', price: 26000, priceCents: 26000, wonBy: 'bid', companyName: 'Peak Roofing', assignedAt: '2026-10-18T12:00:00Z', createdAt: '2026-10-18' }];
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('Painting · to Peak Roofing · won by bid');
  });

  it('fills the county in from a town we know when adding a lead', async () => {
    await render(<MemoryRouter initialEntries={['/lead-market?new=lead']}><LeadMarketPage /></MemoryRouter>, false);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const inputs = Array.from(dialog.querySelectorAll('input'));
    const city = inputs.find((i) => i.closest('label')?.textContent?.startsWith('City'))!;
    const county = inputs.find((i) => i.closest('label')?.textContent?.startsWith('County'))!;
    await act(async () => type(city, 'Odessa'));
    expect(county.value).toBe('Ector');
  });
});
