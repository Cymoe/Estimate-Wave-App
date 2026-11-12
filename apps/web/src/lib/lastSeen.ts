/**
 * The last copy of a list this tab loaded (estimates, projects, leads, the
 * price book), kept per company while the app is open. A page opened again
 * shows it at once and refreshes quietly, instead of flashing a skeleton.
 */
const store = new Map<string, unknown>();

export function lastSeen<T>(key: string | undefined | null): T | undefined {
  return key ? (store.get(key) as T | undefined) : undefined;
}

export function remember<T>(key: string | undefined | null, value: T): T {
  if (key) store.set(key, value);
  return value;
}

/** For tests: start each one with nothing remembered. */
export function forgetAll() {
  store.clear();
}
