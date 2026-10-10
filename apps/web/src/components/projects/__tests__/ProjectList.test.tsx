import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: Array<Record<string, unknown>> = [];
const create = jest.fn(async (p: Record<string, unknown>) => ({ ...p, id: 'p-new' }));
const update = jest.fn(async (id: string, patch: Record<string, unknown>) => ({
  ...rows.find((r) => r.id === id),
  ...patch,
}));
jest.mock('../../../services/ProjectService', () => ({
  ProjectService: {
    list: jest.fn(async () => rows),
    create: (p: Record<string, unknown>) => create(p),
    update: (id: string, patch: Record<string, unknown>) => update(id, patch),
    updateStatus: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('../../../services/ClientService', () => ({
  ClientService: { list: jest.fn(async () => [{ id: 'c1', name: 'Ann Miller', phone: '432-555-0100' }]) },
}));
const createEstimate = jest.fn(async (e: Record<string, unknown>) => ({ ...e, id: 'e-new' }));
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: { getByProject: jest.fn(async () => []), create: (e: Record<string, unknown>) => createEstimate(e) },
}));
const createLead = jest.fn(async () => ({}));
jest.mock('../../../lib/api', () => ({
  industriesAPI: {
    forOrganization: jest.fn(async () => [
      { id: 'roofing', slug: 'roofing', name: 'Roofing', icon: '🏠' },
      { id: 'mystery', slug: 'mystery', name: 'Mystery Trade' },
    ]),
    list: jest.fn(async () => []),
  },
  lineItemsAPI: {
    list: jest.fn(async () => [
      { _id: 'li1', name: 'Shingle Roof Package', is_package: true, is_active: true, red_line_price: 9000, cap_price: 12000, cost_code: { code: 'RF200', industry_id: 'roofing' } },
      { _id: 'li2', name: 'Nails', is_package: false, is_active: true, base_price: 10, cost_code: { industry_id: 'roofing' } },
    ]),
  },
  leadsAPI: { create: (...args: unknown[]) => createLead(...(args as [])) },
}));
jest.mock('../../clients/NewClientModal', () => ({ NewClientModal: () => null }));
jest.mock('../../../services/ProjectExportService', () => ({ ProjectExportService: {} }));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { ProjectList } from '../ProjectList';

const project = (n: number, name: string, status = 'active') => ({
  id: `p${n}`,
  name,
  status,
  budget: 1000 * n,
  start_date: '2026-10-09',
  client: { id: 'c1', name: 'Ann Miller' },
  client_id: 'c1',
});

async function render(path = '/projects') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<ProjectList />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  return container;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ProjectList', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    create.mockClear();
    createEstimate.mockClear();
    createLead.mockClear();
    update.mockClear();
  });

  it('shows projects as a table with search and status filter, and no create button', async () => {
    rows = [project(1, 'Kitchen trim'), project(2, 'Garage door', 'completed')];
    const container = await render();
    expect(container.querySelector('input[aria-label="Search projects"]')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toContain('Kitchen trim');
    expect(text).toContain('Ann Miller');
    expect(text).toContain('All Projects (2)');
    expect(text).not.toMatch(/New Project/);
  });

  const click = async (text: string) => {
    const button = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!button) throw new Error(`No button "${text}"`);
    await act(async () => button.click());
  };
  const select = async (label: string, value: string) => {
    const el = document.body.querySelector(`select#${label}`) as HTMLSelectElement;
    await act(async () => {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  it('+ Project opens the wizard: trade, type, package, details, then creates the project', async () => {
    rows = [];
    await render('/projects?new=1');
    expect(document.body.textContent).toContain('Step 1 of');
    await click('Roofing');
    await click('Roof Replacement');
    expect(document.body.textContent).toContain('Shingle Roof Package');
    expect(document.body.textContent).not.toContain('Nails');
    await click('Shingle Roof Package');
    expect((document.body.querySelector('#wizard-budget') as HTMLInputElement).value).toBe('12000');
    await select('wizard-client', 'c1');
    await click('Create Project');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Roof Replacement – Ann Miller', client_id: 'c1', budget: 12000, category: 'Roof Replacement', status: 'planned', organization_id: 'org1' }),
    );
    expect(document.body.textContent).toContain('Roof Replacement – Ann Miller');
  });

  it('a quote creates the project and a draft estimate holding the package', async () => {
    rows = [];
    await render('/projects?new=1');
    await click('Roofing');
    await click('Roof Repair');
    await click('Shingle Roof Package');
    await click('📋 Quote');
    await select('wizard-client', 'c1');
    await click('Create Project & Estimate');
    expect(createEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'p-new',
        client_id: 'c1',
        items: [expect.objectContaining({ description: 'Shingle Roof Package', unit_price: 12000, red_line_price: 9000, cap_price: 12000 })],
      }),
    );
  });

  it('a lead goes to the leads pipeline; a trade without types or packages skips straight to details', async () => {
    rows = [];
    await render('/projects?new=1');
    await click('Mystery Trade');
    expect(document.body.textContent).toContain('Project Details');
    await click('💡 Lead');
    await select('wizard-client', 'c1');
    await click('Add Lead');
    expect(createLead).toHaveBeenCalledWith('org1', expect.objectContaining({ name: 'Ann Miller', phone: '432-555-0100', jobType: 'mystery', status: 'new' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('opens a project at /projects/:id and saves a field when you leave it', async () => {
    rows = [project(1, 'Kitchen trim')];
    await render('/projects/p1');
    const budget = document.body.querySelector('input[aria-label="Budget"]') as HTMLInputElement;
    expect(budget.value).toBe('1000');
    await act(async () => type(budget, '2500'));
    await act(async () => {
      budget.focus();
      budget.blur();
    });
    expect(update).toHaveBeenCalledWith('p1', { budget: '2500' });
  });
});
