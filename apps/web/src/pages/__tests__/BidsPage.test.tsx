import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let balanceCents = 100_000;
let walletExtra: Record<string, unknown> = {};
let standing: unknown[] = [];
let results: unknown[] = [];
const setStanding = jest.fn(async (_org: string, _county: string, _jobType: string, _amount: number) => 'sb1');
const removeStanding = jest.fn(async (_id: string) => undefined);
const markOutbidSeen = jest.fn(async (_org: string) => undefined);
const createLink = jest.fn(async (_id: string) => 'tok');

jest.mock('../../lib/api', () => ({
  walletAPI: {
    get: async () => ({ balanceCents, typicalLeadCents: 20000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, leadTrades: ['landscaping'], transactions: [], ...walletExtra }),
    feed: async () => [],
    bids: async () => [],
  },
  bidsAPI: {
    listStanding: async () => standing,
    setStanding: (...a: unknown[]) => setStanding(...(a as [string, string, string, number])),
    removeStanding: (id: string) => removeStanding(id),
    markOutbidSeen: (org: string) => markOutbidSeen(org),
    results: async () => results,
  },
  industriesAPI: { list: async () => [{ id: 'roofing', name: 'Roofing' }, { id: 'landscaping', name: 'Landscaping' }] },
  fundingAPI: { createLink: (id: string) => createLink(id), url: (t: string) => `/fund/${t}` },
}));
jest.mock('../../components/layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o2', name: 'Mio Homes', industry: 'Landscaping' } }),
}));

