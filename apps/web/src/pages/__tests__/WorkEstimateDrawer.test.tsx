import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listRenders: number[] = [];
let highlighted: string | undefined;
let listMounts = 0;
jest.mock('../../components/estimates/EstimatesList', () => {
  const { useEffect } = jest.requireActual('react');
  const { useNavigate } = jest.requireActual('react-router-dom');
  return {
    EstimatesList: ({ refreshTrigger, selectedId }: { refreshTrigger?: number; selectedId?: string }) => {
      highlighted = selectedId;
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
// The project drawer itself is tested with ProjectDetails; here only where it opens and closes to.
// Like the real one, it portals onto document.body.
jest.mock('../../components/projects/ProjectDetails', () => {
  const { createPortal } = jest.requireActual('react-dom');
  return {
    ProjectDetailsDrawer: ({ projectId, onClose }: { projectId: string; onClose: () => void }) =>
      createPortal(
        <div role="dialog" aria-label="Project">
          <span>{`project ${projectId} on top`}</span>
          <button onClick={onClose}>Close project</button>
        </div>,
        document.body,
      ),
  };
});
jest.mock('../../services/EstimateService', () => ({ EstimateService: { getById: async () => null } }));
jest.mock('../../lib/api', () => ({ organizationsAPI: { getById: async () => null } }));
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
            <Route path="/estimates/:id/project/:projectId" element={null} />
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

  it('the open estimate is highlighted, and stops being highlighted as soon as closing starts', async () => {
    await render(['/work']);
    await click('EST-2 row');
    expect(highlighted).toBe('e2');
    await click('Back');
    // Still sliding out, but the row is no longer highlighted.
    expect(path).toBe('/estimates/e2');
    expect(highlighted).toBeUndefined();
    await act(async () => jest.advanceTimersByTime(200));
    expect(path).toBe('/work');
    expect(highlighted).toBeUndefined();
  });

  it("an estimate's project opens in a drawer on top of it, and closing it shows the same estimate", async () => {
    await render(['/work']);
    await click('EST-2 row');
    await act(async () => goTo('/estimates/e2/project/p1')); // the project name on the estimate
    expect(path).toBe('/estimates/e2/project/p1');
    const dialogs = Array.from(document.body.querySelectorAll('[role="dialog"]'));
    // The estimate stays mounted behind (hidden from assistive tech); the project is on top.
    expect(dialogs.map((d) => d.getAttribute('aria-label'))).toEqual(['Estimate', 'Project']);
    expect(dialogs[0].getAttribute('aria-hidden')).toBe('true');
    expect(document.body.textContent).toContain('estimate e2 in drawer');
    expect(document.body.textContent).toContain('project p1 on top');
    expect(listMounts).toBe(1); // nothing behind it reloaded

    // Esc belongs to the project on top, not the covered estimate.
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(path).toBe('/estimates/e2/project/p1');

    await click('Close project');
    expect(path).toBe('/estimates/e2');
    expect(document.body.textContent).toContain('estimate e2 in drawer');
    expect(document.body.querySelector('[aria-label="Estimate"]')!.getAttribute('aria-hidden')).toBeNull();
  });

  it('opened straight onto an estimate\'s project, closing it goes to that estimate', async () => {
    await render(['/estimates/e5/project/p2']);
    await click('Close project');
    expect(path).toBe('/estimates/e5');
    expect(document.body.textContent).toContain('estimate e5 in drawer');
  });
});
