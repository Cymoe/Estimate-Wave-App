import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = {
  id: 'p1',
  name: 'Kitchen trim',
  status: 'active',
  budget: 1000,
  start_date: '2026-10-01',
  end_date: '2099-01-01',
  client_id: 'c1',
  client: { id: 'c1', name: 'Ann Miller' },
  description: 'Paint-grade trim',
};
let expenses: Array<Record<string, unknown>> = [];
const createExpense = jest.fn(async (e: Record<string, unknown>) => {
  const row = { ...e, id: `x${expenses.length + 1}` };
  expenses = [row, ...expenses];
  return row;
});
const updateProject = jest.fn(async (_id: string, patch: Record<string, unknown>) => ({
  ...project,
  ...patch,
  budget: Number(patch.budget ?? project.budget),
}));

jest.mock('../../../services/ProjectService', () => ({
  ProjectService: {
    getById: jest.fn(async () => project),
    update: (id: string, patch: Record<string, unknown>) => updateProject(id, patch),
    updateStatus: jest.fn(async (_id: string, status: string) => ({ ...project, status })),
    delete: jest.fn(),
  },
}));
jest.mock('../../../services/ClientService', () => ({
  ClientService: {
    getById: jest.fn(async () => ({ id: 'c1', name: 'Ann Miller', phone: '432-555-0100', address: '12 Oak St', city: 'Midland' })),
    list: jest.fn(async () => [{ id: 'c1', name: 'Ann Miller' }]),
  },
}));
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: {
    getByProject: jest.fn(async () => [{ id: 'e1', estimate_number: 'EST-1', status: 'accepted', total_amount: 3000 }]),
    // Every estimate in the company: one on this project, two not on any (the client's own first once sorted).
    list: jest.fn(async () => [
      { id: 'e1', estimate_number: 'EST-1', project_id: 'p1', status: 'accepted', total_amount: 3000 },
      { id: 'e8', estimate_number: 'EST-8', title: 'Fence', client_id: 'c9', status: 'draft', total_amount: 1200, created_at: '2026-10-20' },
      { id: 'e7', estimate_number: 'EST-7', title: 'Trim', client_id: 'c1', status: 'sent', total_amount: 800, created_at: '2026-10-01' },
    ]),
    update: jest.fn(async () => ({})),
    create: jest.fn(async () => ({ id: 'e9', estimate_number: 'EST-9', status: 'draft', total_amount: 0 })),
  },
}));
jest.mock('../../../services/ExpenseService', () => {
  const actual = jest.requireActual('../../../services/ExpenseService');
  return {
    ...actual,
    ExpenseService: {
      list: jest.fn(async () => expenses),
      create: (e: Record<string, unknown>) => createExpense(e),
      update: jest.fn(async () => ({})),
      delete: jest.fn(),
    },
  };
});
const saveTemplate = jest.fn(async (_projectId: string, name: string) => ({ id: 'tpl1', name }));
jest.mock('../../../lib/api', () => ({
  tasksAPI: {
    forProject: jest.fn(async () => [
      { id: 't1', projectId: 'p1', title: 'Tear-off', startDate: '2026-11-03', done: false, crew: [{ id: 'k1', name: 'Joe Ruiz' }], order: 1 },
      { id: 't2', projectId: 'p1', title: 'Order materials', done: true, crew: [], order: 2 },
    ]),
  },
  crewAPI: { list: jest.fn(async () => []) },
  costCodesAPI: { list: jest.fn(async () => []) },
  industriesAPI: { forOrganization: jest.fn(async () => []) },
  templatesAPI: { saveFromProject: (...args: unknown[]) => saveTemplate(...(args as [string, string])) },
  portalAPI: { forProject: jest.fn(async () => portalInfo) },
  purchaseOrdersAPI: { forProject: jest.fn(async () => ordersInfo) },
  purchaseOrderUrl: (token: string) => `https://app.example/po/${token}`,
}));
// The project's purchase orders.
const noOrders = { orders: [] as unknown[], committed: 0, received: 0 };
let ordersInfo: { orders: unknown[]; committed: number; received: number } = noOrders;
// Whose portal the project's is (null: no client yet).
let portalInfo: { clientId: string; name: string; language: 'en' | 'es'; token: string | null; queued: number } | null = null;
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { ProjectDetailsDrawer } from '../ProjectDetails';

