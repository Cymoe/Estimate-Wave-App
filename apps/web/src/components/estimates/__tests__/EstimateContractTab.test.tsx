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
const builtIn = (kind: string, name: string) => ({ kind, source: 'tolliver', origin: 'tolliver', name });
const baseDocs = () => ({
  locked: false,
  agreement: builtIn('agreement', 'Service Contract Agreement'),
  affidavit: builtIn('affidavit', 'Affidavit of Completion'),
  changeOrder: builtIn('change_order', 'Change Order'),
  attachments: [] as unknown[],
  companyAttachments: [] as unknown[],
  companyDefaults: {} as Record<string, string>,
});
let docs: ReturnType<typeof baseDocs> = baseDocs();
const setAttachment = jest.fn(async () => null);
const removeDoc = jest.fn<Promise<{ archived: boolean }>, [string]>(async () => ({ archived: false }));
const uploadContractDoc = jest.fn(async () => 'd1');
jest.mock('../../../lib/api', () => ({
  organizationsAPI: { getById: async () => ({ name: 'Shah Builders', address: '9 Oak Ave', email: 'hi@shah.example' }) },
  clientsAPI: { list: async () => [] },
  estimatesAPI: {
    documents: async () => docs,
    setAttachment: (...args: unknown[]) => setAttachment(...(args as [])),
  },
  contractDocsAPI: { remove: (id: string) => removeDoc(id) },
  signoffsAPI: { forEstimate: async () => [], request: async () => ({ token: 't', kind: 'change_order', name: 'Change order', number: 'CO-1' }) },
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

describe('estimate agreement tab', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    extra = {};
    docs = baseDocs();
    jest.clearAllMocks();
  });

  async function openTab() {
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
    await act(async () => buttons().find((b) => b.textContent === 'Agreement')!.click());
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
  }

  it('before signing, shows just the agreement and what is sent with it, in plain words', async () => {
    await openTab();
    expect(byText('Agreement')).toBeTruthy();
    expect(document.body.textContent).toContain('Filled in from this estimate · the client signs it with the estimate');
    expect(document.body.querySelector('[aria-label="Also sent with this estimate"]')).not.toBeNull();
    for (const gone of ['Affidavit', 'Change Order', 'LIEN', 'Changes to sign', 'Job complete sign-off', 'Signed record']) {
      expect(document.body.textContent).not.toContain(gone);
    }
    expect(document.body.querySelector('button[aria-label^="Change"]')).toBeNull();
    expect(Array.from(document.body.querySelectorAll('[data-testid="source-tag"]')).map((t) => t.textContent)).toEqual(['Built-in']);
    expect(document.body.textContent).toContain('Using the built-in agreement. Have your own contract?');
    await act(async () => byText('Upload it in Settings')!.click());
    expect(path).toBe('/settings/organization');
  });

  it('the built-in agreement opens the full agreement page', async () => {
    await openTab();
    await act(async () => byText('Filled in from this estimate')!.click()); // the row, not the tab
    expect(path).toBe('/estimates/e1/contract');
  });

  it("the company's own agreement PDF opens as a link, with nothing to swap", async () => {
    docs.agreement = { kind: 'agreement', source: 'upload', origin: 'company', name: 'Shah Agreement', fileName: 'Shah Agreement.pdf', url: 'https://files/agreement' } as never;
    await openTab();
    const link = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent?.includes('Agreement'))!;
    expect(link.getAttribute('href')).toBe('https://files/agreement');
    expect(link.textContent).toContain('Shah Agreement.pdf · the client signs it with the estimate');
    expect(link.textContent).toContain('Your PDF');
    expect(document.body.textContent).not.toContain('Using the built-in agreement');
  });

  it('adds a PDF to this job and turns the company ones on and off', async () => {
    docs.companyAttachments = [{ docId: 'w1', name: 'Warranty', included: true }];
    docs.attachments = [{ kind: 'attachment', source: 'upload', origin: 'job', name: 'HOA form', docId: 'h1', url: 'https://files/hoa' }];
    await openTab();
    const section = document.body.querySelector('[aria-label="Also sent with this estimate"]')!;
    expect(section.textContent).toContain('Warranty');
    expect(section.textContent).toContain('HOA form');
    const toggle = section.querySelector('input[aria-label="Send Warranty with this estimate"]') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await act(async () => toggle.click());
    expect(setAttachment).toHaveBeenCalledWith('e1', 'w1', false);
    await act(async () => (section.querySelector('button[aria-label="Remove HOA form"]') as HTMLButtonElement).click());
    expect(removeDoc).toHaveBeenCalledWith('h1');

    await act(async () => byText('Add a PDF to this job')!.click());
    const input = document.body.querySelector('[data-testid="job-contract-file"]') as HTMLInputElement;
    const file = new File(['%PDF'], 'Permit.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(uploadContractDoc).toHaveBeenCalledWith('org1', 'attachment', file, 'e1');
    expect(document.body.textContent).toContain('Permit.pdf is added to this job.');
  });

  it('once signed, shows the date, the signed record, and the two things a client signs later', async () => {
    extra = {
      status: 'accepted',
      total_amount: 150,
      items: [{ id: 'i1', description: 'Vanity', quantity: 1, unit_price: 150, total_price: 150 }],
      contract_locked_at: '2026-10-11T12:00:00Z',
      contract_snapshot: { items: [{ _id: 'i1', description: 'Vanity', totalPrice: 100 }], totalAmount: 100 },
    };
    docs.locked = true;
    docs.attachments = [{ kind: 'attachment', source: 'upload', origin: 'signed', name: 'Warranty', docId: 'w1', url: 'https://files/w' }];
    await openTab();
    expect(document.body.textContent).toContain(`Signed ${new Date('2026-10-11T12:00:00Z').toLocaleDateString()}`);
    const later = document.body.querySelector('[aria-label="After signing"]')!;
    expect(later.textContent).toContain('Changes to sign');
    expect(later.textContent).toContain('1 change to the line items since signing');
    expect(later.textContent).toContain('Job complete sign-off');
    expect(later.querySelector('[data-testid="signoff-change_order"]')!.textContent).toContain('Send for signature');
    expect(byText('Add a PDF to this job')).toBeUndefined();
    expect(document.body.querySelector('[aria-label="Also sent with this estimate"]')!.textContent).toContain('Warranty');
    await act(async () => byText('Signed record')!.click());
    expect(path).toBe('/estimates/e1/contract');
  });

  it('before signing, offers to approve it without a signature', async () => {
    await openTab();
    const prompt = document.body.querySelector('[data-testid="approve-without-signature"]')!;
    expect(prompt.textContent).toContain('Client agreed in person or on the phone?');
    expect(prompt.querySelector('button')!.textContent).toBe('Approve without signature');
  });

  it('approved without a signature: says who approved it instead of "Signed", and no approve prompt', async () => {
    extra = {
      status: 'accepted',
      contract_locked_at: '2026-10-31T12:00:00Z',
      approved_at: '2026-10-31T12:00:00Z',
      approved_by_name: 'Myles Webb',
      contract_snapshot: { items: [{ _id: 'i1', description: 'Vanity', totalPrice: 100 }], totalAmount: 100 },
    };
    docs.locked = true;
    await openTab();
    expect(document.body.textContent).toContain(`Approved ${new Date('2026-10-31T12:00:00Z').toLocaleDateString()} by Myles Webb · no client signature`);
    expect(document.body.querySelector('[data-testid="approve-without-signature"]')).toBeNull();
  });

  it('with nothing changed since signing, says so and holds the send button', async () => {
    extra = { status: 'accepted', contract_locked_at: '2026-10-11T12:00:00Z', contract_snapshot: { items: [{ _id: 'i1', description: 'Vanity', totalPrice: 100 }], totalAmount: 100 } };
    docs.locked = true;
    await openTab();
    const strip = document.body.querySelector('[data-testid="signoff-change_order"]')!;
    expect(strip.textContent).toContain('Nothing to send yet');
    expect((Array.from(strip.querySelectorAll('button')).find((b) => b.textContent?.includes('Send for signature')) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('Nothing has changed since signing.');
  });
});
