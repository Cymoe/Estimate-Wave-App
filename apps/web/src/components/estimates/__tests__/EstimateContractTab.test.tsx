import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../services/EstimateService', () => ({
  EstimateService: {
    getById: async () => ({
      id: 'e1',
      estimate_number: 'EST-2026-000001',
      status: 'draft',
      total_amount: 100,
      subtotal: 100,
      created_at: '2026-10-08T12:00:00Z',
      issue_date: '2026-10-08',
      items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 100, total_price: 100 }],
    }),
  },
}));
jest.mock('../../../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'order', 'limit']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { supabase: chain };
});
jest.mock('../CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../common/MapModal', () => ({ MapModal: () => null }));
jest.mock('../DesignUpload', () => ({ DesignUpload: () => null }));
jest.mock('../ContextualPricingSelector', () => ({ ContextualPricingSelector: () => null }));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { EstimateDetail } from '../EstimateDetail';

let path = '';
const Where = () => {
  path = useLocation().pathname;
  return null;
};

const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.includes(text));

describe('estimate contract tab', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function openContractTab() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter initialEntries={['/estimates/e1']}>
          <Where />
          <Routes>
            <Route path="/estimates/:id" element={<EstimateDetail estimateId="e1" onClose={() => {}} inDrawer />} />
            <Route path="/estimates/:id/contract" element={<p>contract page</p>} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
    await act(async () => buttons().find((b) => b.textContent === 'Contract')!.click());
  }

  it('lists the three documents, with no separate Contract button in the header', async () => {
    await openContractTab();
    expect(buttons().filter((b) => b.textContent === 'Contract')).toHaveLength(1); // only the tab
    expect(byText('Service Contract Agreement')).toBeTruthy();
    expect(byText('Affidavit of Completion')).toBeTruthy();
    expect(byText('Change Order')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Full Contract View');
    expect(document.body.textContent).not.toContain('LIEN RELEASE CERTIFICATE');
  });

  it('the service contract opens the full contract page', async () => {
    await openContractTab();
    await act(async () => byText('Service Contract Agreement')!.click());
    expect(path).toBe('/estimates/e1/contract');
  });

  it('the affidavit and change order expand inline, one at a time', async () => {
    await openContractTab();
    await act(async () => byText('Affidavit of Completion')!.click());
    expect(document.body.textContent).toContain('LIEN RELEASE CERTIFICATE');
    await act(async () => byText('Change Order')!.click());
    expect(document.body.textContent).toContain('SCOPE MODIFICATION CONTRACT');
    expect(document.body.textContent).not.toContain('LIEN RELEASE CERTIFICATE');
    await act(async () => byText('Change Order')!.click());
    expect(document.body.textContent).not.toContain('SCOPE MODIFICATION CONTRACT');
  });
});
