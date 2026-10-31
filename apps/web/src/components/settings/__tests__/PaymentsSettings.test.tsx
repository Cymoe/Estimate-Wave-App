import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let role = 'owner';
const setPayments = jest.fn(async (_id: string, s: Record<string, unknown>) => s);
jest.mock('../../../lib/api', () => ({
  organizationsAPI: {
    getById: async () => ({ payments: { depositPercent: 25, instructions: 'Checks to Peak Roofing LLC' } }),
    myRole: async () => role,
    setPayments: (id: string, s: Record<string, unknown>) => setPayments(id, s),
  },
}));

import { PaymentsSettings } from '../PaymentsSettings';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const input = (label: string) => document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<PaymentsSettings organizationId="o1" />));
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  role = 'owner';
  jest.clearAllMocks();
});

describe('Settings → Payments', () => {
  it('sets the deposit, the pay link and how to pay', async () => {
    await render();
    expect(input('Deposit percent').value).toBe('25');
    expect((document.body.querySelector('textarea[aria-label="How to pay"]') as HTMLTextAreaElement).value).toBe('Checks to Peak Roofing LLC');
    await act(async () => {
      type(input('Deposit percent'), '30');
      type(input('Pay link'), 'https://square.link/peak');
    });
    await act(async () => (document.body.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(setPayments).toHaveBeenCalledWith('o1', { depositPercent: 30, payLink: 'https://square.link/peak', instructions: 'Checks to Peak Roofing LLC' });
    expect(document.body.textContent).toContain('Saved.');
  });

  it('is read-only for members', async () => {
    role = 'member';
    await render();
    expect(document.body.textContent).toContain('Ask an owner or admin of the company to change these.');
    expect(input('Deposit percent').disabled).toBe(true);
    expect(Array.from(document.body.querySelectorAll('button')).some((b) => b.textContent === 'Save')).toBe(false);
  });
});
