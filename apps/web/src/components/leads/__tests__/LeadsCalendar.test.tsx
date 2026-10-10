import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LeadsCalendar } from '../LeadsCalendar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return container;
}

describe('LeadsCalendar', () => {
  const at = new Date();
  at.setHours(14, 0, 0, 0);
  const leads = [
    { id: 'a', name: 'Rocky Vansau', appointmentAt: at.toISOString() },
    { id: 'b', name: 'No appointment' },
  ];

  it("shows this month's appointments with their time and opens the lead when tapped", () => {
    const onOpen = jest.fn();
    const container = render(<LeadsCalendar leads={leads} onOpen={onOpen} />);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Rocky Vansau'))!;
    expect(button.textContent).toContain('2:00 PM');
    expect(container.textContent).not.toContain('No appointment');
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onOpen).toHaveBeenCalledWith(leads[0]);
  });

  it('shows the month only, with no week view to switch to', () => {
    const container = render(<LeadsCalendar leads={leads} onOpen={() => {}} />);
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).not.toContain('week');
    expect(labels).not.toContain('month');
    expect(container.textContent).toContain(at.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
  });

  it('shows every appointment on a busy day after tapping "more"', () => {
    const busy = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, name: `Lead ${i}`, appointmentAt: new Date(at.getTime() + i * 3600_000).toISOString() }));
    const container = render(<LeadsCalendar leads={busy} onOpen={() => {}} />);
    expect(container.textContent).not.toContain('Lead 4');
    const more = [...container.querySelectorAll('button')].find((b) => b.textContent === '+2 more')!;
    act(() => more.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Lead 4');
  });
});
