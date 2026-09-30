/*
 * Minimal service worker so the store can be installed as an app.
 * It deliberately caches nothing: pages and API responses (carts, orders, accounts) are
 * kept fresh from the server, never served from a device
 * cache. Every request simply goes to the network.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
