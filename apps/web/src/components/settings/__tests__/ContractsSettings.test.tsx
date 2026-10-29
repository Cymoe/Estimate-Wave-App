import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Doc = { id: string; kind: string; name: string; fileName: string; size: number; active: boolean; archived: boolean; signed: boolean; uploadedAt: string; url?: string };
let library: Doc[] = [];
let role = 'owner';
const useBuiltIn = jest.fn(async () => null);
const setActive = jest.fn(async () => null);
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
    setActive: (id: string) => setActive(id),
    remove: (id: string) => remove(id),
  },
  organizationsAPI: { myRole: async () => role },
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

afterEach(() => {
  document.body.innerHTML = '';
  library = [];
  role = 'owner';
  jest.clearAllMocks();
});

describe('Settings → Contracts', () => {
  it("starts on the Webb Leads documents and uploads the company's agreement", async () => {
    await render();
    expect(slot('agreement').textContent).toContain('Webb Leads');
    expect(slot('agreement').textContent).toContain('Webb Leads built-in, filled in from each estimate');
    expect(slot('affidavit').textContent).toContain('Affidavit of Completion');

    await act(async () => buttonIn(slot('agreement'), 'Upload your PDF')!.click());
    await act(async () => choose(new File(['%PDF'], 'Basin Agreement.pdf', { type: 'application/pdf' })));
    await flush();
    expect(upload).toHaveBeenCalledWith('o1', 'agreement', expect.any(File));
    expect(slot('agreement').textContent).toContain('Your PDF');
    expect(slot('agreement').textContent).toContain('Basin Agreement.pdf · uploaded Oct 26, 2026');
    expect(slot('agreement').querySelector('a')!.getAttribute('href')).toBe('https://files/d9');
    expect(document.body.textContent).toContain('Basin Agreement.pdf is uploaded.');

    await act(async () => buttonIn(slot('agreement'), 'Use the Webb Leads built-in')!.click());
    await flush();
    expect(useBuiltIn).toHaveBeenCalledWith('o1', 'agreement');
  });

  it('adds always-included attachments, removes them, and brings back an earlier version', async () => {
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

    await act(async () => buttonIn(document.body, 'Show earlier versions')!.click());
    const earlier = document.body.querySelector('[data-testid="earlier"]')!;
    expect(earlier.textContent).toContain('Old agreement.pdf');
    expect(earlier.textContent).toContain('signed on jobs');
    await act(async () => buttonIn(earlier, 'Use this one')!.click());
    await flush();
    expect(setActive).toHaveBeenCalledWith('g1');
  });

  it('is read-only for members', async () => {
    role = 'member';
    await render();
    expect(document.body.textContent).toContain('Ask an owner or admin of the company to change these.');
    expect(buttonIn(slot('agreement'), 'Upload')).toBeUndefined();
    expect(buttonIn(document.body, 'Add a PDF')).toBeUndefined();
  });
});
