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
const setClientDetail = jest.fn<Promise<null>, [string, string]>(async () => null);
jest.mock('../../../lib/api', () => ({
  estimatesAPI: {
    emailToClient: (id: string) => emailToClient(id),
    setClientDetail: (id: string, detail: string) => setClientDetail(id, detail),
  },
  organizationsAPI: { getById: async () => null },
  clientsAPI: { list: async () => [{ id: 'c2', name: 'Priya Shah' }, { id: 'c1', name: 'Dan Shah' }] },
}));
jest.mock('../CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../ContextualPricingSelector', () => ({ ContextualPricingSelector: () => <div data-testid="pricing-selector" /> }));
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
  await act(async () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Details')!.click());
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

  it('pins Add item just above the totals, opens the picker from it or with N, and not while typing', async () => {
    stored = { ...base };
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
    const add = document.body.querySelector('[data-testid="add-item-bar"]') as HTMLButtonElement;
    expect(add.textContent).toContain('Add item');
    // Its own row, with the totals right under it.
    expect(add.parentElement!.nextElementSibling!.textContent).toContain('1 item · Sum');
    const picker = () => document.body.querySelector('[data-testid="pricing-selector"]');
    expect(picker()).toBeNull();
    await act(async () => add.click());
    expect(picker()).not.toBeNull();
  });

  it('N on the Line Items tab opens the item picker, but not from a text field', async () => {
    stored = { ...base };
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
    const picker = () => document.body.querySelector('[data-testid="pricing-selector"]');
    const field = document.createElement('input');
    document.body.appendChild(field);
    await act(async () => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true })));
    expect(picker()).toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' })));
    expect(picker()).not.toBeNull();
  });

  it('an estimate with no client says so under its number, and its Details tab opens on the client picker', async () => {
    stored = { ...base, client: undefined, client_id: undefined };
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
    // The tab is named for what it holds (everything besides the lines and the agreement), not "Overview".
    expect(button('Details')).toBeDefined();
    expect(button('Overview')).toBeUndefined();
    const subline = document.body.querySelector('[data-testid="estimate-subline"]')!.textContent;
    expect(subline).toMatch(/^No client yet · Created .+ · \$3,210,993\.50$/);
    expect(button('Add client')).toBeUndefined();
    await act(async () => button('Details')!.click());
    // Client and Valid until come first, side by side.
    const first = document.body.querySelector('[data-testid="client-card"]')!.parentElement!;
    expect(first.textContent).toContain('Client');
    expect(first.querySelector('input[aria-label="Valid until"]')).not.toBeNull();
    expect(first.querySelector('select[aria-label="Choose client"]')).not.toBeNull();
  });

  it("doesn't offer Add client when the estimate has a client whose details aren't in yet", async () => {
    stored = { ...base, client_id: 'c1', client: undefined };
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
    expect(button('Add client')).toBeUndefined();
  });

  it('adds a discount ($ or %) with a label, shows what it takes off, shows a refusal, and removes it', async () => {
    stored = { ...base, subtotal: 1000, total_amount: 1000, items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 1000, total_price: 1000 }] };
    await openOverview();
    const card = () => document.body.querySelector('[data-testid="discount"]')!;
    const set = async (label: string, value: string) => {
      const input = card().querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const saveButton = () => Array.from(card().querySelectorAll('button')).find((b) => b.textContent === 'Save discount') as HTMLButtonElement;
    expect(saveButton().disabled).toBe(true);
    await act(async () => (Array.from(card().querySelectorAll('[role="radio"]')).find((b) => b.textContent === '%') as HTMLButtonElement).click());
    await set('Discount amount', '10');
    await set('Discount label', ' Fall special ');
    expect(card().textContent).toContain('Takes off $100.00 before tax.');
    stored = { ...stored, discount: { kind: 'percent', value: 10, label: 'Fall special' }, discount_amount: 100, total_amount: 900 };
    await act(async () => saveButton().click());
    expect(update).toHaveBeenLastCalledWith('e1', { discount: { kind: 'percent', value: 10, label: 'Fall special' } });
    expect(card().textContent).toContain('−$100.00');

    // The server's refusal (below red line) is shown as it says it.
    update.mockImplementationOnce(() => {
      throw new Error('That discount takes the price below red line. The most you can take off is $300.00.');
    });
    await set('Discount amount', '50');
    await act(async () => saveButton().click());
    expect(card().textContent).toContain('The most you can take off is $300.00.');

    stored = { ...stored, discount: undefined, discount_amount: undefined, total_amount: 1000 };
    await act(async () => (Array.from(card().querySelectorAll('button')).find((b) => b.textContent === 'Remove') as HTMLButtonElement).click());
    expect(update).toHaveBeenLastCalledWith('e1', { discount: null });
    expect(card().textContent).not.toContain('−$');
  });

  it('the note to the client saves when the box loses focus, only if it changed', async () => {
    stored = { ...base, client_message: 'Hi {first name}' };
    await openOverview();
    const box = document.body.querySelector('textarea[aria-label="Note to the client"]') as HTMLTextAreaElement;
    expect(box.value).toBe('Hi {first name}');
    await act(async () => box.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(update).not.toHaveBeenCalled();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, '  Hi {first name}, thanks for having us out!  ');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => box.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(update).toHaveBeenCalledWith('e1', { client_message: 'Hi {first name}, thanks for having us out!' });
    expect(document.body.querySelector('[data-testid="client-note"]')!.textContent).toContain('Saved');
  });

  it('chooses how much of the price the client sees, and goes back if saving fails', async () => {
    stored = { ...base };
    await openOverview();
    const card = () => document.body.querySelector('[data-testid="client-view"]')!;
    const choice = (label: string) => Array.from(card().querySelectorAll('[role="radio"]')).find((b) => b.textContent === label) as HTMLButtonElement;
    const checked = () => Array.from(card().querySelectorAll('[role="radio"][aria-checked="true"]')).map((b) => b.textContent);
    expect(checked()).toEqual(['Full detail']);
    expect(card().textContent).toContain('every line with its price');
    await act(async () => choice('Lines, no prices').click());
    expect(setClientDetail).toHaveBeenLastCalledWith('e1', 'lines');
    expect(checked()).toEqual(['Lines, no prices']);
    expect(card().textContent).toContain('but not what each line costs');
    // Tapping the one already chosen saves nothing.
    await act(async () => choice('Lines, no prices').click());
    expect(setClientDetail).toHaveBeenCalledTimes(1);
    setClientDetail.mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => choice('Category totals').click());
    expect(setClientDetail).toHaveBeenLastCalledWith('e1', 'categories');
    expect(checked()).toEqual(['Lines, no prices']);
    expect(document.body.querySelector('[role="alert"]')!.textContent).toContain("Couldn't save that change");
    (console.error as jest.Mock).mockRestore();
  });

  it('a draft can be approved without a signature from the ⋯ menu, after confirming, and then says who approved it', async () => {
    stored = { ...base };
    await openOverview();
    await act(async () => (document.body.querySelector('button[aria-label="More actions"]') as HTMLButtonElement).click());
    window.confirm = jest.fn(() => true);
    await act(async () => button('Approve without signature')!.click());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Approve EST-2026-523077 without a signature?'));
    expect(approve).toHaveBeenCalledWith('e1');
    await act(async () => {});
    expect(document.body.textContent).toContain('Approved Oct 31, 2026 by Myles Webb · no client signature');
    // Once accepted it can't be approved again.
    await act(async () => (document.body.querySelector('button[aria-label="More actions"]') as HTMLButtonElement).click());
    expect(button('Approve without signature')).toBeUndefined();
  });

  it('an estimate made first can be added to a project, this client’s listed first', async () => {
    stored = { ...base, client_id: 'c1', client: { name: 'Dan Shah' } };
    await openOverview();
    const card = () => document.body.querySelector('[data-testid="estimate-project"]')!;
    // A draft says what happens on its own; it can still go on a project now.
    expect(card().textContent).toContain('Becomes a project automatically when the client accepts.');
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
    await act(async () => button('Start one now')!.click());
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

  it('the line items show each line\'s category under its name', async () => {
    stored = { ...base, items: [{ ...base.items[0], category: 'Cabinets & Vanities' }] };
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
    expect(Array.from(document.body.querySelectorAll('[data-testid="item-category"]')).map((e) => e.textContent)).toEqual(['Cabinets & Vanities']);
  });

  it('saves a new Valid until date picked on the Details tab', async () => {
    stored = { ...base, expiry_date: '2026-12-01' };
    await openOverview();
    const input = document.body.querySelector('input[aria-label="Valid until"]') as HTMLInputElement;
    expect(input.value).toBe('2026-12-01');
    update.mockClear();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-12-15');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledWith('e1', { expiry_date: '2026-12-15' });
    expect(input.value).toBe('2026-12-15');
  });

  it('puts the total in the line under the number, and lays the Details tab out as flat sections', async () => {
    stored = { ...base };
    await openOverview();
    expect(document.body.querySelector('[data-testid="estimate-subline"]')!.textContent).toContain('$3,210,993.50');
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Items1');
    expect(text).not.toContain('Estimate Summary');
    // One section after another: client and valid until, the note, the discount, what the client sees, files.
    const order = ['client-card', 'client-note', 'discount', 'client-view', 'files'].map(
      (id) => document.body.querySelector(`[data-testid="${id}"]`)!,
    );
    for (let i = 1; i < order.length; i += 1)
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Files holds the job photos and the agreed design.
    const files = document.body.querySelector('[data-testid="files"]')!;
    expect(files.querySelector('[data-testid="job-photos"]')).not.toBeNull();
    expect(files.querySelector('[data-testid="agreed-design"]')).not.toBeNull();
    // A draft hasn't gone out, so there's nothing to remind about yet.
    expect(document.body.querySelector('[data-testid="reminders"]')).toBeNull();
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

