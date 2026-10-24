import { env } from '../config/env.js';

/**
 * Lets a CDN in front of the API (Render edge caching, Cloudflare) answer
 * public catalogue reads without reaching this server.
 *
 * Only for routes whose response is the same for every visitor: no cookies,
 * no account data, no stock reservations. `max-age=0` keeps browsers
 * revalidating, so a shopper never holds an old copy; `s-maxage` is the CDN's
 * copy. Admin writes clear the in-memory cache at once, but a CDN copy can
 * live up to s-maxage + stale-while-revalidate, which bounds how long a price
 * or sold-out change takes to show. Checkout and the cart always re-read
 * stock and price from the database, so a stale page can never sell at it.
 *
 * Error responses are marked `no-store` in the error handler, so a 404 or a
 * 500 is never cached here.
 */
export function publicCatalogue(_req, res, next) {
  const seconds = env.cdnCacheSeconds;
  if (seconds > 0) {
    res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`);
  }
  next();
}

export default publicCatalogue;
