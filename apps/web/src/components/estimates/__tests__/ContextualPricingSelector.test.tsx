import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = [
  { id: 'l1', name: '3-Tab Asphalt Shingles', description: '33.3 sq ft per bundle', unit: 'bundle', red_line_price: 28, cap_price: 42, price: 42, cost_code: { code: 'RF500', name: 'Roofing Materials', industry_id: 'roofing' } },
  { id: 'l2', name: 'Annual Roof Inspection', unit: 'each', red_line_price: 250, cap_price: 375, price: 375, cost_code: { code: 'RF300', name: 'Roof Repair', industry_id: 'roofing' } },
  { id: 'l3', name: '12 AWG THHN Wire - Black', unit: 'spool', red_line_price: 125, cap_price: 187.5, price: 187.5, cost_code: { code: 'EL200', name: 'Electrical Installation', industry_id: 'electrical' } },
];
jest.mock('../../../services/MongoLineItemService', () => ({ MongoLineItemService: { list: async () => items } }));
jest.mock('../../../services/IndustryService', () => ({
  IndustryService: { listAll: async () => [{ id: 'roofing', name: 'Roofing' }, { id: 'electrical', name: 'Electrical' }] },
}));
jest.mock('../../../services/ServiceCatalogService', () => ({ ServiceCatalogService: { getPackageWithItems: async () => null } }));

import { ContextualPricingSelector } from '../ContextualPricingSelector';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const dialog = () => document.body.querySelector('[role="dialog"][aria-label="Add items to estimate"]')!;
const trade = (name: string) => Array.from(dialog().querySelectorAll('[aria-label="Trades"] button')).find((b) => b.textContent?.startsWith(name)) as HTMLButtonElement;
const press = (label: string) => act(async () => (dialog().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click());
const rows = () => Array.from(dialog().querySelectorAll('[data-testid="item-row"]')).map((r) => r.querySelector('span span')!.textContent);

async function render(onAddItems = jest.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<ContextualPricingSelector isOpen onClose={() => {}} onAddItems={onAddItems} organizationId="o1" />));
  await flush();
  return onAddItems;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Add items drawer', () => {
  it('opens as a drawer as wide as the estimate, with trades in the left column and items as rows', async () => {
    await render();
    expect(dialog().className).toContain('md:w-[720px]');
    expect(Array.from(dialog().querySelectorAll('[aria-label="Trades"] button')).map((b) => b.textContent)).toEqual([
      'All items3',
      'Electrical1',
      'Roofing2',
    ]);
    expect(rows()).toEqual(['12 AWG THHN Wire - Black', 'Annual Roof Inspection', '3-Tab Asphalt Shingles']);
    expect(dialog().textContent).toContain('Roofing · RF500 · Roofing Materials');

    await act(async () => trade('Roofing').click());
    expect(rows()).toEqual(['Annual Roof Inspection', '3-Tab Asphalt Shingles']);
    expect(dialog().textContent).toContain('RF300 · Roof Repair');
  });

  it('searches, adds with + and sets the quantity, then adds them at cap price', async () => {
    const onAddItems = await render();
    const box = dialog().querySelector('input[aria-label="Search items"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, 'shingle');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows()).toEqual(['3-Tab Asphalt Shingles']);
    expect(trade('All items').textContent).toBe('All items1');

    await press('Add 3-Tab Asphalt Shingles');
    await press('More 3-Tab Asphalt Shingles');
    await press('More 3-Tab Asphalt Shingles');
    expect(dialog().querySelector('[data-testid="picker-total"]')!.textContent).toBe('1 item$126.00');
    await press('Fewer 3-Tab Asphalt Shingles');
    const add = Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent === 'Add 1')!;
    await act(async () => add.click());
    expect(onAddItems).toHaveBeenCalledWith([
      expect.objectContaining({ lineItemId: 'l1', name: '3-Tab Asphalt Shingles', price: 42, quantity: 2, red_line_price: 28, cap_price: 42 }),
    ]);
  });

  it('Add waits until something is chosen, and taking the last one off empties it', async () => {
    await render();
    const add = () => Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent?.startsWith('Add') && !b.getAttribute('aria-label')) as HTMLButtonElement;
    expect(add().disabled).toBe(true);
    await press('Add Annual Roof Inspection');
    expect(add().textContent).toBe('Add 1');
    await press('Fewer Annual Roof Inspection');
    expect(add().disabled).toBe(true);
    expect(dialog().textContent).toContain('Nothing chosen yet');
  });
});
