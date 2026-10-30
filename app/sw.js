// Service Worker: macht die App installierbar und zeigt bei fehlendem Netz die zuletzt geladene Version.
// Immer zuerst aus dem Netz laden, damit neue Versionen sofort ankommen; Datenbank-Anfragen nie zwischenspeichern.
const CACHE = "wurftraining-v1";
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return; // Daten nie zwischenspeichern
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (url.origin === location.origin || /cdnjs|jsdelivr|fonts\.g/.test(url.hostname))) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
