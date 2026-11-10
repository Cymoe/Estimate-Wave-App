// The ready-made Outreach lists: the + sheet's rows and the empty page's cards.

import type { OutreachDefinition } from '../../lib/api';

export type Preset = {
  label: string;
  /** One short line for the card on the empty Outreach page. */
  blurb: string;
  definition: OutreachDefinition;
  explanation: string;
};

const COUNTY = 'Midland';
const NO_PHONES = 'Names and mailing addresses; no phone numbers.';

/** The ready-made lists, in three short rows so a heading finds the row and the row finds the list. One tap builds the exact filter, no guessing from words. */
export const GROUPS: Array<{ heading: string; presets: Preset[] }> = [
  {
    heading: 'Commercial and investors',
    presets: [
      { label: 'Owners of 3+ commercial buildings', blurb: 'Landlords with several buildings, so several roofs and systems', definition: { county: COUNTY, who: 'portfolio', minParcels: 3 }, explanation: `One owner, several storefronts or buildings: the landlord whose roofs and systems come due in turn, most buildings first. ${NO_PHONES}` },
      { label: 'Shopping center owners', blurb: 'Owners of commercial buildings, biggest holdings first', definition: { county: COUNTY, who: 'commercial' }, explanation: `Owners of commercial buildings on the roll, biggest holdings first. ${NO_PHONES}` },
      { label: 'New businesses moving in', blurb: 'Tenants who moved into a space in the last year', definition: { county: COUNTY, who: 'occupant' }, explanation: 'Businesses that moved into a space they don\'t own in the last year, newest first: from certificates of occupancy, the tenant named on a build-out permit, and state sales-tax permits. Phones on their permits come along free.' },
      { label: 'Apartment owners', blurb: 'Owners of apartment and multifamily buildings', definition: { county: COUNTY, who: 'multifamily' }, explanation: `Owners of apartment buildings and multifamily, biggest holdings first. ${NO_PHONES}` },
      { label: 'Company investors with 5+ properties', blurb: 'Companies holding five or more Midland properties', definition: { county: COUNTY, who: 'investor', companyOwned: true, minParcels: 5 }, explanation: `Companies holding five or more Midland properties, most first. ${NO_PHONES}` },
      { label: 'Property managers', blurb: 'Offices handling several owners’ properties', definition: { county: COUNTY, who: 'manager' }, explanation: `Offices that receive the tax bills for several owners' properties. ${NO_PHONES}` },
    ],
  },
  {
    heading: 'Homeowners',
    presets: [
      { label: 'Code violations', blurb: 'Owners the city cited in the last two years', definition: { county: COUNTY, who: 'violation' }, explanation: `Owners the city cited in the last two years, newest case first, with the trade each case calls for. ${NO_PHONES}` },
      { label: 'Stalled permits', blurb: 'Permits that expired before the work was finished', definition: { county: COUNTY, who: 'stalled' }, explanation: `Owners whose permit expired before the work was finished, newest first. ${NO_PHONES}` },
      { label: 'Landlords with 3+ rental homes', blurb: 'Small landlords: repeat work, and they say yes fast', definition: { county: COUNTY, who: 'investor', minParcels: 3, minRentals: 3 }, explanation: `People and their LLCs renting out three or more Midland homes, most homes first: repeat roofs, HVAC and turnovers. ${NO_PHONES}` },
      { label: 'Owned 20+ years', blurb: 'Homes held long enough to need a roof, HVAC, or a remodel', definition: { county: COUNTY, who: 'long_owned', ownedForDays: 7305 }, explanation: `Owner-occupied homes held twenty years or more, longest first. ${NO_PHONES}` },
      { label: 'Recent buyers', blurb: 'New owners from the last year, often fixing things up', definition: { county: COUNTY, who: 'recent_buyer' }, explanation: `Owners who took their deed in the last year, newest first. ${NO_PHONES}` },
      { label: 'Absentee owners', blurb: 'Owners who live somewhere else', definition: { county: COUNTY, who: 'absentee' }, explanation: `Owners whose tax bill goes to another address, most properties first. ${NO_PHONES}` },
      { label: 'Homes over $1M', blurb: 'Owner-occupied homes appraised over $1M', definition: { county: COUNTY, who: 'wealthy', minValueCents: 100_000_000 }, explanation: `Owner-occupied homes appraised over $1M, highest first. ${NO_PHONES}` },
    ],
  },
  {
    heading: 'People who bring work',
    presets: [
      { label: 'Contractors pulling permits', blurb: 'Busy companies on recent permits, with their phones', definition: { county: COUNTY, who: 'contractor' }, explanation: 'Companies named on permits in the last 180 days, busiest first; the phone and email on their permits come along free.' },
      { label: 'Architects & engineers', blurb: 'Design firms on recent commercial permits', definition: { county: COUNTY, who: 'designer' }, explanation: 'Design firms named on commercial permits in the last 180 days, busiest first; the phone and email on their permits come along free.' },
      { label: 'Realtors', blurb: 'Every licensed agent and broker in Midland County', definition: { county: COUNTY, who: 'realtor' }, explanation: 'Every agent and broker holding an active Texas license in Midland County, with their brokerage; brokers who sponsor agents first, then the longest licensed. The state withholds phones and emails, so the lookups find them.' },
      { label: 'Homebuilders', blurb: 'Builders holding spec homes and lots', definition: { county: COUNTY, who: 'builder' }, explanation: `Homebuilders holding spec homes and lots, most first. ${NO_PHONES}` },
    ],
  },
];