const onClose = jest.fn();
const onSaved = jest.fn();

let path = '';
const Where = () => {
  path = useLocation().pathname;
  return null;
};

// Unmounted after each test, so an earlier drawer can't answer a later test's Esc.
const roots: Array<ReturnType<typeof createRoot>> = [];
async function render(at = '/projects/p1', props: { covered?: boolean; estimatesRevision?: number } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const draw = (extra: typeof props) =>
    act(async () =>
      root.render(
        <MemoryRouter initialEntries={[at]}>
          <Where />
          <Routes>
            <Route element={<ProjectDetailsDrawer projectId="p1" onClose={onClose} onSaved={onSaved} {...extra} />}>
              <Route path="/projects/:id" element={null} />
              <Route path="/projects/:id/estimates/:estimateId" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>,
      ),
    );
  await draw(props);
  await act(async () => {});
  return Object.assign(document.body, { redraw: draw });
}

const click = async (text: string) => {
  const button = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text));
  if (!button) throw new Error(`No button "${text}"`);
  await act(async () => button.click());
};
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const summary = () => document.body.querySelector('[data-testid="project-summary"]')!.textContent ?? '';

describe('Project drawer', () => {
  afterEach(() => {
    act(() => roots.splice(0).forEach((r) => r.unmount()));
    document.body.innerHTML = '';
    createExpense.mockClear();
    onClose.mockClear();
    onSaved.mockClear();
  });

  it('opens as a drawer as wide as the estimate, with the contract, costs and profit', async () => {
    expenses = [
      { id: 'x1', description: 'Lumber', amount: 600, category: 'Materials', date: '2026-10-02', status: 'paid' },
      { id: 'x2', description: 'Nails', amount: 100, category: 'Materials', date: '2026-10-03', status: 'pending' },
    ];
    const body = await render();
    const dialog = body.querySelector('[role="dialog"][aria-label="Project"]')!;
    expect(dialog.className).toContain('md:w-[720px]');
    expect(dialog.querySelector('h1')!.textContent).toBe('Kitchen trim');
    expect(dialog.textContent).toContain('Ann Miller • Oct 1, 2026 – Jan 1, 2099');
    expect(Array.from(dialog.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual([
      'Overview',
      'Tasks1',
      'Estimates1',
      'Purchase orders0',
      'Expenses2',
      'Photos',
    ]);
    // The next open tasks, with their crew and day.
    const nextUp = dialog.querySelector('[data-testid="next-up"]')!.textContent;
    expect(nextUp).toContain('Tear-off');
    expect(nextUp).toContain('Joe Ruiz');
    expect(nextUp).not.toContain('Order materials');
    expect(summary()).toContain('Contract$3,000.00accepted estimates');
    expect(summary()).toContain('Costs$700.00of $1,000.00 budget');
    expect(summary()).toContain('Profit$2,300.0077% margin');
    // Where the money went, the budget, the latest costs, and the numbers pinned at the bottom.
    const types = dialog.querySelector('[data-testid="costs-by-type"]')!;
    expect(types.textContent).toContain('Materials$700.00 · 100%');
    expect(types.textContent).not.toContain('Example');
    expect(dialog.querySelector('[data-testid="budget"]')!.textContent).toBe('Budget $1,000.00$300.00 left');
    expect(dialog.querySelector('[aria-label="Recent costs"]')!.textContent).toContain('NailsMaterials · Oct 3pending$100.00');
    expect(dialog.querySelector('[data-testid="project-totals"]')!.textContent).toBe(
      '2 costsContract$3,000.00Costs · 70% of budget$700.00Profit · 77%$2,300.00',
    );
    expect(dialog.textContent).not.toContain('Project Health');
    expect(dialog.textContent).not.toContain('Most Used');
    // No contact buttons crowd the header: the client's name opens their page, which has them.
    expect(dialog.querySelector('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"], a[href*="maps"]')).toBeNull();
    const clientLink = dialog.querySelector('[data-testid="project-client-link"]') as HTMLButtonElement;
    expect(clientLink.textContent).toBe('Ann Miller');
    await act(async () => clientLink.click());
    expect(path).toBe('/clients/c1');
  });

  it('adds an expense from the Expenses tab, and the overview counts it', async () => {
    expenses = [{ id: 'x1', description: 'Lumber', amount: 600, category: 'Materials', date: '2026-10-02', status: 'paid' }];
    await render();
    await click('Expenses');
    await act(async () => (document.body.querySelector('button[aria-label="Add expense"]') as HTMLButtonElement).click());
    const description = document.body.querySelector('input[aria-label="What did you pay for?"]') as HTMLInputElement;
    const amount = document.body.querySelector('input[aria-label="Amount"]') as HTMLInputElement;
    await act(async () => {
      type(description, 'Dumpster');
      type(amount, '450');
    });
    await click('Add Expense');
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org1', project_id: 'p1', description: 'Dumpster', amount: 450, status: 'pending' }),
    );
    await click('Overview');
    expect(summary()).toContain('Costs$1,050.00of $1,000.00 budget');
    expect(document.body.querySelector('[data-testid="budget"]')!.textContent).toBe('Budget $1,000.00$50.00 over');
  });

  it('edits the details in place, and tells the list behind', async () => {
    expenses = [];
    await render();
    const budget = document.body.querySelector('input[aria-label="Budget"]') as HTMLInputElement;
    expect(budget.value).toBe('1000');
    await act(async () => type(budget, '2500'));
    await act(async () => {
      budget.focus();
      budget.blur();
    });
    expect(updateProject).toHaveBeenCalledWith('p1', { budget: '2500' });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', budget: 2500 }));
  });

  it('shows example costs, faded, until the project has its own', async () => {
    expenses = [];
    await render();
    const types = document.body.querySelector('[data-testid="costs-by-type"]')!;
    expect(types.textContent).toContain('Example');
    expect(types.textContent).toContain('Materials$7,400.00');
    expect(types.querySelector('ul')!.className).toContain('opacity-50');
    expect(document.body.querySelector('[aria-label="Recent costs"]')).toBeNull();
    await click('Add a cost');
    expect(document.body.querySelector('input[aria-label="What did you pay for?"]')).not.toBeNull();
  });

  it('lists the estimates on their own tab', async () => {
    expenses = [];
    await render();
    await click('Estimates');
    const list = document.body.querySelector('[aria-label="Estimates"]')!;
    expect(list.textContent).toContain('EST-1');
    expect(list.textContent).toContain('Accepted');
    expect(list.textContent).toContain('$3,000.00');
  });

  it('?tab=estimates starts on that tab, and a row opens the estimate over the project', async () => {
    expenses = [];
    await render('/projects/p1?tab=estimates');
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain('Estimates');
    await click('EST-1');
    expect(path).toBe('/projects/p1/estimates/e1');
  });

  it('while an estimate is open on top, Esc is left to it, and closing it reads the estimates again', async () => {
    expenses = [];
    const { getByProject } = jest.requireMock('../../../services/EstimateService').EstimateService;
    getByProject.mockClear();
    const body = await render('/projects/p1/estimates/e1', { covered: true });
    expect(body.querySelector('[aria-label="Project"]')!.getAttribute('aria-hidden')).toBe('true');
    expect(body.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain('Estimates'); // the tab behind the estimate
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).not.toHaveBeenCalled();
    expect(getByProject).toHaveBeenCalledTimes(1);

    await body.redraw({ covered: false, estimatesRevision: 1 });
    expect(body.querySelector('[aria-label="Project"]')!.getAttribute('aria-hidden')).toBeNull();
    expect(getByProject).toHaveBeenCalledTimes(2);
  });

  it('starts a new estimate on the project, for its client, and opens it over the project', async () => {
    expenses = [];
    const { EstimateService } = jest.requireMock('../../../services/EstimateService');
    await render('/projects/p1?tab=estimates');
    await click('New estimate');
    await act(async () => {});
    expect(EstimateService.create).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org1', project_id: 'p1', client_id: 'c1', title: 'Kitchen trim - Estimate', status: 'draft', items: [] }),
    );
    expect(path).toBe('/projects/p1/estimates/e9');
  });

  it('adds an estimate made before the project from a quiet link, offering only this client’s', async () => {
    expenses = [];
    const { EstimateService } = jest.requireMock('../../../services/EstimateService');
    EstimateService.getByProject.mockClear();
    await render('/projects/p1?tab=estimates');
    await act(async () => {});
    expect(document.body.querySelector('select[aria-label="Add an existing estimate"]')).toBeNull();
    await click('or add one made before the project (1)');
    const select = document.body.querySelector('select[aria-label="Add an existing estimate"]') as HTMLSelectElement;
    // Another client's unfiled estimate (EST-8) isn't offered.
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Pick one of their estimates', 'EST-7 · Trim · $800.00']);
    const before = EstimateService.getByProject.mock.calls.length;
    await act(async () => {
      select.value = 'e7';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(EstimateService.update).toHaveBeenCalledWith('e7', { project_id: 'p1' });
    expect(EstimateService.getByProject.mock.calls.length).toBeGreaterThan(before); // the tab reads its estimates again
  });

  it('saves the project as a template from the ⋯ menu, and says where to find it', async () => {
    expenses = [];
    await render();
    jest.spyOn(window, 'prompt').mockReturnValue(' Re-roof ');
    await act(async () => (document.body.querySelector('button[aria-label="More actions"]') as HTMLButtonElement).click());
    await click('Save as template');
    await act(async () => {});
    expect(saveTemplate).toHaveBeenCalledWith('p1', 'Re-roof');
    expect(document.body.textContent).toContain('Saved “Re-roof”. Pick it under Template when starting a project.');
  });

  it('leaves Esc to a photo open on top, and closes on the next one', async () => {
    expenses = [];
    jest.useFakeTimers();
    await render();
    const photo = document.createElement('div');
    photo.setAttribute('role', 'dialog');
    document.body.appendChild(photo);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).not.toHaveBeenCalled();
    photo.remove();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await act(async () => jest.advanceTimersByTime(200));
    expect(onClose).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("has a Client portal button once the project has a client, showing what's waiting to send", async () => {
    expenses = [];
    portalInfo = null;
    await render();
    const button = () => document.body.querySelector('[data-testid="client-portal-button"]') as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    expect(button().title).toBe('Add a client first');
    act(() => roots.splice(0).forEach((r) => r.unmount()));
    document.body.innerHTML = '';
    portalInfo = { clientId: 'c1', name: 'Ann Miller', language: 'en', token: null, queued: 2 };
    await render();
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Client portal2');
    portalInfo = null;
  });

  it('has a Purchase orders tab counting the open ones, and the committed money under the costs', async () => {
    expenses = [];
    const po = (id: string, status: string, total: number) => ({ id, number: `PO-${id}`, title: `Vendor ${id}`, lines: [], total, status });
    ordersInfo = { orders: [po('1', 'draft', 500), po('2', 'ordered', 1200), po('3', 'received', 300)], committed: 1200, received: 300 };
    await render();
    const tab = Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Purchase orders'))!;
    expect(tab.textContent).toBe('Purchase orders2');
    expect(document.body.querySelector('[data-testid="committed"]')!.textContent).toBe('+ $1,200.00 committed');
    await act(async () => (tab as HTMLButtonElement).click());
    await act(async () => {});
    expect(document.body.querySelectorAll('[data-testid="po"]')).toHaveLength(3);
    ordersInfo = noOrders;
  });

  it('closes with the X', async () => {
    expenses = [];
    jest.useFakeTimers();
    await render();
    await act(async () => (document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    await act(async () => jest.advanceTimersByTime(200));
    expect(onClose).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
