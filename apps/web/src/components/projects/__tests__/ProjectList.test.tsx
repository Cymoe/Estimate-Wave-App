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
jest.mock('../../../lib/api', () => ({
  industriesAPI: {
    forOrganization: jest.fn(async () => [{ id: 'roofing', slug: 'roofing', name: 'Roofing' }]),
    list: jest.fn(async () => []),
  },
  lineItemsAPI: {
    list: jest.fn(async () => [
      {
        _id: 'li1',
        name: 'Shingle Roof Package',
        description: 'Tear-off, underlayment and architectural shingles',
        is_package: true,
        is_active: true,
        red_line_price: 9000,
        cap_price: 12000,
        estimated_hours: 24,
        cost_code: { code: 'RF200', industry_id: 'roofing' },
      },
      { _id: 'li2', name: 'Nails', is_package: false, is_active: true, base_price: 10, cost_code: { industry_id: 'roofing' } },
    ]),
  },
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
          <Route path="/projects/:id" element={<p>project page</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  return container;
}

describe('ProjectList', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    create.mockClear();
    createEstimate.mockClear();
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

  const type = async (label: string, value: string) => {
    const el = document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
    if (!el) throw new Error(`No field "${label}"`);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('?new=1 opens the new project sheet; name, client, budget and dates create a planned project and open it', async () => {
    rows = [];
    await render('/projects?new=1');
    const sheet = document.body.querySelector('form[aria-label="New project"]');
    expect(sheet).toBeTruthy();
    expect(sheet?.textContent).not.toMatch(/Step 1|Lead|Quote/);
    await type('Project name', 'Miller roof');
    await select('new-project-client', 'c1');
    await type('Budget', '12000');
    await type('Start date', '2026-11-02');
    await type('Description', 'Tear-off and re-shingle');
    await click('Create project');
    expect(create).toHaveBeenCalledWith({
      organization_id: 'org1',
      name: 'Miller roof',
      description: 'Tear-off and re-shingle',
      client_id: 'c1',
      status: 'planned',
      start_date: '2026-11-02',
      end_date: undefined,
      budget: 12000,
      category: undefined,
    });
    expect(createEstimate).not.toHaveBeenCalled();
    // Then it opens the new project's page.
    expect(document.body.textContent).toContain('project page');
  });

  it('a price-book package template names the project, sets the budget and end date, and creates a draft estimate holding it', async () => {
    rows = [];
    await render('/projects?new=1');
    const options = Array.from(document.body.querySelectorAll('select#new-project-template option')).map((o) => o.textContent);
    expect(options).toContain('Shingle Roof Package · $12,000.00');
    expect(options).not.toContain(expect.stringContaining('Nails'));
    await type('Start date', '2026-11-02');
    await select('new-project-template', 'li1');
    await select('new-project-client', 'c1');
    expect((document.body.querySelector('[aria-label="Project name"]') as HTMLInputElement).value).toBe('Shingle Roof Package – Ann Miller');
    expect((document.body.querySelector('[aria-label="Budget"]') as HTMLInputElement).value).toBe('12000');
    expect(document.body.textContent).toContain('Creates a draft estimate with this package');
    await click('Create project');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Shingle Roof Package – Ann Miller',
        client_id: 'c1',
        budget: 12000,
        end_date: '2026-11-05',
        category: 'Roofing',
      }),
    );
    expect(createEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'p-new',
        client_id: 'c1',
        total_amount: 12000,
        items: [
          expect.objectContaining({
            product_id: 'li1',
            description: 'Shingle Roof Package',
            unit_price: 12000,
            red_line_price: 9000,
            cap_price: 12000,
          }),
        ],
      }),
    );
    expect(document.body.textContent).toContain('project page');
  });

  it('a project type template names the project after the kind of job and its client', async () => {
    rows = [];
    await render('/projects?new=1');
    await select('new-project-template', 'roofing:Roof Replacement');
    expect((document.body.querySelector('[aria-label="Project name"]') as HTMLInputElement).value).toBe('Roof Replacement');
    await type('Project name', 'The Miller place');
    await select('new-project-client', 'c1');
    // A name the owner typed stays.
    expect((document.body.querySelector('[aria-label="Project name"]') as HTMLInputElement).value).toBe('The Miller place');
    await click('Create project');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'The Miller place', category: 'Roof Replacement', budget: undefined }));
    expect(createEstimate).not.toHaveBeenCalled();
  });

  it('a project needs a name, and the sheet says so instead of creating it', async () => {
    rows = [];
    await render('/projects?new=1');
    await click('Create project');
    expect(create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Give the project a name first');
  });
});
