import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let page: Record<string, unknown> | null = null;
const submit = jest.fn(async () => undefined);
jest.mock('../../lib/api', () => ({
  fundingAPI: {
    get: async () => page,
    submit: (...args: unknown[]) => submit(...(args as [])),
  },
}));

import FundAccountPage, { formatCardNumber, formatExpiry } from '../FundAccountPage';

const tiers = [
  { amountCents: 500000, bonusPercent: 0, bonusCents: 0 },
  { amountCents: 750000, bonusPercent: 5, bonusCents: 37500 },
  { amountCents: 1000000, bonusPercent: 10, bonusCents: 100000, popular: true },
];
const open = { companyName: 'Peak Roofing', status: 'open', minimumCents: 500000, tiers, typicalLeadCents: 8500 };

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const byText = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
function type(label: string, value: string) {
  const input = document.body.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/fund/tok']}>
        <Routes>
          <Route path="/fund/:token" element={<FundAccountPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('funding page', () => {
  it('formats card details as they are typed', () => {
    expect(formatCardNumber('4242424242424242999')).toBe('4242 4242 4242 4242');
    expect(formatExpiry('1229')).toBe('12/29');
  });

  it('starts on $10,000 with its bonus, and refuses less than $5,000', async () => {
    page = { ...open };
    await render();
    expect(document.body.textContent).toContain('Peak Roofing');
    expect(byText('$10,000')!.getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('+$1,000 bonus credit');
    await act(async () => type('Other amount', '4000'));
    expect(document.body.textContent).toContain('The minimum is $5,000.');
    expect((byText('Continue') as HTMLButtonElement).disabled).toBe(true);
  });

  it('pays by card without sending the card, then shows the payment received', async () => {
    page = { ...open };
    await render();
    await act(async () => byText('$7,500')!.click());
    await act(async () => byText('Continue · $7,500')!.click());
    expect(document.body.textContent).toContain('+$375');
    expect((byText('Pay $7,500') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      type('Name on card', 'Pat Roofer');
      type('Email', 'pat@peak.example');
      type('Card number', '4242424242424242');
      type('Expiry', '1229');
      type('CVC', '123');
      type('ZIP', '79701');
    });
    await act(async () => byText('Pay $7,500')!.click());
    await flush();
    expect(submit).toHaveBeenCalledWith('tok', { amountCents: 750000, method: 'card', payerName: 'Pat Roofer', payerEmail: 'pat@peak.example' });
    expect(JSON.stringify(submit.mock.calls)).not.toMatch(/4242|79701|12\/29/);
    expect(document.body.querySelector('[data-testid="funding-done"]')!.textContent).toContain('Payment received');
  });

  it('pays with Apple Pay in one tap', async () => {
    page = { ...open };
    await render();
    await act(async () => byText('Continue')!.click());
    await act(async () => (document.body.querySelector('button[aria-label="Pay with Apple Pay"]') as HTMLButtonElement).click());
    await flush();
    expect(submit).toHaveBeenCalledWith('tok', expect.objectContaining({ amountCents: 1000000, method: 'apple_pay' }));
    expect(document.body.textContent).toContain('$10,000 + $1,000 bonus will be added to Peak Roofing');
  });

  it('shows a used link as already paid', async () => {
    page = { ...open, status: 'confirmed', amountCents: 1000000, bonusCents: 100000 };
    await render();
    expect(document.body.textContent).toContain('Added to your balance');
    expect(document.body.textContent).toContain('$11,000');
  });
});
