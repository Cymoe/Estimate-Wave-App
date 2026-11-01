import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: Record<string, unknown> | null = null;
const markOpened = jest.fn(async () => {});
const accept = jest.fn<Promise<void>, [string, string, boolean?]>(async (_token, signature) => {
  view = { ...view, status: 'accepted', clientSignature: signature, signedAt: '2026-10-11T12:00:00Z' };
});
const setLanguage = jest.fn(async () => {});
jest.mock('../../../lib/api', () => ({
  publicEstimatesAPI: {
    get: async () => view,
    markOpened: (token: string) => markOpened(token),
    accept: (token: string, signature: string, agreed?: boolean) => accept(token, signature, agreed),
    setLanguage: (token: string, language: string) => setLanguage(token, language),
  },
}));

// The pad itself is tested on its own; here it's a button that hands over a drawn signature.
jest.mock('../../contracts/SignaturePad', () => ({
  SignaturePad: ({ onChange, label }: { onChange: (v: string) => void; label: string }) => (
    <button type="button" aria-label={label} onClick={() => onChange('data:image/png;base64,sig')}>
      draw
    </button>
  ),
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
    // The lines are on the page for a saved or printed copy, but hidden on screen until opened.
    const details = () => document.body.querySelector('[data-testid="line-item-details"]')!;
    expect(details().textContent).toContain('Paint ceilings');
    expect(details().className).toContain('hidden print:block');
    await act(async () => button('Line item details (4)')!.click());
    expect(details().className).not.toContain('hidden');
    // The details break down under the same categories, in the same order, each with its total.
    const groups = Array.from(document.body.querySelectorAll('[data-testid="category-group"]')).map((g) =>
      Array.from(g.querySelectorAll('tr')).map((r) => r.textContent),
    );
    expect(groups).toEqual([
      ['Electrical$300.00', 'New outlet2$150.00$300.00'],
      ['Interior Painting$500.00', 'Paint walls100$3.00$300.00', 'Paint ceilings50$4.00$200.00'],
      ['Other$100.00', 'Haul away1$100.00$100.00'],
    ]);
  });

  it('with category totals only, shows the summary and no line item details', async () => {
    view = {
      ...sent,
      clientDetail: 'categories',
      items: [
        { description: 'Electrical', quantity: 1, unitPrice: 300, totalPrice: 300, category: 'Electrical' },
        { description: 'Interior Painting', quantity: 1, unitPrice: 500, totalPrice: 500, category: 'Interior Painting' },
      ],
      categoryTotals: [
        { category: 'Interior Painting', total: 500 },
        { category: 'Electrical', total: 300 },
      ],
      subtotal: 800,
      totalAmount: 800,
    };
    await open();
    const rows = Array.from(document.body.querySelectorAll('[data-testid="category-summary"] tbody tr')).map((r) => r.textContent);
    expect(rows).toEqual(['Electrical$300.00', 'Interior Painting$500.00']);
    expect(document.body.querySelector('[data-testid="line-item-details"]')).toBeNull();
    expect(button('Line item details (2)')).toBeUndefined();
  });

  it('with lines but no prices, lists every line under its category with only the category totals', async () => {
    view = {
      ...sent,
      clientDetail: 'lines',
      items: [
        { description: 'Paint walls', quantity: 100, category: 'Interior Painting' },
        { description: 'New outlet', quantity: 2, category: 'Electrical' },
        { description: 'Paint ceilings', quantity: 50, category: 'Interior Painting' },
      ],
      categoryTotals: [
        { category: 'Interior Painting', total: 500 },
        { category: 'Electrical', total: 300 },
      ],
      subtotal: 800,
      totalAmount: 800,
    };
    await open();
    const rows = Array.from(document.body.querySelectorAll('[data-testid="category-summary"] tbody tr')).map((r) => r.textContent);
    expect(rows).toEqual(['Electrical$300.00', 'Interior Painting$500.00']);
    await act(async () => button('Line item details (3)')!.click());
    const details = document.body.querySelector('[data-testid="line-item-details"]')!;
    expect(Array.from(details.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Description', 'Qty', 'Total']);
    const groups = Array.from(details.querySelectorAll('[data-testid="category-group"]')).map((g) =>
      Array.from(g.querySelectorAll('tr')).map((r) => r.textContent),
    );
    expect(groups).toEqual([
      ['Electrical$300.00', 'New outlet2'],
      ['Interior Painting$500.00', 'Paint walls100', 'Paint ceilings50'],
    ]);
    // The agreement's price table still has the category totals.
    expect(document.body.querySelector('[data-testid="agreement"]')!.textContent).toContain('$500.00');
  });

  it('shows the discount under the subtotal, before tax, in the summary and the details', async () => {
    view = { ...sent, subtotal: 900, discountAmount: 90, discountLabel: 'Fall special', taxRate: 10, taxAmount: 81, totalAmount: 891 };
    await open();
    const summary = document.body.querySelector('[data-testid="category-summary"] tfoot')!;
    expect(Array.from(summary.querySelectorAll('tr')).map((r) => r.textContent)).toEqual([
      'Subtotal$900.00',
      'Fall special−$90.00',
      'Tax (10%)$81.00',
      'Total$891.00',
    ]);
    await act(async () => button('Line item details (1)')!.click());
    expect(document.body.querySelector('[data-testid="line-item-details"] tfoot')!.textContent).toContain('Fall special:−$90.00');
    expect(document.body.querySelector('[data-testid="agreement-discount"]')!.textContent).toBe('Fall special−$90.00');
  });

  it("shows the company's note to the client, signed with the company name", async () => {
    view = { ...sent, clientMessage: 'Hi Dan, thanks for having us out!' };
    await open();
    expect(document.body.querySelector('[data-testid="client-message"]')!.textContent).toBe('Hi Dan, thanks for having us out!— Shah Builders');
  });

  it("shows the company's logo at the top when it has one", async () => {
    view = { ...sent, business: { name: 'Shah Builders', logoUrl: 'https://files.example/logo.png' } };
    await open();
    const logo = document.body.querySelector('[data-testid="company-logo"]') as HTMLImageElement;
    expect(logo.getAttribute('src')).toBe('https://files.example/logo.png');
    expect(logo.getAttribute('alt')).toBe('Shah Builders');
    view = { ...sent };
    document.body.innerHTML = '';
    await open();
    expect(document.body.querySelector('[data-testid="company-logo"]')).toBeNull();
  });

  it('Save as PDF and Print open the print screen, with the company and estimate as the file name; the signing box stays off the copy', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    view = { ...sent, business: { name: 'Shah Builders' } };
    await open();
    document.title = 'Webb Leads';
    let titleWhilePrinting = '';
    print.mockImplementation(() => {
      titleWhilePrinting = document.title;
    });
    await act(async () => button('Save as PDF')!.click());
    expect(print).toHaveBeenCalledTimes(1);
    expect(titleWhilePrinting).toBe('Shah Builders – Estimate & Agreement · EST-2026-000001');
    await act(async () => window.dispatchEvent(new Event('afterprint')));
    expect(document.title).toBe('Webb Leads');
    await act(async () => button('Print')!.click());
    expect(print).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-testid="keep-a-copy"]')!.className).toContain('print:hidden');
    expect(document.body.querySelector('[data-testid="sign-box"]')!.className).toContain('print:hidden');
    print.mockRestore();
  });

  it('shows the agreement terms above the one signature', async () => {
    view = {
      ...sent,
      agreement: { propertyAddress: '12 Elm St', startDate: '2026-11-02', paymentTerms: 'Net 15', warrantyPeriod: '1 year' },
    };
    await open();
    const agreement = document.body.querySelector('[data-testid="agreement"]')!;
    expect(agreement.textContent).toContain('12 Elm St');
    expect(agreement.textContent).toContain('CHANGE ORDERS');
    expect(agreement.textContent).toContain('Shah Builders');
    expect(document.body.textContent).toContain('By signing, you accept this estimate and agree to the terms above.');
    expect(document.body.querySelectorAll('button[aria-label="Your signature"]')).toHaveLength(1);
  });

  it('accepts with the drawn signature, then shows it accepted', async () => {
    view = { ...sent };
    await open();
    await act(async () => button('draw')!.click());
    await act(async () => button('Accept & Sign')!.click());
    expect(accept).toHaveBeenCalledWith('tok123', 'data:image/png;base64,sig', undefined);
    expect(document.body.textContent).toContain('Accepted & Signed');
  });

  it('accepted by the company without a signature: says so, with no signature or signing', async () => {
    view = { ...sent, status: 'accepted', approvedAt: '2026-10-31T12:00:00Z' };
    await open();
    const card = document.body.querySelector('[data-testid="accepted-without-signature"]')!;
    expect(card.textContent).toContain('Accepted');
    expect(card.textContent).toContain('Shah Builders marked this estimate accepted on');
    expect(document.body.querySelector('img[alt="Client signature"]')).toBeNull();
    expect(button('Accept & Sign')).toBeUndefined();
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
    expect(agreement.textContent).not.toContain('CHANGE ORDERS');
    expect(agreement.textContent).toContain('This estimate and its price are part of the agreement.');

    await act(async () => button('draw')!.click());
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
    expect(agreement.textContent).toContain('ÓRDENES DE CAMBIO');
    expect(agreement.textContent).toContain('12 Elm St');
    expect(agreement.textContent).not.toContain('CHANGE ORDERS');
    expect(document.documentElement.lang).toBe('es');
    expect(button('Aceptar y firmar')).toBeTruthy();
    expect(document.body.textContent).toContain('Al firmar, aceptas este presupuesto'); // and there is no Decline
    expect(button('Rechazar')).toBeUndefined();

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
    await act(async () => button('draw')!.click());
    await act(async () => button('Aceptar y firmar')!.click());
    expect(document.body.textContent).toContain('Este presupuesto ya no se puede aceptar ni rechazar.');
  });

  it('says the link is not valid in Spanish too', async () => {
    view = null;
    await open('/share/estimate/tok123?lang=es');
    expect(document.body.textContent).toContain('Presupuesto no encontrado');
  });

  it("links back to the client's portal when the company has made one", async () => {
    view = { ...sent };
    await open();
    expect(document.body.querySelector('[data-testid="portal-link"]')).toBeNull();
    document.body.innerHTML = '';
    view = { ...sent, portalToken: 'p123' };
    await open();
    const link = document.body.querySelector('[data-testid="portal-link"]')!;
    expect(link.getAttribute('href')).toBe('/portal/p123');
    expect(link.textContent).toContain('Everything for your work with Shah Builders');
  });

  it('is just the estimate: no selections to make on it', async () => {
    view = { ...sent, allowances: [{ itemId: 'tile', description: 'Tile allowance', quantity: 1, allowanceUnitPrice: 1200, allowanceTotal: 1200 }] };
    await open();
    expect(document.body.querySelector('[data-testid="allowance-picks"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Your selections');
  });
});
