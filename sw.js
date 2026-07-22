// Consolbase KPI Dashboard — offline app-shell service worker
// Caches this page and its external libraries so the app can open with no
// internet connection. Data sync (Firestore) is handled separately by the
// app itself, using Firestore's own offline persistence.
const CACHE_NAME = 'consolbase-kpi-v1';
const EXTERNAL_ASSETS = ["https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js", "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js", "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const shellUrl = self.registration.scope;
      return Promise.all(
        [shellUrl, ...EXTERNAL_ASSETS].map((url) =>
          cache.add(url).catch((err) => console.warn('SW precache failed for', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isExternal = EXTERNAL_ASSETS.includes(req.url);
  const isNavigation = req.mode === 'navigate';
  const isSameOrigin = req.url.indexOf(self.registration.scope) === 0;
  if (!isExternal && !isNavigation && !isSameOrigin) return; // let the browser handle it normally (e.g. Firestore's own requests)

  if (isNavigation) {
    // Single-page app: however this was opened (index.html, trailing slash,
    // a query string, etc), always fall back to the one cached app shell
    // document if the network is unavailable.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(self.registration.scope, fresh.clone());
          }
          return fresh;
        } catch (err) {
          const cached = (await caches.match(req)) || (await caches.match(self.registration.scope));
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
