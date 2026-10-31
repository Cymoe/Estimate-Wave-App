
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
  const updated = {
    ...row,
    lastContactAt: new Date().toISOString(),
    contacts: ((row.contacts as number) ?? 0) + (kind === 'call' ? 1 : 0),
    texts: ((row.texts as number) ?? 0) + (kind === 'text' ? 1 : 0),
  };
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
    acknowledge: (id: string) => acknowledge(id),
  },
  industriesAPI: { list: jest.fn(async () => []) },
  walletAPI: { get: jest.fn(async () => null) },
}));
jest.mock('../../services/EstimateService', () => ({ EstimateService: {} }));
const acknowledge = jest.fn(async (_id: string) => '2026-10-22T16:04:00Z');
const exportCsv = jest.fn();
const exportExcel = jest.fn();
jest.mock('../../services/LeadExportService', () => ({ LeadExportService: { csv: (...a: unknown[]) => exportCsv(...a), excel: (...a: unknown[]) => exportExcel(...a) } }));
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
    // The appointment is its own thing: it never writes a follow-up date.
    for (const [, data] of update.mock.calls) expect(data).not.toHaveProperty('followUpDate');

    // Removing it takes it off the calendar.
    act(() => click(document.body.querySelector('form button[aria-label="Remove appointment"]')!));
    await flush();
    expect(calendarItem()).toBeUndefined();
    for (const [, data] of update.mock.calls) expect(data).not.toHaveProperty('followUpDate');
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
  beforeEach(() => {
    localStorage.setItem('leadsView', 'board');
    localStorage.removeItem('leadsCompact');
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens the lead when its name is tapped; the toolbar button opens every card and there is no per-card arrow', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();

    expect(container.querySelector('button[aria-label="Expand lead"]')).toBeNull();
    const toggle = () => Array.from(container.querySelectorAll('button')).find((b) => /Expand leads|Collapse leads/.test(b.textContent ?? ''))!;
    expect(container.querySelector('input[aria-label="Add a note"]')).toBeNull();
    act(() => click(toggle()));
    expect(toggle().textContent).toContain('Collapse leads');
    expect(container.querySelector('input[aria-label="Add a note"]')).toBeTruthy();
    expect(document.body.querySelector('form')).toBeNull();
    act(() => click(toggle()));

    const name = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'Rocky Vansau')!;
    act(() => click(name));
    expect((document.body.querySelector('form input[aria-label="Name"]') as HTMLInputElement).value).toBe('Rocky Vansau');
  });

  it('opens the lead from anywhere on a collapsed card except the Call link', async () => {
    rows = [{ ...rows[0], appointmentAt: undefined, phone: '(432) 555-0100', jobType: 'landscaping', city: 'Midland' }] as typeof rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const card = container.querySelector('[data-lead-card]')!;
    // The trade sits beside the value, bottom right of the card.
    const corner = Array.from(card.querySelectorAll('div')).find((el) => /^landscaping/i.test(el.textContent ?? ''))!;
    act(() => click(corner));
    expect(document.body.querySelector('form input[aria-label="Name"]')).toBeTruthy();
    // Create estimate lives in the drawer now, not on the card.
    expect(card.textContent).not.toContain('Create estimate');
    expect(card.textContent).not.toContain('Tap the name');
    expect(Array.from(document.body.querySelectorAll('form button')).some((b) => b.textContent?.includes('Create estimate'))).toBe(true);
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

    const card = (who: string) => Array.from(container.querySelectorAll('[data-lead-card]')).find((el) => el.textContent?.includes(who))!;
    // The tag says Webb Leads and which way the lead came.
    expect(card('Omar Haddad').textContent).toContain('Webb Leads · Bid');
    expect(card('Dana Ruiz').textContent).toContain('Webb Leads · Marketplace');
    expect(card('Rocky Vansau').textContent).not.toContain('Webb Leads');

    // The lead's detail shows what it cost, and "Got it" tells Webb Leads they have it.
    act(() => click(Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'Omar Haddad')!));
    const credit = () => document.body.querySelector('[data-testid="lead-credit"]')!;
    expect(credit().textContent).toContain('Won with a bid · $250.00');
    await act(async () => (credit().querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(acknowledge).toHaveBeenCalledWith('l2');
    // Not today, so the date is in it too.
    expect(credit().querySelector('[data-testid="acknowledged"]')?.textContent).toMatch(/You acknowledged it (at \d|[A-Z][a-z]{2} \d)/);
    rows = [own];
  });

  it('opens the lead from the alert link and acknowledges it', async () => {
    const own = rows[0];
    rows = [
      { ...own, appointmentAt: undefined },
      { id: 'l2', name: 'Omar Haddad', status: 'new', createdAt: '2026-10-02T00:00:00Z', marketplaceLeadId: 'm1', pricePaidCents: 25000, wonVia: 'bid' },
    ] as typeof rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter initialEntries={['/leads?lead=l2&ack=1']}><LeadsPage /></MemoryRouter>));
    await flush();
    expect(acknowledge).toHaveBeenCalledWith('l2');
    expect(document.body.querySelector('[data-testid="lead-credit"]')?.textContent).toContain('Won with a bid · $250.00');
    expect(document.body.querySelector('[data-testid="acknowledged"]')).not.toBeNull();
    // Where a bad lead gets reported, with a link that opens an email.
    const support = document.body.querySelector('[data-testid="support-line"]')!;
    expect(support.textContent).toBe('Wrong number or not a real job? Tell Webb Leads within 3 days: leads@webbleads.com');
    expect(support.querySelector('a')?.getAttribute('href')).toBe('mailto:leads@webbleads.com');
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
    const names = Array.from(container.querySelectorAll('[data-lead-card]')).map((el) => el.textContent);
    expect(names.join(' ')).toContain('Omar Haddad');
    expect(names.join(' ')).not.toContain('Rocky Vansau');
    expect(names.join(' ')).not.toContain('Dana Ruiz');
    rows = [own];
  });

  it('counts a missed appointment as overdue even with no follow-up date', async () => {
    const own = rows[0];
    rows = [
      { id: 'l5', name: 'Missed Appt', status: 'scheduled', createdAt: '2026-10-02T00:00:00Z', appointmentAt: '2026-10-05T15:00:00Z' },
      { id: 'l6', name: 'Still Coming', status: 'scheduled', createdAt: '2026-10-02T00:00:00Z', appointmentAt: '2099-10-05T15:00:00Z' },
    ] as typeof rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const filter = container.querySelector('select[aria-label="Filter leads"]') as HTMLSelectElement;
    act(() => {
      filter.value = 'overdue';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    const names = Array.from(container.querySelectorAll('[data-lead-card]')).map((el) => el.textContent ?? '');
    expect(names.some((n) => n.includes('Missed Appt'))).toBe(true);
    expect(names.some((n) => n.includes('Still Coming'))).toBe(false);
    rows = [own];
  });

  it('shows the notes once per card, and moving a lead to Lost needs no pop-up', async () => {
    const own = rows[0];
    rows = [
      { id: 'l7', name: 'Dan Shah', status: 'new', createdAt: '2026-10-02T00:00:00Z', phone: '(555) 410-9921', jobType: 'hvac', city: 'Odessa', notes: 'AC unit is 18 years old, short-cycling. Asked about heat pumps.' },
    ] as typeof rows;
    const prompt = jest.spyOn(window, 'prompt').mockImplementation(() => 'should not be asked');
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const card = () => container.querySelector('[data-lead-card]')!;
    const count = (text: string) => (card().textContent ?? '').split(text).length - 1;
    // Collapsed: the one-line summary, no city beside the trade.
    expect(count('AC unit is 18 years old')).toBe(1);
    expect(card().textContent).not.toContain('Odessa');
    // Expanded: the full notes once; the trade stays alone over the value so the status line never wraps.
    act(() => click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Expand leads'))!));
    expect(count('AC unit is 18 years old')).toBe(1);
    expect(card().textContent).toContain('heat pumps');
    expect(card().textContent).not.toContain('hvac · Odessa');

    // Lost from the drawer: no browser prompt, just the stage.
    act(() => click(Array.from(card().querySelectorAll('span')).find((el) => el.textContent === 'Dan Shah')!));
    const stage = document.body.querySelector('form select[aria-label="Stage"]') as HTMLSelectElement;
    update.mockClear();
    await act(async () => {
      stage.value = 'lost';
      stage.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(prompt).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('l7', { status: 'lost' });
    expect(document.body.querySelector('form input[aria-label="Lost reason"]')).toBeTruthy();
    prompt.mockRestore();
    rows = [own];
  });

  it('never says "not contacted" on a lead already past No Answer', async () => {
    const own = rows[0];
    rows = [
      { id: 'l3', name: 'Oak Street Dental', status: 'contacted', createdAt: '2026-10-02T00:00:00Z', phone: '(555) 330-7712', city: 'Midland' },
      { id: 'l4', name: 'Maria Lopez', status: 'new', createdAt: '2026-10-02T00:00:00Z', phone: '(555) 201-3344', city: 'Midland' },
    ] as typeof rows;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const line = (who: string) =>
      Array.from(container.querySelectorAll('[data-lead-card]')).find((el) => el.textContent?.includes(who))!.querySelector('[data-testid="lead-status-line"]')?.textContent;
    expect(line('Oak Street Dental')).toMatch(/^Came in \d+d ago$/);
    expect(line('Maria Lopez')).toMatch(/^Came in \d+d ago · not contacted$/);
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
    const card = () => container.querySelector('[data-lead-card]')!;
    expect(card().textContent).toContain('Get your render done · Irrigation · As soon as possible');
    expect(card().textContent).not.toContain('What are you looking');
    expect(card().querySelector('[data-testid="lead-status-line"]')?.textContent).toMatch(/^Came in \d+d ago · not contacted$/);
    expect(card().querySelector('select[aria-label="Status"]')).toBeNull();

    // Tapping Call logs a call; the status line says so.
    const call = Array.from(card().querySelectorAll('a')).find((a) => a.getAttribute('href') === 'tel:4322600076')!;
    act(() => click(call));
    await flush();
    expect(logContact).toHaveBeenCalledWith('l2', 'call', undefined);
    expect(card().querySelector('[data-testid="lead-status-line"]')?.textContent).toBe('Last touched just now · 1 call');
    // A text is counted on its own, not as a call.
    act(() => click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Expand leads'))!));
    const text = Array.from(card().querySelectorAll('a')).find((a) => a.getAttribute('href') === 'sms:4322600076')!;
    act(() => click(text));
    await flush();
    expect(logContact).toHaveBeenCalledWith('l2', 'text', undefined);
    expect(card().querySelector('[data-testid="lead-status-line"]')?.textContent).toBe('Last touched just now · 1 call · 1 text');

    // The open card lists the answers, and a note typed there is stamped and kept.
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

  it('exports the leads on screen to CSV or Excel from the toolbar menu, filters included', async () => {
    rows = [
      { id: 'l1', name: 'Rocky Vansau', status: 'scheduled', appointmentAt: start.toISOString(), createdAt: '2026-10-01T00:00:00Z' },
      { id: 'l2', name: 'Maria Lopez', status: 'new', createdAt: '2026-10-02T00:00:00Z' } as (typeof rows)[number],
    ];
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><LeadsPage /></MemoryRouter>));
    await flush();
    const more = () => container.querySelector('button[aria-label="More"]') as HTMLButtonElement;
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    await act(async () => click(more()));
    // The menu is portalled and fixed, so the board can't paint over it.
    expect(document.body.querySelector('[role="menu"]')?.className).toContain('fixed');
    const item = (label: string) => Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
    await act(async () => click(item('Export to CSV')));
    expect(exportCsv).toHaveBeenCalledTimes(1);
    expect((exportCsv.mock.calls[0][0] as { name: string }[]).map((l) => l.name)).toEqual(['Rocky Vansau', 'Maria Lopez']);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    // Narrow the board, and the export narrows with it.
    const search = container.querySelector('input[aria-label="Search leads"]') as HTMLInputElement;
    await act(async () => pick(search, 'Maria'));
    await act(async () => click(more()));
    await act(async () => click(item('Export to Excel')));
    expect((exportExcel.mock.calls[0][0] as { name: string }[]).map((l) => l.name)).toEqual(['Maria Lopez']);
    rows = [rows[0]];
  });
});
