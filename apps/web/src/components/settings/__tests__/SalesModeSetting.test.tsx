import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let role = 'owner';
const setSalesMode = jest.fn(async (_id: string, on: boolean) => on);
jest.mock('../../../lib/api', () => ({
  organizationsAPI: {
    myRole: async () => role,
    setSalesMode: (id: string, on: boolean) => setSalesMode(id, on),
  },
}));

import { SalesModeSetting } from '../SalesModeSetting';

async function render(on: boolean, onChange = jest.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<SalesModeSetting organizationId="o1" on={on} onChange={onChange} />));
  await act(async () => {});
  return { onChange, toggle: () => document.body.querySelector('[role="switch"]') as HTMLButtonElement };
}

describe('Sales mode setting', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    setSalesMode.mockClear();
    role = 'owner';
  });

  it('is off to start, and an owner turns it on for the company', async () => {
    const { onChange, toggle } = await render(false);
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(document.body.textContent).toContain('Leave it off if you set your own prices.');
    await act(async () => toggle().click());
    expect(setSalesMode).toHaveBeenCalledWith('o1', true);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('members see it but cannot change it', async () => {
    role = 'member';
    const { toggle } = await render(true);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(toggle().disabled).toBe(true);
    expect(document.body.textContent).toContain('Ask an owner or admin');
  });
});
