// Service Worker für die Kalorien-Tracker PWA.
//
// Strategie: "network-first" - bei jedem Aufruf wird zuerst versucht,
// die aktuelle Version aus dem Netz zu laden (damit Code-Änderungen
// sofort ankommen und nicht durch einen alten Cache "stecken bleiben").
// Nur wenn kein Netz verfügbar ist, wird auf den zuletzt gecachten
// Stand zurückgegriffen - so startet die App auch offline.
//
// WICHTIG: Bei jedem Deployment einer neuen Version CACHE_VERSION
// erhöhen. Das sorgt dafür, dass alte Caches verworfen werden und
// verhindert, dass Nutzer:innen auf einem veralteten Stand hängen
// bleiben.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `kalorien-tracker-${CACHE_VERSION}`;

// App-Shell: Kern-Dateien, die für einen Offline-Start nötig sind.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('SW: App-Shell-Cache fehlgeschlagen:', err))
  );
  // Neuen Service Worker sofort aktivieren, nicht erst beim nächsten
  // vollständigen Tab-Neustart.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Nur GET-Requests behandeln (POST/PUT etc. z.B. an Firebase/Gemini
  // unverändert durchlassen, die dürfen nicht gecacht werden).
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Nur erfolgreiche, "basic" (same-origin) Antworten cachen -
        // externe API-Antworten (Gemini, Open Food Facts, Firebase)
        // bleiben so außen vor und werden nicht dauerhaft eingefroren.
        if (response && response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
