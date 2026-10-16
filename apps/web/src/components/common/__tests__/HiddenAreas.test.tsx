import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' } }) }));

import { QuickCreateMenu } from '../QuickCreateMenu';
import { FEATURES, HOME_PATH } from '../../../config/features';

describe('areas switched off for now', () => {
  it('Profit Tracker and Projects are off, and people land on Leads', () => {
    expect(FEATURES).toEqual({ profitTracker: false, projects: false });
    expect(HOME_PATH).toBe('/leads');
  });

  it('the + button no longer offers a Project', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter>
          <QuickCreateMenu isOpen onClose={() => {}} />
        </MemoryRouter>,
      ),
    );
    const labels = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
    expect(labels.join(' ')).toContain('Lead');
    expect(labels.join(' ')).toContain('Estimate');
    expect(labels.join(' ')).not.toContain('Project');
  });
});
