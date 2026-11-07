import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let state: Record<string, unknown> = {};
const setForEstimate = jest.fn(async (_id: string, on: boolean) => {
  state = { ...state, on };
});
jest.mock('../../../lib/api', () => ({
  followUpsAPI: { status: async () => state, setForEstimate: (id: string, on: boolean) => setForEstimate(id, on) },
}));

import { RemindersCard } from '../RemindersCard';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const card = () => document.body.querySelector('[data-testid="reminders"]');
async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<RemindersCard estimateId="e1" />));
  await flush();
}
const base = { companyOn: true, afterDays: 3, on: true, clientEmail: 'ann@example.com', sent: 0, max: 2, open: true, nextAt: '2026-10-29T15:00:00Z' };

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('estimate reminders', () => {
  it('says when the next reminder goes, and stops them for this client', async () => {
    state = { ...base };
    await render();
    expect(card()!.textContent).toMatch(/Next reminder to ann@example\.com around Oct 29 if they haven't signed\./);
    await act(async () => (card()!.querySelector('input[aria-label="Remind this client"]') as HTMLInputElement).click());
    await flush();
    expect(setForEstimate).toHaveBeenCalledWith('e1', false);
    expect(card()!.textContent).toContain('No reminders for this estimate.');
  });

  it('asks for an email when the client has none, and hides once signed', async () => {
    state = { ...base, clientEmail: undefined, nextAt: undefined };
    await render();
    expect(card()!.textContent).toContain('Add an email for this client to send reminders.');
    expect(card()!.querySelector('input')).toBeNull();
    document.body.innerHTML = '';
    state = { ...base, open: false };
    await render();
    expect(card()).toBeNull();
  });
});
