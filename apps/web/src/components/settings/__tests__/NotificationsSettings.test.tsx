import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getById = jest.fn(async (id: string) => ({ _id: id, name: 'Peak Roofing', email: 'office@peak.example' }));
const update = jest.fn(async (_id: string, data: Record<string, string>) => ({ _id: 'org1', ...data }));
const setMobile = jest.fn(async (mobile: string) => (mobile ? '+14325550177' : null));
jest.mock('../../../lib/api', () => ({
  organizationsAPI: { getById: (id: string) => getById(id), update: (id: string, data: Record<string, string>) => update(id, data) },
  usersAPI: { setMobile: (mobile: string) => setMobile(mobile) },
}));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', mobile: undefined } }) }));

import { NotificationsSettings } from '../NotificationsSettings';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('lead alert settings', () => {
  it('shows the company email, and saves the email and the mobile for texts', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<NotificationsSettings organizationId="org1" />));
    await flush();
    const email = container.querySelector('input[aria-label="Company email"]') as HTMLInputElement;
    const mobile = container.querySelector('input[aria-label="Your mobile"]') as HTMLInputElement;
    expect(email.value).toBe('office@peak.example');
    expect(mobile.value).toBe('');

    await type(email, 'leads@peak.example');
    await act(async () => email.form!.requestSubmit());
    await flush();
    expect(update).toHaveBeenCalledWith('org1', { email: 'leads@peak.example' });

    await type(mobile, '(432) 555-0177');
    await act(async () => mobile.form!.requestSubmit());
    await flush();
    expect(setMobile).toHaveBeenCalledWith('(432) 555-0177');
    expect(mobile.value).toBe('+14325550177');
    expect(container.textContent).toContain('Saved');
  });
});
