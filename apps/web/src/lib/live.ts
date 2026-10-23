import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { withId } from './api';

/**
 * Queries that stay current: Convex pushes a new result whenever the
 * tables they read change, so a bid raised in another tab shows here on
 * its own. Each hook gives `undefined` while the first result is on its
 * way. Screens import these, never the generated api, so tests can mock
 * this one module.
 */
// The generated api types lag the backend, so the reference is loosely typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = FunctionReference<'query', 'public', any, any>;

function useLive<T>(ref: AnyQuery, args: Record<string, unknown> | 'skip'): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = useQuery(ref as any, args as any) as unknown;
  return useMemo(() => (value === undefined ? undefined : withId(value as T)), [value]);
}

/** The demand board: every county and trade with a bid or a lead. */
export const useDemandBoard = <T,>() => useLive<T>(api.demand.board, {});
/** One slot opened: who bids there and the leads it has seen. */
export const useDemandSlot = <T,>(county: string, jobType: string) => useLive<T>(api.demand.slot, { county, jobType });
/** The intake queue for one filter. */
export const useIntakeQueue = <T,>(status: 'open' | 'closed' | 'confirmed') => useLive<T>(api.intake.queue, { status });
/** Every awarded lead with what was sent and whether the company has it. */
export const useDelivered = <T,>() => useLive<T>(api.delivery.recent, {});
