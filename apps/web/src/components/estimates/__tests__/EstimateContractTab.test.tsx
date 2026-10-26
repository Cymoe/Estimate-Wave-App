import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let extra: Record<string, unknown> = {};
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: {
    cached: () => undefined,
    getById: async () => ({
      ...extra,
      id: 'e1',
      estimate_number: 'EST-2026-000001',
      status: 'draft',
      total_amount: 100,
      subtotal: 100,
      created_at: '2026-10-08T12:00:00Z',
      issue_date: '2026-10-08',
      items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 100, total_price: 100 }],
      ...extra,
    }),
  },
}));
jest.mock('../../../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'order', 'limit']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { supabase: chain };
});
const tolliver = (kind: string, name: string) => ({ kind, source: 'tolliver', origin: 'tolliver', name });
const baseDocs = () => ({
  locked: false,
  agreement: tolliver('agreement', 'Service Contract Agreement'),
  affidavit: tolliver('affidavit', 'Affidavit of Completion'),
  changeOrder: tolliver('change_order', 'Change Order'),
  attachments: [] as unknown[],
  companyAttachments: [] as unknown[],
  companyDefaults: {} as Record<string, string>,
});
let docs: ReturnType<typeof baseDocs> = baseDocs();
const setContractDoc = jest.fn(async () => null);
const setAttachment = jest.fn(async () => null);
const removeDoc = jest.fn(async () => ({ archived: false }));
const uploadContractDoc = jest.fn(async () => 'd1');
jest.mock('../../../lib/api', () => ({
  organizationsAPI: { getById: async () => ({ name: 'Shah Builders', address: '9 Oak Ave', email: 'hi@shah.example' }) },
  clientsAPI: { list: async () => [] },
  estimatesAPI: {
    documents: async () => docs,
    setContractDoc: (...args: unknown[]) => setContractDoc(...(args as [])),
    setAttachment: (...args: unknown[]) => setAttachment(...(args as [])),
  },
  contractDocsAPI: { remove: (id: string) => removeDoc(id as never) },
}));
jest.mock('../../../services/ContractDocsService', () => ({
  uploadContractDoc: (...args: unknown[]) => uploadContractDoc(...(args as [])),
}));
jest.mock('../CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../common/MapModal', () => ({ MapModal: () => null }));
jest.mock('../DesignUpload', () => ({ DesignUpload: () => null }));
jest.mock('../ContextualPricingSelector', () => ({ ContextualPricingSelector: () => null }));
jest.mock('../../layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { EstimateDetail } from '../EstimateDetail';

let path = '';
const Where = () => {
  path = useLocation().pathname;
  return null;
};

const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.includes(text));

