import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AddressLink } from '../AddressLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it('opens straight in Apple Maps, in a new tab, and not the card around it', async () => {
    const { link, onCard, root } = await render();
    expect(link.getAttribute('href')).toBe('https://maps.apple.com/?q=12%20Oak%20St%2C%20Midland%2C%20TX%2079701');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('aria-label')).toBe('Open 12 Oak St, Midland, TX 79701 in Apple Maps');
    link.addEventListener('click', (e) => e.preventDefault()); // jsdom can't navigate
    await act(async () => link.click());
    expect(onCard).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull(); // no map window in between
    act(() => root.unmount());
  });
});
