/**
 * DEPRECATED: Supabase client (no longer used)
 * 
 * This file is kept for backward compatibility but should not be imported.
 * All functionality has been moved to MongoDB backend.
 * 
 * If you see this imported anywhere, replace with:
 * - API calls: import from '@/lib/api'
 * - Real-time: import from '@/lib/realtime'
 */

console.warn('⚠️ Supabase client is deprecated. Use MongoDB API instead.');

// Create a chainable query stub that returns empty data
const createChainableQuery = () => {
  const stub = {
    select: () => stub,
    eq: () => stub,
    neq: () => stub,
    gt: () => stub,
    gte: () => stub,
    lt: () => stub,
    lte: () => stub,
    like: () => stub,
    ilike: () => stub,
    is: () => stub,
    in: () => stub,
    contains: () => stub,
    containedBy: () => stub,
    rangeGt: () => stub,
    rangeGte: () => stub,
    rangeLt: () => stub,
    rangeLte: () => stub,
    rangeAdjacent: () => stub,
    overlaps: () => stub,
    textSearch: () => stub,
    match: () => stub,
    not: () => stub,
    or: () => stub,
    filter: () => stub,
    order: () => stub,
    limit: () => stub,
    range: () => stub,
    single: () => stub,
    maybeSingle: () => stub,
    insert: () => Promise.resolve({ data: null, error: new Error('Use MongoDB API instead') }),
    update: () => Promise.resolve({ data: null, error: new Error('Use MongoDB API instead') }),
    upsert: () => Promise.resolve({ data: null, error: new Error('Use MongoDB API instead') }),
    delete: () => Promise.resolve({ data: null, error: new Error('Use MongoDB API instead') }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return stub;
};

// Export empty object to prevent import errors
export const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    signOut: () => Promise.resolve({ error: null }),
  },
  from: () => createChainableQuery(),
  channel: () => ({
    on: () => ({
      on: () => ({
        on: () => ({
          subscribe: () => ({ unsubscribe: () => {} }),
        }),
        subscribe: () => ({ unsubscribe: () => {} }),
      }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    subscribe: () => ({ unsubscribe: () => {} }),
  }),
  removeChannel: () => Promise.resolve({ error: null }),
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: null, error: new Error('Use MongoDB API instead') }),
      download: () => Promise.resolve({ data: null, error: new Error('Use MongoDB API instead') }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      list: () => Promise.resolve({ data: [], error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
    }),
  },
};
