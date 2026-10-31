import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: Array<Record<string, unknown>> = [];
const request = jest.fn(async (_e: string, kind: string, completionDate?: string) => {
  const row = { id: 's1', kind, name: kind === 'affidavit' ? 'Affidavit of Completion' : 'Change Order', number: 'AFF-1', status: 'sent', token: 'tok', createdAt: '2026-11-20T15:00:00Z', completionDate };
  rows = [row];
  return row;
});
jest.mock('../../../lib/api', () => ({
  signoffsAPI: { forEstimate: async () => rows, request: (e: string, k: string, d?: string) => request(e, k, d) },
}));
const copied: string[] = [];
jest.mock('../estimateActions', () => ({ copyText: async (t: string) => copied.push(t) }));

import { SignoffControls } from '../SignoffControls';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
async function render(props: Partial<React.ComponentProps<typeof SignoffControls>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<SignoffControls estimateId="e1" kind="affidavit" clientName="Ann Miller" {...props} />));
  await flush();
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = '';
  rows = [];
  copied.length = 0;
  jest.clearAllMocks();
});

describe('sending for signature', () => {
  it('sends the affidavit with its completion date and copies the link', async () => {
    await render();
    expect(document.body.textContent).toContain('Not sent yet');
    const date = document.body.querySelector('input[aria-label="Completion date"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-11-20');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Send for signature').click());
    await flush();
    expect(request).toHaveBeenCalledWith('e1', 'affidavit', '2026-11-20');
    expect(copied[0]).toMatch(/\/share\/signoff\/tok$/);
    expect(document.body.textContent).toContain('waiting for the signature');
    expect(button('Send again')).toBeDefined();
  });

  it("a change order waits until something has changed; a signed one shows who signed", async () => {
    await render({ kind: 'change_order', disabledReason: 'Change the line items first' });
    expect(button('Send for signature').disabled).toBe(true);
    expect(document.body.textContent).toContain('Change the line items first');
    document.body.innerHTML = '';
    rows = [{ id: 's2', kind: 'change_order', name: 'Change Order', status: 'signed', token: 't2', signerName: 'Ann Miller', signedAt: '2026-11-02T15:00:00Z', createdAt: '2026-11-01T15:00:00Z' }];
    await render({ kind: 'change_order' });
    expect(document.body.textContent).toMatch(/Signed by Ann Miller on Nov 2/);
    expect(button('Send')).toBeUndefined();
  });
});
