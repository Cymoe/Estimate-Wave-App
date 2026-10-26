import type { ReactNode } from 'react';
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

async function render(page: ReactNode = <p>the page</p>, path = '/ops') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ops" element={<OpsLayout>{page}</OpsLayout>} />
          <Route path="/ops/real-estate" element={<OpsLayout><p>real estate lists</p></OpsLayout>} />
          <Route path="/calls" element={<OpsLayout><p>calls</p></OpsLayout>} />
          <Route path="/leads" element={<p>company leads</p>} />
          <Route path="/profit-tracker" element={<p>old dashboard, sends staff back to Ops</p>} />
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
  it('switches between the Leads and Real estate sides, for staff on Ops only', async () => {
    await render();
    const nav = () => document.body.querySelector('nav[aria-label="Ops workspace"]')!;
    const link = (label: string) => Array.from(nav().querySelectorAll('a')).find((a) => a.textContent === label)!;
    expect(link('Leads').getAttribute('aria-current')).toBe('page');
    await act(async () => link('Real estate').click());
    await flush();
    expect(document.body.textContent).toContain('real estate lists');
    expect(link('Real estate').getAttribute('aria-current')).toBe('page');
    expect(link('Leads').getAttribute('aria-current')).toBeNull();
    // Callers on the Calls page don't get the switch.
    document.body.innerHTML = '';
    user = { ...user, role: 'caller', isStaff: false };
    await render(undefined, '/calls');
    expect(document.body.querySelector('nav[aria-label="Ops workspace"]')).toBeNull();
    user = { ...user, role: 'staff', isStaff: true };
  });

  it('says plainly when balances are play money, and says nothing once Stripe is connected', async () => {
    payments = { playMoney: true };
    await render();
    expect(document.body.querySelector('[data-testid="test-mode"]')!.textContent).toContain('Payments are in test mode: every balance is play money');
    document.body.innerHTML = '';
    payments = { playMoney: false };
    await render();
    expect(document.body.querySelector('[data-testid="test-mode"]')).toBeNull();
  });

  it('catches a tab that breaks and says so, with the frame still standing', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const Broken = () => {
      throw new Error('slots is not iterable');
    };
    await render(<Broken />);
    const crashed = document.body.querySelector('[data-testid="ops-crashed"]')!;
    expect(crashed.getAttribute('role')).toBe('alert');
    expect(crashed.textContent).toContain('This part of Ops broke.');
    expect(crashed.textContent).toContain('slots is not iterable');
    expect(byText('Try again')).toBeDefined();
    expect(byText('Reload the page')).toBeDefined();
    // The header is still there, so you can still sign out or switch company.
    expect(document.body.querySelector('[aria-haspopup="menu"]')).not.toBeNull();
    quiet.mockRestore();
  });

  it('shows nothing of a company: just the name, the page and a menu with sign out', async () => {
    await render();
    expect(document.body.textContent).toContain('Tolliver');
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
    // It lands on the company side's home, not the switched-off dashboard that bounces staff back to Ops.
    expect(document.body.textContent).toContain('company leads');
  });
});
