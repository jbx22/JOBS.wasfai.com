const CACHE_NAME = "jobs-wasfai-v52-admin";
const APP_SHELL = [
  "/",
  "/app",
  "/styles.css",
  "/app.js",
  "/admin/",
  "/super-admin/",
  "/admin.css",
  "/admin.js",
  "/offline.html",
  "/manifest.webmanifest",
  "/brand-logo-192.png",
  "/brand-logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Account/API data is always network-only and must never enter CacheStorage.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/api/") || /\/sw\.js$/.test(url.pathname))) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => new Response("Offline", { status: 503 })));
    return;
  }
  // HTML and application code are network-first so deployments update quickly,
  // with a versioned cached fallback for resilient read-only offline access.
  if (url.origin === self.location.origin && (event.request.mode === "navigate" || /\/app\.js$/.test(url.pathname))) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || (event.request.mode === "navigate" ? caches.match("/offline.html") : new Response("Offline", { status: 503 }));
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque" || !isStaticAsset(url.pathname)) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("/app")),
    ),
  );
});

function isStaticAsset(pathname) {
  return /\.(?:css|png|svg|webmanifest|ico|woff2?)$/i.test(pathname);
}
