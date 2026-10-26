import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const assign = jest.fn(async () => ({ orgLeadId: 'ol1', priceCents: 8500 }));
const requestCredit = jest.fn(async () => undefined);
let wallet: Record<string, unknown> | null = null;
let liveErrors: Record<string, string> = {};
let role = 'super_admin';
let emptyMarket = false;
let feedLeads: unknown[] = [];
let permitStatus: unknown = { source: null, last30Days: 0 };
let soldLeads: unknown[] = [];
const buyLead = jest.fn(async () => ({ orgLeadId: 'ol9' }));
let demoCompanies = false;
let noCompanies = false;
let demoBids = false;
const removeCompany = jest.fn(async (_id: string) => undefined);
const setCompanyOwner = jest.fn(async (_id: string, _email: string) => 'invited');
const setPlan = jest.fn(async () => undefined);

let staffInvites: Array<{ id: string; email: string; role?: string; createdAt: string }> = [];
const inviteStaff = jest.fn(async (email: string, role = 'staff') => { staffInvites = [...staffInvites, { id: `i${staffInvites.length + 1}`, email, role, createdAt: '2026-10-22' }]; return { status: 'invited' }; });

let dncLists: Array<{ list: string; label: string; count: number; uploadedAt?: string; dueAt?: string; current: boolean }> = [
  { list: 'national', label: 'National Do Not Call list', count: 0, current: false },
  { list: 'texas', label: 'Texas no-call list', count: 12, uploadedAt: '2026-10-01T15:00:00.000Z', dueAt: '2027-01-01T15:00:00.000Z', current: true },
];
const dncChunk = jest.fn<Promise<{ added: number }>, [string, string[]]>(async () => ({ added: 0 }));
const dncFinish = jest.fn<Promise<{ count: number }>, [string]>(async () => {
  dncLists = dncLists.map((l) => (l.list === 'national' ? { ...l, count: 7000, uploadedAt: '2026-10-27T15:00:00.000Z', dueAt: '2026-11-27T15:00:00.000Z', current: true } : l));
  return { count: 7000 };
});
const dncAdd = jest.fn<Promise<null>, [string, string | undefined]>(async () => null);

const sellerHomes = [
  {
    parcelId: 'p1',
    address: '807 W Weatherford Av',
    owner: 'Away Owner',
    mailing: { address: '1 Ocean Way', city: 'Malibu', state: 'CA', zip: '90265' },
    lists: ['serious_violation', 'out_of_state', 'absentee'],
    score: 6,
    codeCases: 3,
    seriousCases: 1,
    lastSignalAt: '2026-10-01T15:00:00.000Z',
    marketValueCents: 18_000_000,
    deedDate: '1999-03-01',
  },
];
const sellersQuery = jest.fn<Promise<unknown>, [{ lists?: string[]; minLists?: number }]>(async () => ({
  homes: sellerHomes,
  more: false,
  counts: { serious_violation: 912, out_of_state: 801, absentee: 11000 },
  stacked: 1234,
  total: 25000,
  lists: [
    { key: 'serious_violation', label: 'Serious violation', weight: 3 },
    { key: 'out_of_state', label: 'Out-of-state owner', weight: 2 },
    { key: 'absentee', label: 'Absentee owner', weight: 1 },
  ],
}));

let auctionHomes: unknown[] = [];
const auctionAdd = jest.fn<Promise<{ added: number; skipped: number; unmatched: string[] }>, [string, string, string]>(async () => {
  auctionHomes = [
    { id: 'f1', address: '2709 Howdy Dr', kind: 'mortgage', status: 'posted', matched: true, ownerOnRoll: 'Cole Jane', marketValueCents: 24_000_000 },
    { id: 'f2', address: '410 Elm St', kind: 'mortgage', status: 'posted', matched: false },
  ];
  return { added: 2, skipped: 0, unmatched: ['410 Elm St'] };
});
const auctionUpdate = jest.fn<Promise<null>, [Record<string, unknown>]>(async () => null);

let intakeRows: unknown[] = [];
let intakeLog: unknown[] = [];
let payments: { playMoney: boolean } | undefined = { playMoney: false };
const createIntake = jest.fn(async (_source: string, _fields: unknown) => ({ id: 'i1', duplicate: false }));
const confirmIntake = jest.fn(async () => ({ leadId: 'm7', outcome: 'sold', companyName: 'Peak Roofing', priceCents: 25000 }));

let demand: unknown = { vaCostCents: 500, demoLeads: false, planCpl: { roofing: 6000 }, slots: [] };
const setPlanCpl = jest.fn(async (_jobType: string, _cents: number | null) => null);
let delivered: unknown[] = [];
const resendAlerts = jest.fn(async (_id: string) => null);
const markHandled = jest.fn<Promise<string>, [string]>(async () => '2026-10-24T15:00:00Z');
const removeLead = jest.fn(async (): Promise<void> => undefined);
const destination: unknown = { kind: 'sold', companyName: 'Peak Roofing', priceCents: 25000, tradeName: 'Roofing', county: 'Midland' };

// The live subscriptions see the same fixtures the one-shot calls used to return.
jest.mock('../../../lib/live', () => ({
  useWallet: () => wallet,
  useLiveErrors: () => liveErrors,
  // The company panel's leads come from the one-shot read in these tests.
  useCompanyLeads: () => undefined,
  useDemandBoard: () => demand,
  useDemandSlot: (_county: string, jobType: string) =>
    jobType === 'flooring'
      ? { bidders: [], buyers: [], leads: [] }
      : { bidders: [{ companyName: 'Rich Roofing', amountCents: 30000, balanceCents: 40000, funded: true, winning: true }, { companyName: 'Poor Roofing', amountCents: 40000, balanceCents: 100, funded: false, winning: false }], buyers: ['Rich Roofing', 'Poor Roofing'], leads: [] },
  useIntakeQueue: () => intakeRows,
  useIntakeLog: () => intakeLog,
  usePaymentsMode: () => payments,
  useDelivered: () => delivered,
  useInbox: () => ({
    available: emptyMarket ? [] : [{ id: 'm1', name: 'Jane Cole', jobType: 'roofing', city: 'Midland', status: 'available', price: 8500, createdAt: '2026-10-16', verified: { at: '2026-10-16T15:00:00Z', note: 'Wants it before the rain' } }],
    older: emptyMarket ? [] : [{ id: 'm2', name: 'Old Hollis', jobType: 'painting', city: 'Odessa', status: 'older', price: 4000, createdAt: '2026-10-01' }],
    sold: soldLeads,
  }),
  useCompanies: () => noCompanies ? [] : demoCompanies
    ? [{ id: 'd1', name: 'Permian Roofing & Exteriors', leadTrades: ['roofing'], balanceCents: 101500, leads30d: 1, spent30dCents: 8500, leadsTotal: 1, wonCents: 1850000, wonCount: 1, pendingCredits: 0, isSample: true, sampleBids: demoBids ? 3 : 0 }]
    : [
    { id: 'o1', name: 'Broke Roofing', leadTrades: ['roofing'], balanceCents: 1000, leads30d: 0, spent30dCents: 0, leadsTotal: 0, wonCents: 0, wonCount: 0, pendingCredits: 0, sampleBids: demoBids ? 3 : 0 },
    { id: 'o2', name: 'Peak Roofing', owners: ['pat@peak.example'], leadTrades: ['roofing'], balanceCents: 50000, leads30d: 2, spent30dCents: 17000, leadsTotal: 2, wonCents: 1200000, wonCount: 1, pendingCredits: 0,
      fundingLink: { status: 'submitted', amountCents: 500000, createdAt: '2026-10-20T00:00:00Z' },
      plan: { status: 'active', active: true, monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, claimsLeft: 8, nextClaimCents: 0, periodStart: '2026-10-01T00:00:00Z', nextChargeAt: '2026-11-01T00:00:00Z' } },
    { id: 'o3', name: 'Ace Painting', leadTrades: [], balanceCents: 0, isEmpty: true, leads30d: 0, spent30dCents: 0, leadsTotal: 0, wonCents: 0, wonCount: 0, pendingCredits: 0 },
  ],
  usePendingCredits: () => [],
  useApplications: () => applications,
  useLeadDestination: (county?: string, jobType?: string) => (county && jobType ? destination : undefined),
}));

