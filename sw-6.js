const CACHE = "psis-v7-shell";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./auth.js", "./firebase-config.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network-first for same-origin GETs so updates reach users when online; falls back to cache offline.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");   // cached so login also works offline
  if (!sameOrigin && !firebaseSdk) return;
  event.respondWith(
    fetch(req).then(response => {
      if (response && response.ok && (response.type === "basic" || response.type === "cors")) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
      }
      return response;
    }).catch(() => caches.match(req).then(cached => cached || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});

// Tapping a follow-up alert opens (or focuses) the app.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
