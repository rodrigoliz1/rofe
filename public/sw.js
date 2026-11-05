const CACHE_NAME = 'rofe-shell-__ROFE_VERSION__';
const SHELL = ['__ROFE_PRECACHE__'];
// Catalog photos (/products/<id>-<size>.<hash>.webp) never change content under the same
// name, so they are cache-first and survive app updates. Old variants are trimmed.
const PHOTOS = 'rofe-photos-v1';
const PHOTO_LIMIT = 120;
const isPhoto = (url) => url.pathname.startsWith('/products/') && url.pathname.endsWith('.webp');
async function cachedPhoto(request) {
  const cache = await caches.open(PHOTOS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    for (const stale of keys.slice(0, Math.max(0, keys.length - PHOTO_LIMIT))) await cache.delete(stale);
  }
  return response;
}
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
  // Activate after existing tabs close, so an update never interrupts a payment.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('rofe-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (isPhoto(url)) {
    event.respondWith(cachedPhoto(request).catch(() => fetch(request)));
  } else if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => await cache.match(request, { ignoreVary: true, ignoreSearch: true }) || fetch(request)));
  }
});
