
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A lead with an appointment this week, so it shows in the calendar's week view.
const start = new Date();
start.setHours(10, 0, 0, 0);
let rows = [{ id: 'l1', name: 'Rocky Vansau', status: 'scheduled', appointmentAt: start.toISOString(), createdAt: '2026-10-01T00:00:00Z' }];

const logContact = jest.fn(async (id: string, kind: string, note?: string) => {
  const row = rows.find((r) => r.id === id)! as Record<string, unknown>;
  const updated = { ...row, lastContactAt: new Date().toISOString(), contacts: kind === 'note' ? (row.contacts as number) ?? 0 : ((row.contacts as number) ?? 0) + 1 };
  if (note) updated.notes = `${row.notes ? `${row.notes}\n` : ''}Oct 18: ${note}`;
  rows = rows.map((r) => (r.id === id ? updated : r)) as typeof rows;
  return updated;
});
const update = jest.fn(async (id: string, data: Record<string, unknown>) => {
  rows = rows.map((row) => (row.id === id ? { ...row, ...data, appointmentAt: (data.appointmentAt as string | null) ?? undefined } : row)) as typeof rows;
});

jest.mock('../../lib/api', () => ({
  leadsAPI: {
    list: jest.fn(async () => rows.map((row) => ({ ...row }))),
    watch: () => () => {},
    fillMissingCities: async () => ({}),
    update: (...args: [string, Record<string, unknown>]) => update(...args),
    logContact: (...args: [string, string, string?]) => logContact(...args),
  },
  industriesAPI: { list: jest.fn(async () => []) },
  walletAPI: { get: jest.fn(async () => null) },
}));
jest.mock('../../services/EstimateService', () => ({ EstimateService: {} }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../components/estimates/CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../components/layouts/DashboardLayout', () => {
  const ReactActual = jest.requireActual('react');
  return { OrganizationContext: ReactActual.createContext({ selectedOrg: { id: 'org1' } }) };
});

import LeadsPage from '../LeadsPage';

