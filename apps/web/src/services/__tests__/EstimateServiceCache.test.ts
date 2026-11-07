const doc = (id: string, total: number) => ({
  _id: id,
  estimateNumber: `EST-${id}`,
  status: 'draft',
  issueDate: '2026-10-08',
  subtotal: total,
  totalAmount: total,
  clientId: 'c1',
  items: [],
});
let rows = [doc('e1', 100)];
jest.mock('../../lib/api', () => ({
  estimatesAPI: {
    list: async () => rows,
    update: async (id: string) => ({ ...doc(id, 300) }),
    delete: async () => {},
  },
  clientsAPI: { list: async () => [{ _id: 'c1', name: 'Dan Shah' }], getById: async () => null },
  projectsAPI: { list: async () => [], getById: async () => null },
}));

import { EstimateService } from '../EstimateService';

describe('EstimateService cache', () => {
  it('keeps what the list loaded, updates it, and forgets deleted estimates', async () => {
    expect(EstimateService.cached('e1')).toBeUndefined();
    await EstimateService.list('org1');
    expect(EstimateService.cached('e1')).toMatchObject({ total_amount: 100, client: { name: 'Dan Shah' } });

    // An update's copy has no client details; the known client is kept.
    await EstimateService.update('e1', { title: 'New' });
    expect(EstimateService.cached('e1')).toMatchObject({ total_amount: 300, client: { name: 'Dan Shah' } });

    await EstimateService.delete('e1');
    expect(EstimateService.cached('e1')).toBeUndefined();
  });
});
