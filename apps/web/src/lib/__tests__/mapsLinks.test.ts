import { fullAddress, mapsSearchUrl } from '../mapsLinks';

describe('maps links', () => {
  it('an address opens in Apple Maps, encoded', () => {
    expect(mapsSearchUrl('12 Oak St, Midland, TX 79701')).toBe('https://maps.apple.com/?q=12%20Oak%20St%2C%20Midland%2C%20TX%2079701');
  });

  it('builds the full address from its parts, skipping blanks', () => {
    expect(fullAddress('12 Oak St', 'Midland', 'TX', '79701')).toBe('12 Oak St, Midland, TX 79701');
    expect(fullAddress('12 Oak St', ' ', '', '79701')).toBe('12 Oak St, 79701');
    expect(fullAddress('12 Oak St')).toBe('12 Oak St');
    expect(fullAddress('', '')).toBe('');
  });
});
