/* Journeyman HQ service worker. VERSION is stamped by build.sh from data/manifest.json so every release
 * gets a fresh cache and old ones are dropped on activate. Same-origin only; nothing external is ever cached.
 *   shell (html/css/js/icons/manifest): cache-first, precached on install
 *   data/*.json: network-first with cache fallback, so a new pack uploaded to the vault shows up on the next
 *                online load and the last good copy still works offline.
 */
const VERSION = "__VERSION__";
const CACHE = "jhq-" + VERSION;
const SHELL = __SHELL__;
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("jhq-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  const inScope = url.pathname.startsWith(new URL(self.registration.scope).pathname); if (!inScope) return;
  if (url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; })));
});