/** Sets an input's value the way the picker does, so React's onChange fires. */
function pick(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('Leads calendar', () => {
  beforeEach(() => {
    localStorage.setItem('leadsView', 'calendar');
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('moves an appointment changed in the lead drawer straight away', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();

    const calendarItem = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Rocky Vansau'));
    expect(calendarItem()?.textContent).toContain('10:00');

    act(() => click(calendarItem()!));
    const drawerInput = document.body.querySelector('form input[aria-label="Appointment"]') as HTMLInputElement;
    expect(drawerInput).toBeTruthy();

    const later = new Date(start);
    later.setHours(15, 30);
    const local = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}T15:30`;
    act(() => pick(drawerInput, local));
    act(() => jest.advanceTimersByTime(800));
    await flush();

    expect(update).toHaveBeenCalled();
    expect(calendarItem()?.textContent).toContain('3:30');

    // Removing it takes it off the calendar.
    act(() => click(document.body.querySelector('form button[aria-label="Remove appointment"]')!));
    await flush();
    expect(calendarItem()).toBeUndefined();
  });

  it('keeps a time picked right before the drawer is closed', async () => {
    rows = [{ ...rows[0], appointmentAt: start.toISOString() }];
    update.mockClear();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const calendarItem = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Rocky Vansau'));

    act(() => click(calendarItem()!));
    const drawer = document.body.querySelector('form')!;
    const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    act(() => pick(drawer.querySelector('input[aria-label="Appointment"]') as HTMLInputElement, `${day}T08:45`));
    act(() => click(drawer.querySelector('button[aria-label="Close"]')!));
    act(() => jest.advanceTimersByTime(200));
    await flush();

    expect(document.body.querySelector('form')).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(calendarItem()?.textContent).toContain('8:45');
  });
});

describe('Leads board', () => {
  beforeEach(() => localStorage.setItem('leadsView', 'board'));
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens the lead when its name is tapped, and only the arrow expands the card', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();

    act(() => click(container.querySelector('button[aria-label="Expand lead"]')!));
    expect(document.body.querySelector('form')).toBeNull();
    expect(container.querySelector('button[aria-label="Collapse lead"]')).toBeTruthy();

    const name = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'Rocky Vansau')!;
    act(() => click(name));
    expect((document.body.querySelector('form input[aria-label="Name"]') as HTMLInputElement).value).toBe('Rocky Vansau');
  });

  it('tags a won lead, next to the company\'s own leads', async () => {
    const own = rows[0];
    rows = [
      { ...own, appointmentAt: undefined },
      { id: 'l2', name: 'Omar Haddad', status: 'new', createdAt: '2026-10-02T00:00:00Z', marketplaceLeadId: 'm1', pricePaidCents: 25000, wonVia: 'bid' },
      { id: 'l3', name: 'Dana Ruiz', status: 'new', createdAt: '2026-10-03T00:00:00Z', marketplaceLeadId: 'm2', pricePaidCents: 7500, wonVia: 'buy' },
    ] as typeof rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();

    const card = (who: string) => Array.from(container.querySelectorAll('[draggable]')).find((el) => el.textContent?.includes(who))!;
    expect(card('Omar Haddad').textContent).toContain('Won');
    expect(card('Dana Ruiz').textContent).toContain('Won');
    expect(card('Rocky Vansau').textContent).not.toContain('Won');

    // The lead's detail shows what it cost.
    act(() => click(Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'Omar Haddad')!));
    expect(document.body.querySelector('[data-testid="lead-credit"]')?.textContent).toContain('Won · $250.00');
    rows = [own];
  });

  it('filters by county, the way bids are placed', async () => {
    const own = rows[0];
    rows = [
      { ...own, appointmentAt: undefined, county: 'Midland', city: 'Midland' },
      { id: 'l2', name: 'Omar Haddad', status: 'new', createdAt: '2026-10-02T00:00:00Z', county: 'Ector', city: 'Odessa' },
      { id: 'l3', name: 'Dana Ruiz', status: 'new', createdAt: '2026-10-03T00:00:00Z' },
    ] as typeof rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const select = container.querySelector('select[aria-label="Filter by county"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['All counties', 'Ector County (1)', 'Midland County (1)', 'No county (1)']);
    act(() => {
      select.value = 'Ector';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const names = Array.from(container.querySelectorAll('[draggable]')).map((el) => el.textContent);
    expect(names.join(' ')).toContain('Omar Haddad');
    expect(names.join(' ')).not.toContain('Rocky Vansau');
    expect(names.join(' ')).not.toContain('Dana Ruiz');
    rows = [own];
  });

  it('shows the intake answers, a Call button and what to do next; a call and a note are logged from the card', async () => {
    const own = rows[0];
    rows = [
      {
        id: 'l2', name: 'Cari Doguet', status: 'new', createdAt: '2026-10-02T00:00:00Z', phone: '(432) 260-0076', city: 'Midland', jobType: 'landscaping',
        notes: 'Sub: Get your render done\nWhat are you looking to get done to your home? Irrigation\nWhen do you want to get started with the project? As soon as possible',
      },
    ] as typeof rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const card = () => container.querySelector('[draggable]')!;
    expect(card().textContent).toContain('Get your render done · Irrigation · As soon as possible');
    expect(card().textContent).not.toContain('What are you looking');
    expect(card().querySelector('[data-testid="lead-status-line"]')?.textContent).toBe('Not contacted yet');
    expect(card().querySelector('select[aria-label="Status"]')).toBeNull();

    // Tapping Call logs a call; the status line says so.
    const call = Array.from(card().querySelectorAll('a')).find((a) => a.getAttribute('href') === 'tel:4322600076')!;
    act(() => click(call));
    await flush();
    expect(logContact).toHaveBeenCalledWith('l2', 'call', undefined);
    expect(card().querySelector('[data-testid="lead-status-line"]')?.textContent).toBe('Last touched just now · 1 call');

    // Open the card: the answers are listed, and a note typed there is stamped and kept.
    act(() => click(card().querySelector('button[aria-label="Expand lead"]')!));
    expect(card().querySelector('[aria-label="Intake answers"]')?.textContent).toContain('Irrigation');
    const noteBox = card().querySelector('input[aria-label="Add a note"]') as HTMLInputElement;
    act(() => pick(noteBox, 'left VM'));
    await act(async () => {
      noteBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await flush();
    expect(logContact).toHaveBeenCalledWith('l2', 'note', 'left VM');
    expect(card().querySelector('[aria-label="Intake answers"]')?.textContent).toContain('left VM');
    rows = [own];
  });
});
