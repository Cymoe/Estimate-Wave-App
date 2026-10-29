import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: Record<string, unknown> | null = null;
const sign = jest.fn(async (_t: string, signerName: string, signature: string) => {
  view = { ...view, status: 'signed', signerName, signature, signedAt: '2026-11-02T15:00:00Z' };
});
jest.mock('../../lib/api', () => ({
  signoffsAPI: {
    get: async () => view,
    sign: (t: string, n: string, s: string, a?: boolean) => sign(t, n, s, a as never),
    setLanguage: (t: string, l: string) => setLanguage(t, l),
  },
}));
const setLanguage = jest.fn(async () => {});
jest.mock('../../components/contracts/SignaturePad', () => ({
  SignaturePad: ({ onChange }: { onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange('data:image/png;base64,SIG')}>
      draw
    </button>
  ),
}));

import { SignoffPage } from '../SignoffPage';

const changeOrder = {
  kind: 'change_order',
  name: 'Change Order',
  number: 'CO-2026-000101',
  status: 'sent',
  estimateNumber: 'EST-2026-000001',
  title: 'Roof',
  clientName: 'Ann Miller',
  company: { name: 'Peak Roofing', phone: '432-555-0100' },
  changes: [
    { description: 'Shingles', before: 8000, after: 8500 },
    { description: 'Skylight', after: 1200 },
    { description: 'Gutters', before: 2000 },
  ],
  previousTotal: 10000,
  newTotal: 9700,
  difference: -300,
  contractTotal: 10000,
  document: { name: 'Change Order', source: 'tolliver' },
};

const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.startsWith(text)) as HTMLButtonElement;
async function open(path = '/share/signoff/abc') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share/signoff/:token" element={<SignoffPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  jest.clearAllMocks();
});

describe('client signoff page', () => {
  it('shows what changed and the new total, and signs with their name', async () => {
    view = { ...changeOrder };
    await open();
    const body = document.body.querySelector('[data-testid="signoff-body"]')!.textContent;
    expect(body).toContain('Shingles$8,000.00$8,500.00');
    expect(body).toContain('Skylight · added$1,200.00');
    expect(body).toContain('Gutters · removed-$2,000.00');
    expect(body).toContain('New contract total$9,700.00');
    expect((document.body.querySelector('input[aria-label="Your name"]') as HTMLInputElement).value).toBe('Ann Miller');
    expect(button('Sign change order').disabled).toBe(true);
    await act(async () => button('draw').click());
    await act(async () => button('Sign change order').click());
    await act(async () => {});
    expect(sign).toHaveBeenCalledWith('abc', 'Ann Miller', 'data:image/png;base64,SIG', undefined);
    expect(document.body.querySelector('[data-testid="signoff-record"]')!.textContent).toContain('Signed by Ann Miller');
  });

  it("once signed, the company's PDF can be downloaded with its signature page", async () => {
    view = {
      ...changeOrder,
      status: 'signed',
      signerName: 'Ann Miller',
      signedAt: '2026-11-02T15:00:00Z',
      document: { name: 'Peak Change Order', source: 'upload', fileName: 'co.pdf', url: 'https://files/co.pdf', signedUrl: 'https://files/co-signed.pdf' },
    };
    await open();
    const link = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === 'Download with signature');
    expect(link?.getAttribute('href')).toBe('https://files/co-signed.pdf');
  });

  it("the affidavit states the completion and what's paid, and the company's PDF must be ticked as read", async () => {
    view = {
      ...changeOrder,
      kind: 'affidavit',
      name: 'Affidavit of Completion',
      number: 'AFF-2026-1',
      completionDate: '2026-11-20',
      paid: 9700,
      contractTotal: 9700,
      propertyAddress: '1201 Elm St, Midland',
      document: { name: 'Peak Lien Release', source: 'upload', url: 'https://files/lien.pdf' },
    };
    await open();
    expect(document.body.textContent).toContain('at 1201 Elm St, Midland was completed by Peak Roofing on November 20, 2026, for a contract total of $9,700.00, of which $9,700.00 has been paid');
    expect(document.body.querySelector('a[href="https://files/lien.pdf"]')).not.toBeNull();
    await act(async () => button('draw').click());
    expect(button('Sign affidavit').disabled).toBe(true);
    await act(async () => (document.body.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(button('Sign affidavit').disabled).toBe(false);
  });

  it('says so when the link is withdrawn or not valid', async () => {
    view = { ...changeOrder, status: 'cancelled' };
    await open();
    expect(document.body.textContent).toContain('Peak Roofing withdrew this.');
    document.body.innerHTML = '';
    view = null;
    await open();
    expect(document.body.textContent).toContain("This link isn’t valid.");
  });

  it('reads in Spanish from a ?lang=es link, names the document in Spanish, and remembers a flip to English', async () => {
    view = { ...changeOrder };
    await open('/share/signoff/abc?lang=es');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Orden de cambio');
    expect(text).toContain('CO-2026-000101 · del presupuesto EST-2026-000001');
    expect(text).toContain('Skylight · agregado$1,200.00');
    expect(text).toContain('Nuevo total del contrato$9,700.00');
    expect(button('Firmar orden de cambio')).toBeTruthy();
    await act(async () => button('draw').click());
    await act(async () => button('Firmar orden de cambio').click());
    await act(async () => {});
    expect(document.body.querySelector('[data-testid="signoff-record"]')!.textContent).toContain('Firmado por Ann Miller el');
    await act(async () => button('English').click());
    expect(setLanguage).toHaveBeenCalledWith('abc', 'en');
  });

  it("the affidavit in the client's own language, with the date in Spanish", async () => {
    view = {
      ...changeOrder,
      kind: 'affidavit',
      name: 'Affidavit of Completion',
      number: 'AFF-2026-1',
      completionDate: '2026-11-20',
      paid: 9700,
      contractTotal: 9700,
      propertyAddress: '1201 Elm St, Midland',
      clientLanguage: 'es',
    };
    await open();
    expect(document.body.textContent).toContain('Declaración de finalización');
    expect(document.body.textContent).toContain(
      'Confirmo que el trabajo del presupuesto EST-2026-000001 en 1201 Elm St, Midland fue terminado por Peak Roofing el 20 de noviembre de 2026, por un total de contrato de $9,700.00, del cual se han pagado $9,700.00.',
    );
    expect(button('Firmar declaración de finalización')).toBeTruthy();
    view = null;
    document.body.innerHTML = '';
    await open('/share/signoff/abc?lang=es');
    expect(document.body.textContent).toContain('Este enlace no es válido.');
  });
});
