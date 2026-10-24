import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let user: Record<string, unknown> = { id: 'u1', name: 'Val', email: 'va@fieldquote.example', role: 'staff', isStaff: true };
const signOut = jest.fn(async () => undefined);
const toggleTheme = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user, signOut }) }));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme }) }));
let payments: { playMoney: boolean } | undefined = { playMoney: false };
jest.mock('../../../lib/live', () => ({ usePaymentsMode: () => payments }));

import { OpsLayout } from '../OpsLayout';

const flush = () => act(async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); });
const byText = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/ops']}>
        <Routes>
          <Route path="/ops" element={<OpsLayout><p>the page</p></OpsLayout>} />
          <Route path="/profit-tracker" element={<p>company dashboard</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('the Ops frame', () => {
  it('says plainly when balances are play money, and says nothing once Stripe is connected', async () => {
    payments = { playMoney: true };
    await render();
    expect(document.body.querySelector('[data-testid="test-mode"]')!.textContent).toContain('Payments are in test mode: every balance is play money');
    document.body.innerHTML = '';
    payments = { playMoney: false };
    await render();
    expect(document.body.querySelector('[data-testid="test-mode"]')).toBeNull();
  });

  it('shows nothing of a company: just the name, the page and a menu with sign out', async () => {
    await render();
    expect(document.body.textContent).toContain('FieldQuote');
    expect(document.body.textContent).toContain('staff');
    expect(document.body.textContent).toContain('the page');
    expect(document.body.textContent).not.toContain('Marketplace');
    await act(async () => (document.body.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement).click());
    // Staff with no company get no "Switch to my company".
    expect(byText('Switch to my company')).toBeUndefined();
    await act(async () => byText('Sign out')!.click());
    expect(signOut).toHaveBeenCalled();
  });

  it('lets the owner hop back to their company', async () => {
    user = { ...user, role: 'super_admin', organizationId: 'o1' };
    await render();
    expect(document.body.textContent).toContain('platform owner');
    await act(async () => (document.body.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement).click());
    await act(async () => byText('Switch to my company')!.click());
    await flush();
    expect(document.body.textContent).toContain('company dashboard');
  });
});
