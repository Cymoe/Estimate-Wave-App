import type { OutreachContact, OutreachContacts } from '../../../lib/api';
import { coverageOfRows, mergeChanged } from '../liveMerge';

const locked = { status: 'locked' as const };
const owner = (id: string, over: Partial<OutreachContact> = {}): OutreachContact =>
  ({
    id,
    key: `k-${id}`,
    name: `Owner ${id}`,
    company: `Owner ${id}`,
    mailing: {},
    properties: 1,
    totalValueCents: 100_000_00,
    why: '',
    kinds: ['commercial'],
    listIds: ['l1'],
    status: 'new',
    phones: [],
    emails: [],
    enrichment: { phone: locked, email: locked, person: locked, research: locked },
    signals: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  }) as OutreachContact;
const view = (rows: OutreachContact[]): OutreachContacts =>
  ({ rows, coverage: coverageOfRows(rows), balanceCents: 0, unlockCents: 100, researchCents: 25, researchQuestion: '' }) as OutreachContacts;

describe('putting changed owners into the view the page has', () => {
  it('replaces an owner where it stands, keeping its related owners and its client match, and recounts the columns', () => {
    const before = view([owner('a', { related: [{ id: 'z', name: 'Sister LLC' }], known: { kind: 'client', id: 'c1', name: 'Owner a' } }), owner('b')]);
    expect(before.coverage.phone).toEqual({ found: 0, total: 2, sources: 0 });
    const found = owner('a', { phones: [{ number: '4325550100', type: 'mobile', source: 'batchdata' }], enrichment: { phone: { status: 'found', source: 'batchdata' }, email: locked, person: locked, research: locked } });
    const after = mergeChanged(before, [found], { listId: 'l1' });
    expect(after.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(after.rows[0].phones).toHaveLength(1);
    // The feed doesn't carry these: the page keeps the ones it has.
    expect(after.rows[0].related).toEqual([{ id: 'z', name: 'Sister LLC' }]);
    expect(after.rows[0].known).toEqual({ kind: 'client', id: 'c1', name: 'Owner a' });
    expect(after.coverage.phone).toEqual({ found: 1, total: 2, sources: 1 });
    // The untouched owner is the same object: nothing to draw again.
    expect(after.rows[1]).toBe(before.rows[1]);
    // Once sent to Leads, the match is no longer shown.
    expect(mergeChanged(before, [owner('a', { leadId: 'lead1', status: 'lead' })], { listId: 'l1' }).rows[0].known).toBeUndefined();
  });

  it('drops an owner whose list tag went, adds a new one in the list order (or newest first), and leaves the view alone when nothing in it changed', () => {
    const before = view([owner('a', { totalValueCents: 300 }), owner('b', { totalValueCents: 100 })]);
    const order = { key: (r: OutreachContact) => r.totalValueCents };
    // Untagged from this list: gone from its view, still in All.
    expect(mergeChanged(before, [owner('a', { listIds: [] })], { listId: 'l1', order }).rows.map((r) => r.id)).toEqual(['b']);
    expect(mergeChanged(before, [owner('a', { listIds: [] })], {}).rows.map((r) => r.id)).toEqual(['a', 'b']);
    // A list still filling: the new owner takes its place in the list's order.
    expect(mergeChanged(before, [owner('c', { totalValueCents: 200 })], { listId: 'l1', order }).rows.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    // All owners: newest first, and it counts those on no list itself.
    const all = mergeChanged(before, [owner('d', { createdAt: '2026-11-09T00:00:00.000Z', listIds: [] })], {});
    expect(all.rows.map((r) => r.id)).toEqual(['d', 'a', 'b']);
    expect(all.unlisted).toBe(1);
    // Not on a list: only owners with no list belong.
    expect(mergeChanged(view([owner('u', { listIds: [] })]), [owner('u', { listIds: ['l2'] })], { unlisted: true }).rows).toEqual([]);
    // An owner of another list changed: this view is untouched (the same object).
    expect(mergeChanged(before, [owner('x', { listIds: ['l9'] })], { listId: 'l1', order })).toBe(before);
    expect(mergeChanged(before, [], { listId: 'l1' })).toBe(before);
  });
});
