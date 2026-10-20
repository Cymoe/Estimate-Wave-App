import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let saved: string[] = ['concrete'];
const setTrades = jest.fn(async (_org: string, slugs: string[]) => { saved = slugs; });
jest.mock('../../../lib/api', () => ({}));
jest.mock('../../../services/IndustryService', () => ({
  IndustryService: {
    listAll: async () => [
      { id: 'concrete', name: 'Concrete', description: 'Flatwork and foundations' },
      { id: 'handyman', name: 'Handyman', description: 'Small repairs' },
      { id: 'hvac', name: 'HVAC', description: 'Heating and cooling' },
    ],
    getOrganizationIndustries: async () =>
      [{ id: 'concrete', name: 'Concrete' }, { id: 'handyman', name: 'Handyman' }, { id: 'hvac', name: 'HVAC' }].filter((t) => saved.includes(t.id)),
    setOrganizationIndustries: (org: string, slugs: string[]) => setTrades(org, slugs),
  },
}));

import { TradesEditor, TRADES_CHANGED } from '../TradesEditor';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const chips = () => Array.from(document.body.querySelectorAll('[aria-label="Your trades"] span')).map((s) => s.textContent);
const row = (name: string) => Array.from(document.body.querySelectorAll('[aria-label="All trades"] button')).find((b) => b.textContent?.startsWith(name)) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = '';
  saved = ['concrete'];
  jest.clearAllMocks();
});

describe('TradesEditor', () => {
  it('shows your trades as chips, saves each tap at once, and tells the app they changed', async () => {
    const changed = jest.fn();
    window.addEventListener(TRADES_CHANGED, changed);
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<TradesEditor organizationId="o1" />));
    await flush();
    expect(chips()).toEqual(['Concrete']);
    expect(row('Concrete').getAttribute('aria-pressed')).toBe('true');
    expect(row('Handyman').getAttribute('aria-pressed')).toBe('false');

    await act(async () => row('Handyman').click());
    await flush();
    expect(setTrades).toHaveBeenLastCalledWith('o1', ['concrete', 'handyman']);
    expect(chips()).toEqual(['Concrete', 'Handyman']);
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Trades saved.');
    expect(changed).toHaveBeenCalled();

    // The chip's x drops a trade too.
    await act(async () => (document.body.querySelector('button[aria-label="Remove Concrete"]') as HTMLButtonElement).click());
    await flush();
    expect(setTrades).toHaveBeenLastCalledWith('o1', ['handyman']);
    expect(chips()).toEqual(['Handyman']);

    // Search narrows the list by name or description.
    const search = document.body.querySelector('input[aria-label="Search trades"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'heat');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(Array.from(document.body.querySelectorAll('[aria-label="All trades"] button')).map((b) => b.querySelector('span span')?.textContent)).toEqual(['HVAC']);
    window.removeEventListener(TRADES_CHANGED, changed);
  });

  it('says so when no trades are picked yet', async () => {
    saved = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<TradesEditor organizationId="o1" />));
    await flush();
    expect(document.body.textContent).toContain('No trades yet. Pick the ones you work in below.');
  });
});
