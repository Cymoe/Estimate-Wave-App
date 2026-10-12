import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let stored: Record<string, unknown> = {};
const update = jest.fn(async (_id: string, changes: Record<string, unknown>) => {
  stored = { ...stored, ...changes };
  return stored;
});
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: { getById: async () => stored, update: (id: string, changes: Record<string, unknown>) => update(id, changes) },
}));
const getOrganization = jest.fn(async (id: string) => ({ _id: id, name: 'Shah Builders', address: '9 Oak Ave', phone: '555-0100' }));
jest.mock('../../../lib/api', () => ({
  organizationsAPI: { getById: (id: string) => getOrganization(id) },
}));

import { EstimateContractView } from '../EstimateContractView';

const base = {
  id: 'e1',
  organization_id: 'org1',
  estimate_number: 'EST-2026-000001',
  status: 'draft',
  issue_date: '2026-10-08',
  subtotal: 900,
  total_amount: 900,
  client: { name: 'Dan Shah', email: '', address: '1 Main St' },
  items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 900, total_price: 900 }],
};

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/estimates/e1/contract']}>
        <Routes>
          <Route path="/estimates/:id/contract" element={<EstimateContractView />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

describe('contract page', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    update.mockClear();
  });

  it('shows the estimate and your business, and saves edited terms on the estimate', async () => {
    stored = { ...base };
    await render();
    expect(getOrganization).toHaveBeenCalledWith('org1');
    expect(document.body.textContent).toContain('Shah Builders');
    expect(document.body.textContent).toContain('Dan Shah');
    expect(document.body.textContent).toContain('follows the estimate');
    expect(document.body.textContent).not.toContain('Campos');

    await act(async () => button('Edit terms')!.click());
    const date = document.body.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(date, '2026-11-02');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Save')!.click());
    expect(update).toHaveBeenCalledWith('e1', { contract_terms: expect.objectContaining({ startDate: '2026-11-02' }) });
    expect(document.body.textContent).toContain(new Date('2026-11-02T00:00:00').toLocaleDateString());
  });

  it('suggests the painting contract and saves a selected trade without unrelated scope', async () => {
    stored = { ...base, items: [{ ...base.items[0], category: 'Interior Painting' }] };
    await render();
    expect(document.body.textContent).toContain('Contract trade: Painting');
    expect(document.body.textContent).toContain('primers, coatings and finishes');
    expect(document.body.textContent).not.toContain('Sprinkler');
    expect(document.body.textContent).not.toContain('turf materials');
    await act(async () => button('Edit terms')!.click());
    const select = document.body.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('painting-v1');
    await act(async () => { select.value = 'roofing-v1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.body.textContent).toContain('roofing, underlayment, flashing');
    expect(document.body.textContent).not.toContain('primers, coatings and finishes');
    await act(async () => button('Save')!.click());
    expect(update).toHaveBeenCalledWith('e1', { contract_terms: expect.objectContaining({ contractTemplate: 'roofing-v1' }) });
    expect(document.body.textContent).toContain('Contract trade: Roofing');
    for (const heading of ['PARTIES', 'CONSTRUCTION PROPERTY', 'SCOPE OF WORK', 'Payment Terms', 'Notice of Cancellation', 'TEXAS PROPERTY CODE']) {
      expect(document.body.textContent).toContain(heading);
    }
  });

  it('once accepted, shows it as signed and the terms can no longer be edited', async () => {
    stored = {
      ...base,
      status: 'accepted',
      contract_locked_at: '2026-10-11T12:00:00Z',
      client_signature: 'data:image/png;base64,sig',
      signed_at: '2026-10-11T12:00:00Z',
      contract_snapshot: { items: base.items.map((i) => ({ _id: i.id, description: i.description, quantity: 1, unitPrice: 900, totalPrice: 900 })), totalAmount: 900 },
    };
    await render();
    expect(document.body.textContent).toContain('Signed');
    expect(document.body.textContent).toContain('change order');
    expect(button('Edit terms')).toBeUndefined();
    expect(button('Print/PDF')).toBeTruthy();
    const signature = document.body.querySelector('img[alt="Client signature"]') as HTMLImageElement;
    expect(signature.src).toBe('data:image/png;base64,sig');
    expect(document.body.textContent).not.toContain('Awaiting client signature');
    expect(document.body.textContent).toContain('Sprinkler');
    expect(document.body.textContent).toContain('Vendor 16 year warranty for turf');
  });

  it('before the client signs, says the signature comes from the estimate link', async () => {
    stored = { ...base };
    await render();
    expect(document.body.textContent).toContain('Awaiting client signature');
    expect(document.body.querySelector('img[alt="Client signature"]')).toBeNull();
  });

  it("the scope and price table come from the estimate's categories", async () => {
    stored = {
      ...base,
      items: [
        { id: 'i1', description: 'Paint walls', quantity: 1, unit_price: 600, total_price: 600, category: 'Interior Painting' },
        { id: 'i2', description: 'Vanity', quantity: 1, unit_price: 900, total_price: 900, category: 'Plumbing' },
      ],
      subtotal: 1500,
      total_amount: 1500,
    };
    await render();
    const scope = document.body.querySelector('[data-testid="scope-categories"]')!;
    expect(Array.from(scope.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Interior Painting', 'Plumbing']);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Interior Painting$600.00');
    expect(text).toContain('Plumbing$900.00');
    expect(text).not.toContain('Outdoor Kitchen');
  });

  it('shows the agreed design', async () => {
    stored = { ...base, design: { url: 'https://files.example/plan.png', name: 'plan.png', type: 'image/png' } };
    await render();
    expect(document.body.textContent).toContain('AGREED DESIGN');
    expect((document.body.querySelector('img[alt="plan.png"]') as HTMLImageElement).src).toBe('https://files.example/plan.png');
  });
});
