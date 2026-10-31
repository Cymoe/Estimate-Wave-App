import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../components/price-book/PriceBook', () => ({
  PriceBook: ({ triggerAddItem }: { triggerAddItem?: number }) => <p data-testid="items">add {triggerAddItem}</p>,
}));
jest.mock('../CostCodesPage', () => ({ __esModule: true, default: () => null }));
jest.mock('../../services/MongoLineItemService', () => ({ MongoLineItemService: { list: async () => [] } }));
jest.mock('../../lib/api', () => ({ costCodesAPI: { list: async () => [] } }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../components/layouts/DashboardLayout', () => {
  const { createContext } = jest.requireActual<typeof import('react')>('react');
  return { OrganizationContext: createContext({ selectedOrg: { id: 'o1' } }) };
});

import { PriceBook } from '../PriceBook';

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

it("opens Add Item straight away from the blue + button's Price book item, then tidies the address", async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/price-book/items?new=1']}>
        <PriceBook />
        <Where />
      </MemoryRouter>,
    ),
  );
  expect(container.querySelector('[data-testid="items"]')!.textContent).toBe('add 1');
  expect(container.querySelector('[data-testid="where"]')!.textContent).toBe('/price-book/items');
});
