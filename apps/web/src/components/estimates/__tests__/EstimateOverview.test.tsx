import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let stored: Record<string, unknown> = {};
let cachedCopy: Record<string, unknown> | undefined;
let loadGate: Promise<void> | null = null;
const update = jest.fn();
const uploadDesign = jest.fn();
const approve = jest.fn();
const createProject = jest.fn(async (p: Record<string, unknown>) => ({ ...p, id: 'p9' }));
jest.mock('../../../services/ProjectService', () => ({
  ProjectService: {
    list: async () => [
      { id: 'p1', name: 'Garage', client_id: 'c9' },
      { id: 'p2', name: 'Bath remodel', client_id: 'c1', client: { name: 'Dan Shah' } },
    ],
    create: (p: Record<string, unknown>) => createProject(p),
  },
}));
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: {
    cached: () => cachedCopy,
    getById: async () => {
      if (loadGate) await loadGate;
      return stored;
    },
    update: async (id: string, changes: Record<string, unknown>) => {
      update(id, changes);
      if (changes.client_id === 'c2') stored = { ...stored, client_id: 'c2', client: { name: 'Priya Shah', email: 'priya@example.com' } };
      return stored;
    },
    uploadDesign: async (id: string, file: File) => {
      uploadDesign(id, file);
      stored = { ...stored, design: { url: 'https://files.example/plan.png', name: file.name, type: file.type } };
      return stored;
    },
    removeDesign: async () => stored,
    shareUrl: async () => 'https://app.example/share/estimate/tok123',
    updateStatus: async (id: string, status: string) => {
      update(id, { status });
      stored = { ...stored, status };
      return stored;
    },
    approve: async (id: string) => {
      approve(id);
      stored = { ...stored, status: 'accepted', approved_at: '2026-10-31T12:00:00Z', approved_by_name: 'Myles Webb', contract_locked_at: '2026-10-31T12:00:00Z' };
      return stored;
    },
  },
}));
const emailToClient = jest.fn<Promise<{ to: string; link: string }>, [string]>(async () => ({ to: 'dan@example.com', link: 'https://app.example/share/estimate/tok123' }));
jest.mock('../../../lib/api', () => ({
  estimatesAPI: { emailToClient: (id: string) => emailToClient(id) },
  organizationsAPI: { getById: async () => null },
  clientsAPI: { list: async () => [{ id: 'c2', name: 'Priya Shah' }, { id: 'c1', name: 'Dan Shah' }] },
}));
jest.mock('../CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../common/MapModal', () => ({ MapModal: () => null }));
jest.mock('../ContextualPricingSelector', () => ({ ContextualPricingSelector: () => null }));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { EstimateDetail } from '../EstimateDetail';

const base = {
  id: 'e1',
  estimate_number: 'EST-2026-523077',
  status: 'draft',
  total_amount: 3210993.5,
  subtotal: 3210993.5,
  created_at: '2026-10-09T12:00:00Z',
  issue_date: '2026-10-09',
  items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 3210993.5, total_price: 3210993.5 }],
};

async function openOverview() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <EstimateDetail estimateId="e1" onClose={() => {}} inDrawer />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  await act(async () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Overview')!.click());
  await act(async () => {});
}

