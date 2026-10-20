import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mine: Array<{ id: string; name: string }> = [];
jest.mock('../../../lib/api', () => ({}));
jest.mock('../../layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o1', name: 'Lone Star Concrete' } }),
}));
jest.mock('../../../services/IndustryService', () => ({
  IndustryService: {
    listAll: async () => [{ id: 'concrete', name: 'Concrete' }, { id: 'handyman', name: 'Handyman' }],
    getOrganizationIndustries: async () => mine,
    setOrganizationIndustries: async () => undefined,
  },
}));

import { IndustryBanner } from '../IndustryBanner';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<IndustryBanner />));
  await flush();
}
afterEach(() => { document.body.innerHTML = ''; });

describe('the trades line', () => {
  it("names the company's trades, and Change opens the same editor as settings", async () => {
    mine = [{ id: 'concrete', name: 'Concrete' }, { id: 'handyman', name: 'Handyman' }];
    await render();
    const line = document.body.querySelector('[data-trades-line]')!;
    expect(line.textContent).toContain('Trades: Concrete, Handyman');
    expect(line.textContent).not.toContain('No industries selected');
    await act(async () => (Array.from(line.querySelectorAll('button')).find((b) => b.textContent === 'Change') as HTMLButtonElement).click());
    await flush();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('#modal-title')?.textContent).toBe('Your trades');
    expect(dialog.querySelector('[aria-label="All trades"]')).not.toBeNull();
    expect(dialog.textContent).not.toContain('Advanced settings');
  });

  it('asks for trades when there are none', async () => {
    mine = [];
    await render();
    const line = document.body.querySelector('[data-trades-line]')!;
    expect(line.textContent).toContain('Pick your trades to see their items first');
    expect(Array.from(line.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Pick trades']);
  });
});
