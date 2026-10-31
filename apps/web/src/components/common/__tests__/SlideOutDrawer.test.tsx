import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SlideOutDrawer } from '../SlideOutDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SlideOutDrawer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('renders into the page body, above any container it is used in, and slides in', async () => {
    const page = document.createElement('div');
    page.style.position = 'relative';
    page.style.zIndex = '40';
    document.body.appendChild(page);
    await act(async () => createRoot(page).render(<SlideOutDrawer isOpen onClose={() => {}} title="Edit Line Item">form</SlideOutDrawer>));
    const dialog = document.body.querySelector('[role="dialog"][aria-label="Edit Line Item"]')!;
    expect(dialog.parentElement).toBe(document.body);
    expect(page.contains(dialog)).toBe(false);
    expect(dialog.className).toContain('z-[11000]');
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(dialog.querySelector('.translate-x-0')).not.toBeNull();
  });

  it('Esc closes it after the slide out', async () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    const page = document.createElement('div');
    document.body.appendChild(page);
    await act(async () => createRoot(page).render(<SlideOutDrawer isOpen onClose={onClose} title="Edit">form</SlideOutDrawer>));
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
