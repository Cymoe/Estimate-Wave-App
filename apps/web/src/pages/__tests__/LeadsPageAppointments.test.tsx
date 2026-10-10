
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A lead with an appointment this week, so it shows in the calendar's week view.
const start = new Date();
start.setHours(10, 0, 0, 0);
let rows = [{ id: 'l1', name: 'Rocky Vansau', status: 'scheduled', appointmentAt: start.toISOString(), createdAt: '2026-10-01T00:00:00Z' }];

const update = jest.fn(async (id: string, data: Record<string, unknown>) => {
  rows = rows.map((row) => (row.id === id ? { ...row, ...data, appointmentAt: (data.appointmentAt as string | null) ?? undefined } : row)) as typeof rows;
});

jest.mock('../../lib/api', () => ({
  leadsAPI: { list: jest.fn(async () => rows.map((row) => ({ ...row }))), watch: () => () => {}, fillMissingCities: async () => ({}), update: (...args: [string, Record<string, unknown>]) => update(...args) },
  industriesAPI: { list: jest.fn(async () => []) },
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
});
