import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const schedule = jest.fn<Promise<unknown>, [string, string, string]>(async (...args) => {
  const from = args[1];
  return {
  tasks:
    from === '2026-11-02'
      ? [
          { id: 't1', projectId: 'p1', projectName: 'Miller re-roof', address: '12 Elm St', title: 'Tear-off', startDate: '2026-11-03', endDate: '2026-11-04', done: false, crew: [{ id: 'k1', name: 'Joe Ruiz', phone: '432-555-0101' }], order: 1 },
          { id: 't2', projectId: 'p2', projectName: 'Ortega deck', title: 'Footings', startDate: '2026-11-04', done: false, crew: [], order: 1 },
        ]
      : [],
  projects: from === '2026-11-02' ? [{ id: 'p1', name: 'Miller re-roof', status: 'in_progress', startDate: '2026-11-02' }] : [],
  };
});
jest.mock('../../../lib/api', () => ({
  tasksAPI: { schedule: (org: string, from: string, to: string) => schedule(org, from, to) },
  crewAPI: { list: jest.fn(async () => [{ id: 'k1', name: 'Joe Ruiz', archived: false }]), add: jest.fn(), update: jest.fn(), archive: jest.fn() },
}));

import { ScheduleView } from '../Schedule';
import { mondayOf } from '../taskDates';

let root: Root;
let host: HTMLDivElement;
const onOpenProject = jest.fn();
const day = (iso: string) => host.querySelector(`[data-testid="day-${iso}"]`)!.textContent;
const button = (label: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label) as HTMLButtonElement;

beforeEach(async () => {
  schedule.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<ScheduleView organizationId="org1" onOpenProject={onOpenProject} today="2026-11-05" />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the schedule', () => {
  it('shows the week Monday to Sunday, a task on each day it runs, and opens its project', async () => {
    expect(schedule).toHaveBeenCalledWith('org1', '2026-11-02', '2026-11-08');
    expect(day('2026-11-03')).toContain('Tear-off');
    expect(day('2026-11-04')).toContain('Tear-off');
    expect(day('2026-11-04')).toContain('Footings');
    expect(day('2026-11-05')).not.toContain('Tear-off');
    expect(host.querySelector('[aria-label="Jobs running this week"]')!.textContent).toContain('Miller re-roof');
    await act(async () => (host.querySelector('[data-testid="day-2026-11-03"] [data-testid="schedule-task"] button') as HTMLButtonElement).click());
    expect(onOpenProject).toHaveBeenCalledWith('p1');
  });

  it("filters by crew member and moves between weeks", async () => {
    const select = host.querySelector('select[aria-label="Whose schedule"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'k1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(day('2026-11-04')).toContain('Tear-off');
    expect(day('2026-11-04')).not.toContain('Footings');

    await act(async () => button('Next week').click());
    expect(schedule).toHaveBeenLastCalledWith('org1', '2026-11-09', '2026-11-15');
    expect(host.querySelector('[data-testid="schedule-empty"]')).not.toBeNull();
  });

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
  });
});
