import { withId } from '../withId';

describe('withId', () => {
  it('aliases _id as id on rows at the top level and inside the lists an object carries', () => {
    const inbox = withId({
      available: [{ _id: 'm1', name: 'Jane' }],
      older: [],
      archivedCount: 2,
      sold: [{ _id: 'm2', name: 'Bob', companyName: 'Peak' }],
    });
    expect(inbox.available[0]).toEqual({ _id: 'm1', id: 'm1', name: 'Jane' });
    expect(inbox.sold[0].id).toBe('m2');
    expect(inbox.archivedCount).toBe(2);
    expect(withId([{ _id: 'a' }, { _id: 'b', id: 'keep' }])).toEqual([{ _id: 'a', id: 'a' }, { _id: 'b', id: 'keep' }]);
    expect(withId({ _id: 'w', transactions: [{ _id: 't1' }] })).toEqual({ _id: 'w', id: 'w', transactions: [{ _id: 't1', id: 't1' }] });
    expect(withId(null)).toBeNull();
    expect(withId(3)).toBe(3);
  });
});
