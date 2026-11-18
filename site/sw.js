// Offline support. The build replaces VERSION and PRECACHE; versioned asset URLs never change
// content, so they are served from the cache first. Pages try the network first, and fall back to
// the saved copy when the network fails or takes longer than a few seconds.
const VERSION = 'dev';
const PRECACHE = ['./', 'catalog.json'];
const CACHE = `pathfinder-${VERSION}`;
const PAGE_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  // Files without a version in their URL are revalidated, so the HTTP cache can't hand this build an
  // older copy. No skipWaiting here: a new worker waits until the page lets it in (see the end of
  // app.js), so an open page never gets files from two builds. A first install activates at once.
  const requests = PRECACHE.map((url) => new Request(url, { cache: url.includes('?v=') ? 'default' : 'no-cache' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.ports[0]?.postMessage(VERSION);
  if (event.data === 'activate') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pathfinder-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** The network's answer, kept for later; the saved copy if the network fails, or once `timeout` ms pass without an answer. */
async function networkFirst(event, { fallbackUrl = null, timeout = 0 } = {}) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const saved = async () => (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl)));
  const network = fetch(request).then((response) => {
    if (response.ok) event.waitUntil(cache.put(request, response.clone()));
    return response;
  });
  // A slow answer still lands in the cache for next time.
  event.waitUntil(network.catch(() => {}));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (response) => {
      if (!settled) resolve(response);
      settled = true;
    };
    network.then(done, async (err) => {
      const hit = await saved();
      if (hit) done(hit);
      else if (!settled) {
        settled = true;
        reject(err);
      }
    });
    if (timeout)
      setTimeout(async () => {
        const hit = !settled && (await saved());
        if (hit) done(hit);
      }, timeout);
  });
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
  // Only same-origin GETs are cached. The chat is a POST to its own endpoint (CHAT_API in
  // scripts/site.mjs), so its answers always come from the network and are never stored here.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Vercel's analytics script and endpoint are left to the network.
  if (url.pathname.startsWith('/_vercel/')) return;
  const scope = new URL(self.registration.scope);
  if (request.mode === 'navigate') {
    // Static pages (c/<id>/, c/vs/<a>-vs-<b>/, p/<id>/ and their es/ copies) load from the network;
    // offline, the ones never saved open the matching view of the app instead.
    const home = scope.href;
    const path = url.pathname.slice(scope.pathname.length);
    event.respondWith(
      networkFirst(event, { fallbackUrl: path ? null : home, timeout: PAGE_TIMEOUT_MS }).catch(() => {
        const lang = path.startsWith('es/') ? '?lang=es' : '';
        const vs = path.match(/^(?:es\/)?c\/vs\/([\w.-]+?)-vs-([\w.-]+?)\/?$/);
        const id = path.match(/^(?:es\/)?c\/([\w.-]+)\/?$/)?.[1];
        if (path) return Response.redirect(`${home}${lang}${vs ? `#compare?ids=${vs[1]},${vs[2]}` : id ? `#cert?id=${id}` : ''}`, 302);
        return caches.match(home);
      }),
    );
    return;
  }
  // The catalog's URL carries the build version; an unversioned request (from an older page) and the
  // practice sets go to the network first, so they are never stale.
  if ((url.pathname.endsWith('/catalog.json') && !url.search) || url.pathname.includes('/practice/')) {
    event.respondWith(networkFirst(event));
    return;
  }
  if (url.pathname.includes('/og/')) return;
  event.respondWith(cacheFirst(request));
});
