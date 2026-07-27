const CACHE_NAME = 'yt-music-v1';
const ASSETS = [
  '/',
  '/icon.svg',
  '/globals.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // For API calls, try network first, then cache if it's a GET
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // For everything else, try cache first, then network
  event.respondWith(
    caches.match(request).then((response) => {
      return response || fetch(request);
    })
  );
});
