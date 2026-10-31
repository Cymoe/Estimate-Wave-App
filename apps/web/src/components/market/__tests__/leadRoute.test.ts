import { leadRoute } from '../leadRoute';

describe('where a lead came from', () => {
  it('a sold lead reads as the network, whether it was sold before or after the renames', () => {
    expect(leadRoute({ marketplaceLeadId: 'm1', wonVia: 'bid', pricePaidCents: 30000, source: 'Webb Leads' })).toBe('Won with a bid · $300.00');
    // Its own leads never say "Added by hand · FieldQuote Lead" for old stored values.
    expect(leadRoute({ source: 'FieldQuote Lead' })).toBe('Added by hand');
    expect(leadRoute({ source: 'Tolliver Lead' })).toBe('Added by hand');
    expect(leadRoute({ source: 'Webb Leads' })).toBe('Added by hand');
    expect(leadRoute({ source: 'Referral' })).toBe('Added by hand · Referral');
  });
});
