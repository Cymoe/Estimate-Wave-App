import { createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../lib/api', () => ({ clientsAPI: { list: jest.fn(async () => []), create: jest.fn() } }));
jest.mock('../../../services/EstimateService', () => ({
  EstimateService: { nextNumber: jest.fn(async () => 'EST-1') },
  toLegacyClient: (c: unknown) => c,
}));
jest.mock('../../../services/MongoLineItemService', () => ({ MongoLineItemService: { list: jest.fn(async () => []), getAll: jest.fn(async () => []) } }));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../layouts/DashboardLayout', () => ({
  OrganizationContext: createContext({ selectedOrg: { id: 'org1', name: 'Peak Roofing' } }),
}));
jest.mock('../EstimateTableView', () => ({ EstimateTableView: () => null }));
jest.mock('../ContextualPricingSelector', () => ({ ContextualPricingSelector: () => null }));
jest.mock('../ClientSelector', () => ({ ClientSelector: () => null }));
jest.mock('../../clients/NewClientModal', () => ({ NewClientModal: () => null }));

import { CreateEstimateDrawer } from '../CreateEstimateDrawer';

const line = { id: 'l1', description: 'Tear-off', quantity: 1, unit_price: 850, price: 850, total_price: 850 };

async function render(props: Partial<React.ComponentProps<typeof CreateEstimateDrawer>>) {
  const onClose = jest.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<CreateEstimateDrawer isOpen onClose={onClose} onSave={jest.fn()} {...props} />));
  const close = () => act(async () => (document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
  return { onClose, close, root };
}

describe('closing a new estimate', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('asks before throwing away lines already added, and stays open on "Keep editing"', async () => {
    window.confirm = jest.fn(() => false);
    const { onClose, close, root } = await render({ preloadedItems: [line] as never });
    await close();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Discard this estimate?'));
    expect(onClose).not.toHaveBeenCalled();
    (window.confirm as jest.Mock).mockReturnValue(true);
    await close();
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('closes straight away when nothing has been added', async () => {
    window.confirm = jest.fn(() => true);
    const { onClose, close, root } = await render({ projectContext: { projectId: 'p1', clientId: '', projectName: 'Deck', projectBudget: 0 } });
    await close();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
