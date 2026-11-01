import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let preview: Record<string, unknown> = {};
const send = jest.fn(async () => ({ token: 'tok', picks: [{ description: 'Tile allowance', pickBy: '2026-12-01' }], changeOrders: 1 }));
const link = jest.fn(async () => 'newtok');
const turnOff = jest.fn(async () => null);
jest.mock('../../../lib/api', () => ({
  portalAPI: { preview: async () => preview, send: () => send(), link: () => link(), turnOff: () => turnOff() },
  portalUrl: (t: string) => `https://app.example/portal/${t}`,
}));
const shared: Array<[string, string, string]> = [];
jest.mock('../../estimates/estimateActions', () => ({
  shareOrCopy: async (url: string, title: string, text: string) => (shared.push([url, title, text]), 'copied'),
}));

import { PortalPreviewSheet } from '../PortalPreviewSheet';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

const base = {
  client: { name: 'Ann Miller', language: 'en' },
  company: { name: 'Peak Builders' },
  jobs: [],
};
const queued = {
  ...base,
  token: 'tok',
  newCount: 2,
  asks: [
    {
      kind: 'selection',
      at: '2026-11-01',
      estimateId: 'e1',
      itemId: 'tile',
      description: 'Tile allowance',
      quantity: 1,
      allowanceUnitPrice: 1200,
      allowanceTotal: 1200,
      pickBy: '2026-12-01',
      isNew: true,
    },
    {
      kind: 'change_order',
      at: '2026-11-01',
      number: '',
      title: 'Kitchen',
      difference: 70,
      changes: [{ description: 'Faucet allowance', before: 350, after: 420 }],
      isNew: true,
    },
  ],
};

async function render() {
  const onClose = jest.fn();
  const onChanged = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<PortalPreviewSheet clientId="c1" onClose={onClose} onChanged={onChanged} />));
  await flush();
  return { onClose, onChanged };
}

afterEach(() => {
  document.body.innerHTML = '';
  shared.length = 0;
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('the portal preview', () => {
  it("shows the portal as the client will see it, with what's new marked and nothing usable", async () => {
    preview = queued;
    await render();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Preview: what Ann sees');
    expect(text).toContain('2 new, marked below. Nothing goes to Ann until you send.');
    expect(text).toContain('Hi Ann');
    expect(document.body.querySelectorAll('[data-testid="ask-selection"], [data-testid="ask-change_order"]')).toHaveLength(2);
    expect(document.body.querySelectorAll('[data-testid="new-ribbon"]')).toHaveLength(2);
    // The client's pick form shows as a note, not a form.
    expect(button('Pick yours')).toBeUndefined();
    expect(text).toContain('Your client picks here');
    // The change order not sent yet lists its changes.
    expect(document.body.querySelector('[data-testid="draft-changes"]')!.textContent).toContain('Faucet allowance$350.00$420.00');
  });

  it('sends what was waiting and hands over the link with a note saying what to do', async () => {
    preview = queued;
    const { onChanged } = await render();
    preview = { ...queued, newCount: 0, asks: [] };
    await act(async () => button('Send to Ann (2 new)').click());
    await flush();
    expect(send).toHaveBeenCalled();
    expect(shared[0]).toEqual([
      'https://app.example/portal/tok',
      'Your job page',
      'Hi Ann, please pick your tile by Dec 1 and sign the changes to the work here:',
    ]);
    expect(document.body.textContent).toContain('Link copied');
    expect(onChanged).toHaveBeenCalled();
    expect(button('Share link')).toBeDefined();
  });

  it('with nothing new, shares the link (made the first time); the link can be turned off', async () => {
    preview = { ...base, token: null, newCount: 0, asks: [] };
    await render();
    expect(document.body.textContent).toContain('Not shared yet.');
    await act(async () => button('Share link').click());
    await flush();
    expect(link).toHaveBeenCalled();
    expect(shared[0][0]).toBe('https://app.example/portal/newtok');
    expect(shared[0][2]).toBe("Hi Ann, here's your page with everything for your job:");

    document.body.innerHTML = '';
    preview = { ...base, token: 'tok', newCount: 0, asks: [] };
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    await act(async () => (document.body.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    await act(async () => button('Turn off link').click());
    await flush();
    expect(turnOff).toHaveBeenCalled();
  });

  it('closes with Esc', async () => {
    preview = queued;
    const { onClose } = await render();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalled();
  });
});
