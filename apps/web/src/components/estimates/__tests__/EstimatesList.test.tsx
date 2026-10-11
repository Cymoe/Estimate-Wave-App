import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: Array<Record<string, unknown>> = [];
let listCall: () => Promise<unknown> = async () => rows;
const actions = { shareUrl: jest.fn(async () => 'https://app.example/share/estimate/tok'), delete: jest.fn(async () => {}), updateStatus: jest.fn(async () => ({})) };
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: {
    list: jest.fn(() => listCall()),
    shareUrl: (id: string) => actions.shareUrl(id),
    delete: (id: string) => actions.delete(id),
    updateStatus: (id: string, status: string) => actions.updateStatus(id, status),
  },
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

  it('reloading after an estimate closes keeps the rows on screen instead of a loading state', async () => {
    rows = [estimate(1, 'Kitchen trim')];
    listCall = async () => rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<MemoryRouter><EstimatesList refreshTrigger={0} /></MemoryRouter>));
    await act(async () => {});
    expect(container.textContent).toContain('EST-2026-001');

    let finish: (value: unknown) => void = () => {};
    listCall = () => new Promise((resolve) => (finish = resolve));
    await act(async () => root.render(<MemoryRouter><EstimatesList refreshTrigger={1} /></MemoryRouter>));
    // While the reload is in flight the old rows stay.
    expect(container.textContent).toContain('EST-2026-001');
    expect(container.textContent).toContain('Kitchen trim');

    await act(async () => finish([estimate(1, 'Kitchen trim'), estimate(2, 'Garage door')]));
    expect(container.textContent).toContain('EST-2026-002');
    listCall = async () => rows;
  });

  it('highlights the open estimate only while its drawer is open', async () => {
    rows = [estimate(1, 'Kitchen trim'), estimate(2, 'Garage door')];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const rowOf = (text: string) =>
      Array.from(container.querySelectorAll('[class*="cursor-pointer"]')).find((el) => el.textContent?.includes(text))!;
    const highlighted = (el: Element) => el.className.split(/\s+/).includes('bg-[#1A1A1A]');

    await act(async () => root.render(<MemoryRouter><EstimatesList selectedId="e2" /></MemoryRouter>));
    await act(async () => {});
    expect(highlighted(rowOf('Garage door'))).toBe(true);
    expect(highlighted(rowOf('Kitchen trim'))).toBe(false);

    await act(async () => root.render(<MemoryRouter><EstimatesList /></MemoryRouter>));
    expect(highlighted(rowOf('Garage door'))).toBe(false);
  });

  describe('holding a row down', () => {
    async function renderRows() {
      rows = [estimate(1, 'Kitchen trim'), { ...estimate(2, 'Garage door'), status: 'sent' }];
      listCall = async () => rows;
      return render();
    }
    const rowOf = (container: HTMLElement, text: string) =>
      Array.from(container.querySelectorAll('[class*="cursor-pointer"]')).find((el) => el.textContent?.includes(text))!;
    const menuItems = () => Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((b) => b.textContent);
    const tapMenu = async (label: string) =>
      act(async () => (Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((b) => b.textContent === label) as HTMLElement).click());

    it('opens the actions menu after a hold', async () => {
      jest.useFakeTimers();
      const container = await renderRows();
      const row = rowOf(container, 'Kitchen trim');
      const touch = { clientX: 100, clientY: 200 };
      await act(async () => {
        row.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [touch] }));
        jest.advanceTimersByTime(600);
      });
      expect(menuItems()).toEqual(['Send to client', 'Copy client link', 'Duplicate', 'Delete']);
    });

    it('a quick tap or a scroll does not open it', async () => {
      jest.useFakeTimers();
      const container = await renderRows();
      const row = rowOf(container, 'Kitchen trim');
      await act(async () => {
        row.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [{ clientX: 100, clientY: 200 }] }));
        row.dispatchEvent(Object.assign(new Event('touchmove', { bubbles: true }), { touches: [{ clientX: 100, clientY: 260 }] }));
        jest.advanceTimersByTime(600);
      });
      expect(menuItems()).toEqual([]);
    });

    it('right-click opens it too; sent estimates can be marked accepted or declined', async () => {
      const container = await renderRows();
      await act(async () => {
        rowOf(container, 'Garage door').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 60 }));
      });
      expect(menuItems()).toContain('Mark as accepted');
      await tapMenu('Mark as accepted');
      expect(actions.updateStatus).toHaveBeenCalledWith('e2', 'accepted');
    });

    it('copies the client link, and deletes only after confirming', async () => {
      const container = await renderRows();
      const writeText = jest.fn(async () => {});
      Object.assign(navigator, { clipboard: { writeText } });
      const open = async () =>
        act(async () => {
          rowOf(container, 'Kitchen trim').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        });
      await open();
      await tapMenu('Copy client link');
      expect(writeText).toHaveBeenCalledWith('https://app.example/share/estimate/tok');
      expect(document.body.textContent).toContain('Client link copied');

      await open();
      await tapMenu('Delete');
      expect(actions.delete).not.toHaveBeenCalled();
      const confirm = Array.from(document.body.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent === 'Delete') as HTMLElement;
      await act(async () => confirm.click());
      expect(actions.delete).toHaveBeenCalledWith('e1');
    });
  });
});
