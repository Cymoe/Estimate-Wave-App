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

import { ProjectDetails, projectHealth } from '../ProjectDetails';

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  return container;
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

describe('ProjectDetails', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    createExpense.mockClear();
  });

  it('shows budget against spending, and adding an expense updates it', async () => {
    expenses = [
      { id: 'x1', description: 'Lumber', amount: 600, category: 'Materials', date: '2026-10-02', status: 'paid' },
      { id: 'x2', description: 'Nails', amount: 100, category: 'Materials', date: '2026-10-03', status: 'pending' },
    ];
    const container = await render();
    const text = () => container.textContent ?? '';
    expect(text()).toContain('Kitchen trim');
    expect(text()).toContain('Under Budget');
    expect(text()).toContain('70% of budget');
    expect(text()).toContain('$700.00');
    expect(text()).toContain('86%'); // paid share
    expect(text()).toContain('Accepted estimates');

    await click('Add Expense');
    const description = container.querySelector('input[aria-label="What did you pay for?"]') as HTMLInputElement;
    const amount = container.querySelector('input[aria-label="Amount"]') as HTMLInputElement;
    await act(async () => {
      type(description, 'Dumpster');
      type(amount, '450');
    });
    await click('Add Expense');
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org1', project_id: 'p1', description: 'Dumpster', amount: 450, status: 'pending' }),
    );
    await click('Overview');
    expect(text()).toContain('Over Budget');
    expect(text()).toContain('115% of budget');
  });

  it('edits the project from its page', async () => {
    expenses = [];
    await render();
    await click('Edit');
    const budget = document.body.querySelector('input[aria-label="Budget"]') as HTMLInputElement;
    expect(budget.value).toBe('1000');
    await act(async () => type(budget, '2500'));
    await act(async () => {
      budget.focus();
      budget.blur();
    });
    expect(updateProject).toHaveBeenCalledWith('p1', { budget: '2500' });
  });

  it('scores health from budget and schedule', () => {
    const base = { name: 'x', status: 'active' as const, budget: 1000, end_date: '2099-01-01' };
    expect(projectHealth(base, 500)).toBe(100);
    expect(projectHealth(base, 1100)).toBe(80); // 10% over costs 20
    expect(projectHealth({ ...base, end_date: '2020-01-01' }, 0)).toBe(80); // late
    expect(projectHealth({ ...base, end_date: '2020-01-01', status: 'completed' }, 0)).toBe(100);
  });
});
