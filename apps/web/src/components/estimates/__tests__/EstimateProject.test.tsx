import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../services/EstimateService', () => ({ EstimateService: {} }));
jest.mock('../../../services/ProjectService', () => ({ ProjectService: {} }));

import { EstimateProject } from '../EstimateProject';
import type { Estimate } from '../../../services/EstimateService';

let where: { path: string; search: string; state: unknown } = { path: '', search: '', state: null };
const Where = () => {
  const location = useLocation();
  where = { path: location.pathname, search: location.search, state: location.state };
  return null;
};

async function tapProject(at: string, routePath: string) {
  const estimate = { id: 'e1', project: { id: 'p1', name: 'Miller kitchen' } } as unknown as Estimate;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[at]}>
        <Where />
        <Routes>
          <Route path={routePath} element={<EstimateProject estimate={estimate} onChanged={() => {}} />} />
          <Route path="/estimates/:id/project/:projectId" element={null} />
          <Route path="/projects/:id" element={null} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  const link = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Miller kitchen')!;
  await act(async () => link.click());
}

describe("the estimate's project", () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('on the estimates page, opens in a drawer on top of this estimate', async () => {
    await tapProject('/estimates/e1?tab=items', '/estimates/:id');
    expect(where).toEqual({ path: '/estimates/e1/project/p1', search: '?tab=estimates', state: null });
  });

  it('anywhere else, opens the project marked to come back here when it closes', async () => {
    await tapProject('/clients/c1', '/clients/:id');
    expect(where).toEqual({ path: '/projects/p1', search: '?tab=estimates', state: { returnTo: '/clients/c1' } });
  });
});
