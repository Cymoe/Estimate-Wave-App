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
        <MobileMenu isOpen onClose={() => {}} selectedOrg={org} organizations={[org]} onOrgChange={() => {}} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
const tap = (label: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(label))!;
const account = () => document.body.querySelector('button[aria-label="Account"]') as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the phone menu', () => {
  it('keeps the account items behind a tap on the name, as the desktop sidebar does', async () => {
    await open();
    expect(account().getAttribute('aria-expanded')).toBe('false');
    expect(account().textContent).toContain('ana@basin.example');
    expect(document.body.textContent).not.toContain('Company settings');
    expect(document.body.textContent).not.toContain('Sign Out');
    await act(async () => account().click());
    expect(account().getAttribute('aria-expanded')).toBe('true');
    expect(document.body.textContent).toContain('Company settings');
    expect(document.body.textContent).toContain('Sign Out');
    await act(async () => account().click());
    expect(document.body.textContent).not.toContain('Sign Out');
  });

  it('reaches Company settings and the Pro plan page, not routes that no longer exist', async () => {
    await open();
    await act(async () => account().click());
    await act(async () => tap('Company settings').click());
    expect(path).toBe('/settings/organization');
    await act(async () => tap('Pro plan').click());
    expect(path).toBe('/plan');
  });

  it('names the pages as the desktop sidebar does: Estimates and Projects, no Services (a redirect, not a page)', async () => {
    await open();
    const links = Array.from(document.body.querySelectorAll('nav a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['Leads', '/leads'],
      ['Bids', '/bids'],
      ['Marketplace', '/marketplace'],
      ['The Vault', '/vault'],
      ['Webb Report', '/report'],
      ['Outreach', '/outreach'],
      ['Estimates', '/work'],
      ['Projects', '/projects'],
      ['Price Book', '/price-book'],
    ]);
    expect(document.body.textContent).not.toContain('Services');
    expect(document.body.textContent).not.toContain('Work');
  });

  it('offers Contact support by email; the tutorials are gone', async () => {
    await open();
    await act(async () => account().click());
    const support = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent?.includes('Contact support'))!;
    expect(support.getAttribute('href')).toMatch(/^mailto:/);
    expect(document.body.textContent).not.toMatch(/tutorial/i);
  });
});
