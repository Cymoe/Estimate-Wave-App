import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityRow } from '../useActivity';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: ActivityRow[] | undefined = [];
const useActivity = jest.fn<ActivityRow[] | undefined, [string | undefined, string | undefined, number | undefined]>(() => rows);
jest.mock('../useActivity', () => ({
  useActivity: (org: string | undefined, kind?: string, limit?: number) => useActivity(org, kind, limit),
}));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1', name: 'Peak Remodeling' }, setSelectedOrg: () => {} }) };
});

import { ActivityPanel } from '../ActivityPanel';

const sample: ActivityRow[] = [
  { id: 'a2', at: new Date(Date.now() - 5 * 60_000).toISOString(), who: 'Ann Miller', text: 'Signed estimate EST-9', link: '/estimates/e1', icon: 'sign', tone: 'green' },
  { id: 'a1', at: new Date(Date.now() - 60 * 60_000).toISOString(), who: 'Office line', text: 'Ordered PO-1 · Cabinet supplier ($3,811.50)', icon: 'send', tone: 'blue' },
];

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter>{ui}</MemoryRouter>));
}
const $ = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => Array.from(document.body.querySelectorAll(sel)) as HTMLElement[];

beforeEach(() => {
  rows = sample;
});
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

test('the panel lists who did what, when, linked to it, over a dimmed (not blank) page', async () => {
  const onClose = jest.fn();
  await render(<ActivityPanel isOpen onClose={onClose} />);
  expect(useActivity).toHaveBeenCalledWith('org1', undefined, 100);
  // No page behind it any more.
  expect(document.body.textContent).not.toContain('View All Activity');
  const items = $$('[data-testid="activity-row"]').map((r) => r.textContent);
  expect(items[0]).toMatch(/^Ann Miller Signed estimate EST-9\s*5 minutes ago$/);
  expect(items[1]).toContain('Office line Ordered PO-1 · Cabinet supplier ($3,811.50)');
  const link = $('a[href="/estimates/e1"]')!;
  expect(link.textContent).toBe('Signed estimate EST-9');
  // Following a row closes the panel.
  await act(async () => link.click());
  expect(onClose).toHaveBeenCalled();
  expect($('[data-testid="activity-backdrop"]')!.style.backgroundColor).toBe('rgba(0, 0, 0, 0.4)');
});

test('loading, then the empty state', async () => {
  rows = undefined;
  await render(<ActivityPanel isOpen onClose={() => {}} />);
  expect($('[data-testid="activity-loading"]')).not.toBeNull();
  document.body.innerHTML = '';
  rows = [];
  await render(<ActivityPanel isOpen onClose={() => {}} />);
  expect(document.body.textContent).toContain('Nothing here yet');
});

test('closed, it reads nothing, and its dim is faded out and lets taps through', async () => {
  await render(<ActivityPanel isOpen={false} onClose={() => {}} />);
  expect(useActivity).not.toHaveBeenCalled();
  expect($('[data-testid="activity-backdrop"]')!.className).toContain('opacity-0 pointer-events-none');
});

test('Esc closes it, like the other drawers', async () => {
  const onClose = jest.fn();
  await render(<ActivityPanel isOpen onClose={onClose} />);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onClose).toHaveBeenCalled();
});
