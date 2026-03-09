/* ═══════════════════════════════════════════════════════════════
   GRAPHITE — Service Worker  (network-first, lazy caching)

   Strategy explanation:
   - We do NOT use addAll() on install because one failed request
     would break the entire SW installation silently.
   - Instead we only cache index.html during install (the one file
     we absolutely need) and cache everything else lazily on first
     successful fetch.
   - On subsequent requests we try the network first (so updates
     are picked up), falling back to the cache if offline.
   ═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'graphite-v3';

// ── Install: only cache the one file we cannot live without ──────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add('./index.html'))
      .then(() => {
        console.log('[GRAPHITE SW] Installed and cached index.html');
        return self.skipWaiting(); // activate immediately, don't wait
      })
      .catch(err => {
        // Even if caching fails, don't block installation
        console.warn('[GRAPHITE SW] Install cache error (non-fatal):', err);
        return self.skipWaiting();
      })
  );
});

// ── Activate: delete any old caches from previous versions ───────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[GRAPHITE SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => {
        console.log('[GRAPHITE SW] Activated, claiming clients');
        return self.clients.claim(); // take control of all open tabs now
      })
  );
});

// ── Fetch: network-first with cache fallback ─────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests for same-origin resources.
  // Let cross-origin requests (Google Fonts, etc.) pass through unmodified.
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(req)
      .then(networkResponse => {
        // Got a good response from the network — cache it for offline use
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline) — try the cache
        return caches.match(req).then(cached => {
          if (cached) return cached;
          // As a last resort, return the cached index.html (SPA fallback)
          return caches.match('./index.html');
        });
      })
  );
});
