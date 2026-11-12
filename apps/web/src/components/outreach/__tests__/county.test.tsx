import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setCounty = jest.fn(async () => null);
jest.mock('../../../lib/api', () => ({ outreachAPI: { setCounty: (...a: unknown[]) => setCounty(...(a as [])) } }));
// Two counties in, as there will be once Odessa's owners are loaded.
jest.mock('../presets', () => ({
  COUNTIES: [
    { name: 'Midland', label: 'Midland County, TX', ready: true, records: true },
    { name: 'Ector', label: 'Ector County, TX (Odessa)', ready: true, records: false },
    { name: 'Lubbock', label: 'Lubbock County, TX', ready: false, records: false },
  ],
}));

import { setReadyCounties, useCounty } from '../county';
import { CountySwitch } from '../CountySwitch';

let picked: (name: string) => void = () => {};
const Show = ({ saved, label }: { saved?: string; label: string }) => {
  const [county, set] = useCounty('o1', saved);
  picked = set;
  return <span data-testid={label}>{county}</span>;
};

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  jest.clearAllMocks();
});

describe('the working county', () => {
  it("starts from the company's, is saved on the company when changed, and every switch on the page follows", async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const text = (l: string) => host.querySelector(`[data-testid="${l}"]`)!.textContent;
    // The company's county arrives from the server: both switches show it, and this device keeps a copy.
    await act(async () => root.render(<><Show saved="Ector" label="a" /><Show label="b" /></>));
    expect([text('a'), text('b')]).toEqual(['Ector', 'Ector']);
    expect(localStorage.getItem('outreach.county.o1')).toBe('Ector');
    // Picked here: saved on the company, and the other switch follows at once.
    await act(async () => picked('Midland'));
    expect(setCounty).toHaveBeenCalledWith('o1', 'Midland');
    expect([text('a'), text('b')]).toEqual(['Midland', 'Midland']);
    // A county not in yet can't be picked.
    await act(async () => picked('Lubbock'));
    expect(setCounty).toHaveBeenCalledTimes(1);
    expect(text('a')).toBe('Midland');
    act(() => root.unmount());
  });

  it('a county the server says is in can be picked, everywhere on the page, without a reload', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const Both = () => {
      const [county, set] = useCounty('o1', 'Lubbock');
      return <><span data-testid="now">{county}</span><CountySwitch county={county} onChange={set} /></>;
    };
    // Lubbock is the company's county, but its owners aren't in: the page stays on Midland and marks it Coming soon.
    await act(async () => root.render(<Both />));
    expect(host.querySelector('[data-testid="now"]')!.textContent).toBe('Midland');
    await act(async () => (host.querySelector('[data-testid="county-switch"]') as HTMLButtonElement).click());
    const lubbock = () => Array.from(document.body.querySelectorAll('[role="option"]')).find((o) => o.textContent?.includes('Lubbock')) as HTMLButtonElement;
    expect(lubbock().disabled).toBe(true);
    expect(lubbock().textContent).toContain('Coming soon');
    // The server says its owners are in: the switch offers it, and the company's county is taken.
    await act(async () => setReadyCounties(['Lubbock']));
    expect(lubbock().disabled).toBe(false);
    expect(lubbock().textContent).not.toContain('Coming soon');
    expect(host.querySelector('[data-testid="now"]')!.textContent).toBe('Lubbock');
    act(() => root.unmount());
  });

  it('opens over everything on the page: drawn on the page itself, solid, and closed by a tap away, a pick or a scroll', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const picked = jest.fn();
    // Inside a card that moves (an animation's transform): the menu used to be trapped under the rows after it.
    await act(async () => root.render(<div style={{ transform: 'translateY(0)' }}><CountySwitch county="Midland" onChange={picked} /></div>));
    const open = async () => act(async () => (host.querySelector('[data-testid="county-switch"]') as HTMLButtonElement).click());
    const menu = () => document.body.querySelector('[role="listbox"][aria-label="County"]') as HTMLElement | null;
    await open();
    expect(menu()!.parentElement).toBe(document.body);
    expect(host.contains(menu())).toBe(false);
    expect(menu()!.className).toContain('bg-[#161616] ');
    expect(menu()!.className).not.toContain('backdrop-blur');
    // A tap in the menu keeps it open; a tap away closes it.
    await act(async () => menu()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(menu()).not.toBeNull();
    await act(async () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(menu()).toBeNull();
    // A scroll closes it.
    await open();
    await act(async () => window.dispatchEvent(new Event('scroll')));
    expect(menu()).toBeNull();
    // A pick closes it.
    await open();
    await act(async () => (Array.from(menu()!.querySelectorAll('[role="option"]')).find((o) => o.textContent?.includes('Ector')) as HTMLButtonElement).click());
    expect(picked).toHaveBeenCalledWith('Ector');
    expect(menu()).toBeNull();
    act(() => root.unmount());
  });
});
