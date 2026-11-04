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
    cached: () => undefined,
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
const money = () =>
  Array.from(document.body.querySelectorAll('[data-testid="money-rows"] li')).map((li) => li.textContent);
const selectedTab = () => document.body.querySelector('[role="tab"][aria-selected="true"]')!.textContent;

describe('Project drawer', () => {
  afterEach(() => {
    act(() => roots.splice(0).forEach((r) => r.unmount()));
    document.body.innerHTML = '';
    createExpense.mockClear();
    onClose.mockClear();
    onSaved.mockClear();
  });

  it('opens as a drawer as wide as the estimate, with the projected profit and where the money stands', async () => {
    expenses = [
      { id: 'x1', description: 'Lumber', amount: 600, category: 'Materials', date: '2026-10-02', status: 'paid' },
      { id: 'x2', description: 'Nails', amount: 100, category: 'Materials', date: '2026-10-03', status: 'pending' },
    ];
    const body = await render();
    const dialog = body.querySelector('[role="dialog"][aria-label="Project"]')!;
    expect(dialog.className).toContain('md:w-[720px]');
    expect(dialog.querySelector('h1')!.textContent).toBe('Kitchen trim');
    expect(dialog.textContent).toContain('Ann Miller · Oct 1, 2026 – Jan 1, 2099');
    // Estimates, purchase orders and expenses are all under Money, with no count summed across them.
    expect(Array.from(dialog.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(['Overview', 'Tasks1', 'Money', 'Photos']);
    // The next open tasks, with their crew and day.
    const nextUp = dialog.querySelector('[data-testid="next-up"]')!.textContent;
    expect(nextUp).toContain('Tear-off');
    expect(nextUp).toContain('Joe Ruiz');
    expect(nextUp).not.toContain('Order materials');
    // The profit if the job comes in on its cost budget: $3,000 less $1,000.
    expect(summary()).toBe('Projected profit$2,00067% marginIf the job comes in on its cost budget.$0Contract $3,000');
    expect(money()).toEqual([
      'Contract1 accepted estimate$3,000.00',
      'Cost budget$1,000.00',
      'Spent2 expenses · 1 pending$700.00',
      'CommittedNothing ordered yet$0.00',
      'Left in budget$300.00',
    ]);
    const types = dialog.querySelector('[data-testid="costs-by-type"]')!;
    expect(types.textContent).toBe('Spent by typeMaterials$700.00');
    expect(dialog.querySelector('[data-testid="schedule"]')!.textContent).toMatch(/^Day \d+ of \d+$/);
    // No list of recent costs and no totals bar pinned at the bottom: Money has them.
    expect(dialog.querySelector('[aria-label="Recent costs"]')).toBeNull();
    expect(dialog.querySelector('[data-testid="project-totals"]')).toBeNull();
    expect(dialog.textContent).not.toContain('Project Health');
    expect(dialog.textContent).not.toContain('Most Used');
    // Just the map icon (to Apple Maps); no Call/Text/Email: the client's name opens their page, which has them.
    expect(dialog.querySelector('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]')).toBeNull();
    expect(dialog.querySelector('a[href="https://maps.apple.com/?q=12%20Oak%20St%2C%20Midland"]')?.getAttribute('aria-label')).toBe(
      'Open 12 Oak St, Midland in Apple Maps',
    );
    const clientLink = dialog.querySelector('[data-testid="project-client-link"]') as HTMLButtonElement;
    expect(clientLink.textContent).toBe('Ann Miller');
    await act(async () => clientLink.click());
    expect(path).toBe('/clients/c1');
  });

  it('adds an expense under Money, and the overview counts it', async () => {
    expenses = [{ id: 'x1', description: 'Lumber', amount: 600, category: 'Materials', date: '2026-10-02', status: 'paid' }];
    await render();
    await click('Money');
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
    // Past the budget, the projection counts what's actually spent.
    expect(summary()).toContain('Projected profit$1,95065% marginSpent and committed are past the cost budget, so this counts them instead.');
    expect(money()).toContain('Spent2 expenses · 1 pending$1,050.00');
    expect(document.body.querySelector('[data-testid="budget-left"]')!.textContent).toBe('Over budget$50.00');
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

  it('says plainly when nothing is spent yet, with no example numbers', async () => {
    expenses = [];
    await render();
    const types = document.body.querySelector('[data-testid="costs-by-type"]')!;
    expect(types.textContent).toBe('Spent by typeNothing spent yet. Costs show here by type as they’re logged.');
    expect(money()).toContain('SpentNothing logged yet$0.00');
  });

  it('with no cost budget, shows the profit so far and Add budget goes to the budget field', async () => {
    expenses = [{ id: 'x1', description: 'Lumber', amount: 600, category: 'Materials', date: '2026-10-02', status: 'paid' }];
    const { ProjectService } = jest.requireMock('../../../services/ProjectService');
    (ProjectService.getById as jest.Mock).mockImplementationOnce(async () => ({ ...project, budget: undefined }));
    await render();
    expect(summary()).toContain('Profit so far$2,40080% marginThe contract less what’s spent and committed.');
    expect(document.body.querySelector('[data-testid="budget-left"]')).toBeNull();
    await click('Cost budget');
    await act(async () => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(document.activeElement).toBe(document.body.querySelector('input[aria-label="Budget"]'));
  });

  it('Money holds the estimates, the purchase orders and the expenses, one under the other', async () => {
    expenses = [{ id: 'x1', description: 'Lumber', amount: 600, category: 'Materials', date: '2026-10-02', status: 'paid' }];
    await render();
    await click('Money');
    await act(async () => {});
    const sections = Array.from(document.body.querySelectorAll('[data-testid^="money-"]')).map((el) => el.getAttribute('data-testid'));
    expect(sections).toEqual(['money-estimates', 'money-orders', 'money-expenses']);
    const list = document.body.querySelector('[aria-label="Estimates"]')!;
    expect(list.textContent).toContain('EST-1');
    expect(list.textContent).toContain('Accepted');
    expect(list.textContent).toContain('$3,000.00');
    expect(document.body.querySelector('[data-testid="money-estimates"] h3')!.textContent).toBe('Estimates$3,000.00 accepted');
    expect(document.body.querySelector('[data-testid="money-orders"] [data-testid="purchase-orders"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="money-expenses"] h3')!.textContent).toBe('Expenses$600.00');
  });

  it('a money row on the Overview opens Money on its section', async () => {
    expenses = [];
    await render();
    await click('Spent');
    await act(async () => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(selectedTab()).toBe('Money');
    expect(document.body.querySelector('[data-testid="money-expenses"]')!.className).toContain('ring-2');
  });

  it('?tab=estimates (the old tab) starts on Money, and a row opens the estimate over the project', async () => {
    expenses = [];
    await render('/projects/p1?tab=estimates');
    expect(selectedTab()).toBe('Money');
    await click('EST-1');
    expect(path).toBe('/projects/p1/estimates/e1');
  });

  it('while an estimate is open on top, Esc is left to it, and closing it reads the estimates again', async () => {
    expenses = [];
    const { getByProject } = jest.requireMock('../../../services/EstimateService').EstimateService;
    getByProject.mockClear();
    const body = await render('/projects/p1/estimates/e1', { covered: true });
    expect(body.querySelector('[aria-label="Project"]')!.getAttribute('aria-hidden')).toBe('true');
    expect(selectedTab()).toBe('Money'); // the tab behind the estimate
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

  it('counts what the ordered purchase orders commit against the budget, and opens them under Money', async () => {
    expenses = [{ id: 'x1', description: 'Lumber', amount: 100, category: 'Materials', date: '2026-10-02', status: 'paid' }];
    const po = (id: string, status: string, total: number) => ({ id, number: `PO-${id}`, title: `Vendor ${id}`, lines: [], total, status });
    ordersInfo = { orders: [po('1', 'draft', 500), po('2', 'ordered', 600), po('3', 'received', 300)], committed: 600, received: 300 };
    await render();
    expect(document.body.querySelector('[data-testid="committed"]')!.textContent).toBe('Committed1 purchase order$600.00');
    // $1,000 budget less $100 spent and $600 committed.
    expect(document.body.querySelector('[data-testid="budget-left"]')!.textContent).toBe('Left in budget$300.00');
    await act(async () => (document.body.querySelector('[data-testid="committed"] button') as HTMLButtonElement).click());
    await act(async () => {});
    expect(selectedTab()).toBe('Money');
    expect(document.body.querySelectorAll('[data-testid="po"]')).toHaveLength(3);
    ordersInfo = noOrders;
  });

  it('keeps a long list of purchase orders short under Money, with Show all for the rest', async () => {
    expenses = [];
    const po = (id: string) => ({ id, number: `PO-${id}`, title: `Vendor ${id}`, lines: [], total: 100, status: 'ordered' });
    ordersInfo = { orders: ['1', '2', '3', '4', '5', '6', '7'].map(po), committed: 700, received: 0 };
    await render();
    await click('Money');
    await act(async () => {});
    expect(document.body.querySelectorAll('[data-testid="po"]')).toHaveLength(5);
    await click('Show all 7');
    expect(document.body.querySelectorAll('[data-testid="po"]')).toHaveLength(7);
    ordersInfo = noOrders;
  });

  it('says No tasks yet with Add tasks when the job has none', async () => {
    expenses = [];
    const { tasksAPI } = jest.requireMock('../../../lib/api');
    (tasksAPI.forProject as jest.Mock).mockImplementationOnce(async () => []);
    await render();
    expect(document.body.querySelector('[data-testid="next-up"]')!.textContent).toContain('Next upNo tasks yetAdd tasks');
    await click('Add tasks');
    expect(selectedTab()).toContain('Tasks');
  });

  it('a project with no client says Add client under its name, which opens the Overview on the client picker', async () => {
    const { ProjectService } = jest.requireMock('../../../services/ProjectService');
    (ProjectService.getById as jest.Mock).mockImplementationOnce(async () => ({ ...project, client_id: undefined, client: undefined }));
    await render('/projects/p1?tab=estimates');
    expect(selectedTab()).toBe('Money');
    await click('Add client');
    await act(async () => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(document.body.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain('Overview');
    expect(document.activeElement).toBe(document.body.querySelector('select[aria-label="Client"]'));
    // It lands somewhere you can see: the Details card is outlined for a moment.
    expect(document.body.querySelector('section[aria-label="Details"]')!.className).toContain('ring-2');
  });

  it("doesn't offer Add client on a project that has one, even before the client's name has loaded", async () => {
    const { ClientService } = jest.requireMock('../../../services/ClientService');
    let finish: (c: unknown) => void = () => {};
    (ClientService.getById as jest.Mock).mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const { ProjectService } = jest.requireMock('../../../services/ProjectService');
    (ProjectService.getById as jest.Mock).mockImplementationOnce(async () => ({ ...project, client: undefined }));
    await render();
    expect(Array.from(document.body.querySelectorAll('button')).some((b) => b.textContent === 'Add client')).toBe(false);
    await act(async () => finish({ id: 'c1', name: 'Ann Miller' }));
    expect(document.body.querySelector('[data-testid="project-client-link"]')!.textContent).toBe('Ann Miller');
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
