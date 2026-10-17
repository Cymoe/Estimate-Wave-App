// The lead price schedule, shared with the backend so the Marketplace page
// can count down without asking the server.
export { fillTimeMs, priceAt, pricingFor, dropsToFloor } from '../../convex/lib/auction';
export type { Auction, Pricing } from '../../convex/lib/auction';
