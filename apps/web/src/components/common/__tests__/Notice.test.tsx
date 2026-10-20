import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { InlineNotice, Toast, useToast } from '../Notice';

const Demo: React.FC = () => {
  const { toast, show } = useToast();
  return (
    <div>
      <button type="button" onClick={() => show('Bid removed.')}>short</button>
      <button type="button" onClick={() => show('x'.repeat(200))}>long</button>
      <Toast text={toast} />
    </div>
  );
};

const pill = () => document.body.querySelector('[role="status"]');

describe('Notice', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => jest.useRealTimers());

  it('shows a toast at the bottom that clears on its own, longer for longer text', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => createRoot(host).render(<Demo />));
    const [short, long] = Array.from(host.querySelectorAll('button'));
    act(() => short.click());
    expect(pill()?.textContent).toBe('Bid removed.');
    act(() => jest.advanceTimersByTime(2400));
    expect(pill()).not.toBeNull();
    act(() => jest.advanceTimersByTime(200));
    expect(pill()).toBeNull();

    act(() => long.click());
    act(() => jest.advanceTimersByTime(5900));
    expect(pill()).not.toBeNull();
    act(() => jest.advanceTimersByTime(200));
    expect(pill()).toBeNull();

    // A newer toast replaces the old one and keeps its own timer.
    act(() => long.click());
    act(() => jest.advanceTimersByTime(1000));
    act(() => short.click());
    expect(pill()?.textContent).toBe('Bid removed.');
    act(() => jest.advanceTimersByTime(2600));
    expect(pill()).toBeNull();
  });

  it('renders inline notices as status or alert with an optional dismiss', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onDismiss = jest.fn();
    act(() =>
      createRoot(host).render(
        <>
          <InlineNotice tone="good" onDismiss={onDismiss}>All set</InlineNotice>
          <InlineNotice tone="bad">Nope</InlineNotice>
        </>,
      ),
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain('All set');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Nope');
    expect(host.querySelectorAll('button[aria-label="Dismiss"]')).toHaveLength(1);
    act(() => (host.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click());
    expect(onDismiss).toHaveBeenCalled();
  });
});
