import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AppointmentField } from '../AppointmentField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Sets an input's value the way the picker does, so React's onChange fires. */
function pick(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => createRoot(container).render(ui));
  return container;
}

describe('AppointmentField', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('saves a picked time on its own, once the picker settles', () => {
    const onChange = jest.fn();
    const container = render(<AppointmentField onChange={onChange} />);
    expect(container.textContent).toContain('Set appointment');
    const input = container.querySelector('input')!;
    act(() => pick(input, '2026-10-12T14:00'));
    act(() => pick(input, '2026-10-12T14:30'));
    expect(onChange).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(800));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date('2026-10-12T14:30').toISOString());
  });

  it('removes the appointment straight away with the x', () => {
    const onChange = jest.fn();
    const container = render(<AppointmentField value={new Date('2026-10-12T14:00').toISOString()} onChange={onChange} />);
    const remove = container.querySelector('button[aria-label="Remove appointment"]')!;
    act(() => remove.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(container.textContent).toContain('Set appointment');
  });
});
