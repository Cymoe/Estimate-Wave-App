import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: Record<string, unknown> | null = null;
const markOpened = jest.fn(async () => {});
const accept = jest.fn<Promise<void>, [string, string, boolean?]>(async (_token, signature) => {
  view = { ...view, status: 'accepted', clientSignature: signature, signedAt: '2026-10-11T12:00:00Z' };
});
const decline = jest.fn(async () => {
  view = { ...view, status: 'rejected' };
});
const setLanguage = jest.fn(async () => {});
jest.mock('../../../lib/api', () => ({
  publicEstimatesAPI: {
    get: async () => view,
    markOpened: (token: string) => markOpened(token),
    accept: (token: string, signature: string, agreed?: boolean) => accept(token, signature, agreed),
    decline: (token: string) => decline(token),
    setLanguage: (token: string, language: string) => setLanguage(token, language),
  },
}));

import { ShareableEstimate } from '../ShareableEstimate';

const sent = {
  estimateNumber: 'EST-2026-000001',
  status: 'sent',
  issueDate: '2026-10-08',
  items: [{ description: 'Vanity', quantity: 1, unitPrice: 900, totalPrice: 900 }],
  subtotal: 900,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 900,
  client: { name: 'Dan Shah' },
  business: { name: 'Shah Builders', phone: '555-0100' },
};

async function open(path = '/share/estimate/tok123') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share/estimate/:token" element={<ShareableEstimate />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

