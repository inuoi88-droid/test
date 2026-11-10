// オフラインでも開けるようにする Service Worker。
// 画面（index.html）は保存したものをすぐ返し、裏で新しい版を取りに行く。
// /assets/ のファイルは名前に版が入っているので、一度取ったら保存したものを使う。
const CACHE = 'toeic4000-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(event, new Request('/')))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              void caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }
  event.respondWith(staleWhileRevalidate(event, req))
})

function staleWhileRevalidate(event, req) {
  return caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req)
    const net = fetch(req)
      .then((res) => {
        if (res.ok) void cache.put(req, res.clone())
        return res
      })
      .catch(() => hit)
    if (hit) {
      event.waitUntil(net.catch(() => {}))
      return hit
    }
    return net.then((res) => res || new Response('オフラインです', { status: 503 }))
  })
}
