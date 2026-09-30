/* StudyWise service worker
   - Precaches the app shell + the CDN libraries so the app works offline.
   - Same-origin files: network-first (so a new deploy shows up on next open),
     falling back to cache when offline.
   - Cross-origin (React, Babel, Google Fonts): cache-first, refreshed in background.
   Your study DATA is in localStorage, not here — updating this file never touches it.
   If you ever change the CDN URLs in index.html, bump CACHE below. */
const CACHE = "studywise-shell-v2";

const LOCAL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
    // CDN files: don't fail the whole install if one is unreachable
    await Promise.allSettled(CDN.map(u => cache.add(new Request(u, { mode: "cors" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const cacheable = res => res && (res.ok || res.type === "opaque");

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (url.origin === self.location.origin) {
    // network-first for our own files
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (cacheable(res)) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === "navigate") {
          const shell = (await cache.match("./index.html")) || (await cache.match("./"));
          if (shell) return shell;
        }
        throw e;
      }
    })());
    return;
  }

  // cross-origin: cache-first + background refresh
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const refresh = fetch(req).then(res => { if (cacheable(res)) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { event.waitUntil(refresh); return hit; }
    const res = await refresh;
    return res || Response.error();
  })());
});
