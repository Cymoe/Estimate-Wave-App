import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user', email: 'ana@basin.example' }, signOut: jest.fn() }) }));
jest.mock('../../market/WalletTile', () => ({ WalletTile: () => null }));
jest.mock('../../market/plan', () => ({ usePlan: () => ({ plan: null, active: true }), planLabel: () => 'Pro plan' }));

import { MobileMenu } from '../MobileMenu';

let path = '';
function Where() {
  path = useLocation().pathname;
  return null;
}

async function open() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const org = { id: 'o1', name: 'Basin Paint', industry: 'Painting' };
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/leads']}>
        <MobileMenu isOpen onClose={() => {}} selectedOrg={org} organizations={[org]} onOrgChange={() => {}} onShowHelp={() => {}} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
const tap = (label: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(label))!;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the phone menu', () => {
  it('reaches Company Settings and the plan page, not routes that no longer exist', async () => {
    await open();
    await act(async () => tap('Company Settings').click());
    expect(path).toBe('/settings/organization');
    await act(async () => tap('Billing & Plan').click());
    expect(path).toBe('/plan');
  });
});
