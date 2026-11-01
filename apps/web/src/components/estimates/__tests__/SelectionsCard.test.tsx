import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: Array<Record<string, unknown>> = [];
const approve = jest.fn(async () => null);
const reopen = jest.fn(async () => null);
jest.mock('../../../lib/api', () => ({
  selectionsAPI: {
    forEstimate: async () => rows,
    approve: (id: string, price: number) => approve(id, price),
    reopen: (id: string) => reopen(id),
  },
}));

import { SelectionsCard } from '../SelectionsCard';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
async function render(onEstimateChanged = jest.fn(async () => {})) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<SelectionsCard estimateId="e1" linesKey="k" onEstimateChanged={onEstimateChanged} />));
  await flush();
  return onEstimateChanged;
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = '';
  rows = [];
  jest.clearAllMocks();
});

describe('Selections on the estimate', () => {
  it('shows nothing without allowance lines', async () => {
    await render();
    expect(document.body.querySelector('[data-testid="selections"]')).toBeNull();
  });

  it("approves the client's pick at a price, then reloads the estimate; an approved one can be reopened", async () => {
    rows = [
      { itemId: 'vanity', description: 'Vanity allowance', quantity: 1, allowanceUnitPrice: 800, allowanceTotal: 800, pickBy: '2020-01-01' },
      {
        itemId: 'tile',
        description: 'Tile allowance',
        quantity: 300,
        allowanceUnitPrice: 4,
        allowanceTotal: 1200,
        pick: { id: 'p1', url: 'https://homedepot.com/p/1', name: 'Marble', unitPrice: 5.4, note: 'The gray one', status: 'picked', difference: 420 },
      },
      {
        itemId: 'faucet',
        description: 'Faucet allowance',
        quantity: 1,
        allowanceUnitPrice: 350,
        allowanceTotal: 350,
        pick: { id: 'p2', url: 'https://lowes.com/pd/f', status: 'approved', approvedUnitPrice: 300, difference: -50 },
      },
    ];
    const changed = await render();
    const [vanity, tile, faucet] = Array.from(document.body.querySelectorAll('[data-testid="selection"]'));
    expect(document.body.textContent).toContain('1 to approve');
    expect(vanity.textContent).toMatch(/Overdue: was due Jan 1.*Waiting for the client to pick/);
    expect(tile.textContent).toContain('$1,200.00 included (300 × $4.00)');
    expect(tile.textContent).toContain('They saw $5.40 each · $420.00 over');
    expect(tile.textContent).toContain('“The gray one”');
    expect(tile.querySelector('a')!.getAttribute('href')).toBe('https://homedepot.com/p/1');
    expect(faucet.textContent).toContain('Approved at $300.00 · $50.00 under');

    // The price starts at what they saw; the company can change it before approving.
    const price = tile.querySelector('input') as HTMLInputElement;
    expect(price.value).toBe('5.4');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(price, '5.10');
      price.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(tile.textContent).toContain('$330.00 over');
    await act(async () => button('Approve').click());
    await flush();
    expect(approve).toHaveBeenCalledWith('p1', 5.1);
    expect(changed).toHaveBeenCalled();

    await act(async () => button('Reopen').click());
    await flush();
    expect(reopen).toHaveBeenCalledWith('p2');
  });
});
