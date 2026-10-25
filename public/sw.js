/**
 * Service Worker：让站点在首次使用后可离线运行（specs/privacy-local-only「离线可用」）。
 *
 * 缓存策略：
 *   - 页面与构建产物（带 hash）：cache-first，永不失效；
 *   - 模型与 ORT 运行时：cache-first（体积大、按版本固定）；
 *   - 其余导航请求：network-first，失败时回退到缓存中的 index.html。
 */

const VERSION = 'v1'
const STATIC_CACHE = `faceblur-static-${VERSION}`
const HEAVY_CACHE = `faceblur-heavy-${VERSION}`

/**
 * 首次安装时预缓存的资源清单。
 * 由 scripts/gen-sw-precache.mjs 在构建后扫描 dist 自动注入，
 * 保证首次访问的 JS/CSS 也被缓存（否则断网重载会白屏）。
 */
/* __PRECACHE__ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => {
        // 预缓存失败不应阻止安装（离线能力是增强而非必需）
      }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('faceblur-') && k !== STATIC_CACHE && k !== HEAVY_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** 判断是否为大体积静态资源（模型、WASM）。 */
function isHeavy(url) {
  return /\/models\/|\/ort\/|\.wasm$|\.onnx$/.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // 只处理同源请求
  if (url.origin !== self.location.origin) return

  // 导航请求：network-first，离线回退 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(STATIC_CACHE).then((c) => c.put('/', copy))
          return res
        })
        // 预缓存清单里根路径被规范化为 '/'，需要两者都尝试
        .catch(async () => {
          const cached = (await caches.match('/index.html')) ?? (await caches.match('/'))
          return cached ?? Response.error()
        }),
    )
    return
  }

  const cacheName = isHeavy(url) ? HEAVY_CACHE : STATIC_CACHE

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          // 只缓存成功的同源响应
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(cacheName).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached ?? Response.error())
    }),
  )
})
