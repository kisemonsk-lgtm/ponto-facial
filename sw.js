/* Service worker do Ponto Facial: deixa o app funcionar offline no tablet. */
const CACHE = "ponto-facial-v3";
const ESSENCIAIS = [
  "./",
  "index.html",
  "css/estilo.css",
  "js/app.js",
  "js/facial.js",
  "manifest.webmanifest",
  "icone-192.png",
  "icone-512.png",
  "icone-maskable-512.png",
  "apple-touch-icon.png",
  "favicon-64.png",
  "logo-cas-facial.png",
  "logo-cas-facial-branco.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // modelo de IA (CDN): guarda depois do primeiro download
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.open(CACHE).then(async c => {
        const guardado = await c.match(req);
        if (guardado) return guardado;
        const resp = await fetch(req);
        if (resp.ok) c.put(req, resp.clone());
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }
  // arquivos do app: rede primeiro, cache quando estiver sem internet
  e.respondWith(
    fetch(req).then(resp => {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return resp;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});
