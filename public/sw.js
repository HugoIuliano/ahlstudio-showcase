/* Service worker do AHL Studio.
 * Estratégia conservadora para uma loja com sessão e server actions:
 *  - assets imutáveis do Next (/_next/static) e da marca (/brand, ícones): cache-first
 *  - navegações (HTML): rede sempre; se offline, página /offline
 *  - nunca cacheia POST, /api, /admin, /conta, checkout, pedidos (dados pessoais / dinâmicos)
 */
const VERSION = "ahl-v3";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/brand/logo-icon.png", "/brand/logo-full.png", "/brand/icon-192.png", "/brand/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || url.pathname === "/icon.png" || url.pathname === "/apple-icon.png" || url.pathname === "/manifest.webmanifest");

const isPrivate = (url) => /^\/(api|admin|conta|checkout|carrinho|pedido|orcamento|ajuda\/chamados|login|cadastro)(\/|$)/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        // offline: páginas públicas mostram o fallback; rotas privadas também (sem cache de dados pessoais)
        const cache = await caches.open(STATIC);
        return (await cache.match(OFFLINE_URL)) || new Response("Você está offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }),
    );
    return;
  }
  // demais GETs (imagens de produto, /_next/image): rede; sem cache para não guardar dados privados
  if (isPrivate(url)) return;
});