describe('client estimate page', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it('shows the estimate from its link and marks it opened', async () => {
    view = { ...sent };
    await open();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Shah Builders');
    expect(text).toContain('Prepared for Dan Shah');
    expect(text).toContain('$900.00');
    expect(markOpened).toHaveBeenCalledWith('tok123');
  });

  it('leads with totals by category; line items open on request', async () => {
    view = {
      ...sent,
      items: [
        { description: 'Paint walls', quantity: 100, unitPrice: 3, totalPrice: 300, category: 'Interior Painting' },
        { description: 'Paint ceilings', quantity: 50, unitPrice: 4, totalPrice: 200, category: 'Interior Painting' },
        { description: 'New outlet', quantity: 2, unitPrice: 150, totalPrice: 300, category: 'Electrical' },
        { description: 'Haul away', quantity: 1, unitPrice: 100, totalPrice: 100 },
      ],
      subtotal: 900,
      totalAmount: 900,
    };
    await open();
    const rows = Array.from(document.body.querySelectorAll('[data-testid="category-summary"] tbody tr')).map((r) => r.textContent);
    expect(rows).toEqual(['Electrical$300.00', 'Interior Painting$500.00', 'Other$100.00']);
    expect(document.body.textContent).not.toContain('Paint ceilings');
    await act(async () => button('Line item details (4)')!.click());
    expect(document.body.textContent).toContain('Paint ceilings');
  });

  it('shows the agreement terms above the one signature', async () => {
    view = {
      ...sent,
      agreement: { propertyAddress: '12 Elm St', startDate: '2026-11-02', paymentTerms: 'Net 15', warrantyPeriod: '1 year' },
    };
    await open();
    const agreement = document.body.querySelector('[data-testid="agreement"]')!;
    expect(agreement.textContent).toContain('12 Elm St');
    expect(agreement.textContent).toContain('Change Order Policy');
    expect(agreement.textContent).toContain('Shah Builders');
    expect(document.body.textContent).toContain('By signing, you accept this estimate and agree to the terms above.');
    expect(document.body.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('accepts with the drawn signature, then shows it accepted', async () => {
    view = { ...sent };
    await open();
    const canvas = document.body.querySelector('canvas') as HTMLCanvasElement;
    canvas.toDataURL = () => 'data:image/png;base64,sig';
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await act(async () => button('Accept & Sign')!.click());
    expect(accept).toHaveBeenCalledWith('tok123', 'data:image/png;base64,sig', undefined);
    expect(document.body.textContent).toContain('Accepted & Signed');
  });

  it('after signing, shows what is due with the company pay link and how to pay', async () => {
    view = {
      ...sent,
      status: 'accepted',
      clientSignature: 'data:image/png;base64,AAAA',
      signedAt: '2026-10-11T12:00:00Z',
      payments: {
        invoices: [{ number: 'INV-1', kind: 'deposit', description: 'Deposit (30%) for EST-2026-000001', total: 270, paid: 0, due: 270 }],
        contract: 900,
        invoiced: 270,
        paid: 0,
        due: 270,
        payLink: 'https://square.link/shah',
        instructions: 'Checks to Shah Builders LLC',
      },
    };
    await open();
    const card = document.body.querySelector('[data-testid="client-payments"]')!;
    expect(card.textContent).toContain('Payment due$270.00');
    expect(card.textContent).toContain('Deposit (30%) for EST-2026-000001INV-1$270.00');
    expect(card.querySelector('a')!.getAttribute('href')).toBe('https://square.link/shah');
    expect(card.querySelector('a')!.textContent).toBe('Pay $270.00');
    expect(card.textContent).toContain('Checks to Shah Builders LLC');
    expect(card.textContent).toContain('$0.00 paid of $900.00.');
  });

  it('can be declined', async () => {
    view = { ...sent };
    window.confirm = () => true;
    await open();
    await act(async () => button('Decline')!.click());
    expect(decline).toHaveBeenCalledWith('tok123');
    expect(document.body.textContent).toContain('You declined this estimate');
  });

  it('says so when the link is not valid', async () => {
    view = null;
    await open();
    expect(document.body.textContent).toContain('Estimate not found');
  });

  it("shows the company's own agreement and attachments, and signs only once they're confirmed read", async () => {
    view = {
      ...sent,
      documents: [
        { kind: 'agreement', source: 'upload', name: 'Shah Agreement', fileName: 'Shah Agreement.pdf', size: 20480, url: 'https://files/agreement' },
        { kind: 'attachment', source: 'upload', name: 'Warranty', fileName: 'Warranty.pdf', size: 4096, url: 'https://files/warranty' },
      ],
    };
    await open();
    const agreement = document.body.querySelector('[data-testid="agreement"]')!;
    const cards = Array.from(agreement.querySelectorAll('[data-testid="document-card"]'));
    expect(cards.map((c) => [c.textContent?.includes('Shah Agreement') || c.textContent?.includes('Warranty'), c.getAttribute('href')])).toEqual([
      [true, 'https://files/agreement'],
      [true, 'https://files/warranty'],
    ]);
    // Webb Leads' agreement wording isn't shown in place of theirs.
    expect(agreement.textContent).not.toContain('Change Order Policy');
    expect(agreement.textContent).toContain('This estimate and its price are part of the agreement.');

    const canvas = document.body.querySelector('canvas') as HTMLCanvasElement;
    canvas.toDataURL = () => 'data:image/png;base64,sig';
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(button('Accept & Sign')!.disabled).toBe(true);
    const tick = document.body.querySelector('input[aria-label="I\'ve read and agree to the attached documents"]') as HTMLInputElement;
    expect(tick.parentElement!.textContent).toContain('Shah Agreement, Warranty');
    await act(async () => tick.click());
    expect(button('Accept & Sign')!.disabled).toBe(false);

    // Once signed, the record shows the files and their fingerprints.
    accept.mockImplementationOnce(async (_t: string, signature: string) => {
      view = {
        ...view,
        status: 'accepted',
        clientSignature: signature,
        signedAt: '2026-10-11T12:00:00Z',
        acknowledgedAt: '2026-10-11T12:00:00Z',
        documents: (view!.documents as Array<Record<string, unknown>>).map((d, i) => ({ ...d, sha256: i ? 'bb22' : 'aa11' })),
      };
    });
    await act(async () => button('Accept & Sign')!.click());
    expect(accept).toHaveBeenCalledWith('tok123', 'data:image/png;base64,sig', true);
    const record = document.body.querySelector('[data-testid="signed-record"]')!;
    expect(record.textContent).toContain('Signed byDan Shah');
    expect(record.textContent).toContain('Read and agreed to');
    expect(record.textContent).toContain('Shah Agreement.pdf · 20 KB');
    expect(record.textContent).toContain('SHA-256 aa11');
    expect(record.textContent).toContain('SHA-256 bb22');
  });

  it('reads in Spanish from a ?lang=es link: the page, the agreement and the signing', async () => {
    view = { ...sent, agreement: { propertyAddress: '12 Elm St', paymentTerms: 'Net 15', warrantyPeriod: '1 year' } };
    await open('/share/estimate/tok123?lang=es');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Preparado para Dan Shah');
    expect(text).toContain('Pendiente de tu aprobación');
    expect(text).toContain('Al firmar, aceptas este presupuesto y los términos de arriba.');
    const agreement = document.body.querySelector('[data-testid="agreement"]')!;
    expect(agreement.textContent).toContain('Esta traducción al español se ofrece por conveniencia');
    expect(agreement.textContent).toContain('Política de órdenes de cambio');
    expect(agreement.textContent).toContain('12 Elm St');
    expect(agreement.textContent).not.toContain('Change Order Policy');
    expect(document.documentElement.lang).toBe('es');
    expect(button('Aceptar y firmar')).toBeTruthy();
    expect(button('Rechazar')).toBeTruthy();

    // Flipping to English is remembered on the client's record.
    await act(async () => button('English')!.click());
    expect(setLanguage).toHaveBeenCalledWith('tok123', 'en');
    expect(document.body.textContent).toContain('Prepared for Dan Shah');
  });

  it("opens in the client's language when the link says nothing, and says a refusal in it", async () => {
    view = { ...sent, client: { name: 'Ana Ruiz', language: 'es' } };
    accept.mockImplementationOnce(async () => {
      const err = new Error('This estimate can no longer be accepted') as Error & { reason?: string };
      err.reason = 'estimate_closed';
      throw err;
    });
    await open();
    expect(document.body.textContent).toContain('Preparado para Ana Ruiz');
    const canvas = document.body.querySelector('canvas') as HTMLCanvasElement;
    canvas.toDataURL = () => 'data:image/png;base64,sig';
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await act(async () => button('Aceptar y firmar')!.click());
    expect(document.body.textContent).toContain('Este presupuesto ya no se puede aceptar ni rechazar.');
  });

  it('says the link is not valid in Spanish too', async () => {
    view = null;
    await open('/share/estimate/tok123?lang=es');
    expect(document.body.textContent).toContain('Presupuesto no encontrado');
  });
});
