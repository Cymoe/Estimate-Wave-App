import { changesSinceSigned, contractFor, missingBusinessDetails, DEFAULT_PAYMENT_TERMS } from '../contract';
import type { Estimate } from '../EstimateService';

const estimate = (overrides: Partial<Estimate> = {}): Estimate => ({
  id: 'e1',
  status: 'draft',
  issue_date: '2026-10-08',
  subtotal: 1000,
  total_amount: 1000,
  description: 'Bathroom remodel',
  client: { name: 'Dan Shah', email: 'dan@example.com', address: '1 Main St' },
  items: [
    { id: 'a', description: 'Vanity', quantity: 1, unit_price: 600, total_price: 600 },
    { id: 'b', description: 'Tile', quantity: 2, unit_price: 200, total_price: 400 },
  ],
  ...overrides,
});

const business = { name: 'Shah Builders', address: '9 Oak Ave', city: 'Austin', state: 'TX', email: 'hi@shah.example' };

describe('contractFor', () => {
  it('follows the estimate and the business while the estimate is open', () => {
    const contract = contractFor(estimate({ contract_terms: { startDate: '2026-11-01' } }), business);
    expect(contract).toMatchObject({
      clientName: 'Dan Shah',
      propertyAddress: '1 Main St',
      contractorName: 'Shah Builders',
      contractorAddress: '9 Oak Ave, Austin, TX',
      contractorEmail: 'hi@shah.example',
      workDescription: 'Bathroom remodel',
      totalAmount: 1000,
      startDate: '2026-11-01',
      paymentTerms: DEFAULT_PAYMENT_TERMS,
    });
    expect(contract.lineItems.map((item) => item.total)).toEqual([600, 400]);
    expect(contract.lockedAt).toBeUndefined();
  });

  it('shows the contract as signed once the estimate is accepted', () => {
    const contract = contractFor(
      estimate({
        total_amount: 1500, // changed after signing
        contract_locked_at: '2026-10-11T07:00:00Z',
        contract_snapshot: {
          client: { name: 'Dan Shah', address: '1 Main St, Austin' },
          items: [{ _id: 'a', description: 'Vanity', quantity: 1, unitPrice: 1000, totalPrice: 1000 }],
          totalAmount: 1000,
          terms: { paymentTerms: 'Net 30' },
        },
      }),
      business,
    );
    expect(contract).toMatchObject({
      totalAmount: 1000,
      propertyAddress: '1 Main St, Austin',
      paymentTerms: 'Net 30',
      lockedAt: '2026-10-11T07:00:00Z',
    });
    expect(contract.lineItems).toHaveLength(1);
  });

  it('leaves the business blank when the organization has no details yet', () => {
    expect(contractFor(estimate(), null).contractorName).toBe('');
    expect(missingBusinessDetails(null)).toEqual(['business name', 'address', 'email or phone']);
    expect(missingBusinessDetails(business)).toEqual([]);
  });
});

describe('changesSinceSigned', () => {
  it('is null until the estimate is accepted', () => {
    expect(changesSinceSigned(estimate())).toBeNull();
  });

  it('lists changed, added and removed items and the cost difference', () => {
    const result = changesSinceSigned(
      estimate({
        total_amount: 1350,
        items: [
          { id: 'a', description: 'Vanity', quantity: 1, unit_price: 750, total_price: 750 },
          { id: 'c', description: 'Mirror', quantity: 1, unit_price: 600, total_price: 600 },
        ],
        contract_locked_at: '2026-10-11T07:00:00Z',
        contract_snapshot: {
          items: [
            { _id: 'a', description: 'Vanity', totalPrice: 600 },
            { _id: 'b', description: 'Tile', totalPrice: 400 },
          ],
          totalAmount: 1000,
        },
      }),
    );
    expect(result).toEqual({
      changes: [
        { description: 'Vanity', before: 600, after: 750 },
        { description: 'Mirror', after: 600 },
        { description: 'Tile', before: 400 },
      ],
      difference: 350,
    });
  });
});

describe('agreed design', () => {
  it('comes from the estimate, or from the signed contract once accepted', () => {
    const design = { url: 'https://files.example/a.png', name: 'a.png', type: 'image/png' };
    expect(contractFor(estimate({ design })).agreedDesign).toEqual(design);
    const signed = contractFor(
      estimate({
        design: undefined,
        contract_locked_at: '2026-10-11T07:00:00Z',
        contract_snapshot: { items: [], totalAmount: 0, design: { url: 'https://files.example/b.pdf', name: 'b.pdf', contentType: 'application/pdf' } },
      }),
    );
    expect(signed.agreedDesign).toEqual({ url: 'https://files.example/b.pdf', name: 'b.pdf', type: 'application/pdf' });
  });
});