describe('estimate overview', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    update.mockClear();
    uploadDesign.mockClear();
    approve.mockClear();
    createProject.mockClear();
  });

  const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

  it('a draft can be approved without a signature from the ⋯ menu, after confirming, and then says who approved it', async () => {
    stored = { ...base };
    await openOverview();
    await act(async () => (document.body.querySelector('button[aria-label="More actions"]') as HTMLButtonElement).click());
    window.confirm = jest.fn(() => true);
    await act(async () => button('Approve without signature')!.click());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Approve EST-2026-523077 without a signature?'));
    expect(approve).toHaveBeenCalledWith('e1');
    await act(async () => {});
    expect(document.body.textContent).toContain(`Approved ${new Date('2026-10-31T12:00:00Z').toLocaleDateString()} by Myles Webb · no client signature`);
    // Once accepted it can't be approved again.
    await act(async () => (document.body.querySelector('button[aria-label="More actions"]') as HTMLButtonElement).click());
    expect(button('Approve without signature')).toBeUndefined();
  });

  it('an estimate made first can be added to a project, this client’s listed first', async () => {
    stored = { ...base, client_id: 'c1', client: { name: 'Dan Shah' } };
    await openOverview();
    const card = () => document.body.querySelector('[data-testid="estimate-project"]')!;
    expect(card().textContent).toContain('Not part of a project yet.');
    await act(async () => button('Add to a project')!.click());
    await act(async () => {});
    const select = card().querySelector('select[aria-label="Add to project"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Pick a project', 'Bath remodel · Dan Shah', 'Garage']);
    await act(async () => {
      select.value = 'p2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledWith('e1', { project_id: 'p2' });
  });

  it('or starts a new project from the estimate', async () => {
    stored = { ...base, title: 'Kitchen remodel', client_id: 'c1', organization_id: 'org1' };
    await openOverview();
    await act(async () => button('Start a new project from it')!.click());
    await act(async () => {});
    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kitchen remodel', client_id: 'c1', status: 'planned', budget: 3210993.5, organization_id: 'org1' }));
    expect(update).toHaveBeenCalledWith('e1', { project_id: 'p9' });
  });

  it('on a project, shows it and can move it off again', async () => {
    stored = { ...base, project_id: 'p2', project: { id: 'p2', name: 'Bath remodel' } };
    await openOverview();
    const card = document.body.querySelector('[data-testid="estimate-project"]')!;
    expect(card.textContent).toContain('Bath remodel');
    await act(async () => button('Change')!.click());
    await act(async () => {});
    const select = card.querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Not part of a project');
    await act(async () => {
      select.value = '__none';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledWith('e1', { project_id: '' });
  });

  it('summarises the estimate without repeating the status', async () => {
    stored = { ...base };
    await openOverview();
    const text = document.body.textContent ?? '';
    expect(text).toContain('$3,210,993.50');
    expect(text).toContain('Items1');
    expect(text).not.toContain('Estimate Summary');
  });

  it('lets you choose a client when there is none', async () => {
    stored = { ...base };
    await openOverview();
    const select = document.body.querySelector('select[aria-label="Choose client"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Choose client', 'Dan Shah', 'Priya Shah']);
    await act(async () => {
      select.value = 'c2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});
    expect(update).toHaveBeenCalledWith('e1', { client_id: 'c2' });
    expect(document.body.textContent).toContain('priya@example.com');
    expect(document.body.querySelector('select[aria-label="Choose client"]')).toBeNull();
  });

  it('uploads the agreed design and shows it', async () => {
    stored = { ...base };
    await openOverview();
    const input = document.body.querySelector('[data-testid="design-file"]') as HTMLInputElement;
    const file = new File(['x'], 'plan.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => {});
    expect(uploadDesign).toHaveBeenCalledWith('e1', file);
    expect((document.body.querySelector('img[alt="plan.png"]') as HTMLImageElement).src).toBe('https://files.example/plan.png');
  });

  it('refuses files that are not images or PDFs', async () => {
    stored = { ...base };
    await openOverview();
    const input = document.body.querySelector('[data-testid="design-file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.txt', { type: 'text/plain' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(uploadDesign).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Choose an image (PNG, JPG) or a PDF.');
  });

  it('Send shares the client link and marks a draft sent', async () => {
    stored = { ...base, client: { name: 'Dan Shah', email: 'dan@example.com' } };
    const share = jest.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await openOverview();
    const send = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')!;
    await act(async () => send.click());
    await act(async () => {});
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://app.example/share/estimate/tok123' }));
    expect(update).toHaveBeenCalledWith('e1', { status: 'sent' });
    delete (navigator as { share?: unknown }).share;
  });

  it("Share can email the link to the client from Webb Leads", async () => {
    stored = { ...base, client: { name: 'Dan Shah', email: 'dan@example.com' } };
    await openOverview();
    await act(async () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Share')!.click());
    const email = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Email it to dan@example.com')!;
    await act(async () => email.click());
    await act(async () => {});
    expect(emailToClient).toHaveBeenCalledWith('e1');
    expect(document.body.querySelector('[role="dialog"] [role="status"]')!.textContent).toBe('Emailed to dan@example.com. Replies come to you.');
  });

  it('opens at once from the estimate already loaded, then shows the latest copy', async () => {
    cachedCopy = { ...base, total_amount: 100, subtotal: 100, items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 100, total_price: 100 }] };
    stored = { ...base, total_amount: 250, subtotal: 250, items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 250, total_price: 250 }] };
    let release: () => void = () => {};
    loadGate = new Promise((resolve) => (release = resolve));
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter>
          <EstimateDetail estimateId="e1" onClose={() => {}} inDrawer />
        </MemoryRouter>,
      ),
    );
    // Drawn straight away from the known copy, with no loading skeleton.
    expect(document.body.textContent).toContain('EST-2026-523077');
    expect(document.body.textContent).toContain('Vanity');
    expect(document.body.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.body.textContent).toContain('$100.00');

    await act(async () => release());
    await act(async () => {});
    expect(document.body.textContent).toContain('$250.00');
    cachedCopy = undefined;
    loadGate = null;
  });
});

