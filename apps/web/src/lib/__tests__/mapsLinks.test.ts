import { fullAddress, mapsSearchUrl, prefersAppleMaps } from '../mapsLinks';

const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

describe('maps links', () => {
  it('Apple devices (an iPad says it is a Mac) get Apple Maps; the rest get Google Maps', () => {
    expect([IPAD, IPHONE].map((ua) => prefersAppleMaps(ua))).toEqual([true, true]);
    expect([WINDOWS, ANDROID].map((ua) => prefersAppleMaps(ua))).toEqual([false, false]);
  });

  it('an address opens in the right app, encoded', () => {
    const at = '12 Oak St, Midland, TX 79701';
    expect(mapsSearchUrl(at, IPHONE)).toBe('https://maps.apple.com/?q=12%20Oak%20St%2C%20Midland%2C%20TX%2079701');
    expect(mapsSearchUrl(at, ANDROID)).toBe('https://www.google.com/maps/search/?api=1&query=12%20Oak%20St%2C%20Midland%2C%20TX%2079701');
  });

  it('builds the full address from its parts, skipping blanks', () => {
    expect(fullAddress('12 Oak St', 'Midland', 'TX', '79701')).toBe('12 Oak St, Midland, TX 79701');
    expect(fullAddress('12 Oak St', ' ', '', '79701')).toBe('12 Oak St, 79701');
    expect(fullAddress('12 Oak St')).toBe('12 Oak St');
    expect(fullAddress('', '')).toBe('');
  });
});
