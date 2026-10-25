/** Why a lead was marked "not a lead", in the words staff pick from. */
export const DISPOSITIONS: Array<[string, string]> = [
  ['not_reached', 'Never reached them'],
  ['duplicate', 'Same homeowner as another lead'],
  ['out_of_area', 'Outside the counties we sell'],
  ['renter', 'Renter, not the owner'],
  ['wrong_trade', 'Not work we sell'],
  ['not_interested', 'Not interested any more'],
  ['bad_number', 'Bad number'],
  ['other', 'Something else'],
];

/** Where a confirmed lead went, in a few words: "Sold to Peak Roofing · $250.00", "In the Vault", "For sale in the Marketplace". */
export function destinationLabel(listed: { status: string; companyName?: string; priceCents?: number } | null | undefined): string | null {
  if (!listed) return null;
  if (listed.companyName) {
    const price = listed.priceCents ? ` · $${(listed.priceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
    return `${listed.status === 'credited' ? 'Credited back to' : 'Sold to'} ${listed.companyName}${price}`;
  }
  if (listed.status === 'older' || listed.status === 'archived') return 'In the Vault';
  if (listed.status === 'available') return 'For sale in the Marketplace';
  return 'Listed';
}

/** The reason a lead was marked "not a lead", as staff picked it. */
export const reasonLabel = (disposition?: string) =>
  DISPOSITIONS.find(([value]) => value === disposition)?.[1] ?? disposition?.replace(/_/g, ' ') ?? '';
