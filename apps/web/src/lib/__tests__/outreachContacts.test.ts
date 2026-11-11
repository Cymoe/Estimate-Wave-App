// outreachAPI.contacts reads a view from the server a page at a time and puts it together.

const query = jest.fn();
jest.mock('../convex', () => ({ convex: { query: (...args: unknown[]) => query(...args), watchQuery: jest.fn() } }));
jest.mock('../../../convex/_generated/api', () => ({
  api: { outreach: { contactsPage: 'outreach:contactsPage', contacts: 'outreach:contacts' } },
}));

import { outreachAPI, type OutreachContacts } from '../api';

const locked = { status: 'locked' };
const owner = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  key: id,
  name: `Owner ${id}`,
  mailing: {},
  properties: 1,
  totalValueCents: 0,
  why: '',
  kinds: ['investor'],
  listIds: ['l1'],
  status: 'new',
  phones: [],
  emails: [],
  enrichment: { phone: locked, email: locked, person: locked, research: locked },
  signals: [],
  related: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});
const facts = { balanceCents: 500, freeLookups: 2, unlockCents: 100, researchCents: 25, researchQuestion: 'Q', unlisted: 0, asOf: '2026-11-05T15:00:00.000Z' };

beforeEach(() => query.mockReset());

describe('outreachAPI.contacts', () => {
  it('reads the pages in turn, shows the view so far after each but the last, and returns every owner once, in order, with the counts', async () => {
    const pages: Record<string, unknown> = {
      start: { rows: [owner('a', { totalValueCents: 100 }), owner('b', { totalValueCents: 300, phones: [{ number: '+14325550100' }] })], cursor: 'c1', facts: { ...facts, definition: { county: 'Midland', who: 'commercial' } } },
      c1: { rows: [owner('b', { totalValueCents: 300, phones: [{ number: '+14325550100' }] }), owner('c', { totalValueCents: 200 })], cursor: 'c2' },
      c2: { rows: [owner('d', { totalValueCents: 50 })], cursor: null },
    };
    query.mockImplementation(async (_ref: string, args: { cursor: string | null }) => pages[args.cursor ?? 'start']);
    const early: OutreachContacts[] = [];
    const view = await outreachAPI.contacts('o1', 'l1', (c) => early.push(c));
    expect(query.mock.calls.map(([ref, args]) => [ref, args])).toEqual([
      ['outreach:contactsPage', { organizationId: 'o1', listId: 'l1', cursor: null }],
      ['outreach:contactsPage', { organizationId: 'o1', listId: 'l1', cursor: 'c1' }],
      ['outreach:contactsPage', { organizationId: 'o1', listId: 'l1', cursor: 'c2' }],
    ]);
    // The first owners while the rest arrive, marked as not all there yet.
    expect(early.map((c) => [c.rows.map((r) => r.id), c.partial])).toEqual([
      [['b', 'a'], true],
      [['b', 'c', 'a'], true],
    ]);
    // All of it: the list's own order (most valuable first), the owner two pages carried once, the counts from the rows.
    expect(view.rows.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(view.partial).toBeUndefined();
    expect(view.coverage.phone).toEqual({ found: 1, total: 4, sources: 0 });
    expect(view).toMatchObject({ balanceCents: 500, freeLookups: 2, asOf: '2026-11-05T15:00:00.000Z' });
    expect(view).not.toHaveProperty('definition');
  });

  it('All owners and Not on a list come newest first; a short view is one read', async () => {
    query.mockResolvedValue({ rows: [owner('old', { createdAt: '2026-10-01T00:00:00.000Z' }), owner('new', { createdAt: '2026-11-02T00:00:00.000Z' })], cursor: null, facts });
    const onPage = jest.fn();
    expect((await outreachAPI.contacts('o1', undefined, onPage)).rows.map((r) => r.id)).toEqual(['new', 'old']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('outreach:contactsPage', { organizationId: 'o1', cursor: null });
    expect(onPage).not.toHaveBeenCalled();
    await outreachAPI.contacts('o1', 'unlisted');
    expect(query).toHaveBeenLastCalledWith('outreach:contactsPage', { organizationId: 'o1', unlisted: true, cursor: null });
  });

  it('a backend a version behind (no pages yet) is read whole, as before; a real failure is reported as it came', async () => {
    const whole = { rows: [owner('a')], coverage: {}, ...facts };
    query.mockImplementation(async (ref: string) => {
      if (ref === 'outreach:contactsPage') throw new Error("Could not find public function for 'outreach:contactsPage'");
      return whole;
    });
    expect((await outreachAPI.contacts('o1', 'l1')).rows.map((r) => r.id)).toEqual(['a']);
    query.mockRejectedValue(new Error('Outreach is part of the Pro plan'));
    await expect(outreachAPI.contacts('o1', 'l1')).rejects.toThrow('Outreach is part of the Pro plan');
  });
});
