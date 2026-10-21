import { allOutsideMyTrades, inMyTrades } from '../tradeScope';

const codes = [
  { id: 'cc-concrete', industry_id: 'concrete' },
  { id: 'cc-hvac', industry: { id: 'hvac' } },
  { id: 'cc-loose', industry_id: null },
];
const items = [
  { id: 'slab', cost_code_id: 'cc-concrete' },
  { id: 'heat-pump', cost_code_id: 'cc-hvac' },
  { id: 'misc', cost_code_id: 'cc-loose' },
  { id: 'custom', cost_code_id: undefined },
];

describe('My trades in the Price Book', () => {
  it("keeps items for the company's trades and anything it can't place", () => {
    expect(inMyTrades(items, codes, new Set(['concrete'])).map((i) => i.id)).toEqual(['slab', 'misc', 'custom']);
    expect(inMyTrades(items, codes, new Set(['concrete', 'hvac'])).map((i) => i.id)).toEqual(['slab', 'heat-pump', 'misc', 'custom']);
  });
  it('hides nothing when no trades are picked', () => {
    expect(inMyTrades(items, codes, new Set())).toEqual(items);
  });
  it('knows when your trades hide every item, so the page can offer all trades', () => {
    const placed = items.slice(0, 2);
    expect(allOutsideMyTrades(placed, codes, new Set(['roofing']))).toBe(true);
    expect(allOutsideMyTrades(placed, codes, new Set(['concrete']))).toBe(false);
    expect(allOutsideMyTrades([], codes, new Set(['roofing']))).toBe(false);
    expect(allOutsideMyTrades(placed, codes, new Set())).toBe(false);
  });
});
