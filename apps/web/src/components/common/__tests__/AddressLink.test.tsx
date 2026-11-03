import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A stand-in for MapLibre: records the pin's popup text and fires "load" at once.
const popupText: string[] = [];
const tiles: string[][] = [];
jest.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}), { virtual: true });
jest.mock('maplibre-gl', () => {
  class Map {
    constructor(options: { style: { sources: { carto: { tiles: string[] } } } }) {
      tiles.push(options.style.sources.carto.tiles);
    }
    addControl() {}
    on(_event: string, cb: () => void) {
      cb();
    }
    remove() {}
  }
  class Popup {
    setText(text: string) {
      popupText.push(text);
      return this;
    }
    setHTML() {
      throw new Error('names must never be inserted as HTML');
    }
  }
  class Marker {
    setLngLat() {
      return this;
    }
    setPopup() {
      return this;
    }
    addTo() {
      return this;
    }
  }
  return { Map, Popup, Marker, NavigationControl: class {} };
}, { virtual: true });

import { AddressLink } from '../AddressLink';

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe('tapping an address', () => {
  beforeEach(() => {
    popupText.length = 0;
    tiles.length = 0;
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ features: [{ geometry: { coordinates: [-102.07, 31.99] } }] }),
    }));
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', configurable: true });
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('light');
  });

  async function render() {
    const onCard = jest.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <div onClick={onCard}>
          <AddressLink address="12 Oak St, Midland, TX 79701" title="Ann <b>Miller</b>">
            12 Oak St
          </AddressLink>
        </div>,
      ),
    );
    const open = async () => {
      await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
      await flush();
      await flush();
    };
    return { onCard, open, root };
  }

  it('opens the map above everything, with Directions in the device maps app, and not the card around it', async () => {
    const { onCard, open, root } = await render();
    await open();
    expect(onCard).not.toHaveBeenCalled();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain('z-[11200]');
    expect(dialog.textContent).toContain('12 Oak St, Midland, TX 79701');
    const links = Array.from(dialog.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Directions', 'https://maps.apple.com/?daddr=12%20Oak%20St%2C%20Midland%2C%20TX%2079701'],
      ['Open in Apple Maps', 'https://maps.apple.com/?q=12%20Oak%20St%2C%20Midland%2C%20TX%2079701'],
    ]);
    // The name is shown as plain text on the pin.
    expect(popupText).toEqual(['Ann <b>Miller</b>']);
    expect(tiles[0][0]).toContain('dark_all');
    act(() => root.unmount());
  });

  it('uses light tiles in light mode, and Esc or the backdrop closes it', async () => {
    document.documentElement.classList.add('light');
    const { open, root } = await render();
    await open();
    expect(tiles[0][0]).toContain('light_all');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await open();
    await act(async () => (document.body.querySelector('[data-testid="map-backdrop"]') as HTMLElement).click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    act(() => root.unmount());
  });

  it("still offers Directions when the address can't be found", async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }));
    const { open, root } = await render();
    await open();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Couldn't find that address on the map.");
    expect(Array.from(dialog.querySelectorAll('a')).map((a) => a.textContent)).toEqual(['Directions', 'Open in Apple Maps']);
    act(() => root.unmount());
  });
});
