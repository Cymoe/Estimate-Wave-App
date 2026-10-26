import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
const updateProject = jest.fn(async (_id: string, patch: Record<string, unknown>) => ({ ...project, ...patch, budget: Number(patch.budget ?? project.budget) }));

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
    getById: jest.fn(async () => ({ id: 'c1', name: 'Ann Miller', phone: '432-555-0100' })),
    list: jest.fn(async () => [{ id: 'c1', name: 'Ann Miller' }]),
  },
}));
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: {
    getByProject: jest.fn(async () => [{ id: 'e1', estimate_number: 'EST-1', status: 'accepted', total_amount: 3000 }]),
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
jest.mock('../../../lib/api', () => ({
  costCodesAPI: { list: jest.fn(async () => []) },
  industriesAPI: { forOrganization: jest.fn(async () => []) },
}));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { ProjectDetailsDrawer } from '../ProjectDetails';

const onClose = jest.fn();
const onSaved = jest.fn();

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailsDrawer projectId="p1" onClose={onClose} onSaved={onSaved} />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  return document.body;
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
    expect(Array.from(dialog.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(['Overview', 'Estimates1', 'Expenses2']);
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
    // The client's phone is one tap away.
    expect(dialog.querySelector('a[href="tel:4325550100"]')?.textContent).toBe('Call');
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
    expect(list.textContent).toContain('accepted');
    expect(list.textContent).toContain('$3,000.00');
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
