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

describe("the estimate's project", () => {
  it('opens the project marked to come back to this estimate when it closes', async () => {
    const estimate = { id: 'e1', project: { id: 'p1', name: 'Miller kitchen' } } as unknown as Estimate;
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter initialEntries={['/estimates/e1?tab=items']}>
          <Where />
          <Routes>
            <Route path="/estimates/:id" element={<EstimateProject estimate={estimate} onChanged={() => {}} />} />
            <Route path="/projects/:id" element={null} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    const link = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Miller kitchen')!;
    await act(async () => link.click());
    expect(where).toEqual({ path: '/projects/p1', search: '?tab=estimates', state: { returnTo: '/estimates/e1?tab=items' } });
  });
});
