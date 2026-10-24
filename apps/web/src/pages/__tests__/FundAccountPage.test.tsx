import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let page: Record<string, unknown> | null = null;
const checkout = jest.fn(async (): Promise<{ url: string }> => ({ url: 'https://checkout.stripe.com/c/cs_test_1' }));
jest.mock('../../lib/live', () => ({ useFundingPage: () => page }));
jest.mock('../../lib/api', () => ({
  fundingAPI: {
    checkout: (token: string, amountCents: number) => checkout(token, amountCents),
  },
}));

import FundAccountPage from '../FundAccountPage';

const tiers = [
  { amountCents: 500000, bonusPercent: 0, bonusCents: 0 },
  { amountCents: 750000, bonusPercent: 5, bonusCents: 37500 },
  { amountCents: 1000000, bonusPercent: 10, bonusCents: 100000, popular: true },
];
const open = { companyName: 'Peak Roofing', status: 'open', minimumCents: 500000, tiers, typicalLeadCents: 8500, paid: false, playMoney: false };

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const byText = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
function type(label: string, value: string) {
  const input = document.body.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function render(path = '/fund/tok') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fund/:token" element={<FundAccountPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
}

// Stripe's page is reached by a full navigation; catch it instead of leaving jsdom.
const assign = jest.fn();
beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
});
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('funding page', () => {
  it('starts on $10,000 with its bonus, and refuses less than $5,000', async () => {
    page = { ...open };
    await render();
    expect(document.body.textContent).toContain('Peak Roofing');
    expect(byText('$10,000')!.getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('+$1,000 bonus');
    await act(async () => type('Other amount', '4000'));
    expect(document.body.textContent).toContain('The minimum is $5,000.');
    expect((byText('Continue') as HTMLButtonElement).disabled).toBe(true);
    // Something that isn't a number is no amount at all, not the last tier picked.
    await act(async () => type('Other amount', 'abc'));
    expect(document.body.textContent).toContain('Enter an amount in dollars, like 7500.');
    expect((byText('Continue') as HTMLButtonElement).disabled).toBe(true);
    expect(byText('Continue')!.textContent).toContain('$0');
  });

  it('sends the payer to Stripe for the amount they chose, with no card fields of its own', async () => {
    page = { ...open };
    await render();
    await act(async () => byText('$7,500')!.click());
    await act(async () => byText('Continue · $7,500')!.click());
    expect(document.body.textContent).toContain('+$375');
    expect(document.body.textContent).toContain("You'll finish on Stripe's secure page");
    expect(document.body.querySelector('input[aria-label="Card number"]')).toBeNull();
    await act(async () => byText('Pay $7,500')!.click());
    await flush();
    expect(checkout).toHaveBeenCalledWith('tok', 750000);
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/cs_test_1');
  });

  it('says why when Stripe could not be opened, and lets them try again', async () => {
    page = { ...open };
    checkout.mockRejectedValueOnce(new Error("Payments aren't set up yet (no STRIPE_SECRET_KEY on the deployment)"));
    await render();
    await act(async () => byText('Continue')!.click());
    await act(async () => byText('Pay $10,000')!.click());
    await flush();
    expect(document.body.textContent).toContain("Payments aren't set up yet");
    expect((byText('Pay $10,000') as HTMLButtonElement).disabled).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('back from Stripe, waits for the balance, then shows it added once the webhook lands', async () => {
    page = { ...open, status: 'submitted', amountCents: 1000000, bonusCents: 100000 };
    await render('/fund/tok?paid=1');
    const done = () => document.body.querySelector('[data-testid="funding-done"]')!;
    expect(done().textContent).toContain('Payment received');
    expect(done().textContent).toContain("We're adding $10,000 + $1,000 bonus to Peak Roofing's lead balance now");
    expect(done().getAttribute('data-paid')).toBe('false');

    document.body.innerHTML = '';
    page = { ...open, status: 'confirmed', paid: true, amountCents: 1000000, bonusCents: 100000 };
    await render('/fund/tok?paid=1');
    expect(done().textContent).toContain('Added to your balance');
    expect(done().textContent).toContain('$11,000');
    expect(done().getAttribute('data-paid')).toBe('true');
  });

  it('with no Stripe key, says it is play money and adds it on the spot', async () => {
    page = { ...open, playMoney: true };
    checkout.mockResolvedValueOnce({ url: '/fund/tok?paid=1' });
    await render();
    await act(async () => byText('Continue')!.click());
    expect(document.body.querySelector('[role="note"]')?.textContent).toContain('Test mode: no card is charged');
    expect(document.body.textContent).not.toContain("Stripe's secure page");
    await act(async () => byText('Add $10,000 in play money')!.click());
    await flush();
    expect(checkout).toHaveBeenCalledWith('tok', 1000000);
    expect(assign).toHaveBeenCalledWith('/fund/tok?paid=1');
  });

  it('comes back to the amount step with no charge when they leave Stripe', async () => {
    page = { ...open, amountCents: 750000, bonusCents: 37500 };
    await render('/fund/tok?cancelled=1');
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('No charge was made');
    expect(byText('$7,500')!.getAttribute('aria-checked')).toBe('true');
  });

  it('shows a used link as already paid', async () => {
    page = { ...open, status: 'confirmed', paid: true, amountCents: 1000000, bonusCents: 100000 };
    await render();
    expect(document.body.textContent).toContain('Added to your balance');
    expect(document.body.textContent).toContain('$11,000');
    // The next step is one tap away, and the total says it was added.
    const next = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === 'Set your bids →')!;
    expect(next.getAttribute('href')).toBe('/bids');
    expect(document.body.textContent).toContain('Added to balance');
  });
});
