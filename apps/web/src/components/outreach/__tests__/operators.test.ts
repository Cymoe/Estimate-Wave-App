import type { OutreachContact } from '../../../lib/api';
import { operatorBasis, operatorHolding, operatorList, operatorPhones, operatorsOf, operatorWaiting, ownerItems, sortByOperator } from '../operators';

const locked = { status: 'locked' as const };
const found = { status: 'found' as const, at: '2026-11-05T15:01:00Z', source: 'tx-comptroller' };
const owner = (id: string, name: string, over: Record<string, unknown> = {}): OutreachContact =>
  ({
    id,
    key: `k-${id}`,
    name,
    company: name,
    mailing: { address: `${id} MAIN ST`, city: 'MIDLAND', state: 'TX', zip: '79701' },
    properties: 1,
    totalValueCents: 100_000_000,
    why: '',
    kinds: ['investor'],
    listIds: ['l1'],
    status: 'new',
    phones: [],
    emails: [],
    enrichment: { phone: locked, email: locked, person: locked, research: locked },
    signals: [],
    createdAt: '2026-11-05T15:00:00Z',
    ...over,
  }) as unknown as OutreachContact;
const karen = { name: 'Karen Holt', title: 'General partner', source: 'tx-comptroller' };

describe('the person behind the owners on the page', () => {
  it('adds up what a person holds across their companies and says why they are shown as one', () => {
    const rows = [
      owner('a', 'Bluebonnet Holdings LLC', { person: karen, properties: 60, totalValueCents: 2_000_000_000 }),
      owner('b', 'City Of Midland'),
      owner('c', 'Permian Storage LP', { person: karen, properties: 40, totalValueCents: 1_500_000_000 }),
      // The same number as one of hers, with nobody named: hers too, though her name is on two of the three.
      owner('d', 'Wall Street Lofts LLC', { properties: 28, totalValueCents: 620_000_000, phones: [{ number: '4325557001', type: 'mobile', source: 'batchdata' }] }),
    ];
    rows[0] = { ...rows[0], phones: [{ number: '4325557002', type: 'landline', dnc: true, source: 'batchdata' }, { number: '4325557001', type: 'mobile', source: 'batchdata' }] } as OutreachContact;
    const ops = operatorsOf(rows);
    const op = ops.get('a')!;
    expect(ops.get('c')).toBe(op);
    expect(ops.get('d')).toBe(op);
    expect(ops.get('b')).toBeUndefined();
    expect(op.label).toBe('Karen Holt');
    expect(operatorHolding(op)).toBe('3 entities · 128 properties · $41.2M');
    expect(operatorBasis(op)).toBe('Same decision maker on 2 of 3');
    // Each number once, the one that can be called first.
    expect(operatorPhones(op).map((p) => p.number)).toEqual(['4325557001', '4325557002']);
    expect(operatorList(ops)).toEqual([op]);
  });

  it('a family of companies with nobody named goes by the family name; a person owning in their own name by theirs', () => {
    const family = operatorsOf([owner('a', 'NUKA HIVA ALPHA 1-54 LLC'), owner('b', 'NUKA HIVA ALPHA 55-106 LLC')]).get('a')!;
    expect(family.label).toBe('Nuka Hiva Alpha');
    expect(operatorBasis(family)).toBe('Sister companies');
    const mail = { emails: [{ email: 'pat@towers.example', source: 'batchdata' }] };
    const own = operatorsOf([owner('a', 'Tall City Towers LLC', mail), owner('b', 'Vance Pat', { company: undefined, ...mail })]).get('a')!;
    expect(own.label).toBe('Vance Pat');
    expect(operatorBasis(own)).toBe('Same email');
    // An address the contact check says is someone else's ties nobody to it.
    const others = { emails: [{ email: 'office@towers.example', source: 'batchdata', nameMatch: false }] };
    expect(operatorsOf([owner('a', 'Tall City Towers LLC', others), owner('b', 'Vance Pat', { company: undefined, ...others })]).size).toBe(0);
  });

  it('what a send to Leads goes by leaves out simulated and sample results', () => {
    const sim = { ...found, simulated: true };
    const rows = [
      owner('a', 'Bluebonnet Holdings LLC', { person: karen, enrichment: { person: found, phone: locked, email: locked } }),
      owner('b', 'Permian Storage LP', { person: karen, enrichment: { person: found, phone: locked, email: locked } }),
      owner('c', 'Wall Street Lofts LLC', { person: karen, enrichment: { person: sim, phone: locked, email: locked } }),
      owner('d', 'Caddo Plaza LLC', { person: karen, note: 'Sample data to show the layout, not a real lookup.', enrichment: { person: found, phone: locked, email: locked } }),
    ];
    expect(operatorsOf(rows).get('a')!.members.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
    const sure = operatorsOf(rows, { realOnly: true });
    expect(sure.get('a')!.members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(sure.get('c')).toBeUndefined();
    expect(sure.get('d')).toBeUndefined();
  });

  it("draws a person where the first of their companies stands, their companies under them only when open, and counts who is still to send", () => {
    const rows = [
      owner('a', 'City Of Midland'),
      owner('b', 'Bluebonnet Holdings LLC', { person: karen, status: 'lead', leadId: 'lead1' }),
      owner('c', 'Tall City Towers LLC'),
      owner('d', 'Permian Storage LP', { person: karen, status: 'skip' }),
      owner('e', 'Wall Street Lofts LLC', { person: karen, properties: 9 }),
    ];
    const ops = operatorsOf(rows);
    const drawn = (open: boolean, shown = rows) => ownerItems(shown, ops, () => open).map((i) => (i.kind === 'operator' ? `${i.op.label} (${i.shown.length})` : `${i.op ? '  ' : ''}${i.row.name}`));
    expect(drawn(false)).toEqual(['City Of Midland', 'Karen Holt (3)', 'Tall City Towers LLC']);
    expect(drawn(true)).toEqual(['City Of Midland', 'Karen Holt (3)', '  Bluebonnet Holdings LLC', '  Permian Storage LP', '  Wall Street Lofts LLC', 'Tall City Towers LLC']);
    // A filter that keeps one of hers still draws her line over it.
    expect(drawn(true, [rows[0], rows[4]])).toEqual(['City Of Midland', 'Karen Holt (1)', '  Wall Street Lofts LLC']);
    // Without groups the rows are drawn as they are.
    expect(ownerItems(rows, undefined, () => true).every((i) => i.kind === 'owner')).toBe(true);
    // One is in Leads and one skipped: one still waits.
    expect(operatorWaiting(ops.get('b')!).map((m) => m.id)).toEqual(['e']);
    // A to Z goes by the person's name; most parcels by all they hold.
    expect(sortByOperator(rows, ops, 'name').map((r) => r.id)).toEqual(['a', 'b', 'd', 'e', 'c']);
    expect(sortByOperator(rows, ops, 'parcels').map((r) => r.id)).toEqual(['e', 'b', 'd', 'a', 'c']);
  });
});
