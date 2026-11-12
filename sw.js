// File ID: F07 | Revision: R1 — Service Worker
// NAIKKAN versi ini setiap rilis agar HP user mengambil file baru.
const CACHE = 'tm-v6';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/util.js',
  './js/kanban.js',
  './js/calendar.js',
  './js/whowhat.js',
  './js/pdf.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate untuk file app (same-origin GET). API (POST ke Google) tidak disentuh.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
      return hit || net;
    }),
  );
});
