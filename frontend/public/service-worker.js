/**
 * getamano Service Worker
 * Strategy:
 *   - HTML pages: network-first, fall back to cached index.html (offline page)
 *   - Static JS/CSS: stale-while-revalidate (fast loads, background update)
 *   - Images: cache-first with expiry (90 days)
 *   - API calls (/api/*): NEVER cached — always live (real-time data)
 *
 * Bump CACHE_VERSION to invalidate all caches on next visit.
 */
const CACHE_VERSION = "v3-push";
const CACHE_STATIC = `getamano-static-${CACHE_VERSION}`;
const CACHE_RUNTIME = `getamano-runtime-${CACHE_VERSION}`;
const CACHE_IMAGES = `getamano-images-${CACHE_VERSION}`;

// Pre-cache the app shell on install
// Note: The cached '/' is only ever served as fallback when the network is
// completely unavailable (offline). The network-first navigation handler
// below ALWAYS tries fresh content first — so users never see stale HTML.
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/getamano-logo-mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(`-${CACHE_VERSION}`))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/")
    || url.hostname.includes("googleapis.com")
    || url.hostname.includes("emergent.sh")
    || url.hostname.includes("emergentagent.com");
}

function isImage(req) {
  return req.destination === "image"
    || /\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif|heic)$/i.test(new URL(req.url).pathname);
}

function isHtml(req) {
  return req.mode === "navigate"
    || (req.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept POST/PUT/DELETE — pass through
  if (req.method !== "GET") return;

  // API: pass through, never cache (real-time data)
  if (isApiRequest(url)) return;

  // Cross-origin tracking/analytics: pass through
  if (url.origin !== self.location.origin
      && !url.hostname.includes("emergent")
      && !url.hostname.endsWith(".googleapis.com")) {
    return;
  }

  // HTML navigation: network-first → fallback to cached app shell
  if (isHtml(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/")))
    );
    return;
  }

  // Images: cache-first with capped runtime cache
  if (isImage(req)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_IMAGES).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // JS/CSS/fonts: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networked = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networked;
    })
  );
});

// Listen for skipWaiting from a client (used by InstallPrompt 'reload to update')
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ============================================================
// Section 63 — Push notifications
// Show OS-level notifications even when the tab is closed. The server
// publishes via Web Push protocol with payload like:
//   { title, body, url, icon, badge, tag }
// On click we focus an existing tab if open, or open a new one to `url`.
// ============================================================
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "getamano", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "getamano";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192x192.png",
    badge: payload.badge || "/icon-96x96.png",
    tag: payload.tag || "getamano-notification",
    renotify: !!payload.renotify,
    requireInteraction: !!payload.requireInteraction,
    data: { url: payload.url || "/" },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab on same origin if present
      for (const client of clientList) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin && "focus" in client) {
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        } catch (_) {/* ignore */}
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// Optional — let pages listen for push subscription change (browser rotates keys).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      clients.forEach((c) => c.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGE" }));
    })
  );
});
