import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let data: unknown = null;
const update = jest.fn<Promise<void>, [string, boolean, number | undefined]>(async () => undefined);
const disconnect = jest.fn<Promise<void>, [string]>(async () => undefined);
jest.mock('../../../lib/api', () => ({
  assistantsAPI: {
    connections: async () => data,
    update: (id: string, spending: boolean, cap?: number) => update(id, spending, cap),
    disconnect: (id: string) => disconnect(id),
  },
}));

import { ConnectedAssistants } from '../ConnectedAssistants';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<ConnectedAssistants organizationId="org1" />));
  await flush();
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

const claude = {
  id: 'c1',
  app: 'claude',
  appName: 'Claude',
  connectedAt: '2026-10-25T12:00:00.000Z',
  spending: true,
  dailyCapCents: 25000,
  spentTodayCents: 4500,
};

describe('connected assistants', () => {
  it('lists each assistant with its limit, and changes it, turns buying off or disconnects', async () => {
    data = { canSpend: true, connections: [claude] };
    const page = await render();
    expect(page.textContent).toContain('Claude');
    expect(page.textContent).toContain('Can buy and bid, up to $250 a day ($45 spent today)');
    const cap = page.querySelector('#cap-c1') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cap, '100');
      cap.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Save limit')!.click());
    expect(update).toHaveBeenCalledWith('c1', true, 100);
    await act(async () => button('Turn off buying')!.click());
    expect(update).toHaveBeenLastCalledWith('c1', false, undefined);
    await act(async () => button('Disconnect')!.click());
    expect(disconnect).toHaveBeenCalledWith('c1');
  });

  it('a member sees what it can do but no buying controls; nothing connected says so', async () => {
    data = { canSpend: false, connections: [{ ...claude, spending: false, dailyCapCents: 0, spentTodayCents: 0 }] };
    const page = await render();
    expect(page.textContent).toContain('buying and bidding are off');
    expect(button('Turn on buying')).toBeUndefined();
    data = { canSpend: true, connections: [] };
    document.body.innerHTML = '';
    expect((await render()).textContent).toContain('No assistants connected to this company yet.');
  });
});
