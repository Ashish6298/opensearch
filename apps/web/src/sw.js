/**
 * OpenSearch Service Worker — Offline Caching & PWA Support (Phase 64)
 *
 * Implements Stale-While-Revalidate caching for static assets
 * and offline fallback for instant answers, cheatsheets, and documentation.
 */

const CACHE_NAME = 'opensearch-v1.4.0';
const STATIC_ASSETS = [
  '/',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/about',
  '/privacy',
  '/docs'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Do not intercept streaming or non-GET requests
  if (event.request.method !== 'GET' || url.pathname.includes('/search/stream')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Return cached response or fallback offline JSON
          if (cachedResponse) {
            return cachedResponse;
          }
          if (url.pathname.includes('/api/v1/search')) {
            return new Response(
              JSON.stringify({
                query: url.searchParams.get('q') || '',
                meta: { totalHits: 0, durationMs: 0 },
                results: [],
                instantAnswer: {
                  type: 'info',
                  badge: '[offline-mode]',
                  title: 'Offline Search Cache Active',
                  primaryResult: 'You are currently offline. Connect to internet for live web searches.',
                  description: 'Instant answers, calculator, cheatsheets, and timezone utilities are available in offline mode.'
                }
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
