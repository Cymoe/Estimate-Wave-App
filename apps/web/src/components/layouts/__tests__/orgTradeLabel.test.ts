import { orgTradeLabel } from '../orgTradeLabel';
import { NO_TRADES_LABEL } from '../../settings/tradesLabels';

describe("the label under a company's name", () => {
  it('uses the real trade names, and nudges when there are none', () => {
    const names = new Map([['hvac', 'HVAC'], ['concrete', 'Concrete']]);
    expect(orgTradeLabel({ leadTrades: ['concrete', 'hvac'] }, names)).toBe('Concrete, HVAC');
    expect(orgTradeLabel({ leadTrades: ['window-door'] }, names)).toBe('Window Door');
    expect(orgTradeLabel({ leadTrades: [] }, names)).toBe(NO_TRADES_LABEL);
    expect(orgTradeLabel({}, names)).toBe('Add your trades');
  });
});
