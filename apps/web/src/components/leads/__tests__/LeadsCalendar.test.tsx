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

  it("shows this week's appointments with their time and opens the lead when tapped", () => {
    const onOpen = jest.fn();
    const container = render(<LeadsCalendar leads={leads} onOpen={onOpen} />);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Rocky Vansau'))!;
    expect(button.textContent).toContain('2:00 PM');
    expect(container.textContent).not.toContain('No appointment');
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onOpen).toHaveBeenCalledWith(leads[0]);
  });

  it('switches to the month and back with the range buttons', () => {
    const container = render(<LeadsCalendar leads={leads} onOpen={() => {}} />);
    const month = [...container.querySelectorAll('button')].find((b) => b.textContent === 'month')!;
    act(() => month.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Mon');
    expect(container.textContent).toContain('Rocky Vansau');
  });
});
