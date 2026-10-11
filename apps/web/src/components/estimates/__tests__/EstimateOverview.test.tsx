import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let stored: Record<string, unknown> = {};
const update = jest.fn();
const uploadDesign = jest.fn();
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: {
    getById: async () => stored,
    update: async (id: string, changes: Record<string, unknown>) => {
      update(id, changes);
      if (changes.client_id === 'c2') stored = { ...stored, client_id: 'c2', client: { name: 'Priya Shah', email: 'priya@example.com' } };
      return stored;
    },
    uploadDesign: async (id: string, file: File) => {
      uploadDesign(id, file);
      stored = { ...stored, design: { url: 'https://files.example/plan.png', name: file.name, type: file.type } };
      return stored;
    },
    removeDesign: async () => stored,
  },
}));
jest.mock('../../../lib/api', () => ({
  organizationsAPI: { getById: async () => null },
  clientsAPI: { list: async () => [{ id: 'c2', name: 'Priya Shah' }, { id: 'c1', name: 'Dan Shah' }] },
}));
jest.mock('../CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../common/MapModal', () => ({ MapModal: () => null }));
jest.mock('../ContextualPricingSelector', () => ({ ContextualPricingSelector: () => null }));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { EstimateDetail } from '../EstimateDetail';

const base = {
  id: 'e1',
  estimate_number: 'EST-2026-523077',
  status: 'draft',
  total_amount: 3210993.5,
  subtotal: 3210993.5,
  created_at: '2026-10-09T12:00:00Z',
  issue_date: '2026-10-09',
  items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 3210993.5, total_price: 3210993.5 }],
};

async function openOverview() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <EstimateDetail estimateId="e1" onClose={() => {}} inDrawer />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  await act(async () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Overview')!.click());
  await act(async () => {});
}

describe('estimate overview', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    update.mockClear();
    uploadDesign.mockClear();
  });

  it('summarises the estimate without repeating the status', async () => {
    stored = { ...base };
    await openOverview();
    const text = document.body.textContent ?? '';
    expect(text).toContain('$3,210,993.50');
    expect(text).toContain('Items1');
    expect(text).not.toContain('Estimate Summary');
  });

  it('lets you choose a client when there is none', async () => {
    stored = { ...base };
    await openOverview();
    const select = document.body.querySelector('select[aria-label="Choose client"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Choose client', 'Dan Shah', 'Priya Shah']);
    await act(async () => {
      select.value = 'c2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});
    expect(update).toHaveBeenCalledWith('e1', { client_id: 'c2' });
    expect(document.body.textContent).toContain('priya@example.com');
    expect(document.body.querySelector('select[aria-label="Choose client"]')).toBeNull();
  });

  it('uploads the agreed design and shows it', async () => {
    stored = { ...base };
    await openOverview();
    const input = document.body.querySelector('[data-testid="design-file"]') as HTMLInputElement;
    const file = new File(['x'], 'plan.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => {});
    expect(uploadDesign).toHaveBeenCalledWith('e1', file);
    expect((document.body.querySelector('img[alt="plan.png"]') as HTMLImageElement).src).toBe('https://files.example/plan.png');
  });

  it('refuses files that are not images or PDFs', async () => {
    stored = { ...base };
    await openOverview();
    const input = document.body.querySelector('[data-testid="design-file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.txt', { type: 'text/plain' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(uploadDesign).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Choose an image (PNG, JPG) or a PDF.');
  });
});
