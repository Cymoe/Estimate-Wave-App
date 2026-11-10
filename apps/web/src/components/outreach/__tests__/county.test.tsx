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

import { useCounty } from '../county';

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
});
