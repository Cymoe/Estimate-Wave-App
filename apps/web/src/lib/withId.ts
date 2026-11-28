/**
 * Adds an `id` alias for Convex's `_id`, which the screens read, on every
 * document in a response: top-level rows, and rows inside lists an object
 * carries (an inbox's `available` and `sold`, a wallet's `transactions`).
 */
export function withId<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withId) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = inner && typeof inner === 'object' ? withId(inner) : inner;
    }
    if ('_id' in out && !('id' in out)) out.id = out._id;
    return out as T;
  }
  return value;
}