import BidsPage, { CAP_HINT_MS, PLACED, PLACING, ROW_COLLAPSE_MS, ROW_OUT_MS, SAVED_HINT_MS, SAVE_DELAY, STEP_SAVE_DELAY } from '../BidsPage';

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
  walletExtra = {};
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
    // The buttons are pinned under the trade list, outside the part that scrolls, so they never need scrolling to.
    const scroller = dialog()!.querySelector('.overflow-y-auto')!;
    expect(scroller.contains(dialog()!.querySelector('[aria-label="Bids by trade"]'))).toBe(true);
    expect(scroller.contains(byText('Start bidding')!)).toBe(false);
    expect(dialog()!.contains(byText('Start bidding')!)).toBe(true);
    // It opens tall enough for the county matches to show in full.
    expect(dialog()!.querySelector('[data-testid="add-bid-body"]')!.className).toContain('min-h-[20rem]');
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
    // The keyboard works too: arrows move the highlight through the matches and Enter picks it.
    await act(async () => (document.body.querySelector('button[aria-label="Change county"]') as HTMLButtonElement).click());
    await act(async () => type(input('Search counties'), 'M'));
    expect(matches().length).toBeGreaterThan(1);
    const key = (k: string) => input('Search counties').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    expect(matches()[0].getAttribute('aria-current')).toBe('true');
    // The list scrolls with the highlight, so a match below the fold comes into view.
    const scrolled: Element[] = [];
    const scrollIntoView = jest.fn(function (this: Element) { scrolled.push(this); });
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
    await act(async () => key('ArrowDown'));
    expect(matches()[0].getAttribute('aria-current')).toBeNull();
    expect(matches()[1].getAttribute('aria-current')).toBe('true');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrolled[scrolled.length - 1].contains(matches()[1])).toBe(true);
    // Hovering moves the highlight without scrolling under the pointer.
    scrollIntoView.mockClear();
    await act(async () => matches()[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(matches()[2].getAttribute('aria-current')).toBe('true');
    expect(scrollIntoView).not.toHaveBeenCalled();
    await act(async () => matches()[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    const second = matches()[1].textContent;
    await act(async () => key('ArrowUp'));
    await act(async () => key('ArrowDown'));
    await act(async () => key('Enter'));
    expect(dialog()!.querySelector('[aria-label="Where"]')?.textContent).toContain(second!.replace(/County.*/, 'County'));
    // Back to Ector for the rest of the flow.
    await act(async () => (document.body.querySelector('button[aria-label="Change county"]') as HTMLButtonElement).click());
    await act(async () => type(input('Search counties'), 'Odessa'));
    await act(async () => key('Enter'));
    expect(dialog()!.querySelector('[aria-label="Where"]')?.textContent).toContain('Ector County');
    expect(dialog()!.textContent).not.toContain('steps'); // no per-lead/step hint: each row shows its minimum

    // One row per trade. Their own trade is live at the minimum; the other waits behind "Bid $200.00".
    const rowsByTrade = () => Array.from(dialog()!.querySelectorAll('[aria-label="Bids by trade"] > li'));
    expect(rowsByTrade().map((li) => li.querySelector('p')?.textContent)).toEqual(['Landscaping', 'Roofing']);
    expect(rowsByTrade()[0].textContent).toContain('From $200.00'); // not bid on yet: just the minimum
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
    expect(rows[0].textContent).toContain('Winning');
    expect(rows[1].textContent).toContain('Outbid here · raise to win the next lead');
    // A bid the balance has fallen below is paused, not live.
    expect(rows[2].textContent).toContain('Paused until you add funds');
    // The uncovered row carries a faint wash and a red edge; covered rows don't. The edge is an inset
    // shadow so the table keeps its own left border on every row.
    expect(rows[2].getAttribute('data-unfunded')).toBe('true');
    expect(rows[2].querySelector('td')!.className).toContain('shadow-[inset_2px_0_0_0_#f87171]');
    expect(rows[0].getAttribute('data-unfunded')).toBeNull();
    expect(rows[0].querySelector('td')!.className).not.toContain('border-l');
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
    // The placing line shows on the tap itself, before anything is sent, and holds its words through the save.
    expect(PLACING.up).toContain(status().textContent);
    const chosen = status().textContent;
    // Beat 2: a moment after the last tap it saves, and the row says so in the reserved line while it does.
    // The standing chip sits dimmed ("pending") from the tap until the server confirms.
    const chip = () => rows[0].querySelector('[data-pending]');
    expect(chip()).not.toBeNull();
    let release!: (id: string) => void;
    setStanding.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    await act(async () => { jest.advanceTimersByTime(STEP_SAVE_DELAY + 10); });
    expect(status().textContent).toBe(chosen); // same words, not re-rolled when the save starts
    expect(chip()).not.toBeNull();
    await act(async () => release('sb1'));
    await flush();
    expect(chip()).toBeNull();
    expect(setStanding).toHaveBeenCalledTimes(1);
    expect(setStanding).toHaveBeenCalledWith('o2', 'Midland', 'landscaping', 350);
    // Beat 3: a "bid's in" line for a moment, then the line is empty but still there, so nothing moves.
    expect(PLACED.up).toContain(status().textContent);
    await act(async () => { jest.advanceTimersByTime(SAVED_HINT_MS + 50); });
    expect(status().textContent).toBe('');
    expect(rows[0].querySelector('.animate-rise')).toBeNull(); // the lift-off has long faded
    expect(status()).not.toBeNull();
    // Typing waits a little longer than a tap before saving. Going down, the words go down too.
    await act(async () => type(input('Bid for Landscaping in Midland'), '225'));
    expect(input('Bid for Landscaping in Midland').className).not.toContain('text-emerald-300');
    expect(PLACING.down).toContain(status().textContent); // lowering words, from the keystroke
    await act(async () => { jest.advanceTimersByTime(STEP_SAVE_DELAY + 10); });
    expect(setStanding).toHaveBeenCalledTimes(1);
    setStanding.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY - STEP_SAVE_DELAY); });
    expect(PLACING.down).toContain(status().textContent);
    await act(async () => release('sb1'));
    await flush();
    expect(PLACED.down).toContain(status().textContent);
    expect(setStanding).toHaveBeenCalledTimes(2);
    expect(setStanding).toHaveBeenLastCalledWith('o2', 'Midland', 'landscaping', 225);
    // A save the server refuses puts the saved number back, says so in the row (not at the top), and offers a retry.
    setStanding.mockRejectedValueOnce(new Error('Nope'));
    await act(async () => type(input('Bid for Landscaping in Midland'), '400'));
    // Straight after a lowering, a raise gets raising words, and keeps them once the save starts.
    expect(PLACING.up).toContain(status().textContent);
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY + 50); });
    await flush();
    expect(input('Bid for Landscaping in Midland').value).toBe('250');
    expect(status().textContent).toContain("Didn't take");
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    await act(async () => (status().querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(setStanding).toHaveBeenLastCalledWith('o2', 'Midland', 'landscaping', 400);
    expect(PLACED.up).toContain(status().textContent);
    // A raise past the $1,000 balance isn't placed: nothing is sent, the standing doesn't move,
    // and the row's line says to add funds. Leaving the field puts the placed amount back.
    await act(async () => type(input('Bid for Landscaping in Midland'), '1200'));
    expect(status().textContent).toBe('Add funds to bid higher');
    expect(rows[0].textContent).toContain('Winning');
    expect(rows[0].getAttribute('data-unfunded')).toBeNull();
    expect(rows[0].querySelector('[data-pending]')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY + 50); });
    await flush();
    expect(setStanding).toHaveBeenCalledTimes(4); // never sent
    await act(async () => input('Bid for Landscaping in Midland').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(input('Bid for Landscaping in Midland').value).toBe('250');
    expect(status().textContent).toBe('');
    // + stops at the balance: at $1,000 it looks spent, and a tap doesn't move the amount but says why, for a moment.
    const raiseButton = () => document.body.querySelector('button[aria-label="Raise Bid for Landscaping in Midland"]') as HTMLButtonElement;
    await act(async () => type(input('Bid for Landscaping in Midland'), '1000'));
    expect(raiseButton().getAttribute('aria-disabled')).toBe('true');
    await act(async () => raise());
    expect(input('Bid for Landscaping in Midland').value).toBe('1000');
    expect(status().textContent).toBe('Add funds to bid higher');
    expect(Array.from(status().querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Add funds']);
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY + 50); });
    await flush();
    expect(setStanding).toHaveBeenLastCalledWith('o2', 'Midland', 'landscaping', 1000); // $1,000 itself is covered
    await act(async () => { jest.advanceTimersByTime(CAP_HINT_MS); });
    expect(status().textContent).not.toContain('Add funds');
    // A paused bid can't be raised either...
    await act(async () => (document.body.querySelector('button[aria-label="Raise Bid for Roofing in Howard"]') as HTMLButtonElement).click());
    expect(input('Bid for Roofing in Howard').value).toBe('1500');
    expect(rows[2].querySelector('[aria-live="polite"]')!.textContent).toBe('Add funds to bid higher');
    // ...but it can always be lowered. Once it's under the balance the server hasn't worked out
    // its standing yet: say so rather than guess "Outbid" until the save lands.
    await act(async () => type(input('Bid for Roofing in Howard'), '900'));
    expect(rows[2].getAttribute('data-unfunded')).toBeNull();
    expect(rows[2].textContent).toContain('Checking standing…');
    expect(rows[2].textContent).not.toContain('Outbid');
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY + 50); });
    await flush();
    expect(setStanding).toHaveBeenLastCalledWith('o2', 'Howard', 'roofing', 900);
    // Below the minimum nothing is sent, and leaving the field puts the saved amount back.
    await act(async () => type(input('Bid for Landscaping in Midland'), '150'));
    await act(async () => { jest.advanceTimersByTime(SAVE_DELAY + 50); });
    await flush();
    expect(setStanding).toHaveBeenCalledTimes(6);
    await act(async () => input('Bid for Landscaping in Midland').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(input('Bid for Landscaping in Midland').value).toBe('250');
    jest.useRealTimers();
    // The row itself is the feedback: no banner for a saved amount.
    expect(document.body.querySelector('[role="status"]')).toBeNull();
    // Removing asks first, in the app's own dialog: declined keeps the bid, confirmed removes it.
    const ask = () => document.body.querySelector('[role="alertdialog"]');
    const answer = (label: string) => Array.from(ask()!.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement;
    await act(async () => (document.body.querySelector('button[aria-label="Remove bid for Landscaping in Ector"]') as HTMLButtonElement).click());
    expect(ask()?.textContent).toContain('Remove your Landscaping bid in Ector County?');
    expect(ask()?.textContent).toContain('You can add it again later.');
    expect(document.activeElement?.textContent).toBe('Cancel'); // the safe choice has focus
    await act(async () => answer('Cancel').click());
    await flush();
    expect(ask()).toBeNull();
    expect(removeStanding).not.toHaveBeenCalled();
    // The row starts leaving on the confirm (fade, then its height closes) while the server is asked.
    jest.useFakeTimers();
    await act(async () => (document.body.querySelector('button[aria-label="Remove bid for Landscaping in Ector"]') as HTMLButtonElement).click());
    await act(async () => answer('Remove bid').click());
    await act(async () => { await Promise.resolve(); });
    expect(removeStanding).toHaveBeenCalledWith('sb2');
    expect(rows[1].getAttribute('data-leaving')).toBe('out');
    expect(document.body.querySelector('[role="status"]')).toBeNull(); // not yet
    await act(async () => { jest.advanceTimersByTime(ROW_OUT_MS + 5); });
    expect(rows[1].getAttribute('data-leaving')).toBe('collapse');
    await act(async () => { jest.advanceTimersByTime(ROW_COLLAPSE_MS + 5); });
    await flush();
    jest.useRealTimers();
    // A removed row leaves nothing to look at, so a quiet toast says so.
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Bid removed.');
    // No pause or resume buttons: a covered bid is live until it's removed.
    expect(buttons().some((b) => /^(Pause|Resume)/.test(b.textContent?.trim() ?? ''))).toBe(false);
    await act(async () => byText('Add bid')!.click());
    expect(dialog()?.querySelector('#modal-title')?.textContent).toBe('Add a bid');
    // Picking a county you already bid in fills the row with that bid and says where it stands.
    await act(async () => type(input('Search counties'), 'Mid'));
    await act(async () => (dialog()!.querySelector('[aria-label="Counties"] button') as HTMLButtonElement).click());
    expect(input('Landscaping bid').value).toBe('250');
    // Each placed row says where that amount stands, in the table's words; trades not bid on show their minimum.
    const tradeRow = (name: string) => Array.from(dialog()!.querySelectorAll('[aria-label="Bids by trade"] > li')).find((li) => li.querySelector('p')?.textContent === name)!;
    expect(tradeRow('Landscaping').textContent).toContain('Winning at $250.00');
    expect(tradeRow('Landscaping').textContent).not.toContain('TOP');
    expect(tradeRow('Roofing').textContent).toContain('From $200.00');
    // Nothing has changed, so there is nothing to save; raise it and there is.
    expect(byText('Save bid')!.disabled).toBe(true);
    expect(dialog()!.textContent).toContain('These are your current bids here.');
    await act(async () => (document.body.querySelector('button[aria-label="Raise Landscaping bid"]') as HTMLButtonElement).click());
    expect(byText('Save bid')!.disabled).toBe(false);
    // Once changed, the old standing no longer applies: the line says what saving will do.
    expect(tradeRow('Landscaping').textContent).toContain('Was $250.00 · saving updates your bid');
    expect(tradeRow('Landscaping').textContent).not.toContain('Winning');
    await act(async () => (document.body.querySelector('button[aria-label="Change county"]') as HTMLButtonElement).click());
    await act(async () => type(input('Search counties'), 'Odessa'));
    await act(async () => (dialog()!.querySelector('[aria-label="Counties"] button') as HTMLButtonElement).click());
    // The $300 typed for Midland carries over, so this row's old standing no longer applies either.
    expect(tradeRow('Landscaping').textContent).toContain('Was $250.00 · saving updates your bid');
    expect(byText('Save bid')).toBeTruthy();
    // A bid the balance can't cover isn't placed: the button goes to the wallet instead of saving.
    await act(async () => type(input('Landscaping bid'), '1200'));
    expect(byText('Save bid')).toBeUndefined();
    // The line names the bid that's too high, the row's amount turns amber, and the button is amber, not the green of Save.
    expect(dialog()!.textContent).toContain('Landscaping at $1,200.00 is more than your $1,000.00 balance.');
    expect(input('Landscaping bid').closest('[data-warn]')).not.toBeNull();
    expect(byText('Add funds to place bid')!.className).toContain('bg-amber-500');
    expect(byText('Add funds to place bid')!.className).not.toContain('emerald');
    await act(async () => byText('Add funds to place bid')!.click());
    await flush();
    expect(createLink).toHaveBeenCalledWith('o2');
    expect(setStanding).toHaveBeenCalledTimes(6);
    await act(async () => type(input('Landscaping bid'), '300'));
    expect(byText('Add funds to place bid')).toBeUndefined();
    expect(input('Landscaping bid').closest('[data-warn]')).toBeNull();
    expect(byText('Save bid')!.disabled).toBe(false);
    // A tap outside or Escape leaves the dialog where it is; only the X closes it.
    await act(async () => (document.body.querySelector('[data-testid="modal-backdrop"]') as HTMLElement).click());
    expect(dialog()).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(dialog()).not.toBeNull();
    await act(async () => (dialog()!.querySelector('button[aria-label="Close modal"]') as HTMLButtonElement).click());
    expect(dialog()).toBeNull();

    // After the first time, a save says what it did in a passing toast, not the sticky "You're set" banner.
    const stepper = (label: string) => document.body.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    const toast = () => document.body.querySelector('[role="status"]')?.textContent;
    const trades = () => Array.from(dialog()!.querySelectorAll('[aria-label="Bids by trade"] > li'));
    const openIn = async (q: string) => {
      await act(async () => byText('Add bid')!.click());
      await act(async () => type(input('Search counties'), q));
      await act(async () => (dialog()!.querySelector('[aria-label="Counties"] button') as HTMLButtonElement).click());
    };
    const saveWith = async (label: string) => {
      await act(async () => byText(label)!.click());
      await flush();
      expect(dialog()).toBeNull();
    };
    setStanding.mockClear();
    // Changing a bid already placed: "updated", and only that bid is sent.
    await openIn('Mid');
    await act(async () => stepper('Raise Landscaping bid').click());
    await saveWith('Save bid');
    expect(setStanding.mock.calls).toEqual([['o2', 'Midland', 'landscaping', 300]]);
    expect(toast()).toBe('Bid updated: Landscaping in Midland County is now $300.00.');
    expect(document.body.textContent).not.toContain("You're set");
    // A county with no bid yet: "added".
    setStanding.mockClear();
    await openIn('Andrews');
    await saveWith('Save bid');
    expect(setStanding.mock.calls).toEqual([['o2', 'Andrews', 'landscaping', 200]]);
    expect(toast()).toBe('Bid added: Landscaping in Andrews County at $200.00.');
    // One new and one changed in the same save.
    setStanding.mockClear();
    await openIn('Odessa');
    // Opened fresh, Ector's placed bid says where it stands: outbid, with what to do about it.
    expect(tradeRow('Landscaping').textContent).toContain('Outbid at $250.00 · raise to win');
    expect(tradeRow('Landscaping').querySelector('[data-standing="outbid"]')).not.toBeNull();
    await act(async () => stepper('Raise Landscaping bid').click());
    await act(async () => (trades()[1].querySelector('button') as HTMLButtonElement).click());
    await saveWith('Save 2 bids');
    expect(setStanding.mock.calls).toEqual([
      ['o2', 'Ector', 'roofing', 200],
      ['o2', 'Ector', 'landscaping', 300],
    ]);
    expect(toast()).toBe('Saved: 1 bid added, 1 updated in Ector County.');
    // A row left at its placed amount isn't sent again, and doesn't count as a change.
    setStanding.mockClear();
    await openIn('Mid');
    await act(async () => (trades()[1].querySelector('button') as HTMLButtonElement).click());
    await saveWith('Save 2 bids');
    expect(setStanding.mock.calls).toEqual([['o2', 'Midland', 'roofing', 200]]);
    expect(toast()).toBe('Bid added: Roofing in Midland County at $200.00.');
    expect(document.body.textContent).not.toContain("You're set");
    // A bid the balance can't cover reads as paused, never as outbid: raising it wouldn't help.
    await openIn('Howard');
    expect(tradeRow('Roofing').textContent).toContain('Paused at $1,500.00 · add funds');
    expect(tradeRow('Roofing').textContent).not.toContain('Outbid');
    await act(async () => (dialog()!.querySelector('button[aria-label="Close modal"]') as HTMLButtonElement).click());
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

  it('says at the top when the bids are paused or there is no money, with Add funds', async () => {
    // A funded company with no bids gets the big "Set your bids" card, not a second line saying the same.
    await render();
    expect(document.body.querySelector('[data-bid-status]')).toBeNull();
    document.body.innerHTML = '';

    // No bids and no money: both steps, and the step that's missing here is the money.
    balanceCents = 0;
    walletExtra = { standingBids: 0, pausedBids: 0 };
    await render();
    let line = document.body.querySelector('[data-bid-status]')!;
    expect(line.textContent).toContain('Two steps to start winning leads: add funds, then set your bids.');
    expect(line.querySelector('a')).toBeNull(); // no link to the page you're on
    document.body.innerHTML = '';

    // A bid the empty balance can't pay for: paused, and the line says so above the table.
    standing = [{ id: 'sb1', county: 'Midland', jobType: 'concrete', amountCents: 20000, funded: false, leading: false, contested: false }];
    walletExtra = { standingBids: 1, pausedBids: 1 };
    await render();
    line = document.body.querySelector('[data-bid-status]')!;
    expect(line.getAttribute('role')).toBe('alert');
    expect(line.textContent).toContain("Your bid is paused. Your balance is $0.00, so it can't win leads. Add funds to put it back in.");
    expect(line.querySelector('a')).toBeNull();
    const openTab = jest.spyOn(window, 'open').mockReturnValue(null);
    await act(async () => (Array.from(line.querySelectorAll('button')).find((b) => b.textContent === 'Add funds') as HTMLButtonElement).click());
    await flush();
    expect(createLink).toHaveBeenCalledWith('o2');
    openTab.mockRestore();
  });

  it('marks a bid outbid since the last visit as new, and tells the server it has been seen', async () => {
    standing = [
      { id: 'sb1', county: 'Midland', jobType: 'landscaping', amountCents: 25000, funded: true, leading: false, contested: true, outbidNew: true },
      { id: 'sb2', county: 'Ector', jobType: 'landscaping', amountCents: 25000, funded: true, leading: false, contested: true },
    ];
    await render();
    const rows = Array.from(document.body.querySelectorAll('[aria-label="My standing bids"] tbody tr'));
    expect(rows[0].querySelector('[data-newly-outbid]')?.textContent).toBe('New');
    expect(rows[1].querySelector('[data-newly-outbid]')).toBeNull(); // outbid before, already seen
    expect(markOutbidSeen).toHaveBeenCalledWith('o2');
    // The Bids page doesn't repeat the "you've been outbid" line: the rows say it.
    expect(document.body.querySelector('[data-bid-status]')).toBeNull();
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
