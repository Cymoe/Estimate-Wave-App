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
const documents = jest.fn<Promise<unknown>, [string]>(async () => ({
  locked: true,
  acknowledgedAt: '2026-10-11T12:00:00Z',
  agreement: { kind: 'agreement', source: 'upload', origin: 'signed', name: 'Shah Agreement', fileName: 'Shah Agreement.pdf', size: 2048, sha256: 'abc123', url: 'https://files/a' },
  affidavit: { kind: 'affidavit', source: 'tolliver', origin: 'tolliver', name: 'Affidavit of Completion' },
  changeOrder: { kind: 'change_order', source: 'tolliver', origin: 'tolliver', name: 'Change Order' },
  attachments: [],
  companyAttachments: [],
  companyDefaults: {},
}));
jest.mock('../../../lib/api', () => ({
  organizationsAPI: { getById: (id: string) => getOrganization(id) },
  estimatesAPI: { documents: (id: string) => documents(id) },
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

async function render(url = '/estimates/e1/contract') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[url]}>
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

  it('?record=1 shows the signed record: who signed, when, and the exact file', async () => {
    stored = {
      ...base,
      status: 'accepted',
      client_signature: 'data:image/png;base64,sig',
      signed_at: '2026-10-11T12:00:00Z',
      contract_locked_at: '2026-10-11T12:00:00Z',
      contract_snapshot: { client: { name: 'Dan Shah' }, items: [], totalAmount: 900 },
    };
    await render('/estimates/e1/contract?record=1');
    await act(async () => {});
    expect(documents).toHaveBeenCalledWith('e1');
    const record = document.body.querySelector('[data-testid="signed-record"]')!;
    expect(record.textContent).toContain('Signed byDan Shah');
    expect(record.textContent).toContain('Shah Agreement.pdf · 2 KB');
    expect(record.textContent).toContain('SHA-256 abc123');
    expect(record.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,sig');
    expect(document.body.textContent).toContain('Signed record - EST-2026-000001');
  });
});
