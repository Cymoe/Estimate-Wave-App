import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: Record<string, unknown> | null = null;
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
  await act(async () =>
    createRoot(container).render(
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
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('shows the estimate from its link and marks it opened', async () => {
    view = { ...sent };
    await open();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Shah Builders');
    expect(text).toContain('Prepared for Dan Shah');
    expect(text).toContain('Vanity');
    expect(text).toContain('$900.00');
    expect(markOpened).toHaveBeenCalledWith('tok123');
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
    await act(async () => button('Accept Estimate')!.click());
    expect(accept).toHaveBeenCalledWith('tok123', 'data:image/png;base64,sig');
    expect(document.body.textContent).toContain('Estimate Accepted');
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
