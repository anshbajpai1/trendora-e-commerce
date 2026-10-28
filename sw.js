const CACHE_NAME = "trendora-static-v1";
const STATIC_ASSET = /\.(?:css|js|mjs|svg|png|jpe?g|webp|ico|woff2?)$/i;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith("trendora-") && key !== CACHE_NAME)
      .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

async function cacheFirstWithRefresh(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(response => {
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  }).catch(() => undefined);
  return cached || refresh.then(response => response || new Response("Offline", { status: 504 }));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !STATIC_ASSET.test(url.pathname)) return;
  event.respondWith(cacheFirstWithRefresh(request));
});
