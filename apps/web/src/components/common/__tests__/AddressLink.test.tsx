import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AddressLink } from '../AddressLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setAgent = (ua: string) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });

async function render() {
  const onCard = jest.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <div onClick={onCard}>
        <AddressLink address="12 Oak St, Midland, TX 79701">12 Oak St</AddressLink>
      </div>,
    ),
  );
  return { link: host.querySelector('a')!, onCard, root };
}

describe('an address', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens straight in Apple Maps on an iPad, in a new tab, and not the card around it', async () => {
    setAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Mobile/15E148');
    const { link, onCard, root } = await render();
    expect(link.getAttribute('href')).toBe('https://maps.apple.com/?q=12%20Oak%20St%2C%20Midland%2C%20TX%2079701');
    expect(link.getAttribute('target')).toBe('_blank');
    link.addEventListener('click', (e) => e.preventDefault()); // jsdom can't navigate
    await act(async () => link.click());
    expect(onCard).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull(); // no map window in between
    act(() => root.unmount());
  });

  it('opens in Google Maps elsewhere', async () => {
    setAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0');
    const { link, root } = await render();
    expect(link.getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=12%20Oak%20St%2C%20Midland%2C%20TX%2079701');
    act(() => root.unmount());
  });
});
