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

/** The reason a lead was marked "not a lead", as staff picked it. */
export const reasonLabel = (disposition?: string) =>
  DISPOSITIONS.find(([value]) => value === disposition)?.[1] ?? disposition?.replace(/_/g, ' ') ?? '';