describe('estimate contract tab', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    extra = {};
    docs = baseDocs();
    jest.clearAllMocks();
  });

  async function openContractTab() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter initialEntries={['/estimates/e1']}>
          <Where />
          <Routes>
            <Route path="/estimates/:id" element={<EstimateDetail estimateId="e1" onClose={() => {}} inDrawer />} />
            <Route path="/estimates/:id/contract" element={<p>contract page</p>} />
            <Route path="/settings/organization" element={<p>settings page</p>} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
    await act(async () => buttons().find((b) => b.textContent === 'Contract')!.click());
    await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
  }

  it('lists the three documents, with no separate Contract button in the header', async () => {
    await openContractTab();
    expect(buttons().filter((b) => b.textContent === 'Contract')).toHaveLength(1); // only the tab
    expect(byText('Service Contract Agreement')).toBeTruthy();
    expect(byText('Affidavit of Completion')).toBeTruthy();
    expect(byText('Change Order')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Full Contract View');
    expect(document.body.textContent).not.toContain('LIEN RELEASE CERTIFICATE');
  });

  it('the service contract opens the full contract page', async () => {
    await openContractTab();
    await act(async () => byText('Service Contract Agreement')!.click());
    expect(path).toBe('/estimates/e1/contract');
  });

  it('the affidavit and change order expand inline, one at a time', async () => {
    await openContractTab();
    await act(async () => byText('Affidavit of Completion')!.click());
    expect(document.body.textContent).toContain('LIEN RELEASE CERTIFICATE');
    await act(async () => byText('Change Order')!.click());
    expect(document.body.textContent).toContain('SCOPE MODIFICATION CONTRACT');
    expect(document.body.textContent).not.toContain('LIEN RELEASE CERTIFICATE');
    await act(async () => byText('Change Order')!.click());
    expect(document.body.textContent).not.toContain('SCOPE MODIFICATION CONTRACT');
  });

  it('names the business on the affidavit, and has no change order before signing', async () => {
    await openContractTab();
    expect(document.body.textContent).toContain('Signed together with the estimate');
    await act(async () => byText('Affidavit of Completion')!.click());
    expect(document.body.textContent).toContain('Shah Builders');
    expect(document.body.textContent).not.toContain('Campos');
    await act(async () => byText('Change Order')!.click());
    expect(document.body.textContent).toContain('Change orders start once the estimate is accepted');
  });

  it('once signed, shows the date and what changed since as the change order', async () => {
    extra = {
      status: 'accepted',
      total_amount: 150,
      items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 150, total_price: 150 }],
      contract_locked_at: '2026-10-11T12:00:00Z',
      contract_snapshot: { items: [{ _id: 'i1', description: 'Vanity', totalPrice: 100 }], totalAmount: 100 },
    };
    await openContractTab();
    expect(document.body.textContent).toContain(`Signed ${new Date('2026-10-11T12:00:00Z').toLocaleDateString()}`);
    expect(document.body.textContent).toContain('1 change since signing');
    await act(async () => byText('Change Order')!.click());
    expect(document.body.textContent).toContain('$100.00 → $150.00');
    expect(document.body.textContent).toMatch(/Change Order Amount\$50\.00/);
  });

  it("tags each document Tolliver's until the company has its own, and points to Settings", async () => {
    await openContractTab();
    expect(Array.from(document.body.querySelectorAll('[data-testid="source-tag"]')).map((t) => t.textContent)).toEqual(['Tolliver', 'Tolliver', 'Tolliver']);
    expect(document.body.textContent).toContain("Using Tolliver’s documents. Have your own?");
    await act(async () => byText('Add them in Settings')!.click());
    expect(path).toBe('/settings/organization');
  });

  it("an uploaded agreement opens its PDF; Change swaps it for this job", async () => {
    docs.agreement = { kind: 'agreement', source: 'upload', origin: 'company', name: 'Shah Agreement', fileName: 'Shah Agreement.pdf', url: 'https://files/agreement' } as never;
    docs.companyDefaults = { agreement: 'Shah Agreement' };
    await openContractTab();
    const link = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent?.includes('Service Contract Agreement'))!;
    expect(link.getAttribute('href')).toBe('https://files/agreement');
    expect(link.textContent).toContain("Shah Agreement.pdf · the company's · signed with the estimate");
    expect(link.textContent).toContain('Your PDF');

    await act(async () => (document.body.querySelector('button[aria-label="Change agreement"]') as HTMLButtonElement).click());
    const menu = () => Array.from(document.body.querySelectorAll('[role="menu"] button')).map((b) => b.textContent);
    expect(menu()).toEqual(['Use Tolliver’s for this job', 'Upload a PDF for this job', 'Manage company contracts']);
    await act(async () => byText('Use Tolliver’s for this job')!.click());
    expect(setContractDoc).toHaveBeenCalledWith('e1', 'agreement', 'tolliver');

    // A job's own choice offers the company's back.
    docs.agreement = { kind: 'agreement', source: 'tolliver', origin: 'job', name: 'Service Contract Agreement' } as never;
    document.body.innerHTML = '';
    await openContractTab();
    await act(async () => (document.body.querySelector('button[aria-label="Change agreement"]') as HTMLButtonElement).click());
    expect(menu()[0]).toBe('Use the company’s (Shah Agreement)');
    await act(async () => byText('Use the company’s')!.click());
    expect(setContractDoc).toHaveBeenLastCalledWith('e1', 'agreement', null);
  });

  it('uploads a PDF for this job only, and turns company attachments on and off', async () => {
    docs.companyAttachments = [{ docId: 'w1', name: 'Warranty', included: true }];
    docs.attachments = [{ kind: 'attachment', source: 'upload', origin: 'job', name: 'HOA form', docId: 'h1', url: 'https://files/hoa' }];
    await openContractTab();
    const section = document.body.querySelector('[aria-label="Also sent with this estimate"]')!;
    expect(section.textContent).toContain('Warranty');
    expect(section.textContent).toContain('HOA form');
    const toggle = section.querySelector('input[aria-label="Send Warranty with this estimate"]') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await act(async () => toggle.click());
    expect(setAttachment).toHaveBeenCalledWith('e1', 'w1', false);
    await act(async () => (section.querySelector('button[aria-label="Remove HOA form"]') as HTMLButtonElement).click());
    expect(removeDoc).toHaveBeenCalledWith('h1');

    await act(async () => (document.body.querySelector('button[aria-label="Change affidavit"]') as HTMLButtonElement).click());
    await act(async () => byText('Upload a PDF for this job')!.click());
    const input = document.body.querySelector('[data-testid="job-contract-file"]') as HTMLInputElement;
    const file = new File(['%PDF'], 'Smith affidavit.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
    expect(uploadContractDoc).toHaveBeenCalledWith('org1', 'affidavit', file, 'e1');
    expect(document.body.textContent).toContain('Smith affidavit.pdf is added to this job.');
  });

  it('once signed, the documents show as signed and can no longer change', async () => {
    extra = { status: 'accepted', contract_locked_at: '2026-10-11T12:00:00Z', contract_snapshot: { items: [], totalAmount: 100 } };
    docs.locked = true;
    docs.agreement = { kind: 'agreement', source: 'upload', origin: 'signed', name: 'Shah Agreement', fileName: 'Shah Agreement.pdf', url: 'https://files/agreement' } as never;
    docs.attachments = [{ kind: 'attachment', source: 'upload', origin: 'signed', name: 'Warranty', docId: 'w1', url: 'https://files/w' }];
    await openContractTab();
    expect(document.body.textContent).toContain(`Signed ${new Date('2026-10-11T12:00:00Z').toLocaleDateString()} · Shah Agreement.pdf`);
    expect(document.body.querySelector('button[aria-label^="Change"]')).toBeNull();
    expect(byText('Add a PDF to this job')).toBeUndefined();
    expect(document.body.querySelector('[aria-label="Also sent with this estimate"]')!.textContent).toContain('Warranty');
  });
});
