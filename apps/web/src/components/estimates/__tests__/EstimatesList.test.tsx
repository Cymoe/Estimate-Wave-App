import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: Array<Record<string, unknown>> = [];
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: { list: jest.fn(async () => rows) },
}));
jest.mock('../../../services/EstimateExportService', () => ({ EstimateExportService: {} }));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) },
}));
jest.mock('../CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return {
    OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }),
    LayoutContext: createContext({ isConstrained: false }),
  };
});

import { EstimatesList } from '../EstimatesList';

const estimate = (n: number, title: string) => ({
  id: `e${n}`,
  estimate_number: `EST-2026-00${n}`,
  title,
  status: 'draft',
  total_amount: 1000 * n,
  issue_date: '2026-10-09',
  created_at: '2026-10-09T12:00:00Z',
  items: [],
});

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter><EstimatesList /></MemoryRouter>));
  await act(async () => {});
  return container;
}

describe('EstimatesList', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('has its own search in the toolbar, above the stats, and no create button', async () => {
    rows = [estimate(1, 'Kitchen trim'), estimate(2, 'Garage door')];
    const container = await render();
    const search = container.querySelector('input[aria-label="Search estimates"]') as HTMLInputElement;
    expect(search).toBeTruthy();
    // Toolbar first, then the totals.
    const text = container.textContent ?? '';
    expect(text.indexOf('All Estimates')).toBeLessThan(text.indexOf('TOTAL ESTIMATES'));
    expect(text).not.toMatch(/Create Estimate|CREATE FIRST ESTIMATE/);

    jest.useFakeTimers();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'garage');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(300));
    expect(container.textContent).toContain('EST-2026-002');
    expect(container.textContent).not.toContain('EST-2026-001');
  });

  it('points to the + button when there are no estimates yet', async () => {
    rows = [];
    const container = await render();
    expect(container.textContent).toContain('Tap the yellow + and choose Estimate');
    expect(container.querySelector('button')?.textContent ?? '').not.toMatch(/CREATE FIRST ESTIMATE/);
  });
});
