import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Doc = { id: string; kind: string; name: string; fileName: string; size: number; active: boolean; archived: boolean; signed: boolean; uploadedAt: string; url?: string };
let library: Doc[] = [];
let role = 'owner';
const useBuiltIn = jest.fn(async () => null);
let wording: Record<string, string> = {};
const setAgreement = jest.fn(async (_org: string, next: Record<string, string>) => {
  wording = Object.fromEntries(Object.entries(next).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v.trim()]));
  return wording;
});
const remove = jest.fn(async () => ({ archived: true }));
const upload = jest.fn(async (_org: string, kind: string, file: File) => {
  library = [
    { id: 'd9', kind, name: file.name.replace(/\.pdf$/, ''), fileName: file.name, size: file.size, active: true, archived: false, signed: false, uploadedAt: '2026-10-26T12:00:00Z', url: 'https://files/d9' },
    ...library.map((d) => (d.kind === kind && kind !== 'attachment' ? { ...d, active: false } : d)),
  ];
  return 'd9';
});

jest.mock('../../../lib/api', () => ({
  contractDocsAPI: {
    list: async () => library,
    useBuiltIn: (org: string, kind: string) => useBuiltIn(org, kind),
    remove: (id: string) => remove(id),
  },
  organizationsAPI: {
    myRole: async () => role,
    getById: async () => ({ id: 'o1', name: 'Basin Builders', agreement: wording }),
    setAgreement: (org: string, next: Record<string, string>) => setAgreement(org, next),
  },
}));
jest.mock('../../../services/ContractDocsService', () => ({
  uploadContractDoc: (org: string, kind: string, file: File) => upload(org, kind, file),
}));

import { ContractsSettings } from '../ContractsSettings';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const slot = (kind: string) => document.body.querySelector(`[data-testid="slot-${kind}"]`)!;
const buttonIn = (el: Element, text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<ContractsSettings organizationId="o1" />));
  await flush();
}

function choose(file: File) {
  const input = document.body.querySelector('[data-testid="contract-file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
  library = [];
  wording = {};
  role = 'owner';
  jest.clearAllMocks();
});

describe('Settings → Contracts', () => {
  it("starts on the built-in documents and uploads the company's agreement", async () => {
    await render();
    expect(slot('agreement').textContent).toContain('Built-in');
    expect(slot('agreement').textContent).toContain('The client signs it with the estimate');
    expect(slot('affidavit').textContent).toContain('Job complete sign-off');
    expect(slot('change_order').textContent).toContain('Changes to the work');
    expect(document.body.textContent).not.toContain('Affidavit');

    await act(async () => buttonIn(slot('agreement'), 'Upload your PDF')!.click());
    await act(async () => choose(new File(['%PDF'], 'Basin Agreement.pdf', { type: 'application/pdf' })));
    await flush();
    expect(upload).toHaveBeenCalledWith('o1', 'agreement', expect.any(File));
    expect(slot('agreement').textContent).toContain('Your PDF');
    expect(slot('agreement').textContent).toContain('Basin Agreement.pdf · uploaded Oct 26, 2026');
    expect(slot('agreement').querySelector('a')!.getAttribute('href')).toBe('https://files/d9');
    expect(document.body.textContent).toContain('Basin Agreement.pdf is uploaded.');

    await act(async () => buttonIn(slot('agreement'), 'Use the built-in instead')!.click());
    await flush();
    expect(useBuiltIn).toHaveBeenCalledWith('o1', 'agreement');
  });

  it('saves the wording the built-in agreement uses: payment terms, warranty and extra clauses', async () => {
    wording = { warranty: '2 years' };
    await render();
    const form = document.body.querySelector('form[aria-label="Agreement wording"]')!;
    const terms = form.querySelector('textarea[aria-label="Payment terms"]') as HTMLTextAreaElement;
    expect(terms.placeholder).toBe('50% deposit upon signing, 50% upon completion');
    expect((form.querySelector('input[aria-label="Workmanship warranty"]') as HTMLInputElement).value).toBe('2 years');
    const save = buttonIn(form, 'Save wording')!;
    expect(save.disabled).toBe(true); // nothing changed yet
    await act(async () => type(terms, '30% deposit, 70% on completion'));
    await act(async () => type(form.querySelector('textarea[aria-label="Additional terms"]') as HTMLTextAreaElement, 'Driveway access on work days.'));
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    await flush();
    expect(setAgreement).toHaveBeenCalledWith('o1', { paymentTerms: '30% deposit, 70% on completion', warranty: '2 years', extraTerms: 'Driveway access on work days.' });
    expect(document.body.textContent).toContain('Agreement wording saved.');
    expect(buttonIn(form, 'Save wording')!.disabled).toBe(true);
  });

  it('adds PDFs sent with every estimate and removes them; there are no earlier versions to manage', async () => {
    library = [
      { id: 'a1', kind: 'attachment', name: 'Warranty', fileName: 'Warranty.pdf', size: 10, active: true, archived: false, signed: true, uploadedAt: '2026-10-20T12:00:00Z', url: 'https://files/a1' },
      { id: 'g1', kind: 'agreement', name: 'Old agreement', fileName: 'Old agreement.pdf', size: 10, active: false, archived: false, signed: true, uploadedAt: '2026-09-01T12:00:00Z', url: 'https://files/g1' },
    ];
    await render();
    expect(document.body.querySelector('[data-testid="attachments"]')!.textContent).toContain('Warranty');
    await act(async () => (document.body.querySelector('button[aria-label="Remove Warranty"]') as HTMLButtonElement).click());
    await flush();
    expect(remove).toHaveBeenCalledWith('a1');
    expect(document.body.textContent).toContain('Warranty is removed; jobs that signed it keep it.');
    expect(document.body.textContent).not.toContain('earlier versions');
    expect(document.body.textContent).not.toContain('Old agreement');
  });

  it('is read-only for members', async () => {
    role = 'member';
    await render();
    expect(document.body.textContent).toContain('Ask an owner or admin of the company to change these.');
    expect(buttonIn(slot('agreement'), 'Upload')).toBeUndefined();
    expect(buttonIn(document.body, 'Add a PDF')).toBeUndefined();
    expect(buttonIn(document.body, 'Save wording')).toBeUndefined();
    expect((document.body.querySelector('textarea[aria-label="Payment terms"]') as HTMLTextAreaElement).disabled).toBe(true);
  });
});
