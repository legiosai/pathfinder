// Offline support. The build replaces VERSION and PRECACHE; versioned asset URLs never change
// content, so they are served from the cache first. Pages and the catalog try the network first.
const VERSION = 'dev';
const PRECACHE = ['./', 'catalog.json'];
const CACHE = `pathfinder-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pathfinder-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (request.mode === 'navigate') {
    // Share pages (c/<id>/) redirect into the app; offline they fall back to it directly.
    const home = scope.href;
    event.respondWith(
      networkFirst(request, url.pathname === scope.pathname ? home : null).catch(() => {
        const id = url.pathname.match(/\/c\/([\w.-]+)\/?$/)?.[1];
        return id ? Response.redirect(`${home}#cert?id=${id}`, 302) : caches.match(home);
      }),
    );
    return;
  }
  if (url.pathname.endsWith('/catalog.json')) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.includes('/og/')) return;
  event.respondWith(cacheFirst(request));
});
