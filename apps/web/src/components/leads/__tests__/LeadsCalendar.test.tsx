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

  it('plots follow-ups as all-day items on open leads, skipping ones that just mirror the appointment day', () => {
    const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rows = [
      // Appointment today, follow-up on the same day: appointment only.
      { id: 'a', name: 'Rocky Vansau', status: 'scheduled', appointmentAt: at.toISOString(), followUpDate: local(at) },
      // Follow-up today, no appointment: shown.
      { id: 'c', name: 'Dana Ruiz', status: 'contacted', followUpDate: local(at) },
      // A lead already won: its follow-up is noise.
      { id: 'd', name: 'Closed Deal', status: 'won', followUpDate: local(at) },
    ];
    const container = render(<LeadsCalendar leads={rows} onOpen={() => {}} />);
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.filter((l) => l.includes('Rocky Vansau'))).toHaveLength(1);
    expect(labels.find((l) => l.includes('Rocky Vansau'))).toContain('2:00 PM');
    expect(labels.find((l) => l.includes('Dana Ruiz'))).toContain('Follow up');
    expect(labels.some((l) => l.includes('Closed Deal'))).toBe(false);
  });
});