let applications: unknown[] = [];
let companyLeads: unknown[] = [];
const setPrice = jest.fn(async () => null);
const creditLead = jest.fn(async (): Promise<{ amountCents: number }> => ({ amountCents: 28500 }));
const approveApplication = jest.fn(async (): Promise<{ organizationId: string }> => ({ organizationId: 'o2' }));
const declineApplication = jest.fn(async () => null);
jest.mock('../../../lib/api', () => ({
  applicationsAPI: {
    approve: (id: string) => approveApplication(id),
    decline: (id: string) => declineApplication(id),
  },
  deliveryAPI: { resend: (id: string) => resendAlerts(id), markHandled: (id: string) => markHandled(id) },
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
    invite: (email: string, role?: string) => inviteStaff(email, role),
    removeInvite: async () => undefined,
    remove: async () => undefined,
  },
  sellersAPI: {
    sellers: (args: { lists?: string[]; minLists?: number }) => sellersQuery(args),
    home: async () => ({
      address: '807 W Weatherford Av',
      owner: 'Away Owner',
      lists: ['serious_violation', 'out_of_state'],
      score: 5,
      signals: [{ kind: 'code_violation', detail: 'Deteriorated Structure', status: 'In Violation', caseNumber: 'DS-1', date: '2026-09-01T15:00:00.000Z' }],
      foreclosures: [],
    }),
    status: async () => ({ source: { syncedAt: '2026-10-26T06:40:00.000Z', fetched: 47868, added: 0, updated: 12 }, stacked: 1234, total: 25000 }),
    syncNow: async () => ({ fetched: 3000, added: 4, updated: 9 }),
  },
  foreclosuresAPI: {
    sale: async (saleDate?: string) => ({ saleDate: saleDate ?? '2026-11-03', saleDates: ['2026-11-03', '2026-10-06'], homes: auctionHomes }),
    addMany: (saleDate: string, kind: string, addresses: string) => auctionAdd(saleDate, kind, addresses),
    update: (args: Record<string, unknown>) => auctionUpdate(args),
    remove: async () => null,
  },
  callsAPI: {
    dncStatus: async () => dncLists,
    tally: async () => [{ callerId: 'u9', name: 'Dana', email: 'dana@tolliver.example', calls: 41, answered: 12, leads: 3, confirmed: 2, sold: 1 }],
    startDncImport: async () => 'b1',
    importDncChunk: (batchId: string, numbers: string[]) => dncChunk(batchId, numbers),
    finishDncImport: (batchId: string) => dncFinish(batchId),
    addDoNotCall: (phone: string, note?: string) => dncAdd(phone, note),
  },
  permitsAPI: { status: async () => permitStatus, syncNow: async () => ({ fetched: 0, added: 0, updated: 0 }) },
  marketplaceAPI: {
    prices: async () => ({ defaultCents: 20000, prices: [{ jobType: 'roofing', priceCents: 28500, floorCents: 6000, dropCents: 1000, dropEveryMinutes: 60 }] }),
    setPrice: (...args: unknown[]) => setPrice(...(args as [])),
    assign: (...args: unknown[]) => assign(...(args as [])),
    removeCompany: (id: string) => removeCompany(id),
    setCompanyOwner: (id: string, email: string) => setCompanyOwner(id, email),
    setPlan: (id: string, changes: unknown) => setPlan(id, changes),
    removeLead: (id: string) => removeLead(id),
    creditLead: (id: string, reason: string, note?: string) => creditLead(id, reason, note),
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
  leadsAPI: { list: async () => companyLeads },
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
/** The Ops page opens on Intake; the leads for sale sit behind the For sale tab. */
const openListed = async () => {
  await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('For sale'))!.click());
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
  liveErrors = {};
  emptyMarket = false;
  demoCompanies = false;
  noCompanies = false;
  demoBids = false;
  feedLeads = [];
  soldLeads = [];
  intakeRows = [];
  intakeLog = [];
  delivered = [];
  applications = [];
  companyLeads = [];
  payments = { playMoney: false };
});

