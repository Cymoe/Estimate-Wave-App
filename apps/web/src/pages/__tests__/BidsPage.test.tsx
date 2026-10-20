import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let balanceCents = 100_000;
let standing: unknown[] = [];
let results: unknown[] = [];
const setStanding = jest.fn(async (_org: string, _county: string, _jobType: string, _amount: number) => 'sb1');
const removeStanding = jest.fn(async (_id: string) => undefined);
const createLink = jest.fn(async (_id: string) => 'tok');

jest.mock('../../lib/api', () => ({
  walletAPI: {
    get: async () => ({ balanceCents, typicalLeadCents: 20000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, leadTrades: ['landscaping'], transactions: [] }),
    feed: async () => [],
    bids: async () => [],
  },
  bidsAPI: {
    listStanding: async () => standing,
    setStanding: (...a: unknown[]) => setStanding(...(a as [string, string, string, number])),
    removeStanding: (id: string) => removeStanding(id),
    results: async () => results,
  },
  industriesAPI: { list: async () => [{ id: 'roofing', name: 'Roofing' }, { id: 'landscaping', name: 'Landscaping' }] },
  fundingAPI: { createLink: (id: string) => createLink(id), url: (t: string) => `/fund/${t}` },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o2', name: 'Mio Homes', industry: 'Landscaping' } }),
}));

import BidsPage, { SAVED_HINT_MS, SAVE_DELAY, STEP_SAVE_DELAY } from '../BidsPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const input = (label: string) => document.body.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const dialog = () => document.body.querySelector('[role="dialog"]');

async function render(path = '/bids') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter initialEntries={[path]}><BidsPage /></MemoryRouter>));
  await flush();
  return container;
}

