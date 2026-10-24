import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const assign = jest.fn(async () => ({ orgLeadId: 'ol1', priceCents: 8500 }));
const requestCredit = jest.fn(async () => undefined);
let wallet: Record<string, unknown> | null = null;
let role = 'super_admin';
let emptyMarket = false;
let feedLeads: unknown[] = [];
let soldLeads: unknown[] = [];
const buyLead = jest.fn(async () => ({ orgLeadId: 'ol9' }));
let demoCompanies = false;
let demoBids = false;
const removeCompany = jest.fn(async (_id: string) => undefined);
const setCompanyOwner = jest.fn(async (_id: string, _email: string) => 'invited');
const setPlan = jest.fn(async () => undefined);

let staffInvites: Array<{ id: string; email: string; createdAt: string }> = [];
const inviteStaff = jest.fn(async (email: string) => { staffInvites = [...staffInvites, { id: `i${staffInvites.length + 1}`, email, createdAt: '2026-10-22' }]; return { status: 'invited' }; });

let intakeRows: unknown[] = [];
let intakeLog: unknown[] = [];
const createIntake = jest.fn(async (_source: string, _fields: unknown) => ({ id: 'i1', duplicate: false }));
const confirmIntake = jest.fn(async () => ({ leadId: 'm7', outcome: 'sold', companyName: 'Peak Roofing', priceCents: 25000 }));

let demand: unknown = { vaCostCents: 500, planCpl: { roofing: 6000 }, slots: [] };
const setPlanCpl = jest.fn(async (_jobType: string, _cents: number | null) => null);
let delivered: unknown[] = [];
const resendAlerts = jest.fn(async (_id: string) => null);
const destination: unknown = { kind: 'sold', companyName: 'Peak Roofing', priceCents: 25000, tradeName: 'Roofing', county: 'Midland' };

// The live subscriptions see the same fixtures the one-shot calls used to return.
jest.mock('../../../lib/live', () => ({
  useWallet: () => wallet,
  useDemandBoard: () => demand,
  useDemandSlot: (_county: string, jobType: string) =>
    jobType === 'flooring'
      ? { bidders: [], buyers: [], leads: [] }
      : { bidders: [{ companyName: 'Rich Roofing', amountCents: 30000, balanceCents: 40000, funded: true }, { companyName: 'Poor Roofing', amountCents: 40000, balanceCents: 100, funded: false }], buyers: ['Rich Roofing', 'Poor Roofing'], leads: [] },
  useIntakeQueue: () => intakeRows,
  useIntakeLog: () => intakeLog,
  useDelivered: () => delivered,
  useLeadDestination: (county?: string, jobType?: string) => (county && jobType ? destination : undefined),
}));

