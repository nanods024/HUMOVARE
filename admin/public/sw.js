/*
 * Minimal service worker so the admin portal can be installed as an app.
 * It deliberately caches nothing: admin pages and API responses are
 * authenticated and must always come from the server, never from a device
 * cache. Every request simply goes to the network.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
