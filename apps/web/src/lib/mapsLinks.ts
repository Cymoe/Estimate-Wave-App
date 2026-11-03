/**
 * Where an address opens: Apple Maps on iPhone, iPad and Mac (iPadOS reports
 * itself as a Mac), Google Maps everywhere else.
 */
export const prefersAppleMaps = (ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '') =>
  /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua);

/** Turn-by-turn directions to the address in the device's maps app. */
export const directionsUrl = (address: string, ua?: string) =>
  prefersAppleMaps(ua)
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

/** The address shown in the device's maps app. */
export const mapsSearchUrl = (address: string, ua?: string) =>
  prefersAppleMaps(ua)
    ? `https://maps.apple.com/?q=${encodeURIComponent(address)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** "Apple Maps" or "Google Maps", for button labels. */
export const mapsAppName = (ua?: string) => (prefersAppleMaps(ua) ? 'Apple Maps' : 'Google Maps');

/** "12 Oak St, Midland, TX 79701" from its parts, skipping blanks. State and zip read "TX 79701". */
export function fullAddress(street?: string, city?: string, state?: string, zip?: string): string {
  const tail = [state?.trim(), zip?.trim()].filter(Boolean).join(' ');
  return [street?.trim(), city?.trim(), tail].filter(Boolean).join(', ');
}
