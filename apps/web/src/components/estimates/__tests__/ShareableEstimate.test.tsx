import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: Record<string, unknown> | null = null;
const mountedRoots: Root[] = [];
const markOpened = jest.fn(async () => {});
const accept = jest.fn(async (_token: string, signature: string) => {
  view = { ...view, status: 'accepted', clientSignature: signature, signedAt: '2026-10-11T12:00:00Z' };
});
const decline = jest.fn(async () => {
  view = { ...view, status: 'rejected' };
});
jest.mock('../../../lib/api', () => ({
  publicEstimatesAPI: {
    get: async () => view,
    markOpened: (token: string) => markOpened(token),
    accept: (token: string, signature: string) => accept(token, signature),
    decline: (token: string) => decline(token),
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

async function open() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/share/estimate/tok123']}>
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
  beforeEach(() => {
    window.history.scrollRestoration = 'auto';
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => { mountedRoots.splice(0).forEach(root => root.unmount()); });
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('starts at the top after data loads and resets restored page positions', async () => {
    view = { ...sent };
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    appRoot.scrollTop = 300;
    document.body.appendChild(appRoot);
    await open();
    expect(window.history.scrollRestoration).toBe('manual');
    expect(appRoot.scrollTop).toBe(0);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' });
    appRoot.scrollTop = 400;
    window.dispatchEvent(new Event('pageshow'));
    expect(appRoot.scrollTop).toBe(0);
    act(() => { mountedRoots.splice(0).forEach(root => root.unmount()); });
    expect(window.history.scrollRestoration).toBe('auto');
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
    await act(async () => button('Draw signature')!.click());
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(button('Accept & sign')).toBeUndefined();
    await act(async () => (document.body.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    await act(async () => button('Accept & sign')!.click());
    expect(accept).toHaveBeenCalledWith('tok123', 'data:image/png;base64,sig');
    expect(document.body.textContent).toContain('Accepted & Signed');
    expect(document.body.querySelector('[aria-controls="estimate-signature"]')).toBeNull();
  });

  it('allows swiping over the signature box until drawing is explicitly enabled', async () => {
    view = { ...sent };
    await open();
    const canvas = document.body.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.classList.contains('touch-pan-y')).toBe(true);
    const swipeStart = new Event('touchstart', { bubbles: true, cancelable: true });
    await act(async () => { canvas.dispatchEvent(swipeStart); });
    expect(swipeStart.defaultPrevented).toBe(false);
    await act(async () => button('Draw signature')!.click());
    expect(canvas.classList.contains('touch-none')).toBe(true);
    await act(async () => button('Done drawing')!.click());
    expect(canvas.classList.contains('touch-pan-y')).toBe(true);
    expect(accept).not.toHaveBeenCalled();
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
});
