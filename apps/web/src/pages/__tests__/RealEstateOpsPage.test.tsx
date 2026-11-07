import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const exportPage = jest.fn<Promise<unknown>, [{ lists?: string[]; minLists?: number; cursor: string | null }]>(async ({ cursor }) =>
  cursor === null
    ? { page: sellerHomes, isDone: false, continueCursor: 'c1' }
    : { page: [{ ...sellerHomes[0], parcelId: 'p2', address: '410 Elm St' }], isDone: true, continueCursor: 'c2' },
);

let auctionHomes: unknown[] = [];
const auctionAdd = jest.fn<Promise<{ added: number; skipped: number; unmatched: string[] }>, [string, string, string]>(async () => {
  auctionHomes = [
    { id: 'f1', address: '2709 Howdy Dr', kind: 'mortgage', status: 'posted', matched: true, ownerOnRoll: 'Cole Jane', marketValueCents: 24_000_000 },
    { id: 'f2', address: '410 Elm St', kind: 'mortgage', status: 'posted', matched: false },
  ];
  return { added: 2, skipped: 0, unmatched: ['410 Elm St'] };
});
const auctionUpdate = jest.fn<Promise<null>, [Record<string, unknown>]>(async () => null);

const ownersStatus: unknown = { syncedAt: '2026-10-25T07:20:00.000Z', fetched: 53024, lastAppliedAt: '2025-12-04' };
const syncOwners = jest.fn(async () => ({ fetched: 52220, added: 0, updated: 3 }));

jest.mock('../../lib/api', () => ({
  sellersAPI: {
    sellers: (args: { lists?: string[]; minLists?: number }) => sellersQuery(args),
    exportPage: (args: { lists?: string[]; minLists?: number; cursor: string | null }) => exportPage(args),
    home: async () => ({
      address: '807 W Weatherford Av',
      owner: 'Away Owner',
      lists: ['serious_violation', 'out_of_state'],
      score: 5,
      signals: [{ kind: 'code_violation', detail: 'Deteriorated Structure', status: 'In Violation', caseNumber: 'DS-1', date: '2026-09-01T15:00:00.000Z' }],
      foreclosures: [],
    }),
    status: async () => ({ source: { syncedAt: '2026-10-26T06:40:00.000Z', fetched: 47868, added: 0, updated: 12 }, stacked: 1234, total: 25000 }),
    syncNow: async () => ({ started: true, full: false }),
  },
  foreclosuresAPI: {
    sale: async (saleDate?: string) => ({ saleDate: saleDate ?? '2026-11-03', saleDates: ['2026-11-03', '2026-10-06'], homes: auctionHomes }),
    addMany: (saleDate: string, kind: string, addresses: string) => auctionAdd(saleDate, kind, addresses),
    update: (args: Record<string, unknown>) => auctionUpdate(args),
    remove: async () => null,
  },
  permitsAPI: { status: async () => ({ source: null, owners: ownersStatus, last30Days: 0 }), syncOwners: () => syncOwners() },
}));
let role = 'staff';
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }));

import RealEstateOpsPage from '../RealEstateOpsPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
async function render(path: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter initialEntries={[path]}><RealEstateOpsPage /></MemoryRouter>));
  await flush();
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  role = 'staff';
});

describe('Ops, the Real estate side', () => {
  it('opens on Sellers with its own tabs, and is only for staff', async () => {
    await render('/ops/real-estate');
    const tabs = Array.from(document.body.querySelectorAll('[role="tablist"][aria-label="Real estate tabs"] [role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Sellers', 'Auction', 'Sources']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(document.title).toBe('Sellers · Real estate · Ops · Webb Leads');
    await act(async () => (tabs[2] as HTMLButtonElement).click());
    await flush();
    expect(document.body.querySelector('[data-testid="real-estate-summary"]')!.textContent).toBe('Where the lists come from, and when each was last read');
    document.body.innerHTML = '';
    role = 'caller';
    await render('/ops/real-estate');
    expect(document.body.textContent).toContain('The Ops page is only for Webb Leads staff.');
  });

  it('Sources: the appraisal roll and the city records, each with a sync', async () => {
    await render('/ops/real-estate?tab=sources');
    expect(document.body.querySelector('[data-testid="source-owners"]')!.textContent).toBe('53,024 homes · newest deed Dec 2025 · read Oct 25, 2026');
    expect(document.body.querySelector('[data-testid="source-records"]')!.textContent).toBe('47,868 records read Oct 26, 2026 · 25,000 homes on a list, 1,234 on 2 or more');
    await act(async () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Sync owners')!.click());
    await flush();
    expect(syncOwners).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Read 52,220 homes: 0 new, 3 changed.');
    const letters = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === 'Records request letters to the county')!;
    expect(letters.getAttribute('href')).toBe('https://claude.ai/artifact/5474qEqQ25TmXB2y2WPrar');
    expect(letters.getAttribute('target')).toBe('_blank');
  });

  it('the courthouse auction card: paste a sale, then mark one sold with its buyer', async () => {
    auctionHomes = [];
    await render('/ops/real-estate?tab=auction');
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
    await render('/ops/real-estate');
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

    const { sellersCsv } = await import('../../components/ops/SellersCard');
    expect(sellersCsv(sellerHomes as never).split('\n')).toEqual([
      'Property address,Owner,Owner 2,Mailing address,Mailing city,Mailing state,Mailing zip,Lists,Score,Code cases,Last record,Market value,Owned since',
      '807 W Weatherford Av,Away Owner,,1 Ocean Way,Malibu,CA,90265,Serious violation; Out-of-state owner; Absentee owner,6,3,2026-10-01,180000,1999-03-01',
    ]);
  });

  it('Export CSV reads every page of the filtered homes, not just the ones on screen', async () => {
    const blobs: Blob[] = [];
    const url = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    url.createObjectURL = (b: Blob) => {
      blobs.push(b);
      return 'blob:sellers';
    };
    url.revokeObjectURL = () => {};
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await render('/ops/real-estate');
    const chip = Array.from(document.body.querySelectorAll('[aria-label="Lists"] button')).find((b) => b.textContent?.startsWith('Absentee owner')) as HTMLButtonElement;
    await act(async () => chip.click());
    await flush();
    exportPage.mockClear();
    await act(async () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Export CSV')!.click());
    await flush();
    expect(exportPage.mock.calls.map(([a]) => a)).toEqual([
      { lists: ['absentee'], minLists: 1, cursor: null },
      { lists: ['absentee'], minLists: 1, cursor: 'c1' },
    ]);
    expect(click).toHaveBeenCalledTimes(1);
    expect(blobs).toHaveLength(1);
    expect(document.body.textContent).toContain('Exported 2 homes.');
    click.mockRestore();
  });

});
