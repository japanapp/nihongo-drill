// ==========================================================
// Japan Go - Service Worker (production)
// Bump CACHE_VERSION whenever you ship new app code/assets.
// This forces clients to fetch the new shell on next launch.
// ==========================================================
const CACHE_VERSION = 'japango-v1.5.2';
const BASE = '/nihongo-drill/';

// Core app shell - must all exist or install fails, so keep this list
// to files that are definitely present in the repo.
const CORE_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'vocab.js',
  BASE + 'phrases.js',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'images/states/welcome.png',
  BASE + 'images/states/test-cleared.png',
  BASE + 'images/states/all-cleared.png',
  BASE + 'images/states/practice-complete.png',
  BASE + 'images/states/test-failed.png',
  BASE + 'images/states/revision-time.png',
  BASE + 'images/states/empty-revision.png',
];

// Install: pre-cache the core shell. Individual failures (e.g. an image
// not yet uploaded) won't abort the whole install.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(CORE_ASSETS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// Activate: drop any caches from previous versions, take control.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
//  - Navigations (HTML): network-first, fall back to cached shell offline.
//    This means users get fresh app code when online, but the app still
//    opens with no connection.
//  - Everything else (JS, images, fonts): cache-first, then network,
//    caching successful GETs at runtime (covers phrase images added later).
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match(BASE + 'index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Only cache same-origin successful responses (skip opaque/error).
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// Allow the page to trigger an immediate update (used by the in-app
// "update available" flow if you add one later).
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
