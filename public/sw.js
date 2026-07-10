self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("jobs-wasfai-v1").then((cache) =>
      cache.addAll(["/", "/app", "/styles.css", "/app.js", "/manifest.webmanifest", "/icon.svg"]),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
