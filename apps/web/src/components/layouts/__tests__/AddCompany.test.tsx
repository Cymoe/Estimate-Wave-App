import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let user: Record<string, unknown> = { id: 'u1', name: 'Ana Ruiz', email: 'ana@desertair.example', role: 'user' };
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user, signOut: async () => undefined }) }));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined }) }));
jest.mock('../../market/WalletTile', () => ({ WalletTile: () => null }));
jest.mock('../../market/plan', () => ({ usePlan: () => ({ plan: null, active: true }), planLabel: () => 'Pro plan' }));
const submit = jest.fn<Promise<{ duplicate: boolean; id: string }>, [Record<string, unknown>]>(async () => ({ duplicate: false, id: 'a1' }));
jest.mock('../../../lib/api', () => ({
  applicationsAPI: {
    options: async () => ({ trades: [{ slug: 'painting', name: 'Painting' }, { slug: 'hvac', name: 'HVAC' }], counties: ['Midland', 'Ector', 'Travis'], westTexas: ['Midland', 'Ector'] }),
    submit: (form: Record<string, unknown>) => submit(form),
  },
}));

import { Sidebar } from '../Sidebar';

const noop = () => undefined;
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const type = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const props = {
    isSidebarCollapsed: false, setSidebarCollapsedWithLogging: noop, orgDropdownOpen: true, setOrgDropdownOpen: noop,
    selectedOrg: { id: 'o1', name: 'Desert Air HVAC', industry: 'HVAC' }, setSelectedOrg: noop,
    organizations: [{ id: 'o1', name: 'Desert Air HVAC', industry: 'HVAC' }],
    isProjectsSidebarOpen: false, setIsProjectsSidebarOpen: noop, isProjectsSidebarLocked: false, setProjectsSidebarLockedWithPersistence: noop,
    recentProjects: [], selectedTimePeriod: 'month', setSelectedTimePeriod: noop, currentData: {}, timePeriodHeaders: {},
    isLiveRevenuePopoverOpen: false, setIsLiveRevenuePopoverOpen: noop, liveRevenueButtonRef: { current: null },
    isProfileMenuOpen: false, setIsProfileMenuOpen: noop, setShowHelpModal: noop, onActivityClick: noop,
  };
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/leads']}>
        <Routes>
          <Route path="/leads" element={<Sidebar {...(props as unknown as React.ComponentProps<typeof Sidebar>)} />} />
          <Route path="/ops" element={<p>ops new company</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  submit.mockClear();
});

describe('Add another company', () => {
  it('lets an owner apply for a second company from the switcher, filled in with their details', async () => {
    user = { id: 'u1', name: 'Ana Ruiz', email: 'ana@desertair.example', role: 'user' };
    await render();
    await act(async () => button('Add another company').click());
    await flush();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Add another company');
    const inputs = Array.from(dialog.querySelectorAll('input')) as HTMLInputElement[];
    // Their name and sign-in email are already there.
    expect(inputs.map((i) => i.value)).toEqual(['', 'Ana Ruiz', 'ana@desertair.example', '']);
    await act(async () => type(inputs[0], 'Basin Paint Co.'));
    await act(async () => type(inputs[3], '432-555-0199'));
    await act(async () => type(dialog.querySelector('select[aria-label="County"]') as HTMLSelectElement, 'Midland'));
    // No trade picked: it says so instead of sending.
    await act(async () => (dialog.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(dialog.querySelector('[role="alert"]')!.textContent).toBe('Pick at least one trade');
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Painting').click());
    await act(async () => (dialog.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(submit).toHaveBeenCalledWith({
      companyName: 'Basin Paint Co.', contactName: 'Ana Ruiz', email: 'ana@desertair.example', phone: '432-555-0199', county: 'Midland', notes: undefined, trades: ['painting'],
    });
    expect(document.body.querySelector('[role="status"]')!.textContent).toContain('Once Basin Paint Co. is approved, it shows up in your company list');
  });

  it('sends the platform owner to New company in Ops instead of an application', async () => {
    user = { id: 'u0', name: 'Myles', email: 'owner@fieldquote.example', role: 'super_admin', isStaff: true };
    await render();
    await act(async () => button('Add another company').click());
    await flush();
    expect(document.body.textContent).toContain('ops new company');
    expect(submit).not.toHaveBeenCalled();
  });
});