describe('Lead Market', () => {
  it('is only for Tolliver staff; staff see leads and companies but not prices, demo data or money', async () => {
    role = 'user';
    await render(<LeadMarketPage />);
    expect(document.body.textContent).toContain('only for Tolliver staff');

    document.body.innerHTML = '';
    role = 'staff';
    await render(<LeadMarketPage />);
    // No role pill by the heading: the top bar already says who you are.
    expect(document.body.textContent).not.toContain('Tolliver staff');
    expect(Array.from(document.body.querySelectorAll('[role="tablist"][aria-label="Ops tabs"] [role="tab"]')).map((t) => t.textContent)).toEqual(['Demand (0/0)', 'Intake (0)', 'Calls', 'Sellers', 'For sale (1)', 'Sold', 'Companies (3)']);
    expect(document.body.textContent).not.toContain('Add 20 sample leads');
    expect(document.body.querySelector('[data-testid="team-card"]')).toBeNull();
    // The company panel reads only: no payment link, payments or plan.
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    await act(async () => Array.from(document.body.querySelectorAll('tr')).find((r) => r.textContent?.includes('Peak Roofing'))!.click());
    await flush();
    const panel = document.body.querySelector('[role="dialog"]')!;
    expect(panel.textContent).toContain('Standing bids');
    expect(panel.textContent).not.toContain('Send payment link');
    expect(panel.textContent).not.toContain('Record a payment');
  });

  it('confirms a lead once, in Intake: For sale and the Vault show the stamp, and nobody is asked to call again', async () => {
    role = 'super_admin';
    await render(<LeadMarketPage />);
    await openListed();
    const listed = document.body.querySelector('ul[aria-label="For sale"]')!;
    expect(listed.textContent).toContain('Jane Cole');
    expect(listed.textContent).toContain('Confirmed');
    expect(listed.querySelector('[aria-label^="Confirm"], [aria-label^="Re-confirm"]')).toBeNull();
    expect(Array.from(listed.querySelectorAll('button')).map((b) => b.textContent)).not.toContain('Confirm');
    const vault = document.body.querySelector('ul[aria-label="The Vault"]')!;
    expect(vault.textContent).toContain('Old Hollis');
    expect(vault.textContent).toContain('Not confirmed');
    // No Confirm or Re-confirm on Vault leads: the company that claims one calls the homeowner.
    expect(Array.from(vault.querySelectorAll('button')).map((b) => b.textContent)).not.toContain('Confirm');
    expect(Array.from(vault.querySelectorAll('button')).map((b) => b.textContent)).not.toContain('Re-confirm');
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
    expect(document.title).toBe('Intake · Ops · Tolliver');
    expect(Array.from(document.body.querySelectorAll('[role="tablist"][aria-label="Ops tabs"] [role="tab"]')).map((t) => t.textContent)).toEqual(['Demand (0/0)', 'Intake (2)', 'Calls', 'Sellers', 'For sale (1)', 'Sold', 'Companies (3)', 'Prices']);
    expect(document.body.textContent).not.toContain('sell on their own');
    const open = async (name: string) => {
      await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith(name))!.click());
      await flush();
    };
    await open('For sale');
    expect(heading()).toBe('For sale');
    expect(summary()).toBe('1 lead for sale in the Marketplace · $170.00 sold in 30 days');
    await open('Companies');
    expect(heading()).toBe('Companies');
    expect(summary()).toBe('3 companies · $510.00 in lead balances · 1 Pro');
    await open('Demand');
    expect(heading()).toBe('Demand');
    expect(summary()).toBe('0 of 0 worth running ads');
    await open('Prices');
    expect(heading()).toBe('Prices');
    expect(summary()).toBe('Start and floor price for 2 trades');
    expect(document.title).toBe('Prices · Ops · Tolliver');
  });

  it('keeps the tab and the open company in the address, so Back works and a link opens the right panel', async () => {
    const Address = () => {
      const location = useLocation();
      return <span data-testid="address">{location.pathname + location.search}</span>;
    };
    const address = () => document.body.querySelector('[data-testid="address"]')!.textContent;
    await render(<MemoryRouter initialEntries={['/ops?tab=companies&company=o2']}><LeadMarketPage /><Address /></MemoryRouter>, false);
    expect(document.body.querySelector('h1')!.textContent).toBe('Companies');
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain('Peak Roofing');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    await flush();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(address()).toBe('/ops?tab=companies');
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Demand'))!.click());
    await flush();
    expect(document.body.querySelector('h1')!.textContent).toBe('Demand');
    expect(address()).toBe('/ops?tab=demand');
    // Staff never see Prices, so a link to it lands them on Intake instead of a blank tab.
    document.body.innerHTML = '';
    role = 'staff';
    await render(<MemoryRouter initialEntries={['/ops?tab=prices']}><LeadMarketPage /></MemoryRouter>, false);
    expect(document.body.querySelector('h1')!.textContent).toBe('Intake');
  });

  it("the Permits card shows how far the builder lookup has got, and when the city's portal failed", async () => {
    permitStatus = {
      source: {
        syncedAt: '2026-10-26T06:10:00.000Z',
        fetched: 40,
        added: 30,
        updated: 2,
        details: { at: '2026-10-26T15:00:00.000Z', looked: 5, filled: 0, failed: 5, error: 'stopped after 5 failures in a row: HTTP 503' },
      },
      owners: { syncedAt: '2026-10-25T07:20:00.000Z', fetched: 53024, lastAppliedAt: '2025-12-04' },
      last30Days: 900,
      details: { filled: 2950, total: 3159 },
    };
    try {
      await render(<MemoryRouter initialEntries={['/ops?tab=forsale']}><LeadMarketPage /></MemoryRouter>, false);
      const line = document.body.querySelector('[data-testid="permit-builders"]')!;
      expect(line.textContent).toContain('Builders and job value: 2,950 of 3,159 permits filled in · last run ');
      expect(line.textContent).toContain("the city's portal failed: stopped after 5 failures in a row: HTTP 503");
      const owners = document.body.querySelector('[data-testid="permit-owners"]')!;
      expect(owners.textContent).toContain('Owners: 53,024 Midland homes on the appraisal roll · newest deed Dec 2025 · read Oct 25');
    } finally {
      permitStatus = { source: null, last30Days: 0 };
    }
  });

  it('the Calls tab: Do Not Call lists stop calling until uploaded, upload in chunks, and the caller tally', async () => {
    await render(<MemoryRouter initialEntries={['/ops?tab=calls']}><LeadMarketPage /></MemoryRouter>, false);
    const national = () => document.body.querySelector('[data-testid="dnc-national"]')!;
    expect(national().textContent).toContain('Not uploaded: calling is stopped.');
    expect(document.body.querySelector('[data-testid="dnc-texas"]')!.textContent).toContain('12 numbers · uploaded Oct 1, 2026 · due again by Jan 1, 2027');
    expect(document.body.querySelector('table[aria-label="Caller tally"]')!.textContent).toContain('Dana41123');

    // 7,000 numbers go up as two chunks, then the upload is finished.
    const lines = Array.from({ length: 7000 }, (_, i) => `432,${String(5000000 + i)}`).join('\n');
    const file = new File([lines], 'dnc-432.txt', { type: 'text/plain' });
    if (!file.text) Object.defineProperty(file, 'text', { value: async () => lines });
    const picker = national().querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { value: [file], configurable: true });
    await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    await flush();
    expect(dncChunk.mock.calls.map(([, n]) => n.length)).toEqual([5000, 2000]);
    expect(dncChunk.mock.calls[0][1][0]).toBe('4325000000');
    expect(dncFinish).toHaveBeenCalledWith('b1');
    expect(document.body.textContent).toContain('The National Do Not Call list is in: 7,000 numbers.');
    expect(national().textContent).toContain('7,000 numbers · uploaded Oct 27, 2026 · due again by Nov 27, 2026');

    const never = document.body.querySelector('input[aria-label="Number to never call"]') as HTMLInputElement;
    await act(async () => type(never, '432-555-0199'));
    await act(async () => (never.form!.querySelector('button[type="submit"]') as HTMLButtonElement).click());
    await flush();
    expect(dncAdd).toHaveBeenCalledWith('432-555-0199', 'Added in Ops');
  });

  it('the courthouse auction card: paste a sale, then mark one sold with its buyer', async () => {
    auctionHomes = [];
    await render(<MemoryRouter initialEntries={['/ops?tab=calls']}><LeadMarketPage /></MemoryRouter>, false);
    const card = () => document.body.querySelector('[data-testid="auction-card"]')!;
    expect(card().textContent).toContain('Nothing added for Nov 3 yet.');
    await act(async () => {
      const box = card().querySelector('textarea[aria-label="Posted addresses"]') as HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, '2709 Howdy Dr\n410 Elm St');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => (card().querySelector('form button[type="submit"]') as HTMLButtonElement).click());
    await flush();
    expect(auctionAdd).toHaveBeenCalledWith('2026-11-03', 'mortgage', '2709 Howdy Dr\n410 Elm St');
    expect(card().textContent).toContain('Added 2 for Nov 3 · not on the appraisal roll: 410 Elm St');
    expect(card().querySelector('[data-testid="auction-counts"]')!.textContent).toBe('Nov 3: 2 posted');
    const first = card().querySelector('[data-testid="auction-home"]')!;
    expect(first.textContent).toContain('on the roll as Cole Jane, worth $240,000');

    const status = first.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      status.value = 'sold';
      status.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(auctionUpdate).not.toHaveBeenCalled();
    await act(async () => {
      type(first.querySelector('input[aria-label="Buyer"]') as HTMLInputElement, 'Basin Flips LLC');
      type(first.querySelector('input[aria-label="Buyer phone"]') as HTMLInputElement, '432-555-0142');
      type(first.querySelector('input[aria-label="Sale price"]') as HTMLInputElement, '145,000');
    });
    await act(async () => Array.from(first.querySelectorAll('button')).find((b) => b.textContent === 'Save')!.click());
    await flush();
    expect(auctionUpdate).toHaveBeenCalledWith({ id: 'f1', status: 'sold', buyer: { name: 'Basin Flips LLC', company: true, phone: '432-555-0142' }, salePriceCents: 14_500_000 });

    // Another home: back to the lender saves straight away.
    const second = card().querySelectorAll('[data-testid="auction-home"]')[1];
    const other = second.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      other.value = 'back_to_lender';
      other.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(auctionUpdate).toHaveBeenLastCalledWith({ id: 'f2', status: 'back_to_lender' });
  });

  it("the Sellers tab: lists with counts, filtering, a home's records, and the CSV export", async () => {
    await render(<MemoryRouter initialEntries={['/ops?tab=sellers']}><LeadMarketPage /></MemoryRouter>, false);
    expect(document.body.querySelector('[data-testid="sellers-status"]')!.textContent).toBe('City records read Oct 26, 2026 · 47,868 records · 25,000 homes on a list, 1,234 on 2 or more');
    expect(sellersQuery).toHaveBeenLastCalledWith({ lists: [], minLists: 1, limit: 200 });
    const chip = (name: string) => Array.from(document.body.querySelectorAll('[aria-label="Lists"] button')).find((b) => b.textContent?.startsWith(name)) as HTMLButtonElement;
    expect(chip('Out-of-state owner').textContent).toBe('Out-of-state owner (801)');
    await act(async () => chip('Out-of-state owner').click());
    await flush();
    expect(sellersQuery).toHaveBeenLastCalledWith({ lists: ['out_of_state'], minLists: 1, limit: 200 });
    expect(chip('Out-of-state owner').getAttribute('aria-pressed')).toBe('true');
    const min = document.body.querySelector('select[aria-label="Minimum lists"]') as HTMLSelectElement;
    await act(async () => {
      min.value = '2';
      min.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(sellersQuery).toHaveBeenLastCalledWith({ lists: ['out_of_state'], minLists: 2, limit: 200 });

    const row = document.body.querySelector('[data-testid="sellers"] button')!;
    expect(row.textContent).toContain('Away Owner · mail to 1 Ocean Way, Malibu CA · out of state');
    expect(row.textContent).toContain('3 code cases · last record Oct 1, 2026 · worth $180,000 · owned since 1999');
    await act(async () => (row as HTMLButtonElement).click());
    await flush();
    expect(document.body.querySelector('[data-testid="seller-home"]')!.textContent).toContain('Deteriorated Structure · Sep 1, 2026 · In Violation · DS-1');

    const { sellersCsv } = await import('../../ops/SellersCard');
    expect(sellersCsv(sellerHomes as never).split('\n')).toEqual([
      'Property address,Owner,Owner 2,Mailing address,Mailing city,Mailing state,Mailing zip,Lists,Score,Code cases,Last record,Market value,Owned since',
      '807 W Weatherford Av,Away Owner,,1 Ocean Way,Malibu,CA,90265,Serious violation; Out-of-state owner; Absentee owner,6,3,2026-10-01,180000,1999-03-01',
    ]);
  });

  it('sorts the Companies table by the heading tapped, and tapping again flips it', async () => {
    await render(<MemoryRouter initialEntries={['/ops?tab=companies']}><LeadMarketPage /></MemoryRouter>, false);
    const table = () => document.body.querySelector('table[aria-label="Companies"]')!;
    const names = () => Array.from(table().querySelectorAll('tbody tr')).map((r) => r.querySelector('td button')!.textContent);
    const heading = (label: string) => Array.from(table().querySelectorAll('thead th')).find((th) => th.textContent === label)!;
    const tapHeading = async (label: string) => {
      await act(async () => (heading(label).querySelector('button') as HTMLButtonElement).click());
      await flush();
    };
    // Until a heading is tapped, the order is the server's: newest company first.
    expect(names()).toEqual(['Broke Roofing', 'Peak Roofing', 'Ace Painting']);
    expect(heading('Balance').getAttribute('aria-sort')).toBe('none');
    // Numbers start biggest first.
    await tapHeading('Balance');
    expect(names()).toEqual(['Peak Roofing', 'Broke Roofing', 'Ace Painting']);
    expect(heading('Balance').getAttribute('aria-sort')).toBe('descending');
    await tapHeading('Balance');
    expect(names()).toEqual(['Ace Painting', 'Broke Roofing', 'Peak Roofing']);
    expect(heading('Balance').getAttribute('aria-sort')).toBe('ascending');
    // Names start A to Z, and only the heading in use says it is sorted.
    await tapHeading('Company');
    expect(names()).toEqual(['Ace Painting', 'Broke Roofing', 'Peak Roofing']);
    expect(heading('Company').getAttribute('aria-sort')).toBe('ascending');
    expect(heading('Balance').getAttribute('aria-sort')).toBe('none');
    // The won-jobs column says it counts all time, unlike the 30-day columns beside it.
    expect(heading('Jobs won, all time')).toBeDefined();
    // A paying Pro plan comes before no plan; companies with the same plan go A to Z.
    await tapHeading('Plan');
    expect(names()).toEqual(['Peak Roofing', 'Ace Painting', 'Broke Roofing']);
    // The totals stay at the bottom, whatever the order.
    expect(table().querySelector('tfoot [data-testid="companies-totals"]')).not.toBeNull();
    expect(table().querySelectorAll('tbody [data-testid="companies-totals"]').length).toBe(0);
  });

  it('says what failed and why, and keeps saying it until dismissed', async () => {
    removeLead.mockRejectedValueOnce(new Error('A sold lead stays on the books'));
    await render(<LeadMarketPage />);
    await openListed();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    await act(async () => (document.body.querySelector('button[aria-label="Delete Jane Cole"]') as HTMLButtonElement).click());
    // The confirm says what deleting does to buy orders on it.
    const ask = document.body.querySelector('[role="dialog"], [role="alertdialog"]')!;
    expect(ask.textContent).toContain('Any company with a buy order on it sees the order closed.');
    await act(async () => (Array.from(ask.querySelectorAll('button')).find((b) => b.textContent === 'Delete') as HTMLButtonElement).click());
    await flush();
    expect(removeLead).toHaveBeenCalledWith('m1');
    const alert = () => document.body.querySelector('[role="alert"]');
    expect(alert()!.textContent).toContain("Jane Cole wasn't deleted: A sold lead stays on the books");
    // It does not fade like a notice: a slow read still catches it, and switching tabs keeps it.
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    expect(alert()!.textContent).toContain("Jane Cole wasn't deleted");
    await act(async () => (alert()!.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click());
    expect(alert()).toBeNull();
  });

  it('shows landing-page applications to the owner, and Approve sets the company up and opens its panel', async () => {
    applications = [
      { id: 'a1', companyName: 'Basin Paint Co.', contactName: 'Ana Ruiz', email: 'ana@basinpaint.example', phone: '4325550199', trades: ['painting'], county: 'Midland', jobsPerMonth: '6', createdAt: new Date().toISOString(), existingCompanies: ['Desert Air HVAC'] },
    ];
    await render(<LeadMarketPage />);
    expect(Array.from(document.body.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toContain('Companies (3) · 1 applied');
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    const section = document.body.querySelector('[aria-label="Applications"]')!;
    expect(section.textContent).toContain('1 company applied to buy leads');
    // An owner adding a second company is flagged as an existing customer.
    expect(section.querySelector('[data-testid="existing-customer"]')!.textContent).toBe('Already a customer: runs Desert Air HVAC');
    expect(section.textContent).toContain('Basin Paint Co. · Ana Ruiz');
    expect(section.textContent).toContain('Painting · Midland County · 6 jobs a month');
    await act(async () => (Array.from(section.querySelectorAll('button')).find((b) => b.textContent === 'Approve') as HTMLButtonElement).click());
    await flush();
    expect(approveApplication).toHaveBeenCalledWith('a1');
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Peak Roofing');
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Company set up');
  });

  it('with no companies yet, still shows applications and a New company button that opens the dialog', async () => {
    noCompanies = true;
    applications = [{ id: 'a1', companyName: 'Basin Paint Co.', contactName: 'Ana Ruiz', email: 'a@b.c', phone: '4325550199', trades: ['painting'], county: 'Midland', createdAt: new Date().toISOString() }];
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    expect(document.body.textContent).toContain('No companies yet. Tap New company, or approve an application above');
    expect(document.body.querySelector('[aria-label="Applications"]')!.textContent).toContain('Basin Paint Co.');
    expect(document.body.querySelector('[data-testid="team-card"]')).not.toBeNull();
    await act(async () => byText('New company')!.click());
    await flush();
    expect(document.body.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('New company');
  });

  it('logging a call keeps the edits typed into the lead, and Save says Saved', async () => {
    intakeRows = [
      { id: 'i1', source: 'meta', status: 'working', label: 'Dana Reyes', name: 'Dana Reyes', phone: '432-555-0133', address: '1 Oak St', county: 'Midland', jobType: 'roofing', tradeName: 'Roofing', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T03:00:00Z' },
    ];
    await render(<LeadMarketPage />);
    await act(async () => (document.body.querySelector('[aria-label="Intake"] button') as HTMLButtonElement).click());
    await flush();
    const address = document.body.querySelector('input[aria-label="Address"]') as HTMLInputElement;
    await act(async () => type(address, '12 Elm St'));
    await act(async () => byText('Voicemail')!.click());
    await flush();
    // The row reloaded (the attempt shows), but the typed address is still there.
    expect((document.body.querySelector('input[aria-label="Address"]') as HTMLInputElement).value).toBe('12 Elm St');
    await act(async () => byText('Save changes')!.click());
    await flush();
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Saved');
  });

  it('Prices: tapping away from an unchanged field saves nothing, and a blank start price never wipes a trade', async () => {
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'Prices')!.click());
    await flush();
    const start = document.body.querySelector('input[aria-label="Roofing start price"]') as HTMLInputElement;
    expect(start.value).toBe('285');
    const blur = () => act(async () => start.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await blur();
    expect(setPrice).not.toHaveBeenCalled();
    // Clearing the start price to retype it, then tapping away, must not delete the trade's row.
    await act(async () => type(start, ''));
    await blur();
    expect(setPrice).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="alert"]')!.textContent).toContain('Start price needed');
    await act(async () => type(start, '300'));
    await blur();
    expect(setPrice).toHaveBeenCalledWith('roofing', 300, { floor: 60, drop: 10, dropEveryMinutes: 60 });
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
  });

  it('labels balances as play money on Ops while payments are in test mode', async () => {
    payments = { playMoney: true };
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    expect(document.body.querySelector('[data-testid="ops-summary"]')!.textContent).toBe('3 companies · $510.00 in lead balances (play money) · 1 Pro');
    expect(document.body.querySelector('[data-testid="companies-totals"]')!.textContent).toContain('play money');
  });

  it('keeps applications from staff', async () => {
    role = 'staff';
    applications = [{ id: 'a1', companyName: 'Basin Paint Co.', contactName: 'Ana Ruiz', email: 'a@b.c', phone: '4325550199', trades: ['painting'], county: 'Midland', createdAt: new Date().toISOString() }];
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    expect(document.body.querySelector('[aria-label="Applications"]')).toBeNull();
  });

  it('says when the lead numbers are demo data, and names the county and trade when there are none', async () => {
    demand = {
      vaCostCents: 500, demoLeads: true, planCpl: {},
      slots: [
        { county: 'Ector', jobType: 'painting', tradeName: 'Painting', bidders: 1, fundedBidders: 1, topFundedCents: 22000, depthLeads: 49, listed7: 0, listed30: 2, soldAtAward30: 1, sold30: 1, avgSoldCents: 20000, minSoldCents: 20000, maxSoldCents: 20000, lastSoldCents: 20000, sellThrough: 0.5, inMarketplace: 1, inVault: 0, buyers: 1, marginCents: null, marginBasis: 'bid', state: 'oversupplied' },
        { county: 'Midland', jobType: 'painting', tradeName: 'Painting', bidders: 1, fundedBidders: 1, topFundedCents: 20000, depthLeads: 3, listed7: 0, listed30: 0, soldAtAward30: 0, sold30: 0, avgSoldCents: null, minSoldCents: null, maxSoldCents: null, lastSoldCents: null, sellThrough: null, inMarketplace: 0, inVault: 0, buyers: 1, marginCents: null, marginBasis: 'bid', state: 'unknown' },
        { county: 'Howard', jobType: 'painting', tradeName: 'Painting', bidders: 2, fundedBidders: 2, topFundedCents: 4000, depthLeads: 9, listed7: 0, listed30: 0, soldAtAward30: 0, sold30: 0, avgSoldCents: null, minSoldCents: null, maxSoldCents: null, lastSoldCents: null, sellThrough: null, inMarketplace: 0, inVault: 0, buyers: 2, planCplCents: 5000, marginCents: -1500, marginBasis: 'bid', state: 'loss' },
      ],
    };
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Demand'))!.click());
    await flush();
    const board = document.body.querySelector('[data-testid="demand-board"]')!;
    expect(board.textContent).toContain('No real lead yet, so the lead numbers are demo data.');
    const cells = Array.from(board.querySelectorAll('table[aria-label="Demand"] button[data-state]'));
    // The card keeps to the profit and what to do; the 30-day detail is in the hover text and the drawer.
    expect(cells[0].getAttribute('title')).toContain('Last 30 days: 2 Painting leads in Ector County, 1 sold, about $200.00 each · 1 still unsold (demo)');
    expect(cells[0].textContent).not.toContain('Last 30 days');
    const midlandPainting = cells.find((c) => c.getAttribute('data-state') === 'unknown')!;
    expect(midlandPainting.textContent).toContain('Add ad cost');
    expect(midlandPainting.textContent).not.toContain('last 30 days');
    expect(midlandPainting.getAttribute('title')).toContain('No Painting leads in Midland County, last 30 days');
    // No cost typed: blue, never green. A cost above the bids: a loss, not "nobody can pay".
    expect(midlandPainting.getAttribute('title')!.split('\n')[0]).toBe('Has buyers · type your ad cost per lead to check profit');
    const howard = cells.find((c) => c.getAttribute('data-state') === 'loss')!;
    expect(howard.getAttribute('title')!.split('\n')[0]).toContain("Bids don't cover your ad cost per lead");
    expect(howard.textContent).toContain('$15 loss');
    expect(document.body.querySelector('[data-testid="ops-summary"]')!.textContent).toBe('0 of 3 worth running ads · 1 need an ad cost per lead · 1 would lose money · 1 sitting unsold');
    await act(async () => (midlandPainting as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="slot-sales"]')!.textContent).toBe('No Painting leads came in for Midland County in the last 30 days, whenever the bids here were placed.');
    expect(document.body.querySelector('[data-testid="slot-profit"]')!.textContent).toBe('Type an ad cost per lead in the Painting column header to see profit here.');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    await act(async () => (cells[0] as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="slot-sales"]')!.textContent).toContain('These are demo leads.');
  });

  it('lets the owner credit a bought lead back from the company panel', async () => {
    companyLeads = [
      { id: 'l1', name: 'Dana Reyes', status: 'new', marketplaceLeadId: 'm1', pricePaidCents: 28500, wonVia: 'bid' },
      { id: 'l2', name: 'Own Lead', status: 'won', source: 'Referral' },
      { id: 'l4', name: 'Market Buy', status: 'new', marketplaceLeadId: 'm4', pricePaidCents: 4000, wonVia: 'buy' },
      { id: 'l5', name: 'Vault Claim', status: 'new', marketplaceLeadId: 'm5', pricePaidCents: 0, wonVia: 'claim' },
      { id: 'l6', name: 'Hand Sent', status: 'new', marketplaceLeadId: 'm6', pricePaidCents: 4000, wonVia: 'sent' },
      { id: 'l3', name: 'Already Done', status: 'new', marketplaceLeadId: 'm3', pricePaidCents: 20000, creditRequest: { reason: 'duplicate', requestedAt: '2026-10-01T00:00:00Z', status: 'approved' } },
    ];
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    await act(async () => Array.from(document.body.querySelectorAll('tr')).find((r) => r.textContent?.includes('Peak Roofing'))!.click());
    await flush();
    const panel = document.body.querySelector('[role="dialog"]')!;
    // Each lead says how it got there, not just "From Tolliver".
    const row = (name: string) => Array.from(panel.querySelectorAll('li')).find((li) => li.textContent?.includes(name))!;
    expect(row('Dana Reyes').textContent).toContain('Won with a bid · $285.00');
    expect(row('Market Buy').textContent).toContain('Bought in the Marketplace · $40.00');
    expect(row('Vault Claim').textContent).toContain('Claimed from the Vault · included in the plan');
    expect(row('Hand Sent').textContent).toContain('Sent by Tolliver · $40.00');
    expect(row('Own Lead').textContent).toContain('Added by hand · Referral');
    // The stage on the right is the job, never confused with how the lead was got.
    expect(row('Own Lead').textContent).toContain('Job sold');
    expect(row('Already Done').textContent).toContain('From Tolliver · $200.00');
    const creditButtons = Array.from(panel.querySelectorAll('button')).filter((b) => b.textContent === 'Credit it back');
    // Only the bought leads that aren't credited yet offer it.
    expect(creditButtons).toHaveLength(4);
    expect(panel.textContent).toContain('Already Done');
    expect(panel.textContent).toContain('credited back');
    await act(async () => creditButtons[0].click());
    const form = panel.querySelector('[data-testid="credit-form"]')!;
    expect(form.textContent).toContain('Puts $285.00 back on their balance');
    const why = form.querySelector('select[aria-label="Why"]') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(why, 'out_of_area');
      why.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => type(form.querySelector('input[aria-label="Credit note"]') as HTMLInputElement, 'Odessa, not Midland'));
    await act(async () => (Array.from(form.querySelectorAll('button')).find((b) => b.textContent === 'Credit $285.00 back') as HTMLButtonElement).click());
    await flush();
    expect(creditLead).toHaveBeenCalledWith('l1', 'out_of_area', 'Odessa, not Midland');
    expect(panel.querySelector('[role="status"]')!.textContent).toBe('Credited $285.00 back to Peak Roofing for Dana Reyes.');
  });

  it('totals the companies table: cash held, leads and spend this month, plan mix and value won', async () => {
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Companies'))!.click());
    await flush();
    const cells = Array.from(document.body.querySelectorAll('[data-testid="companies-totals"] td')).map((td) => td.textContent);
    expect(cells).toEqual(['Total3 companies', '$510.00', '2', '$170.00', '1 Pro · 2 no plan', '$12,000.00']);
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
    expect(inviteStaff).toHaveBeenCalledWith('va@fieldquote.example', 'staff');
    expect(document.body.querySelector('[data-testid="team-card"]')!.textContent).toContain('va@fieldquote.example · invited as staff, not signed up yet');

    // A caller: the same form with Caller picked.
    const roleSelect = card.querySelector('select[aria-label="Role"]') as HTMLSelectElement;
    await act(async () => {
      roleSelect.value = 'caller';
      roleSelect.dispatchEvent(new Event('change', { bubbles: true }));
      type(card.querySelector('input[type="email"]') as HTMLInputElement, 'dana@tolliver.example');
    });
    await act(async () => (card.querySelector('button[type="submit"]') as HTMLButtonElement).click());
    await flush();
    expect(inviteStaff).toHaveBeenLastCalledWith('dana@tolliver.example', 'caller');
    const after = document.body.querySelector('[data-testid="team-card"]')!.textContent;
    expect(after).toContain('Invited. dana@tolliver.example becomes a caller when they sign up with that email.');
    expect(after).toContain('dana@tolliver.example · invited as caller, not signed up yet');
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
    expect(options[1].textContent).toContain('needs $75.00 more');
    // One tap picks; nothing is charged until the confirm button.
    const confirm = () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Pick a company') || b.textContent?.startsWith('Send to')) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    await act(async () => options[0].click());
    expect(assign).not.toHaveBeenCalled();
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(confirm().textContent).toBe('Send to Peak Roofing · charge $85.00');
    // The send button sits in a footer pinned to the bottom of the dialog, so a long list never hides it.
    const footer = dialog.querySelector('[data-testid="send-footer"]')!;
    expect(footer.className).toContain('sticky');
    expect(footer.contains(confirm())).toBe(true);
    // A failed send says why right above the button, where the eye already is.
    assign.mockRejectedValueOnce(new Error('Not enough balance'));
    await act(async () => confirm().click());
    await flush();
    expect(footer.querySelector('[role="alert"]')!.textContent).toBe('Not enough balance');
    // The price dropped while the dialog was open: the toast says what was really charged.
    assign.mockResolvedValueOnce({ orgLeadId: 'ol1', priceCents: 7000 });
    await act(async () => confirm().click());
    await flush();
    expect(assign).toHaveBeenCalledWith('m1', 'o2');
    expect(document.body.textContent).toContain('Sold to Peak Roofing by hand · $70.00 charged');
  });

  it('suggests the same bonus the payment page gives: nothing under $7,500, 5% from there, 10% from $10,000', () => {
    expect([suggestedBonus(500), suggestedBonus(5000), suggestedBonus(7500), suggestedBonus(10000), suggestedBonus(12000)]).toEqual([0, 0, 375, 1000, 1200]);
  });
});

describe("a company's lead balance", () => {
  it('tells a brand-new company its first two steps before it has bought anything', async () => {
    wallet = { balanceCents: 0, typicalLeadCents: 4500, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, transactions: [], leadTrades: ['roofing'] };
    const container = await render(<WalletBar organizationId="o1" />);
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Two steps to start winning leads: add funds, then set your bids.');
    expect(Array.from(alert.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Add funds']);
    expect(alert.querySelector('a[href="/bids"]')?.textContent).toBe('Set bids');
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
    expect(document.body.textContent).toContain('From Tolliver · $85.00');
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
    expect(document.body.textContent).not.toContain('Platform owner');
    await act(async () => byText('Companies')!.click());
    await flush();
    const row = (name: string) => Array.from(document.body.querySelectorAll('tr')).find((r) => r.textContent?.includes(name))!;
    expect(row('Peak Roofing').textContent).toContain('Pro plan');
    expect(row('Ace Painting').textContent).toContain('No plan');
    await act(async () => row('Peak Roofing').click());
    await flush();
    expect(byText('Remove this empty company')).toBeUndefined();
    expect(document.body.querySelector('[data-testid="company-owners"]')?.textContent).toBe('pat@peak.example');
    // How far the last payment link got.
    expect(document.body.querySelector('[data-testid="link-status"]')?.textContent).toBe("Payment link: they're at checkout for $5,000.00");
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
    // All set but nobody has a mobile: the last step is a phone for the alert texts.
    expect(line({ balanceCents: 100000, standingBids: 2, pausedBids: 0, hasMobile: false })).toEqual({
      tone: 'warn',
      text: 'Your bids are live. Add your mobile so lead alerts reach you by text the moment you win one.',
      action: 'mobile',
      label: 'Add your mobile',
    });
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
  it('shows how each sold lead went, and strikes through the ones credited back', async () => {
    delivered = [
      { id: 'm2', orgLeadId: 'ol2', name: 'Ray Ortiz', jobType: 'painting', companyName: 'Peak Roofing', priceCents: 26000, assignedAt: '2026-10-18T12:00:00Z', acknowledgedAt: '2026-10-18T12:03:00Z', minutesOpen: 3, afterHours: false, overdue: false, wonVia: 'bid', deliveries: [] },
      { id: 'm3', orgLeadId: 'ol3', name: 'Lee Park', jobType: 'roofing', companyName: 'Broke Roofing', priceCents: 8500, assignedAt: '2026-10-17T12:00:00Z', acknowledgedAt: '2026-10-17T12:30:00Z', minutesOpen: 30, afterHours: false, overdue: false, wonVia: 'sent', credited: true, deliveries: [] },
    ];
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Sold'))!.click());
    await flush();
    const items = Array.from(document.body.querySelectorAll('[aria-label="Sold"] > li'));
    expect(items[0].textContent).toContain('to Peak Roofing · $260.00 · sold by bid');
    expect(items[1].textContent).toContain('to Broke Roofing · $85.00 credited back · sent by hand');
    expect(items[1].querySelector('.line-through')!.textContent).toBe('$85.00');
    // The old address still opens it: emails sent before the rename say ?tab=delivered.
    document.body.innerHTML = '';
    await render(<MemoryRouter initialEntries={['/ops?tab=delivered']}><LeadMarketPage /></MemoryRouter>, false);
    expect(document.body.querySelector('h1')!.textContent).toBe('Sold');
  });

  it("says which part of Ops couldn't load instead of loading forever", async () => {
    liveErrors = { 'intake:queue': 'Only Tolliver staff can do this' };
    await render(<MemoryRouter initialEntries={['/ops']}><LeadMarketPage /></MemoryRouter>, false);
    const alerts = Array.from(document.body.querySelectorAll('[role="alert"]')).map((a) => a.textContent);
    expect(alerts).toContain("Couldn't load the intake queue: Only Tolliver staff can do this");
  });

  it('keeps an unknown county visible, asks before closing with unsaved edits, and says where a confirmed lead went', async () => {
    const { IntakePanel } = await import('../../ops/IntakePanel');
    intakeRows = [
      { id: 'i5', source: 'meta', status: 'new', label: 'Ana Ruiz', name: 'Ana Ruiz', county: 'Midlnd', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T02:00:00Z' },
      { id: 'i6', source: 'call', status: 'confirmed', label: 'Bo Diaz', name: 'Bo Diaz', county: 'Midland', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T02:00:00Z',
        listed: { id: 'm7', status: 'assigned', companyName: 'Peak Roofing', organizationId: 'o2', priceCents: 25000 } },
    ];
    const onClose = jest.fn();
    await render(<IntakePanel id="i5" trades={[]} onClose={onClose} onChanged={() => {}} onListed={() => {}} />);
    const panel = document.body.querySelector('aside[role="dialog"]')!;
    const county = Array.from(panel.querySelectorAll('select')).find((sel) => Array.from(sel.options).some((o) => o.text === 'Choose a county')) as HTMLSelectElement;
    expect(county.value).toBe('Midlnd');
    expect(county.options[county.selectedIndex].text).toBe('Midlnd (not a Texas county)');
    // An edit that isn't saved: tapping outside asks first.
    const name = Array.from(panel.querySelectorAll('input')).find((i) => i.value === 'Ana Ruiz')!;
    await act(async () => type(name, 'Ana M. Ruiz'));
    await act(async () => (document.body.querySelector('.backdrop-blur-sm') as HTMLElement).click());
    const ask = Array.from(document.body.querySelectorAll('[role="dialog"], [role="alertdialog"]')).find((d) => d.textContent?.includes('Close without saving?'))!;
    expect(ask).toBeDefined();
    await act(async () => (Array.from(ask.querySelectorAll('button')).find((b) => b.textContent === 'Keep editing') as HTMLButtonElement).click());
    expect(onClose).not.toHaveBeenCalled();
    document.body.innerHTML = '';
    await render(<IntakePanel id="i6" trades={[]} onClose={onClose} onChanged={() => {}} onListed={() => {}} />);
    expect(document.body.querySelector('[data-testid="intake-outcome"]')?.textContent).toBe('Sold to Peak Roofing for $250.00');
  });

  it('says "Not a lead", not "Closed": the filter, the button, and the reason staff picked', async () => {
    const { IntakeQueue } = await import('../../ops/IntakeQueue');
    const { intakeAPI } = jest.requireMock('../../../lib/api') as { intakeAPI: { close: (...a: unknown[]) => Promise<unknown> } };
    const close = intakeAPI.close;
    const closeSpy = jest.fn(async () => null);
    intakeAPI.close = closeSpy;
    try {
      intakeRows = [
        { id: 'i7', source: 'meta', status: 'working', label: 'Cy Ford', name: 'Cy Ford', phone: '432-555-0177', county: 'Midland', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T02:00:00Z' },
        { id: 'i8', source: 'meta', status: 'closed', disposition: 'bad_number', label: 'Di Gray', name: 'Di Gray', county: 'Midland', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T02:00:00Z' },
      ];
      await render(<IntakeQueue trades={[]} openNew={false} onCloseNew={() => {}} />);
      const filters = Array.from(document.body.querySelectorAll('[aria-label="Intake filter"] [role="tab"]')).map((t) => t.textContent);
      expect(filters).toEqual(['To call', 'Not a lead', 'Confirmed']);
      expect(filters).not.toContain('Closed');
      // The Confirmed list says where each lead went, without opening the drawer.
      intakeRows = [
        ...(intakeRows as unknown[]),
        { id: 'c1', source: 'meta', status: 'confirmed', label: 'Ed Hale', name: 'Ed Hale', county: 'Midland', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T02:00:00Z', listed: { id: 'm1', status: 'assigned', companyName: 'Peak Roofing', organizationId: 'o2', priceCents: 25000 } },
        { id: 'c2', source: 'meta', status: 'confirmed', label: 'Flo Ince', name: 'Flo Ince', county: 'Ector', attempts: [], lastAttempt: null, createdAt: '2026-10-21T02:00:00Z', updatedAt: '2026-10-21T02:00:00Z', listed: { id: 'm2', status: 'available' } },
        { id: 'c3', source: 'meta', status: 'confirmed', label: 'Gus Jay', name: 'Gus Jay', county: 'Ector', attempts: [], lastAttempt: null, createdAt: '2026-10-20T02:00:00Z', updatedAt: '2026-10-20T02:00:00Z', listed: { id: 'm3', status: 'older' } },
      ];
      document.body.innerHTML = '';
      await render(<IntakeQueue trades={[]} openNew={false} onCloseNew={() => {}} />);
      expect(Array.from(document.body.querySelectorAll('[data-testid="intake-destination"]')).map((d) => d.textContent)).toEqual([
        'Sold to Peak Roofing · $250.00',
        'For sale in the Marketplace',
        'In the Vault',
      ]);
      document.body.innerHTML = '';
      const { IntakePanel } = await import('../../ops/IntakePanel');
      await render(<IntakePanel id="i7" trades={[]} onClose={() => {}} onChanged={() => {}} onListed={() => {}} />);
      const panel = document.body.querySelector('aside[role="dialog"]')!;
      const reason = panel.querySelector('select[aria-label="Reason"]') as HTMLSelectElement;
      await act(async () => {
        reason.value = 'bad_number';
        reason.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const mark = Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === 'Mark not a lead') as HTMLButtonElement;
      expect(mark).toBeDefined();
      await act(async () => mark.click());
      await flush();
      expect(closeSpy).toHaveBeenCalledWith('i7', 'bad_number', undefined);
      document.body.innerHTML = '';
      // A lead marked "not a lead" says so, with the reason as staff picked it.
      await render(<IntakePanel id="i8" trades={[]} onClose={() => {}} onChanged={() => {}} onListed={() => {}} />);
      expect(document.body.textContent).toContain('not a lead: Bad number');
      expect(document.body.textContent).not.toContain('closed:');
    } finally {
      intakeAPI.close = close;
    }
  });

  it('opens a lead whose details fail to load with the reason and a Close button', async () => {
    const { intakeAPI } = jest.requireMock('../../../lib/api') as { intakeAPI: { get: (id: string) => Promise<unknown> } };
    const get = intakeAPI.get;
    intakeAPI.get = async () => {
      throw new Error('Lead not found');
    };
    try {
      const { IntakePanel } = await import('../../ops/IntakePanel');
      const onClose = jest.fn();
      await render(<IntakePanel id="i9" trades={[]} onClose={onClose} onChanged={() => {}} onListed={() => {}} />);
      const dialog = document.body.querySelector('[role="dialog"]')!;
      expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("The lead couldn't be loaded: Lead not found");
      await act(async () => (Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Close') as HTMLButtonElement).click());
      expect(onClose).toHaveBeenCalled();
    } finally {
      intakeAPI.get = get;
    }
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
      vaCostCents: 500, demoLeads: false, planCpl: { roofing: 6000 },
      slots: [
        { county: 'Midland', jobType: 'roofing', tradeName: 'Roofing', bidders: 3, fundedBidders: 2, topFundedCents: 30000, topBidderName: 'Rich Roofing', secondFundedCents: 25000, depthLeads: 2, listed7: 2, listed30: 2, soldAtAward30: 2, sold30: 2, avgSoldCents: 30000, minSoldCents: 30000, maxSoldCents: 30000, lastSoldCents: 30000, sellThrough: 1, inMarketplace: 0, inVault: 0, planCplCents: 6000, marginCents: 23500, marginBasis: 'bid', state: 'open' },
        { county: 'Ector', jobType: 'painting', tradeName: 'Painting', bidders: 1, fundedBidders: 1, topFundedCents: 20000, depthLeads: 2, listed7: 0, listed30: 4, soldAtAward30: 1, sold30: 3, avgSoldCents: 14000, minSoldCents: 9000, maxSoldCents: 20000, lastSoldCents: 9000, sellThrough: 0.75, inMarketplace: 1, inVault: 0, buyers: 1, planCplCents: 5000, marginCents: 8500, marginBasis: 'sold', state: 'oversupplied' },
        { county: 'Midland', jobType: 'flooring', tradeName: 'Flooring', bidders: 0, fundedBidders: 0, depthLeads: 0, listed7: 1, listed30: 1, soldAtAward30: 0, sold30: 0, avgSoldCents: null, minSoldCents: null, maxSoldCents: null, lastSoldCents: null, sellThrough: 0, inMarketplace: 1, inVault: 0, buyers: 0, marginCents: null, marginBasis: 'bid', state: 'nobuyers' },
      ],
    };
    await render(<LeadMarketPage />);
    await act(async () => Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Demand'))!.click());
    await flush();
    const grid = document.body.querySelector('table[aria-label="Demand"]')!;
    const cells = Array.from(grid.querySelectorAll('button[data-state]'));
    expect(cells.map((c) => c.getAttribute('data-state'))).toEqual(['oversupplied', 'nobuyers', 'open']);
    // A red cell with no company buying the trade says so: that is a sales call, not a campaign change.
    const nobody = cells.find((c) => c.getAttribute('data-state') === 'nobuyers')!;
    expect(nobody.getAttribute('title')!.split('\n')[0]).toBe('Nobody buys this trade: sign a company');
    await act(async () => (nobody as HTMLButtonElement).click());
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain('No company lists Flooring as a trade it buys');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    const midland = cells.find((c) => c.getAttribute('data-state') === 'open')!;
    // A square leads with the profit in whole dollars, then the winning bid and what to do; the rest is in the hover text and the drawer.
    // Green with a winning bid means run ads: the card doesn't spell it out, the label and hover text still do.
    // The last line of a green square names who wins the next lead there.
    expect(midland.textContent).toBe('$235 profitWinning bid $300Rich Roofing');
    expect(midland.getAttribute('aria-label')).toBe('Roofing in Midland County: $235 profit. Winning bid $300, Rich Roofing. Run ads here');
    expect(midland.getAttribute('title')).toContain('Wins the next lead: Rich Roofing');
    expect(midland.getAttribute('title')).toContain('Last 30 days: 2 Roofing leads in Midland County, 2 sold, about $300.00 each');
    expect(midland.getAttribute('title')).toContain('About +$235.00 profit a lead');
    expect(midland.getAttribute('title')!.split('\n')[0]).toBe('Run ads here · Profit is figured on the highest funded bid; switches to real sales after 3');
    expect(midland.getAttribute('title')).toContain('3 bidders · highest funded bid $300.00');
    // Ector has sold enough that its profit is on what leads really went for, not the bid.
    expect(cells[0].textContent).toBe('$85 profitWinning bid $200Leads sitting unsold: pause');
    expect(cells[0].getAttribute('title')).toContain('Last 30 days: 4 Painting leads in Ector County, 3 sold, about $140.00 each · 1 still unsold');
    expect(cells[0].getAttribute('title')).toContain('About +$85.00 profit a lead (on real sales)');
    expect(cells[0].getAttribute('title')!.split('\n')[0]).toBe('Leads sitting unsold: pause · Profit is figured on real sales');
    expect(cells[0].getAttribute('title')).toContain('1 bidder · highest funded bid $200.00 · covers 2 more');
    expect(nobody.textContent).toContain('No bids yet');
    expect(nobody.textContent).not.toContain('Winning bid');
    expect(nobody.getAttribute('title')).toContain('Last 30 days: 1 Flooring lead in Midland County, none sold · 1 still unsold');
    // The flooring drawer has no price and no cost: it says so instead of showing nothing.
    await act(async () => (nobody as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="slot-profit"]')!.textContent).toBe('No price to figure profit from yet: nobody with money has bid here, and nothing has sold.');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    await act(async () => (cells[0] as HTMLButtonElement).click());
    // The drawer shows the profit arithmetic, on the real average once a square has sold enough.
    expect(document.body.querySelector('[data-testid="slot-profit"]')!.textContent).toBe('Worth it? $140.00 real average − $50.00 ad cost − $5.00 call = about $85.00 profit a lead.');
    expect(document.body.querySelector('[data-testid="slot-sales"]')!.textContent).toBe('Last 30 days: 4 Painting leads came in for Ector County, 3 sold (75%). They went for $90.00 to $200.00, about $140.00 each, the latest for $90.00. 1 went straight to a standing bid.');
    await act(async () => (document.body.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement).click());
    // The owner sets the ad cost per lead in the column header.
    const cpl = grid.querySelector('input[aria-label="Ad cost per Roofing lead"]') as HTMLInputElement;
    expect(cpl.value).toBe('60');
    await act(async () => type(cpl, '45'));
    await act(async () => cpl.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await flush();
    expect(setPlanCpl).toHaveBeenCalledWith('roofing', 4500);
    expect(cpl.parentElement!.textContent).toContain('✓ Saved');
    // Not a number: nothing is sent, the box goes back and says why.
    setPlanCpl.mockClear();
    await act(async () => type(cpl, 'lots'));
    await act(async () => cpl.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await flush();
    expect(setPlanCpl).not.toHaveBeenCalled();
    expect(cpl.value).toBe('60');
    expect(cpl.parentElement!.querySelector('[role="alert"]')?.textContent).toBe('Enter an ad cost per lead in dollars');
    // Opening a cell lists the bidders with whether they can pay.
    await act(async () => (midland as HTMLButtonElement).click());
    await flush();
    const panel = document.body.querySelector('[role="dialog"]')!;
    expect(panel.getAttribute('aria-label')).toBe('Roofing in Midland County');
    expect(panel.querySelector('[data-testid="slot-profit"]')!.textContent).toBe('Worth it? $300.00 highest funded bid − $60.00 ad cost − $5.00 call = about $235.00 profit a lead.');
    // The bids summary that left the card lives here now.
    expect(panel.querySelector('[data-testid="slot-bids"]')!.textContent).toBe('3 bidders · highest funded bid $300.00 · covers 2 more');
    expect(panel.querySelector('[aria-label="Bidders"]')!.textContent).toContain('Rich RoofingWins the next lead$300.00 · can pay for 1 more lead');
    expect(panel.querySelector('[aria-label="Bidders"]')!.textContent).toContain("Poor Roofing$400.00 · can't pay: balance $1.00");
    await act(async () => (panel.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    // The search box narrows the grid to matching counties and trades.
    const search = document.body.querySelector('input[aria-label="Search the board"]') as HTMLInputElement;
    await act(async () => type(search, 'ector'));
    expect(Array.from(document.body.querySelectorAll('table[aria-label="Demand"] button[data-state]')).map((c) => c.getAttribute('data-state'))).toEqual(['oversupplied']);
    await act(async () => type(search, ''));
    expect(document.body.querySelectorAll('table[aria-label="Demand"] button[data-state]')).toHaveLength(3);
  });

  it('shows what was sent for each sold lead and flags the ones nobody acknowledged', async () => {
    delivered = [
      { id: 'm1', orgLeadId: 'ol1', name: 'Dana Reyes', jobType: 'roofing', organizationId: 'o2', companyName: 'Peak Roofing', companyPhone: '(432) 555-0100', priceCents: 25000, assignedAt: '2026-10-22T16:00:00Z', minutesOpen: 22, afterHours: false, overdue: true,
        deliveries: [{ id: 'd1', channel: 'email', to: 'office@peak.example', status: 'sent', at: '2026-10-22T16:00:01Z' }, { id: 'd2', channel: 'sms', to: '', status: 'skipped', error: 'Nobody at the company has a mobile for alerts', at: '2026-10-22T16:00:01Z' }] },
      { id: 'm2', orgLeadId: 'ol2', name: 'Ray Ortiz', jobType: 'painting', companyName: 'Broke Roofing', priceCents: 20000, assignedAt: '2026-10-22T15:00:00Z', acknowledgedAt: '2026-10-22T15:04:00Z', minutesOpen: 4, afterHours: false, overdue: false, deliveries: [] },
    ];
    await render(<LeadMarketPage />);
    // The tab carries the overdue count in red, so a call to make is visible from any tab; the browser tab leads with it too.
    const tab = Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Sold'))!;
    expect(tab.textContent).toBe('Sold 1');
    expect(tab.querySelector('span')!.className).toContain('bg-red-500');
    expect(document.title).toBe('(1) Intake · Ops · Tolliver');
    await act(async () => tab.click());
    await flush();
    expect(document.title).toBe('(1) Sold · Ops · Tolliver');
    const list = document.body.querySelector('[aria-label="Sold"]')!;
    expect(document.body.textContent).toContain('1 not acknowledged after 15 minutes: call the company.');
    const items = Array.from(list.querySelectorAll(':scope > li'));
    expect(items[0].getAttribute('data-overdue')).toBe('true');
    expect(items[0].textContent).toContain('No “Got it” yet · 22 min');
    // The red row carries the number to call, as a tap-to-dial link.
    expect(items[0].textContent).toContain('Call Peak Roofing: (432) 555-0100');
    expect(items[0].querySelector('a[href="tel:4325550100"]')).not.toBeNull();
    expect(items[1].querySelector('a[href^="tel:"]')).toBeNull();
    expect(items[0].textContent).toContain('Email sent to office@peak.example');
    expect(items[0].textContent).toContain('Text skipped: Nobody at the company has a mobile for alerts');
    expect(items[1].getAttribute('data-overdue')).toBeNull();
    expect(items[1].textContent).toContain('Got it in 4 min');
    const button = (li: Element, label: string) => Array.from(li.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
    await act(async () => button(items[0], 'Resend alerts').click());
    expect(resendAlerts).toHaveBeenCalledWith('ol1');
    // After a phone call: "Called, they have it" stops the red; the acknowledged row has no such button.
    expect(button(items[1], 'Called, they have it')).toBeUndefined();
    await act(async () => button(items[0], 'Called, they have it').click());
    expect(markHandled).toHaveBeenCalledWith('m1');
    // The company's name opens its panel on the Companies tab.
    expect(items[0].querySelector('a[href^="/ops?tab=companies&company="]')?.textContent).toBe('Peak Roofing');
  });

  it('lists a lead only once all six checks are ticked, then says who got it', async () => {
    intakeRows = [
      { id: 'i1', source: 'meta', status: 'working', label: 'Dana Reyes', name: 'Dana Reyes', phone: '432-555-0133', county: 'Midland', jobType: 'roofing', tradeName: 'Roofing', attempts: [], lastAttempt: null, createdAt: '2026-10-22T02:00:00Z', updatedAt: '2026-10-22T03:00:00Z' },
    ];
    await render(<LeadMarketPage />);
    await act(async () => (document.body.querySelector('[aria-label="Intake"] button') as HTMLButtonElement).click());
    await flush();
    const panel = document.body.querySelector('[data-testid="confirm-checklist"]')!;
    const confirmButton = Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === 'Confirm & sell') as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    // Before a single box is ticked, staff see who gets the lead.
    expect(panel.querySelector('[data-destination="sold"]')?.textContent).toBe("Sells to Peak Roofing at $250.00 the moment it's confirmed.");
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
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Confirmed and sold to Peak Roofing for $250.00');
  });
});