let applications: unknown[] = [];
const approveApplication = jest.fn(async (): Promise<{ organizationId: string }> => ({ organizationId: 'o2' }));
const declineApplication = jest.fn(async () => null);
jest.mock('../../../lib/api', () => ({
  applicationsAPI: {
    list: async () => applications,
    approve: (id: string) => approveApplication(id),
    decline: (id: string) => declineApplication(id),
  },
  deliveryAPI: { resend: (id: string) => resendAlerts(id) },
  demandAPI: {
    setPlanCpl: (jobType: string, cents: number | null) => setPlanCpl(jobType, cents),
  },
  intakeAPI: {
    get: async (id: string) => ({ ...(intakeRows as Array<{ id: string }>).find((r) => r.id === id)!, duplicate: null }),
    create: (source: string, fields: unknown) => createIntake(source, fields),
    confirm: (...args: unknown[]) => confirmIntake(...(args as [])),
    update: async () => null,
    logAttempt: async () => null,
    close: async () => null,
    reopen: async () => null,
  },
  staffAPI: {
    list: async () => ({ staff: [], invites: staffInvites }),
    invite: (email: string) => inviteStaff(email),
    removeInvite: async () => undefined,
    remove: async () => undefined,
  },
  permitsAPI: { status: async () => ({ source: null, last30Days: 0 }), syncNow: async () => ({ fetched: 0, added: 0, updated: 0 }) },
  marketplaceAPI: {
    inbox: async () => ({
      available: emptyMarket ? [] : [{ id: 'm1', name: 'Jane Cole', jobType: 'roofing', city: 'Midland', status: 'available', price: 8500, createdAt: '2026-10-16', verified: { at: '2026-10-16T15:00:00Z', note: 'Wants it before the rain' } }],
      older: emptyMarket ? [] : [{ id: 'm2', name: 'Old Hollis', jobType: 'painting', city: 'Odessa', status: 'older', price: 4000, createdAt: '2026-10-01' }],
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
    removeCompany: (id: string) => removeCompany(id),
    setCompanyOwner: (id: string, email: string) => setCompanyOwner(id, email),
    setPlan: (id: string, changes: unknown) => setPlan(id, changes),
    archiveLead: async () => undefined,
  },
  fundingAPI: {
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
import { WalletBar, bidStatus, type WalletSummary } from '../WalletBar';
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
/** The Ops page opens on Intake; the listed leads sit behind the Listed tab. */
const openListed = async () => {
  await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Listed'))!.click());
  await flush();
};

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
  feedLeads = [];
  soldLeads = [];
  intakeRows = [];
  intakeLog = [];
  delivered = [];
  applications = [];
});

describe('Lead Market', () => {
  it('is only for FieldQuote staff; staff see leads and companies but not prices, demo data or money', async () => {
    role = 'user';
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('only for FieldQuote staff');

    document.body.innerHTML = '';
    role = 'staff';
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('FieldQuote staff');
    expect(Array.from(document.body.querySelectorAll('[role="tablist"]:not([aria-label]) [role="tab"]')).map((t) => t.textContent)).toEqual(['Demand', 'Intake', 'Listed (1)', 'Delivered', 'Companies (3)']);
    expect(document.body.textContent).not.toContain('Add 20 sample leads');
    expect(document.body.querySelector('[data-testid="team-card"]')).toBeNull();
    // The company panel reads only: no funding link, payments or plan.
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    await act(async () => Array.from(document.body.querySelectorAll('tr')).find((r) => r.textContent?.includes('Peak Roofing'))!.click());
    await flush();
    const panel = document.body.querySelector('[role="dialog"]')!;
    expect(panel.textContent).toContain('Standing bids');
    expect(panel.textContent).not.toContain('Send funding link');
    expect(panel.textContent).not.toContain('Record a payment');
  });

  it('confirms a lead once, in Intake: Listed shows the stamp with no second Confirm, and only a Vault lead offers Re-confirm', async () => {
    role = 'super_admin';
    await render(<LeadMarketPage />);
    await openListed();
    const listed = document.body.querySelector('ul[aria-label="Listed"]')!;
    expect(listed.textContent).toContain('Jane Cole');
    expect(listed.textContent).toContain('Confirmed');
    expect(listed.querySelector('[aria-label^="Confirm"], [aria-label^="Re-confirm"]')).toBeNull();
    expect(Array.from(listed.querySelectorAll('button')).map((b) => b.textContent)).not.toContain('Confirm');
    const vault = document.body.querySelector('ul[aria-label="The Vault"]')!;
    expect(vault.textContent).toContain('Old Hollis');
    expect(vault.textContent).toContain('Not confirmed yet');
    expect(Array.from(vault.querySelectorAll('button')).map((b) => b.textContent)).toContain('Confirm');
  });

  it('lists every webhook hit under Intake, accepted or not, with the reason', async () => {
    intakeLog = [
      { id: 'g1', receivedAt: new Date().toISOString(), source: 'meta', outcome: 'rejected', reason: 'Wrong key' },
      { id: 'g2', receivedAt: new Date().toISOString(), source: 'meta', outcome: 'repeat', reason: 'Same outside id as a lead already in', summary: 'Dana Reyes · 432-555-0133', intakeLeadId: 'i1' },
      { id: 'g3', receivedAt: new Date().toISOString(), outcome: 'accepted', summary: 'Dana Reyes · 432-555-0133 · Midland County · roofing', intakeLeadId: 'i1' },
    ];
    await render(<LeadMarketPage />);
    const section = document.body.querySelector('[data-testid="incoming-log"]')!;
    expect(section.textContent).toContain('Incoming webhook hits');
    expect(section.textContent).toContain('last 3 · 1 rejected');
    expect(section.querySelector('ul')).toBeNull();
    await act(async () => (section.querySelector('button') as HTMLButtonElement).click());
    const items = Array.from(section.querySelectorAll('li')).map((li) => li.textContent);
    expect(items[0]).toContain('Rejected');
    expect(items[0]).toContain('Wrong key');
    expect(items[1]).toContain('Repeat');
    expect(items[2]).toContain('In');
    expect(items[2]).toContain('Midland County · roofing');
  });

  it('heads the page with the open tab and one line of that tab\'s numbers', async () => {
    intakeRows = [
      { id: 'i1', source: 'meta', status: 'working', label: 'Dana Reyes', phone: '432-555-0133', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T03:00:00Z' },
      { id: 'i2', source: 'call', status: 'new', label: 'P. Cole', phone: '432-555-0101', duplicateOf: 'i0', attempts: [], lastAttempt: null, createdAt: '2026-10-22T03:30:00Z', updatedAt: '2026-10-22T03:30:00Z' },
    ];
    await render(<LeadMarketPage />);
    const heading = () => document.body.querySelector('h1')!.textContent;
    const summary = () => document.body.querySelector('[data-testid="ops-summary"]')!.textContent;
    expect(heading()).toBe('Intake');
    expect(summary()).toBe('2 to confirm · 1 possible duplicate');
    expect(document.body.textContent).not.toContain('sell on their own');
    const open = async (name: string) => {
      await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith(name))!.click());
      await flush();
    };
    await open('Listed');
    expect(heading()).toBe('Listed');
    expect(summary()).toBe('1 listed · $170.00 sold in 30 days');
    await open('Companies');
    expect(heading()).toBe('Companies');
    expect(summary()).toBe('3 companies · $510.00 in balances · 1 Pro');
    await open('Demand');
    expect(heading()).toBe('Demand');
    expect(summary()).toBe('0 of 0 have a buyer waiting');
    await open('Prices');
    expect(heading()).toBe('Prices');
    expect(summary()).toBe('Start and floor price for 2 trades');
  });

  it('shows landing-page applications to the owner, and Approve sets the company up and opens its panel', async () => {
    applications = [
      { id: 'a1', companyName: 'Basin Paint Co.', contactName: 'Ana Ruiz', email: 'ana@basinpaint.example', phone: '4325550199', trades: ['painting'], county: 'Midland', jobsPerMonth: '6', createdAt: new Date().toISOString() },
    ];
    await render(<LeadMarketPage />);
    expect(Array.from(document.body.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toContain('Companies (3) · 1 applied');
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    const section = document.body.querySelector('[aria-label="Applications"]')!;
    expect(section.textContent).toContain('1 company applied from the landing page');
    expect(section.textContent).toContain('Basin Paint Co. · Ana Ruiz');
    expect(section.textContent).toContain('Painting · Midland County · 6 jobs a month');
    await act(async () => (Array.from(section.querySelectorAll('button')).find((b) => b.textContent === 'Approve') as HTMLButtonElement).click());
    await flush();
    expect(approveApplication).toHaveBeenCalledWith('a1');
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Peak Roofing');
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Company set up');
  });

  it('keeps applications from staff', async () => {
    role = 'staff';
    applications = [{ id: 'a1', companyName: 'Basin Paint Co.', contactName: 'Ana Ruiz', email: 'a@b.c', phone: '4325550199', trades: ['painting'], county: 'Midland', createdAt: new Date().toISOString() }];
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    expect(document.body.querySelector('[aria-label="Applications"]')).toBeNull();
  });

  it('totals the companies table: cash held, leads and spend this month, plan mix and value won', async () => {
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    const cells = Array.from(document.body.querySelectorAll('[data-testid="companies-totals"] td')).map((td) => td.textContent);
    expect(cells).toEqual(['Total3 companies', '$510.00', '2', '$170.00', '1 Pro · 2 free', '$12,000.00']);
  });

  it('lets the owner invite staff from the Companies tab', async () => {
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    const card = document.body.querySelector('[data-testid="team-card"]')!;
    expect(card.textContent).toContain('Just you so far');
    const inputEl = card.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      type(inputEl, 'va@fieldquote.example');
    });
    await act(async () => (card.querySelector('button[type="submit"]') as HTMLButtonElement).click());
    await flush();
    expect(inviteStaff).toHaveBeenCalledWith('va@fieldquote.example');
    expect(document.body.querySelector('[data-testid="team-card"]')!.textContent).toContain('invited, not signed up yet');
  });

  it('sends a lead to one company, listing only ones that buy the trade (the rest behind a link) and greying out ones that can’t afford it', async () => {
    await render(<LeadMarketPage />);
    await openListed();
    expect(document.body.textContent).toContain('Jane Cole');
    await act(async () => (document.body.querySelector('button[aria-label^="Send "]') as HTMLButtonElement).click());
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const names = () => (Array.from(dialog.querySelectorAll('li button')) as HTMLButtonElement[]).map((b) => b.textContent?.split('Buys')[0].split('Other')[0]);
    expect(names()).toEqual(['Peak Roofing', 'Broke Roofing']);
    const more = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Show 1 company that don’t buy Roofing'))!;
    await act(async () => more.click());
    expect(names()).toEqual(['Peak Roofing', 'Broke Roofing', 'Ace Painting']);
    const options = Array.from(dialog.querySelectorAll('li button')) as HTMLButtonElement[];
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
    wallet.standingBids = 1;
    wallet.pausedBids = 0;
    const container = await render(<WalletBar organizationId="o2" />);
    // The balance itself lives in the navigation, not here.
    expect(container.textContent).not.toContain('$12,000.00');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your bids are live. Your balance covers about 1 more lead.');

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
  it('sets an owner, and removes an empty company (only offered for empty ones)', async () => {
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('Platform owner');
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

});

describe('the bid status line', () => {
  const base = { typicalLeadCents: 15000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, transactions: [] };
  const line = (w: Partial<WalletSummary>) => bidStatus({ ...base, balanceCents: 0, ...w } as WalletSummary);

  it('always talks about bids, with one next step', () => {
    expect(line({ balanceCents: 0, standingBids: 0 })).toEqual({
      tone: 'warn', text: 'Two steps to start winning leads: add funds, then set your bids.', action: 'fund', alsoBids: true,
    });
    expect(line({ balanceCents: 30000, standingBids: 0 })).toEqual({
      tone: 'good', text: 'Set your bids to start winning leads. Your $300.00 covers about 2 leads.', action: 'bids',
    });
    expect(line({ balanceCents: 0, standingBids: 1, pausedBids: 1 })?.text).toBe(
      "Your bid is paused. Your balance is $0.00, so it can't win leads. Add funds to put it back in.",
    );
    expect(line({ balanceCents: 10000, standingBids: 2, pausedBids: 2 })?.text).toBe(
      "Your bids are paused. They're higher than your $100.00 balance, so they can't win leads. Add funds to put them back in.",
    );
    expect(line({ balanceCents: 15000, standingBids: 3, pausedBids: 2 })).toMatchObject({
      tone: 'warn', action: 'fund', text: '2 of your 3 bids are paused because they\'re higher than your $150.00 balance. Add funds to put them back in.',
    });
    expect(line({ balanceCents: 20000, standingBids: 2, pausedBids: 0 })?.text).toBe(
      "Your bids are live. Your balance covers about 1 more lead. Add funds so you don't miss any.",
    );
    expect(line({ balanceCents: 100000, standingBids: 2, pausedBids: 0 })).toBeNull();
    // Outbid is news even when money is fine, and the link goes to the bids.
    expect(line({ balanceCents: 100000, standingBids: 2, pausedBids: 0, outbidBids: 1 })).toEqual({
      tone: 'warn',
      text: "You've been outbid on a bid: a higher or earlier bid now leads. Raise it to win the next lead.",
      action: 'bids',
      label: 'See bids',
    });
    expect(line({ balanceCents: 100000, standingBids: 3, pausedBids: 0, outbidBids: 2 })?.text).toContain('outbid on 2 bids');
    // Money problems come first: a paused bid says so before any outbid.
    expect(line({ balanceCents: 0, standingBids: 1, pausedBids: 1, outbidBids: 1 })?.text).toContain('paused');
  });

  it('shows the paused line on the Leads page with Add funds and a link to the bids', async () => {
    wallet = { ...base, balanceCents: 0, standingBids: 1, pausedBids: 1 };
    const container = await render(<WalletBar organizationId="o2" />);
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Your bid is paused.');
    expect(alert.textContent).not.toContain("can't be sent to you");
    expect(Array.from(alert.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Add funds']);
    expect(alert.querySelector('a[href="/bids"]')?.textContent).toBe('See bids');
  });

  it('asks a company with no trades to pick them first, even before it buys leads', async () => {
    expect(line({ balanceCents: 0, standingBids: 0, leadTrades: [] })).toMatchObject({ action: 'trades', label: 'Pick trades' });
    wallet = { ...base, balanceCents: 0, standingBids: 0, leadTrades: [] };
    const container = await render(<WalletBar organizationId="o2" />);
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Pick your trades first');
    expect(alert.querySelector('a[href="/settings/organization?tab=trades"]')?.textContent).toBe('Pick trades');
  });

  it('tells the company on the Leads page when it has been outbid, with a link to its bids', async () => {
    wallet = { ...base, balanceCents: 100000, standingBids: 2, pausedBids: 0, outbidBids: 1 };
    const container = await render(<WalletBar organizationId="o2" />);
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("You've been outbid on a bid");
    expect(alert.querySelector('a[href="/bids"]')?.textContent).toBe('See bids');
  });
});

describe('standing bids in Admin', () => {
  it('shows which sold leads went to a standing bid', async () => {
    soldLeads = [{ id: 'm2', name: 'Ray Ortiz', jobType: 'painting', city: 'Odessa', county: 'Ector', status: 'assigned', price: 26000, priceCents: 26000, wonBy: 'bid', companyName: 'Peak Roofing', assignedAt: '2026-10-18T12:00:00Z', createdAt: '2026-10-18' }];
    await render(<LeadMarketPage />);
    await openListed();
    expect(document.body.textContent).toContain('Painting · to Peak Roofing · won by bid');
  });

  it('opens on Intake; a new lead goes into the queue, with the county filled in from a town we know', async () => {
    await render(<MemoryRouter initialEntries={['/ops?new=lead']}><LeadMarketPage /></MemoryRouter>, false);
    expect(document.body.querySelector('[data-testid="intake-queue"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Nobody to call');
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('New lead');
    const inputs = Array.from(dialog.querySelectorAll('input'));
    const name = inputs.find((i) => i.closest('label')?.textContent?.startsWith('Name'))!;
    const city = inputs.find((i) => i.closest('label')?.textContent?.startsWith('City'))!;
    const county = inputs.find((i) => i.closest('label')?.textContent?.startsWith('County'))!;
    await act(async () => type(name, 'Pat Cole'));
    await act(async () => type(city, 'Odessa'));
    expect(county.value).toBe('Ector');
    await act(async () => (dialog.querySelector('button[type="submit"]') as HTMLButtonElement).click());
    await flush();
    expect(createIntake).toHaveBeenCalledWith('manual', expect.objectContaining({ name: 'Pat Cole', city: 'Odessa', county: 'Ector' }));
    expect(document.body.querySelector('[role="radiogroup"][aria-label="How it came in"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('lists the queue with source, trade, county and the last try, and flags a repeat number', async () => {
    intakeRows = [
      { id: 'i1', source: 'meta', status: 'working', label: 'Dana Reyes', phone: '432-555-0133', county: 'Midland', jobType: 'roofing', tradeName: 'Roofing', attempts: [{ at: '2026-10-22T03:00:00Z', by: 'u1', outcome: 'voicemail' }], lastAttempt: { at: '2026-10-22T03:00:00Z', outcome: 'voicemail' }, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T03:00:00Z' },
      { id: 'i2', source: 'call', status: 'new', label: 'P. Cole', phone: '432-555-0101', duplicateOf: 'i0', attempts: [], lastAttempt: null, createdAt: '2026-10-22T03:30:00Z', updatedAt: '2026-10-22T03:30:00Z' },
    ];
    await render(<LeadMarketPage />);
    const list = document.body.querySelector('[aria-label="Intake"]')!;
    const items = Array.from(list.querySelectorAll('li'));
    expect(items[0].textContent).toContain('Dana Reyes');
    expect(items[0].textContent).toContain('Roofing · Midland County');
    expect(items[0].textContent).toContain('1 try · Voicemail');
    expect(items[0].querySelector('[aria-label="Facebook"]')).not.toBeNull();
    expect(items[1].textContent).toContain('same number as another lead');
    expect(items[1].textContent).toContain('Trade not set · County not set');
  });

  it('shows the demand grid: top funded bid, depth and margin per county and trade, and who bids there', async () => {
    demand = {
      vaCostCents: 500, planCpl: { roofing: 6000 },
      slots: [
        { county: 'Midland', jobType: 'roofing', tradeName: 'Roofing', bidders: 3, fundedBidders: 2, topFundedCents: 30000, secondFundedCents: 25000, depthLeads: 2, listed7: 2, listed30: 2, soldAtAward30: 2, sold30: 2, avgSoldCents: 30000, minSoldCents: 30000, maxSoldCents: 30000, lastSoldCents: 30000, sellThrough: 1, inMarketplace: 0, inVault: 0, planCplCents: 6000, marginCents: 23500, marginBasis: 'bid', state: 'open' },
        { county: 'Ector', jobType: 'painting', tradeName: 'Painting', bidders: 1, fundedBidders: 1, topFundedCents: 20000, depthLeads: 2, listed7: 0, listed30: 4, soldAtAward30: 1, sold30: 3, avgSoldCents: 14000, minSoldCents: 9000, maxSoldCents: 20000, lastSoldCents: 9000, sellThrough: 0.75, inMarketplace: 1, inVault: 0, buyers: 1, planCplCents: 5000, marginCents: 8500, marginBasis: 'sold', state: 'oversupplied' },
        { county: 'Midland', jobType: 'flooring', tradeName: 'Flooring', bidders: 0, fundedBidders: 0, depthLeads: 0, listed7: 1, listed30: 1, soldAtAward30: 0, sold30: 0, avgSoldCents: null, minSoldCents: null, maxSoldCents: null, lastSoldCents: null, sellThrough: 0, inMarketplace: 1, inVault: 0, buyers: 0, marginCents: null, marginBasis: 'bid', state: 'nobuyers' },
      ],
    };
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'Demand')!.click());
    await flush();
    const grid = document.body.querySelector('table[aria-label="Demand"]')!;
    const cells = Array.from(grid.querySelectorAll('button[data-state]'));
    expect(cells.map((c) => c.getAttribute('data-state'))).toEqual(['oversupplied', 'nobuyers', 'open']);
    // A red cell with no company buying the trade says so: that is a sales call, not a campaign change.
    const nobody = cells.find((c) => c.getAttribute('data-state') === 'nobuyers')!;
    expect(nobody.getAttribute('title')).toBe('Nobody buys this trade: sign a company');
    await act(async () => (nobody as HTMLButtonElement).click());
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain('No company lists Flooring as a trade it buys');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    const midland = cells.find((c) => c.getAttribute('data-state') === 'open')!;
    // Every square reads as a sentence: no key needed.
    expect(midland.textContent).toContain('Biggest cash bid $300.00 · covers 2 more');
    expect(midland.textContent).toContain('Last month: 2 brought, 2 sold, about $300.00 each');
    expect(midland.textContent).toContain('About +$235.00 profit a lead');
    expect(midland.getAttribute('title')).toBe('Run ads here · Profit is figured on the biggest bid; switches to real sales after 3');
    // Ector has sold enough that its profit is on what leads really went for, not the bid.
    expect(cells[0].textContent).toContain('Last month: 4 brought, 3 sold, about $140.00 each · 1 still unsold');
    expect(cells[0].textContent).toContain('About +$85.00 profit a lead (on real sales)');
    expect(cells[0].getAttribute('title')).toBe('Leads sitting unsold: pause · Profit is figured on real sales');
    expect(nobody.textContent).toContain('No bids yet');
    expect(nobody.textContent).toContain('Last month: 1 brought, none sold · 1 still unsold');
    await act(async () => (cells[0] as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="slot-sales"]')!.textContent).toBe('Last 30 days: brought 4, sold 3 (75%). They went for $90.00 to $200.00, about $140.00 each, the latest for $90.00. 1 went straight to a standing bid.');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    // The owner sets the planned cost per lead in the column header.
    const cpl = grid.querySelector('input[aria-label="Planned cost per roofing lead"]') as HTMLInputElement;
    expect(cpl.value).toBe('60');
    await act(async () => type(cpl, '45'));
    await act(async () => cpl.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await flush();
    expect(setPlanCpl).toHaveBeenCalledWith('roofing', 4500);
    // Opening a cell lists the bidders with whether they can pay.
    await act(async () => (midland as HTMLButtonElement).click());
    await flush();
    const panel = document.body.querySelector('[role="dialog"]')!;
    expect(panel.getAttribute('aria-label')).toBe('Roofing in Midland County');
    expect(panel.querySelector('[aria-label="Bidders"]')!.textContent).toContain('Rich Roofing$300.00 · can pay for 1 more lead');
    expect(panel.querySelector('[aria-label="Bidders"]')!.textContent).toContain("Poor Roofing$400.00 · can't pay: balance $1.00");
    await act(async () => (panel.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    // The search box narrows the grid to matching counties and trades.
    const search = document.body.querySelector('input[aria-label="Search the board"]') as HTMLInputElement;
    await act(async () => type(search, 'ector'));
    expect(Array.from(document.body.querySelectorAll('table[aria-label="Demand"] button[data-state]')).map((c) => c.getAttribute('data-state'))).toEqual(['oversupplied']);
    await act(async () => type(search, ''));
    expect(document.body.querySelectorAll('table[aria-label="Demand"] button[data-state]')).toHaveLength(3);
  });

  it('shows what was sent for each awarded lead and flags the ones nobody acknowledged', async () => {
    delivered = [
      { id: 'm1', orgLeadId: 'ol1', name: 'Dana Reyes', jobType: 'roofing', companyName: 'Peak Roofing', priceCents: 25000, assignedAt: '2026-10-22T16:00:00Z', minutesOpen: 22, afterHours: false, overdue: true,
        deliveries: [{ id: 'd1', channel: 'email', to: 'office@peak.example', status: 'sent', at: '2026-10-22T16:00:01Z' }, { id: 'd2', channel: 'sms', to: '', status: 'skipped', error: 'Nobody at the company has a mobile for alerts', at: '2026-10-22T16:00:01Z' }] },
      { id: 'm2', orgLeadId: 'ol2', name: 'Ray Ortiz', jobType: 'painting', companyName: 'Broke Roofing', priceCents: 20000, assignedAt: '2026-10-22T15:00:00Z', acknowledgedAt: '2026-10-22T15:04:00Z', minutesOpen: 4, afterHours: false, overdue: false, deliveries: [] },
    ];
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'Delivered')!.click());
    await flush();
    const list = document.body.querySelector('[aria-label="Delivered"]')!;
    expect(document.body.textContent).toContain('1 not acknowledged after 15 minutes: call the company.');
    const items = Array.from(list.querySelectorAll(':scope > li'));
    expect(items[0].getAttribute('data-overdue')).toBe('true');
    expect(items[0].textContent).toContain('No “Got it” yet · 22 min');
    expect(items[0].textContent).toContain('Email sent to office@peak.example');
    expect(items[0].textContent).toContain('Text skipped: Nobody at the company has a mobile for alerts');
    expect(items[1].getAttribute('data-overdue')).toBeNull();
    expect(items[1].textContent).toContain('Got it in 4 min');
    await act(async () => (items[0].querySelector('button') as HTMLButtonElement).click());
    expect(resendAlerts).toHaveBeenCalledWith('ol1');
  });

  it('lists a lead only once all six checks are ticked, then says who got it', async () => {
    intakeRows = [
      { id: 'i1', source: 'meta', status: 'working', label: 'Dana Reyes', name: 'Dana Reyes', phone: '432-555-0133', county: 'Midland', jobType: 'roofing', tradeName: 'Roofing', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T03:00:00Z' },
    ];
    await render(<LeadMarketPage />);
    await act(async () => (document.body.querySelector('[aria-label="Intake"] button') as HTMLButtonElement).click());
    await flush();
    const panel = document.body.querySelector('[data-testid="confirm-checklist"]')!;
    const confirmButton = Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === 'Confirm & list') as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    // Before a single box is ticked, staff see who gets the lead.
    expect(panel.querySelector('[data-destination="sold"]')?.textContent).toBe("Sells to Peak Roofing at $250.00 the moment it's listed.");
    const boxes = Array.from(panel.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    expect(boxes).toHaveLength(6);
    for (const box of boxes.slice(0, 5)) await act(async () => box.click());
    expect(confirmButton.disabled).toBe(true);
    await act(async () => boxes[5].click());
    expect(confirmButton.disabled).toBe(false);
    await act(async () => type(panel.querySelector('input[aria-label="What they said"]') as HTMLInputElement, 'Hail damage, wants it this month'));
    await act(async () => confirmButton.click());
    await flush();
    expect(confirmIntake).toHaveBeenCalledWith(
      'i1',
      { reached: true, phoneOwner: true, addressInCounty: true, trade: true, owner: true, consent: true },
      expect.objectContaining({ name: 'Dana Reyes', county: 'Midland', jobType: 'roofing' }),
      'Hail damage, wants it this month',
      undefined,
    );
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Listed and sold to Peak Roofing for $250.00');
  });
});