beforeEach(() => {
  balanceCents = 100_000;
  standing = [];
  results = [];
});
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('Bids', () => {
  it('sets up bids on one screen: counties, then one price per trade in $50 steps, then saves one bid per county and trade', async () => {
    await render();
    expect(document.body.textContent).toContain('go to the highest bid the moment they come in');
    expect(document.body.querySelector('[role="tablist"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Recent results');
    expect(dialog()).toBeNull();
    await act(async () => byText('Set your bids')!.click());
    // Everything on one screen from the start: the county line and the trade rows, no steps.
    expect(dialog()?.textContent).toContain('County');
    expect(dialog()?.textContent).toContain('Your bids');
    expect(dialog()!.querySelectorAll('[aria-label="Bids by trade"] > li').length).toBeGreaterThan(0);
    // No county suggestions until something is typed; the matches float so nothing jumps.
    expect(dialog()!.querySelector('[aria-label="Counties"]')).toBeNull();
    expect(dialog()?.textContent).not.toContain('you bid here');
    expect(dialog()!.querySelector('[aria-label="Steps"]')).toBeNull();
    expect(byText('Next')).toBeUndefined();
    expect(dialog()?.textContent).toContain('Pick a county to start.');
    expect(byText('Start bidding')!.disabled).toBe(true);
    // One county at a time: type a county, or a town and get its county; the search folds to a line once picked.
    const matches = () => Array.from(dialog()!.querySelectorAll('[aria-label="Counties"] button'));
    await act(async () => type(input('Search counties'), 'Mid'));
    expect(matches().map((b) => b.textContent)).toEqual(['Midland County']);
    await act(async () => (matches()[0] as HTMLButtonElement).click());
    expect(dialog()?.textContent).toContain('Your bids');
    expect(input('Search counties')).toBeNull();
    expect(dialog()!.querySelector('[aria-label="Counties"]')).toBeNull();
    expect(dialog()!.querySelector('[aria-label="Where"]')?.textContent).toContain('Midland County');
    await act(async () => (document.body.querySelector('button[aria-label="Change county"]') as HTMLButtonElement).click());
    await act(async () => type(input('Search counties'), 'Odessa'));
    expect(matches()[0].textContent).toBe('Ector CountyOdessa is in Ector County');
    await act(async () => (matches()[0] as HTMLButtonElement).click());
    expect(dialog()!.querySelector('[aria-label="Where"]')?.textContent).toContain('Ector County');
    expect(dialog()!.textContent).toContain('Per lead · $50.00 steps · from $200.00');

    // One row per trade. Their own trade is live at the minimum; the other waits behind "Bid $200.00".
    const rowsByTrade = () => Array.from(dialog()!.querySelectorAll('[aria-label="Bids by trade"] > li'));
    expect(rowsByTrade().map((li) => li.querySelector('p')?.textContent)).toEqual(['Landscaping', 'Roofing']);
    expect(rowsByTrade()[0].textContent).toContain('Min $200.00');
    expect(input('Landscaping bid').value).toBe('200');
    expect(input('Roofing bid')).toBeNull();
    const button = (label: string) => document.body.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    // $50 steps, never below the minimum.
    expect(button('Lower Landscaping bid').disabled).toBe(true);
    await act(async () => button('Raise Landscaping bid').click());
    expect(input('Landscaping bid').value).toBe('250');
    await act(async () => button('Lower Landscaping bid').click());
    expect(input('Landscaping bid').value).toBe('200');
    await act(async () => type(input('Landscaping bid'), '230'));
    await act(async () => button('Raise Landscaping bid').click());
    expect(input('Landscaping bid').value).toBe('250');
    // Turn the other trade on, raise it, and the dialog is ready.
    await act(async () => (rowsByTrade()[1].querySelector('button') as HTMLButtonElement).click());
    expect(input('Roofing bid').value).toBe('200');
    await act(async () => button('Raise Roofing bid').click());
    expect(input('Roofing bid').value).toBe('250');
    expect(dialog()!.textContent).toContain('covers about 4 leads at your top bid');
    // Below the minimum blocks saving; so does switching every trade off.
    await act(async () => type(input('Landscaping bid'), '150'));
    expect(dialog()!.textContent).toContain('Bids start at $200.00');
    expect(byText('Start bidding')!.disabled).toBe(true);
    await act(async () => type(input('Landscaping bid'), '250'));
    expect(byText('Start bidding')!.disabled).toBe(false);
    await act(async () => button('Stop bidding on Roofing').click());
    expect(input('Roofing bid')).toBeNull();
    await act(async () => (rowsByTrade()[1].querySelector('button') as HTMLButtonElement).click());
    await act(async () => button('Raise Roofing bid').click());

    await act(async () => byText('Start bidding')!.click());
    await flush();
    expect(setStanding.mock.calls).toEqual([
      ['o2', 'Ector', 'landscaping', 250],
      ['o2', 'Ector', 'roofing', 250],
    ]);
    expect(dialog()).toBeNull();
    expect(document.body.textContent).toContain("You're set: new Landscaping and Roofing leads in Ector County go to you the moment they come in, at $250.00, while your bid is the highest.");
    // The one-time line stays until it's dismissed; it is the only banner on the page.
    await act(async () => (document.body.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click());
    expect(document.body.textContent).not.toContain("You're set");
  });

  it('shows where each standing bid stands, lets the company edit or remove it, and opens the dialog to add more', async () => {
    standing = [
      { id: 'sb1', county: 'Midland', jobType: 'landscaping', amountCents: 25000, funded: true, leading: true, contested: false },
      { id: 'sb2', county: 'Ector', jobType: 'landscaping', amountCents: 25000, funded: true, leading: false, contested: true },
      { id: 'sb3', county: 'Howard', jobType: 'roofing', amountCents: 150000, funded: false, leading: false, contested: false },
    ];
    await render();
    const rows = Array.from(document.body.querySelectorAll('[aria-label="My standing bids"] tbody tr'));
    expect(rows[0].textContent).toContain('Midland County');
    expect(rows[0].textContent).toContain('Highest here');
    expect(rows[1].textContent).toContain('Outbid here · raise to win the next lead');
    expect(rows[2].textContent).toContain('Add funds to cover this bid');
    // The amount is a stepper that saves on its own a moment after the last change: no Save button.
    jest.useFakeTimers();
    expect(document.body.querySelector('button[aria-label="Save bid"]')).toBeNull();
    const raise = () => (document.body.querySelector('button[aria-label="Raise Bid for Landscaping in Midland"]') as HTMLButtonElement).click();
    const status = () => rows[0].querySelector('[aria-live="polite"]')!;
    // Beat 1: the tap itself answers. The number moves and tints green, and each tap lifts its own "+$50" off the field.
    await act(async () => raise());
    expect(input('Bid for Landscaping in Midland').value).toBe('300');
    expect(input('Bid for Landscaping in Midland').className).toContain('text-emerald-300');
    expect(rows[0].querySelector('.animate-rise')?.textContent).toBe('+$50.00');
    await act(async () => raise());
    expect(input('Bid for Landscaping in Midland').value).toBe('350');
    expect(rows[0].querySelector('.animate-rise')?.textContent).toBe('+$50.00');
    expect(setStanding).not.toHaveBeenCalled();
    expect(status().textContent).toBe('');
    // Beat 2: a moment after the last tap it saves, and the row says so in the reserved line while it does.
    let release!: (id: string) => void;
    setStanding.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    await act(async () => { jest.advanceTimersByTime(STEP_SAVE_DELAY + 10); });
    expect(status().textContent).toBe('Saving…');
    await act(async () => release('sb1'));
    await flush();
    expect(setStanding).toHaveBeenCalledTimes(1);
    expect(setStanding).toHaveBeenCalledWith('o2', 'Midland', 'landscaping', 350);
    // Beat 3: "Saved" for a moment, then the line is empty but still there, so nothing moves.
    expect(status().textContent).toBe('Saved');
    await act(async () => { jest.advanceTimersByTime(SAVED_HINT_MS + 50); });
    expect(status().textContent).toBe('');
    expect(rows[0].querySelector('.animate-rise')).toBeNull(); // the lift-off has long faded
    expect(status()).not.toBeNull();
    // Typing waits a little longer than a tap before saving.
    await act(async () => type(input('Bid for Landscaping in Midland'), '275'));
    expect(input('Bid for Landscaping in Midland').className).not.toContain('text-emerald-300');
    await act(async () => { jest.advanceTimersByTime(STEP_SAVE_DELAY + 10); });
    expect(setStanding).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY - STEP_SAVE_DELAY); });
    await flush();
    expect(setStanding).toHaveBeenCalledTimes(2);
    expect(setStanding).toHaveBeenLastCalledWith('o2', 'Midland', 'landscaping', 275);
    // A save the server refuses puts the saved number back, says so in the row (not at the top), and offers a retry.
    setStanding.mockRejectedValueOnce(new Error('Nope'));
    await act(async () => type(input('Bid for Landscaping in Midland'), '400'));
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY + 50); });
    await flush();
    expect(input('Bid for Landscaping in Midland').value).toBe('250');
    expect(status().textContent).toContain("Couldn't save");
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    await act(async () => (status().querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(setStanding).toHaveBeenLastCalledWith('o2', 'Midland', 'landscaping', 400);
    expect(status().textContent).toBe('Saved');
    // Below the minimum nothing is sent.
    await act(async () => type(input('Bid for Landscaping in Midland'), '150'));
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY + 50); });
    await flush();
    expect(setStanding).toHaveBeenCalledTimes(4);
    jest.useRealTimers();
    // The row itself is the feedback: no banner for a saved amount.
    expect(document.body.querySelector('[role="status"]')).toBeNull();
    // Removing asks first: declined keeps the bid, confirmed removes it.
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => (document.body.querySelector('button[aria-label="Remove bid for Landscaping in Ector"]') as HTMLButtonElement).click());
    await flush();
    expect(confirm).toHaveBeenCalledWith('Remove your Landscaping bid in Ector County? You can add it again later.');
    expect(removeStanding).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => (document.body.querySelector('button[aria-label="Remove bid for Landscaping in Ector"]') as HTMLButtonElement).click());
    await flush();
    expect(removeStanding).toHaveBeenCalledWith('sb2');
    confirm.mockRestore();
    // A removed row leaves nothing to look at, so a quiet toast says so.
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Bid removed.');
    // No pausing: a bid is live until it's removed.
    expect(document.body.textContent).not.toContain('Pause');
    await act(async () => byText('Add bid')!.click());
    expect(dialog()?.querySelector('#modal-title')?.textContent).toBe('Add a bid');
    // Picking a county you already bid in fills the row with that bid and says where it stands.
    await act(async () => type(input('Search counties'), 'Mid'));
    await act(async () => (dialog()!.querySelector('[aria-label="Counties"] button') as HTMLButtonElement).click());
    expect(input('Landscaping bid').value).toBe('250');
    expect(dialog()!.querySelector('[aria-label="Bids by trade"] > li')?.textContent).toContain('TOP');
    await act(async () => (document.body.querySelector('button[aria-label="Change county"]') as HTMLButtonElement).click());
    await act(async () => type(input('Search counties'), 'Odessa'));
    await act(async () => (dialog()!.querySelector('[aria-label="Counties"] button') as HTMLButtonElement).click());
    expect(dialog()!.querySelector('[aria-label="Bids by trade"] > li')?.textContent).toContain('Outbid · raise to win');
    expect(byText('Save bid')).toBeTruthy();
    await act(async () => (dialog()!.querySelector('button[aria-label="Close modal"]') as HTMLButtonElement).click());
    expect(dialog()).toBeNull();
  });

  it('lists what the bids won and missed under the bids, on the same screen', async () => {
    standing = [{ id: 'sb1', county: 'Midland', jobType: 'landscaping', amountCents: 25000, funded: true, leading: true, contested: false }];
    results = [
      { bidId: 'b1', leadId: 'm1', jobType: 'landscaping', county: 'Midland', city: 'Midland', myBidCents: 25000, won: true, resolvedAt: '2026-10-18T12:00:00Z' },
      { bidId: 'b2', leadId: 'm2', jobType: 'landscaping', county: 'Ector', myBidCents: 25000, won: false, outcome: 'Outbid: a higher bid won it', resolvedAt: '2026-10-17T12:00:00Z' },
    ];
    await render();
    expect(document.body.textContent).toContain('1 standing bid · 1 lead won');
    expect(document.body.querySelector('[aria-label="My standing bids"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Recent results');
    const items = Array.from(document.body.querySelectorAll('[aria-label="Results"] li'));
    expect(items[0].textContent).toContain('Landscaping · Midland County · Midland');
    expect(items[0].textContent).toContain('Won at $250.00 · now in your Leads');
    expect(items[1].textContent).toContain('Outbid: a higher bid won it');
    expect(Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === 'Marketplace')?.getAttribute('href')).toBe('/marketplace');
  });

  it('sends old Marketplace-tab links to the Marketplace page', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter initialEntries={['/bids?tab=marketplace']}>
          <Routes>
            <Route path="/bids" element={<BidsPage />} />
            <Route path="/marketplace" element={<p>Marketplace page</p>} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await flush();
    expect(document.body.textContent).toContain('Marketplace page');
  });
});
