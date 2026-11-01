import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: Record<string, unknown> | null = null;
const pick = jest.fn<Promise<null>, [string, string, string, Record<string, unknown>]>(async () => null);
const setLanguage = jest.fn(async () => {});
jest.mock('../../lib/api', () => ({
  portalAPI: {
    get: async () => view,
    pick: (token: string, estimateId: string, itemId: string, chosen: Record<string, unknown>) => pick(token, estimateId, itemId, chosen),
    setLanguage: (token: string, language: string) => setLanguage(token, language),
  },
}));

import { PortalPage } from '../PortalPage';

const tile = {
  kind: 'selection',
  at: '2026-11-01T00:00:00Z',
  estimateId: 'e1',
  itemId: 'tile',
  description: 'Tile allowance',
  quantity: 300,
  allowanceUnitPrice: 4,
  allowanceTotal: 1200,
  pickBy: '2026-12-01',
};
const base = {
  client: { name: 'Ann Miller', language: 'en' },
  company: { name: 'Peak Builders', phone: '555-0100', email: 'hi@peak.example' },
  asks: [
    tile,
    { kind: 'estimate', at: '2026-10-01', number: 'EST-2', title: 'Deck', total: 5000, path: '/share/estimate/deck' },
    { kind: 'change_order', at: '2026-11-02', number: 'CO-1', title: 'Bathroom', difference: 70, path: '/share/signoff/co1' },
  ],
  jobs: [
    {
      key: 'p:1',
      name: 'Bathroom remodel',
      total: 3620,
      documents: [
        { kind: 'estimate', number: 'EST-1', signedAt: '2026-10-05T12:00:00Z', path: '/share/estimate/bath' },
        { kind: 'change_order', number: 'CO-0', signedAt: '2026-10-20T12:00:00Z', path: '/share/signoff/co0' },
      ],
      selections: [{ description: 'Faucet allowance', name: 'Delta Trinsic', url: 'https://lowes.com/pd/f' }],
    },
  ],
};

async function open(path = '/portal/tok') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/portal/:token" element={<PortalPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const type = async (label: string, value: string) => {
  const input = Array.from(document.body.querySelectorAll('[data-testid="pick-form"] label'))
    .find((l) => l.textContent?.includes(label))!
    .querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  jest.clearAllMocks();
});

describe('client portal', () => {
  it('leads with what needs them, then their jobs and signed documents', async () => {
    view = { ...base };
    await open();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Hi Ann');
    expect(text).toContain('Everything for your work with Peak Builders, in one place.');
    expect(document.body.querySelector('a[href="tel:555-0100"]')).not.toBeNull();

    const asks = document.body.querySelector('[data-testid="asks"]')!;
    expect(asks.querySelector('[data-testid="ask-selection"]')!.textContent).toContain('Pick: Tile allowance');
    expect(asks.textContent).toContain('$1,200.00 included · 300 × $4.00');
    expect(asks.textContent).toContain('Pick by Dec 1, 2026');
    const estimate = asks.querySelector('[data-testid="ask-estimate"] a')!;
    expect(estimate.textContent).toContain('Review and sign your estimate');
    expect(estimate.textContent).toContain('Deck · $5,000.00');
    expect(estimate.getAttribute('href')).toBe('/share/estimate/deck');
    expect(asks.querySelector('[data-testid="ask-change_order"]')!.textContent).toContain('Sign the changes to the work');
    expect(asks.querySelector('[data-testid="ask-change_order"]')!.textContent).toContain('Adds $70.00');

    const job = document.body.querySelector('[data-testid="job"]')!;
    expect(job.textContent).toContain('Bathroom remodel');
    expect(job.textContent).toContain('Agreed total $3,620.00');
    expect(job.textContent).toContain('Estimate & agreement EST-1');
    expect(job.textContent).toContain('Change order 1');
    expect(job.textContent).toContain('Signed Oct 20, 2026');
    expect(job.textContent).toContain('Faucet allowance:Delta Trinsic');
  });

  it('says so when nothing needs them', async () => {
    view = { ...base, asks: [], jobs: [] };
    await open();
    expect(document.body.textContent).toContain('Nothing needed from you right now.');
    expect(document.body.querySelector('[data-testid="jobs"]')).toBeNull();
  });

  it('sends a pick for what was asked, then shows it waiting for the company', async () => {
    view = { ...base };
    pick.mockImplementationOnce(async () => {
      view = { ...base, asks: [{ ...tile, pick: { url: 'https://homedepot.com/p/1', name: 'Marble', unitPrice: 5.4, status: 'picked' } }] };
      return null;
    });
    await open();
    await act(async () => button('Pick yours').click());
    await type('Link to the product', 'homedepot.com/p/1');
    await type('What is it?', 'Marble');
    await type('Price per unit', '$5.40');
    await act(async () => button('Send my pick').click());
    await act(async () => {});
    expect(pick).toHaveBeenCalledWith('tok', 'e1', 'tile', { url: 'homedepot.com/p/1', name: 'Marble', unitPrice: 5.4, note: undefined });
    const card = document.body.querySelector('[data-testid="ask-selection"]')!;
    expect(card.textContent).toContain('Marble');
    expect(card.textContent).toContain("$420.00 over what's included");
    expect(card.textContent).toContain('Sent: waiting for the company to confirm');
    expect(button('Change')).toBeTruthy();
  });

  it("reads in the client's language and says a refusal in it", async () => {
    view = { ...base, client: { name: 'Ana Ruiz', language: 'es' } };
    pick.mockImplementationOnce(async () => {
      const err = new Error("Paste the link to the product's page") as Error & { reason?: string };
      err.reason = 'selection_link';
      throw err;
    });
    await open();
    expect(document.body.textContent).toContain('Hola Ana');
    expect(document.body.textContent).toContain('Lo que necesitamos de ti');
    expect(document.body.textContent).toContain('Revisa y firma tu presupuesto');
    await act(async () => button('Elegir').click());
    await type('Enlace al producto', 'nope');
    await act(async () => button('Enviar mi selección').click());
    expect(document.body.textContent).toContain('Pega el enlace a la página del producto.');
    // Flipping to English is remembered on their record.
    await act(async () => button('English').click());
    expect(setLanguage).toHaveBeenCalledWith('tok', 'en');
  });

  it('says a turned-off link is no longer valid', async () => {
    view = null;
    await open();
    expect(document.body.textContent).toContain("This link isn't valid any more");
  });
});
