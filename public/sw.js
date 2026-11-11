// =====================================================================
// سرویس‌ورکر PWA — مرکز مشاوره رز
// استراتژی:
//   - فایل‌های استاتیک (/_next/static، /icons، /logo.svg): Cache-First
//   - ناوبری صفحات: Network-First با fallback به کش
//   - فراخوانی‌های API: همیشه شبکه (بدون کش — داده زنده)
// =====================================================================
const VERSION = "rz-v6.15";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const PRECACHE = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png", "/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/logo.svg" ||
    url.pathname.startsWith("/bpmn/") ||
    /\.(png|jpg|jpeg|svg|woff2?|css|js|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API همیشه زنده — بدون کش
  if (url.pathname.startsWith("/api/")) return;

  // استاتیک: کش اول
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // ناوبری صفحات: شبکه اول، خطا → کش
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
  }
});
