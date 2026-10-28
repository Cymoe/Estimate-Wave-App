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
  toProject: (doc: Record<string, unknown>) => ({ id: doc._id, name: doc.name, status: 'planned' }),
}));
jest.mock('../../../services/ClientService', () => ({
  ClientService: { list: jest.fn(async () => [{ id: 'c1', name: 'Ann Miller', phone: '432-555-0100' }]) },
}));
const createEstimate = jest.fn(async (e: Record<string, unknown>) => ({ ...e, id: 'e-new' }));
const startTemplate = jest.fn(async (_id: string, data: Record<string, unknown>) => ({
  project: { _id: 'p-new', name: data.name },
  estimateId: 'e-new',
}));
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: { getByProject: jest.fn(async () => []), create: (e: Record<string, unknown>) => createEstimate(e) },
}));
jest.mock('../../../lib/api', () => ({
  industriesAPI: {
    forOrganization: jest.fn(async () => [{ id: 'roofing', slug: 'roofing', name: 'Roofing' }]),
    list: jest.fn(async () => []),
  },
  templatesAPI: {
    list: jest.fn(async () => [
      {
        id: 'tpl1',
        name: 'Re-roof, 20 squares',
        description: 'Tear-off and architectural shingles',
        category: 'Roof Replacement',
        days: 5,
        total: 8100,
        itemCount: 2,
        taskCount: 3,
        usageCount: 1,
        updatedAt: '2026-10-01',
      },
    ]),
    start: (...args: unknown[]) => startTemplate(...(args as [string, Record<string, unknown>])),
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
    startTemplate.mockClear();
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

  it('a saved template names the project, fills budget, end date and description, and starts it with its lines and tasks', async () => {
    rows = [];
    await render('/projects?new=1');
    const options = Array.from(document.body.querySelectorAll('select#new-project-template option')).map((o) => o.textContent);
    expect(options).toContain('Re-roof, 20 squares · $8,100.00');
    await type('Start date', '2026-11-02');
    await select('new-project-template', 'tpl1');
    await select('new-project-client', 'c1');
    const value = (label: string) => (document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement).value;
    expect(value('Project name')).toBe('Re-roof, 20 squares – Ann Miller');
    expect(value('Budget')).toBe('8100');
    expect(value('End date')).toBe('2026-11-06');
    expect(value('Description')).toBe('Tear-off and architectural shingles');
    expect(document.body.textContent).toContain('2 estimate lines · 3 tasks · 5 days');
    expect(document.body.textContent).toContain('Creates the project, its draft estimate and its tasks.');
    await click('Create project');
    expect(startTemplate).toHaveBeenCalledWith('tpl1', {
      name: 'Re-roof, 20 squares – Ann Miller',
      clientId: 'c1',
      startDate: '2026-11-02',
      endDate: '2026-11-06',
      budget: 8100,
      description: 'Tear-off and architectural shingles',
    });
    expect(create).not.toHaveBeenCalled();
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
    expect(startTemplate).not.toHaveBeenCalled();
  });

  it('a project needs a name, and the sheet says so instead of creating it', async () => {
    rows = [];
    await render('/projects?new=1');
    await click('Create project');
    expect(create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Give the project a name first');
  });
});
