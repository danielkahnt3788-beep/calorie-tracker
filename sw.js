const CACHE_NAME = 'kalorien-tracker-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// App-Shell beim Installieren cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Alte Caches beim Aktivieren entfernen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first für die App-Shell, Netzwerk für alles andere (z.B. Gemini/Firebase-Aufrufe
// sollen NICHT gecacht werden, da es sich um dynamische API-Antworten handelt)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nur eigene Origin-Requests cachen, externe APIs immer live abrufen
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});
