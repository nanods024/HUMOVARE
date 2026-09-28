/**
 * In-memory cache for public, non-personal reads: the homepage, navigation,
 * categories, shop config, collections and filter facets. These change only
 * when an admin saves something, and every successful admin write clears the
 * whole cache (see admin.routes.js), so a change shows up on the next request.
 * The short TTLs only bound how stale product details (price, sold out) inside
 * a cached response can get between admin edits.
 *
 * Never used for anything tied to a person, stock reservation, carts, orders
 * or payments. Each server process holds its own copy.
 */

const store = new Map();
const MAX_ENTRIES = 500;

export const TTL = Object.freeze({
  /** Admin-only data: categories, navigation, shop config. */
  config: 5 * 60 * 1000,
  /** Responses that embed product cards (price, sold-out state). */
  catalogue: 60 * 1000,
});

/**
 * Returns the cached value for `key`, or loads, caches and returns it.
 * Concurrent misses share one load, and a failed load is not cached.
 */
export function cached(key, ttlMs, load) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const promise = Promise.resolve().then(load);
  store.set(key, { promise, expiresAt: Date.now() + ttlMs });
  promise.catch(() => {
    if (store.get(key)?.promise === promise) store.delete(key);
  });

  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
  return promise;
}

export function clearPublicCache() {
  store.clear();
}

export default { cached, clearPublicCache, TTL };
