import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ProjectTask } from '../../../lib/api';

let tasks: ProjectTask[] = [];
const add = jest.fn<Promise<string>, [string, { title: string; startDate?: string }]>(async (_projectId, data) => {
  tasks = [...tasks, { id: 't-new', projectId: 'p1', title: data.title, startDate: data.startDate, done: false, crew: [], order: 9 }];
  return 't-new';
});
const update = jest.fn<Promise<null>, [string, Record<string, unknown>]>(async (id, data) => {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...(data.done !== undefined ? { done: Boolean(data.done) } : {}) } : t));
  return null;
});
const addCrew = jest.fn<Promise<string>, [string, { name: string; phone?: string; trade?: string }]>(async () => 'k2');
jest.mock('../../../lib/api', () => ({
  tasksAPI: {
    forProject: jest.fn(async () => tasks),
    add: (projectId: string, data: { title: string; startDate?: string }) => add(projectId, data),
    update: (id: string, data: Record<string, unknown>) => update(id, data),
    remove: jest.fn(),
  },
  crewAPI: {
    list: jest.fn(async () => [{ id: 'k1', name: 'Joe Ruiz', phone: '(432) 555-0101', trade: 'Roofer', archived: false }]),
    add: (organizationId: string, data: { name: string; phone?: string; trade?: string }) => addCrew(organizationId, data),
  },
}));

import { ProjectTasks } from '../ProjectTasks';
import { taskDays, textLink } from '../taskDates';

let root: Root;
let host: HTMLDivElement;
const button = (label: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label) as HTMLButtonElement;
const type = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(async () => {
  tasks = [
    { id: 't1', projectId: 'p1', title: 'Tear-off', startDate: '2026-11-03', endDate: '2026-11-04', done: false, crew: [{ id: 'k1', name: 'Joe Ruiz', phone: '(432) 555-0101' }], order: 1 },
    { id: 't2', projectId: 'p1', title: 'Permit', done: true, crew: [], order: 2 },
  ];
  add.mockClear();
  update.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<ProjectTasks projectId="p1" organizationId="org1" place="12 Elm St" />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('a project’s tasks', () => {
  it('lists open tasks with days and crew, done ones apart, and texts the crew', () => {
    const rows = Array.from(host.querySelectorAll('[data-testid="task-row"]')).map((r) => r.textContent);
    expect(rows[0]).toContain('Tear-off');
    expect(rows[0]).toContain('Nov 3 – Nov 4 · Joe Ruiz');
    expect(host.querySelector('[aria-label="Done"]')!.textContent).toContain('Permit');
    const text = host.querySelector('a[aria-label="Text Joe Ruiz"]')!.getAttribute('href')!;
    expect(text.startsWith('sms:4325550101?&body=')).toBe(true);
    expect(decodeURIComponent(text.split('body=')[1])).toBe('Tear-off at 12 Elm St, Nov 3 – Nov 4.');
  });

  it('adds a task and opens it to set its crew; ticks a task done', async () => {
    const input = host.querySelector('input[aria-label="New task"]') as HTMLInputElement;
    await act(async () => type(input, 'Dry-in'));
    await act(async () => button('Add').click());
    expect(add).toHaveBeenCalledWith('p1', { title: 'Dry-in', startDate: undefined });
    expect(host.querySelector('[aria-label="Crew on this task"]')).not.toBeNull();
    await act(async () => button('Joe Ruiz · Roofer').click());
    expect(update).toHaveBeenCalledWith('t-new', { crewIds: ['k1'] });

    await act(async () => button('Mark “Tear-off” done').click());
    expect(update).toHaveBeenCalledWith('t1', { done: true });
  });
});

describe('task helpers', () => {
  it('reads days and builds texts', () => {
    expect(taskDays({})).toBe('');
    expect(taskDays({ startDate: '2026-11-03' })).toBe('Nov 3');
    expect(textLink('+1 432-555-0101', { title: 'Final walk-through' }, '')).toBe(`sms:+14325550101?&body=${encodeURIComponent('Final walk-through.')}`);
  });
});
