import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Invoice = Record<string, unknown> & { id: string; total: number; paid: number; due: number; status: string; payments: unknown[] };
let signed = true;
let invoices: Invoice[] = [];
const summary = () => {
  const live = invoices.filter((i) => i.status !== 'cancelled');
  const invoiced = live.reduce((s, i) => s + i.total, 0);
  const paid = live.reduce((s, i) => s + i.paid, 0);
  return { contract: 10000, invoiced, paid, due: invoiced - paid, toInvoice: 10000 - invoiced };
};
const deposit = (): Invoice => ({ id: 'i1', number: 'INV-1', kind: 'deposit', label: 'Deposit', description: 'Deposit (30%) for EST-1', total: 3000, paid: 0, due: 3000, status: 'sent', issueDate: '2026-10-20', dueDate: '2026-10-20', payments: [] });
const requestDeposit = jest.fn<Promise<void>, [string, { percent?: number }]>(async () => {
  invoices = [deposit()];
});
const invoiceBalance = jest.fn(async () => {
  invoices = [...invoices, { ...deposit(), id: 'i2', number: 'INV-2', kind: 'balance', label: 'Balance', description: 'Balance for EST-1', total: summary().toInvoice, due: summary().toInvoice }];
});
const recordPayment = jest.fn(async (id: string, p: { amount: number; method: string }) => {
  invoices = invoices.map((i) =>
    i.id === id ? { ...i, paid: i.paid + p.amount, due: i.due - p.amount, status: i.due - p.amount <= 0 ? 'paid' : 'sent', payments: [{ _id: 'p1', amount: p.amount, method: p.method, paidAt: '2026-10-21' }] } : i,
  );
  return invoices[0];
});

jest.mock('../../../lib/api', () => ({
  invoicesAPI: {
    forEstimate: async () => ({ signed, invoices, summary: summary(), depositPercent: 30, methods: ['Check', 'Cash', 'Zelle'] }),
    requestDeposit: (id: string, ask: { percent?: number }) => requestDeposit(id, ask),
    invoiceBalance: () => invoiceBalance(),
    recordPayment: (id: string, p: { amount: number; method: string }) => recordPayment(id, p),
    removePayment: jest.fn(),
    cancel: jest.fn(),
  },
}));

import { PaymentsTab } from '../PaymentsTab';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.startsWith(text)) as HTMLButtonElement;
const strip = () => document.body.querySelector('[data-testid="payments-summary"]')!.textContent;
function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<PaymentsTab estimateId="e1" />));
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  invoices = [];
  signed = true;
  jest.clearAllMocks();
});

describe('estimate Payments tab', () => {
  it('waits for the signature before anything is invoiced', async () => {
    signed = false;
    await render();
    expect(document.body.querySelector('[data-testid="payments-unsigned"]')!.textContent).toBe('Payments start once the client signs. Your 30% deposit is asked for then.');
  });

  it('asks for a deposit, invoices the rest and shows what is due', async () => {
    await render();
    expect(strip()).toBe('Contract$10,000.00Invoiced$0.00Paid$0.00Due$0.00');
    expect(document.body.textContent).toContain('Nothing invoiced yet.');
    await act(async () => button('Ask for a deposit').click());
    await flush();
    expect(requestDeposit).toHaveBeenCalledWith('e1', { percent: 30 });
    expect(strip()).toBe('Contract$10,000.00Invoiced$3,000.00Paid$0.00Due$3,000.00');
    expect(button('Ask for a deposit')).toBeUndefined();

    await act(async () => button('Invoice the rest').click());
    await flush();
    expect(invoiceBalance).toHaveBeenCalled();
    expect(Array.from(document.body.querySelectorAll('[data-testid="invoice-row"]')).map((r) => r.textContent?.slice(0, 22))).toEqual([
      'Deposit · INV-1Deposit',
      'Balance · INV-2Balance',
    ]);
    expect(button('Invoice the rest')).toBeUndefined();
  });

  it('records a payment and marks the invoice paid', async () => {
    invoices = [deposit()];
    await render();
    await act(async () => button('Record payment').click());
    const form = document.body.querySelector('form[aria-label="Record a payment on INV-1"]')!;
    expect((form.querySelector('input[aria-label="Amount"]') as HTMLInputElement).value).toBe('3000');
    await act(async () => type(form.querySelector('select[aria-label="Paid by"]') as HTMLSelectElement, 'Zelle'));
    await act(async () => button('Record').click());
    await flush();
    expect(recordPayment).toHaveBeenCalledWith('i1', expect.objectContaining({ amount: 3000, method: 'Zelle' }));
    expect(strip()).toBe('Contract$10,000.00Invoiced$3,000.00Paid$3,000.00Due$0.00');
    expect(document.body.querySelector('[data-testid="invoice-row"]')!.textContent).toContain('Paid');
    expect(document.body.querySelector('[aria-label="Payments on INV-1"]')!.textContent).toContain('$3,000.00Zelle');
    expect(document.body.textContent).toContain('$3,000.00 recorded on deposit.');
  });
});
