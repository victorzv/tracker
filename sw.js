/* Service Worker для PWA "Интервальная ходьба" */
const CACHE_NAME = 'walk-tracker-v2';

// Ресурсы, которые кешируем при установке
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap'
];

// Установка SW — закешировать основные ресурсы
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll прерывается при первой ошибке — добавляем по одному
      return Promise.allSettled(
        CORE_ASSETS.map((url) => cache.add(url).catch((e) => console.warn('SW cache miss', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// Активация — удаляем старые кеши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Стратегия: cache-first, потом сеть. Тайлы карты — network-first.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Тайлы OSM не кешируем агрессивно — пытаемся сеть, кеш как fallback
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Остальное: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Кешируем успешные ответы того же origin или Leaflet/Google Fonts
        if (res.ok && (url.origin === self.location.origin
          || url.hostname.includes('unpkg.com')
          || url.hostname.includes('fonts.googleapis.com')
          || url.hostname.includes('fonts.gstatic.com'))) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
