import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Myles Webb', email: 'm@example.com', role: 'super_admin', isStaff: true }, signOut: async () => undefined }),
}));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined }) }));
jest.mock('../../market/WalletTile', () => ({ WalletTile: () => null }));
jest.mock('../../market/plan', () => ({ usePlan: () => ({ plan: null, active: true }), planLabel: () => 'Pro plan' }));

import { Sidebar } from '../Sidebar';
import { orgInitials } from '../orgInitials';

const noop = () => undefined;
async function render(collapsed: boolean, overrides: Record<string, unknown> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const props = {
    isSidebarCollapsed: collapsed, setSidebarCollapsedWithLogging: noop, orgDropdownOpen: false, setOrgDropdownOpen: noop,
    selectedOrg: { id: 'o1', name: 'Mio Homes', industry: 'General Construction' }, setSelectedOrg: noop,
    organizations: [{ id: 'o1', name: 'Mio Homes', industry: 'General Construction' }],
    isProjectsSidebarOpen: false, setIsProjectsSidebarOpen: noop, isProjectsSidebarLocked: false, setProjectsSidebarLockedWithPersistence: noop,
    recentProjects: [], selectedTimePeriod: 'month', setSelectedTimePeriod: noop, currentData: {}, timePeriodHeaders: {},
    isLiveRevenuePopoverOpen: false, setIsLiveRevenuePopoverOpen: noop, liveRevenueButtonRef: { current: null },
    isProfileMenuOpen: false, setIsProfileMenuOpen: noop, onActivityClick: noop,
    ...overrides,
  };
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/leads']}>
        <Sidebar {...(props as unknown as React.ComponentProps<typeof Sidebar>)} />
      </MemoryRouter>,
    ),
  );
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the right nav', () => {
  it('stacks the tiles in one column when closed: no tile spans two columns', async () => {
    const nav = await render(true);
    const grid = nav.querySelector('a[href="/leads"]')!.parentElement!;
    expect(grid.className).toContain('grid-cols-1');
    // One wide tile would force a second column and squeeze every tile into half the rail.
    expect(Array.from(grid.children).filter((tile) => tile.className.includes('col-span-2'))).toHaveLength(0);
    // The closed rail is exactly as wide as its 48px column.
    expect(nav.firstElementChild!.className).toContain('w-12');
  });

  it('lays the tiles out two across when open, every one the same square with a shape', async () => {
    const nav = await render(false);
    const grid = nav.querySelector('a[href="/leads"]')!.parentElement!;
    expect(grid.className).toContain('grid-cols-2');
    const tiles = Array.from(grid.querySelectorAll(':scope > a'));
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.className).toContain('aspect-square');
      expect(tile.className).not.toContain('col-span-2');
    }
    expect(nav.querySelector('a[href="/leads"] svg')!.getAttribute('data-shape')).toBe('leads');
    expect(nav.querySelector('a[href="/projects"] svg')!.getAttribute('data-shape')).toBe('projects');
  });

  it('closed: just the initials, which open the rail; no arrow, and never the company list', async () => {
    const setOrgDropdownOpen = jest.fn();
    const setSidebarCollapsedWithLogging = jest.fn();
    const orgs = [
      { id: 'o1', name: 'Mio Homes', industry: 'General Construction' },
      { id: 'o2', name: 'Basin Roofing Co', industry: 'Roofing' },
    ];
    let nav = await render(true, { organizations: orgs, setOrgDropdownOpen, setSidebarCollapsedWithLogging });
    expect(nav.querySelector('button[aria-label="Expand sidebar"]')).toBeNull();
    expect(nav.querySelector('button[aria-label="Collapse sidebar"]')).toBeNull();
    const initials = nav.querySelector('button[aria-label="Open the menu (Mio Homes)"]') as HTMLButtonElement;
    expect(initials.textContent).toBe('MH');
    await act(async () => initials.click());
    expect(setSidebarCollapsedWithLogging).toHaveBeenCalledWith(false);
    expect(setOrgDropdownOpen).not.toHaveBeenCalled();
    document.body.innerHTML = '';

    // Even if the list is marked open, the closed rail doesn't show it.
    nav = await render(true, { organizations: orgs, orgDropdownOpen: true });
    expect(nav.querySelector('[role="menu"][aria-label="Companies"]')).toBeNull();
    document.body.innerHTML = '';

    // Open rail: the arrow to close it, and the company list under the header.
    nav = await render(false, { organizations: orgs, orgDropdownOpen: true });
    expect(nav.querySelector('button[aria-label="Collapse sidebar"]')).not.toBeNull();
    const menu = nav.querySelector('[role="menu"][aria-label="Companies"]')!;
    expect(menu.textContent).toContain('Basin Roofing Co');
  });

  it('closing the rail closes the company list', async () => {
    const setOrgDropdownOpen = jest.fn();
    const setSidebarCollapsedWithLogging = jest.fn();
    const nav = await render(false, { orgDropdownOpen: true, setOrgDropdownOpen, setSidebarCollapsedWithLogging });
    await act(async () => (nav.querySelector('button[aria-label="Collapse sidebar"]') as HTMLButtonElement).click());
    expect(setOrgDropdownOpen).toHaveBeenCalledWith(false);
    expect(setSidebarCollapsedWithLogging).toHaveBeenCalledWith(true);
  });

  it('lines the name and plan up on the left of the account button, beside the avatar', async () => {
    const nav = await render(false);
    const account = Array.from(nav.querySelectorAll('button')).find((b) => b.textContent?.includes('Myles Webb'))!;
    expect(account.className).toContain('text-left');
  });

  it('shortens a company name to its initials', () => {
    expect(orgInitials('Basin Roofing Co')).toBe('BR');
    expect(orgInitials('Test')).toBe('TE');
    expect(orgInitials('  ')).toBe('?');
  });
});
