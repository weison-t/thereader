// Minimal no-op service worker to avoid 404s during local development
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', () => {
  // passthrough: do nothing
});

