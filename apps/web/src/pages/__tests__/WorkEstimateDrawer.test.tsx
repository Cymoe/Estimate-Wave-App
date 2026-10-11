import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listRenders: number[] = [];
let listMounts = 0;
jest.mock('../../components/estimates/EstimatesList', () => {
  const { useEffect } = jest.requireActual('react');
  const { useNavigate } = jest.requireActual('react-router-dom');
  return {
    EstimatesList: ({ refreshTrigger }: { refreshTrigger?: number }) => {
      const navigate = useNavigate();
      useEffect(() => {
        listMounts++;
      }, []);
      listRenders.push(refreshTrigger ?? 0);
      return <button onClick={() => navigate('/estimates/e2')}>EST-2 row</button>;
    },
  };
});
jest.mock('../../components/estimates/EstimateDetail', () => ({
  EstimateDetail: ({ estimateId, onClose, inDrawer }: { estimateId: string; onClose: () => void; inDrawer: boolean }) => (
    <div>
      <span>{`estimate ${estimateId}${inDrawer ? ' in drawer' : ''}`}</span>
      <button onClick={onClose}>Back</button>
    </div>
  ),
}));
jest.mock('../../components/estimates/CreateEstimateDrawer', () => ({ CreateEstimateDrawer: () => null }));
jest.mock('../../services/EstimateService', () => ({ EstimateService: { getById: async () => null } }));
jest.mock('../../services/ContractService', () => ({ ContractService: {} }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../components/layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'org1' } }) };
});

import { Work } from '../Work';
import { EstimateContractView } from '../../components/contracts/EstimateContractView';

let path = '';
const Where = () => {
  path = useLocation().pathname;
  return null;
};
let goTo: (to: string) => void = () => {};
const Nav = () => {
  const navigate = useNavigate();
  goTo = navigate;
  return null;
};

async function render(initial: (string | { pathname: string; state?: unknown })[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={initial} initialIndex={initial.length - 1}>
        <Where />
        <Nav />
        <Routes>
          <Route element={<Work />}>
            <Route path="/work" element={null} />
            <Route path="/estimates/:id" element={null} />
          </Route>
          <Route path="/estimates/:id/contract" element={<EstimateContractView />} />
          <Route path="/projects/:id" element={<p>project page</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return container;
}

const click = async (text: string) => {
  const button = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === text)!;
  await act(async () => button.click());
};

describe('estimates open in a drawer over the list', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    listRenders.length = 0;
    listMounts = 0;
  });
  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('a row opens the estimate in the drawer without reloading the list, and closing refreshes the list', async () => {
    await render(['/work']);
    expect(document.body.textContent).not.toContain('in drawer');
    await click('EST-2 row');
    expect(path).toBe('/estimates/e2');
    expect(document.body.textContent).toContain('estimate e2 in drawer');
    expect(document.body.textContent).toContain('EST-2 row'); // the list stays behind it
    expect(listMounts).toBe(1);

    await click('Back');
    await act(async () => jest.advanceTimersByTime(200)); // slide out
    expect(path).toBe('/work');
    expect(document.body.textContent).not.toContain('in drawer');
    expect(listRenders[listRenders.length - 1]).toBe(1);
    expect(listMounts).toBe(1);
  });

  it('a link from elsewhere opens the drawer, and closing goes back there', async () => {
    await render(['/projects/p1']);
    await act(async () => goTo('/estimates/e7'));
    expect(document.body.textContent).toContain('estimate e7 in drawer');
    await click('Back');
    await act(async () => jest.advanceTimersByTime(200));
    expect(path).toBe('/projects/p1');
  });

  it('opening an estimate URL directly closes to the list', async () => {
    await render(['/estimates/e9']);
    expect(document.body.textContent).toContain('estimate e9 in drawer');
    await click('Back');
    await act(async () => jest.advanceTimersByTime(200));
    expect(path).toBe('/work');
  });

  it('going to the contract and back, closing the estimate returns to the list, not the contract', async () => {
    await render(['/work']);
    await click('EST-2 row');
    await act(async () => goTo('/estimates/e2/contract')); // the Contract button
    await act(async () => {});
    expect(path).toBe('/estimates/e2/contract');
    await click('Back to Estimate');
    expect(path).toBe('/estimates/e2');
    await click('Back');
    await act(async () => jest.advanceTimersByTime(200));
    expect(path).toBe('/work');
  });

  it('a contract opened directly goes back to its estimate, and closing that goes to the list', async () => {
    await render(['/estimates/e3/contract']);
    await act(async () => {});
    await click('Back to Estimate');
    expect(path).toBe('/estimates/e3');
    await click('Back');
    await act(async () => jest.advanceTimersByTime(200));
    expect(path).toBe('/work');
  });
});
