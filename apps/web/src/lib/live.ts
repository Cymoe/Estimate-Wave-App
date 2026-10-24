import { useEffect, useState } from 'react';
import { useConvex, type ConvexReactClient } from 'convex/react';
import { getFunctionName, makeFunctionReference, type FunctionReference } from 'convex/server';
import { withId } from './withId';

/**
 * Queries that stay current: Convex pushes a new result whenever the
 * tables they read change, so a bid raised in another tab shows here on
 * its own. Each hook gives `undefined` while the first result is on its
 * way, or while there is nothing to ask for (no company yet). Screens
 * import these, never the generated api, so tests can mock this one
 * module; and with no Convex client around (tests that render the
 * navigation) they stay at `undefined` instead of throwing.
 */
type Args = Record<string, unknown> | 'skip';

function useLive<T>(ref: FunctionReference<'query'>, args: Args): T | undefined {
  const client = useConvex() as ConvexReactClient | undefined;
  const [value, setValue] = useState<T | undefined>(undefined);
  const name = getFunctionName(ref);
  const key = args === 'skip' ? 'skip' : JSON.stringify(args);
  useEffect(() => {
    if (!client || args === 'skip') {
      setValue(undefined);
      return;
    }
    const watch = client.watchQuery(ref, args);
    const read = () => {
      try {
        const next = watch.localQueryResult();
        setValue(next === undefined ? undefined : withId(next as T));
      } catch {
        // The query threw (signed out, no access): keep what we had.
      }
    };
    read();
    return watch.onUpdate(read);
    // The reference and args are keyed by name and value, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, name, key]);
  return value;
}

const q = (name: string) => makeFunctionReference<'query'>(name);
const forOrg = (organizationId?: string): Args => (organizationId ? { organizationId } : 'skip');

// Ops
/** The demand board: every county and trade with a bid or a lead. */
export const useDemandBoard = <T,>() => useLive<T>(q('demand:board'), {});
/** One slot opened: who bids there and the leads it has seen. */
export const useDemandSlot = <T,>(county: string, jobType: string) => useLive<T>(q('demand:slot'), { county, jobType });
/** The intake queue for one filter. */
export const useIntakeQueue = <T,>(status: 'open' | 'closed' | 'confirmed') => useLive<T>(q('intake:queue'), { status });
/** The last 50 hits on the intake webhook: accepted, repeat or rejected, and why. */
export const useIntakeLog = <T,>() => useLive<T>(q('intake:recentLog'), {});
/** Every awarded lead with what was sent and whether the company has it. */
export const useDelivered = <T,>() => useLive<T>(q('delivery:recent'), {});
/** Whether payments are in test mode (play money). Staff only; undefined while loading or signed out. */
export const usePaymentsMode = <T,>() => useLive<T>(q('funding:mode'), {});
/** The funding page behind a link: no login, the token is the key. Flips to paid when Stripe's webhook lands. */
export const useFundingPage = <T,>(token?: string) => useLive<T>(q('funding:get'), token ? { token } : 'skip');
/** Where a lead for this county and trade would go the moment it is listed. */
export const useLeadDestination = <T,>(county?: string, jobType?: string) =>
  useLive<T>(q('intake:destination'), county && jobType ? { county, jobType } : 'skip');

// Companies
/** The company's lead balance, bids and plan. */
export const useWallet = <T,>(organizationId?: string) => useLive<T>(q('marketplace:wallet'), forOrg(organizationId));
/** Leads for sale right now, with their price schedules. */
export const useMarketFeed = <T,>(organizationId?: string) => useLive<T>(q('marketplace:feed'), forOrg(organizationId));
/** The company's buy orders, open and settled. */
export const useMyBuyOrders = <T,>(organizationId?: string) => useLive<T>(q('marketplace:bids'), forOrg(organizationId));
/** The Vault: leads nobody bought in a week, for companies on the plan. */
export const useOlderLeads = <T,>(organizationId?: string) => useLive<T>(q('marketplace:olderLeads'), forOrg(organizationId));
/** What the company's standing bids won and missed. */
export const useBidResults = <T,>(organizationId?: string) => useLive<T>(q('bids:results'), forOrg(organizationId));
/** The company's standing bids, with where each stands. */
export const useStandingBids = <T,>(organizationId?: string) => useLive<T>(q('bids:listStanding'), forOrg(organizationId));
