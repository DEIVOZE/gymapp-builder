/* =====================================================
   SERVICE WORKER — кэширует файлы приложения, чтобы оно
   открывалось офлайн (в зале без интернета).

   Логика простая:
   - при установке один раз сохраняем все файлы в кэш;
   - при каждом запросе: сначала пробуем сеть, если её нет
     — отдаём из кэша. Так обновления сайта не залипают.
   Когда поменяешь код приложения — увеличь число в CACHE
   ('gymlog-v7' -> 'gymlog-v8'), и кэш обновится сам.
   ===================================================== */

const CACHE = 'gymlog-v7';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './prompt.md',
  './prompt-period.md',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // обновляем кэш свежим ответом
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
