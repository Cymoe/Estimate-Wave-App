import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Each tab's panel is a word, so the test sees which one is open without any of their data.
const stub = (name: string) => () => <p>{name} panel</p>;
jest.mock('../../components/settings/BusinessDetailsForm', () => ({ BusinessDetailsForm: stub('general') }));
jest.mock('../../components/settings/TradesEditor', () => ({ TradesEditor: stub('trades') }));
jest.mock('../../components/settings/NotificationsSettings', () => ({ NotificationsSettings: stub('notifications') }));
jest.mock('../../components/settings/ConnectedAssistants', () => ({ ConnectedAssistants: stub('assistants') }));
jest.mock('../../components/settings/ContractsSettings', () => ({ ContractsSettings: stub('contracts') }));
jest.mock('../../components/settings/TemplatesSettings', () => ({ TemplatesSettings: stub('templates') }));
jest.mock('../../components/settings/PaymentsSettings', () => ({ PaymentsSettings: stub('payments') }));
jest.mock('../../components/settings/ClientRemindersSettings', () => ({ ClientRemindersSettings: stub('reminders') }));
jest.mock('../../components/layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1', name: 'Miller Roofing' }, setSelectedOrg: () => {} }) };
});

import OrganizationSettings from '../OrganizationSettings';

let search = '';
let go: (to: string) => void = () => {};
const Where = () => {
  search = useLocation().search;
  go = useNavigate();
  return null;
};

async function render(at: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[at]}>
        <Where />
        <Routes>
          <Route path="/settings/organization" element={<OrganizationSettings />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
const panel = () => Array.from(document.body.querySelectorAll('p')).find((p) => p.textContent?.endsWith(' panel'))?.textContent;

describe('Company settings tabs', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('?tab= picks the tab, a click changes the address, and a link to another tab works while already here', async () => {
    await render('/settings/organization?tab=team');
    expect(document.body.textContent).toContain('Team & Permissions');
    expect(panel()).toBeUndefined(); // the team tab has no stubbed panel; nothing else is open
    const trades = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Trades')!;
    await act(async () => trades.click());
    expect(panel()).toBe('trades panel');
    expect(search).toBe('?tab=trades');

    await act(async () => go('/settings/organization?tab=notifications'));
    expect(panel()).toBe('notifications panel');

    await act(async () => go('/settings/organization'));
    expect(panel()).toBe('general panel');
  });
});
