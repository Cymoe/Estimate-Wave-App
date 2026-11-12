/** The address in Apple Maps (the app on iPhone, iPad and Mac; maps.apple.com in any other browser). */
export const mapsSearchUrl = (address: string) => `https://maps.apple.com/?q=${encodeURIComponent(address)}`;

/** "12 Oak St, Midland, TX 79701" from its parts, skipping blanks. State and zip read "TX 79701". */
export function fullAddress(street?: string, city?: string, state?: string, zip?: string): string {
  const tail = [state?.trim(), zip?.trim()].filter(Boolean).join(' ');
  return [street?.trim(), city?.trim(), tail].filter(Boolean).join(', ');
}
