/* ─── GRAPHITE PWA Service Worker ─────────────────────────────────────────
   Strategy: Cache-first for shell assets, network-first with cache fallback
   for everything else (CDN scripts, fonts).  Update the CACHE_NAME version
   string any time you deploy a new build so stale caches are purged.
   ─────────────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'graphite-v1.0';

// App shell — these are cached on install so the app works offline immediately
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

/* ── INSTALL: pre-cache the app shell ─────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(SHELL_ASSETS);
    })
  );
  // Activate immediately rather than waiting for old SW to die
  self.skipWaiting();
});

/* ── ACTIVATE: clean up old caches from previous versions ──────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)  // any cache that isn't current
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all open tabs right away
  self.clients.claim();
});

/* ── FETCH: cache-first for shell, stale-while-revalidate for CDN ───────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests — skip POST/PUT etc.
  if (request.method !== 'GET') return;

  // For same-origin requests (our own files): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        // Not in cache yet — fetch, clone into cache, return
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // If offline and not cached, return the main index (SPA fallback)
          return caches.match('./index.html');
        });
      })
    );
    return;
  }

  // For cross-origin requests (Google Fonts, CDN scripts, unpkg):
  // Try network first so we always get fresh scripts; fall back to cache.
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))  // offline fallback
    );
  }
});
