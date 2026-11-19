// INDIE PLAY X — Lightweight Safe PWA Service Worker
const CACHE_NAME = 'indieplayx-pwa-v1';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/images/social/pwa-icon-192.png',
  '/images/social/pwa-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept cross-origin APIs, Firebase, or private admin/analytics routes
  if (
    url.origin !== self.location.origin ||
    url.pathname.includes('bitmeme') ||
    url.pathname.includes('woxlytics')
  ) {
    return;
  }

  // Network-first for HTML & JS/CSS so updates always appear immediately
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
